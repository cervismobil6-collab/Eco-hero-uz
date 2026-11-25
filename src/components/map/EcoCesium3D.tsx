import React, { useEffect, useRef, useState } from 'react';
import type * as CesiumNS from 'cesium';
import {
  Box,
  Compass,
  Loader2,
  Orbit,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import {
  Cesium3DPreset,
  CesiumSessionResponse,
  EcologicalLayerId,
  EcoReport,
  MapBaseStyleId,
  MapImageryProvider,
  School,
} from '../../types/eco';
import { UZBEKISTAN_REGION_VIEWPORTS } from '../../data/uzbekistanGeospatial';
import type { FlyToTarget } from './EcoMapLibre2D';

interface EcoCesium3DProps {
  baseStyle: MapBaseStyleId;
  provider: MapImageryProvider;
  enabledLayers: Record<EcologicalLayerId, boolean>;
  initialFocus: { lat: number; lng: number; zoom: number };
  schools: School[];
  reports: EcoReport[];
  allReportsForHeatmap: EcoReport[];
  selectedSchoolId: string | null;
  selectedReportId: string | null;
  flyToTarget: FlyToTarget | null;
  zoomAction: { type: 'in' | 'out' | 'reset'; ts: number } | null;
  cesiumSession: CesiumSessionResponse | null;
  photorealistic3DAvailable: boolean;
  onRequestPaid3D: () => void;
  onSelectSchool: (school: School) => void;
  onSelectReport: (report: EcoReport) => void;
  onMapClickCoords: (coords: [number, number]) => void;
  onTileFallback: (failedStyle: MapBaseStyleId, reason: string) => void;
  onSwitchTo2D?: () => void;
}

declare global {
  interface Window {
    CESIUM_BASE_URL?: string;
    Cesium?: typeof CesiumNS;
  }
}

const CESIUM_CDN_BASE = 'https://cdn.jsdelivr.net/npm/cesium@1.147.0/Build/Cesium';
let cesiumLoadPromise: Promise<typeof CesiumNS> | null = null;

function ensureCesiumCss(baseUrl: string) {
  const existing = document.querySelector<HTMLLinkElement>('link[data-eco-cesium-css="1"]');
  const targetHref = `${baseUrl}/Widgets/widgets.css`;
  if (existing) {
    existing.href = targetHref;
    return;
  }
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = targetHref;
  link.setAttribute('data-eco-cesium-css', '1');
  document.head.appendChild(link);
}

function loadCesiumScriptFromBase(baseUrl: string): Promise<typeof CesiumNS> {
  return new Promise<typeof CesiumNS>((resolve, reject) => {
    window.CESIUM_BASE_URL = baseUrl;
    ensureCesiumCss(baseUrl);

    document
      .querySelectorAll<HTMLScriptElement>('script[data-eco-cesium-js="1"]')
      .forEach((el) => el.remove());

    const script = document.createElement('script');
    script.src = `${baseUrl}/Cesium.js`;
    script.async = true;
    script.crossOrigin = 'anonymous';
    script.setAttribute('data-eco-cesium-js', '1');
    script.onload = () => {
      if (window.Cesium) {
        resolve(window.Cesium);
      } else {
        reject(new Error(`${baseUrl}/Cesium.js yuklandi lekin Cesium obyekti topilmadi`));
      }
    };
    script.onerror = () => {
      reject(new Error(`${baseUrl}/Cesium.js faylini yuklab bo‘lmadi`));
    };
    document.head.appendChild(script);
  });
}

function loadCesiumRuntime(): Promise<typeof CesiumNS> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Browser muhiti talab qilinadi'));
  }
  if (window.Cesium) {
    return Promise.resolve(window.Cesium);
  }
  if (cesiumLoadPromise) {
    return cesiumLoadPromise;
  }

  cesiumLoadPromise = loadCesiumScriptFromBase('/cesium')
    .catch((localErr) => {
      console.warn('[EcoCesium3D] Local /cesium yuklanmadi, CDN zaxiradan yuklanmoqda:', localErr?.message);
      return loadCesiumScriptFromBase(CESIUM_CDN_BASE);
    })
    .catch((cdnErr) => {
      cesiumLoadPromise = null;
      throw cdnErr;
    });

  return cesiumLoadPromise;
}

function getCategoryHex(category: EcoReport['category']): string {
  switch (category) {
    case 'waste':
      return '#e11d48';
    case 'water':
      return '#0284c7';
    case 'deforestation':
      return '#15803d';
    case 'greening_needed':
      return '#10b981';
    case 'air':
      return '#64748b';
    case 'electrical_hazard':
      return '#d97706';
    case 'chemical_hazard':
      return '#9333ea';
    default:
      return '#f43f5e';
  }
}

function zoomToAltitudeMeters(zoom: number): number {
  const clamped = Math.max(4, Math.min(18.5, zoom));
  return Math.round(45_000_000 / Math.pow(2, clamped));
}

export const EcoCesium3D: React.FC<EcoCesium3DProps> = ({
  baseStyle,
  provider,
  enabledLayers,
  initialFocus,
  schools,
  reports,
  allReportsForHeatmap,
  selectedSchoolId,
  flyToTarget,
  zoomAction,
  cesiumSession,
  photorealistic3DAvailable,
  onRequestPaid3D,
  onSelectSchool,
  onSelectReport,
  onMapClickCoords,
  onTileFallback,
  onSwitchTo2D,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewerRef = useRef<CesiumNS.Viewer | null>(null);
  const cesiumRef = useRef<typeof CesiumNS | null>(null);

  const boundariesDsRef = useRef<CesiumNS.CustomDataSource | null>(null);
  const greenDsRef = useRef<CesiumNS.CustomDataSource | null>(null);
  const treesDsRef = useRef<CesiumNS.CustomDataSource | null>(null);
  const schoolsDsRef = useRef<CesiumNS.CustomDataSource | null>(null);
  const reportsDsRef = useRef<CesiumNS.CustomDataSource | null>(null);
  const heatmapDsRef = useRef<CesiumNS.CustomDataSource | null>(null);
  const tilesetRef = useRef<CesiumNS.Cesium3DTileset | null>(null);
  const groundHeightsRef = useRef<Map<string, number>>(new Map());

  const schoolsByIdRef = useRef<Map<string, School>>(new Map());
  const reportsByIdRef = useRef<Map<string, EcoReport>>(new Map());
  const onSelectSchoolRef = useRef(onSelectSchool);
  const onSelectReportRef = useRef(onSelectReport);
  const onMapClickCoordsRef = useRef(onMapClickCoords);
  const onTileFallbackRef = useRef(onTileFallback);
  const activeStyleRef = useRef<MapBaseStyleId>(baseStyle);

  onSelectSchoolRef.current = onSelectSchool;
  onSelectReportRef.current = onSelectReport;
  onMapClickCoordsRef.current = onMapClickCoords;
  onTileFallbackRef.current = onTileFallback;
  activeStyleRef.current = baseStyle;

  const [loadingEngine, setLoadingEngine] = useState(true);
  const [engineError, setEngineError] = useState<string | null>(null);
  const [retryKey, setRetryKey] = useState(0);
  const [viewerReady, setViewerReady] = useState(false);
  const [tiltMode, setTiltMode] = useState<'3d' | 'top'>('3d');
  const [activePreset, setActivePreset] = useState<Cesium3DPreset>('ion_hd');
  const [terrainTick, setTerrainTick] = useState(0);
  const [isOrbiting, setIsOrbiting] = useState(false);
  const [fallbackNote, setFallbackNote] = useState<string>(
    'HD 3D Rejim: WGS84 3D globus, maktab binolari va ekologik qatlamlar.'
  );

  const hasIonSession = Boolean(
    cesiumSession && !cesiumSession.freeModeOnly && cesiumSession.ionToken
  );

  // Initialize lazy-loaded CesiumJS Viewer once with HiDPI crisp rendering
  useEffect(() => {
    let cancelled = false;
    let clickHandler: CesiumNS.ScreenSpaceEventHandler | null = null;

    (async () => {
      try {
        setLoadingEngine(true);
        setEngineError(null);
        const Cesium = await loadCesiumRuntime();
        if (cancelled || !containerRef.current) return;
        cesiumRef.current = Cesium;

        Cesium.Ion.defaultAccessToken = '';

        const isMobile = window.innerWidth < 768;
        const viewer = new Cesium.Viewer(containerRef.current, {
          baseLayer: false,
          animation: false,
          timeline: false,
          baseLayerPicker: false,
          geocoder: false,
          homeButton: false,
          sceneModePicker: false,
          navigationHelpButton: false,
          fullscreenButton: false,
          selectionIndicator: false,
          infoBox: false,
          shouldAnimate: false,
          requestRenderMode: true,
          maximumRenderTimeChange: Infinity,
          shadows: false,
          msaaSamples: isMobile ? 2 : 4,
          terrainProvider: new Cesium.EllipsoidTerrainProvider(),
        });

        // HiDPI Retina crisp resolution on both mobile Android/iOS and desktop
        viewer.resolutionScale = Math.min(window.devicePixelRatio || 1, 2.2);
        viewer.scene.globe.maximumScreenSpaceError = 1.0;
        viewer.scene.globe.enableLighting = false;
        viewer.scene.globe.depthTestAgainstTerrain = false;
        viewer.scene.postProcessStages.fxaa.enabled = true;
        viewer.scene.fog.enabled = true;
        viewer.scene.fog.density = 0.0001;
        if (viewer.scene.skyAtmosphere) {
          viewer.scene.skyAtmosphere.show = true;
          viewer.scene.skyAtmosphere.brightnessShift = 0.12;
          viewer.scene.skyAtmosphere.saturationShift = 0.14;
        }

        const creditEl = viewer.cesiumWidget.creditContainer as HTMLElement | undefined;
        if (creditEl) {
          creditEl.style.fontSize = '10px';
          creditEl.style.maxWidth = '55vw';
        }

        const boundariesDs = new Cesium.CustomDataSource('district_boundaries');
        const greenDs = new Cesium.CustomDataSource('green_spaces');
        const treesDs = new Cesium.CustomDataSource('trees');
        const schoolsDs = new Cesium.CustomDataSource('schools');
        const reportsDs = new Cesium.CustomDataSource('reports');
        const heatmapDs = new Cesium.CustomDataSource('eco_heatmap');

        await Promise.all([
          viewer.dataSources.add(boundariesDs),
          viewer.dataSources.add(heatmapDs),
          viewer.dataSources.add(greenDs),
          viewer.dataSources.add(treesDs),
          viewer.dataSources.add(schoolsDs),
          viewer.dataSources.add(reportsDs),
        ]);

        boundariesDsRef.current = boundariesDs;
        greenDsRef.current = greenDs;
        treesDsRef.current = treesDs;
        schoolsDsRef.current = schoolsDs;
        reportsDsRef.current = reportsDs;
        heatmapDsRef.current = heatmapDs;

        // Start smoothly over the user's city/school skyline at detailed 3D oblique view
        const startAlt = Math.min(2200, Math.max(650, zoomToAltitudeMeters(initialFocus.zoom)));
        const startLatOffset = Math.min(0.014, startAlt / 95_000);
        viewer.camera.setView({
          destination: Cesium.Cartesian3.fromDegrees(
            initialFocus.lng,
            initialFocus.lat - startLatOffset,
            startAlt
          ),
          orientation: {
            heading: Cesium.Math.toRadians(0),
            pitch: Cesium.Math.toRadians(-32),
            roll: 0,
          },
        });

        // Reliable multi-depth picking (drillPick) so clicking any school marker/building/label always opens school info & photo
        clickHandler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
        clickHandler.setInputAction((movement: { position: CesiumNS.Cartesian2 }) => {
          setIsOrbiting(false);

          const picks = viewer.scene.drillPick(movement.position, 10);
          for (const picked of picks) {
            const entity = picked?.id as CesiumNS.Entity | undefined;
            if (!entity || !entity.properties) continue;
            const now = Cesium.JulianDate.now();
            const kind = entity.properties.kind?.getValue(now);
            const recId = entity.properties.recordId?.getValue(now);
            if (kind === 'school' && recId) {
              const s = schoolsByIdRef.current.get(String(recId));
              if (s) {
                onSelectSchoolRef.current(s);
                if (typeof s.lat === 'number' && typeof s.lng === 'number') {
                  const baseGround = groundHeightsRef.current.get(`school_${s.id}`) || 450;
                  const targetAlt = baseGround + 620;
                  viewer.camera.flyTo({
                    destination: Cesium.Cartesian3.fromDegrees(
                      s.lng,
                      s.lat - 0.0045,
                      targetAlt
                    ),
                    orientation: {
                      heading: Cesium.Math.toRadians(0),
                      pitch: Cesium.Math.toRadians(-34),
                      roll: 0,
                    },
                    duration: 0.9,
                  });
                }
                return;
              }
            }
            if (kind === 'report' && recId) {
              const r = reportsByIdRef.current.get(String(recId));
              if (r) {
                onSelectReportRef.current(r);
                return;
              }
            }
          }

          const ray = viewer.camera.getPickRay(movement.position);
          const cartesian =
            (ray ? viewer.scene.globe.pick(ray, viewer.scene) : undefined) ||
            viewer.camera.pickEllipsoid(movement.position, viewer.scene.globe.ellipsoid);
          if (cartesian) {
            const carto = Cesium.Cartographic.fromCartesian(cartesian);
            const lat = Cesium.Math.toDegrees(carto.latitude);
            const lng = Cesium.Math.toDegrees(carto.longitude);
            onMapClickCoordsRef.current([lat, lng]);
          }
        }, Cesium.ScreenSpaceEventType.LEFT_CLICK);

        viewerRef.current = viewer;
        setViewerReady(true);
        setLoadingEngine(false);
        viewer.scene.requestRender();
      } catch (err: any) {
        if (!cancelled) {
          setEngineError(
            err?.message ||
              "3D CesiumJS dvigateli ishga tushmadi (WebGL yoki tarmoq xatosi)."
          );
          setLoadingEngine(false);
        }
      }
    })();

    return () => {
      cancelled = true;
      clickHandler?.destroy();
      if (viewerRef.current && !viewerRef.current.isDestroyed()) {
        viewerRef.current.destroy();
      }
      viewerRef.current = null;
      setViewerReady(false);
    };
  }, [retryKey]);

  // Sync ultra-crisp Imagery: Cesium Ion when active, else Esri World Imagery + Reference layers / OpenStreetMap keyless tiles
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || !viewerReady || viewer.isDestroyed()) return;

    let cancelled = false;

    (async () => {
      viewer.imageryLayers.removeAll(true);
      let tileErrors = 0;

      if (hasIonSession && cesiumSession?.ionToken && activePreset !== 'free') {
        try {
          Cesium.Ion.defaultAccessToken = cesiumSession.ionToken;
          const ionStyle =
            baseStyle === 'street'
              ? Cesium.IonWorldImageryStyle.ROAD
              : Cesium.IonWorldImageryStyle.AERIAL_WITH_LABELS;
          const ionProvider = await Cesium.createWorldImageryAsync({ style: ionStyle });
          if (cancelled || viewer.isDestroyed()) return;
          const ionLayer = viewer.imageryLayers.addImageryProvider(ionProvider);
          ionLayer.brightness = baseStyle === 'dark' ? 0.65 : 1.05;
          ionLayer.contrast = 1.08;
          ionLayer.saturation = baseStyle === 'dark' ? 0.65 : 1.1;
          viewer.scene.requestRender();
          return;
        } catch {
          // Graceful fallback to free tile provider below
        }
      }

      if (cancelled || viewer.isDestroyed()) return;

      const isOsmBase = baseStyle === 'street' || baseStyle === 'dark';
      const tileUrl = isOsmBase
        ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
        : provider.tileUrls[0] ||
          'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
      const baseCreditText = isOsmBase
        ? '© OpenStreetMap contributors'
        : provider.attribution || 'Tiles © Esri';

      const baseProvider = new Cesium.UrlTemplateImageryProvider({
        url: tileUrl,
        maximumLevel: Math.min(19, provider.maxZoom || 19),
        credit: new Cesium.Credit(baseCreditText, false),
      });

      baseProvider.errorEvent.addEventListener(() => {
        tileErrors += 1;
        if (tileErrors >= 4 && activeStyleRef.current !== 'street') {
          tileErrors = 0;
          onTileFallbackRef.current(
            activeStyleRef.current,
            "3D xarita tasvirlari yuklanmadi — standart ko'cha xaritasiga qaytarildi."
          );
        }
      });

      const baseLayer = viewer.imageryLayers.addImageryProvider(baseProvider);
      baseLayer.brightness = baseStyle === 'satellite' ? 1.06 : 1.0;
      baseLayer.contrast = baseStyle === 'satellite' ? 1.08 : 1.02;
      baseLayer.saturation = baseStyle === 'satellite' ? 1.12 : 1.0;

      if (baseStyle === 'satellite') {
        const transportProvider = new Cesium.UrlTemplateImageryProvider({
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Transportation/MapServer/tile/{z}/{y}/{x}',
          maximumLevel: 19,
          credit: new Cesium.Credit('Tiles © Esri', false),
        });
        const transportLayer = viewer.imageryLayers.addImageryProvider(transportProvider);
        transportLayer.alpha = 0.88;

        const placesProvider = new Cesium.UrlTemplateImageryProvider({
          url: 'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',
          maximumLevel: 19,
          credit: new Cesium.Credit('Tiles © Esri', false),
        });
        const placesLayer = viewer.imageryLayers.addImageryProvider(placesProvider);
        placesLayer.alpha = 0.94;
      }

      viewer.scene.requestRender();
    })();

    return () => {
      cancelled = true;
    };
  }, [baseStyle, provider, viewerReady, hasIonSession, cesiumSession?.ionToken, activePreset]);

  // Activate Cesium Ion Terrain + 3D Buildings (or Google Photorealistic 3D Tiles) & sample real terrain altitudes
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || !viewerReady || viewer.isDestroyed()) return;

    let cancelled = false;

    const sampleAllEntityHeights = async (terrain: CesiumNS.TerrainProvider) => {
      try {
        const positions: CesiumNS.Cartographic[] = [];
        const keys: string[] = [];
        for (const s of schools) {
          if (typeof s.lat === 'number' && typeof s.lng === 'number') {
            positions.push(Cesium.Cartographic.fromDegrees(s.lng, s.lat));
            keys.push(`school_${s.id}`);
          }
        }
        for (const r of reports) {
          if (typeof r.lat === 'number' && typeof r.lng === 'number') {
            positions.push(Cesium.Cartographic.fromDegrees(r.lng, r.lat));
            keys.push(`report_${r.id}`);
          }
        }
        if (positions.length === 0) return;
        const sampled = await Cesium.sampleTerrainMostDetailed(terrain, positions);
        if (cancelled) return;
        const nextMap = new Map<string, number>();
        sampled.forEach((c, idx) => {
          if (Number.isFinite(c.height)) {
            nextMap.set(keys[idx], c.height);
          }
        });
        groundHeightsRef.current = nextMap;
        setTerrainTick((t) => t + 1);
      } catch {
        // Keep ellipsoid/0 fallback cleanly if terrain sampling fails
      }
    };

    (async () => {
      if (tilesetRef.current) {
        try {
          viewer.scene.primitives.remove(tilesetRef.current);
        } catch {
          // ignore
        }
        tilesetRef.current = null;
      }

      if (!cesiumSession || cesiumSession.freeModeOnly || activePreset === 'free') {
        viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        viewer.scene.globe.depthTestAgainstTerrain = false;
        groundHeightsRef.current = new Map();
        setTerrainTick((t) => t + 1);
        setFallbackNote(
          cesiumSession?.message ||
            'HD 3D Rejim (Bepul): WGS84 3D globus va maktab kampuslari.'
        );
        viewer.scene.requestRender();
        return;
      }

      const isMobile = window.innerWidth < 768;

      try {
        if (cesiumSession.custom3DTilesUrl) {
          const tileset = await Cesium.Cesium3DTileset.fromUrl(
            cesiumSession.custom3DTilesUrl
          );
          if (cancelled || viewer.isDestroyed()) return;
          viewer.scene.primitives.add(tileset);
          tilesetRef.current = tileset;
          setFallbackNote('Sozlangan 3D Tiles provayderi faol.');
        } else if (cesiumSession.ionToken) {
          Cesium.Ion.defaultAccessToken = cesiumSession.ionToken;

          const terrain = await Cesium.createWorldTerrainAsync({
            requestVertexNormals: true,
          });
          if (cancelled || viewer.isDestroyed()) return;
          viewer.terrainProvider = terrain;
          viewer.scene.globe.depthTestAgainstTerrain = true;
          sampleAllEntityHeights(terrain);

          if (activePreset === 'google_photorealistic') {
            try {
              const googleTileset = await Cesium.createGooglePhotorealistic3DTileset(
                undefined,
                {
                  maximumScreenSpaceError: isMobile ? 12 : 8,
                }
              );
              if (cancelled || viewer.isDestroyed()) return;
              let tileFailCount = 0;
              googleTileset.tileFailed.addEventListener(() => {
                tileFailCount += 1;
                if (tileFailCount >= 6 && !cancelled) {
                  setActivePreset('ion_hd');
                  setFallbackNote(
                    "Bu hududda Google 3D Tiles qamrovi to'liq emas — Cesium Ion HD (Bing Aerial + OSM 3D) ga o'tkazildi."
                  );
                }
              });
              viewer.scene.primitives.add(googleTileset);
              tilesetRef.current = googleTileset;
              setFallbackNote(
                'Google Photorealistic 3D Tiles faol (qamrov shahar markazlarida eng yuqori).'
              );
              viewer.scene.requestRender();
              return;
            } catch {
              if (cancelled || viewer.isDestroyed()) return;
              setActivePreset('ion_hd');
            }
          }

          // Cesium Ion HD: World Terrain + Crisp Styled OSM 3D Buildings
          const osmBuildings = await Cesium.createOsmBuildingsAsync({
            style: new Cesium.Cesium3DTileStyle({
              color: {
                conditions: [
                  [
                    "${feature['building']} === 'school' || ${feature['building']} === 'university' || ${feature['building']} === 'college'",
                    "color('#6366f1', 0.96)",
                  ],
                  [
                    "${feature['building']} === 'hospital'",
                    "color('#0ea5e9', 0.92)",
                  ],
                  [
                    "${feature['building']} === 'commercial' || ${feature['building']} === 'office'",
                    "color('#dbeafe', 0.92)",
                  ],
                  [true, "color('#f1f5f9', 0.88)"],
                ],
              },
            }),
          });
          if (cancelled || viewer.isDestroyed()) return;
          osmBuildings.maximumScreenSpaceError = isMobile ? 10 : 5;
          viewer.scene.primitives.add(osmBuildings);
          tilesetRef.current = osmBuildings;
          setFallbackNote(
            `Cesium Ion HD 3D faol: Bing Aerial + World Terrain + 3D Binolar (kvota: ${
              cesiumSession.remainingQuota ?? '—'
            }).`
          );
        }
        viewer.scene.requestRender();
      } catch {
        if (cancelled || viewer.isDestroyed()) return;
        viewer.terrainProvider = new Cesium.EllipsoidTerrainProvider();
        viewer.scene.globe.depthTestAgainstTerrain = false;
        setFallbackNote(
          'Cesium Ion 3D Tiles yuklanmadi — avtomatik bepul 3D globus rejimiga qaytarildi.'
        );
        viewer.scene.requestRender();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [cesiumSession, viewerReady, activePreset, schools, reports]);

  // Populate Regional Boundaries in 3D
  useEffect(() => {
    const ds = boundariesDsRef.current;
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!ds || !Cesium || !viewer || !viewerReady) return;

    ds.entities.removeAll();
    for (const reg of UZBEKISTAN_REGION_VIEWPORTS) {
      const flat = reg.boundsPolygon.flatMap(([lng, lat]) => [lng, lat]);
      ds.entities.add({
        id: `bound_${reg.code}`,
        polygon: {
          hierarchy: Cesium.Cartesian3.fromDegreesArray(flat),
          material: Cesium.Color.fromCssColorString('#10b981').withAlpha(0.05),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString('#10b981').withAlpha(0.75),
          outlineWidth: 2,
          classificationType: Cesium.ClassificationType.TERRAIN,
        },
      });
    }
    ds.show = enabledLayers.district_boundaries;
    viewer.scene.requestRender();
  }, [viewerReady, enabledLayers.district_boundaries]);

  // Populate Schools (Terrain-clamped Pins, Crisp Labels, Campus Massing & Highlighted Selection)
  useEffect(() => {
    const schoolsDs = schoolsDsRef.current;
    const greenDs = greenDsRef.current;
    const treesDs = treesDsRef.current;
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!schoolsDs || !greenDs || !treesDs || !Cesium || !viewer || !viewerReady) return;

    schoolsDs.entities.removeAll();
    greenDs.entities.removeAll();
    treesDs.entities.removeAll();

    const sMap = new Map<string, School>();
    const hasTerrain =
      hasIonSession && activePreset !== 'free' && groundHeightsRef.current.size > 0;

    for (const s of schools) {
      sMap.set(s.id, s);
      if (
        typeof s.lat !== 'number' ||
        typeof s.lng !== 'number' ||
        !Number.isFinite(s.lat) ||
        !Number.isFinite(s.lng)
      ) {
        continue;
      }

      const groundH = hasTerrain ? groundHeightsRef.current.get(`school_${s.id}`) || 0 : 0;
      const hasGlb = Boolean(s.glbModelUrl && s.glbModelUrl.trim().length > 0);
      const isTopRank = (s.ratingRank || 999) <= 10;
      const isSelected = selectedSchoolId === s.id;

      const primaryEntity: CesiumNS.Entity.ConstructorOptions = {
        id: `school_${s.id}`,
        name: s.name,
        position: Cesium.Cartesian3.fromDegrees(s.lng, s.lat, groundH + 24),
        properties: new Cesium.PropertyBag({
          kind: 'school',
          recordId: s.id,
        }),
        point: {
          pixelSize: isSelected ? 16 : isTopRank ? 13 : 10,
          color: Cesium.Color.fromCssColorString(isSelected ? '#10b981' : '#4f46e5'),
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: isSelected ? 3 : 2,
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
        label: {
          text: s.number ? `${s.number}-maktab` : s.name.slice(0, 22),
          font: isSelected
            ? '700 13px "Plus Jakarta Sans", sans-serif'
            : '600 12px "Plus Jakarta Sans", sans-serif',
          fillColor: Cesium.Color.WHITE,
          showBackground: true,
          backgroundColor: Cesium.Color.fromCssColorString(
            isSelected ? '#059669' : '#0f172a'
          ).withAlpha(0.9),
          backgroundPadding: new Cesium.Cartesian2(9, 5),
          pixelOffset: new Cesium.Cartesian2(0, -28),
          heightReference: Cesium.HeightReference.RELATIVE_TO_GROUND,
          distanceDisplayCondition: new Cesium.DistanceDisplayCondition(0, 55_000),
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      };

      if (hasGlb && s.glbModelUrl) {
        primaryEntity.model = {
          uri: s.glbModelUrl.trim(),
          minimumPixelSize: 64,
          maximumScale: 260,
          scale: 1.0,
          heightReference: Cesium.HeightReference.CLAMP_TO_GROUND,
        };
      } else {
        const dLng = 0.00032;
        const dLat = 0.00018;
        primaryEntity.polygon = {
          hierarchy: Cesium.Cartesian3.fromDegreesArray([
            s.lng - dLng,
            s.lat - dLat,
            s.lng + dLng,
            s.lat - dLat,
            s.lng + dLng,
            s.lat + dLat,
            s.lng - dLng,
            s.lat + dLat,
          ]),
          height: groundH,
          extrudedHeight: groundH + (isTopRank ? 20 : 16),
          material: Cesium.Color.fromCssColorString(
            isSelected ? '#a7f3d0' : '#f8fafc'
          ).withAlpha(0.94),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(
            isSelected ? '#059669' : '#4f46e5'
          ),
        };

        schoolsDs.entities.add({
          id: `school_wing_${s.id}`,
          properties: new Cesium.PropertyBag({
            kind: 'school',
            recordId: s.id,
          }),
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray([
              s.lng + dLng * 0.2,
              s.lat - dLat * 1.9,
              s.lng + dLng * 1.15,
              s.lat - dLat * 1.9,
              s.lng + dLng * 1.15,
              s.lat - dLat * 0.9,
              s.lng + dLng * 0.2,
              s.lat - dLat * 0.9,
            ]),
            height: groundH,
            extrudedHeight: groundH + 11,
            material: Cesium.Color.fromCssColorString('#e0e7ff').withAlpha(0.92),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#6366f1'),
          },
        });
      }

      if (enabledLayers.school_rankings) {
        primaryEntity.ellipse = {
          semiMajorAxis: isSelected ? 120 : isTopRank ? 95 : 65,
          semiMinorAxis: isSelected ? 120 : isTopRank ? 95 : 65,
          height: groundH + 1,
          material: Cesium.Color.fromCssColorString(
            isSelected ? '#10b981' : '#f59e0b'
          ).withAlpha(isSelected ? 0.28 : 0.18),
          outline: true,
          outlineColor: Cesium.Color.fromCssColorString(
            isSelected ? '#10b981' : '#f59e0b'
          ),
        };
      }

      schoolsDs.entities.add(primaryEntity);

      if ((s.greenAreaSqm || 0) > 0 || (s.treesPlanted || 0) > 0) {
        const radius = Math.min(0.0011, 0.00042 + Math.sqrt(s.treesPlanted || 15) * 0.00003);
        const dx = radius * 1.3;
        const dy = radius;
        greenDs.entities.add({
          id: `green_3d_${s.id}`,
          properties: new Cesium.PropertyBag({
            kind: 'school',
            recordId: s.id,
          }),
          polygon: {
            hierarchy: Cesium.Cartesian3.fromDegreesArray([
              s.lng - dx,
              s.lat - dy,
              s.lng + dx,
              s.lat - dy,
              s.lng + dx,
              s.lat + dy,
              s.lng - dx,
              s.lat + dy,
            ]),
            height: groundH,
            extrudedHeight: groundH + 1.5,
            material: Cesium.Color.fromCssColorString('#22c55e').withAlpha(0.32),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#16a34a'),
          },
        });
      }

      if ((s.treesPlanted || 0) > 0) {
        treesDs.entities.add({
          id: `tree_3d_${s.id}`,
          position: Cesium.Cartesian3.fromDegrees(s.lng - 0.00042, s.lat + 0.0003, groundH + 7),
          ellipsoid: {
            radii: new Cesium.Cartesian3(8, 8, 9),
            material: Cesium.Color.fromCssColorString('#16a34a').withAlpha(0.94),
            outline: true,
            outlineColor: Cesium.Color.fromCssColorString('#bbf7d0'),
          },
        });
      }
    }

    schoolsByIdRef.current = sMap;
    schoolsDs.show = enabledLayers.schools;
    greenDs.show = enabledLayers.green_spaces;
    treesDs.show = enabledLayers.trees;
    viewer.scene.requestRender();
  }, [
    schools,
    selectedSchoolId,
    viewerReady,
    terrainTick,
    hasIonSession,
    activePreset,
    enabledLayers.schools,
    enabledLayers.school_rankings,
    enabledLayers.green_spaces,
    enabledLayers.trees,
  ]);

  // Populate Reports & 3D Heatmap Discs
  useEffect(() => {
    const reportsDs = reportsDsRef.current;
    const heatmapDs = heatmapDsRef.current;
    const Cesium = cesiumRef.current;
    const viewer = viewerRef.current;
    if (!reportsDs || !heatmapDs || !Cesium || !viewer || !viewerReady) return;

    reportsDs.entities.removeAll();
    heatmapDs.entities.removeAll();

    const rMap = new Map<string, EcoReport>();
    const hasTerrain =
      hasIonSession && activePreset !== 'free' && groundHeightsRef.current.size > 0;

    for (const r of reports) {
      rMap.set(r.id, r);
      if (
        typeof r.lat !== 'number' ||
        typeof r.lng !== 'number' ||
        !Number.isFinite(r.lat) ||
        !Number.isFinite(r.lng)
      ) {
        continue;
      }

      const groundH = hasTerrain ? groundHeightsRef.current.get(`report_${r.id}`) || 0 : 0;
      const color = Cesium.Color.fromCssColorString(getCategoryHex(r.category));
      reportsDs.entities.add({
        id: `report_3d_${r.id}`,
        name: r.title,
        position: Cesium.Cartesian3.fromDegrees(r.lng, r.lat, groundH + 18),
        properties: new Cesium.PropertyBag({
          kind: 'report',
          recordId: r.id,
        }),
        cylinder: {
          length: 34,
          topRadius: 5,
          bottomRadius: 2,
          material: color.withAlpha(0.92),
          outline: true,
          outlineColor: Cesium.Color.WHITE,
        },
        point: {
          pixelSize: r.isHazardous ? 12 : 9,
          color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
          disableDepthTestDistance: Number.POSITIVE_INFINITY,
        },
      });
    }

    for (const r of allReportsForHeatmap) {
      if (
        typeof r.lat !== 'number' ||
        typeof r.lng !== 'number' ||
        !Number.isFinite(r.lat) ||
        !Number.isFinite(r.lng)
      ) {
        continue;
      }
      const radius = r.severity === 'high' ? 850 : r.severity === 'medium' ? 560 : 360;
      const heatColor =
        r.severity === 'high'
          ? Cesium.Color.fromCssColorString('#e11d48').withAlpha(0.45)
          : r.severity === 'medium'
            ? Cesium.Color.fromCssColorString('#f97316').withAlpha(0.35)
            : Cesium.Color.fromCssColorString('#facc15').withAlpha(0.28);

      heatmapDs.entities.add({
        id: `heat_3d_${r.id}`,
        position: Cesium.Cartesian3.fromDegrees(r.lng, r.lat, 3),
        ellipse: {
          semiMajorAxis: radius,
          semiMinorAxis: radius,
          classificationType: Cesium.ClassificationType.TERRAIN,
          material: heatColor,
        },
      });
    }

    reportsByIdRef.current = rMap;
    const anyReports =
      enabledLayers.waste_reports ||
      enabledLayers.water_reports ||
      enabledLayers.problem_locations;
    reportsDs.show = anyReports;
    heatmapDs.show = enabledLayers.eco_heatmap;
    viewer.scene.requestRender();
  }, [
    reports,
    allReportsForHeatmap,
    viewerReady,
    terrainTick,
    hasIonSession,
    activePreset,
    enabledLayers.waste_reports,
    enabledLayers.water_reports,
    enabledLayers.problem_locations,
    enabledLayers.eco_heatmap,
  ]);

  // Smooth 360° cinematic camera orbit when toggled on
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!isOrbiting || !viewer || !Cesium || !viewerReady || viewer.isDestroyed()) return;

    let rafId = 0;
    const step = () => {
      if (!viewer.isDestroyed()) {
        viewer.camera.rotateRight(0.004);
        viewer.scene.requestRender();
        rafId = requestAnimationFrame(step);
      }
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  }, [isOrbiting, viewerReady]);

  // Sync FlyTo camera in crisp 3D skyline perspective
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || !viewerReady || !flyToTarget || viewer.isDestroyed()) return;

    setIsOrbiting(false);
    const baseGround = selectedSchoolId
      ? groundHeightsRef.current.get(`school_${selectedSchoolId}`) || 450
      : 450;
    const relAlt = Math.max(360, zoomToAltitudeMeters(flyToTarget.zoom));
    const finalAlt = hasIonSession && activePreset !== 'free' ? baseGround + relAlt : relAlt;
    const pitchRad = Cesium.Math.toRadians(tiltMode === '3d' ? -32 : -88);
    const latOffset = tiltMode === '3d' ? Math.min(0.08, relAlt / 115_000) : 0;

    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.fromDegrees(
        flyToTarget.lng,
        flyToTarget.lat - latOffset,
        finalAlt
      ),
      orientation: {
        heading: 0,
        pitch: pitchRad,
        roll: 0,
      },
      duration: 1.0,
    });
  }, [flyToTarget, viewerReady, tiltMode, hasIonSession, activePreset, selectedSchoolId]);

  // Sync Zoom In / Out / Reset buttons
  useEffect(() => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || !viewerReady || !zoomAction || viewer.isDestroyed()) return;

    setIsOrbiting(false);
    const camHeight = viewer.camera.positionCartographic?.height || 10_000;
    if (zoomAction.type === 'in') {
      viewer.camera.zoomIn(Math.max(120, camHeight * 0.45));
    } else if (zoomAction.type === 'out') {
      viewer.camera.zoomOut(Math.max(250, camHeight * 0.75));
    } else {
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(65.5, 36.2, 1_150_000),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(tiltMode === '3d' ? -52 : -88),
          roll: 0,
        },
        duration: 1.0,
      });
    }
    viewer.scene.requestRender();
  }, [zoomAction, viewerReady, tiltMode]);

  const handleToggleTilt = () => {
    const viewer = viewerRef.current;
    const Cesium = cesiumRef.current;
    if (!viewer || !Cesium || viewer.isDestroyed()) return;

    const nextTilt: '3d' | 'top' = tiltMode === '3d' ? 'top' : '3d';
    setTiltMode(nextTilt);

    const carto = viewer.camera.positionCartographic;
    if (carto) {
      const lng = Cesium.Math.toDegrees(carto.longitude);
      const lat = Cesium.Math.toDegrees(carto.latitude);
      const height = Math.max(300, carto.height);
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(lng, lat, height),
        orientation: {
          heading: 0,
          pitch: Cesium.Math.toRadians(nextTilt === '3d' ? -32 : -88),
          roll: 0,
        },
        duration: 0.7,
      });
    }
  };

  if (engineError) {
    return (
      <div className="w-full h-full flex items-center justify-center p-6 bg-slate-950 text-center">
        <div className="max-w-md space-y-3.5 bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-xl">
          <p className="text-sm font-bold text-white">3D CesiumJS dvigateli ishga tushmadi</p>
          <p className="text-xs text-slate-400 leading-relaxed">{engineError}</p>
          <div className="flex items-center justify-center gap-2 pt-1">
            <button
              type="button"
              onClick={() => {
                cesiumLoadPromise = null;
                setRetryKey((k) => k + 1);
              }}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold cursor-pointer"
            >
              Qayta urinish
            </button>
            {onSwitchTo2D && (
              <button
                type="button"
                onClick={onSwitchTo2D}
                className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer"
              >
                2D xaritaga qaytish
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  const applyOsmDarkFilter =
    baseStyle === 'dark' && !(hasIonSession && cesiumSession?.ionToken && activePreset !== 'free');

  return (
    <div className="w-full h-full relative bg-slate-950 select-none overflow-hidden">
      <div
        ref={containerRef}
        className={`w-full h-full ${
          applyOsmDarkFilter
            ? '[&_.cesium-widget_canvas]:[filter:invert(1)_hue-rotate(180deg)_brightness(0.9)_contrast(0.9)]'
            : ''
        }`}
      />

      {loadingEngine && (
        <div className="absolute inset-0 z-20 bg-slate-950/85 backdrop-blur-sm flex flex-col items-center justify-center gap-3 text-white p-4 text-center">
          <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          <div>
            <p className="text-sm font-bold">CesiumJS 3D dvigateli yuklanmoqda...</p>
            <p className="text-xs text-slate-400 mt-0.5">
              Yuqori aniqlikdagi 3D globus va maktab maketlari tayyorlanmoqda
            </p>
          </div>
        </div>
      )}

      {!loadingEngine && (
        <div className="absolute bottom-16 lg:bottom-4 left-3 lg:left-[21.5rem] z-10 max-w-md flex flex-col gap-1.5 pointer-events-none">
          <div className="pointer-events-auto px-3 py-2.5 rounded-2xl bg-slate-950/85 backdrop-blur-md border border-white/10 text-[11px] text-slate-200 shadow-xl space-y-2">
            <div className="flex items-start gap-2">
              <Box className="w-3.5 h-3.5 text-emerald-400 shrink-0 mt-0.5" />
              <p className="leading-snug text-slate-100">{fallbackNote}</p>
            </div>

            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              {hasIonSession && (
                <div className="inline-flex items-center rounded-lg bg-slate-900 border border-white/10 p-0.5">
                  <button
                    type="button"
                    onClick={() => setActivePreset('ion_hd')}
                    className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                      activePreset === 'ion_hd'
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Cesium Ion HD
                  </button>
                  <button
                    type="button"
                    onClick={() => setActivePreset('google_photorealistic')}
                    className={`px-2 py-1 rounded-md text-[10px] font-semibold transition-colors ${
                      activePreset === 'google_photorealistic'
                        ? 'bg-indigo-600 text-white'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    Google 3D
                  </button>
                </div>
              )}

              <button
                type="button"
                onClick={handleToggleTilt}
                className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/10 hover:bg-white/15 text-emerald-300 font-semibold transition-colors"
              >
                <Compass className="w-3 h-3" />
                {tiltMode === '3d' ? '3D Burchak (-32°)' : 'Yuqoridan (-88°)'}
              </button>

              <button
                type="button"
                onClick={() => setIsOrbiting((v) => !v)}
                className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg font-semibold transition-colors ${
                  isOrbiting
                    ? 'bg-emerald-600 text-white'
                    : 'bg-white/10 hover:bg-white/15 text-slate-200'
                }`}
              >
                <Orbit className="w-3 h-3" />
                {isOrbiting ? '360° To‘xtatish' : '360° Aylanish'}
              </button>

              {!hasIonSession && (
                <button
                  type="button"
                  onClick={onRequestPaid3D}
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-colors"
                >
                  {photorealistic3DAvailable ? (
                    <Sparkles className="w-3 h-3" />
                  ) : (
                    <ShieldAlert className="w-3 h-3" />
                  )}
                  {photorealistic3DAvailable
                    ? 'Cesium Ion HD ni yoqish'
                    : '3D Tiles sozlamalari'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default EcoCesium3D;
