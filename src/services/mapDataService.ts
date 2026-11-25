import type { Feature, FeatureCollection } from 'geojson';
import {
  collection,
  getDocs,
  limit,
  onSnapshot,
  query,
  where,
  DocumentData,
  QueryDocumentSnapshot,
} from 'firebase/firestore';
import {
  db,
  auth,
  handleFirestoreError,
  OperationType,
} from './firebase';
import {
  CesiumSessionResponse,
  EcoReport,
  MapLayerConfig,
  MapProviderConfigResponse,
  School,
} from '../types/eco';
import { apiUrl, parseApiJson } from '../utils/api';

const CACHE_TTL_MS = 45_000;

interface CachedEntry<T> {
  timestamp: number;
  data: T;
}

const memoryCache = new Map<string, CachedEntry<any>>();

function getCached<T>(key: string): T | null {
  const entry = memoryCache.get(key);
  if (!entry) return null;
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    memoryCache.delete(key);
    return null;
  }
  return entry.data as T;
}

function setCached<T>(key: string, data: T): void {
  memoryCache.set(key, { timestamp: Date.now(), data });
}

export function clearMapDataCache(): void {
  memoryCache.clear();
}

const PUBLIC_MAP_REPORT_STATUSES = [
  'APPROVED',
  'ASSIGNED',
  'IN_PROGRESS',
  'ESCALATED',
  'RESOLVED',
  'verified',
  'in_progress',
  'resolved',
];

function normalizeTimestampValue(val: any): string {
  if (!val) return '';
  if (typeof val === 'string') return val;
  if (typeof val?.toDate === 'function') {
    try {
      return val.toDate().toISOString();
    } catch {
      return '';
    }
  }
  if (typeof val?.seconds === 'number') {
    return new Date(val.seconds * 1000).toISOString();
  }
  return '';
}

function normalizeFirestoreReport(id: string, raw: any): EcoReport {
  return {
    ...(raw || {}),
    id,
    createdAt: normalizeTimestampValue(raw?.createdAt) || new Date().toISOString(),
    updatedAt: normalizeTimestampValue(raw?.updatedAt) || undefined,
    resolvedAt: normalizeTimestampValue(raw?.resolvedAt) || undefined,
  } as EcoReport;
}

export const FALLBACK_MAP_CONFIG: MapProviderConfigResponse = {
  defaultBaseStyle: 'satellite',
  providers: [
    {
      id: 'satellite',
      name: 'Sun’iy yo‘ldosh + Yo‘l nomlari (Esri)',
      tileUrls: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
      attribution:
        'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
      maxZoom: 19,
      isPaid: false,
      isLiveImagery: false,
      licenseNote: "Esri World Imagery + World Boundaries & Transportation (kalitsiz ochiq qatlam).",
    },
    {
      id: 'street',
      name: 'Normal Map (OpenStreetMap)',
      tileUrls: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
      isPaid: false,
      isLiveImagery: false,
      licenseNote: 'OpenStreetMap bepul ochiq ko‘cha xaritasi.',
    },
    {
      id: 'dark',
      name: 'Tungi Eko-Xarita (OpenStreetMap)',
      tileUrls: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      attribution: '© OpenStreetMap contributors',
      maxZoom: 19,
      isPaid: false,
      isLiveImagery: false,
      licenseNote: 'OpenStreetMap tungi rejim (CSS filtr bilan).',
    },
  ],
  cesium: {
    enabled: true,
    hasIonToken: false,
    hasCustom3DTiles: false,
    photorealistic3DAvailable: false,
    dailyQuotaLimit: 50,
    paidWarning:
      'Photorealistic 3D Tiles yoki Cesium Ion pullik API kvotasini sarflaydi. Tasdiqlamasangiz bepul 3D globus va GLB maket ishlaydi.',
  },
  limits: {
    maxPageSize: 100,
    cacheTtlMs: CACHE_TTL_MS,
  },
};

export async function fetchMapProviderConfig(): Promise<MapProviderConfigResponse> {
  const cached = getCached<MapProviderConfigResponse>('map_config');
  if (cached) return cached;

  const bakedGoogleKey = String(import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '').trim();

  try {
    const res = await fetch(apiUrl('/api/map/config'));
    if (res.ok) {
      const data = await parseApiJson<MapProviderConfigResponse>(res);
      if (!data.googleMapsApiKey && bakedGoogleKey) {
        data.googleMapsApiKey = bakedGoogleKey;
      }
      setCached('map_config', data);
      return data;
    }
  } catch {
    // Fallback cleanly below
  }

  if (bakedGoogleKey) {
    return {
      ...FALLBACK_MAP_CONFIG,
      defaultBaseStyle: 'hybrid',
      googleMapsApiKey: bakedGoogleKey,
    };
  }
  return FALLBACK_MAP_CONFIG;
}

export async function fetchMapLayersConfig(): Promise<MapLayerConfig[]> {
  const cached = getCached<MapLayerConfig[]>('map_layers');
  if (cached) return cached;

  // Attempt Firestore map_layers first if available
  try {
    if (db && auth?.currentUser) {
      const snap = await getDocs(query(collection(db, 'map_layers'), limit(25)));
      if (!snap.empty) {
        const fsLayers = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as MapLayerConfig[];
        setCached('map_layers', fsLayers);
        return fsLayers;
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'map_layers');
  }

  try {
    const res = await fetch(apiUrl('/api/map/layers'));
    if (res.ok) {
      const data = await parseApiJson<{ layers?: MapLayerConfig[] }>(res);
      if (Array.isArray(data.layers)) {
        setCached('map_layers', data.layers);
        return data.layers;
      }
    }
  } catch {
    // fallback handled by caller defaults
  }
  return [];
}

export interface PaginatedResult<T> {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
  source: 'firestore' | 'server' | 'context';
  lastFirestoreDoc?: QueryDocumentSnapshot<DocumentData> | null;
}

export async function fetchPaginatedMapSchools(params: {
  page?: number;
  limitCount?: number;
  region?: string;
  district?: string;
  search?: string;
  lastDoc?: QueryDocumentSnapshot<DocumentData> | null;
  apiFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}): Promise<PaginatedResult<School>> {
  const page = params.page || 1;
  const limitCount = params.limitCount || 50;
  const cacheKey = `schools_${page}_${limitCount}_${params.region || 'all'}_${params.district || 'all'}_${params.search || ''}`;
  const cached = getCached<PaginatedResult<School>>(cacheKey);
  if (cached) return cached;

  // 1. Try Firestore schools query obeying firestore.rules
  try {
    if (db && auth?.currentUser) {
      const q = query(
        collection(db, 'schools'),
        where('status', 'in', ['active', 'verified']),
        limit(limitCount)
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        const fsSchools = snap.docs
          .map((d) => ({
            ...(d.data() as any),
            id: d.id,
            createdAt: normalizeTimestampValue((d.data() as any)?.createdAt) || new Date().toISOString(),
          }))
          .sort((a, b) => Number(b.totalCoins || 0) - Number(a.totalCoins || 0)) as School[];
        const result: PaginatedResult<School> = {
          items: fsSchools,
          total: fsSchools.length,
          page,
          totalPages: 1,
          source: 'firestore',
          lastFirestoreDoc: snap.docs[snap.docs.length - 1] || null,
        };
        setCached(cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'schools');
  }

  // 2. Fallback/Primary unified server endpoint (RBAC scoped, no fabricated coordinates)
  try {
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limitCount),
    });
    if (params.region && params.region !== 'all') qs.set('region', params.region);
    if (params.district && params.district !== 'all') qs.set('district', params.district);
    if (params.search) qs.set('search', params.search);

    const fetcher = params.apiFetch || fetch;
    const res = await fetcher(apiUrl(`/api/map/schools?${qs.toString()}`));
    if (res.ok) {
      const data = await parseApiJson<{ items?: School[]; total?: number; page?: number; totalPages?: number }>(res);
      const result: PaginatedResult<School> = {
        items: Array.isArray(data.items) ? data.items : [],
        total: Number(data.total || 0),
        page: Number(data.page || page),
        totalPages: Number(data.totalPages || 1),
        source: 'server',
      };
      setCached(cacheKey, result);
      return result;
    }
  } catch {
    // Caller falls back to EcoContext
  }

  return { items: [], total: 0, page: 1, totalPages: 1, source: 'context' };
}

export async function fetchPaginatedMapReports(params: {
  page?: number;
  limitCount?: number;
  region?: string;
  district?: string;
  category?: string;
  status?: string;
  lastDoc?: QueryDocumentSnapshot<DocumentData> | null;
  apiFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
}): Promise<PaginatedResult<EcoReport>> {
  const page = params.page || 1;
  const limitCount = params.limitCount || 60;
  const cacheKey = `reports_${page}_${limitCount}_${params.region || 'all'}_${params.district || 'all'}_${params.category || 'all'}_${params.status || 'all'}`;
  const cached = getCached<PaginatedResult<EcoReport>>(cacheKey);
  if (cached) return cached;

  // 1. Try Unified Server endpoint first so scoped pending + live reports stay authoritative;
  //    then fall back to Firestore public reports collection if server unreachable
  try {
    const qs = new URLSearchParams({
      page: String(page),
      limit: String(limitCount),
    });
    if (params.region && params.region !== 'all') qs.set('region', params.region);
    if (params.district && params.district !== 'all') qs.set('district', params.district);
    if (params.category && params.category !== 'all') qs.set('category', params.category);
    if (params.status && params.status !== 'all') qs.set('status', params.status);

    const fetcher = params.apiFetch || fetch;
    const res = await fetcher(apiUrl(`/api/map/reports?${qs.toString()}`));
    if (res.ok) {
      const data = await parseApiJson<{ items?: EcoReport[]; total?: number; page?: number; totalPages?: number }>(res);
      const result: PaginatedResult<EcoReport> = {
        items: Array.isArray(data.items) ? data.items : [],
        total: Number(data.total || 0),
        page: Number(data.page || page),
        totalPages: Number(data.totalPages || 1),
        source: 'server',
      };
      setCached(cacheKey, result);
      return result;
    }
  } catch {
    // Fallback to Firestore below
  }

  // 2. Firestore public reports query (strictly obeying firestore.rules)
  try {
    if (db) {
      const snap = await getDocs(
        query(
          collection(db, 'reports'),
          where('status', 'in', PUBLIC_MAP_REPORT_STATUSES),
          limit(limitCount)
        )
      );
      if (!snap.empty) {
        const fsReports = snap.docs
          .map((d) => normalizeFirestoreReport(d.id, d.data()))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        const result: PaginatedResult<EcoReport> = {
          items: fsReports,
          total: fsReports.length,
          page,
          totalPages: 1,
          source: 'firestore',
          lastFirestoreDoc: snap.docs[snap.docs.length - 1] || null,
        };
        setCached(cacheKey, result);
        return result;
      }
    }
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'reports');
  }

  return { items: [], total: 0, page: 1, totalPages: 1, source: 'context' };
}

export function subscribeRealtimeMapReports(
  onUpdate: (reports: EcoReport[], meta: { fromCache: boolean; hasPendingWrites: boolean }) => void,
  onError?: (err: unknown) => void
): () => void {
  if (!db) return () => {};
  try {
    const q = query(
      collection(db, 'reports'),
      where('status', 'in', PUBLIC_MAP_REPORT_STATUSES),
      limit(120)
    );
    return onSnapshot(
      q,
      { includeMetadataChanges: true },
      (snapshot) => {
        const items = snapshot.docs
          .map((d) => normalizeFirestoreReport(d.id, d.data()))
          .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        onUpdate(items, {
          fromCache: snapshot.metadata.fromCache,
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
        });
      },
      (err) => {
        handleFirestoreError(err, OperationType.LIST, 'reports');
        onError?.(err);
      }
    );
  } catch (err) {
    onError?.(err);
    return () => {};
  }
}

export function buildSchoolsGeoJson(schools: School[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: schools
      .filter((s) => typeof s.lat === 'number' && typeof s.lng === 'number' && Number.isFinite(s.lat) && Number.isFinite(s.lng))
      .map((s) => ({
        type: 'Feature',
        id: s.id,
        geometry: {
          type: 'Point',
          coordinates: [s.lng as number, s.lat as number],
        },
        properties: {
          id: s.id,
          name: s.name,
          number: s.number,
          region: s.region,
          district: s.district,
          ratingRank: s.ratingRank || 999,
          treesPlanted: s.treesPlanted || 0,
          totalCoins: s.totalCoins || 0,
          environmentalScore: s.environmentalScore || Math.round((s.treesPlanted || 0) * 5 + (s.cleanupsCompleted || 0) * 20),
          hasGlb: Boolean(s.glbModelUrl),
        },
      })),
  };
}

export function buildReportsGeoJson(reports: EcoReport[]): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: reports
      .filter((r) => typeof r.lat === 'number' && typeof r.lng === 'number' && Number.isFinite(r.lat) && Number.isFinite(r.lng))
      .map((r) => ({
        type: 'Feature',
        id: r.id,
        geometry: {
          type: 'Point',
          coordinates: [r.lng, r.lat],
        },
        properties: {
          id: r.id,
          title: r.title,
          category: r.category,
          severity: r.severity,
          status: String(r.status || 'pending').toLowerCase(),
          isHazardous: Boolean(r.isHazardous || r.category === 'electrical_hazard' || r.category === 'chemical_hazard'),
          weight: r.severity === 'high' ? 1.0 : r.severity === 'medium' ? 0.65 : 0.35,
          upvotes: r.upvotes || 0,
        },
      })),
  };
}

export function buildGreenSpacesGeoJson(schools: School[], reports: EcoReport[]): FeatureCollection {
  const features: Feature[] = [];

  for (const s of schools) {
    if (typeof s.lat !== 'number' || typeof s.lng !== 'number') continue;
    if ((s.greenAreaSqm || 0) <= 0 && (s.treesPlanted || 0) <= 0) continue;
    // Approximate campus green footprint radius in degrees (~40m–110m based on tree count)
    const radiusDeg = Math.min(0.0012, 0.0004 + Math.sqrt(s.treesPlanted || 20) * 0.00003);
    const dx = radiusDeg * 1.3;
    const dy = radiusDeg;
    features.push({
      type: 'Feature',
      id: `green_${s.id}`,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [s.lng - dx, s.lat - dy],
            [s.lng + dx, s.lat - dy],
            [s.lng + dx, s.lat + dy],
            [s.lng - dx, s.lat + dy],
            [s.lng - dx, s.lat - dy],
          ],
        ],
      },
      properties: {
        schoolId: s.id,
        name: s.name,
        greenAreaSqm: s.greenAreaSqm || Math.round((s.treesPlanted || 0) * 12),
        treesPlanted: s.treesPlanted || 0,
      },
    });
  }

  for (const r of reports) {
    if (r.category !== 'greening_needed' || String(r.status).toLowerCase() !== 'resolved') continue;
    if (typeof r.lat !== 'number' || typeof r.lng !== 'number') continue;
    const d = 0.00045;
    features.push({
      type: 'Feature',
      id: `green_rep_${r.id}`,
      geometry: {
        type: 'Polygon',
        coordinates: [
          [
            [r.lng - d, r.lat - d],
            [r.lng + d, r.lat - d],
            [r.lng + d, r.lat + d],
            [r.lng - d, r.lat + d],
            [r.lng - d, r.lat - d],
          ],
        ],
      },
      properties: {
        reportId: r.id,
        name: r.title,
        greenAreaSqm: 250,
      },
    });
  }

  return { type: 'FeatureCollection', features };
}

export function buildTreesGeoJson(schools: School[], reports: EcoReport[]): FeatureCollection {
  const features: Feature[] = [];

  for (const s of schools) {
    if (typeof s.lat !== 'number' || typeof s.lng !== 'number' || (s.treesPlanted || 0) <= 0) continue;
    features.push({
      type: 'Feature',
      id: `tree_sch_${s.id}`,
      geometry: { type: 'Point', coordinates: [s.lng + 0.0004, s.lat + 0.0003] },
      properties: {
        label: `${s.treesPlanted} tup`,
        treesCount: s.treesPlanted,
        sourceName: s.name,
      },
    });
  }

  for (const r of reports) {
    if ((r.category === 'greening_needed' || r.category === 'deforestation') && typeof r.lat === 'number' && typeof r.lng === 'number') {
      features.push({
        type: 'Feature',
        id: `tree_rep_${r.id}`,
        geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
        properties: {
          label: r.category === 'deforestation' ? 'Daraxt xavfi' : "Ko'chat",
          treesCount: 1,
          sourceName: r.title,
        },
      });
    }
  }

  return { type: 'FeatureCollection', features };
}

export async function requestCesiumSession(
  consentToPaidProvider: boolean,
  apiFetch?: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
): Promise<CesiumSessionResponse> {
  try {
    const fetcher = apiFetch || fetch;
    const res = await fetcher(apiUrl('/api/map/cesium-session'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ consentToPaidProvider }),
    });
    const data = await parseApiJson<CesiumSessionResponse & { error?: string }>(res);
    if (!res.ok) {
      return {
        freeModeOnly: true,
        message: data.error || `3D Tiles sessiya xatosi (${res.status}) — bepul 3D rejim ishlamoqda.`,
      };
    }
    return data;
  } catch {
    return {
      freeModeOnly: true,
      message: 'Bepul 3D rejim faol (serverga ulanib bo‘lmadi).',
    };
  }
}

