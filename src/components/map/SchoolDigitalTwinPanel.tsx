import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  MapPin,
  School as SchoolIcon,
  TreePine,
  Award,
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Copy,
  Check,
  Box,
  Edit3,
  Save,
  Sparkles,
  Users,
  Maximize2,
  Compass,
} from 'lucide-react';
import { School, UserRole } from '../../types/eco';

interface SchoolDigitalTwinPanelProps {
  school: School;
  userRole: UserRole;
  userUid: string;
  userSchoolId: string;
  distanceKm?: number | null;
  apiFetch: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  onClose: () => void;
  onOpenPhotoLightbox: (url: string) => void;
  onFocusIn3D?: (school: School) => void;
  onSchoolUpdated: (updated: School) => void;
  onNotify: (msg: string, type?: 'success' | 'info' | 'warning') => void;
}

const DIGITAL_TWIN_EDIT_ROLES: UserRole[] = [
  'school_admin',
  'district_coordinator',
  'regional_coordinator',
  'moderator',
  'super_admin',
];

const FALLBACK_SCHOOL_SVG =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220" viewBox="0 0 400 220"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0%" stop-color="#065f46"/><stop offset="100%" stop-color="#0f172a"/></linearGradient></defs><rect width="400" height="220" fill="url(#g)"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="#a7f3d0" font-family="sans-serif" font-size="16" font-weight="600">EcoHero Maktab Pasporti</text></svg>`
  );

function getDefaultSchoolPhotos(school: School): string[] {
  const id = String(school.id || '').toLowerCase();
  const region = String(school.region || '').toLowerCase();
  let primary = '/assets/schools/tashkent_campus.jpg';
  if (id.includes('samarkand') || region.includes('samarqand')) {
    primary = '/assets/schools/samarkand_campus.jpg';
  } else if (
    id.includes('margilan') ||
    region.includes('farg') ||
    region.includes('andijon') ||
    region.includes('namangan')
  ) {
    primary = '/assets/schools/fergana_campus.jpg';
  } else if (
    id.includes('bukhara') ||
    region.includes('buxoro') ||
    region.includes('xorazm') ||
    region.includes('navoiy')
  ) {
    primary = '/assets/schools/bukhara_campus.jpg';
  } else if (id.includes('urgench')) {
    primary = '/assets/schools/eco_courtyard.jpg';
  }
  return [primary, '/assets/schools/eco_courtyard.jpg'];
}

export const SchoolDigitalTwinPanel: React.FC<SchoolDigitalTwinPanelProps> = ({
  school,
  userRole,
  userUid,
  userSchoolId,
  distanceKm,
  apiFetch,
  onClose,
  onOpenPhotoLightbox,
  onFocusIn3D,
  onSchoolUpdated,
  onNotify,
}) => {
  const [copiedCoords, setCopiedCoords] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [activePhotoIdx, setActivePhotoIdx] = useState(0);

  const [latInput, setLatInput] = useState(
    typeof school.lat === 'number' ? String(school.lat) : ''
  );
  const [lngInput, setLngInput] = useState(
    typeof school.lng === 'number' ? String(school.lng) : ''
  );
  const [addressInput, setAddressInput] = useState(school.address || '');
  const [greenAreaInput, setGreenAreaInput] = useState(
    typeof school.greenAreaSqm === 'number' ? String(school.greenAreaSqm) : ''
  );
  const [glbUrlInput, setGlbUrlInput] = useState(school.glbModelUrl || '');
  const [photosInput, setPhotosInput] = useState(
    (school.verifiedPhotos || []).join('\n')
  );

  useEffect(() => {
    setLatInput(typeof school.lat === 'number' ? String(school.lat) : '');
    setLngInput(typeof school.lng === 'number' ? String(school.lng) : '');
    setAddressInput(school.address || '');
    setGreenAreaInput(
      typeof school.greenAreaSqm === 'number' ? String(school.greenAreaSqm) : ''
    );
    setGlbUrlInput(school.glbModelUrl || '');
    setPhotosInput((school.verifiedPhotos || []).join('\n'));
    setIsEditing(false);
    setErrorMsg(null);
    setActivePhotoIdx(0);
  }, [school]);

  const canEditDigitalTwin =
    DIGITAL_TWIN_EDIT_ROLES.includes(userRole) &&
    (userRole !== 'school_admin' ||
      userSchoolId === school.id ||
      school.ambassadorId === userUid);

  const hasValidCoords =
    typeof school.lat === 'number' &&
    typeof school.lng === 'number' &&
    Number.isFinite(school.lat) &&
    Number.isFinite(school.lng);

  const envScore =
    typeof school.environmentalScore === 'number'
      ? Math.min(100, Math.max(0, school.environmentalScore))
      : Math.min(
          100,
          Math.max(
            35,
            Math.round(
              (school.treesPlanted || 0) * 0.1 +
                (school.cleanupsCompleted || 0) * 0.9 +
                (school.totalCoins || 0) / 1200 +
                22
            )
          )
        );

  const reportStats = school.ecoReportStats || {
    total: 0,
    resolved: 0,
    pending: 0,
    inProgress: 0,
  };

  const photos = useMemo(() => {
    const raw = [...(school.verifiedPhotos || []), school.logoUrl].filter(
      (u): u is string =>
        typeof u === 'string' && u.trim().length > 0 && !u.includes('w=150')
    );
    const defaults = getDefaultSchoolPhotos(school);
    const merged = raw.length > 0 ? [...raw, ...defaults] : defaults;
    return Array.from(new Set(merged)).slice(0, 6);
  }, [school]);

  const activePhotoUrl = photos[Math.min(activePhotoIdx, photos.length - 1)] || FALLBACK_SCHOOL_SVG;

  const handleCopyCoords = async () => {
    if (!hasValidCoords) return;
    const text = `${school.lat!.toFixed(6)}, ${school.lng!.toFixed(6)}`;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedCoords(true);
      setTimeout(() => setCopiedCoords(false), 1800);
    } catch {
      onNotify(`Koordinatalar: ${text}`, 'info');
    }
  };

  const handleSaveDigitalTwin = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsedLat = latInput.trim() ? Number(latInput.trim()) : undefined;
    const parsedLng = lngInput.trim() ? Number(lngInput.trim()) : undefined;
    const parsedGreen = greenAreaInput.trim() ? Number(greenAreaInput.trim()) : undefined;

    if (
      (parsedLat !== undefined && !Number.isFinite(parsedLat)) ||
      (parsedLng !== undefined && !Number.isFinite(parsedLng))
    ) {
      setErrorMsg("Kenglik (lat) va uzunlik (lng) haqiqiy son bo'lishi kerak.");
      return;
    }

    const parsedPhotos = photosInput
      .split(/[\n,]+/)
      .map((s) => s.trim())
      .filter((s) => /^https?:\/\//i.test(s) || s.startsWith('/'));

    setSaving(true);
    try {
      const res = await apiFetch(
        `/api/map/schools/${encodeURIComponent(school.id)}/digital-twin`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            lat: parsedLat,
            lng: parsedLng,
            address: addressInput.trim(),
            greenAreaSqm: parsedGreen,
            glbModelUrl: glbUrlInput.trim(),
            verifiedPhotos: parsedPhotos,
          }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrorMsg(data.error || `Saqlashda xatolik (${res.status})`);
        return;
      }
      if (data.school) {
        onSchoolUpdated(data.school as School);
      }
      setIsEditing(false);
      onNotify("Maktab ma'lumotlari va suratlari yangilandi.", 'success');
    } catch {
      setErrorMsg("Server bilan bog'lanishda xatolik yuz berdi.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-x-0 bottom-0 md:inset-y-4 md:right-4 md:left-auto z-40 w-full md:w-[436px] max-h-[88vh] md:max-h-[calc(100vh-2rem)] bg-white dark:bg-slate-900 border-t md:border border-slate-200 dark:border-slate-800 rounded-t-3xl md:rounded-2xl shadow-2xl flex flex-col overflow-hidden"
      role="dialog"
      aria-label={`${school.name} ma'lumotlari`}
    >
      {/* Mobile drag handle */}
      <div className="md:hidden pt-2.5 pb-1 flex justify-center shrink-0">
        <div className="w-10 h-1.5 rounded-full bg-slate-300 dark:bg-slate-700" />
      </div>

      {/* Header */}
      <div className="px-5 py-3.5 border-b border-slate-100 dark:border-slate-800 flex items-start justify-between gap-3 shrink-0">
        <div className="flex items-start gap-3 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0 border border-indigo-200/70 dark:border-indigo-800/60">
            <SchoolIcon className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap text-[11px]">
              <span className="font-semibold text-indigo-600 dark:text-indigo-400">
                Maktab #{school.number || '—'}
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="font-medium text-emerald-700 dark:text-emerald-400">
                {school.status === 'verified'
                  ? 'Tasdiqlangan'
                  : school.status === 'active'
                    ? 'Faol'
                    : 'Kutilmoqda'}
              </span>
              <span className="text-slate-300 dark:text-slate-700">·</span>
              <span className="font-mono tabular-nums font-semibold text-amber-600 dark:text-amber-400">
                Reyting #{school.ratingRank || '—'}
              </span>
            </div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white leading-snug truncate mt-0.5">
              {school.name}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
              {school.region} · {school.district}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {canEditDigitalTwin && (
            <button
              type="button"
              onClick={() => setIsEditing((v) => !v)}
              title="Maktab pasportini tahrirlash"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition-colors"
            >
              <Edit3 className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Yopish"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl text-slate-500 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Scrollable Body */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
        {/* Hero Campus Photo */}
        <div className="space-y-2">
          <div className="relative h-48 w-full rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-slate-800 group">
            <img
              src={activePhotoUrl}
              alt={`${school.name} binosi`}
              referrerPolicy="no-referrer"
              onError={(e) => {
                e.currentTarget.src = FALLBACK_SCHOOL_SVG;
              }}
              className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent pointer-events-none" />
            <button
              type="button"
              onClick={() => onOpenPhotoLightbox(activePhotoUrl)}
              aria-label="Rasmni kattalashtirish"
              className="absolute top-2.5 right-2.5 min-h-[36px] min-w-[36px] px-2.5 rounded-xl bg-black/55 hover:bg-black/75 text-white backdrop-blur-sm text-[11px] font-semibold flex items-center gap-1.5 transition-colors"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              Kattalashtirish
            </button>
            <div className="absolute bottom-3 left-3.5 right-3.5 flex items-end justify-between gap-2 text-white pointer-events-none">
              <div className="min-w-0">
                <p className="text-[11px] text-emerald-300 font-semibold truncate">
                  {school.district}, {school.region}
                </p>
                <p className="text-sm font-bold leading-snug truncate">
                  {school.name}
                </p>
              </div>
              <span className="text-[11px] font-mono tabular-nums bg-black/55 px-2 py-0.5 rounded-md shrink-0">
                {activePhotoIdx + 1}/{photos.length}
              </span>
            </div>
          </div>

          {photos.length > 1 && (
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              {photos.map((url, idx) => (
                <button
                  key={`${url}_${idx}`}
                  type="button"
                  onClick={() => setActivePhotoIdx(idx)}
                  className={`relative h-14 w-20 shrink-0 rounded-xl overflow-hidden border-2 transition-all ${
                    activePhotoIdx === idx
                      ? 'border-emerald-500 ring-2 ring-emerald-500/25'
                      : 'border-slate-200 dark:border-slate-700 opacity-75 hover:opacity-100'
                  }`}
                >
                  <img
                    src={url}
                    alt={`${school.name} ko'rinish ${idx + 1}`}
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.src = FALLBACK_SCHOOL_SVG;
                    }}
                    className="w-full h-full object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* RBAC Editor Form */}
        {isEditing && canEditDigitalTwin && (
          <form
            onSubmit={handleSaveDigitalTwin}
            className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 space-y-3"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-indigo-600 dark:text-indigo-400">
                Maktab pasportini tahrirlash
              </span>
              <button
                type="button"
                onClick={() => setIsEditing(false)}
                className="text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300"
              >
                Bekor qilish
              </button>
            </div>

            {errorMsg && (
              <div className="p-2.5 rounded-xl bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
                {errorMsg}
              </div>
            )}

            <div className="grid grid-cols-2 gap-2.5">
              <label className="block">
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Kenglik (Lat)
                </span>
                <input
                  type="text"
                  value={latInput}
                  onChange={(e) => setLatInput(e.target.value)}
                  placeholder="41.311081"
                  className="mt-1 w-full px-3 py-2 rounded-xl text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Uzunlik (Lng)
                </span>
                <input
                  type="text"
                  value={lngInput}
                  onChange={(e) => setLngInput(e.target.value)}
                  placeholder="69.240562"
                  className="mt-1 w-full px-3 py-2 rounded-xl text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Aniq manzil
              </span>
              <input
                type="text"
                value={addressInput}
                onChange={(e) => setAddressInput(e.target.value)}
                placeholder="Ko'cha, uy raqami"
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </label>

            <div className="grid grid-cols-2 gap-2.5">
              <label className="block">
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  Yashil maydon (m²)
                </span>
                <input
                  type="number"
                  min={0}
                  value={greenAreaInput}
                  onChange={(e) => setGreenAreaInput(e.target.value)}
                  placeholder="1200"
                  className="mt-1 w-full px-3 py-2 rounded-xl text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </label>
              <label className="block">
                <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                  3D GLB model URL (ixtiyoriy)
                </span>
                <input
                  type="text"
                  value={glbUrlInput}
                  onChange={(e) => setGlbUrlInput(e.target.value)}
                  placeholder="https://.../school.glb"
                  className="mt-1 w-full px-3 py-2 rounded-xl text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </label>
            </div>

            <label className="block">
              <span className="text-[11px] font-medium text-slate-600 dark:text-slate-400">
                Maktab suratlari URL (har bir qatorda 1 ta)
              </span>
              <textarea
                rows={2}
                value={photosInput}
                onChange={(e) => setPhotosInput(e.target.value)}
                placeholder="https://..."
                className="mt-1 w-full px-3 py-2 rounded-xl text-xs font-mono bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
              />
            </label>

            <button
              type="submit"
              disabled={saving}
              className="w-full min-h-[44px] rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </form>
        )}

        {/* Coordinates & Address Block */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-start gap-2 min-w-0">
              <MapPin className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                  {school.address || `${school.district}, ${school.region}`}
                </p>
                {hasValidCoords ? (
                  <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                    {school.lat!.toFixed(6)}, {school.lng!.toFixed(6)}
                    {typeof distanceKm === 'number' && ` · ${distanceKm.toFixed(1)} km uzoqlikda`}
                  </p>
                ) : (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">
                    GPS koordinatalar hali kiritilmagan
                  </p>
                )}
              </div>
            </div>
            {hasValidCoords && (
              <button
                type="button"
                onClick={handleCopyCoords}
                title="Koordinatalarni nusxalash"
                className="min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 hover:border-emerald-500"
              >
                {copiedCoords ? (
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                ) : (
                  <Copy className="w-3.5 h-3.5" />
                )}
              </button>
            )}
          </div>
        </div>

        {/* Environmental Score & Green Area */}
        <div className="grid grid-cols-2 gap-3">
          <div className="p-3.5 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-200/70 dark:border-emerald-800/50">
            <div className="flex items-center justify-between text-emerald-700 dark:text-emerald-400 mb-1">
              <span className="text-[11px] font-semibold">Eko-ball</span>
              <Sparkles className="w-3.5 h-3.5" />
            </div>
            <div className="flex items-baseline gap-1">
              <span className="text-2xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
                {envScore}
              </span>
              <span className="text-xs text-slate-500">/100</span>
            </div>
            <div className="mt-2 h-1.5 w-full rounded-full bg-emerald-200/70 dark:bg-emerald-900/60 overflow-hidden">
              <div
                className="h-full rounded-full bg-emerald-600 dark:bg-emerald-400 transition-all"
                style={{ width: `${Math.min(100, Math.max(0, envScore))}%` }}
              />
            </div>
          </div>

          <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800">
            <div className="flex items-center justify-between text-slate-600 dark:text-slate-400 mb-1">
              <span className="text-[11px] font-semibold">Yashil hudud</span>
              <TreePine className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div className="text-xl font-bold font-mono tabular-nums text-slate-900 dark:text-white">
              {typeof school.greenAreaSqm === 'number' && school.greenAreaSqm > 0
                ? `${school.greenAreaSqm.toLocaleString()} m²`
                : 'Kiritilmagan'}
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 font-mono tabular-nums">
              {school.treesPlanted || 0} tup daraxt · {school.cleanupsCompleted || 0} aksiya
            </p>
          </div>
        </div>

        {/* Eco-Report Statistics */}
        <div className="p-4 rounded-2xl border border-slate-200 dark:border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">
              Eko-ariza statistikasi
            </span>
            <span className="text-xs font-mono tabular-nums font-semibold text-slate-900 dark:text-white">
              Jami: {reportStats.total}
            </span>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40">
              <div className="flex items-center justify-center gap-1 text-emerald-700 dark:text-emerald-400 text-[11px] font-medium">
                <CheckCircle2 className="w-3 h-3" /> Hal etilgan
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                {reportStats.resolved}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-sky-50 dark:bg-sky-950/40">
              <div className="flex items-center justify-center gap-1 text-sky-700 dark:text-sky-400 text-[11px] font-medium">
                <Clock className="w-3 h-3" /> Jarayonda
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                {reportStats.inProgress}
              </div>
            </div>
            <div className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/40">
              <div className="flex items-center justify-center gap-1 text-amber-700 dark:text-amber-400 text-[11px] font-medium">
                <AlertCircle className="w-3 h-3" /> Kutilmoqda
              </div>
              <div className="text-base font-bold font-mono tabular-nums text-slate-900 dark:text-white mt-0.5">
                {reportStats.pending}
              </div>
            </div>
          </div>
        </div>

        {/* School Info & Ambassador */}
        <div className="p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Users className="w-4 h-4 text-slate-500 shrink-0" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">
                Eko-sardor: {school.ambassadorName || 'Tayinlanmagan'}
              </p>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-mono tabular-nums">
                {school.registeredStudentsCount || school.studentsCount || 0} o‘quvchi ·{' '}
                {(school.totalCoins || 0).toLocaleString()} EcoCoin
              </p>
            </div>
          </div>
          <Award className="w-5 h-5 text-amber-500 shrink-0" />
        </div>

        {/* 3D Model Status */}
        <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/80 dark:border-slate-800 flex items-start gap-2.5">
          <Box className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-800 dark:text-slate-200">
              3D Kampus Maketi
            </p>
            {school.glbModelUrl ? (
              <p className="text-[11px] font-mono text-emerald-700 dark:text-emerald-400 truncate mt-0.5">
                Shaxsiy GLB model ulangan: {school.glbModelUrl}
              </p>
            ) : (
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Cesium 3D da asosiy bino, sport korpusi va yashil hudud avtomatik modellashtirilgan.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Footer Actions */}
      <div className="px-5 py-3.5 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center gap-2.5 shrink-0">
        {hasValidCoords && onFocusIn3D && (
          <button
            type="button"
            onClick={() => onFocusIn3D(school)}
            className="min-h-[44px] px-4 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors whitespace-nowrap shrink-0"
          >
            <Compass className="w-4 h-4" />
            3D da ko‘rish
          </button>
        )}
        {hasValidCoords ? (
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${school.lat},${school.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 min-h-[44px] rounded-xl bg-slate-900 dark:bg-emerald-600 hover:bg-slate-800 dark:hover:bg-emerald-500 text-white text-xs font-semibold flex items-center justify-center gap-2 transition-colors whitespace-nowrap"
          >
            <ExternalLink className="w-4 h-4" />
            Google Maps da ochish
          </a>
        ) : (
          <span className="flex-1 min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-400 text-xs font-medium flex items-center justify-center">
            Koordinata mavjud emas
          </span>
        )}
      </div>
    </div>
  );
};

