import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  AdvancedMarkerAnchorPoint,
  Circle,
  InfoWindow,
  Map as GoogleMapView,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import Supercluster, {
  ClusterProperties,
  Options as SuperclusterOptions,
} from 'supercluster';
import type { BBox, Feature, FeatureCollection, Point } from 'geojson';
import {
  Calendar,
  CheckCircle2,
  Eye,
  Loader2,
  MapPin,
  Search,
  Trees,
  X,
} from 'lucide-react';
import {
  EcologicalLayerId,
  EcoReport,
  MapBaseStyleId,
  School,
} from '../../types/eco';
import type { FlyToTarget } from './EcoMapLibre2D';

export interface GoogleMapQualityInfo {
  currentZoom: number;
  nativeMaxZoom: number;
  imageryUnavailable: boolean;
  mapType: MapBaseStyleId;
}

interface EcoGoogleMapProps {
  apiKey: string;
  baseStyle: MapBaseStyleId;
  enabledLayers: Record<EcologicalLayerId, boolean>;
  initialCenter: [number, number]; // [lng, lat]
  initialZoom: number;
  isTilted25D: boolean;
  schools: School[];
  reports: EcoReport[];
  selectedSchoolId: string | null;
  selectedReportId: string | null;
  clickedCoords: [number, number] | null; // [lat, lng]
  userLocation: [number, number] | null; // [lat, lng]
  userAccuracyMeters?: number | null;
  flyToTarget: FlyToTarget | null;
  zoomAction: { type: 'in' | 'out' | 'reset'; ts: number } | null;
  onSelectSchool: (school: School) => void;
  onSelectReport: (report: EcoReport) => void;
  onMapClickCoords: (coords: [number, number]) => void;
  onFallbackToLibre: (reason: string) => void;
  onImageryQualityChange?: (info: GoogleMapQualityInfo) => void;
}

// Keep libraries array referentially stable at module scope to prevent APIProvider re-loads
const GMP_LIBRARIES: ('marker' | 'places')[] = ['marker', 'places'];

const FALLBACK_REPORT_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#071812"/><stop offset="100%" stop-color="#040D0A"/></linearGradient></defs><rect width="320" height="180" fill="url(#g)"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#6ee7b7" font-family="sans-serif" font-size="13">Rasm mavjud emas</text></svg>`
  );

// Exact category palette matching EcoHero map specification:
// Chiqindi -> Red/Orange | Suv -> Blue | Daraxt kesish -> Brown | Ifloslanish -> Purple | Yashil hudud -> Green
export const REPORT_COLOR_MAP: Record<
  string,
  { bg: string; border: string; label: string; badgeClass: string }
> = {
  waste: {
    bg: '#ef4444',
    border: '#991b1b',
    label: 'Chiqindi',
    badgeClass: 'bg-red-500/20 text-red-300 border-red-500/40',
  },
  water: {
    bg: '#0284c7',
    border: '#075985',
    label: 'Suv muammosi',
    badgeClass: 'bg-sky-500/20 text-sky-300 border-sky-500/40',
  },
  deforestation: {
    bg: '#92400e',
    border: '#451a03',
    label: 'Daraxt kesilishi',
    badgeClass: 'bg-amber-700/25 text-amber-300 border-amber-600/40',
  },
  air: {
    bg: '#7c3aed',
    border: '#4c1d95',
    label: 'Ekologik ifloslanish',
    badgeClass: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  },
  electrical_hazard: {
    bg: '#7c3aed',
    border: '#4c1d95',
    label: 'Elektr / texnogen xavf',
    badgeClass: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  },
  chemical_hazard: {
    bg: '#7c3aed',
    border: '#4c1d95',
    label: 'Kimyoviy ifloslanish',
    badgeClass: 'bg-violet-500/20 text-violet-300 border-violet-500/40',
  },
  greening_needed: {
    bg: '#16a34a',
    border: '#14532d',
    label: 'Yashil hudud / daraxt',
    badgeClass: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40',
  },
};

const STATUS_BADGES: Record<string, { label: string; cls: string }> = {
  pending: { label: 'Kutilmoqda', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/35' },
  pending_review: { label: 'Tekshiruvda', cls: 'bg-amber-500/20 text-amber-300 border-amber-500/35' },
  verified: { label: 'Tasdiqlangan', cls: 'bg-sky-500/20 text-sky-300 border-sky-500/35' },
  approved: { label: 'Tasdiqlangan', cls: 'bg-sky-500/20 text-sky-300 border-sky-500/35' },
  assigned: { label: 'Biriktirilgan', cls: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/35' },
  in_progress: { label: 'Jarayonda', cls: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/35' },
  escalated: { label: 'Nazoratda', cls: 'bg-rose-500/20 text-rose-300 border-rose-500/35' },
  resolved: { label: 'Hal etilgan', cls: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40' },
  rejected: { label: 'Rad etilgan', cls: 'bg-slate-500/20 text-slate-300 border-slate-500/35' },
};

function resolveGoogleMapType(style: MapBaseStyleId): google.maps.MapTypeId | string {
  switch (style) {
    case 'satellite':
      return 'satellite';
    case 'terrain':
      return 'terrain';
    case 'roadmap':
    case 'street':
    case 'dark':
      return 'roadmap';
    case 'hybrid':
    default:
      return 'hybrid';
  }
}

function formatDateUz(iso?: string): string {
  if (!iso) return 'Noma’lum sana';
  try {
    const dt = new Date(iso);
    if (Number.isNaN(dt.getTime())) return 'Noma’lum sana';
    return dt.toLocaleString('uz-UZ', {
      timeZone: 'Asia/Tashkent',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return String(iso).slice(0, 16);
  }
}

function isVerifiedOrResolvedStatus(status?: string): 'resolved' | 'verified' | 'other' {
  const s = String(status || '').toLowerCase();
  if (s === 'resolved') return 'resolved';
  if (s === 'verified' || s === 'approved' || s === 'in_progress' || s === 'assigned') {
    return 'verified';
  }
  return 'other';
}

interface SearchedPlacePin {
  lat: number;
  lng: number;
  name: string;
  address: string;
}

type ClusterFeatureProps =
  | {
      kind: 'school';
      entityId: string;
    }
  | {
      kind: 'report';
      entityId: string;
    };

function degreesPerPixel(zoomLevel: number): number {
  return 360 / (Math.pow(2, Math.max(1, zoomLevel)) * 256);
}

function useMapViewport(paddingPx = 100) {
  const map = useMap();
  const [bbox, setBbox] = useState<BBox>([55, 36, 74, 46]);
  const [zoom, setZoom] = useState<number>(13);

  useEffect(() => {
    if (!map) return;

    const updateViewport = () => {
      const bounds = map.getBounds();
      const currentZoom = map.getZoom();
      if (!bounds || typeof currentZoom !== 'number') return;

      const sw = bounds.getSouthWest();
      const ne = bounds.getNorthEast();
      const padDeg = degreesPerPixel(currentZoom) * paddingPx;

      setBbox([
        sw.lng() - padDeg,
        Math.max(-85, sw.lat() - padDeg),
        ne.lng() + padDeg,
        Math.min(85, ne.lat() + padDeg),
      ]);
      setZoom(Math.round(currentZoom));
    };

    updateViewport();
    const idleListener = map.addListener('idle', updateViewport);
    return () => {
      idleListener.remove();
    };
  }, [map, paddingPx]);

  return { bbox, zoom };
}

function useSuperclusterMarkers(
  geojson: FeatureCollection<Point, ClusterFeatureProps>,
  options: SuperclusterOptions<ClusterFeatureProps, ClusterProperties>
) {
  const clusterer = useMemo(() => new Supercluster(options), [options]);
  const [version, bumpVersion] = useReducer((x: number) => x + 1, 0);

  useEffect(() => {
    clusterer.load(geojson.features);
    bumpVersion();
  }, [clusterer, geojson]);

  const { bbox, zoom } = useMapViewport(96);

  const clusters = useMemo(() => {
    if (!clusterer || version === 0) return [];
    return clusterer.getClusters(bbox, zoom);
  }, [clusterer, version, bbox, zoom]);

  const getClusterExpansionZoom = useCallback(
    (clusterId: number) => {
      try {
        return clusterer.getClusterExpansionZoom(clusterId);
      } catch {
        return Math.min(18, zoom + 2);
      }
    },
    [clusterer, zoom]
  );

  return { clusters, zoom, getClusterExpansionZoom };
}

const MapCameraAndQualityController: React.FC<{
  flyToTarget: FlyToTarget | null;
  zoomAction: { type: 'in' | 'out' | 'reset'; ts: number } | null;
  isTilted25D: boolean;
  baseStyle: MapBaseStyleId;
  onImageryQualityChange?: (info: GoogleMapQualityInfo) => void;
}> = ({ flyToTarget, zoomAction, isTilted25D, baseStyle, onImageryQualityChange }) => {
  const map = useMap();
  const lastFlyTs = useRef<number>(0);
  const lastZoomTs = useRef<number>(0);
  const maxZoomServiceRef = useRef<google.maps.MaxZoomService | null>(null);
  const nativeMaxZoomRef = useRef<number>(20);

  const checkNativeImagerySharpness = useCallback(() => {
    if (!map) return;
    const gMapType = resolveGoogleMapType(baseStyle);
    const currentZoom = Math.round(map.getZoom() ?? 13);

    if (gMapType !== 'satellite' && gMapType !== 'hybrid') {
      nativeMaxZoomRef.current = 21;
      map.setOptions({ maxZoom: 21, minZoom: 4 });
      onImageryQualityChange?.({
        currentZoom,
        nativeMaxZoom: 21,
        imageryUnavailable: false,
        mapType: baseStyle,
      });
      return;
    }

    const center = map.getCenter();
    if (!center || !window.google?.maps?.MaxZoomService) return;
    if (!maxZoomServiceRef.current) {
      maxZoomServiceRef.current = new window.google.maps.MaxZoomService();
    }

    maxZoomServiceRef.current.getMaxZoomAtLatLng(center, (result) => {
      if (!map) return;
      if (result.status === window.google.maps.MaxZoomStatus.OK && typeof result.zoom === 'number') {
        // Clamp between 13 and 20 so satellite imagery stays razor sharp and never digitally upscales/blurs
        const safeNativeMax = Math.min(20, Math.max(12, Math.floor(result.zoom)));
        nativeMaxZoomRef.current = safeNativeMax;
        map.setOptions({ maxZoom: safeNativeMax, minZoom: 4 });

        const nowZoom = map.getZoom();
        if (typeof nowZoom === 'number' && nowZoom > safeNativeMax) {
          map.setZoom(safeNativeMax);
        }

        onImageryQualityChange?.({
          currentZoom: Math.min(safeNativeMax, Math.round(nowZoom ?? currentZoom)),
          nativeMaxZoom: safeNativeMax,
          imageryUnavailable: result.zoom < 12,
          mapType: baseStyle,
        });
      } else {
        nativeMaxZoomRef.current = 18;
        map.setOptions({ maxZoom: 18, minZoom: 4 });
        onImageryQualityChange?.({
          currentZoom,
          nativeMaxZoom: 18,
          imageryUnavailable: result.status === window.google.maps.MaxZoomStatus.ERROR,
          mapType: baseStyle,
        });
      }
    });
  }, [map, baseStyle, onImageryQualityChange]);

  useEffect(() => {
    if (!map) return;
    map.setMapTypeId(resolveGoogleMapType(baseStyle));
    // Ensure crisp integer zoom & nadir orientation by default
    const z = map.getZoom();
    if (typeof z === 'number' && Math.abs(z - Math.round(z)) > 0.05) {
      map.setZoom(Math.round(z));
    }
    checkNativeImagerySharpness();
  }, [map, baseStyle, checkNativeImagerySharpness]);

  useEffect(() => {
    if (!map) return;
    map.setTilt(isTilted25D ? 45 : 0);
    if (!isTilted25D) {
      map.setHeading(0);
    }
  }, [map, isTilted25D]);

  useEffect(() => {
    if (!map) return;
    const idleListener = map.addListener('idle', checkNativeImagerySharpness);
    return () => {
      idleListener.remove();
    };
  }, [map, checkNativeImagerySharpness]);

  useEffect(() => {
    if (!map || !flyToTarget || flyToTarget.ts === lastFlyTs.current) return;
    lastFlyTs.current = flyToTarget.ts;
    map.panTo({ lat: flyToTarget.lat, lng: flyToTarget.lng });
    const targetZoom = Math.min(nativeMaxZoomRef.current, Math.max(4, Math.round(flyToTarget.zoom)));
    map.setZoom(targetZoom);
  }, [map, flyToTarget]);

  useEffect(() => {
    if (!map || !zoomAction || zoomAction.ts === lastZoomTs.current) return;
    lastZoomTs.current = zoomAction.ts;
    const current = Math.round(map.getZoom() ?? 13);
    if (zoomAction.type === 'in') {
      map.setZoom(Math.min(nativeMaxZoomRef.current, current + 1));
    } else if (zoomAction.type === 'out') {
      map.setZoom(Math.max(4, current - 1));
    } else if (zoomAction.type === 'reset') {
      map.panTo({ lat: 41.3111, lng: 69.2797 });
      map.setZoom(6);
    }
  }, [map, zoomAction]);

  return null;
};

const GooglePlacesQuickSearch: React.FC<{
  onPlaceChosen: (pin: SearchedPlacePin) => void;
}> = ({ onPlaceChosen }) => {
  const map = useMap();
  const placesLib = useMapsLibrary('places');
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null);
  const [queryText, setQueryText] = useState('');
  const [suggestions, setSuggestions] = useState<google.maps.places.AutocompleteSuggestion[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!placesLib || queryText.trim().length < 2) {
      setSuggestions([]);
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        const { AutocompleteSessionToken, AutocompleteSuggestion } = placesLib;
        if (!sessionTokenRef.current) {
          sessionTokenRef.current = new AutocompleteSessionToken();
        }
        setLoading(true);
        const res = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: queryText.trim(),
          sessionToken: sessionTokenRef.current,
          includedRegionCodes: ['uz'],
        });
        setSuggestions(res?.suggestions?.slice(0, 5) || []);
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('429') ||
          msg.includes('OVER_QUERY_LIMIT')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
        setSuggestions([]);
      } finally {
        setLoading(false);
      }
    }, 320);

    return () => window.clearTimeout(timer);
  }, [placesLib, queryText]);

  const handleSelectSuggestion = useCallback(
    async (suggestion: google.maps.places.AutocompleteSuggestion) => {
      if (!placesLib || !suggestion.placePrediction) return;
      try {
        const place = suggestion.placePrediction.toPlace();
        await place.fetchFields({
          fields: ['location', 'viewport', 'displayName', 'formattedAddress'],
        });
        sessionTokenRef.current = null;
        setSuggestions([]);

        const loc = place.location;
        if (loc && map) {
          const lat = typeof loc.lat === 'function' ? loc.lat() : Number((loc as any).lat);
          const lng = typeof loc.lng === 'function' ? loc.lng() : Number((loc as any).lng);
          if (place.viewport) {
            map.fitBounds(place.viewport);
          } else {
            map.panTo({ lat, lng });
            map.setZoom(16);
          }
          onPlaceChosen({
            lat,
            lng,
            name: place.displayName || suggestion.placePrediction.text.text,
            address: place.formattedAddress || '',
          });
          setQueryText(place.displayName || suggestion.placePrediction.text.text);
        }
      } catch (err: any) {
        const msg = String(err?.message || err || '');
        if (
          msg.includes('RESOURCE_EXHAUSTED') ||
          msg.includes('429') ||
          msg.includes('OVER_QUERY_LIMIT')
        ) {
          window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
        }
      }
    },
    [placesLib, map, onPlaceChosen]
  );

  return (
    <div className="hidden md:block absolute top-3 left-1/2 -translate-x-1/2 z-20 w-72 lg:w-80 pointer-events-auto">
      <div className="relative">
        <Search className="w-3.5 h-3.5 text-emerald-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder="Google Joy / Ko‘cha / Maktab qidirish..."
          className="w-full min-h-[38px] pl-8 pr-8 rounded-xl bg-[#071812]/90 backdrop-blur-md border border-emerald-500/30 text-xs text-white placeholder:text-emerald-100/50 shadow-lg focus:outline-none focus:border-emerald-400"
        />
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2" />
        ) : (
          queryText && (
            <button
              type="button"
              onClick={() => {
                setQueryText('');
                setSuggestions([]);
              }}
              aria-label="Tozalash"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-emerald-200/70 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )
        )}
      </div>

      {suggestions.length > 0 && (
        <ul className="mt-1.5 rounded-xl bg-[#071812] border border-emerald-500/30 shadow-2xl overflow-hidden divide-y divide-emerald-500/15">
          {suggestions.map((s, idx) => (
            <li key={idx}>
              <button
                type="button"
                onClick={() => void handleSelectSuggestion(s)}
                className="w-full px-3 py-2 text-left text-xs hover:bg-emerald-500/15 text-emerald-50 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="truncate">{s.placePrediction?.text.text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

const SchoolAdvancedMarker: React.FC<{
  school: School;
  isSelected: boolean;
  showRankRing: boolean;
  zIndex: number;
  onPreview: (school: School) => void;
}> = React.memo(({ school, isSelected, showRankRing, zIndex, onPreview }) => {
  if (typeof school.lat !== 'number' || typeof school.lng !== 'number') return null;
  const isTop3 = showRankRing && (school.ratingRank || 999) <= 3;

  return (
    <AdvancedMarker
      position={{ lat: school.lat, lng: school.lng }}
      zIndex={isSelected ? 1200 : isTop3 ? 900 + zIndex : zIndex}
      title={`${school.name} · ${school.district}`}
      onClick={() => onPreview(school)}
    >
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full shadow-lg border-2 transition-transform cursor-pointer select-none ${
          isSelected
            ? 'scale-115 bg-emerald-500 border-white text-slate-950 ring-2 ring-emerald-300'
            : isTop3
              ? 'bg-emerald-600 border-amber-300 text-white hover:scale-105'
              : 'bg-teal-700 border-emerald-200 text-white hover:scale-105'
        }`}
      >
        <span className="w-2 h-2 rounded-full bg-white shrink-0" />
        <span className="text-[11px] font-bold leading-none whitespace-nowrap">
          {school.number ? `#${school.number}` : school.name.slice(0, 12)}
        </span>
      </div>
    </AdvancedMarker>
  );
});

const ReportAdvancedMarker: React.FC<{
  report: EcoReport;
  isSelected: boolean;
  zIndex: number;
  onPreview: (report: EcoReport) => void;
}> = React.memo(({ report, isSelected, zIndex, onPreview }) => {
  if (typeof report.lat !== 'number' || typeof report.lng !== 'number') return null;
  const palette = REPORT_COLOR_MAP[report.category] || {
    bg: '#7c3aed',
    border: '#4c1d95',
    label: 'Ekologik muammo',
    badgeClass: '',
  };
  const stateTone = isVerifiedOrResolvedStatus(report.status);

  return (
    <AdvancedMarker
      position={{ lat: report.lat, lng: report.lng }}
      zIndex={isSelected ? 1150 : stateTone === 'verified' ? zIndex + 60 : zIndex}
      title={`${report.title} (${report.district})`}
      onClick={() => onPreview(report)}
    >
      <div className="relative flex flex-col items-center cursor-pointer">
        <Pin
          background={isSelected ? '#10b981' : palette.bg}
          borderColor={
            isSelected
              ? '#ffffff'
              : stateTone === 'resolved'
                ? '#10b981'
                : stateTone === 'verified'
                  ? '#38bdf8'
                  : palette.border
          }
          glyphColor="#ffffff"
          glyphText={stateTone === 'resolved' ? '✓' : undefined}
          scale={isSelected ? 1.22 : 1}
        />
        {stateTone === 'verified' && !isSelected && (
          <span
            className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-sky-400 border-2 border-[#040D0A] shadow"
            title="Tasdiqlangan"
          />
        )}
      </div>
    </AdvancedMarker>
  );
});

const GoogleMapInner: React.FC<Omit<EcoGoogleMapProps, 'apiKey'>> = ({
  baseStyle,
  enabledLayers,
  initialCenter,
  initialZoom,
  isTilted25D,
  schools,
  reports,
  selectedSchoolId,
  selectedReportId,
  clickedCoords,
  userLocation,
  userAccuracyMeters,
  flyToTarget,
  zoomAction,
  onSelectSchool,
  onSelectReport,
  onMapClickCoords,
  onFallbackToLibre,
  onImageryQualityChange,
}) => {
  const status = useApiLoadingStatus();
  const map = useMap();
  const [searchedPlace, setSearchedPlace] = useState<SearchedPlacePin | null>(null);
  const [searchMarkerRef, searchMarker] = useAdvancedMarkerRef();
  const [searchInfoOpen, setSearchInfoOpen] = useState(false);

  // Compact marker preview state before opening full drawer
  const [previewReportId, setPreviewReportId] = useState<string | null>(null);
  const [previewSchoolId, setPreviewSchoolId] = useState<string | null>(null);

  useEffect(() => {
    if (status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      onFallbackToLibre('Google Maps yuklanishida xatolik — zaxira HD xarita ishga tushirildi.');
    }
  }, [status, onFallbackToLibre]);

  // Deduplicate strictly by ID so duplicate markers never appear
  const schoolsById = useMemo(() => {
    const mapById = new Map<string, School>();
    for (const s of schools) {
      if (
        typeof s.lat === 'number' &&
        typeof s.lng === 'number' &&
        Number.isFinite(s.lat) &&
        Number.isFinite(s.lng)
      ) {
        mapById.set(s.id, s);
      }
    }
    return mapById;
  }, [schools]);

  const reportsById = useMemo(() => {
    const mapById = new Map<string, EcoReport>();
    for (const r of reports) {
      if (
        typeof r.lat === 'number' &&
        typeof r.lng === 'number' &&
        Number.isFinite(r.lat) &&
        Number.isFinite(r.lng)
      ) {
        mapById.set(r.id, r);
      }
    }
    return mapById;
  }, [reports]);

  const schoolsWithCoords = useMemo(() => Array.from(schoolsById.values()), [schoolsById]);
  const reportsWithCoords = useMemo(() => Array.from(reportsById.values()), [reportsById]);

  // Keep open InfoWindow synced with real-time updates (and auto-close if report deleted!)
  const previewReport = useMemo(
    () => (previewReportId ? reportsById.get(previewReportId) || null : null),
    [previewReportId, reportsById]
  );
  const previewSchool = useMemo(
    () => (previewSchoolId ? schoolsById.get(previewSchoolId) || null : null),
    [previewSchoolId, schoolsById]
  );

  useEffect(() => {
    if (previewReportId && !previewReport) {
      setPreviewReportId(null);
    }
  }, [previewReportId, previewReport]);

  useEffect(() => {
    if (previewSchoolId && !previewSchool) {
      setPreviewSchoolId(null);
    }
  }, [previewSchoolId, previewSchool]);

  // Build unified GeoJSON points for Supercluster
  const clusterGeoJson = useMemo<FeatureCollection<Point, ClusterFeatureProps>>(() => {
    const features: Feature<Point, ClusterFeatureProps>[] = [];
    if (enabledLayers.schools) {
      for (const s of schoolsWithCoords) {
        features.push({
          type: 'Feature',
          id: `school:${s.id}`,
          geometry: { type: 'Point', coordinates: [s.lng as number, s.lat as number] },
          properties: { kind: 'school', entityId: s.id },
        });
      }
    }
    for (const r of reportsWithCoords) {
      features.push({
        type: 'Feature',
        id: `report:${r.id}`,
        geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
        properties: { kind: 'report', entityId: r.id },
      });
    }
    return { type: 'FeatureCollection', features };
  }, [enabledLayers.schools, schoolsWithCoords, reportsWithCoords]);

  const superclusterOptions = useMemo<
    SuperclusterOptions<ClusterFeatureProps, ClusterProperties>
  >(
    () => ({
      radius: 54,
      maxZoom: 15,
      minPoints: 3,
    }),
    []
  );

  const { clusters, getClusterExpansionZoom } = useSuperclusterMarkers(
    clusterGeoJson,
    superclusterOptions
  );

  const greenSpaceSchools = useMemo(() => {
    if (!enabledLayers.green_spaces) return [];
    return schoolsWithCoords.filter((s) => (s.greenAreaSqm || 0) > 0 || (s.treesPlanted || 0) > 0);
  }, [enabledLayers.green_spaces, schoolsWithCoords]);

  const resolvedGreenReports = useMemo(() => {
    if (!enabledLayers.green_spaces) return [];
    return reportsWithCoords.filter(
      (r) => r.category === 'greening_needed' && String(r.status).toLowerCase() === 'resolved'
    );
  }, [enabledLayers.green_spaces, reportsWithCoords]);

  const treeSchools = useMemo(() => {
    if (!enabledLayers.trees) return [];
    return schoolsWithCoords.filter((s) => (s.treesPlanted || 0) > 0);
  }, [enabledLayers.trees, schoolsWithCoords]);

  const handlePlaceChosen = useCallback((pin: SearchedPlacePin) => {
    setSearchedPlace(pin);
    setSearchInfoOpen(true);
  }, []);

  const handleClusterClick = useCallback(
    (clusterId: number, lat: number, lng: number) => {
      if (!map) return;
      const nextZoom = Math.min(18, getClusterExpansionZoom(clusterId));
      map.panTo({ lat, lng });
      map.setZoom(nextZoom);
    },
    [map, getClusterExpansionZoom]
  );

  const handleOpenReportPreview = useCallback((report: EcoReport) => {
    setPreviewSchoolId(null);
    setPreviewReportId(report.id);
    if (map) {
      map.panTo({ lat: report.lat, lng: report.lng });
    }
  }, [map]);

  const handleOpenSchoolPreview = useCallback((school: School) => {
    setPreviewReportId(null);
    setPreviewSchoolId(school.id);
    if (map && typeof school.lat === 'number' && typeof school.lng === 'number') {
      map.panTo({ lat: school.lat, lng: school.lng });
    }
  }, [map]);

  const safeInitialZoom = Math.max(4, Math.min(20, Math.round(initialZoom)));

  return (
    <div className="relative w-full h-full">
      <GoogleMapView
        mapId="DEMO_MAP_ID"
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        defaultCenter={{ lat: initialCenter[1], lng: initialCenter[0] }}
        defaultZoom={safeInitialZoom}
        mapTypeId={resolveGoogleMapType(baseStyle)}
        gestureHandling="greedy"
        streetViewControl={true}
        scaleControl={true}
        rotateControl={isTilted25D}
        mapTypeControl={false}
        zoomControl={false}
        fullscreenControl={false}
        clickableIcons={true}
        tilt={isTilted25D ? 45 : 0}
        heading={0}
        style={{ width: '100%', height: '100%' }}
        onClick={(ev) => {
          setPreviewReportId(null);
          setPreviewSchoolId(null);
          const latLng = ev.detail?.latLng;
          if (latLng) {
            onMapClickCoords([latLng.lat, latLng.lng]);
          }
        }}
      >
        <MapCameraAndQualityController
          flyToTarget={flyToTarget}
          zoomAction={zoomAction}
          isTilted25D={isTilted25D}
          baseStyle={baseStyle}
          onImageryQualityChange={onImageryQualityChange}
        />

        <GooglePlacesQuickSearch onPlaceChosen={handlePlaceChosen} />

        {/* Green Spaces Circles (Schools + Resolved Greening Spots) */}
        {greenSpaceSchools.map((s) => {
          const radiusMeters = Math.min(130, 45 + Math.sqrt(s.treesPlanted || 20) * 4);
          return (
            <Circle
              key={`green_${s.id}`}
              center={{ lat: s.lat as number, lng: s.lng as number }}
              radius={radiusMeters}
              fillColor="#16a34a"
              fillOpacity={0.22}
              strokeColor="#10b981"
              strokeOpacity={0.7}
              strokeWeight={1.5}
              clickable={false}
            />
          );
        })}

        {resolvedGreenReports.map((r) => (
          <Circle
            key={`green_rep_${r.id}`}
            center={{ lat: r.lat, lng: r.lng }}
            radius={55}
            fillColor="#16a34a"
            fillOpacity={0.24}
            strokeColor="#22c55e"
            strokeOpacity={0.75}
            strokeWeight={1.5}
            clickable={false}
          />
        ))}

        {/* Clustered Schools & Eco Reports */}
        {clusters.map((feature, idx) => {
          const [lng, lat] = feature.geometry.coordinates;
          const props = feature.properties as any;
          if (props?.cluster) {
            const count = Number(props.point_count || 0);
            return (
              <AdvancedMarker
                key={`cluster_${props.cluster_id}`}
                position={{ lat, lng }}
                zIndex={1050 + Math.min(90, count)}
                anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
                title={`${count} ta obyekt — yaqinlashtirish uchun bosing`}
                onClick={() => handleClusterClick(props.cluster_id, lat, lng)}
              >
                <div className="min-w-[38px] h-[38px] px-2 rounded-full bg-[#071812]/95 border-2 border-emerald-400 text-emerald-200 font-mono text-xs font-bold shadow-[0_0_16px_rgba(16,185,129,0.45)] flex items-center justify-center hover:scale-110 transition-transform cursor-pointer select-none">
                  {props.point_count_abbreviated || count}
                </div>
              </AdvancedMarker>
            );
          }

          if (props?.kind === 'school') {
            const school = schoolsById.get(props.entityId);
            if (!school) return null;
            return (
              <SchoolAdvancedMarker
                key={`school_${school.id}`}
                school={school}
                isSelected={selectedSchoolId === school.id || previewSchoolId === school.id}
                showRankRing={Boolean(enabledLayers.school_rankings)}
                zIndex={idx + 20}
                onPreview={handleOpenSchoolPreview}
              />
            );
          }

          if (props?.kind === 'report') {
            const report = reportsById.get(props.entityId);
            if (!report) return null;
            return (
              <ReportAdvancedMarker
                key={`report_${report.id}`}
                report={report}
                isSelected={selectedReportId === report.id || previewReportId === report.id}
                zIndex={idx + 200}
                onPreview={handleOpenReportPreview}
              />
            );
          }

          return null;
        })}

        {/* Planted Tree Markers Overlay */}
        {treeSchools.map((s, idx) => (
          <AdvancedMarker
            key={`tree_${s.id}`}
            position={{ lat: (s.lat as number) + 0.00028, lng: (s.lng as number) + 0.00035 }}
            zIndex={idx + 150}
            title={`${s.name}: ${s.treesPlanted} tup daraxt`}
            onClick={() => handleOpenSchoolPreview(s)}
          >
            <Pin
              background="#16a34a"
              borderColor="#14532d"
              glyphColor="#ffffff"
              glyphText="🌳"
              scale={0.85}
            />
          </AdvancedMarker>
        ))}

        {/* Live GPS User Location Accuracy Circle + Pulsing Marker */}
        {userLocation && (
          <>
            <Circle
              center={{ lat: userLocation[0], lng: userLocation[1] }}
              radius={Math.min(400, Math.max(18, userAccuracyMeters || 35))}
              fillColor="#38bdf8"
              fillOpacity={0.18}
              strokeColor="#0ea5e9"
              strokeOpacity={0.65}
              strokeWeight={1.5}
              clickable={false}
            />
            <AdvancedMarker
              position={{ lat: userLocation[0], lng: userLocation[1] }}
              zIndex={1350}
              anchorPoint={AdvancedMarkerAnchorPoint.CENTER}
              title="Sizning jonli GPS joylashuvingiz"
            >
              <div className="relative flex items-center justify-center">
                <span className="absolute w-7 h-7 rounded-full bg-sky-400/35 animate-ping" />
                <span className="w-4 h-4 rounded-full bg-sky-500 border-2 border-white shadow-lg ring-2 ring-emerald-400/60" />
              </div>
            </AdvancedMarker>
          </>
        )}

        {/* Clicked Map Target Pin */}
        {clickedCoords && (
          <AdvancedMarker
            position={{ lat: clickedCoords[0], lng: clickedCoords[1] }}
            zIndex={1250}
            title="Tanlangan nuqta"
          >
            <Pin background="#10b981" borderColor="#065f46" glyphColor="#ffffff" />
          </AdvancedMarker>
        )}

        {/* Quick Marker Preview InfoWindow for EcoReport */}
        {previewReport && (
          <InfoWindow
            position={{ lat: previewReport.lat, lng: previewReport.lng }}
            pixelOffset={[0, -34]}
            onCloseClick={() => setPreviewReportId(null)}
          >
            <div className="w-[248px] sm:w-[272px] bg-[#071812] text-white rounded-xl overflow-hidden border border-emerald-500/35 shadow-2xl">
              <div className="relative h-28 w-full bg-[#040D0A] overflow-hidden">
                <img
                  src={previewReport.imageUrl || FALLBACK_REPORT_SVG}
                  alt={previewReport.title}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.src = FALLBACK_REPORT_SVG;
                  }}
                  className="w-full h-full object-cover"
                />
                <span
                  className={`absolute top-2 left-2 px-2 py-0.5 rounded-lg text-[10px] font-bold border backdrop-blur-md ${
                    REPORT_COLOR_MAP[previewReport.category]?.badgeClass ||
                    'bg-slate-900/80 text-white border-white/20'
                  }`}
                >
                  {REPORT_COLOR_MAP[previewReport.category]?.label || previewReport.category}
                </span>
                <span
                  className={`absolute bottom-2 right-2 px-2 py-0.5 rounded-lg text-[10px] font-bold border backdrop-blur-md ${
                    STATUS_BADGES[String(previewReport.status).toLowerCase()]?.cls ||
                    'bg-slate-900/80 text-white border-white/20'
                  }`}
                >
                  {STATUS_BADGES[String(previewReport.status).toLowerCase()]?.label ||
                    previewReport.status}
                </span>
              </div>
              <div className="p-2.5 space-y-1.5">
                <h4 className="text-xs font-bold text-white leading-snug line-clamp-2">
                  {previewReport.title}
                </h4>
                <p className="text-[11px] text-emerald-100/80 flex items-start gap-1 leading-tight">
                  <MapPin className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                  <span className="line-clamp-2">
                    {previewReport.address || `${previewReport.district}, ${previewReport.region}`}
                  </span>
                </p>
                <p className="text-[10px] text-emerald-200/65 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-emerald-400 shrink-0" />
                  <span>{formatDateUz(previewReport.createdAt)}</span>
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewReportId(null);
                    onSelectReport(previewReport);
                  }}
                  className="w-full mt-1 min-h-[34px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Batafsil ko‘rish
                </button>
              </div>
            </div>
          </InfoWindow>
        )}

        {/* Quick Marker Preview InfoWindow for School */}
        {previewSchool &&
          typeof previewSchool.lat === 'number' &&
          typeof previewSchool.lng === 'number' && (
            <InfoWindow
              position={{ lat: previewSchool.lat, lng: previewSchool.lng }}
              pixelOffset={[0, -24]}
              onCloseClick={() => setPreviewSchoolId(null)}
            >
              <div className="w-[240px] bg-[#071812] text-white rounded-xl p-3 border border-emerald-500/35 shadow-2xl space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-400">
                    Maktab #{previewSchool.number || 'Eko'}
                  </span>
                  <span className="text-[10px] font-semibold px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Faol
                  </span>
                </div>
                <h4 className="text-xs font-bold text-white leading-snug">
                  {previewSchool.name}
                </h4>
                <p className="text-[11px] text-emerald-100/75 flex items-start gap-1">
                  <MapPin className="w-3 h-3 text-emerald-400 shrink-0 mt-0.5" />
                  <span>
                    {previewSchool.address || `${previewSchool.district}, ${previewSchool.region}`}
                  </span>
                </p>
                <div className="flex items-center gap-3 text-[11px] text-emerald-200 pt-0.5">
                  <span className="flex items-center gap-1 font-semibold">
                    <Trees className="w-3.5 h-3.5 text-emerald-400" />
                    {previewSchool.treesPlanted || 0} daraxt
                  </span>
                  <span className="font-mono font-bold text-amber-300">
                    {previewSchool.totalCoins || 0} EcoCoin
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setPreviewSchoolId(null);
                    onSelectSchool(previewSchool);
                  }}
                  className="w-full mt-1 min-h-[34px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <Eye className="w-3.5 h-3.5" />
                  Batafsil ko‘rish
                </button>
              </div>
            </InfoWindow>
          )}

        {/* Searched Place Marker & InfoWindow */}
        {searchedPlace && (
          <>
            <AdvancedMarker
              ref={searchMarkerRef}
              position={{ lat: searchedPlace.lat, lng: searchedPlace.lng }}
              zIndex={1350}
              onClick={() => setSearchInfoOpen(true)}
            >
              <Pin background="#0ea5e9" borderColor="#0369a1" glyphColor="#ffffff" />
            </AdvancedMarker>
            {searchInfoOpen && searchMarker && (
              <InfoWindow
                anchor={searchMarker}
                onCloseClick={() => setSearchInfoOpen(false)}
              >
                <div className="max-w-[220px] p-1 text-slate-900">
                  <p className="text-xs font-bold">{searchedPlace.name}</p>
                  {searchedPlace.address && (
                    <p className="text-[11px] text-slate-600 mt-0.5">{searchedPlace.address}</p>
                  )}
                </div>
              </InfoWindow>
            )}
          </>
        )}
      </GoogleMapView>

      {status === APILoadingStatus.LOADING && (
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-[#040D0A]/55">
          <div className="px-4 py-2 rounded-xl bg-[#071812] border border-emerald-500/30 shadow-lg flex items-center gap-2 text-xs font-semibold text-emerald-100">
            <Loader2 className="w-4 h-4 text-emerald-400 animate-spin" />
            <span>Google Maps HD yuklanmoqda...</span>
          </div>
        </div>
      )}
    </div>
  );
};

export const EcoGoogleMap: React.FC<EcoGoogleMapProps> = ({ apiKey, ...rest }) => {
  return (
    <APIProvider
      apiKey={apiKey}
      libraries={GMP_LIBRARIES}
      language="uz"
      region="UZ"
    >
      <GoogleMapInner {...rest} />
    </APIProvider>
  );
};

export default EcoGoogleMap;
