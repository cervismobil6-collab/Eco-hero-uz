import type { FeatureCollection } from 'geojson';

export interface RegionViewport {
  region: string;
  lat: number;
  lng: number;
  zoom: number;
  code: string;
  boundsPolygon: [number, number][];
}

// Reference administrative centroids and simplified bounding polygons for Uzbekistan regions.
// Used for map flyTo navigation and visual district/region grouping (non-cadastral).
export const UZBEKISTAN_REGION_VIEWPORTS: RegionViewport[] = [
  {
    region: 'Toshkent shahri',
    lat: 41.3111,
    lng: 69.2797,
    zoom: 11,
    code: 'TAS',
    boundsPolygon: [
      [69.12, 41.18],
      [69.42, 41.18],
      [69.42, 41.40],
      [69.12, 41.40],
      [69.12, 41.18],
    ],
  },
  {
    region: 'Toshkent viloyati',
    lat: 41.05,
    lng: 69.35,
    zoom: 8.5,
    code: 'TOV',
    boundsPolygon: [
      [68.60, 40.55],
      [70.35, 40.55],
      [70.35, 41.80],
      [68.60, 41.80],
      [68.60, 40.55],
    ],
  },
  {
    region: 'Samarqand viloyati',
    lat: 39.6542,
    lng: 66.9597,
    zoom: 9.2,
    code: 'SAM',
    boundsPolygon: [
      [65.50, 39.15],
      [67.65, 39.15],
      [67.65, 40.25],
      [65.50, 40.25],
      [65.50, 39.15],
    ],
  },
  {
    region: "Farg'ona viloyati",
    lat: 40.3864,
    lng: 71.7864,
    zoom: 9.5,
    code: 'FER',
    boundsPolygon: [
      [70.35, 39.95],
      [72.25, 39.95],
      [72.25, 40.75],
      [70.35, 40.75],
      [70.35, 39.95],
    ],
  },
  {
    region: 'Andijon viloyati',
    lat: 40.7821,
    lng: 72.3442,
    zoom: 9.8,
    code: 'AND',
    boundsPolygon: [
      [71.65, 40.42],
      [73.15, 40.42],
      [73.15, 41.05],
      [71.65, 41.05],
      [71.65, 40.42],
    ],
  },
  {
    region: 'Namangan viloyati',
    lat: 40.9983,
    lng: 71.6726,
    zoom: 9.4,
    code: 'NAM',
    boundsPolygon: [
      [70.45, 40.65],
      [72.20, 40.65],
      [72.20, 41.55],
      [70.45, 41.55],
      [70.45, 40.65],
    ],
  },
  {
    region: 'Buxoro viloyati',
    lat: 39.7747,
    lng: 64.4286,
    zoom: 8.6,
    code: 'BUX',
    boundsPolygon: [
      [62.20, 39.10],
      [65.25, 39.10],
      [65.25, 40.95],
      [62.20, 40.95],
      [62.20, 39.10],
    ],
  },
  {
    region: 'Xorazm viloyati',
    lat: 41.5503,
    lng: 60.6314,
    zoom: 9.3,
    code: 'XOR',
    boundsPolygon: [
      [59.85, 40.95],
      [61.60, 40.95],
      [61.60, 42.05],
      [59.85, 42.05],
      [59.85, 40.95],
    ],
  },
  {
    region: 'Qashqadaryo viloyati',
    lat: 38.86,
    lng: 65.79,
    zoom: 8.7,
    code: 'QAS',
    boundsPolygon: [
      [64.15, 38.10],
      [67.45, 38.10],
      [67.45, 39.55],
      [64.15, 39.55],
      [64.15, 38.10],
    ],
  },
  {
    region: 'Surxondaryo viloyati',
    lat: 37.9,
    lng: 67.45,
    zoom: 8.7,
    code: 'SUR',
    boundsPolygon: [
      [66.45, 37.15],
      [68.45, 37.15],
      [68.45, 39.05],
      [66.45, 39.05],
      [66.45, 37.15],
    ],
  },
  {
    region: 'Navoiy viloyati',
    lat: 40.85,
    lng: 64.5,
    zoom: 7.7,
    code: 'NAV',
    boundsPolygon: [
      [61.50, 39.75],
      [66.20, 39.75],
      [66.20, 43.15],
      [61.50, 43.15],
      [61.50, 39.75],
    ],
  },
  {
    region: 'Jizzax viloyati',
    lat: 40.1158,
    lng: 67.8422,
    zoom: 8.8,
    code: 'JIZ',
    boundsPolygon: [
      [66.40, 39.45],
      [68.75, 39.45],
      [68.75, 41.15],
      [66.40, 41.15],
      [66.40, 39.45],
    ],
  },
  {
    region: 'Sirdaryo viloyati',
    lat: 40.4915,
    lng: 68.7811,
    zoom: 9.4,
    code: 'SIR',
    boundsPolygon: [
      [68.05, 40.05],
      [69.30, 40.05],
      [69.30, 41.05],
      [68.05, 41.05],
      [68.05, 40.05],
    ],
  },
  {
    region: "Qoraqalpog'iston Respublikasi",
    lat: 42.4531,
    lng: 59.6103,
    zoom: 7.3,
    code: 'QOR',
    boundsPolygon: [
      [56.00, 40.90],
      [62.20, 40.90],
      [62.20, 45.60],
      [56.00, 45.60],
      [56.00, 40.90],
    ],
  },
];

export function getRegionViewport(region: string): RegionViewport | null {
  return UZBEKISTAN_REGION_VIEWPORTS.find((r) => r.region === region) || null;
}

export function buildUzbekistanBoundariesGeoJson(
  schoolsCountByRegion: Record<string, number>,
  reportsCountByRegion: Record<string, number>
): FeatureCollection {
  return {
    type: 'FeatureCollection',
    features: UZBEKISTAN_REGION_VIEWPORTS.map((reg) => ({
      type: 'Feature',
      id: reg.code,
      geometry: {
        type: 'Polygon',
        coordinates: [reg.boundsPolygon],
      },
      properties: {
        code: reg.code,
        name: reg.region,
        centerLat: reg.lat,
        centerLng: reg.lng,
        schoolsCount: schoolsCountByRegion[reg.region] || 0,
        reportsCount: reportsCountByRegion[reg.region] || 0,
      },
    })),
  };
}

export function haversineDistanceKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}
