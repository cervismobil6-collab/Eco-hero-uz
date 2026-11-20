import React, { useEffect, useRef, useState } from 'react';
import {
  AttributionControl,
  GeoJSONSource,
  Map as MapLibreMap,
  MapLayerMouseEvent,
  MapMouseEvent,
  Marker,
  StyleSpecification,
} from 'maplibre-gl';
import type { FeatureCollection, Point } from 'geojson';
import {
  EcologicalLayerId,
  EcoReport,
  MapBaseStyleId,
  MapImageryProvider,
  School,
} from '../../types/eco';

export interface FlyToTarget {
  lat: number;
  lng: number;
  zoom: number;
  ts: number;
}

interface EcoMapLibre2DProps {
  baseStyle: MapBaseStyleId;
  provider: MapImageryProvider;
  enabledLayers: Record<EcologicalLayerId, boolean>;
  initialCenter: [number, number]; // [lng, lat]
  initialZoom: number;
  isTilted25D: boolean;
  boundariesGeoJson: FeatureCollection;
  greenSpacesGeoJson: FeatureCollection;
  treesGeoJson: FeatureCollection;
  schoolsGeoJson: FeatureCollection;
  reportsGeoJson: FeatureCollection;
  heatmapGeoJson: FeatureCollection;
  schoolsById: Map<string, School>;
  reportsById: Map<string, EcoReport>;
  selectedSchoolId: string | null;
  selectedReportId: string | null;
  clickedCoords: [number, number] | null;
  userLocation: [number, number] | null;
  flyToTarget: FlyToTarget | null;
  zoomAction: { type: 'in' | 'out' | 'reset'; ts: number } | null;
  onSelectSchool: (school: School) => void;
  onSelectReport: (report: EcoReport) => void;
  onMapClickCoords: (coords: [number, number]) => void;
  onTileFallback: (failedStyle: MapBaseStyleId, reason: string) => void;
}

const OPENFREEMAP_LIBERTY_STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';
const OPENFREEMAP_PLANET_TILEJSON = 'https://tiles.openfreemap.org/planet';
const CARTO_LABELS_2X_TILES = [
  'https://a.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
  'https://b.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}@2x.png',
];

function checkWebGLSupport(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const canvas = document.createElement('canvas');
    return Boolean(
      window.WebGLRenderingContext &&
        (canvas.getContext('webgl2') ||
          canvas.getContext('webgl') ||
          canvas.getContext('experimental-webgl'))
    );
  } catch {
    return false;
  }
}

function buildRasterStyle(
  styleId: MapBaseStyleId,
  provider: MapImageryProvider
): StyleSpecification {
  const sources: StyleSpecification['sources'] = {
    basemap: {
      type: 'raster',
      tiles: provider.tileUrls,
      tileSize: 256,
      maxzoom: Math.min(18, provider.maxZoom || 18),
      attribution: provider.attribution,
    },
    'openmaptiles-3d': {
      type: 'vector',
      url: OPENFREEMAP_PLANET_TILEJSON,
    },
  };

  const layers: StyleSpecification['layers'] = [
    {
      id: 'basemap-layer',
      type: 'raster',
      source: 'basemap',
      paint: {
        'raster-opacity': 1,
        'raster-contrast': styleId === 'satellite' ? 0.08 : 0.04,
        'raster-saturation': styleId === 'satellite' ? 0.08 : 0,
        'raster-resampling': 'linear',
      },
    },
  ];

  // Crisp Retina @2x road/district labels overlaid on Satellite imagery
  if (styleId === 'satellite') {
    sources['hybrid-labels'] = {
      type: 'raster',
      tiles: CARTO_LABELS_2X_TILES,
      tileSize: 256,
      maxzoom: 19,
      attribution: '© OpenStreetMap contributors © CARTO',
    };
    layers.push({
      id: 'hybrid-labels-layer',
      type: 'raster',
      source: 'hybrid-labels',
      paint: { 'raster-opacity': 0.92 },
    });
  }

  // Real 3D OpenStreetMap buildings when zoomed in & tilted
  layers.push({
    id: 'osm-buildings-3d',
    type: 'fill-extrusion',
    source: 'openmaptiles-3d',
    'source-layer': 'building',
    minzoom: 14,
    filter: ['!', ['has', 'hide_3d']],
    paint: {
      'fill-extrusion-base': ['coalesce', ['get', 'render_min_height'], 0],
      'fill-extrusion-height': ['coalesce', ['get', 'render_height'], 8],
      'fill-extrusion-color': styleId === 'dark' ? '#334155' : '#cbd5e1',
      'fill-extrusion-opacity': styleId === 'satellite' ? 0.52 : 0.78,
    },
  });

  return {
    version: 8,
    sources,
    layers,
  };
}

export const EcoMapLibre2D: React.FC<EcoMapLibre2DProps> = ({
  baseStyle,
  provider,
  enabledLayers,
  initialCenter,
  initialZoom,
  isTilted25D,
  boundariesGeoJson,
  greenSpacesGeoJson,
  treesGeoJson,
  schoolsGeoJson,
  reportsGeoJson,
  heatmapGeoJson,
  schoolsById,
  reportsById,
  selectedSchoolId,
  selectedReportId,
  clickedCoords,
  userLocation,
  flyToTarget,
  zoomAction,
  onSelectSchool,
  onSelectReport,
  onMapClickCoords,
  onTileFallback,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const clusterMarkersRef = useRef<Marker[]>([]);
  const schoolMarkersRef = useRef<Marker[]>([]);
  const clickedMarkerRef = useRef<Marker | null>(null);
  const userMarkerRef = useRef<Marker | null>(null);
  const selectedMarkerRef = useRef<Marker | null>(null);

  const [styleReadyTick, setStyleReadyTick] = useState(0);
  const [webglError, setWebglError] = useState<string | null>(null);
  const tileErrorCountRef = useRef(0);
  const activeStyleRef = useRef<MapBaseStyleId>(baseStyle);

  // Latest values in refs for async style.load & click listeners
  const latestDataRef = useRef({
    boundariesGeoJson,
    greenSpacesGeoJson,
    treesGeoJson,
    schoolsGeoJson,
    reportsGeoJson,
    heatmapGeoJson,
    enabledLayers,
  });
  latestDataRef.current = {
    boundariesGeoJson,
    greenSpacesGeoJson,
    treesGeoJson,
    schoolsGeoJson,
    reportsGeoJson,
    heatmapGeoJson,
    enabledLayers,
  };

  const schoolsByIdRef = useRef(schoolsById);
  const reportsByIdRef = useRef(reportsById);
  const onSelectSchoolRef = useRef(onSelectSchool);
  const onSelectReportRef = useRef(onSelectReport);
  const onMapClickCoordsRef = useRef(onMapClickCoords);
  const onTileFallbackRef = useRef(onTileFallback);

  schoolsByIdRef.current = schoolsById;
  reportsByIdRef.current = reportsById;
  onSelectSchoolRef.current = onSelectSchool;
  onSelectReportRef.current = onSelectReport;
  onMapClickCoordsRef.current = onMapClickCoords;
  onTileFallbackRef.current = onTileFallback;
  activeStyleRef.current = baseStyle;

  const ensureEcoHeroLayersOnMap = (map: MapLibreMap) => {
    const d = latestDataRef.current;

    const addGeoJsonSource = (
      id: string,
      data: FeatureCollection,
      cluster = false,
      clusterRadius = 44
    ) => {
      const existing = map.getSource(id) as GeoJSONSource | undefined;
      if (existing) {
        existing.setData(data);
        return;
      }
      map.addSource(id, {
        type: 'geojson',
        data,
        ...(cluster ? { cluster: true, clusterMaxZoom: 13, clusterRadius } : {}),
      });
    };

    addGeoJsonSource('boundaries-src', d.boundariesGeoJson);
    addGeoJsonSource('green-spaces-src', d.greenSpacesGeoJson);
    addGeoJsonSource('heatmap-src', d.heatmapGeoJson);
    addGeoJsonSource('trees-src', d.treesGeoJson);
    addGeoJsonSource('schools-src', d.schoolsGeoJson, true, 46);
    addGeoJsonSource('reports-src', d.reportsGeoJson, true, 42);

    const addLayerIfMissing = (layer: Parameters<MapLibreMap['addLayer']>[0]) => {
      if (!map.getLayer(layer.id)) {
        map.addLayer(layer);
      }
    };

    addLayerIfMissing({
      id: 'district-boundaries-fill',
      type: 'fill',
      source: 'boundaries-src',
      paint: { 'fill-color': '#10b981', 'fill-opacity': 0.05 },
    });
    addLayerIfMissing({
      id: 'district-boundaries-line',
      type: 'line',
      source: 'boundaries-src',
      paint: {
        'line-color': '#10b981',
        'line-width': 1.6,
        'line-dasharray': [3, 2],
        'line-opacity': 0.78,
      },
    });
    addLayerIfMissing({
      id: 'green-spaces-fill',
      type: 'fill',
      source: 'green-spaces-src',
      paint: { 'fill-color': '#22c55e', 'fill-opacity': 0.3 },
    });
    addLayerIfMissing({
      id: 'green-spaces-line',
      type: 'line',
      source: 'green-spaces-src',
      paint: { 'line-color': '#16a34a', 'line-width': 1.6 },
    });
    addLayerIfMissing({
      id: 'eco-heatmap-layer',
      type: 'heatmap',
      source: 'heatmap-src',
      maxzoom: 16,
      paint: {
        'heatmap-weight': ['coalesce', ['get', 'weight'], 0.5],
        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 13, 2.2],
        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 4, 18, 13, 36],
        'heatmap-opacity': 0.72,
        'heatmap-color': [
          'interpolate',
          ['linear'],
          ['heatmap-density'],
          0,
          'rgba(16, 185, 129, 0)',
          0.25,
          'rgba(56, 189, 248, 0.6)',
          0.5,
          'rgba(250, 204, 21, 0.78)',
          0.75,
          'rgba(249, 115, 22, 0.88)',
          1,
          'rgba(225, 29, 72, 0.95)',
        ],
      },
    });
    addLayerIfMissing({
      id: 'trees-circle',
      type: 'circle',
      source: 'trees-src',
      paint: {
        'circle-radius': ['interpolate', ['linear'], ['zoom'], 5, 4, 13, 8],
        'circle-color': '#16a34a',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#dcfce7',
        'circle-opacity': 0.92,
      },
    });
    addLayerIfMissing({
      id: 'schools-ranking-halo',
      type: 'circle',
      source: 'schools-src',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': [
          'case',
          ['<=', ['get', 'ratingRank'], 3],
          19,
          ['<=', ['get', 'ratingRank'], 10],
          15,
          12,
        ],
        'circle-color': 'rgba(245, 158, 11, 0.2)',
        'circle-stroke-width': 2,
        'circle-stroke-color': '#f59e0b',
      },
    });
    addLayerIfMissing({
      id: 'schools-clusters',
      type: 'circle',
      source: 'schools-src',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#4f46e5',
        'circle-radius': ['step', ['get', 'point_count'], 18, 10, 22, 30, 27],
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
      },
    });
    addLayerIfMissing({
      id: 'schools-unclustered',
      type: 'circle',
      source: 'schools-src',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-color': '#4f46e5',
        'circle-radius': 9.5,
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#ffffff',
      },
    });
    addLayerIfMissing({
      id: 'reports-clusters',
      type: 'circle',
      source: 'reports-src',
      filter: ['has', 'point_count'],
      paint: {
        'circle-color': '#e11d48',
        'circle-radius': ['step', ['get', 'point_count'], 17, 10, 21, 30, 26],
        'circle-stroke-width': 3,
        'circle-stroke-color': '#ffffff',
      },
    });
    addLayerIfMissing({
      id: 'reports-unclustered',
      type: 'circle',
      source: 'reports-src',
      filter: ['!', ['has', 'point_count']],
      paint: {
        'circle-radius': ['case', ['==', ['get', 'isHazardous'], true], 10.5, 8.5],
        'circle-stroke-width': 2.5,
        'circle-stroke-color': '#ffffff',
        'circle-color': [
          'match',
          ['get', 'category'],
          'waste',
          '#e11d48',
          'water',
          '#0284c7',
          'deforestation',
          '#15803d',
          'greening_needed',
          '#10b981',
          'air',
          '#64748b',
          'electrical_hazard',
          '#d97706',
          'chemical_hazard',
          '#9333ea',
          '#f43f5e',
        ],
      },
    });

    const setVis = (layerId: string, visible: boolean) => {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', visible ? 'visible' : 'none');
      }
    };

    const anyReport =
      d.enabledLayers.waste_reports ||
      d.enabledLayers.water_reports ||
      d.enabledLayers.problem_locations;

    setVis('district-boundaries-fill', d.enabledLayers.district_boundaries);
    setVis('district-boundaries-line', d.enabledLayers.district_boundaries);
    setVis('green-spaces-fill', d.enabledLayers.green_spaces);
    setVis('green-spaces-line', d.enabledLayers.green_spaces);
    setVis('eco-heatmap-layer', d.enabledLayers.eco_heatmap);
    setVis('trees-circle', d.enabledLayers.trees);
    setVis('schools-clusters', d.enabledLayers.schools);
    setVis('schools-unclustered', d.enabledLayers.schools);
    setVis('schools-ranking-halo', d.enabledLayers.schools && d.enabledLayers.school_rankings);
    setVis('reports-clusters', anyReport);
    setVis('reports-unclustered', anyReport);
  };

  useEffect(() => {
    if (!containerRef.current) return;

    if (!checkWebGLSupport()) {
      setWebglError(
        "Qurilmangiz brauzerida WebGL qo'llab-quvvatlanmaydi. 2D vektor xarita ishga tushmadi."
      );
      return;
    }

    const startStyle =
      baseStyle === 'street'
        ? OPENFREEMAP_LIBERTY_STYLE_URL
        : buildRasterStyle(baseStyle, provider);

    const map = new MapLibreMap({
      container: containerRef.current,
      style: startStyle,
      center: initialCenter,
      zoom: initialZoom,
      pitch: isTilted25D ? 52 : 0,
      bearing: isTilted25D ? -14 : 0,
      minZoom: 4,
      maxZoom: 18.5,
      attributionControl: false,
    });

    map.addControl(new AttributionControl({ compact: true }), 'bottom-right');

    const syncClusterBadges = () => {
      if (!map.isStyleLoaded()) return;

      for (const m of clusterMarkersRef.current) m.remove();
      clusterMarkersRef.current = [];

      const layersToCheck = ['schools-clusters', 'reports-clusters'].filter((id) => {
        const layer = map.getLayer(id);
        return layer && map.getLayoutProperty(id, 'visibility') !== 'none';
      });

      if (layersToCheck.length > 0) {
        const features = map.queryRenderedFeatures(undefined, { layers: layersToCheck });
        const seen = new Set<string>();
        for (const f of features.slice(0, 40)) {
          const coords = (f.geometry as Point)?.coordinates;
          if (!coords || coords.length < 2) continue;
          const clusterId = String(f.properties?.cluster_id || '');
          const key = `${f.layer.id}_${clusterId}`;
          if (seen.has(key)) continue;
          seen.add(key);

          const count = Number(f.properties?.point_count || 0);
          if (!count) continue;

          const el = document.createElement('div');
          el.className =
            'pointer-events-none select-none text-[11px] font-bold font-mono text-white drop-shadow-sm';
          el.textContent = String(count);

          const badge = new Marker({ element: el, anchor: 'center' })
            .setLngLat([coords[0], coords[1]])
            .addTo(map);
          clusterMarkersRef.current.push(badge);
        }
      }

      for (const m of schoolMarkersRef.current) m.remove();
      schoolMarkersRef.current = [];

      if (
        map.getZoom() >= 8.5 &&
        map.getLayer('schools-unclustered') &&
        map.getLayoutProperty('schools-unclustered', 'visibility') !== 'none'
      ) {
        const schoolFeatures = map.queryRenderedFeatures(undefined, {
          layers: ['schools-unclustered'],
        });
        const seenSchools = new Set<string>();
        for (const sf of schoolFeatures.slice(0, 28)) {
          const sid = String(sf.properties?.id || '');
          if (!sid || seenSchools.has(sid)) continue;
          seenSchools.add(sid);

          const schoolObj = schoolsByIdRef.current.get(sid);
          const coords = (sf.geometry as Point)?.coordinates;
          if (!schoolObj || !coords || coords.length < 2) continue;

          const thumb =
            (schoolObj.verifiedPhotos && schoolObj.verifiedPhotos[0]) ||
            schoolObj.logoUrl ||
            '/assets/schools/tashkent_campus.jpg';
          const shortTitle = schoolObj.number
            ? `${schoolObj.number}-maktab`
            : schoolObj.name.slice(0, 18);

          const btn = document.createElement('button');
          btn.type = 'button';
          btn.className =
            'group flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-white/95 dark:bg-slate-900/95 border border-indigo-500/60 shadow-md hover:scale-105 transition-transform cursor-pointer';
          btn.title = schoolObj.name;
          btn.onclick = (ev) => {
            ev.stopPropagation();
            onSelectSchoolRef.current(schoolObj);
            if (map.getZoom() < 15.2) {
              map.easeTo({
                center: [coords[0], coords[1]],
                zoom: 15.4,
                duration: 750,
              });
            }
          };

          const img = document.createElement('img');
          img.src = thumb;
          img.alt = shortTitle;
          img.referrerPolicy = 'no-referrer';
          img.className = 'w-5 h-5 rounded-full object-cover shrink-0 bg-indigo-100';
          img.onerror = () => {
            img.src = '/assets/schools/tashkent_campus.jpg';
          };

          const span = document.createElement('span');
          span.className =
            'text-[11px] font-bold text-slate-900 dark:text-white whitespace-nowrap max-w-[110px] truncate';
          span.textContent = shortTitle;

          btn.appendChild(img);
          btn.appendChild(span);

          const sMarker = new Marker({ element: btn, anchor: 'bottom', offset: [0, -12] })
            .setLngLat([coords[0], coords[1]])
            .addTo(map);
          schoolMarkersRef.current.push(sMarker);
        }
      }
    };

    map.on('style.load', () => {
      ensureEcoHeroLayersOnMap(map);
      setStyleReadyTick((t) => t + 1);
      syncClusterBadges();
    });

    map.on('moveend', syncClusterBadges);
    map.on('idle', syncClusterBadges);

    const interactiveLayers = [
      'schools-clusters',
      'schools-unclustered',
      'reports-clusters',
      'reports-unclustered',
    ];

    for (const layerId of interactiveLayers) {
      map.on('mouseenter', layerId, () => {
        map.getCanvas().style.cursor = 'pointer';
      });
      map.on('mouseleave', layerId, () => {
        map.getCanvas().style.cursor = '';
      });
    }

    map.on('click', 'schools-clusters', async (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const clusterId = feature.properties?.cluster_id;
      const source = map.getSource('schools-src') as GeoJSONSource | undefined;
      if (!source || clusterId === undefined) return;
      try {
        const zoom = await source.getClusterExpansionZoom(clusterId);
        const coords = (feature.geometry as Point).coordinates;
        map.easeTo({ center: [coords[0], coords[1]], zoom: Math.min(16, zoom + 0.5) });
      } catch {
        // ignore
      }
    });

    map.on('click', 'reports-clusters', async (e: MapLayerMouseEvent) => {
      const feature = e.features?.[0];
      if (!feature) return;
      const clusterId = feature.properties?.cluster_id;
      const source = map.getSource('reports-src') as GeoJSONSource | undefined;
      if (!source || clusterId === undefined) return;
      try {
        const zoom = await source.getClusterExpansionZoom(clusterId);
        const coords = (feature.geometry as Point).coordinates;
        map.easeTo({ center: [coords[0], coords[1]], zoom: Math.min(16, zoom + 0.5) });
      } catch {
        // ignore
      }
    });

    map.on('click', 'schools-unclustered', (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id;
      if (!id) return;
      const school = schoolsByIdRef.current.get(String(id));
      if (school) {
        onSelectSchoolRef.current(school);
        if (typeof school.lat === 'number' && typeof school.lng === 'number' && map.getZoom() < 15.2) {
          map.easeTo({
            center: [school.lng, school.lat],
            zoom: 15.4,
            duration: 750,
          });
        }
      }
    });

    map.on('click', 'reports-unclustered', (e: MapLayerMouseEvent) => {
      const id = e.features?.[0]?.properties?.id;
      if (!id) return;
      const report = reportsByIdRef.current.get(String(id));
      if (report) onSelectReportRef.current(report);
    });

    map.on('click', (e: MapMouseEvent) => {
      const existingInteractive = interactiveLayers.filter((id) => Boolean(map.getLayer(id)));
      const hit =
        existingInteractive.length > 0
          ? map.queryRenderedFeatures(e.point, { layers: existingInteractive })
          : [];
      if (hit.length > 0) return;
      onMapClickCoordsRef.current([e.lngLat.lat, e.lngLat.lng]);
    });

    map.on('error', (e) => {
      const errEvt = e as { sourceId?: string; error?: { message?: string } };
      if (
        activeStyleRef.current === 'street' &&
        String(errEvt?.error?.message || '').toLowerCase().includes('liberty')
      ) {
        map.setStyle(buildRasterStyle('street', provider));
        return;
      }
      if (errEvt?.sourceId === 'basemap' && activeStyleRef.current !== 'street') {
        tileErrorCountRef.current += 1;
        if (tileErrorCountRef.current >= 4) {
          tileErrorCountRef.current = 0;
          onTileFallbackRef.current(
            activeStyleRef.current,
            "Tanlangan xarita tasvirlari yuklanmadi — HD ko'cha xaritasiga qaytarildi."
          );
        }
      }
    });

    mapRef.current = map;

    return () => {
      for (const m of clusterMarkersRef.current) m.remove();
      clusterMarkersRef.current = [];
      for (const m of schoolMarkersRef.current) m.remove();
      schoolMarkersRef.current = [];
      clickedMarkerRef.current?.remove();
      userMarkerRef.current?.remove();
      selectedMarkerRef.current?.remove();
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Switch between OpenFreeMap Vector Street, Satellite + @2x Labels, and CARTO Dark @2x
  const prevStyleRef = useRef<string>(`${baseStyle}_${provider.tileUrls[0] || ''}`);
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    const sig = `${baseStyle}_${provider.tileUrls[0] || ''}`;
    if (prevStyleRef.current === sig) return;
    prevStyleRef.current = sig;
    tileErrorCountRef.current = 0;

    if (baseStyle === 'street') {
      map.setStyle(OPENFREEMAP_LIBERTY_STYLE_URL);
    } else {
      map.setStyle(buildRasterStyle(baseStyle, provider));
    }
  }, [baseStyle, provider]);

  // Sync GeoJSON sources & visibility whenever data or style updates
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return;
    ensureEcoHeroLayersOnMap(map);
  }, [
    styleReadyTick,
    boundariesGeoJson,
    greenSpacesGeoJson,
    treesGeoJson,
    schoolsGeoJson,
    reportsGeoJson,
    heatmapGeoJson,
    enabledLayers,
  ]);

  // Sync 2.5D Pitch for viewing OSM 3D extruded buildings right inside MapLibre
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.easeTo({
      pitch: isTilted25D ? 55 : 0,
      bearing: isTilted25D ? -15 : 0,
      zoom: isTilted25D && map.getZoom() < 14.5 ? 15 : map.getZoom(),
      duration: 700,
    });
  }, [isTilted25D]);

  // Sync FlyTo navigation
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !flyToTarget) return;
    map.flyTo({
      center: [flyToTarget.lng, flyToTarget.lat],
      zoom: flyToTarget.zoom,
      duration: 850,
    });
  }, [flyToTarget]);

  // Sync zoom controls
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !zoomAction) return;
    if (zoomAction.type === 'in') map.zoomIn({ duration: 250 });
    else if (zoomAction.type === 'out') map.zoomOut({ duration: 250 });
    else {
      map.flyTo({
        center: [66.9597, 40.4],
        zoom: 5.7,
        pitch: 0,
        bearing: 0,
        duration: 800,
      });
    }
  }, [zoomAction]);

  // Sync clicked target pin
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    clickedMarkerRef.current?.remove();
    clickedMarkerRef.current = null;

    if (clickedCoords) {
      const el = document.createElement('div');
      el.className =
        'w-5 h-5 rounded-full bg-emerald-500 border-2 border-white shadow-lg ring-4 ring-emerald-500/30';
      clickedMarkerRef.current = new Marker({ element: el })
        .setLngLat([clickedCoords[1], clickedCoords[0]])
        .addTo(map);
    }
  }, [clickedCoords]);

  // Sync user geolocation dot
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    userMarkerRef.current?.remove();
    userMarkerRef.current = null;

    if (userLocation) {
      const el = document.createElement('div');
      el.className =
        'w-4 h-4 rounded-full bg-sky-500 border-2 border-white shadow-lg ring-4 ring-sky-500/35';
      userMarkerRef.current = new Marker({ element: el })
        .setLngLat([userLocation[1], userLocation[0]])
        .addTo(map);
    }
  }, [userLocation]);

  // Sync selected focus ring
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    selectedMarkerRef.current?.remove();
    selectedMarkerRef.current = null;

    let coords: [number, number] | null = null;
    if (selectedSchoolId) {
      const s = schoolsById.get(selectedSchoolId);
      if (s && typeof s.lat === 'number' && typeof s.lng === 'number') {
        coords = [s.lng, s.lat];
      }
    } else if (selectedReportId) {
      const r = reportsById.get(selectedReportId);
      if (r && typeof r.lat === 'number' && typeof r.lng === 'number') {
        coords = [r.lng, r.lat];
      }
    }

    if (coords) {
      const el = document.createElement('div');
      el.className =
        'w-8 h-8 rounded-full border-2 border-emerald-400 bg-emerald-400/20 pointer-events-none';
      selectedMarkerRef.current = new Marker({ element: el })
        .setLngLat(coords)
        .addTo(map);
    }
  }, [selectedSchoolId, selectedReportId, schoolsById, reportsById]);

  if (webglError) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6 bg-slate-100 dark:bg-slate-900 text-center">
        <div className="max-w-md space-y-2">
          <p className="text-sm font-bold text-slate-900 dark:text-white">
            2D Vektor Xarita yuklanmadi
          </p>
          <p className="text-xs text-slate-600 dark:text-slate-400">{webglError}</p>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="w-full h-full bg-slate-200 dark:bg-slate-950 relative select-none"
    />
  );
};
