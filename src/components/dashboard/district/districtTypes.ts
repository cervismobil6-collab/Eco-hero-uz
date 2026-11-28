import {
  LayoutDashboard,
  Building2,
  GraduationCap,
  ShieldCheck,
  Inbox,
  FileWarning,
  Users,
  Trophy,
  Gift,
  Megaphone,
  BarChart3,
  Settings,
} from 'lucide-react';
import { DistrictSectionId } from '../../../types/eco';

export interface DistrictMenuItemConfig {
  id: DistrictSectionId;
  label: string;
  shortLabel: string;
  icon: typeof LayoutDashboard;
}

export const DISTRICT_MENU_ITEMS: DistrictMenuItemConfig[] = [
  { id: 'district_overview', label: 'Umumiy boshqaruv', shortLabel: 'Boshqaruv', icon: LayoutDashboard },
  { id: 'district_schools', label: 'Maktablar', shortLabel: 'Maktablar', icon: Building2 },
  { id: 'district_students', label: 'O‘quvchilar', shortLabel: 'O‘quvchilar', icon: GraduationCap },
  { id: 'district_captains', label: 'Maktab sardorlari', shortLabel: 'Sardorlar', icon: ShieldCheck },
  { id: 'district_applications', label: 'Arizalar va tasdiqlash', shortLabel: 'Arizalar', icon: Inbox },
  { id: 'district_reports', label: 'Ekologik hisobotlar', shortLabel: 'Hisobotlar', icon: FileWarning },
  { id: 'district_ambassadors', label: 'Eco Elchilar', shortLabel: 'Elchilar', icon: Users },
  { id: 'district_ratings', label: 'Reyting va musobaqalar', shortLabel: 'Reyting', icon: Trophy },
  { id: 'district_rewards', label: 'Sovg‘alar boshqaruvi', shortLabel: 'Sovg‘alar', icon: Gift },
  { id: 'district_announcements', label: "E'lonlar va xabarnomalar", shortLabel: "E'lonlar", icon: Megaphone },
  { id: 'district_analytics', label: 'Statistika va tahlil', shortLabel: 'Statistika', icon: BarChart3 },
  { id: 'district_settings', label: 'Sozlamalar', shortLabel: 'Sozlamalar', icon: Settings },
];

export const ROLE_LABELS_UZ: Record<string, string> = {
  student: "O'quvchi",
  ambassador: 'Eco Elchi',
  school_admin: 'Maktab sardori',
  district_coordinator: 'Tuman koordinatori',
  regional_coordinator: 'Viloyat koordinatori',
  super_admin: 'Super Admin',
};

export const REPORT_CATEGORY_LABELS: Record<string, string> = {
  waste: 'Chiqindi',
  water: 'Suv havzasi',
  deforestation: "Daraxtlar / O'rmon",
  air: 'Havo sifati',
  greening_needed: "Ko'kalamzorlashtirish",
  electrical_hazard: 'Elektr xavfi',
  chemical_hazard: 'Kimyoviy xavf',
};

export function getReportStatusBadge(status: string): { label: string; cls: string } {
  const s = String(status || '').toLowerCase();
  if (s === 'resolved') {
    return { label: 'Hal etilgan', cls: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30' };
  }
  if (s === 'verified' || s === 'approved') {
    return { label: 'Tasdiqlangan', cls: 'bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30' };
  }
  if (s === 'in_progress' || s === 'assigned') {
    return { label: 'Jarayonda', cls: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 border-indigo-500/30' };
  }
  if (s === 'escalated') {
    return { label: 'Eskalatsiya', cls: 'bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30' };
  }
  if (s === 'needs_info') {
    return { label: "Ma'lumot kerak", cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30' };
  }
  if (s === 'rejected') {
    return { label: 'Rad etilgan', cls: 'bg-slate-500/15 text-slate-500 dark:text-slate-400 border-slate-500/30' };
  }
  return { label: 'Kutilmoqda', cls: 'bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/30' };
}

export function slugifyChatKey(val?: string): string {
  return String(val || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}
