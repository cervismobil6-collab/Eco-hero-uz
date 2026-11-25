import { ProblemCategory, ProblemStatus } from '../types/eco';

export interface ReportStatusBadgeMeta {
  key:
    | 'NEW'
    | 'ADMIN_REVIEW'
    | 'ASSIGNED'
    | 'IN_PROGRESS'
    | 'FINAL_REVIEW'
    | 'REUPLOAD_REQUIRED'
    | 'RESOLVED'
    | 'REJECTED'
    | 'ESCALATED';
  label: string;
  badgeClass: string;
  dotClass: string;
}

export const STUDENT_PROBLEM_CATEGORIES: {
  id: ProblemCategory;
  label: string;
  desc: string;
  hazardous?: boolean;
}[] = [
  { id: 'waste', label: 'Chiqindi muammosi', desc: 'Maishiy, plastik yoki qurilish chiqindilari to‘planishi' },
  { id: 'water', label: 'Suv muammosi', desc: 'Ariq, kanal, ichimlik suvi isrofi yoki ifloslanishi' },
  { id: 'deforestation', label: "Daraxt va o'simliklar", desc: 'Daraxt kesilishi, shikastlanishi yoki ko‘chat ekish zarurati' },
  { id: 'air', label: 'Havo ifloslanishi', desc: 'Tutun, xazon yoqish yoki changlanish holatlari' },
  { id: 'school_ecology', label: 'Maktab ekologiyasi', desc: 'Maktab hovlisi, bog‘i va sinfxona ekologik holati' },
  { id: 'other', label: 'Boshqa ekologik muammolar', desc: 'Boshqa turdagi ekologik va tabiatni muhofaza qilish masalalari' },
  { id: 'electrical_hazard', label: 'Elektr xavfi', desc: 'Ochiq elektr simlari yoki transformator xavfi', hazardous: true },
  { id: 'chemical_hazard', label: 'Kimyoviy / Xavfli chiqindi', desc: 'Kislota, gaz, shprits yoki zaharli moddalar', hazardous: true },
];

export function getProblemCategoryLabel(category: string | undefined): string {
  switch (category) {
    case 'waste':
      return 'Chiqindi muammosi';
    case 'water':
      return 'Suv muammosi';
    case 'deforestation':
    case 'greening_needed':
      return "Daraxt va o'simliklar";
    case 'air':
      return 'Havo ifloslanishi';
    case 'school_ecology':
      return 'Maktab ekologiyasi';
    case 'electrical_hazard':
      return 'Elektr xavfi';
    case 'chemical_hazard':
      return 'Kimyoviy xavf';
    case 'other':
    default:
      return 'Boshqa ekologik muammolar';
  }
}

export function getReportStatusBadge(status: ProblemStatus | string | undefined): ReportStatusBadgeMeta {
  const s = String(status || '').trim();
  const upper = s.toUpperCase();

  if (upper === 'RESOLVED') {
    return {
      key: 'RESOLVED',
      label: 'Muammo hal qilindi',
      badgeClass: 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/35',
      dotClass: 'bg-emerald-400',
    };
  }
  if (upper === 'REJECTED') {
    return {
      key: 'REJECTED',
      label: 'Rad etildi',
      badgeClass: 'bg-rose-500/15 text-rose-400 border border-rose-500/35',
      dotClass: 'bg-rose-400',
    };
  }
  if (upper === 'REUPLOAD_REQUIRED') {
    return {
      key: 'REUPLOAD_REQUIRED',
      label: 'Qayta rasm talab qilindi',
      badgeClass: 'bg-orange-500/15 text-orange-400 border border-orange-500/35',
      dotClass: 'bg-orange-400',
    };
  }
  if (upper === 'FINAL_REVIEW') {
    return {
      key: 'FINAL_REVIEW',
      label: 'Yakuniy tekshiruvda',
      badgeClass: 'bg-violet-500/15 text-violet-300 border border-violet-500/35',
      dotClass: 'bg-violet-400',
    };
  }
  if (upper === 'IN_PROGRESS') {
    return {
      key: 'IN_PROGRESS',
      label: 'Jarayonda',
      badgeClass: 'bg-sky-500/15 text-sky-400 border border-sky-500/35',
      dotClass: 'bg-sky-400',
    };
  }
  if (upper === 'ASSIGNED') {
    return {
      key: 'ASSIGNED',
      label: 'Eco-Elchiga biriktirildi',
      badgeClass: 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/35',
      dotClass: 'bg-cyan-400',
    };
  }
  if (upper === 'ESCALATED') {
    return {
      key: 'ESCALATED',
      label: 'Mutasaddiga oshirildi',
      badgeClass: 'bg-rose-500/15 text-rose-400 border border-rose-500/35',
      dotClass: 'bg-rose-400',
    };
  }
  if (s === 'pending') {
    return {
      key: 'NEW',
      label: 'Yangi murojaat',
      badgeClass: 'bg-amber-500/15 text-amber-300 border border-amber-500/35',
      dotClass: 'bg-amber-400',
    };
  }
  // PENDING_REVIEW, NEEDS_INFO, verified, APPROVED
  return {
    key: 'ADMIN_REVIEW',
    label: 'Admin tekshiruvida',
    badgeClass: 'bg-amber-500/15 text-amber-300 border border-amber-500/35',
    dotClass: 'bg-amber-400',
  };
}

export function isReportResolvedStatus(status?: string): boolean {
  const up = String(status || '').toUpperCase();
  return up === 'RESOLVED';
}

export function isReportRejectedStatus(status?: string): boolean {
  const up = String(status || '').toUpperCase();
  return up === 'REJECTED';
}

export function isReportPendingInitialReview(status?: string): boolean {
  const up = String(status || '').toUpperCase();
  return up === 'PENDING' || up === 'PENDING_REVIEW' || up === 'NEEDS_INFO' || up === 'VERIFIED' || up === 'APPROVED';
}

export function isReportFinalReviewStatus(status?: string): boolean {
  return String(status || '').toUpperCase() === 'FINAL_REVIEW';
}

export function isReportOpenForAmbassadorAction(status?: string): boolean {
  const up = String(status || '').toUpperCase();
  return (
    up === 'ASSIGNED' ||
    up === 'IN_PROGRESS' ||
    up === 'REUPLOAD_REQUIRED' ||
    up === 'APPROVED' ||
    up === 'VERIFIED'
  );
}
