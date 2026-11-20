import React, { useState } from 'react';
import {
  ShieldCheck,
  CheckCircle2,
  XCircle,
  MessageSquare,
  Coins,
  Users,
  Camera,
  AlertTriangle,
  ShieldAlert,
  Save,
  History,
  FileVideo,
  UserPlus,
  MapPin,
  Phone,
  Mail,
} from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import { UZBEKISTAN_REGIONS, UZBEKISTAN_DISTRICTS } from '../../data/mockData';
import { MediaCategory, RewardSettings, RosterCoordinatorEntry, UserRole } from '../../types/eco';

interface SuperAdminModerationViewProps {
  section: 'applications' | 'media_moderation' | 'problem_workflow' | 'reward_settings' | 'role_management';
}

const CATEGORY_LABELS: Record<MediaCategory, string> = {
  tree_planting: 'Daraxt ekish',
  tree_care: 'Daraxtlarni parvarishlash va sug‘orish',
  school_garden: 'Maktab bog‘i loyihasi',
  awareness_video: 'Ekologik targ‘ibot videosi',
  waste_sorting: 'Chiqindilarni saralash',
  school_improvement: 'Maktab hududini obodonlashtirish',
  environmental_campaign: 'Ekologik aksiya / kampaniya',
};

export const SuperAdminModerationView: React.FC<SuperAdminModerationViewProps> = ({ section }) => {
  const {
    registrationApplications,
    roleRequests,
    reviewApplication,
    approveRoleRequest,
    rejectRoleRequest,
    manageUserRole,
    mediaSubmissions,
    moderateEcoMedia,
    reports,
    advanceReportWorkflow,
    rewardSettings,
    updateRewardSettings,
    adjustUserCoins,
    studentsLeaderboard,
    auditLogs,
    showNotification,
    appointRegionalCoordinator,
    appointDistrictCoordinator,
    fetchRosterDirectory,
  } = useEco();

  const [appNotes, setAppNotes] = useState<Record<string, string>>({});
  const [mediaNotes, setMediaNotes] = useState<Record<string, string>>({});
  const [mediaCoins, setMediaCoins] = useState<Record<string, string>>({});
  const [reportNotes, setReportNotes] = useState<Record<string, string>>({});

  // Role management state
  const [targetUid, setTargetUid] = useState('');
  const [newRole, setNewRole] = useState<UserRole>('ambassador');
  const [revokeRole, setRevokeRole] = useState<string>('');
  const [roleReason, setRoleReason] = useState('');

  // Coordinator creation state (Super Admin)
  const [coordRoleType, setCoordRoleType] = useState<'regional_coordinator' | 'district_coordinator'>('district_coordinator');
  const [coordFullName, setCoordFullName] = useState('');
  const [coordRegion, setCoordRegion] = useState<string>(UZBEKISTAN_REGIONS[0] || 'Toshkent shahri');
  const [coordDistrict, setCoordDistrict] = useState<string>(
    (UZBEKISTAN_DISTRICTS[UZBEKISTAN_REGIONS[0] || 'Toshkent shahri'] || [])[0] || ''
  );
  const [coordPhone, setCoordPhone] = useState('');
  const [coordTelegram, setCoordTelegram] = useState('');
  const [coordEmail, setCoordEmail] = useState('');
  const [creatingCoord, setCreatingCoord] = useState(false);
  const [regionalCoordsList, setRegionalCoordsList] = useState<RosterCoordinatorEntry[]>([]);
  const [districtCoordsList, setDistrictCoordsList] = useState<RosterCoordinatorEntry[]>([]);

  // Reward settings form
  const [draftRewards, setDraftRewards] = useState<RewardSettings>(rewardSettings);
  const [savingRewards, setSavingRewards] = useState(false);

  // Coin adjustment form
  const [coinTargetUid, setCoinTargetUid] = useState('');
  const [coinDelta, setCoinDelta] = useState('100');
  const [coinReason, setCoinReason] = useState('');

  React.useEffect(() => {
    setDraftRewards(rewardSettings);
  }, [rewardSettings]);

  const loadCoordinatorRoster = React.useCallback(async () => {
    const dir = await fetchRosterDirectory();
    if (dir) {
      setRegionalCoordsList(dir.regionalCoordinators || []);
      setDistrictCoordsList(dir.districtCoordinators || []);
    }
  }, [fetchRosterDirectory]);

  React.useEffect(() => {
    if (section === 'role_management') {
      loadCoordinatorRoster();
    }
  }, [section, loadCoordinatorRoster]);

  const handleSaveRewards = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingRewards(true);
    await updateRewardSettings(draftRewards);
    setSavingRewards(false);
  };

  const handleAdjustCoins = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(coinDelta);
    if (!coinTargetUid || Number.isNaN(amt) || amt === 0 || coinReason.trim().length < 3) {
      showNotification('Foydalanuvchi, summa va sababni kiriting', 'warning');
      return;
    }
    const res = await adjustUserCoins(coinTargetUid, amt, coinReason.trim());
    if (res.success) {
      setCoinReason('');
    }
  };

  const handleRoleManage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!targetUid || roleReason.trim().length < 4) {
      showNotification('Foydalanuvchi va kamida 4 belgilik sabab kiriting', 'warning');
      return;
    }
    const res = await manageUserRole({
      targetUid,
      newRole: revokeRole ? undefined : newRole,
      revokeRole: revokeRole ? (revokeRole as UserRole) : undefined,
      reason: roleReason.trim(),
    });
    if (res.success) {
      setRoleReason('');
      setRevokeRole('');
      await loadCoordinatorRoster();
    }
  };

  const handleCreateCoordinator = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!coordFullName.trim() || !coordRegion) {
      showNotification("Koordinator F.I.Sh. va viloyatini kiriting", 'warning');
      return;
    }
    if (coordRoleType === 'district_coordinator' && !coordDistrict) {
      showNotification('Tuman koordinatori uchun tumanni tanlang', 'warning');
      return;
    }
    setCreatingCoord(true);
    try {
      const cleanTg = coordTelegram.trim().replace(/^@/, '');
      const result =
        coordRoleType === 'regional_coordinator'
          ? await appointRegionalCoordinator({
              fullName: coordFullName.trim(),
              region: coordRegion,
              phoneNumber: coordPhone.trim() || undefined,
              telegramUsername: cleanTg ? `@${cleanTg}` : undefined,
              email: coordEmail.trim() || undefined,
            })
          : await appointDistrictCoordinator({
              fullName: coordFullName.trim(),
              region: coordRegion,
              district: coordDistrict,
              phoneNumber: coordPhone.trim() || undefined,
              telegramUsername: cleanTg ? `@${cleanTg}` : undefined,
              email: coordEmail.trim() || undefined,
            });

      if (result.success) {
        setCoordFullName('');
        setCoordPhone('');
        setCoordTelegram('');
        setCoordEmail('');
        await loadCoordinatorRoster();
      }
    } finally {
      setCreatingCoord(false);
    }
  };

  if (section === 'applications') {
    const pendingApps = registrationApplications.filter(a => a.status === 'pending' || a.status === 'needs_info');
    const historyApps = registrationApplications.filter(a => a.status === 'approved' || a.status === 'rejected');

    return (
      <div className="space-y-6">
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
            <ShieldCheck className="w-4 h-4" />
            <span>Super Admin Tasdiqlash Markazi</span>
          </div>
          <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
            Maktab Sardori, Eko-Elchi va Koordinatorlik Arizalari ({pendingApps.length} ta navbatda)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Ariza tasdiqlansa nomzod avtomatik ravishda tanlangan maktabga va lavozimga biriktiriladi hamda Telegram xabar oladi.
          </p>
        </div>

        <div className="space-y-4">
          {pendingApps.length === 0 ? (
            <div className="p-12 text-center rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500">
              Hozircha ko‘rib chiqilishi kutilayotgan yangi arizalar yo‘q.
            </div>
          ) : (
            pendingApps.map(app => (
              <div
                key={app.id}
                className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4"
              >
                <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-base font-extrabold text-slate-900 dark:text-white">{app.fullName}</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-bold text-emerald-500">{app.requestedRoleName || app.requestedRole}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-amber-500 font-semibold">{app.status}</span>
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-300">
                      Maktab: <b>#{app.schoolNumber} {app.officialSchoolName}</b> · {app.region}, {app.district}
                    </div>
                    <div className="text-xs text-slate-500 font-mono">
                      Telegram ID: {app.telegramId || '—'} · Aloqa: {app.contactInfo}
                    </div>
                    <div className="text-xs text-slate-600 dark:text-slate-400 pt-1">
                      Tasdiqlovchi ma’lumot: {app.verificationDetails}
                    </div>
                  </div>

                  <div className="flex flex-col gap-2 min-w-[260px]">
                    <input
                      type="text"
                      placeholder="Izoh / qo‘shimcha ma’lumot so‘rovi..."
                      value={appNotes[app.id] || ''}
                      onChange={e => setAppNotes(prev => ({ ...prev, [app.id]: e.target.value }))}
                      className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={() => reviewApplication(app.id, 'approve', appNotes[app.id])}
                        className="flex-1 py-2 px-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-1 cursor-pointer"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" /> Tasdiqlash
                      </button>
                      <button
                        onClick={() => reviewApplication(app.id, 'request_info', appNotes[app.id] || "Qo'shimcha hujjat yuklang")}
                        className="py-2 px-3 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <MessageSquare className="w-3.5 h-3.5" /> So‘rash
                      </button>
                      <button
                        onClick={() => reviewApplication(app.id, 'reject', appNotes[app.id] || 'Talablarga mos kelmadi')}
                        className="py-2 px-3 rounded-xl bg-rose-500/15 text-rose-500 text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <XCircle className="w-3.5 h-3.5" /> Rad
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Legacy Role Requests */}
        {roleRequests.filter(r => r.status === 'pending').length > 0 && (
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Tezkor rol so‘rovlari</h4>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {roleRequests
                .filter(r => r.status === 'pending')
                .map(req => (
                  <div key={req.id} className="py-3 flex items-center justify-between gap-4 text-xs">
                    <div>
                      <div className="font-bold text-slate-900 dark:text-white">
                        {req.userName} · {req.requestedRoleName || req.requestedRole}
                      </div>
                      <div className="text-slate-500">{req.userSchool} · {req.reason}</div>
                    </div>
                    <div className="flex gap-2 shrink-0">
                      <button
                        onClick={() => approveRoleRequest(req.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white font-bold cursor-pointer"
                      >
                        Tasdiqlash
                      </button>
                      <button
                        onClick={() => rejectRoleRequest(req.id, 'Rad etildi')}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-500 font-bold cursor-pointer"
                      >
                        Rad etish
                      </button>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {historyApps.length > 0 && (
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white">Ko‘rib chiqilgan arizalar tarixi</h4>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {historyApps.slice(0, 8).map(h => (
                <div key={h.id} className="py-2 flex items-center justify-between text-xs">
                  <span>
                    <b>{h.fullName}</b> · {h.requestedRoleName} · {h.officialSchoolName}
                  </span>
                  <span className={h.status === 'approved' ? 'text-emerald-500 font-bold' : 'text-rose-500 font-bold'}>
                    {h.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }

  if (section === 'media_moderation') {
    const orderedMedia = [...mediaSubmissions].sort((a, b) => (a.status === 'PENDING' ? -1 : b.status === 'PENDING' ? 1 : 0));

    return (
      <div className="space-y-6">
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h3 className="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Camera className="w-5 h-5 text-emerald-500" />
            <span>Ekologik Foto va Video Moderatsiyasi ({mediaSubmissions.filter(m => m.status === 'PENDING').length} ta kutilmoqda)</span>
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Faqat haqiqiy, takrorlanmagan ekologik dalillar tasdiqlanganda tizim sozlamalariga muvofiq EcoCoin avtomatik beriladi.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {orderedMedia.map(sub => (
            <div
              key={sub.id}
              className="rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col"
            >
              <div className="aspect-video bg-slate-100 dark:bg-slate-800 relative">
                {sub.mediaType === 'video' ? (
                  <video src={sub.mediaUrl} controls className="w-full h-full object-cover" />
                ) : (
                  <img src={sub.mediaUrl} alt={sub.description} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="p-5 space-y-3 flex-1 flex flex-col justify-between">
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs font-bold">
                    <span className="text-emerald-500 flex items-center gap-1">
                      {sub.mediaType === 'video' && <FileVideo className="w-3.5 h-3.5" />}
                      {CATEGORY_LABELS[sub.activityCategory] || sub.activityCategory}
                    </span>
                    <span
                      className={
                        sub.status === 'APPROVED'
                          ? 'text-emerald-500'
                          : sub.status === 'REJECTED'
                          ? 'text-rose-500'
                          : 'text-amber-500'
                      }
                    >
                      {sub.status}
                    </span>
                  </div>
                  <p className="text-xs font-semibold text-slate-900 dark:text-white">{sub.description}</p>
                  <div className="text-[11px] text-slate-500">
                    {sub.userName} · {sub.schoolName} · {new Date(sub.createdAt).toLocaleDateString()}
                  </div>
                  {sub.fileHash && (
                    <div className="text-[10px] font-mono text-slate-400 truncate">SHA-256: {sub.fileHash.slice(0, 18)}...</div>
                  )}
                </div>

                {sub.status !== 'APPROVED' ? (
                  <div className="space-y-2 pt-3 border-t border-slate-100 dark:border-slate-800">
                    <div className="grid grid-cols-3 gap-2">
                      <input
                        type="number"
                        placeholder="ECO"
                        value={mediaCoins[sub.id] || ''}
                        onChange={e => setMediaCoins(prev => ({ ...prev, [sub.id]: e.target.value }))}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                      />
                      <input
                        type="text"
                        placeholder="Moderator izohi..."
                        value={mediaNotes[sub.id] || ''}
                        onChange={e => setMediaNotes(prev => ({ ...prev, [sub.id]: e.target.value }))}
                        className="col-span-2 px-2.5 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                      />
                    </div>
                    <div className="flex gap-1.5">
                      <button
                        onClick={() =>
                          moderateEcoMedia(
                            sub.id,
                            'APPROVED',
                            mediaNotes[sub.id],
                            mediaCoins[sub.id] ? Number(mediaCoins[sub.id]) : undefined
                          )
                        }
                        className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                      >
                        Tasdiqlash
                      </button>
                      <button
                        onClick={() => moderateEcoMedia(sub.id, 'NEEDS_REVISION', mediaNotes[sub.id] || 'Aniqlashtirish kerak')}
                        className="px-2.5 py-2 rounded-lg bg-amber-500/15 text-amber-500 text-xs font-bold cursor-pointer"
                      >
                        Tuzatish
                      </button>
                      <button
                        onClick={() => moderateEcoMedia(sub.id, 'REJECTED', mediaNotes[sub.id] || 'Tasdiqlanmadi')}
                        className="px-2.5 py-2 rounded-lg bg-rose-500/15 text-rose-500 text-xs font-bold cursor-pointer"
                      >
                        Rad
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs">
                    <span className="text-slate-500">Berilgan mukofot:</span>
                    <span className="font-mono font-bold text-emerald-500">+{sub.awardedCoins} ECO</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section === 'problem_workflow') {
    return (
      <div className="space-y-6">
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
          <h3 className="text-xl font-extrabold text-slate-900 dark:text-white">
            6-Bosqichli Ekologik Muammolar Nazorati va Yakuniy Tasdiqlash
          </h3>
          <p className="text-xs text-slate-500 mt-1">
            Yangi hisobotlarni tasdiqlab Maktab Sardoriga yo‘naltiring, xavfli holatlarni esa mutasaddilarga eskalatsiya qiling.
          </p>
        </div>

        <div className="space-y-4">
          {reports.map(rep => (
            <div
              key={rep.id}
              className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row gap-5"
            >
              <div className="w-full lg:w-52 aspect-video rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 shrink-0">
                {rep.videoUrl && !rep.imageUrl ? (
                  <video src={rep.videoUrl} controls className="w-full h-full object-cover" />
                ) : (
                  <img src={rep.imageUrl} alt={rep.title} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                )}
              </div>
              <div className="flex-1 space-y-2 min-w-0">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-base font-bold text-slate-900 dark:text-white">{rep.title}</h4>
                  <span className="text-xs font-bold font-mono text-emerald-500">{rep.status}</span>
                </div>
                <p className="text-xs text-slate-600 dark:text-slate-300">{rep.description}</p>
                <div className="text-[11px] text-slate-500">
                  {rep.reporterName} · {rep.schoolName} · {rep.region}, {rep.district}
                </div>
                {rep.isHazardous && (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500 font-semibold flex items-center gap-2">
                    <ShieldAlert className="w-4 h-4 shrink-0" />
                    <span>XAVFLI MUAMMO: O‘quvchilar jalb etilmasin — {rep.escalationTarget || "Maktab ma'muriyati / FVV"}</span>
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-2">
                  <input
                    type="text"
                    placeholder="Moderator izohi..."
                    value={reportNotes[rep.id] || ''}
                    onChange={e => setReportNotes(prev => ({ ...prev, [rep.id]: e.target.value }))}
                    className="px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs flex-1 min-w-[180px]"
                  />
                  {['pending', 'PENDING_REVIEW', 'NEEDS_INFO'].includes(rep.status) && (
                    <>
                      <button
                        onClick={() => advanceReportWorkflow(rep.id, 'approve_to_captain', { note: reportNotes[rep.id] })}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                      >
                        Sardorga yo‘naltirish
                      </button>
                      <button
                        onClick={() => advanceReportWorkflow(rep.id, 'request_info', { note: reportNotes[rep.id] || 'Aniqlik kiriting' })}
                        className="px-3 py-1.5 rounded-lg bg-amber-500/15 text-amber-500 text-xs font-bold cursor-pointer"
                      >
                        Ma’lumot so‘rash
                      </button>
                      <button
                        onClick={() => advanceReportWorkflow(rep.id, 'reject', { note: reportNotes[rep.id] || 'Rad etildi' })}
                        className="px-3 py-1.5 rounded-lg bg-rose-500/15 text-rose-500 text-xs font-bold cursor-pointer"
                      >
                        Rad etish
                      </button>
                    </>
                  )}
                  {!['resolved', 'RESOLVED', 'rejected', 'REJECTED'].includes(rep.status) && (
                    <>
                      <button
                        onClick={() => advanceReportWorkflow(rep.id, 'final_verify', { note: reportNotes[rep.id] })}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-bold cursor-pointer"
                      >
                        Yakuniy hal etildi (Resolved)
                      </button>
                      <button
                        onClick={() =>
                          advanceReportWorkflow(rep.id, 'escalate', {
                            escalationTarget: rep.escalationTarget || 'Ekologiya inspeksiyasi',
                            note: reportNotes[rep.id] || 'Davlat organiga oshirildi',
                          })
                        }
                        className="px-3 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <AlertTriangle className="w-3.5 h-3.5" /> Eskalatsiya
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (section === 'reward_settings') {
    const fields: { key: keyof RewardSettings; label: string }[] = [
      { key: 'welcomeBonus', label: 'Xush kelibsiz bonusi (Onboarding)' },
      { key: 'dailyQuiz', label: 'Kunlik Eko-Viktorina' },
      { key: 'referralInviter', label: 'Referal (Taklif qilgan)' },
      { key: 'referralInvitee', label: 'Referal (Taklif qilingan)' },
      { key: 'awarenessPost', label: 'Targ‘ibot posti / video (Past mukofot)' },
      { key: 'wasteSorting', label: 'Chiqindilarni saralash (O‘rta mukofot)' },
      { key: 'treeCareWatering', label: 'Daraxt parvarishi va sug‘orish (Yuqori)' },
      { key: 'treePlanting', label: 'Daraxt ekish (Yuqori mukofot)' },
      { key: 'gardenProject', label: 'Maktab bog‘i loyihasi (Maxsus)' },
      { key: 'environmentalCampaign', label: 'Ekologik kampaniya' },
      { key: 'schoolImprovement', label: 'Maktab hududini obodonlashtirish' },
      { key: 'problemVerified', label: 'Muammo tasdiqlanganda (1-mukofot)' },
      { key: 'problemResolved', label: 'Muammo to‘liq hal etilganda (Qo‘shimcha)' },
      { key: 'ambassadorTaskBonus', label: 'Eko-Elchi vazifasi mukofoti' },
      { key: 'duplicateWindowHours', label: 'Dublikat bloklash oynasi (soat)' },
    ];

    return (
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-7 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Coins className="w-5 h-5 text-amber-500" />
              <span>Smart EcoCoin Mukofot Mezonlari</span>
            </h3>
            <p className="text-xs text-slate-500">Barcha mukofotlar markazlashgan tarzda shu sozlamalardan olinadi.</p>
          </div>
          <form onSubmit={handleSaveRewards} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {fields.map(f => (
              <div key={f.key}>
                <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300 mb-1">{f.label}</label>
                <input
                  type="number"
                  min={0}
                  value={Number(draftRewards[f.key] ?? 0)}
                  onChange={e => setDraftRewards(prev => ({ ...prev, [f.key]: Math.max(0, Number(e.target.value)) }))}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono tabular-nums"
                />
              </div>
            ))}
            <div className="sm:col-span-2 pt-2">
              <button
                type="submit"
                disabled={savingRewards}
                className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
              >
                <Save className="w-4 h-4" />
                <span>{savingRewards ? 'Saqlanmoqda...' : 'Mukofot qoidalarini saqlash'}</span>
              </button>
            </div>
          </form>
        </div>

        <div className="lg:col-span-5 space-y-6">
          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Qo‘lda EcoCoin Tuzatish (Audit bilan)</h3>
            <form onSubmit={handleAdjustCoins} className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Foydalanuvchi</label>
                <select
                  value={coinTargetUid}
                  onChange={e => setCoinTargetUid(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value="">Foydalanuvchini tanlang...</option>
                  {studentsLeaderboard.map(u => (
                    <option key={u.uid} value={u.uid}>
                      {u.fullName} ({u.schoolName}) — {u.ecoCoins} ECO
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Miqdor (+ qo‘shish yoki - ayirish)
                </label>
                <input
                  type="number"
                  value={coinDelta}
                  onChange={e => setCoinDelta(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Sabab (Audit jurnali uchun)</label>
                <input
                  type="text"
                  value={coinReason}
                  onChange={e => setCoinReason(e.target.value)}
                  placeholder="Masalan: Eko-chempionat g‘oliblik bonusi"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold cursor-pointer"
              >
                Balansni yangilash
              </button>
            </form>
          </div>

          <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3">
            <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <History className="w-4 h-4 text-sky-500" /> So‘nggi tanga tuzatishlari
            </h4>
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {auditLogs
                .filter(l => l.action === 'manual_coin_adjustment' || l.action === 'update_reward_settings')
                .slice(0, 5)
                .map(l => (
                  <div key={l.id} className="py-2 text-xs">
                    <div className="font-bold text-slate-900 dark:text-white">{l.action}</div>
                    <div className="text-[11px] text-slate-500 truncate">{JSON.stringify(l.details)}</div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // role_management
  const availableCoordDistricts = UZBEKISTAN_DISTRICTS[coordRegion] || [];

  return (
    <div className="space-y-6">
      {/* Super Admin: Direct Add Regional / District Coordinator */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-emerald-500" />
              <span>Yangi Viloyat / Tuman Koordinatorini Qo‘shish</span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Yangi koordinatorni to‘g‘ridan-to‘g‘ri yarating yoki mavjud foydalanuvchini hudud rahbarligiga tayinlang.
            </p>
          </div>

          <form onSubmit={handleCreateCoordinator} className="space-y-3">
            <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100 dark:bg-slate-800">
              <button
                type="button"
                onClick={() => setCoordRoleType('district_coordinator')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  coordRoleType === 'district_coordinator'
                    ? 'bg-emerald-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Tuman Koordinatori
              </button>
              <button
                type="button"
                onClick={() => setCoordRoleType('regional_coordinator')}
                className={`py-2 px-3 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  coordRoleType === 'regional_coordinator'
                    ? 'bg-indigo-600 text-white shadow-sm'
                    : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                Viloyat Koordinatori
              </button>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                F.I.Sh. (To‘liq ism) <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={coordFullName}
                onChange={e => setCoordFullName(e.target.value)}
                placeholder="Masalan: Alisher Karimov"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <div className={coordRoleType === 'district_coordinator' ? 'grid grid-cols-2 gap-3' : ''}>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Viloyat / Hudud <span className="text-rose-500">*</span>
                </label>
                <select
                  value={coordRegion}
                  onChange={e => {
                    const nextReg = e.target.value;
                    setCoordRegion(nextReg);
                    setCoordDistrict((UZBEKISTAN_DISTRICTS[nextReg] || [])[0] || '');
                  }}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                >
                  {UZBEKISTAN_REGIONS.map(r => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              {coordRoleType === 'district_coordinator' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Tuman / Shahar <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={coordDistrict}
                    onChange={e => setCoordDistrict(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                  >
                    {availableCoordDistricts.map(d => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Telefon raqam
                </label>
                <input
                  type="tel"
                  value={coordPhone}
                  onChange={e => setCoordPhone(e.target.value)}
                  placeholder="+998 90 123 45 67"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Telegram @username
                </label>
                <input
                  type="text"
                  value={coordTelegram}
                  onChange={e => setCoordTelegram(e.target.value)}
                  placeholder="@username"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                Email (ixtiyoriy)
              </label>
              <input
                type="email"
                value={coordEmail}
                onChange={e => setCoordEmail(e.target.value)}
                placeholder="koordinator@ecohero.uz"
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white"
              />
            </div>

            <button
              type="submit"
              disabled={creatingCoord}
              className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2 cursor-pointer transition-colors"
            >
              <UserPlus className="w-4 h-4" />
              <span>
                {creatingCoord
                  ? 'Saqlanmoqda...'
                  : coordRoleType === 'regional_coordinator'
                    ? 'Viloyat Koordinatorini Qo‘shish'
                    : 'Tuman Koordinatorini Qo‘shish'}
              </span>
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-emerald-500" />
              <span>Faol Viloyat va Tuman Koordinatorlari</span>
            </h3>
            <span className="text-xs font-mono text-slate-500">
              {regionalCoordsList.length} viloyat · {districtCoordsList.length} tuman
            </span>
          </div>

          <div className="space-y-4 max-h-[380px] overflow-y-auto pr-1">
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 mb-2">
                Viloyat Koordinatorlari ({regionalCoordsList.length})
              </p>
              {regionalCoordsList.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">Hozircha viloyat koordinatorlari qo‘shilmagan.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {regionalCoordsList.map(c => (
                    <div
                      key={c.uid}
                      className="p-3 rounded-xl bg-indigo-50/50 dark:bg-indigo-950/30 border border-indigo-200/70 dark:border-indigo-800/50 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 dark:text-white truncate">{c.fullName}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-indigo-600 text-white shrink-0">
                          Viloyat
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-indigo-700 dark:text-indigo-300">{c.region}</p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        {c.phoneNumber && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {c.phoneNumber}
                          </span>
                        )}
                        {c.telegramUsername && (
                          <span className="font-mono text-sky-600 dark:text-sky-400">{c.telegramUsername}</span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div>
              <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-2">
                Tuman Koordinatorlari ({districtCoordsList.length})
              </p>
              {districtCoordsList.length === 0 ? (
                <p className="text-xs text-slate-500 py-2">Hozircha tuman koordinatorlari qo‘shilmagan.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {districtCoordsList.map(c => (
                    <div
                      key={c.uid}
                      className="p-3 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200/70 dark:border-emerald-800/50 space-y-1 text-xs"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-bold text-slate-900 dark:text-white truncate">{c.fullName}</span>
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-600 text-white shrink-0">
                          Tuman
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-300">
                        {c.region} · {c.district}
                      </p>
                      <div className="flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
                        {c.phoneNumber && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" /> {c.phoneNumber}
                          </span>
                        )}
                        {c.telegramUsername && (
                          <span className="font-mono text-sky-600 dark:text-sky-400">{c.telegramUsername}</span>
                        )}
                        <span className="flex items-center gap-1">
                          <Mail className="w-3 h-3 opacity-60" /> {c.schoolsCount} maktab
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Existing Role Assignment / Revocation for Registered Users */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="text-lg font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-indigo-500" />
            <span>Mavjud Foydalanuvchi Lavozimini O‘zgartirish</span>
          </h3>
          <form onSubmit={handleRoleManage} className="space-y-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Foydalanuvchi</label>
              <select
                value={targetUid}
                onChange={e => setTargetUid(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
              >
                <option value="">Foydalanuvchini tanlang...</option>
                {studentsLeaderboard.map(u => (
                  <option key={u.uid} value={u.uid}>
                    {u.fullName} — [{u.role}] ({u.schoolName})
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Yangi lavozim</label>
                <select
                  value={newRole}
                  onChange={e => setNewRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value="student">O‘quvchi (student)</option>
                  <option value="ambassador">Eko-Elchi (ambassador)</option>
                  <option value="school_admin">Maktab Sardori (school_admin)</option>
                  <option value="district_coordinator">Tuman Koordinatori</option>
                  <option value="regional_coordinator">Viloyat Koordinatori</option>
                  <option value="moderator">Moderator</option>
                  <option value="sponsor">Homiy</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">Yoki rolini bekor qilish</label>
                <select
                  value={revokeRole}
                  onChange={e => setRevokeRole(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs"
                >
                  <option value="">Bekor qilinmaydi</option>
                  <option value="ambassador">Eko-Elchi bekor qilish</option>
                  <option value="school_admin">Maktab Sardori bekor qilish</option>
                  <option value="district_coordinator">Tuman Koordinatori bekor qilish</option>
                  <option value="regional_coordinator">Viloyat Koordinatori bekor qilish</option>
                  <option value="moderator">Moderator bekor qilish</option>
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                O‘zgarish / bekor qilish sababi <span className="text-rose-500">*</span>
              </label>
              <textarea
                rows={3}
                required
                value={roleReason}
                onChange={e => setRoleReason(e.target.value)}
                placeholder="Audit jurnali uchun rasmiy sababni kiriting..."
                className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs resize-none"
              />
            </div>
            <button
              type="submit"
              className="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold cursor-pointer"
            >
              {revokeRole ? 'Rolni bekor qilish va saqlash' : 'Rolni yangilash va saqlash'}
            </button>
          </form>
        </div>

        <div className="lg:col-span-7 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">Foydalanuvchilar va tasdiqlangan rollar</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                <tr>
                  <th className="py-2.5 pr-3">Foydalanuvchi</th>
                  <th className="py-2.5 px-3">Maktab / Hudud</th>
                  <th className="py-2.5 px-3">Joriy Rol</th>
                  <th className="py-2.5 pl-3 text-right">Balans</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {studentsLeaderboard.slice(0, 20).map(u => (
                  <tr key={u.uid}>
                    <td className="py-2.5 pr-3 font-bold text-slate-900 dark:text-white">{u.fullName}</td>
                    <td className="py-2.5 px-3 text-slate-500">
                      {u.schoolName} · {u.region}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-emerald-500 font-semibold">{u.role}</td>
                    <td className="py-2.5 pl-3 text-right font-mono tabular-nums">{(u.ecoCoins || 0).toLocaleString()} ECO</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};
