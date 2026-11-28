import React, { useMemo, useState } from 'react';
import {
  UserPlus,
  Inbox,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Users,
  Send,
  Search,
  ShieldOff,
  ShieldCheck,
  MapPin,
  Sliders,
  MessageSquare,
} from 'lucide-react';
import {
  EcoReport,
  RegionalDistrictSummary,
  RegionalSectionId,
  RegistrationApplication,
  RosterCoordinatorEntry,
} from '../../../types/eco';
import { UZBEKISTAN_DISTRICTS, UZBEKISTAN_REGIONS } from '../../../data/mockData';
import { EcoTelegramChatPanel } from '../../chat/EcoTelegramChatPanel';
import { slugifyRegionalKey } from './regionalTypes';
import realisticAvatarImg from '../../../assets/images/profile_avatar_realistic_1795605008121.jpg';

const APP_ROLE_LABELS: Record<string, string> = {
  district_coordinator: 'Tuman Koordinatori',
  school_admin: 'Maktab Sardori',
  ambassador: 'Eco Elchi',
};

interface RegionalCoordinatorsSectionProps {
  region: string;
  isSuperAdminViewer: boolean;
  districts: RegionalDistrictSummary[];
  coordinators: RosterCoordinatorEntry[];
  applications: RegistrationApplication[];
  reports: EcoReport[];
  globalSearchQuery: string;
  onAppointCoordinator: (payload: {
    fullName: string;
    phoneNumber?: string;
    telegramUsername?: string;
    email?: string;
    district: string;
    region?: string;
  }) => Promise<{ success: boolean }>;
  onReviewApplication: (appId: string, action: 'approve' | 'reject' | 'request_info', note?: string) => Promise<{ success: boolean }>;
  onManageCoordinator: (
    uid: string,
    payload: {
      action: 'reassign' | 'suspend' | 'activate' | 'revoke' | 'update_contact';
      district?: string;
      reason?: string;
      phoneNumber?: string;
      telegramUsername?: string;
    }
  ) => Promise<{ success: boolean }>;
  onNavigateSection: (section: RegionalSectionId) => void;
  onInspectDistrictReports: (district: string) => void;
}

export const RegionalCoordinatorsSection: React.FC<RegionalCoordinatorsSectionProps> = ({
  region,
  isSuperAdminViewer,
  districts,
  coordinators,
  applications,
  reports,
  globalSearchQuery,
  onAppointCoordinator,
  onReviewApplication,
  onManageCoordinator,
  onInspectDistrictReports,
}) => {
  const [subTab, setSubTab] = useState<'directory' | 'applications' | 'appoint' | 'chat'>('directory');
  const [localSearch, setLocalSearch] = useState('');
  const [selectedDistrictFilter, setSelectedDistrictFilter] = useState('all');

  // Appoint form
  const [targetRegion, setTargetRegion] = useState(region || UZBEKISTAN_REGIONS[0]);
  const availableDistricts = useMemo(
    () => UZBEKISTAN_DISTRICTS[targetRegion] || districts.map(d => d.district),
    [targetRegion, districts]
  );
  const [selectedDistrict, setSelectedDistrict] = useState(availableDistricts[0] || '');
  const [coordFullName, setCoordFullName] = useState('');
  const [coordPhone, setCoordPhone] = useState('');
  const [coordTelegram, setCoordTelegram] = useState('');
  const [coordEmail, setCoordEmail] = useState('');
  const [coordSubmitting, setCoordSubmitting] = useState(false);

  // Applications review
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});
  const [reviewBusyId, setReviewBusyId] = useState<string | null>(null);

  // Manage modal
  const [editingCoord, setEditingCoord] = useState<RegionalDistrictSummary['coordinator'] & { district: string } | null>(null);
  const [editAction, setEditAction] = useState<'reassign' | 'suspend' | 'activate' | 'revoke' | 'update_contact'>('reassign');
  const [editDistrict, setEditDistrict] = useState('');
  const [editReason, setEditReason] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editTelegram, setEditTelegram] = useState('');
  const [editBusy, setEditBusy] = useState(false);

  // Chat focus
  const [chatChannelId, setChatChannelId] = useState('');

  const pendingApps = useMemo(
    () => applications.filter(a => ['pending', 'needs_info'].includes(a.status)),
    [applications]
  );

  const q = (localSearch || globalSearchQuery).trim().toLowerCase();

  const mergedDistrictCoords = useMemo(() => {
    return districts.filter(d => {
      if (selectedDistrictFilter !== 'all' && d.district !== selectedDistrictFilter) return false;
      if (!q) return true;
      return (
        d.district.toLowerCase().includes(q) ||
        (d.coordinator?.fullName || '').toLowerCase().includes(q) ||
        (d.coordinator?.telegramUsername || '').toLowerCase().includes(q)
      );
    });
  }, [districts, selectedDistrictFilter, q]);

  const handleAppointSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coordFullName.trim() || !selectedDistrict) return;
    setCoordSubmitting(true);
    try {
      const res = await onAppointCoordinator({
        fullName: coordFullName.trim(),
        phoneNumber: coordPhone.trim() || undefined,
        telegramUsername: coordTelegram.trim() || undefined,
        email: coordEmail.trim() || undefined,
        district: selectedDistrict,
        region: isSuperAdminViewer ? targetRegion : region,
      });
      if (res.success) {
        setCoordFullName('');
        setCoordPhone('');
        setCoordTelegram('');
        setCoordEmail('');
        setSubTab('directory');
      }
    } finally {
      setCoordSubmitting(false);
    }
  };

  const handleReview = async (id: string, action: 'approve' | 'reject' | 'request_info') => {
    setReviewBusyId(id);
    try {
      await onReviewApplication(id, action, reviewNotes[id] || undefined);
    } finally {
      setReviewBusyId(null);
    }
  };

  const openManageModal = (d: RegionalDistrictSummary) => {
    if (!d.coordinator) return;
    setEditingCoord({ ...d.coordinator, district: d.district });
    setEditAction(d.coordinator.status === 'suspended' ? 'activate' : 'reassign');
    setEditDistrict(d.district);
    setEditReason('');
    setEditPhone(d.coordinator.phoneNumber || '');
    setEditTelegram(d.coordinator.telegramUsername || '');
  };

  const submitManageCoord = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCoord) return;
    setEditBusy(true);
    try {
      const res = await onManageCoordinator(editingCoord.uid, {
        action: editAction,
        district: editAction === 'reassign' ? editDistrict : undefined,
        reason: editReason.trim() || undefined,
        phoneNumber: editAction === 'update_contact' ? editPhone.trim() : undefined,
        telegramUsername: editAction === 'update_contact' ? editTelegram.trim() : undefined,
      });
      if (res.success) {
        setEditingCoord(null);
      }
    } finally {
      setEditBusy(false);
    }
  };

  const openDirectChat = (coordUid?: string) => {
    const regSlug = slugifyRegionalKey(region || 'toshkent_shahri');
    setChatChannelId(coordUid ? `reg_dm:${regSlug}:${coordUid}` : `reg_group:${regSlug}`);
    setSubTab('chat');
  };

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex flex-wrap gap-2 p-1.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20">
        {[
          { id: 'directory' as const, label: `Tumanlar & Koordinatorlar (${coordinators.length})` },
          { id: 'applications' as const, label: `Yangi arizalar (${pendingApps.length})` },
          { id: 'appoint' as const, label: 'Koordinator saylash' },
          { id: 'chat' as const, label: 'Koordinatorlar chati' },
        ].map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`flex-1 min-w-[140px] min-h-[42px] px-3 py-2 rounded-xl text-xs font-extrabold transition-all cursor-pointer ${
              subTab === t.id
                ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700'
                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#040D0A]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {subTab === 'directory' && (
        <div className="space-y-3.5">
          <div className="flex flex-col sm:flex-row gap-2.5">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={localSearch}
                onChange={e => setLocalSearch(e.target.value)}
                placeholder="Koordinator ismi yoki tuman nomi bo‘yicha qidirish..."
                className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-400"
              />
            </div>
            <select
              value={selectedDistrictFilter}
              onChange={e => setSelectedDistrictFilter(e.target.value)}
              className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none focus:border-emerald-400"
            >
              <option value="all">Barcha tumanlar ({districts.length})</option>
              {districts.map(d => (
                <option key={d.district} value={d.district}>
                  {d.district}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
            {mergedDistrictCoords.map(d => {
              const distReports = reports.filter(
                r => r.district?.toLowerCase() === d.district.toLowerCase()
              ).length;
              return (
                <div
                  key={d.district}
                  className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3 flex flex-col justify-between"
                >
                  <div className="space-y-2.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <img
                          src={d.coordinator?.avatarUrl || realisticAvatarImg}
                          alt={d.coordinator?.fullName || d.district}
                          className="w-10 h-10 rounded-full object-cover border border-emerald-500/35 shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="text-xs font-black text-emerald-500 truncate flex items-center gap-1">
                            <MapPin className="w-3.5 h-3.5 shrink-0" />
                            <span>{d.district}</span>
                          </div>
                          <div className="text-sm font-extrabold text-slate-900 dark:text-white truncate">
                            {d.coordinator ? d.coordinator.fullName : 'Koordinator tayinlanmagan'}
                          </div>
                          {d.coordinator && (
                            <div className="text-[11px] text-slate-500 truncate">
                              {d.coordinator.telegramUsername || d.coordinator.phoneNumber || 'Aloqa ko‘rsatilmagan'}
                              {d.coordinator.status === 'suspended' && ' · Vaqtincha to‘xtatilgan'}
                            </div>
                          )}
                        </div>
                      </div>
                      <span
                        className={`w-2.5 h-2.5 rounded-full shrink-0 mt-1.5 ${
                          !d.coordinator
                            ? 'bg-slate-400'
                            : d.coordinator.status === 'suspended'
                            ? 'bg-rose-500'
                            : 'bg-emerald-500'
                        }`}
                        title={
                          !d.coordinator
                            ? 'Tayinlanmagan'
                            : d.coordinator.status === 'suspended'
                            ? 'To‘xtatilgan'
                            : 'Faol'
                        }
                      />
                    </div>

                    {/* Compact district telemetry row */}
                    <div className="grid grid-cols-4 gap-1.5 p-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/70 dark:border-emerald-500/15 text-center">
                      <div>
                        <div className="text-[10px] text-slate-500">Maktab</div>
                        <div className="text-xs font-black font-mono tabular-nums">{d.schoolsCount}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">O‘quvchi</div>
                        <div className="text-xs font-black font-mono tabular-nums">{d.studentsCount}</div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">Hal/Jami</div>
                        <div className="text-xs font-black font-mono tabular-nums text-emerald-500">
                          {d.resolvedReports}/{distReports || d.totalReports}
                        </div>
                      </div>
                      <div>
                        <div className="text-[10px] text-slate-500">EcoCoin</div>
                        <div className="text-xs font-black font-mono tabular-nums text-amber-500">
                          {d.totalCoins}
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => onInspectDistrictReports(d.district)}
                      className="flex-1 min-h-[38px] px-2.5 py-1.5 rounded-xl bg-slate-100 dark:bg-[#040D0A] hover:bg-slate-200 dark:hover:bg-emerald-500/10 border border-slate-200 dark:border-emerald-500/20 text-[11px] font-bold cursor-pointer"
                    >
                      Hisobotlar
                    </button>
                    {d.coordinator ? (
                      <>
                        <button
                          type="button"
                          onClick={() => openDirectChat(d.coordinator!.uid)}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Send className="w-3 h-3" />
                          <span>Chat</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openManageModal(d)}
                          className="min-h-[38px] px-2.5 py-1.5 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-600 dark:text-amber-400 text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer"
                        >
                          <Sliders className="w-3 h-3" />
                          <span>Vakolat</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedDistrict(d.district);
                          setSubTab('appoint');
                        }}
                        className="flex-1 min-h-[38px] px-3 py-1.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] text-[11px] font-black border-b-[2px] border-emerald-700 cursor-pointer"
                      >
                        + Tayinlash
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {subTab === 'applications' && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3.5">
          <div className="flex items-center gap-2">
            <Inbox className="w-5 h-5 text-sky-500" />
            <div>
              <h3 className="text-sm sm:text-base font-extrabold text-slate-900 dark:text-white">
                Koordinator va Hududiy Arizalar Navbati ({pendingApps.length})
              </h3>
              <p className="text-[11px] text-slate-500">
                Tuman koordinatori, maktab sardori va Eco Elchi lavozimlariga topshirilgan arizalar
              </p>
            </div>
          </div>

          {pendingApps.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              Hozircha viloyat bo‘yicha kutilayotgan yangi arizalar yo‘q.
            </div>
          ) : (
            <div className="space-y-3">
              {pendingApps.map(app => (
                <div
                  key={app.id}
                  className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 space-y-3 text-xs"
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <div className="font-bold text-sm text-slate-900 dark:text-white">{app.fullName}</div>
                      <div className="text-[11px] text-slate-500">
                        {APP_ROLE_LABELS[app.requestedRole] || app.requestedRole} · {app.district} · {app.officialSchoolName}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        Aloqa: {app.contactInfo} {app.telegramUsername ? `· ${app.telegramUsername}` : ''}
                      </div>
                    </div>
                    <span className="font-bold text-[11px] text-amber-500">
                      {app.status === 'needs_info' ? 'Qo‘shimcha ma’lumot so‘ralgan' : 'Tasdiq kutilmoqda'}
                    </span>
                  </div>
                  <p className="text-slate-600 dark:text-emerald-100/80 leading-relaxed">{app.verificationDetails}</p>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      value={reviewNotes[app.id] || ''}
                      onChange={e => setReviewNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                      placeholder="Koordinator izohi (ixtiyoriy)"
                      className="flex-1 min-h-[42px] px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-500"
                    />
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={reviewBusyId === app.id}
                        onClick={() => handleReview(app.id, 'approve')}
                        className="min-h-[42px] px-3.5 py-2 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black border-b-[2px] border-emerald-700 inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Tasdiqlash</span>
                      </button>
                      <button
                        type="button"
                        disabled={reviewBusyId === app.id}
                        onClick={() => handleReview(app.id, 'request_info')}
                        className="min-h-[42px] px-3 py-2 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 text-amber-500 font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <AlertCircle className="w-3.5 h-3.5" />
                        <span>So‘rash</span>
                      </button>
                      <button
                        type="button"
                        disabled={reviewBusyId === app.id}
                        onClick={() => handleReview(app.id, 'reject')}
                        className="min-h-[42px] px-3 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 text-rose-500 font-bold inline-flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        <span>Rad</span>
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {subTab === 'appoint' && (
        <form
          onSubmit={handleAppointSubmit}
          className="max-w-2xl p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <UserPlus className="w-5 h-5 text-emerald-500" />
            <div>
              <h3 className="text-base font-extrabold text-slate-900 dark:text-white">
                Yangi Tuman Koordinatori Tayinlash
              </h3>
              <p className="text-[11px] text-slate-500">
                Tanlangan tuman yoki shahar uchun mas’ul koordinator vakolatini rasmiylashtiring
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Nomzod F.I.Sh. *</label>
              <input
                type="text"
                required
                value={coordFullName}
                onChange={e => setCoordFullName(e.target.value)}
                placeholder="Masalan: Azizbek Rahimov"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
              />
            </div>
            {isSuperAdminViewer && (
              <div className="sm:col-span-2">
                <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Viloyat *</label>
                <select
                  value={targetRegion}
                  onChange={e => setTargetRegion(e.target.value)}
                  className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
                >
                  {UZBEKISTAN_REGIONS.map(r => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Tuman / Shahar *</label>
              <select
                value={selectedDistrict}
                onChange={e => setSelectedDistrict(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
              >
                {availableDistricts.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Telefon raqam</label>
              <input
                type="text"
                value={coordPhone}
                onChange={e => setCoordPhone(e.target.value)}
                placeholder="+998 90 123 45 67"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Telegram username</label>
              <input
                type="text"
                value={coordTelegram}
                onChange={e => setCoordTelegram(e.target.value)}
                placeholder="@koordinator_uz"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
              />
            </div>
            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-600 dark:text-slate-300 mb-1">Email</label>
              <input
                type="email"
                value={coordEmail}
                onChange={e => setCoordEmail(e.target.value)}
                placeholder="koordinator@ecohero.uz"
                className="w-full min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={coordSubmitting}
            className="w-full min-h-[46px] py-2.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black text-xs border-b-[3px] border-emerald-700 cursor-pointer disabled:opacity-60"
          >
            {coordSubmitting ? 'Tayinlanmoqda...' : 'Tuman Koordinatorini tayinlash'}
          </button>
        </form>
      )}

      {subTab === 'chat' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20">
            <div className="text-xs font-bold text-slate-700 dark:text-emerald-100 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-emerald-500" />
              <span>Viloyat Kengashi va Tuman Koordinatorlari bilan tezkor aloqa</span>
            </div>
            <button
              type="button"
              onClick={() => openDirectChat()}
              className="min-h-[38px] px-3 py-1.5 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold cursor-pointer"
            >
              Umumiy viloyat guruhiga o‘tish
            </button>
          </div>
          <EcoTelegramChatPanel
            defaultChannelId={chatChannelId}
            allowedScopes={['regional_coordinators']}
            title="Viloyat va Tuman Koordinatorlari Chati"
          />
        </div>
      )}

      {/* Authority Management Modal */}
      {editingCoord && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={submitManageCoord}
            className="w-full max-w-md p-5 rounded-3xl bg-white dark:bg-[#061812] border border-emerald-500/30 space-y-4 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-base font-black text-slate-900 dark:text-white">Koordinator Vakolatini Boshqarish</h3>
                <p className="text-xs text-slate-500">
                  {editingCoord.fullName} · {editingCoord.district}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setEditingCoord(null)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-[#040D0A] cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              {[
                { id: 'reassign' as const, label: 'Tumanni almashtirish', icon: MapPin },
                editingCoord.status === 'suspended'
                  ? { id: 'activate' as const, label: 'Qayta faollashtirish', icon: ShieldCheck }
                  : { id: 'suspend' as const, label: 'Vaqtincha to‘xtatish', icon: ShieldOff },
                { id: 'update_contact' as const, label: 'Aloqani tahrirlash', icon: Users },
                { id: 'revoke' as const, label: 'Vakolatni bekor qilish', icon: XCircle },
              ].map(opt => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setEditAction(opt.id)}
                  className={`min-h-[42px] px-3 py-2 rounded-xl border text-left font-bold flex items-center gap-1.5 cursor-pointer ${
                    editAction === opt.id
                      ? 'bg-emerald-500/15 border-emerald-500 text-emerald-500'
                      : 'bg-slate-50 dark:bg-[#040D0A] border-slate-200 dark:border-emerald-500/20 text-slate-600 dark:text-slate-300'
                  }`}
                >
                  <opt.icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{opt.label}</span>
                </button>
              ))}
            </div>

            {editAction === 'reassign' && (
              <div className="space-y-1 text-xs">
                <label className="font-semibold text-slate-500">Yangi biriktiriladigan tuman</label>
                <select
                  value={editDistrict}
                  onChange={e => setEditDistrict(e.target.value)}
                  className="w-full min-h-[44px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
                >
                  {(UZBEKISTAN_DISTRICTS[region] || districts.map(d => d.district)).map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {editAction === 'update_contact' && (
              <div className="space-y-2.5 text-xs">
                <div>
                  <label className="font-semibold text-slate-500">Telefon raqam</label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={e => setEditPhone(e.target.value)}
                    className="w-full mt-1 min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-500">Telegram username</label>
                  <input
                    type="text"
                    value={editTelegram}
                    onChange={e => setEditTelegram(e.target.value)}
                    className="w-full mt-1 min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
                  />
                </div>
              </div>
            )}

            <div className="space-y-1 text-xs">
              <label className="font-semibold text-slate-500">Asos / izoh</label>
              <input
                type="text"
                value={editReason}
                onChange={e => setEditReason(e.target.value)}
                placeholder="Audit tarixiga yoziladigan izoh..."
                className="w-full min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
              />
            </div>

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setEditingCoord(null)}
                className="flex-1 min-h-[44px] rounded-xl border border-slate-200 dark:border-emerald-500/20 text-xs font-bold cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="submit"
                disabled={editBusy}
                className="flex-1 min-h-[44px] rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] text-xs font-black border-b-[3px] border-emerald-700 cursor-pointer disabled:opacity-60"
              >
                {editBusy ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
