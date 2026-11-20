import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  APIProvider,
  APILoadingStatus,
  AdvancedMarker,
  Circle,
  InfoWindow,
  Map as GoogleMapView,
  Pin,
  useAdvancedMarkerRef,
  useApiLoadingStatus,
  useMap,
  useMapsLibrary,
} from '@vis.gl/react-google-maps';
import { Search, Loader2, MapPin, X } from 'lucide-react';
import {
  EcologicalLayerId,
  EcoReport,
  MapBaseStyleId,
  School,
} from '../../types/eco';
import type { FlyToTarget } from './EcoMapLibre2D';

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
  flyToTarget: FlyToTarget | null;
  zoomAction: { type: 'in' | 'out' | 'reset'; ts: number } | null;
  onSelectSchool: (school: School) => void;
  onSelectReport: (report: EcoReport) => void;
  onMapClickCoords: (coords: [number, number]) => void;
  onFallbackToLibre: (reason: string) => void;
}

const REPORT_COLOR_MAP: Record<string, { bg: string; border: string }> = {
  waste: { bg: '#e11d48', border: '#9f1239' },
  water: { bg: '#0284c7', border: '#075985' },
  deforestation: { bg: '#d97706', border: '#92400e' },
  air: { bg: '#7c3aed', border: '#5b21b6' },
  greening_needed: { bg: '#16a34a', border: '#166534' },
  electrical_hazard: { bg: '#ea580c', border: '#9a3412' },
  chemical_hazard: { bg: '#dc2626', border: '#7f1d1d' },
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

interface SearchedPlacePin {
  lat: number;
  lng: number;
  name: string;
  address: string;
}

const MapCameraSync: React.FC<{
  flyToTarget: FlyToTarget | null;
  zoomAction: { type: 'in' | 'out' | 'reset'; ts: number } | null;
  isTilted25D: boolean;
  baseStyle: MapBaseStyleId;
}> = ({ flyToTarget, zoomAction, isTilted25D, baseStyle }) => {
  const map = useMap();
  const lastFlyTs = useRef<number>(0);
  const lastZoomTs = useRef<number>(0);

  useEffect(() => {
    if (!map) return;
    map.setMapTypeId(resolveGoogleMapType(baseStyle));
  }, [map, baseStyle]);

  useEffect(() => {
    if (!map) return;
    map.setTilt(isTilted25D ? 45 : 0);
  }, [map, isTilted25D]);

  useEffect(() => {
    if (!map || !flyToTarget || flyToTarget.ts === lastFlyTs.current) return;
    lastFlyTs.current = flyToTarget.ts;
    map.panTo({ lat: flyToTarget.lat, lng: flyToTarget.lng });
    map.setZoom(flyToTarget.zoom);
  }, [map, flyToTarget]);

  useEffect(() => {
    if (!map || !zoomAction || zoomAction.ts === lastZoomTs.current) return;
    lastZoomTs.current = zoomAction.ts;
    if (zoomAction.type === 'in') {
      map.setZoom(Math.min(21, (map.getZoom() ?? 13) + 1));
    } else if (zoomAction.type === 'out') {
      map.setZoom(Math.max(3, (map.getZoom() ?? 13) - 1));
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
    }, 260);

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
        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
        <input
          type="text"
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder="Google Joy / Ko‘cha / Maktab qidirish..."
          className="w-full min-h-[38px] pl-8 pr-8 rounded-xl bg-white/95 dark:bg-slate-900/95 backdrop-blur-md border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 shadow-lg focus:outline-none focus:border-emerald-500"
        />
        {loading ? (
          <Loader2 className="w-3.5 h-3.5 text-emerald-500 animate-spin absolute right-2.5 top-1/2 -translate-y-1/2" />
        ) : (
          queryText && (
            <button
              type="button"
              onClick={() => {
                setQueryText('');
                setSuggestions([]);
              }}
              aria-label="Tozalash"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )
        )}
      </div>

      {suggestions.length > 0 && (
        <ul className="mt-1.5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
          {suggestions.map((s, idx) => (
            <li key={idx}>
              <button
                type="button"
                onClick={() => void handleSelectSuggestion(s)}
                className="w-full px-3 py-2 text-left text-xs hover:bg-emerald-50 dark:hover:bg-slate-800 text-slate-800 dark:text-slate-100 flex items-center gap-2 transition-colors cursor-pointer"
              >
                <MapPin className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
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
  onSelect: (school: School) => void;
}> = ({ school, isSelected, showRankRing, zIndex, onSelect }) => {
  if (typeof school.lat !== 'number' || typeof school.lng !== 'number') return null;

  const isTop3 = showRankRing && (school.ratingRank || 999) <= 3;

  return (
    <AdvancedMarker
      position={{ lat: school.lat, lng: school.lng }}
      zIndex={isSelected ? 1200 : isTop3 ? 900 + zIndex : zIndex}
      title={`${school.name} · ${school.district}`}
      onClick={() => onSelect(school)}
    >
      <div
        className={`flex items-center gap-1.5 px-2 py-1 rounded-full shadow-lg border-2 transition-transform cursor-pointer select-none ${
          isSelected
            ? 'scale-115 bg-indigo-700 border-white text-white ring-2 ring-indigo-300'
            : isTop3
              ? 'bg-emerald-600 border-amber-300 text-white hover:scale-105'
              : 'bg-indigo-600 border-white text-white hover:scale-105'
        }`}
      >
        <span className="w-2 h-2 rounded-full bg-white shrink-0" />
        <span className="text-[11px] font-bold leading-none whitespace-nowrap">
          {school.number ? `#${school.number}` : school.name.slice(0, 12)}
        </span>
      </div>
    </AdvancedMarker>
  );
};

const ReportAdvancedMarker: React.FC<{
  report: EcoReport;
  isSelected: boolean;
  zIndex: number;
  onSelect: (report: EcoReport) => void;
}> = ({ report, isSelected, zIndex, onSelect }) => {
  if (typeof report.lat !== 'number' || typeof report.lng !== 'number') return null;
  const palette = REPORT_COLOR_MAP[report.category] || { bg: '#d97706', border: '#92400e' };

  return (
    <AdvancedMarker
      position={{ lat: report.lat, lng: report.lng }}
      zIndex={isSelected ? 1150 : zIndex}
      title={`${report.title} (${report.district})`}
      onClick={() => onSelect(report)}
    >
      <Pin
        background={isSelected ? '#10b981' : palette.bg}
        borderColor={isSelected ? '#ffffff' : palette.border}
        glyphColor="#ffffff"
        scale={isSelected ? 1.2 : 0.95}
      />
    </AdvancedMarker>
  );
};

const GoogleMapInner: React.FC<
  Omit<EcoGoogleMapProps, 'apiKey'>
> = ({
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
  flyToTarget,
  zoomAction,
  onSelectSchool,
  onSelectReport,
  onMapClickCoords,
  onFallbackToLibre,
}) => {
  const status = useApiLoadingStatus();
  const [searchedPlace, setSearchedPlace] = useState<SearchedPlacePin | null>(null);
  const [searchMarkerRef, searchMarker] = useAdvancedMarkerRef();
  const [searchInfoOpen, setSearchInfoOpen] = useState(false);

  useEffect(() => {
    if (status === APILoadingStatus.AUTH_FAILURE || status === APILoadingStatus.FAILED) {
      window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      onFallbackToLibre('Google Maps yuklanishida xatolik — zaxira HD xarita ishga tushirildi.');
    }
  }, [status, onFallbackToLibre]);

  const schoolsWithCoords = useMemo(
    () =>
      schools
        .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number' && Number.isFinite(s.lat) && Number.isFinite(s.lng))
        .sort((a, b) => (b.lat || 0) - (a.lat || 0)),
    [schools]
  );

  const reportsWithCoords = useMemo(
    () =>
      reports
        .filter((r) => typeof r.lat === 'number' && typeof r.lng === 'number' && Number.isFinite(r.lat) && Number.isFinite(r.lng))
        .sort((a, b) => b.lat - a.lat),
    [reports]
  );

  const greenSpaceSchools = useMemo(() => {
    if (!enabledLayers.green_spaces) return [];
    return schoolsWithCoords.filter((s) => (s.greenAreaSqm || 0) > 0 || (s.treesPlanted || 0) > 0);
  }, [enabledLayers.green_spaces, schoolsWithCoords]);

  const treeSchools = useMemo(() => {
    if (!enabledLayers.trees) return [];
    return schoolsWithCoords.filter((s) => (s.treesPlanted || 0) > 0);
  }, [enabledLayers.trees, schoolsWithCoords]);

  const handlePlaceChosen = useCallback((pin: SearchedPlacePin) => {
    setSearchedPlace(pin);
    setSearchInfoOpen(true);
  }, []);

  return (
    <div className="relative w-full h-full">
      <GoogleMapView
        mapId="DEMO_MAP_ID"
        internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
        defaultCenter={{ lat: initialCenter[1], lng: initialCenter[0] }}
        defaultZoom={initialZoom}
        mapTypeId={resolveGoogleMapType(baseStyle)}
        gestureHandling="greedy"
        streetViewControl={true}
        scaleControl={true}
        rotateControl={true}
        mapTypeControl={false}
        zoomControl={false}
        fullscreenControl={false}
        clickableIcons={true}
        tilt={isTilted25D ? 45 : 0}
        style={{ width: '100%', height: '100%' }}
        onClick={(ev) => {
          const latLng = ev.detail?.latLng;
          if (latLng) {
            onMapClickCoords([latLng.lat, latLng.lng]);
          }
        }}
      >
        <MapCameraSync
          flyToTarget={flyToTarget}
          zoomAction={zoomAction}
          isTilted25D={isTilted25D}
          baseStyle={baseStyle}
        />

        <GooglePlacesQuickSearch onPlaceChosen={handlePlaceChosen} />

        {/* Green Spaces Circles */}
        {greenSpaceSchools.map((s) => {
          const radiusMeters = Math.min(130, 45 + Math.sqrt(s.treesPlanted || 20) * 4);
          return (
            <Circle
              key={`green_${s.id}`}
              center={{ lat: s.lat as number, lng: s.lng as number }}
              radius={radiusMeters}
              fillColor="#10b981"
              fillOpacity={0.22}
              strokeColor="#059669"
              strokeOpacity={0.65}
              strokeWeight={1.5}
              clickable={false}
            />
          );
        })}

        {/* School Markers */}
        {enabledLayers.schools &&
          schoolsWithCoords.map((s, idx) => (
            <SchoolAdvancedMarker
              key={s.id}
              school={s}
              isSelected={selectedSchoolId === s.id}
              showRankRing={Boolean(enabledLayers.school_rankings)}
              zIndex={idx + 10}
              onSelect={onSelectSchool}
            />
          ))}

        {/* Tree Count Markers */}
        {treeSchools.map((s, idx) => (
          <AdvancedMarker
            key={`tree_${s.id}`}
            position={{ lat: (s.lat as number) + 0.00028, lng: (s.lng as number) + 0.00035 }}
            zIndex={idx + 150}
            title={`${s.name}: ${s.treesPlanted} tup daraxt`}
            onClick={() => onSelectSchool(s)}
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

        {/* Report Markers */}
        {reportsWithCoords.map((r, idx) => (
          <ReportAdvancedMarker
            key={r.id}
            report={r}
            isSelected={selectedReportId === r.id}
            zIndex={idx + 200}
            onSelect={onSelectReport}
          />
        ))}

        {/* User GPS Location Pin */}
        {userLocation && (
          <AdvancedMarker
            position={{ lat: userLocation[0], lng: userLocation[1] }}
            zIndex={1300}
            title="Sizning joylashuvingiz"
          >
            <div className="w-4 h-4 rounded-full bg-sky-500 border-2 border-white shadow-lg ring-4 ring-sky-400/40" />
          </AdvancedMarker>
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
                <div className="max-w-[220px] p-0.5 text-slate-900">
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
        <div className="absolute inset-0 pointer-events-none flex items-center justify-center bg-slate-900/20 backdrop-blur-[1px]">
          <div className="px-4 py-2 rounded-xl bg-white/95 dark:bg-slate-900/95 shadow-lg flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200">
            <Loader2 className="w-4 h-4 text-emerald-600 animate-spin" />
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
      libraries={['marker', 'places']}
      language="uz"
      region="UZ"
    >
      <GoogleMapInner {...rest} />
    </APIProvider>
  );
};

export default EcoGoogleMap;
