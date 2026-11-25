import React, { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import {
  MapPin,
  Layers,
  Search,
  Globe,
  Navigation,
  Plus,
  Minus,
  RotateCcw,
  SlidersHorizontal,
  X,
  ThumbsUp,
  ExternalLink,
  CheckCircle2,
  Sparkles,
  Box,
  Satellite,
  Map as MapIcon,
  Moon,
  ChevronRight,
  Loader2,
  Database,
  ShieldAlert,
  Info,
  RefreshCw,
  WifiOff,
  LocateFixed,
  Power,
  Calendar,
} from 'lucide-react';
import { useEco } from '../context/EcoContext';
import {
  CesiumSessionResponse,
  EcologicalLayerId,
  EcoReport,
  MapBaseStyleId,
  MapLayerConfig,
  MapProviderConfigResponse,
  ProblemCategory,
  School,
} from '../types/eco';
import { UZBEKISTAN_DISTRICTS, UZBEKISTAN_REGIONS } from '../data/mockData';
import {
  buildUzbekistanBoundariesGeoJson,
  getRegionViewport,
  haversineDistanceKm,
} from '../data/uzbekistanGeospatial';
import {
  buildGreenSpacesGeoJson,
  buildReportsGeoJson,
  buildSchoolsGeoJson,
  buildTreesGeoJson,
  clearMapDataCache,
  FALLBACK_MAP_CONFIG,
  fetchMapLayersConfig,
  fetchMapProviderConfig,
  fetchPaginatedMapReports,
  fetchPaginatedMapSchools,
  requestCesiumSession,
  subscribeRealtimeMapReports,
} from '../services/mapDataService';
import { EcoMapLibre2D, FlyToTarget } from '../components/map/EcoMapLibre2D';
import {
  EcoGoogleMap,
  GoogleMapQualityInfo,
  REPORT_COLOR_MAP,
} from '../components/map/EcoGoogleMap';
import { SchoolDigitalTwinPanel } from '../components/map/SchoolDigitalTwinPanel';

const LazyEcoCesium3D = lazy(() => import('../components/map/EcoCesium3D'));

const DEFAULT_LAYER_CONFIGS: MapLayerConfig[] = [
  {
    id: 'schools',
    label: 'Maktablar va klasterlar',
    description: 'Tasdiqlangan va faol maktablar',
    enabledByDefault: true,
    category: 'infrastructure',
  },
  {
    id: 'waste_reports',
    label: 'Chiqindi xabarlari',
    description: 'Chiqindi muammolari',
    enabledByDefault: true,
    category: 'reports',
  },
  {
    id: 'water_reports',
    label: 'Suv muammolari',
    description: 'Suv isrofgarchiligi va ifloslanishi',
    enabledByDefault: true,
    category: 'reports',
  },
  {
    id: 'problem_locations',
    label: 'Ekologik xavf nuqtalari',
    description: 'Havo, daraxt kesish, elektr va kimyoviy xavflar',
    enabledByDefault: true,
    category: 'reports',
  },
  {
    id: 'green_spaces',
    label: 'Yashil hududlar',
    description: 'Maktab bog‘lari va ko‘kalamzor zonalar',
    enabledByDefault: true,
    category: 'ecology',
  },
  {
    id: 'trees',
    label: 'Daraxtlar va ko‘chatlar',
    description: 'Ekilgan daraxtlar nuqtalari',
    enabledByDefault: false,
    category: 'ecology',
  },
  {
    id: 'school_rankings',
    label: 'Maktab reyting halqalari',
    description: 'Top maktablar eko-reytingi',
    enabledByDefault: true,
    category: 'analytics',
  },
  {
    id: 'eco_heatmap',
    label: 'Eko-muammo issiqlik xaritasi',
    description: 'Muammolar zichligi',
    enabledByDefault: false,
    category: 'analytics',
  },
  {
    id: 'district_boundaries',
    label: 'Hududiy chegaralar',
    description: 'Viloyat va tuman ko‘rinishi',
    enabledByDefault: true,
    category: 'infrastructure',
  },
];

const CATEGORY_LABELS: Record<ProblemCategory, string> = {
  waste: 'Chiqindi',
  water: 'Suv muammosi',
  deforestation: 'Daraxt kesish',
  air: 'Havo ifloslanishi',
  greening_needed: 'Ko‘kalamzorlashtirish',
  electrical_hazard: 'Elektr xavfi',
  chemical_hazard: 'Kimyoviy xavf',
};

const STATUS_LABELS: Record<string, { label: string; tone: string }> = {
  pending: { label: 'Kutilmoqda', tone: 'text-amber-700 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-300' },
  pending_review: { label: 'Tekshiruvda', tone: 'text-amber-700 bg-amber-50 dark:bg-amber-950/50 dark:text-amber-300' },
  verified: { label: 'Tasdiqlangan', tone: 'text-sky-700 bg-sky-50 dark:bg-sky-950/50 dark:text-sky-300' },
  approved: { label: 'Tasdiqlangan', tone: 'text-sky-700 bg-sky-50 dark:bg-sky-950/50 dark:text-sky-300' },
  assigned: { label: 'Biriktirilgan', tone: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 dark:text-indigo-300' },
  in_progress: { label: 'Jarayonda', tone: 'text-indigo-700 bg-indigo-50 dark:bg-indigo-950/50 dark:text-indigo-300' },
  escalated: { label: 'Yuqori bosqichda', tone: 'text-rose-700 bg-rose-50 dark:bg-rose-950/50 dark:text-rose-300' },
  resolved: { label: 'Hal etilgan', tone: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-950/50 dark:text-emerald-300' },
  rejected: { label: 'Rad etilgan', tone: 'text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300' },
};

const FALLBACK_REPORT_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220" viewBox="0 0 400 220"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#1e293b"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs><rect width="400" height="220" fill="url(#g)"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#94a3b8" font-family="sans-serif" font-size="14">Rasm mavjud emas</text></svg>`
  );

export const EcoMapPage: React.FC = () => {
  const {
    reports: contextReports,
    schools: contextSchools,
    upvoteReport,
    updateReportStatus,
    setActiveTab,
    user,
    triggerHaptic,
    apiFetch,
    showNotification,
    wsConnected,
    liveSyncVersion,
    isOnline,
    isServerConnected,
  } = useEco();

  // Config & Layer metadata
  const [mapConfig, setMapConfig] = useState<MapProviderConfigResponse>(FALLBACK_MAP_CONFIG);
  const [baseStyle, setBaseStyle] = useState<MapBaseStyleId>('hybrid');
  const [googleMapFailed, setGoogleMapFailed] = useState(false);
  const [isTilted25D, setIsTilted25D] = useState(false);
  const [satelliteNoticeDismissed, setSatelliteNoticeDismissed] = useState(false);
  const [imageryQuality, setImageryQuality] = useState<GoogleMapQualityInfo | null>(null);
  const [layerConfigs, setLayerConfigs] = useState<MapLayerConfig[]>(DEFAULT_LAYER_CONFIGS);
  const [enabledLayers, setEnabledLayers] = useState<Record<EcologicalLayerId, boolean>>({
    schools: true,
    green_spaces: true,
    trees: false,
    waste_reports: true,
    water_reports: true,
    problem_locations: true,
    school_rankings: true,
    eco_heatmap: false,
    district_boundaries: true,
  });

  // Paginated & Real-Time Geospatial Records
  const [remoteSchools, setRemoteSchools] = useState<School[]>([]);
  const [remoteReports, setRemoteReports] = useState<EcoReport[]>([]);
  const [firestoreReports, setFirestoreReports] = useState<EcoReport[]>([]);
  const [firestoreLiveActive, setFirestoreLiveActive] = useState(false);
  const [schoolsPage, setSchoolsPage] = useState(1);
  const [schoolsTotalPages, setSchoolsTotalPages] = useState(1);
  const [reportsPage, setReportsPage] = useState(1);
  const [reportsTotalPages, setReportsTotalPages] = useState(1);
  const [dataSourceLabel, setDataSourceLabel] = useState<'firestore' | 'server' | 'context'>('context');
  const [loadingData, setLoadingData] = useState(true);
  const [syncState, setSyncState] = useState<'live' | 'syncing' | 'offline'>('syncing');
  const [lastSyncAt, setLastSyncAt] = useState<Date | null>(null);
  const [dataError, setDataError] = useState<string | null>(null);
  const [tileNotice, setTileNotice] = useState<string | null>(null);

  // Track reports explicitly deleted in EcoContext so stale snapshots never resurrect ghost markers
  const prevContextReportIdsRef = useRef<Set<string>>(new Set());
  const recentlyDeletedReportIdsRef = useRef<Set<string>>(new Set());

  // Filters & Navigation
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedRegion, setSelectedRegion] = useState('all');
  const [selectedDistrict, setSelectedDistrict] = useState('all');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');
  const [flyToTarget, setFlyToTarget] = useState<FlyToTarget | null>(null);
  const [zoomAction, setZoomAction] = useState<{ type: 'in' | 'out' | 'reset'; ts: number } | null>(null);

  // Interactive Selections, Consent-Based Live GPS & Modals
  const [selectedSchool, setSelectedSchool] = useState<School | null>(null);
  const [selectedReport, setSelectedReport] = useState<EcoReport | null>(null);
  const [clickedCoords, setClickedCoords] = useState<[number, number] | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  const [gpsAccuracyMeters, setGpsAccuracyMeters] = useState<number | null>(null);
  const [gpsConsentModalOpen, setGpsConsentModalOpen] = useState(false);
  const [gpsConsentGranted, setGpsConsentGranted] = useState(false);
  const [gpsWatchEnabled, setGpsWatchEnabled] = useState(false);
  const [gpsStatusMessage, setGpsStatusMessage] = useState<string | null>(null);
  const gpsFirstFixCenteredRef = useRef(false);

  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileSheetTab, setMobileSheetTab] = useState<'layers' | 'filters' | 'results'>('layers');
  const [mapMode, setMapMode] = useState<'2d' | '3d'>('2d');
  const [cesiumSession, setCesiumSession] = useState<CesiumSessionResponse | null>(null);
  const [cesiumModalOpen, setCesiumModalOpen] = useState(false);
  const [requestingPaid3D, setRequestingPaid3D] = useState(false);
  const [desktopSidebarOpen, setDesktopSidebarOpen] = useState(false);

  const isModeratorOrAdmin = user.role === 'super_admin' || user.role === 'moderator';
  const googleMapsApiKey = useMemo(
    () => (import.meta.env.VITE_GOOGLE_MAPS_API_KEY || mapConfig.googleMapsApiKey || '').trim(),
    [mapConfig.googleMapsApiKey]
  );
  const useGoogleMap = mapMode === '2d' && Boolean(googleMapsApiKey) && !googleMapFailed;

  // Load provider config & layer definitions cleanly
  useEffect(() => {
    let active = true;
    (async () => {
      const [cfg, layers] = await Promise.all([
        fetchMapProviderConfig(),
        fetchMapLayersConfig(),
      ]);
      if (!active) return;
      setMapConfig(cfg);
      if (layers.length > 0) {
        setLayerConfigs(layers);
        const nextEnabled = { ...enabledLayers };
        for (const l of layers) {
          nextEnabled[l.id] = Boolean(l.enabledByDefault);
        }
        setEnabledLayers(nextEnabled);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Fetch paginated schools & reports from Unified API / Firestore
  const loadMapPageData = useCallback(
    async (pageSchools = 1, pageReports = 1, append = false, silent = false) => {
      if (!silent) setLoadingData(true);
      setSyncState(navigator.onLine ? 'syncing' : 'offline');
      setDataError(null);
      try {
        const [schoolsRes, reportsRes] = await Promise.all([
          fetchPaginatedMapSchools({
            page: pageSchools,
            limitCount: 80,
            region: selectedRegion,
            district: selectedDistrict,
            search: searchQuery.trim() || undefined,
            apiFetch,
          }),
          fetchPaginatedMapReports({
            page: pageReports,
            limitCount: 100,
            region: selectedRegion,
            district: selectedDistrict,
            category: selectedCategory,
            status: selectedStatus,
            apiFetch,
          }),
        ]);

        setRemoteSchools((prev) => {
          if (!append) return schoolsRes.items;
          const map = new Map(prev.map((s) => [s.id, s]));
          for (const s of schoolsRes.items) map.set(s.id, s);
          return Array.from(map.values());
        });
        setSchoolsPage(schoolsRes.page);
        setSchoolsTotalPages(schoolsRes.totalPages);

        setRemoteReports((prev) => {
          if (!append) return reportsRes.items;
          const map = new Map(prev.map((r) => [r.id, r]));
          for (const r of reportsRes.items) map.set(r.id, r);
          return Array.from(map.values());
        });
        setReportsPage(reportsRes.page);
        setReportsTotalPages(reportsRes.totalPages);

        setDataSourceLabel(
          reportsRes.source === 'server' || schoolsRes.source === 'server'
            ? 'server'
            : reportsRes.source === 'firestore' || schoolsRes.source === 'firestore'
              ? 'firestore'
              : 'context'
        );
        setLastSyncAt(new Date());
        setSyncState(navigator.onLine ? 'live' : 'offline');
      } catch {
        setSyncState(navigator.onLine ? 'live' : 'offline');
        if (!silent) {
          setDataError("Xarita ma'lumotlarini yuklashda muammo yuz berdi. Mahalliy kesh ko'rsatilmoqda.");
        }
      } finally {
        if (!silent) setLoadingData(false);
      }
    },
    [selectedRegion, selectedDistrict, selectedCategory, selectedStatus, searchQuery, apiFetch]
  );

  useEffect(() => {
    loadMapPageData(1, 1, false, false);
  }, [loadMapPageData]);

  // Real-Time Synchronization:
  // 1) WebSocket liveSyncVersion updates from server.ts
  useEffect(() => {
    if (liveSyncVersion === 0) return;
    clearMapDataCache();
    void loadMapPageData(1, 1, false, true);
  }, [liveSyncVersion, loadMapPageData]);

  // 2) Firestore onSnapshot subscription for instant public eco-report additions/status updates
  useEffect(() => {
    const unsub = subscribeRealtimeMapReports(
      (items, meta) => {
        setFirestoreReports(items);
        setFirestoreLiveActive(!meta.fromCache);
        setLastSyncAt(new Date());
      },
      () => {
        setFirestoreLiveActive(false);
      }
    );
    return unsub;
  }, []);

  // 3) Reconnect / online resync so offline drops automatically synchronize
  useEffect(() => {
    const handleOnline = () => {
      setSyncState('syncing');
      clearMapDataCache();
      void loadMapPageData(1, 1, false, true);
    };
    const handleOffline = () => {
      setSyncState('offline');
    };
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [loadMapPageData]);

  // Keep offline indicator accurate with EcoContext connection status
  useEffect(() => {
    if (!isOnline) {
      setSyncState('offline');
    } else if (syncState === 'offline') {
      setSyncState('live');
    }
  }, [isOnline, syncState]);

  // Track immediate deletions in contextReports so deleted markers vanish without delay
  useEffect(() => {
    const nextIds = new Set(contextReports.map((r) => r.id));
    for (const prevId of prevContextReportIdsRef.current) {
      if (!nextIds.has(prevId)) {
        recentlyDeletedReportIdsRef.current.add(prevId);
      }
    }
    for (const id of nextIds) {
      recentlyDeletedReportIdsRef.current.delete(id);
    }
    prevContextReportIdsRef.current = nextIds;
  }, [contextReports]);

  // Merge remote paginated records + live EcoContext + Firestore real-time updates (strictly deduplicated by id)
  const mergedSchools = useMemo(() => {
    const map = new Map<string, School>();
    for (const s of remoteSchools) map.set(s.id, s);
    for (const s of contextSchools) {
      map.set(s.id, { ...(map.get(s.id) || {}), ...s });
    }
    return Array.from(map.values());
  }, [contextSchools, remoteSchools]);

  const mergedReports = useMemo(() => {
    const map = new Map<string, EcoReport>();
    const serverLoadedAll = dataSourceLabel === 'server' && isServerConnected && reportsTotalPages === 1;

    // 1. Server / paginated reports (reflects exact deletions when server is online)
    for (const r of remoteReports) {
      if (!recentlyDeletedReportIdsRef.current.has(r.id)) {
        map.set(r.id, r);
      }
    }

    // 2. Firestore onSnapshot real-time enrichments & offline/cloud additions
    for (const r of firestoreReports) {
      if (recentlyDeletedReportIdsRef.current.has(r.id)) continue;
      if (serverLoadedAll && !map.has(r.id)) {
        // Avoid resurrecting records already deleted on authoritative server
        continue;
      }
      const existing = map.get(r.id);
      if (!existing) {
        map.set(r.id, r);
      } else {
        const fsTime = new Date(r.updatedAt || r.createdAt || 0).getTime();
        const curTime = new Date(existing.updatedAt || existing.createdAt || 0).getTime();
        if (fsTime >= curTime) {
          map.set(r.id, { ...existing, ...r });
        }
      }
    }

    // 3. Authoritative EcoContext reports (user pending submissions + live WS syncBootstrap updates)
    for (const r of contextReports) {
      map.set(r.id, { ...(map.get(r.id) || {}), ...r });
    }

    return Array.from(map.values());
  }, [contextReports, remoteReports, firestoreReports, dataSourceLabel, isServerConnected, reportsTotalPages]);

  // Apply client-side instant filtering over loaded records
  const filteredSchools = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return mergedSchools.filter((s) => {
      if (selectedRegion !== 'all' && s.region !== selectedRegion) return false;
      if (selectedDistrict !== 'all' && s.district !== selectedDistrict) return false;
      if (q) {
        const hay = `${s.name} ${s.number} ${s.region} ${s.district} ${s.address || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [mergedSchools, selectedRegion, selectedDistrict, searchQuery]);

  const filteredReports = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return mergedReports.filter((r) => {
      if (selectedRegion !== 'all' && r.region !== selectedRegion) return false;
      if (selectedDistrict !== 'all' && r.district !== selectedDistrict) return false;
      if (selectedCategory !== 'all' && r.category !== selectedCategory) return false;
      if (selectedStatus !== 'all' && String(r.status).toLowerCase() !== selectedStatus) return false;
      if (q) {
        const hay = `${r.title} ${r.description} ${r.region} ${r.district} ${r.address} ${r.schoolName}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [mergedReports, selectedRegion, selectedDistrict, selectedCategory, selectedStatus, searchQuery]);

  // Visible reports gated by independent ecological report layers
  const layerFilteredReports = useMemo(() => {
    return filteredReports.filter((r) => {
      if (r.category === 'waste') return enabledLayers.waste_reports;
      if (r.category === 'water') return enabledLayers.water_reports;
      return enabledLayers.problem_locations;
    });
  }, [filteredReports, enabledLayers]);

  const schoolsWithCoords = useMemo(
    () =>
      filteredSchools.filter(
        (s) =>
          typeof s.lat === 'number' &&
          typeof s.lng === 'number' &&
          Number.isFinite(s.lat) &&
          Number.isFinite(s.lng)
      ),
    [filteredSchools]
  );

  // Smart city-level integer zoom initial focus (prevents blurry fractional zoom tiles)
  const initialFocus = useMemo(() => {
    const userRegion = user.region || '';
    const schoolInRegion = schoolsWithCoords.find((s) => s.region === userRegion);
    if (schoolInRegion && typeof schoolInRegion.lat === 'number' && typeof schoolInRegion.lng === 'number') {
      return { lat: schoolInRegion.lat, lng: schoolInRegion.lng, zoom: 14 };
    }
    const regionVp = userRegion ? getRegionViewport(userRegion) : null;
    if (regionVp) {
      return { lat: regionVp.lat, lng: regionVp.lng, zoom: Math.max(13, Math.round(regionVp.zoom)) };
    }
    const firstSchool = schoolsWithCoords[0];
    if (firstSchool && typeof firstSchool.lat === 'number' && typeof firstSchool.lng === 'number') {
      return { lat: firstSchool.lat, lng: firstSchool.lng, zoom: 14 };
    }
    return { lat: 41.3111, lng: 69.2797, zoom: 13 };
  }, [schoolsWithCoords, user.region]);

  // Region count summary for district boundaries
  const { schoolsCountByRegion, reportsCountByRegion } = useMemo(() => {
    const sCounts: Record<string, number> = {};
    const rCounts: Record<string, number> = {};
    for (const s of filteredSchools) {
      sCounts[s.region] = (sCounts[s.region] || 0) + 1;
    }
    for (const r of filteredReports) {
      rCounts[r.region] = (rCounts[r.region] || 0) + 1;
    }
    return { schoolsCountByRegion: sCounts, reportsCountByRegion: rCounts };
  }, [filteredSchools, filteredReports]);

  // GeoJSON FeatureCollections
  const boundariesGeoJson = useMemo(
    () => buildUzbekistanBoundariesGeoJson(schoolsCountByRegion, reportsCountByRegion),
    [schoolsCountByRegion, reportsCountByRegion]
  );
  const schoolsGeoJson = useMemo(() => buildSchoolsGeoJson(filteredSchools), [filteredSchools]);
  const reportsGeoJson = useMemo(() => buildReportsGeoJson(layerFilteredReports), [layerFilteredReports]);
  const heatmapGeoJson = useMemo(() => buildReportsGeoJson(filteredReports), [filteredReports]);
  const greenSpacesGeoJson = useMemo(
    () => buildGreenSpacesGeoJson(filteredSchools, filteredReports),
    [filteredSchools, filteredReports]
  );
  const treesGeoJson = useMemo(
    () => buildTreesGeoJson(filteredSchools, filteredReports),
    [filteredSchools, filteredReports]
  );

  const schoolsById = useMemo(
    () => new Map(mergedSchools.map((s) => [s.id, s])),
    [mergedSchools]
  );
  const reportsById = useMemo(
    () => new Map(mergedReports.map((r) => [r.id, r])),
    [mergedReports]
  );

  const activeProvider = useMemo(
    () =>
      mapConfig.providers.find((p) => p.id === baseStyle) ||
      mapConfig.providers[0] ||
      FALLBACK_MAP_CONFIG.providers[0],
    [mapConfig, baseStyle]
  );

  const handleRegionChange = (region: string) => {
    setSelectedRegion(region);
    setSelectedDistrict('all');
    if (region === 'all') {
      setZoomAction({ type: 'reset', ts: Date.now() });
      return;
    }
    const vp = getRegionViewport(region);
    if (vp) {
      setFlyToTarget({ lat: vp.lat, lng: vp.lng, zoom: vp.zoom, ts: Date.now() });
    }
  };

  const handleToggleLayer = (layerId: EcologicalLayerId) => {
    triggerHaptic('light');
    setEnabledLayers((prev) => ({ ...prev, [layerId]: !prev[layerId] }));
  };

  const handlePersistLayerDefault = async (layer: MapLayerConfig) => {
    if (!isModeratorOrAdmin) return;
    const nextDefault = !enabledLayers[layer.id];
    try {
      const res = await apiFetch(`/api/map/layers/${encodeURIComponent(layer.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabledByDefault: nextDefault }),
      });
      if (res.ok) {
        clearMapDataCache();
        setLayerConfigs((prev) =>
          prev.map((l) => (l.id === layer.id ? { ...l, enabledByDefault: nextDefault } : l))
        );
        setEnabledLayers((prev) => ({ ...prev, [layer.id]: nextDefault }));
        showNotification(`"${layer.label}" standart holati saqlandi.`, 'success');
      } else {
        const err = await res.json().catch(() => ({}));
        showNotification(err.error || 'Qatlamni saqlab bo‘lmadi.', 'warning');
      }
    } catch {
      showNotification('Server bilan bog‘lanishda xatolik.', 'warning');
    }
  };

  // Consent-based, battery-efficient live GPS tracking (never tracks or stores without consent)
  useEffect(() => {
    if (!gpsConsentGranted || !gpsWatchEnabled) return;
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setGpsStatusMessage('Brauzeringiz GPS geolokatsiyani qo‘llab-quvvatlamaydi.');
      setGpsWatchEnabled(false);
      return;
    }

    setGpsStatusMessage('GPS joylashuv aniqlanmoqda...');
    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(coords);
        setGpsAccuracyMeters(
          typeof pos.coords.accuracy === 'number' ? Math.round(pos.coords.accuracy) : null
        );
        setGpsStatusMessage(null);
        if (!gpsFirstFixCenteredRef.current) {
          gpsFirstFixCenteredRef.current = true;
          setFlyToTarget({ lat: coords[0], lng: coords[1], zoom: 16, ts: Date.now() });
          triggerHaptic('success');
        }
      },
      (err) => {
        if (err.code === 1) {
          setGpsStatusMessage(
            'GPS ruxsati rad etildi. Joylashuvni ko‘rish uchun brauzer sozlamalaridan ruxsat bering.'
          );
          setGpsWatchEnabled(false);
        } else if (err.code === 2) {
          setGpsStatusMessage('GPS signali vaqtincha topilmadi. Ochiq joyda qayta urinib ko‘ring.');
        } else if (err.code === 3) {
          setGpsStatusMessage('GPS javob vaqti tugadi. Signalni tekshirib qayta urining.');
        } else {
          setGpsStatusMessage('Joylashuvni aniqlab bo‘lmadi.');
        }
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10000,
        timeout: 12000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [gpsConsentGranted, gpsWatchEnabled, triggerHaptic]);

  const handleLocateUser = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      showNotification('Brauzer geolokatsiyani qo‘llab-quvvatlamaydi.', 'warning');
      return;
    }
    if (!gpsConsentGranted) {
      setGpsConsentModalOpen(true);
      return;
    }
    if (!gpsWatchEnabled) {
      gpsFirstFixCenteredRef.current = false;
      setGpsWatchEnabled(true);
      return;
    }
    if (userLocation) {
      setFlyToTarget({ lat: userLocation[0], lng: userLocation[1], zoom: 16, ts: Date.now() });
      triggerHaptic('light');
    } else {
      showNotification('GPS signali kutilmoqda...', 'info');
    }
  };

  const handleGrantGpsConsent = () => {
    setGpsConsentGranted(true);
    setGpsConsentModalOpen(false);
    gpsFirstFixCenteredRef.current = false;
    setGpsWatchEnabled(true);
    triggerHaptic('medium');
  };

  const handleStopGpsTracking = () => {
    setGpsWatchEnabled(false);
    setGpsConsentGranted(false);
    setUserLocation(null);
    setGpsAccuracyMeters(null);
    setGpsStatusMessage(null);
    gpsFirstFixCenteredRef.current = false;
    showNotification('Jonli GPS kuzatuvi o‘chirildi.', 'info');
  };

  const handleSubmitFromClickedCoords = () => {
    if (!clickedCoords) return;
    try {
      sessionStorage.setItem(
        'ecohero_report_coords',
        JSON.stringify({ lat: clickedCoords[0], lng: clickedCoords[1] })
      );
    } catch {
      // Ignore storage errors
    }
    triggerHaptic('medium');
    setActiveTab('report');
  };

  const handleSelectSchoolFromList = (s: School) => {
    setSelectedReport(null);
    setSelectedSchool(s);
    setMobileSheetOpen(false);
    if (typeof s.lat === 'number' && typeof s.lng === 'number') {
      setFlyToTarget({ lat: s.lat, lng: s.lng, zoom: 14.5, ts: Date.now() });
    }
  };

  const handleSelectReportFromList = (r: EcoReport) => {
    setSelectedSchool(null);
    setSelectedReport(r);
    setMobileSheetOpen(false);
    if (typeof r.lat === 'number' && typeof r.lng === 'number') {
      setFlyToTarget({ lat: r.lat, lng: r.lng, zoom: 15, ts: Date.now() });
    }
  };

  const handleSchoolUpdated = (updated: School) => {
    clearMapDataCache();
    setSelectedSchool(updated);
    setRemoteSchools((prev) => {
      const exists = prev.some((s) => s.id === updated.id);
      if (!exists) return [updated, ...prev];
      return prev.map((s) => (s.id === updated.id ? updated : s));
    });
  };

  const handleTileFallback = useCallback((failedStyle: MapBaseStyleId, reason: string) => {
    if (failedStyle !== 'street') {
      setBaseStyle('street');
      setTileNotice(reason);
    }
  }, []);

  const handleGoogleFallback = useCallback((reason: string) => {
    setGoogleMapFailed(true);
    setBaseStyle('satellite');
    setTileNotice(reason);
  }, []);

  const activateCesiumSession = useCallback(
    async (silent = false) => {
      setRequestingPaid3D(true);
      try {
        const session = await requestCesiumSession(true, apiFetch);
        setCesiumSession(session);
        setCesiumModalOpen(false);
        if (!session.freeModeOnly) {
          try {
            localStorage.setItem('ecohero_cesium_ion_consented', 'true');
          } catch {
            // ignore storage errors
          }
        }
        if (!silent) {
          showNotification(
            session.message,
            session.freeModeOnly ? 'info' : 'success'
          );
        }
      } finally {
        setRequestingPaid3D(false);
      }
    },
    [apiFetch, showNotification]
  );

  const handleConfirmPaid3DSession = async () => {
    await activateCesiumSession(false);
  };

  const handleEnter3DMode = useCallback(() => {
    triggerHaptic('medium');
    setMapMode('3d');
    if (mapConfig.cesium.photorealistic3DAvailable && !cesiumSession) {
      let previouslyConsented = false;
      try {
        previouslyConsented =
          localStorage.getItem('ecohero_cesium_ion_consented') === 'true';
      } catch {
        previouslyConsented = false;
      }
      if (previouslyConsented) {
        activateCesiumSession(true);
      } else {
        setCesiumModalOpen(true);
      }
    }
  }, [triggerHaptic, mapConfig.cesium.photorealistic3DAvailable, cesiumSession, activateCesiumSession]);

  const handleFocusSchoolIn3D = useCallback(
    (s: School) => {
      handleEnter3DMode();
      setSelectedReport(null);
      setSelectedSchool(s);
      if (typeof s.lat === 'number' && typeof s.lng === 'number') {
        setFlyToTarget({ lat: s.lat, lng: s.lng, zoom: 16.4, ts: Date.now() });
      }
    },
    [handleEnter3DMode]
  );

  const districtsForRegion =
    selectedRegion !== 'all' ? UZBEKISTAN_DISTRICTS[selectedRegion] || [] : [];

  const distanceToSelectedReport =
    userLocation && selectedReport && typeof selectedReport.lat === 'number' && typeof selectedReport.lng === 'number'
      ? haversineDistanceKm(userLocation[0], userLocation[1], selectedReport.lat, selectedReport.lng)
      : null;

  const distanceToSelectedSchool =
    userLocation && selectedSchool && typeof selectedSchool.lat === 'number' && typeof selectedSchool.lng === 'number'
      ? haversineDistanceKm(userLocation[0], userLocation[1], selectedSchool.lat, selectedSchool.lng)
      : null;

  const activeReportMatch = useMemo(() => {
    if (!selectedReport) return null;
    return reportsById.get(selectedReport.id) || selectedReport;
  }, [selectedReport, reportsById]);

  const renderSidebarBody = (activeSubTab: 'layers' | 'filters' | 'results') => (
    <div className="space-y-4">
      {activeSubTab === 'layers' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Ekologik qatlamlar (GeoJSON)
            </span>
            <span className="text-[11px] font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
              {Object.values(enabledLayers).filter(Boolean).length}/{layerConfigs.length}
            </span>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-800 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden">
            {layerConfigs.map((layer) => {
              const isOn = Boolean(enabledLayers[layer.id]);
              return (
                <div
                  key={layer.id}
                  className="px-3.5 py-2.5 flex items-center justify-between gap-2.5"
                >
                  <button
                    type="button"
                    onClick={() => handleToggleLayer(layer.id)}
                    className="flex-1 min-h-[40px] text-left flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-slate-800 dark:text-slate-100 truncate">
                        {layer.label}
                      </p>
                      <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                        {layer.description}
                      </p>
                    </div>
                    <span
                      className={`w-9 h-5 rounded-full transition-colors p-0.5 shrink-0 flex items-center ${
                        isOn
                          ? 'bg-emerald-600 justify-end'
                          : 'bg-slate-200 dark:bg-slate-700 justify-start'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-white shadow" />
                    </span>
                  </button>
                  {isModeratorOrAdmin && (
                    <button
                      type="button"
                      onClick={() => handlePersistLayerDefault(layer)}
                      title="Standart holat sifatida saqlash"
                      className="text-[10px] font-semibold px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-emerald-500 shrink-0"
                    >
                      Saqlash
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {activeSubTab === 'filters' && (
        <div className="space-y-3">
          <div>
            <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Viloyat / Hudud
            </label>
            <select
              value={selectedRegion}
              onChange={(e) => handleRegionChange(e.target.value)}
              className="mt-1 w-full min-h-[42px] px-3 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
            >
              <option value="all">Barcha hududlar (O‘zbekiston)</option>
              {UZBEKISTAN_REGIONS.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {districtsForRegion.length > 0 && (
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Tuman / Shahar
              </label>
              <select
                value={selectedDistrict}
                onChange={(e) => setSelectedDistrict(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-3 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              >
                <option value="all">Barcha tumanlar</option>
                {districtsForRegion.map((d) => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Kategoriya
              </label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-2.5 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              >
                <option value="all">Barchasi</option>
                {(Object.keys(CATEGORY_LABELS) as ProblemCategory[]).map((cat) => (
                  <option key={cat} value={cat}>
                    {CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Holat
              </label>
              <select
                value={selectedStatus}
                onChange={(e) => setSelectedStatus(e.target.value)}
                className="mt-1 w-full min-h-[42px] px-2.5 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              >
                <option value="all">Barcha holatlar</option>
                <option value="pending">Kutilmoqda</option>
                <option value="verified">Tasdiqlangan</option>
                <option value="in_progress">Jarayonda</option>
                <option value="resolved">Hal etilgan</option>
              </select>
            </div>
          </div>

          {/* Pagination actions */}
          <div className="pt-2 flex flex-col gap-2">
            {(schoolsPage < schoolsTotalPages || reportsPage < reportsTotalPages) && (
              <button
                type="button"
                disabled={loadingData}
                onClick={() =>
                  loadMapPageData(
                    Math.min(schoolsTotalPages, schoolsPage + 1),
                    Math.min(reportsTotalPages, reportsPage + 1),
                    true
                  )
                }
                className="w-full min-h-[42px] rounded-xl bg-slate-900 dark:bg-slate-800 hover:bg-slate-800 dark:hover:bg-slate-700 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
              >
                {loadingData ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Database className="w-4 h-4" />
                )}
                Ko‘proq yozuvlarni yuklash (Sahifa {Math.max(schoolsPage, reportsPage)})
              </button>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'results' && (
        <div className="space-y-3">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                Maktablar ({schoolsWithCoords.length} GPS / {filteredSchools.length} jami)
              </span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {filteredSchools.slice(0, 20).map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => handleSelectSchoolFromList(s)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500 bg-white dark:bg-slate-900 text-left flex items-center justify-between gap-2 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {s.name}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {s.district} ·{' '}
                      {typeof s.lat === 'number' && typeof s.lng === 'number'
                        ? `${s.lat.toFixed(3)}, ${s.lng.toFixed(3)}`
                        : 'GPS kiritilmagan'}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              ))}
              {filteredSchools.length === 0 && (
                <p className="text-xs text-slate-500 py-2">Mos maktab topilmadi.</p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                Eko-arizalar ({layerFilteredReports.length})
              </span>
            </div>
            <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
              {layerFilteredReports.slice(0, 20).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelectReportFromList(r)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl border border-slate-200/80 dark:border-slate-800 hover:border-rose-400 dark:hover:border-rose-500 bg-white dark:bg-slate-900 text-left flex items-center justify-between gap-2 transition-colors"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-slate-900 dark:text-white truncate">
                      {r.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {CATEGORY_LABELS[r.category] || r.category} · {r.district}
                    </p>
                  </div>
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                </button>
              ))}
              {layerFilteredReports.length === 0 && (
                <p className="text-xs text-slate-500 py-2">Mos hisobot topilmadi.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-4.5rem)] md:h-[calc(100vh-2rem)] w-full max-w-7xl mx-auto px-2 sm:px-4 pt-2 pb-2 gap-2">
      {/* Compact Futuristic Header with Real-Time Sync Status */}
      <header className="shrink-0 eco-glass rounded-2xl px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 shadow-lg">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-teal-500 text-slate-950 flex items-center justify-center shrink-0 shadow-md shadow-emerald-500/25">
            <Globe className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-sm sm:text-base font-bold text-slate-900 dark:text-white truncate font-display">
                EcoHero Xarita
              </h1>
              <span className="text-[11px] font-mono tabular-nums text-emerald-700 dark:text-emerald-300 font-semibold">
                {schoolsWithCoords.length} maktab · {layerFilteredReports.length} ariza
              </span>
              {/* Real-Time Map Update Status Indicator */}
              <button
                type="button"
                onClick={() => {
                  clearMapDataCache();
                  void loadMapPageData(1, 1, false, true);
                  triggerHaptic('light');
                }}
                title="Xarita ma’lumotlarini hozir yangilash"
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[10px] font-bold border transition-colors cursor-pointer ${
                  syncState === 'offline'
                    ? 'bg-rose-500/15 text-rose-500 border-rose-500/35'
                    : syncState === 'syncing'
                      ? 'bg-amber-500/15 text-amber-500 border-amber-500/35'
                      : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/35'
                }`}
              >
                {syncState === 'offline' ? (
                  <WifiOff className="w-3 h-3" />
                ) : syncState === 'syncing' ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : (
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-400" />
                  </span>
                )}
                <span>
                  {syncState === 'offline'
                    ? 'Oflayn'
                    : syncState === 'syncing'
                      ? 'Sinxron...'
                      : wsConnected || firestoreLiveActive
                        ? 'Jonli'
                        : 'Tayyor'}
                </span>
                {lastSyncAt && (
                  <span className="hidden sm:inline opacity-75 font-mono">
                    {lastSyncAt.toLocaleTimeString('uz-UZ', {
                      timeZone: 'Asia/Tashkent',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-emerald-100/65 truncate flex items-center gap-1.5">
              <span>
                {mapMode === '2d'
                  ? useGoogleMap
                    ? `Google Maps (${baseStyle === 'hybrid' ? 'Hybrid' : baseStyle === 'satellite' ? 'Satellite' : baseStyle === 'terrain' ? 'Relyef' : 'Normal Map'})`
                    : 'MapLibre HD 2D'
                  : 'CesiumJS 3D'}
              </span>
              {imageryQuality && useGoogleMap && (
                <span className="hidden md:inline text-emerald-500 dark:text-emerald-300 font-mono">
                  · {imageryQuality.currentZoom}x / max {imageryQuality.nativeMaxZoom}x
                </span>
              )}
              {loadingData && <span>· yuklanmoqda...</span>}
            </p>
          </div>
        </div>

        {/* Search & 2D/3D Switcher */}
        <div className="flex items-center gap-2 flex-1 sm:flex-initial justify-end">
          <div className="relative flex-1 sm:w-52 md:w-60">
            <Search className="w-4 h-4 text-emerald-500/70 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Maktab, hudud, ariza..."
              className="w-full min-h-[38px] pl-9 pr-3 rounded-xl text-xs bg-slate-50 dark:bg-[#040D0A]/85 border border-slate-200 dark:border-emerald-500/20 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-400"
            />
          </div>

          <div className="flex items-center rounded-xl bg-slate-100 dark:bg-[#040D0A]/90 border border-slate-200/70 dark:border-emerald-500/20 p-1 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setMapMode('2d');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                mapMode === '2d'
                  ? 'bg-emerald-500 text-slate-950 shadow-sm font-bold'
                  : 'text-slate-600 dark:text-emerald-100/70 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              2D
            </button>
            <button
              type="button"
              onClick={handleEnter3DMode}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer ${
                mapMode === '3d'
                  ? 'bg-indigo-500 text-white shadow-sm font-bold'
                  : 'text-slate-600 dark:text-emerald-100/70 hover:text-indigo-500 dark:hover:text-indigo-300'
              }`}
              title="3D Globus (CesiumJS)"
            >
              <Box className="w-3.5 h-3.5" />
              3D
            </button>
          </div>
        </div>
      </header>

      {/* Instant Ecological Problems Filter Strip (with exact color dots) */}
      <div className="shrink-0 flex items-center gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
        <button
          type="button"
          onClick={() => {
            triggerHaptic('light');
            setSelectedCategory('all');
          }}
          className={`shrink-0 px-3 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer border ${
            selectedCategory === 'all'
              ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm shadow-emerald-500/20'
              : 'eco-glass text-slate-600 dark:text-emerald-100/75 hover:border-emerald-500/40'
          }`}
        >
          Barchasi ({filteredReports.length})
        </button>
        {(Object.keys(CATEGORY_LABELS) as ProblemCategory[]).map((cat) => {
          const catCount = filteredReports.filter((r) => r.category === cat).length;
          const active = selectedCategory === cat;
          const dotColor = REPORT_COLOR_MAP[cat]?.bg || '#7c3aed';
          return (
            <button
              key={cat}
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setSelectedCategory(active ? 'all' : cat);
              }}
              className={`shrink-0 px-2.5 py-1.5 rounded-xl text-[11px] font-bold transition-all cursor-pointer border tabular-nums flex items-center gap-1.5 ${
                active
                  ? 'bg-emerald-500 text-slate-950 border-emerald-400 shadow-sm shadow-emerald-500/20'
                  : 'eco-glass text-slate-600 dark:text-emerald-100/75 hover:border-emerald-500/40'
              }`}
            >
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0 border border-white/50"
                style={{ backgroundColor: dotColor }}
              />
              <span>
                {CATEGORY_LABELS[cat]} ({catCount})
              </span>
            </button>
          );
        })}
      </div>

      {/* Notices: Satellite unavailability, GPS Status, Offline/Sync Alerts */}
      {((!useGoogleMap && (baseStyle === 'satellite' || !googleMapsApiKey) && !satelliteNoticeDismissed) ||
        (useGoogleMap && imageryQuality?.imageryUnavailable && (baseStyle === 'satellite' || baseStyle === 'hybrid')) ||
        tileNotice ||
        dataError ||
        gpsStatusMessage) && (
        <div className="shrink-0 flex flex-col gap-1">
          {useGoogleMap &&
            imageryQuality?.imageryUnavailable &&
            (baseStyle === 'satellite' || baseStyle === 'hybrid') && (
              <div className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700/70 text-[11px] text-amber-900 dark:text-amber-200 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <Satellite className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">
                    Bu hududda yuqori sifatli sun’iy yo‘ldosh tasviri mavjud emas. Normal Xarita tiniqroq ko‘rinadi.
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setBaseStyle('roadmap')}
                  className="px-2.5 py-1 rounded-lg bg-amber-500 text-slate-950 font-bold text-[10px] shrink-0 cursor-pointer"
                >
                  Normal Map
                </button>
              </div>
            )}
          {!useGoogleMap && (baseStyle === 'satellite' || !googleMapsApiKey) && !satelliteNoticeDismissed && (
            <div className="px-3 py-1.5 rounded-xl bg-amber-50 dark:bg-amber-950/50 border border-amber-200 dark:border-amber-800/70 text-[11px] text-amber-800 dark:text-amber-200 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 min-w-0">
                <Satellite className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate">
                  {!googleMapsApiKey
                    ? "Google Maps kaliti ulanmagan (zaxira HD xarita faol)."
                    : `${activeProvider.licenseNote}`}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setSatelliteNoticeDismissed(true)}
                aria-label="Yopish"
                className="text-amber-700 dark:text-amber-300 hover:opacity-75 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {gpsStatusMessage && (
            <div className="px-3 py-1.5 rounded-xl bg-sky-50 dark:bg-sky-950/50 border border-sky-200 dark:border-sky-800 text-[11px] text-sky-800 dark:text-sky-200 flex items-center justify-between gap-2">
              <span className="flex items-center gap-1.5">
                <LocateFixed className="w-3.5 h-3.5 shrink-0" />
                {gpsStatusMessage}
              </span>
              <button
                type="button"
                onClick={() => setGpsStatusMessage(null)}
                className="text-sky-600 dark:text-sky-300 shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
          {tileNotice && (
            <div className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300 flex items-center justify-between gap-2">
              <span>{tileNotice}</span>
              <button
                type="button"
                onClick={() => setTileNotice(null)}
                className="text-rose-500 hover:text-rose-700 shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
          {dataError && (
            <div className="px-3 py-1.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {dataError}
            </div>
          )}
        </div>
      )}

      {/* Main Map Viewport (Primary Screen Area) */}
      <div className="relative flex-1 min-h-[55vh] rounded-2xl overflow-hidden border border-slate-200 dark:border-emerald-500/25 bg-slate-100 dark:bg-[#040D0A] shadow-xl">
        {mapMode === '2d' ? (
          useGoogleMap ? (
            <EcoGoogleMap
              apiKey={googleMapsApiKey}
              baseStyle={baseStyle}
              enabledLayers={enabledLayers}
              initialCenter={[initialFocus.lng, initialFocus.lat]}
              initialZoom={initialFocus.zoom}
              isTilted25D={isTilted25D}
              schools={filteredSchools}
              reports={layerFilteredReports}
              selectedSchoolId={selectedSchool?.id || null}
              selectedReportId={activeReportMatch?.id || null}
              clickedCoords={clickedCoords}
              userLocation={userLocation}
              userAccuracyMeters={gpsAccuracyMeters}
              flyToTarget={flyToTarget}
              zoomAction={zoomAction}
              onSelectSchool={(school) => {
                triggerHaptic('light');
                setSelectedReport(null);
                setSelectedSchool(school);
              }}
              onSelectReport={(report) => {
                triggerHaptic('light');
                setSelectedSchool(null);
                setSelectedReport(report);
              }}
              onMapClickCoords={(coords) => {
                setClickedCoords(coords);
              }}
              onFallbackToLibre={handleGoogleFallback}
              onImageryQualityChange={setImageryQuality}
            />
          ) : (
            <EcoMapLibre2D
              baseStyle={
                baseStyle === 'hybrid' || baseStyle === 'terrain'
                  ? 'satellite'
                  : baseStyle === 'roadmap'
                    ? 'street'
                    : baseStyle
              }
              provider={activeProvider}
              enabledLayers={enabledLayers}
              initialCenter={[initialFocus.lng, initialFocus.lat]}
              initialZoom={initialFocus.zoom}
              isTilted25D={isTilted25D}
              boundariesGeoJson={boundariesGeoJson}
              greenSpacesGeoJson={greenSpacesGeoJson}
              treesGeoJson={treesGeoJson}
              schoolsGeoJson={schoolsGeoJson}
              reportsGeoJson={reportsGeoJson}
              heatmapGeoJson={heatmapGeoJson}
              schoolsById={schoolsById}
              reportsById={reportsById}
              selectedSchoolId={selectedSchool?.id || null}
              selectedReportId={activeReportMatch?.id || null}
              clickedCoords={clickedCoords}
              userLocation={userLocation}
              flyToTarget={flyToTarget}
              zoomAction={zoomAction}
              onSelectSchool={(school) => {
                triggerHaptic('light');
                setSelectedReport(null);
                setSelectedSchool(school);
              }}
              onSelectReport={(report) => {
                triggerHaptic('light');
                setSelectedSchool(null);
                setSelectedReport(report);
              }}
              onMapClickCoords={(coords) => {
                setClickedCoords(coords);
              }}
              onTileFallback={handleTileFallback}
            />
          )
        ) : (
          <Suspense
            fallback={
              <div className="w-full h-full bg-slate-950 flex flex-col items-center justify-center gap-3 text-white">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                <p className="text-sm font-semibold">3D Globus moduli yuklanmoqda...</p>
              </div>
            }
          >
            <LazyEcoCesium3D
              baseStyle={baseStyle}
              provider={activeProvider}
              enabledLayers={enabledLayers}
              initialFocus={initialFocus}
              schools={filteredSchools}
              reports={layerFilteredReports}
              allReportsForHeatmap={filteredReports}
              selectedSchoolId={selectedSchool?.id || null}
              selectedReportId={activeReportMatch?.id || null}
              flyToTarget={flyToTarget}
              zoomAction={zoomAction}
              cesiumSession={cesiumSession}
              photorealistic3DAvailable={mapConfig.cesium.photorealistic3DAvailable}
              onRequestPaid3D={() => setCesiumModalOpen(true)}
              onSelectSchool={(school) => {
                triggerHaptic('light');
                setSelectedReport(null);
                setSelectedSchool(school);
              }}
              onSelectReport={(report) => {
                triggerHaptic('light');
                setSelectedSchool(null);
                setSelectedReport(report);
              }}
              onMapClickCoords={(coords) => {
                setClickedCoords(coords);
              }}
              onTileFallback={handleTileFallback}
              onSwitchTo2D={() => setMapMode('2d')}
            />
          </Suspense>
        )}

        {/* Desktop Left Collapsible Control Panel (Starts compact so map dominates viewport) */}
        <aside className="hidden lg:flex flex-col absolute top-3 left-3 max-h-[calc(100%-4.5rem)] z-20 w-80 pointer-events-none">
          <div className="pointer-events-auto eco-glass rounded-2xl shadow-2xl flex flex-col max-h-full overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-100 dark:border-emerald-500/15 flex items-center justify-between gap-1">
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: 'layers', label: 'Qatlamlar', icon: Layers },
                    { id: 'filters', label: 'Filtrlar', icon: SlidersHorizontal },
                    { id: 'results', label: 'Ro‘yxat', icon: MapPin },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => {
                      if (desktopSidebarOpen && mobileSheetTab === t.id) {
                        setDesktopSidebarOpen(false);
                      } else {
                        setMobileSheetTab(t.id);
                        setDesktopSidebarOpen(true);
                      }
                    }}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer ${
                      desktopSidebarOpen && mobileSheetTab === t.id
                        ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                        : 'text-slate-600 dark:text-emerald-100/75 hover:bg-slate-100 dark:hover:bg-emerald-500/10'
                    }`}
                  >
                    <t.icon className="w-3.5 h-3.5" />
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setDesktopSidebarOpen((v) => !v)}
                className="p-1.5 rounded-lg text-slate-500 dark:text-emerald-200/70 hover:bg-slate-100 dark:hover:bg-emerald-500/10 text-xs font-semibold cursor-pointer"
                title={desktopSidebarOpen ? 'Yig‘ish' : 'Ochish'}
              >
                {desktopSidebarOpen ? '—' : '+'}
              </button>
            </div>
            {desktopSidebarOpen && (
              <div className="p-3.5 overflow-y-auto space-y-4">
                {renderSidebarBody(mobileSheetTab)}
              </div>
            )}
          </div>
        </aside>

        {/* Top-Right Basemap Switcher: Satellite, Hybrid, Normal Map */}
        <div className="absolute top-2.5 right-2.5 sm:top-3 sm:right-3 z-20 flex items-center gap-1 p-1 rounded-2xl eco-glass shadow-xl max-w-[calc(100vw-1.5rem)] overflow-x-auto no-scrollbar">
          {(useGoogleMap
            ? ([
                { id: 'hybrid', label: 'Hybrid', icon: Satellite },
                { id: 'satellite', label: 'Satellite', icon: Globe },
                { id: 'roadmap', label: 'Normal Map', icon: MapIcon },
              ] as const)
            : ([
                { id: 'satellite', label: 'Satellite', icon: Satellite },
                { id: 'street', label: 'Normal Map', icon: MapIcon },
                { id: 'dark', label: 'Tungi', icon: Moon },
              ] as const)
          ).map((styleBtn) => {
            const active =
              baseStyle === styleBtn.id ||
              (useGoogleMap && baseStyle === 'street' && styleBtn.id === 'roadmap');
            return (
              <button
                key={styleBtn.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setTileNotice(null);
                  setBaseStyle(styleBtn.id);
                }}
                className={`min-h-[34px] sm:min-h-[38px] px-2.5 sm:px-3 rounded-xl text-[11px] sm:text-xs font-semibold flex items-center gap-1.5 transition-colors cursor-pointer shrink-0 ${
                  active
                    ? 'bg-emerald-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-700 dark:text-emerald-100/80 hover:bg-slate-100 dark:hover:bg-emerald-500/10'
                }`}
              >
                <styleBtn.icon className="w-3.5 h-3.5 shrink-0" />
                <span>{styleBtn.label}</span>
              </button>
            );
          })}
        </div>

        {/* Right Floating Navigation & Zoom Controls */}
        <div className="absolute right-2.5 sm:right-3 top-14 sm:top-16 z-20 flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => setZoomAction({ type: 'in', ts: Date.now() })}
            aria-label="Yaqinlashtirish"
            title="Zoom +"
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl eco-glass shadow-lg flex items-center justify-center text-slate-700 dark:text-emerald-100 hover:text-emerald-500 cursor-pointer"
          >
            <Plus className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setZoomAction({ type: 'out', ts: Date.now() })}
            aria-label="Uzoqlashtirish"
            title="Zoom -"
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl eco-glass shadow-lg flex items-center justify-center text-slate-700 dark:text-emerald-100 hover:text-emerald-500 cursor-pointer"
          >
            <Minus className="w-5 h-5" />
          </button>
          <button
            type="button"
            onClick={() => setZoomAction({ type: 'reset', ts: Date.now() })}
            aria-label="O‘zbekiston ko‘rinishiga qaytish"
            title="O‘zbekiston ko‘rinishi"
            className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl eco-glass shadow-lg flex items-center justify-center text-slate-700 dark:text-emerald-100 hover:text-emerald-500 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <button
            type="button"
            onClick={handleLocateUser}
            aria-label="Mening joylashuvim"
            title={
              gpsWatchEnabled
                ? 'Jonli GPS faol — markazlashtirish'
                : 'Mening joylashuvim (Jonli GPS)'
            }
            className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl shadow-lg flex items-center justify-center transition-colors cursor-pointer ${
              gpsWatchEnabled && userLocation
                ? 'bg-sky-500 text-white border border-sky-300 ring-2 ring-sky-400/40'
                : 'eco-glass text-sky-600 dark:text-emerald-400 hover:bg-sky-50 dark:hover:bg-emerald-500/15'
            }`}
          >
            <Navigation className="w-4 h-4" />
          </button>
          {gpsWatchEnabled && (
            <button
              type="button"
              onClick={handleStopGpsTracking}
              aria-label="GPS kuzatuvini o‘chirish"
              title="GPS kuzatuvini to‘xtatish"
              className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl eco-glass border border-rose-500/40 shadow-lg flex items-center justify-center text-rose-500 hover:bg-rose-500/15 cursor-pointer"
            >
              <Power className="w-4 h-4" />
            </button>
          )}
          {mapMode === '2d' && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setIsTilted25D((v) => !v);
              }}
              aria-label="2.5D shahar binolari burchagi"
              title="2.5D burchak"
              className={`w-10 h-10 sm:w-11 sm:h-11 rounded-xl border shadow-lg flex items-center justify-center text-[11px] font-bold transition-colors cursor-pointer ${
                isTilted25D
                  ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                  : 'eco-glass text-slate-700 dark:text-emerald-100 hover:text-emerald-400'
              }`}
            >
              2.5D
            </button>
          )}
        </div>

        {/* Map Legend Pill (Exact Category Color Key — Compact Bottom-Left) */}
        {mapMode === '2d' && (
          <div className="hidden md:flex absolute bottom-3 left-3 z-10 flex-wrap items-center gap-2.5 px-3 py-1.5 rounded-xl eco-glass text-[11px] font-medium text-slate-700 dark:text-emerald-100 shadow-lg">
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-teal-600 border border-white/60 inline-block" /> Maktab
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444] inline-block" /> Chiqindi
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#0284c7] inline-block" /> Suv
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#92400e] inline-block" /> Daraxt kesish
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#7c3aed] inline-block" /> Ifloslanish
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-full bg-[#16a34a] inline-block" /> Yashil zona
            </span>
          </div>
        )}

        {/* Clicked Target Coordinate Action Bar */}
        {clickedCoords && !selectedSchool && !activeReportMatch && (
          <div className="absolute bottom-20 lg:bottom-4 left-1/2 -translate-x-1/2 z-20 w-[92%] max-w-md eco-glass border-emerald-400/50 rounded-2xl p-3 shadow-2xl flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
                Tanlangan nuqta
              </p>
              <p className="text-xs font-mono tabular-nums text-slate-900 dark:text-white truncate">
                {clickedCoords[0].toFixed(5)}, {clickedCoords[1].toFixed(5)}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleSubmitFromClickedCoords}
                className="min-h-[40px] px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer"
              >
                Shu nuqtadan ariza
              </button>
              <button
                type="button"
                onClick={() => setClickedCoords(null)}
                aria-label="Nuqtani olib tashlash"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* Mobile Bottom Ergonomic Dock */}
        <div className="lg:hidden absolute bottom-3 left-3 right-3 z-20 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              setMobileSheetTab('layers');
              setMobileSheetOpen(true);
            }}
            className="flex-1 min-h-[46px] px-3 rounded-2xl eco-glass shadow-xl text-xs font-semibold text-slate-900 dark:text-white flex items-center justify-center gap-2 cursor-pointer"
          >
            <Layers className="w-4 h-4 text-emerald-400" />
            Qatlamlar
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileSheetTab('filters');
              setMobileSheetOpen(true);
            }}
            className="flex-1 min-h-[46px] px-3 rounded-2xl eco-glass shadow-xl text-xs font-semibold text-slate-900 dark:text-white flex items-center justify-center gap-2 cursor-pointer"
          >
            <SlidersHorizontal className="w-4 h-4 text-sky-400" />
            Filtrlar
          </button>
          <button
            type="button"
            onClick={() => {
              setMobileSheetTab('results');
              setMobileSheetOpen(true);
            }}
            className="flex-1 min-h-[46px] px-3 rounded-2xl eco-glass shadow-xl text-xs font-semibold text-slate-900 dark:text-white flex items-center justify-center gap-2 cursor-pointer"
          >
            <MapPin className="w-4 h-4 text-rose-400" />
            Ro‘yxat
          </button>
        </div>
      </div>

      {/* Mobile Bottom Sheet Drawer */}
      {mobileSheetOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-end"
          onClick={() => setMobileSheetOpen(false)}
        >
          <div
            className="w-full max-h-[82vh] bg-white dark:bg-[#071812] rounded-t-3xl border-t border-slate-200 dark:border-emerald-500/25 flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="pt-2.5 pb-1 flex justify-center">
              <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
            </div>
            <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
              <div className="flex items-center gap-1">
                {(
                  [
                    { id: 'layers', label: 'Qatlamlar' },
                    { id: 'filters', label: 'Filtrlar' },
                    { id: 'results', label: 'Ro‘yxat' },
                  ] as const
                ).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setMobileSheetTab(t.id)}
                    className={`min-h-[38px] px-3 rounded-xl text-xs font-semibold ${
                      mobileSheetTab === t.id
                        ? 'bg-emerald-600 text-white'
                        : 'text-slate-600 dark:text-slate-300'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
              <button
                type="button"
                onClick={() => setMobileSheetOpen(false)}
                aria-label="Yopish"
                className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto">{renderSidebarBody(mobileSheetTab)}</div>
          </div>
        </div>
      )}

      {/* School Digital Twin Drawer */}
      {selectedSchool && (
        <SchoolDigitalTwinPanel
          school={selectedSchool}
          userRole={user.role}
          userUid={user.uid}
          userSchoolId={user.schoolId}
          distanceKm={distanceToSelectedSchool}
          apiFetch={apiFetch}
          onClose={() => setSelectedSchool(null)}
          onOpenPhotoLightbox={(url) => setLightboxUrl(url)}
          onFocusIn3D={handleFocusSchoolIn3D}
          onSchoolUpdated={handleSchoolUpdated}
          onNotify={showNotification}
        />
      )}

      {/* Eco-Report Detail Drawer */}
      {activeReportMatch && (
        <div
          className="fixed inset-x-0 bottom-0 md:inset-y-4 md:right-4 md:left-auto z-40 w-full md:w-[420px] max-h-[85vh] md:max-h-[calc(100vh-2rem)] bg-white dark:bg-[#071812] border-t md:border border-slate-200 dark:border-emerald-500/25 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
          role="dialog"
          aria-label={activeReportMatch.title}
        >
          <div className="md:hidden pt-2.5 pb-1 flex justify-center shrink-0">
            <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
          </div>

          <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 shrink-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-bold uppercase tracking-wider text-rose-600 dark:text-rose-400">
                  {CATEGORY_LABELS[activeReportMatch.category] || activeReportMatch.category}
                </span>
                <span className="text-slate-300 dark:text-slate-700">·</span>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                    STATUS_LABELS[String(activeReportMatch.status).toLowerCase()]?.tone ||
                    'bg-slate-100 text-slate-700'
                  }`}
                >
                  {STATUS_LABELS[String(activeReportMatch.status).toLowerCase()]?.label ||
                    activeReportMatch.status}
                </span>
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white mt-1 leading-snug">
                {activeReportMatch.title}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                {activeReportMatch.region} · {activeReportMatch.district}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setSelectedReport(null)}
              aria-label="Yopish"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
            {activeReportMatch.imageUrl && (
              <button
                type="button"
                onClick={() => setLightboxUrl(activeReportMatch.imageUrl)}
                className="w-full h-44 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 block"
              >
                <img
                  src={activeReportMatch.imageUrl}
                  alt={activeReportMatch.title}
                  referrerPolicy="no-referrer"
                  onError={(e) => {
                    e.currentTarget.src = FALLBACK_REPORT_SVG;
                  }}
                  className="w-full h-full object-cover"
                />
              </button>
            )}

            <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">
              {activeReportMatch.description}
            </p>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-1.5 text-xs">
              <p className="font-semibold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                {activeReportMatch.address || activeReportMatch.district}
              </p>
              <p className="font-mono tabular-nums text-[11px] text-slate-500 dark:text-slate-400">
                {activeReportMatch.lat.toFixed(6)}, {activeReportMatch.lng.toFixed(6)}
                {distanceToSelectedReport !== null &&
                  ` · ${distanceToSelectedReport.toFixed(1)} km uzoqlikda`}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>
                  {activeReportMatch.createdAt
                    ? new Date(activeReportMatch.createdAt).toLocaleString('uz-UZ', {
                        timeZone: 'Asia/Tashkent',
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })
                    : 'Sana ko‘rsatilmagan'}
                </span>
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400">
                Yuboruvchi: {activeReportMatch.reporterName} · Maktab: {activeReportMatch.schoolName}
              </p>
            </div>

            {activeReportMatch.aiAnalysis && (
              <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/50 space-y-1.5">
                <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-700 dark:text-indigo-400 flex items-center gap-1.5">
                  <Sparkles className="w-3.5 h-3.5" />
                  Tavsiya etilgan chora
                </p>
                <p className="text-xs text-slate-800 dark:text-slate-200">
                  {activeReportMatch.aiAnalysis.recommendedAction}
                </p>
              </div>
            )}

            {isModeratorOrAdmin && (
              <div className="pt-1 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => updateReportStatus(activeReportMatch.id, 'verified')}
                  className="flex-1 min-h-[40px] rounded-xl bg-sky-600 hover:bg-sky-700 text-white text-xs font-semibold"
                >
                  Tasdiqlash
                </button>
                <button
                  type="button"
                  onClick={() => updateReportStatus(activeReportMatch.id, 'resolved')}
                  className="flex-1 min-h-[40px] rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold flex items-center justify-center gap-1"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Hal etildi
                </button>
              </div>
            )}
          </div>

          <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                upvoteReport(activeReportMatch.id);
              }}
              className={`min-h-[44px] px-4 rounded-xl border text-xs font-semibold flex items-center gap-2 transition-colors ${
                activeReportMatch.hasUpvoted
                  ? 'bg-emerald-50 border-emerald-500 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300'
                  : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:border-emerald-500'
              }`}
            >
              <ThumbsUp className="w-4 h-4" />
              <span className="font-mono tabular-nums">{activeReportMatch.upvotes || 0}</span>
            </button>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${activeReportMatch.lat},${activeReportMatch.lng}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 min-h-[44px] rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Yo‘nalish olish
            </a>
          </div>
        </div>
      )}

      {/* Explicit Consent Modal for Live GPS Location */}
      {gpsConsentModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setGpsConsentModalOpen(false)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-[#071812] border border-slate-200 dark:border-emerald-500/30 rounded-3xl p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-sky-500/15 text-sky-400 border border-sky-500/30 flex items-center justify-center">
                  <LocateFixed className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                    Jonli GPS joylashuviga ruxsat
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-emerald-200/70">
                    Foydalanuvchi nazorati va maxfiylik
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGpsConsentModalOpen(false)}
                className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs leading-relaxed text-slate-600 dark:text-emerald-100/80">
              Roziligingiz bilan GPS joylashuvingiz xaritada sizning nuqtangiz va yaqin ekologik muammolargacha bo‘lgan masofani ko‘rsatish uchun ishlatiladi. Joylashuv ma’lumotlari roziligingizsiz serverda saqlanmaydi va istalgan vaqt o‘chirilishi mumkin.
            </p>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setGpsConsentModalOpen(false)}
                className="flex-1 min-h-[42px] rounded-xl border border-slate-200 dark:border-emerald-500/25 text-xs font-semibold text-slate-700 dark:text-emerald-100 cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleGrantGpsConsent}
                className="flex-1 min-h-[42px] rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold cursor-pointer"
              >
                Ruxsat berish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Paid-Provider 3D Tiles & Cesium Ion Disclosure Modal */}
      {cesiumModalOpen && (
        <div
          className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setCesiumModalOpen(false)}
        >
          <div
            className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                  <Box className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900 dark:text-white">
                    Fotorealistik 3D Tiles & Terrain
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Pullik provayder nazorati (Cesium Ion / 3D Tiles)
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCesiumModalOpen(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-3.5 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800/60 text-xs text-amber-800 dark:text-amber-200 space-y-1.5">
              <p className="font-semibold flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                Xarajat va kvota ogohlantirishi
              </p>
              <p>{mapConfig.cesium.paidWarning}</p>
            </div>

            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 space-y-1.5">
              <p className="font-semibold flex items-center gap-1.5">
                <Info className="w-4 h-4 text-indigo-500 shrink-0" />
                Server holati
              </p>
              <ul className="space-y-1 text-[11px] text-slate-600 dark:text-slate-400 list-disc pl-4">
                <li>
                  Bepul 3D Yer shari, 3D maktab maketlari va GLB/glTF modellar{' '}
                  <strong className="text-emerald-600 dark:text-emerald-400">hozir faol</strong>.
                </li>
                <li>
                  CESIUM_ION_TOKEN:{' '}
                  <strong className="font-mono">
                    {mapConfig.cesium.hasIonToken ? 'Sozlangan' : 'Kiritilmagan'}
                  </strong>
                </li>
                <li>
                  CESIUM_3D_TILES_URL:{' '}
                  <strong className="font-mono">
                    {mapConfig.cesium.hasCustom3DTiles ? 'Sozlangan' : 'Kiritilmagan'}
                  </strong>
                </li>
                <li>
                  Kunlik kvota limiti:{' '}
                  <strong className="font-mono">
                    {mapConfig.cesium.dailyQuotaLimit || 50} ta sessiya/kun
                  </strong>
                </li>
              </ul>
            </div>

            <div className="flex flex-col gap-2">
              {mapConfig.cesium.photorealistic3DAvailable && (
                <button
                  type="button"
                  disabled={requestingPaid3D}
                  onClick={handleConfirmPaid3DSession}
                  className="w-full min-h-[44px] rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-60 text-white text-xs font-semibold"
                >
                  {requestingPaid3D
                    ? 'Tekshirilmoqda...'
                    : 'Pullik 3D Tiles / Terrain ni tasdiqlab yoqish'}
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setCesiumSession({
                    freeModeOnly: true,
                    message: 'Bepul 3D rejim faol.',
                  });
                  setCesiumModalOpen(false);
                }}
                className="w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-emerald-600 text-white text-xs font-semibold"
              >
                Bepul 3D rejimda davom etish
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Working Lightbox Modal */}
      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setLightboxUrl(null)}
        >
          <button
            type="button"
            onClick={() => setLightboxUrl(null)}
            aria-label="Yopish"
            className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={lightboxUrl}
            alt="Katta ko‘rinish"
            referrerPolicy="no-referrer"
            onError={(e) => {
              e.currentTarget.src = FALLBACK_REPORT_SVG;
            }}
            className="max-w-full max-h-[88vh] rounded-2xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
};

export default EcoMapPage;
