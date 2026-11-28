import {
  LayoutDashboard,
  Users,
  Map,
  Building2,
  ShieldAlert,
  Trophy,
  Megaphone,
  BarChart3,
  Sparkles,
} from 'lucide-react';
import { RegionalSectionId } from '../../../types/eco';

export interface RegionalMenuItemConfig {
  id: RegionalSectionId;
  label: string;
  shortLabel: string;
  icon: typeof LayoutDashboard;
}

export const REGIONAL_MENU_ITEMS: RegionalMenuItemConfig[] = [
  { id: 'regional_overview', label: 'Yagona Dashboard', shortLabel: 'Dashboard', icon: LayoutDashboard },
  { id: 'regional_coordinators', label: 'Tuman Koordinatorlari', shortLabel: 'Koordinatorlar', icon: Users },
  { id: 'regional_map', label: 'Viloyat Xaritasi', shortLabel: 'Xarita', icon: Map },
  { id: 'regional_schools_students', label: 'Maktablar va O‘quvchilar', shortLabel: 'Maktablar', icon: Building2 },
  { id: 'regional_eco_control', label: 'Ekologik Nazorat', shortLabel: 'Nazorat', icon: ShieldAlert },
  { id: 'regional_championship', label: 'Viloyat Chempionati', shortLabel: 'Chempionat', icon: Trophy },
  { id: 'regional_announcements', label: "E'lonlar", shortLabel: "E'lonlar", icon: Megaphone },
  { id: 'regional_analytics', label: 'Hisobotlar', shortLabel: 'Hisobotlar', icon: BarChart3 },
  { id: 'regional_ai_analyst', label: 'AI Tahlilchi', shortLabel: 'AI Tahlil', icon: Sparkles },
];

export const REGION_COORDINATES: Record<string, { lat: number; lng: number; zoom: number }> = {
  "Toshkent shahri": { lat: 41.2995, lng: 69.2401, zoom: 11.4 },
  "Toshkent viloyati": { lat: 41.15, lng: 69.45, zoom: 8.8 },
  "Samarqand viloyati": { lat: 39.6542, lng: 66.9597, zoom: 8.8 },
  "Farg'ona viloyati": { lat: 40.3864, lng: 71.7864, zoom: 9.1 },
  "Andijon viloyati": { lat: 40.7821, lng: 72.3442, zoom: 9.3 },
  "Namangan viloyati": { lat: 41.0011, lng: 71.6726, zoom: 9.0 },
  "Buxoro viloyati": { lat: 39.7747, lng: 64.4286, zoom: 8.5 },
  "Xorazm viloyati": { lat: 41.55, lng: 60.6333, zoom: 9.0 },
  "Qashqadaryo viloyati": { lat: 38.86, lng: 65.79, zoom: 8.5 },
  "Surxondaryo viloyati": { lat: 37.94, lng: 67.57, zoom: 8.5 },
  "Navoiy viloyati": { lat: 40.1039, lng: 65.3688, zoom: 7.8 },
  "Jizzax viloyati": { lat: 40.1158, lng: 67.8422, zoom: 8.6 },
  "Sirdaryo viloyati": { lat: 40.4915, lng: 68.7811, zoom: 9.2 },
  "Qoraqalpog'iston Respublikasi": { lat: 42.46, lng: 59.61, zoom: 7.5 },
};

export function getDistrictApproxCoords(
  region: string,
  district: string,
  index: number,
  total: number,
  schoolsInDistrict: { lat?: number; lng?: number }[]
): { lat: number; lng: number } {
  const realSchool = schoolsInDistrict.find(s => typeof s.lat === 'number' && typeof s.lng === 'number' && s.lat !== 0);
  if (realSchool && realSchool.lat && realSchool.lng) {
    return { lat: realSchool.lat, lng: realSchool.lng };
  }
  const center = REGION_COORDINATES[region] || { lat: 41.2995, lng: 69.2401, zoom: 10 };
  const angle = (index / Math.max(1, total)) * Math.PI * 2;
  const radius = 0.08 + (index % 3) * 0.045;
  return {
    lat: Number((center.lat + Math.sin(angle) * radius).toFixed(5)),
    lng: Number((center.lng + Math.cos(angle) * radius * 1.35).toFixed(5)),
  };
}

export function getRegionalStatusLabel(status: string): { label: string; dotCls: string; textCls: string } {
  const s = String(status || '').toLowerCase();
  if (s === 'resolved') {
    return { label: 'Hal etilgan', dotCls: 'bg-emerald-500', textCls: 'text-emerald-600 dark:text-emerald-400' };
  }
  if (s === 'verified' || s === 'approved') {
    return { label: 'Tasdiqlangan', dotCls: 'bg-sky-500', textCls: 'text-sky-600 dark:text-sky-400' };
  }
  if (s === 'in_progress' || s === 'assigned') {
    return { label: 'Jarayonda', dotCls: 'bg-indigo-500', textCls: 'text-indigo-600 dark:text-indigo-400' };
  }
  if (s === 'escalated') {
    return { label: 'Eskalatsiya', dotCls: 'bg-rose-500', textCls: 'text-rose-600 dark:text-rose-400' };
  }
  if (s === 'needs_info') {
    return { label: "Ma'lumot kerak", dotCls: 'bg-amber-500', textCls: 'text-amber-600 dark:text-amber-400' };
  }
  if (s === 'rejected') {
    return { label: 'Rad etilgan', dotCls: 'bg-slate-400', textCls: 'text-slate-500 dark:text-slate-400' };
  }
  return { label: 'Kutilmoqda', dotCls: 'bg-amber-500', textCls: 'text-amber-600 dark:text-amber-400' };
}

export function slugifyRegionalKey(val?: string): string {
  return String(val || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
