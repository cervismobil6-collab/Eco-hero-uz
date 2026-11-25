import React, { useMemo, useState } from 'react';
import {
  Coins,
  Award,
  Camera,
  AlertTriangle,
  School as SchoolIcon,
  CheckCircle2,
  Clock,
  XCircle,
  ArrowUpRight,
  UserCheck,
  ShieldAlert,
  FileVideo,
  Image as ImageIcon,
} from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import { EcoTelegramChatPanel } from '../chat/EcoTelegramChatPanel';
import { calculateLevelFromXp } from '../../utils/level';

export const StudentDashboardView: React.FC = () => {
  const {
    user,
    schools,
    reports,
    mediaSubmissions,
    transactions,
    registrationApplications,
    rewardSettings,
    setActiveTab,
    openRoleRequestModal,
    fetchChatPermissions,
    subscribeChatEvents,
  } = useEco();

  const [sectionTab, setSectionTab] = useState<'overview' | 'reports' | 'media' | 'coins' | 'chat'>('overview');
  const [pendingChatRequests, setPendingChatRequests] = useState(0);

  React.useEffect(() => {
    let active = true;
    const refreshPerms = () => {
      fetchChatPermissions().then(res => {
        if (!active || !res.success) return;
        const count = res.permissions.filter(
          p => p.status === 'pending' && String(p.targetUid) === String(user.uid)
        ).length;
        setPendingChatRequests(count);
      });
    };
    refreshPerms();
    const unsub = subscribeChatEvents(evt => {
      if (evt.type === 'chat:permission_updated' || evt.type === 'chat:permission_update') {
        refreshPerms();
      }
    });
    return () => {
      active = false;
      unsub();
    };
  }, [fetchChatPermissions, subscribeChatEvents, user.uid]);

  const mySchool = useMemo(
    () => schools.find(s => s.id === user.schoolId || s.name === user.schoolName),
    [schools, user.schoolId, user.schoolName]
  );

  const myReports = useMemo(
    () => reports.filter(r => r.reporterUid === user.uid || r.reporterName === user.fullName),
    [reports, user.uid, user.fullName]
  );

  const myMedia = useMemo(
    () => mediaSubmissions.filter(m => m.userId === user.uid),
    [mediaSubmissions, user.uid]
  );

  const schoolActivities = useMemo(
    () =>
      mediaSubmissions
        .filter(m => m.status === 'APPROVED' && (m.schoolId === user.schoolId || m.schoolName === user.schoolName))
        .slice(0, 6),
    [mediaSubmissions, user.schoolId, user.schoolName]
  );

  const myApps = useMemo(
    () => registrationApplications.filter(a => a.userId === user.uid),
    [registrationApplications, user.uid]
  );

  const pendingCoinsEstimate = useMemo(() => {
    const pendingReportsCount = myReports.filter(
      r => r.status === 'pending' || r.status === 'PENDING_REVIEW' || r.status === 'NEEDS_INFO'
    ).length;
    const pendingMediaEstimate = myMedia
      .filter(m => m.status === 'PENDING' || m.status === 'NEEDS_REVISION')
      .reduce((sum, m) => {
        const keyMap: Record<string, keyof typeof rewardSettings> = {
          tree_planting: 'treePlanting',
          tree_care: 'treeCareWatering',
          school_garden: 'gardenProject',
          awareness_video: 'awarenessPost',
          waste_sorting: 'wasteSorting',
          school_improvement: 'schoolImprovement',
          environmental_campaign: 'environmentalCampaign',
        };
        const val = Number(rewardSettings[keyMap[m.activityCategory] || 'awarenessPost'] || 0);
        return sum + val;
      }, 0);
    return pendingReportsCount * (rewardSettings.problemVerified || 100) + pendingMediaEstimate;
  }, [myReports, myMedia, rewardSettings]);

  const approvedCoinsTotal = useMemo(
    () =>
      transactions
        .filter(t => t.type !== 'spend' && t.status !== 'rejected' && t.status !== 'pending' && t.amount > 0)
        .reduce((s, t) => s + t.amount, 0),
    [transactions]
  );

  const rejectedCount = useMemo(
    () =>
      myReports.filter(r => r.status === 'rejected' || r.status === 'REJECTED').length +
      myMedia.filter(m => m.status === 'REJECTED').length,
    [myReports, myMedia]
  );

  return (
    <div className="space-y-6">
      {/* Personal Eco Profile Header */}
      <div className="p-6 md:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="flex items-start sm:items-center gap-4">
          <img
            src={user.avatarUrl || user.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.fullName)}`}
            alt={user.fullName}
            referrerPolicy="no-referrer"
            className="w-16 h-16 rounded-2xl object-cover border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800 shrink-0"
          />
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400 font-medium">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold">O‘quvchi Kabineti</span>
              <span aria-hidden="true">·</span>
              <span>{user.badge || 'Eko-Qahramon'}</span>
              <span aria-hidden="true">·</span>
              <span>Daraja {calculateLevelFromXp(Number(user.ecoXP || (user.totalCoinsEarned || user.ecoCoins || 0) * 4))}</span>
            </div>
            <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white truncate">
              {user.fullName}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {user.schoolName} · {user.district}, {user.region}
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            onClick={() => setActiveTab('report')}
            className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <AlertTriangle className="w-4 h-4" />
            <span>Muammo yuborish</span>
          </button>
          <button
            onClick={() => setActiveTab('media')}
            className="px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-xs font-bold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Camera className="w-4 h-4" />
            <span>Foto / Video yuklash</span>
          </button>
          <button
            onClick={() => openRoleRequestModal('ambassador')}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold flex items-center gap-2 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserCheck className="w-4 h-4 text-emerald-500" />
            <span>Elchi / Sardor bo‘lish</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Joriy Balans</span>
            <Coins className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
            {(user.ecoCoins || 0).toLocaleString()} <span className="text-xs font-semibold text-amber-500">ECO</span>
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Eko-Bozorda sarflash uchun</div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Tasdiqlangan Jami</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
            {Math.max(approvedCoinsTotal, user.totalCoinsEarned || user.ecoCoins || 0).toLocaleString()} ECO
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Faqat moderatsiyadan o‘tgan</div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Kutilayotgan Mukofot</span>
            <Clock className="w-4 h-4 text-sky-500" />
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-sky-600 dark:text-sky-400">
            {pendingCoinsEstimate.toLocaleString()} ECO
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">Tekshiruv jarayonida</div>
        </div>

        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 font-medium">
            <span>Maktab Reytingi</span>
            <SchoolIcon className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
            #{mySchool?.ratingRank || 1}
          </div>
          <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
            {mySchool ? `${mySchool.totalCoins.toLocaleString()} ECO · ${mySchool.treesPlanted} daraxt` : user.schoolName}
          </div>
        </div>
      </div>

      {/* Sub-Navigation */}
      <div className="flex flex-wrap items-center gap-1 p-1 bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl w-fit">
        {[
          { id: 'overview', label: 'Umumiy ko‘rinish' },
          { id: 'reports', label: `Hisobotlarim (${myReports.length})` },
          { id: 'media', label: `Eko-Medialar (${myMedia.length})` },
          { id: 'coins', label: `Tanga tarixi (${transactions.length})` },
          {
            id: 'chat',
            label: pendingChatRequests > 0 ? `Suhbatlar (${pendingChatRequests} yangi so‘rov)` : 'Suhbatlar (Ruxsatli)',
          },
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setSectionTab(t.id as any)}
            className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
              sectionTab === t.id
                ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-sm'
                : t.id === 'chat' && pendingChatRequests > 0
                ? 'text-amber-600 dark:text-amber-400 hover:text-amber-700'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {pendingChatRequests > 0 && sectionTab !== 'chat' && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex flex-wrap items-center justify-between gap-3 text-xs">
          <span className="font-semibold text-amber-700 dark:text-amber-300">
            Sizga {pendingChatRequests} ta yangi suhbat ruxsati so‘rovi keldi — ruxsat bermaguningizcha yozib bo‘lmaydi.
          </span>
          <button
            type="button"
            onClick={() => setSectionTab('chat')}
            className="px-3.5 py-1.5 rounded-xl bg-amber-500 text-slate-950 font-bold cursor-pointer"
          >
            So‘rovlarni ko‘rish
          </button>
        </div>
      )}

      {sectionTab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* School Permitted Activities */}
          <div className="lg:col-span-7 p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Maktabning tasdiqlangan eko-faoliyatlari</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {user.schoolName} bo‘yicha ruxsat etilgan tashabbuslar
                </p>
              </div>
              <button
                onClick={() => setActiveTab('rating')}
                className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Umumiy reyting</span>
                <ArrowUpRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {schoolActivities.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500 dark:text-slate-400 space-y-3 border-t border-slate-100 dark:border-slate-800">
                <p>Hozircha maktabingiz bo‘yicha tasdiqlangan media faoliyatlar yo‘q.</p>
                <button
                  onClick={() => setActiveTab('media')}
                  className="px-4 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
                >
                  Birinchi eko-faoliyatni yuklash
                </button>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 dark:divide-slate-800">
                {schoolActivities.map(item => (
                  <div key={item.id} className="py-3 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 overflow-hidden">
                        {item.mediaType === 'video' ? (
                          <FileVideo className="w-5 h-5 text-emerald-500" />
                        ) : (
                          <img src={item.mediaUrl} alt={item.description} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{item.description}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {item.userName} · {new Date(item.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <span className="text-xs font-bold font-mono tabular-nums text-emerald-600 dark:text-emerald-400 shrink-0">
                      +{item.awardedCoins} ECO
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Achievements, Role Applications & Safety Note */}
          <div className="lg:col-span-5 space-y-6">
            <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-base font-bold text-slate-900 dark:text-white">Lavozimga ariza holati</h3>
                <button
                  onClick={() => openRoleRequestModal('school_admin')}
                  className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 cursor-pointer"
                >
                  + Ariza topshirish
                </button>
              </div>
              {myApps.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Maktab Sardori yoki Eko-Elchi lavozimiga ariza topshirib, maktabingiz jamoasini boshqarishingiz mumkin.
                </p>
              ) : (
                <div className="divide-y divide-slate-100 dark:divide-slate-800">
                  {myApps.slice(0, 3).map(app => (
                    <div key={app.id} className="py-2.5 flex items-center justify-between text-xs">
                      <div>
                        <div className="font-bold text-slate-900 dark:text-white">{app.requestedRoleName || app.requestedRole}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{app.officialSchoolName}</div>
                      </div>
                      <span
                        className={`font-bold ${
                          app.status === 'approved'
                            ? 'text-emerald-500'
                            : app.status === 'rejected'
                            ? 'text-rose-500'
                            : 'text-amber-500'
                        }`}
                      >
                        {app.status === 'needs_info' ? 'Ma’lumot kutilmoqda' : app.status}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-5 rounded-2xl bg-amber-500/5 border border-amber-500/20 space-y-2">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Xavfsizlik eslatmasi (O‘quvchilar uchun)</span>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Elektr simlari, kimyoviy chiqindilar yoki xavfli joylarga yaqinlashmang — ularni faqat masofadan rasmga olib yuboring; ma’muriyat vakolatli xizmatlarga yo‘naltiradi.
              </p>
              {rejectedCount > 0 && (
                <div className="text-[11px] text-rose-500 font-semibold pt-1">
                  Rad etilgan arizalar soni: {rejectedCount} ta (tahrirlab qayta yuborishingiz mumkin)
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {sectionTab === 'reports' && (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Yuborgan ekologik muammolaringiz</h3>
            <button
              onClick={() => setActiveTab('report')}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
            >
              + Yangi hisobot
            </button>
          </div>
          {myReports.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">Hozircha hisobot yubormagansiz.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-3 pr-4">Muammo</th>
                    <th className="py-3 px-4">Toifa / Xavf</th>
                    <th className="py-3 px-4">Holat</th>
                    <th className="py-3 pl-4 text-right">Mukofot</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {myReports.map(rep => (
                    <tr key={rep.id}>
                      <td className="py-3 pr-4">
                        <div className="font-bold text-slate-900 dark:text-white">{rep.title}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">
                          {new Date(rep.createdAt).toLocaleDateString()} · {rep.schoolName}
                        </div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="text-slate-700 dark:text-slate-300">{rep.category}</span>
                        {rep.isHazardous && (
                          <span className="block text-[11px] font-bold text-rose-500">Xavfli (Eskalatsiya)</span>
                        )}
                      </td>
                      <td className="py-3 px-4 font-semibold">{rep.status}</td>
                      <td className="py-3 pl-4 text-right font-mono tabular-nums font-bold text-emerald-600 dark:text-emerald-400">
                        +{rep.rewardCoins} ECO
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {sectionTab === 'media' && (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900 dark:text-white">Yuklangan foto va video faoliyatlar</h3>
            <button
              onClick={() => setActiveTab('media')}
              className="px-3.5 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold cursor-pointer"
            >
              + Media yuklash
            </button>
          </div>
          {myMedia.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">
              Hali foto yoki video faoliyat yuklamadingiz.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {myMedia.map(m => (
                <div key={m.id} className="rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden bg-slate-50 dark:bg-slate-950/60">
                  <div className="aspect-video bg-slate-200 dark:bg-slate-800 relative">
                    {m.mediaType === 'video' ? (
                      <video src={m.mediaUrl} controls className="w-full h-full object-cover" />
                    ) : (
                      <img src={m.mediaUrl} alt={m.description} referrerPolicy="no-referrer" className="w-full h-full object-cover" />
                    )}
                  </div>
                  <div className="p-4 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-bold">
                      <span className="text-slate-500 dark:text-slate-400">{m.activityCategory}</span>
                      <span
                        className={
                          m.status === 'APPROVED'
                            ? 'text-emerald-500'
                            : m.status === 'REJECTED'
                            ? 'text-rose-500'
                            : 'text-amber-500'
                        }
                      >
                        {m.status}
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-slate-900 dark:text-white line-clamp-2">{m.description}</p>
                    <div className="flex items-center justify-between text-xs pt-1 border-t border-slate-200 dark:border-slate-800">
                      <span className="text-slate-500">{new Date(m.createdAt).toLocaleDateString()}</span>
                      <span className="font-mono font-bold text-emerald-500">
                        {m.status === 'APPROVED' ? `+${m.awardedCoins} ECO` : 'Kutilmoqda'}
                      </span>
                    </div>
                    {m.moderatorNote && <p className="text-[11px] text-amber-500">Izoh: {m.moderatorNote}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {sectionTab === 'coins' && (
        <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-4">
          <h3 className="text-base font-bold text-slate-900 dark:text-white">EcoCoin Tranzaksiya Tarixi</h3>
          {transactions.length === 0 ? (
            <p className="text-xs text-slate-500 dark:text-slate-400 py-8 text-center">Tranzaksiyalar hali mavjud emas.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <tr>
                    <th className="py-3 pr-4">Sana</th>
                    <th className="py-3 px-4">Sabab</th>
                    <th className="py-3 px-4">Holat</th>
                    <th className="py-3 pl-4 text-right">Miqdor</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {transactions.map(tx => (
                    <tr key={tx.id}>
                      <td className="py-3 pr-4 font-mono tabular-nums text-slate-500 whitespace-nowrap">
                        {new Date(tx.createdAt).toLocaleDateString()}
                      </td>
                      <td className="py-3 px-4 font-semibold text-slate-900 dark:text-white">{tx.reason}</td>
                      <td className="py-3 px-4">
                        <span
                          className={`font-semibold ${
                            tx.status === 'rejected'
                              ? 'text-rose-500'
                              : tx.status === 'pending'
                              ? 'text-amber-500'
                              : 'text-emerald-500'
                          }`}
                        >
                          {tx.status || 'approved'}
                        </span>
                      </td>
                      <td
                        className={`py-3 pl-4 text-right font-mono tabular-nums font-bold ${
                          tx.amount >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                        }`}
                      >
                        {tx.amount >= 0 ? `+${tx.amount}` : tx.amount} ECO
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {sectionTab === 'chat' && (
        <EcoTelegramChatPanel
          allowedScopes={['student_dm']}
          allowStudentDiscovery={true}
          title="O‘quvchilararo Ruxsatli Suhbat"
        />
      )}
    </div>
  );
};
