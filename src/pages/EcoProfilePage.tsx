import React, { useState } from 'react';
import {
  User,
  Settings,
  Shield,
  Award,
  Coins,
  TrendingUp,
  School as SchoolIcon,
  ChevronRight,
  LogOut,
  Camera,
  History,
  Star,
  Zap,
  Target,
  Share2,
  TreePine,
  Flame,
  CheckCircle2,
  Lock,
  Sparkles,
  RefreshCw,
  Link2,
  Copy,
  ExternalLink,
  Smartphone,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useEco } from '../context/EcoContext';
import { computeUserStreakState } from '../utils/streak';
import { calculateLevelProgress } from '../utils/level';
import { StudentCabinetRatingsPanel } from '../components/ratings/StudentCabinetRatingsPanel';
import ecopassportBannerImg from '../assets/images/ecopassport_banner_1795179383722.jpg';

export const EcoProfilePage: React.FC = () => {
  const {
    user,
    transactions,
    studentsLeaderboard,
    schools,
    missionCompletions,
    openEditProfileModal,
    openAuthModal,
    logoutUser,
    setActiveTab,
    showNotification,
    triggerHaptic,
    syncBootstrap,
    createTelegramLinkToken,
    sessionToken,
  } = useEco();

  const [syncingNow, setSyncingNow] = useState(false);
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const [linkPayload, setLinkPayload] = useState<{
    code?: string;
    deepLink?: string;
    botUsername?: string;
  } | null>(null);

  const handleManualSync = async () => {
    setSyncingNow(true);
    triggerHaptic('light');
    try {
      await syncBootstrap();
      showNotification('Yagona xotira natijalari sinxronlandi!', 'success');
    } finally {
      setSyncingNow(false);
    }
  };

  const handleGenerateTelegramLink = async () => {
    if (!sessionToken) {
      openAuthModal();
      showNotification("Avval veb-hisobingizga kiring yoki ro'yxatdan o'ting", 'info');
      return;
    }
    setLinkingTelegram(true);
    triggerHaptic('light');
    try {
      const res = await createTelegramLinkToken();
      if (!res.success || !res.code) {
        showNotification(res.error || "Bog'lash kodini yaratib bo'lmadi", 'warning');
        return;
      }
      setLinkPayload({
        code: res.code,
        deepLink: res.deepLink,
        botUsername: res.botUsername,
      });
      showNotification("Telegram bog'lash kodi tayyor!", 'success');
    } finally {
      setLinkingTelegram(false);
    }
  };

  const handleCopyCommand = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      triggerHaptic('success');
      showNotification('Nusxalandi: ' + cmd, 'success');
    } catch {
      showNotification("Qo'lda nusxalab oling: " + cmd, 'info');
    }
  };

  const userRankIdx = studentsLeaderboard.findIndex(s => s.uid === user.uid);
  const schoolObj = schools.find(s => s.id === user.schoolId);
  const rankDisplay = userRankIdx >= 0 ? `#${userRankIdx + 1}` : schoolObj ? `#${schoolObj.ratingRank}` : '—';

  const userXP = user.ecoXP || (user.totalCoinsEarned || user.ecoCoins || 0) * 4;
  const levelProgress = calculateLevelProgress(userXP);
  const computedLevel = levelProgress.level;
  const xpIntoLevel = levelProgress.xpIntoLevel;
  const xpRequiredForNextLevel = levelProgress.xpRequiredForNextLevel;
  const xpRemainingForNextLevel = levelProgress.xpRemainingForNextLevel;
  const xpProgressPct = levelProgress.progressPct;

  const streakDays = computeUserStreakState({
    lastStreakClaimDate: user.lastStreakClaimDate,
    storedStreakDays: user.streakDays ?? user.activityStats?.streakDays,
  }).currentStreakDays;

  const stats = [
    { label: 'EcoCoins', value: (user.ecoCoins || 0).toLocaleString(), icon: Coins, color: 'text-amber-500' },
    { label: 'EcoXP', value: userXP.toLocaleString(), icon: TrendingUp, color: 'text-emerald-500' },
    { label: 'Hisobotlar', value: `${user.reportsCount || 0} ta`, icon: Target, color: 'text-sky-500' },
    { label: 'Reyting', value: rankDisplay, icon: Award, color: 'text-indigo-400' },
  ];

  // Real data-driven achievement milestones
  const achievements = [
    {
      id: 'rank',
      title: user.badge || 'Eko-Lochin',
      desc: 'Asosiy EcoHero unvoni',
      icon: Star,
      unlocked: true,
      progressLabel: `Lv.${computedLevel}`,
      tone: 'text-amber-400 bg-amber-500/15 border-amber-400/35',
    },
    {
      id: 'trees',
      title: "Ko'chat Ekuvchi",
      desc: 'Kamida 5 ta daraxt ekish',
      icon: TreePine,
      unlocked: (user.treesPlanted || 0) >= 5,
      progressLabel: `${user.treesPlanted || 0} / 5`,
      tone: 'text-emerald-400 bg-emerald-500/15 border-emerald-500/35',
    },
    {
      id: 'reports',
      title: 'Eko-Nazoratchi',
      desc: 'Kamida 3 ta ekologik ariza',
      icon: Target,
      unlocked: (user.reportsCount || 0) >= 3,
      progressLabel: `${user.reportsCount || 0} / 3`,
      tone: 'text-sky-400 bg-sky-500/15 border-sky-500/35',
    },
    {
      id: 'streak',
      title: '7-Kunlik Barqarorlik',
      desc: 'Ketma-ket 7 kun faollik',
      icon: Flame,
      unlocked: streakDays >= 7,
      progressLabel: `${streakDays} / 7 kun`,
      tone: 'text-orange-400 bg-orange-500/15 border-orange-500/35',
    },
    {
      id: 'missions',
      title: 'Missiya Ustasi',
      desc: 'Kamida 3 ta missiyani yakunlash',
      icon: CheckCircle2,
      unlocked: missionCompletions.length >= 3,
      progressLabel: `${missionCompletions.length} / 3`,
      tone: 'text-teal-400 bg-teal-500/15 border-teal-500/35',
    },
    {
      id: 'referrals',
      title: "Do'stlar Elchisi",
      desc: "Do'stlarni platformaga taklif qilish",
      icon: Share2,
      unlocked: (user.referralCount || 0) >= 1,
      progressLabel: `${user.referralCount || 0} / 1`,
      tone: 'text-indigo-400 bg-indigo-500/15 border-indigo-500/35',
    },
  ];

  const recentTxs = transactions.slice(0, 6);
  const passportSerial = `UZ-${String(user.uid || 'ECO001').slice(-6).toUpperCase()}`;

  return (
    <div className="min-h-screen bg-[#F4F8F5] dark:bg-[#040D0A] text-slate-900 dark:text-white pb-24">
      {/* EcoPassport Banner */}
      <div className="relative h-[340px] sm:h-[370px] w-full overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src={ecopassportBannerImg}
            className="w-full h-full object-cover opacity-55 dark:opacity-45"
            alt="EcoPassport fon rasmi"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#040D0A]/30 via-[#040D0A]/55 to-[#F4F8F5] dark:to-[#040D0A]" />
        </div>

        <div className="relative z-10 max-w-5xl mx-auto px-4 h-full flex flex-col items-center justify-center space-y-5 pt-6 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-[#040D0A]/75 backdrop-blur-md border border-emerald-400/30 text-[10px] font-mono font-bold uppercase tracking-widest text-emerald-300">
            <Sparkles className="w-3.5 h-3.5 text-emerald-400" />
            <span>EcoPassport · ID {passportSerial}</span>
          </div>

          <div className="relative group">
            <div className="w-28 h-28 sm:w-32 sm:h-32 rounded-[36px] border-4 border-emerald-400/70 shadow-2xl shadow-emerald-950/60 overflow-hidden relative bg-[#071812]">
              <img
                src={
                  user.avatarUrl ||
                  user.profileImage ||
                  `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.fullName || 'EcoHero')}`
                }
                alt={user.fullName}
                className="w-full h-full object-cover"
              />
            </div>
            <span className="absolute -top-2 -left-2 px-2.5 py-1 rounded-xl bg-gradient-to-r from-emerald-400 to-teal-300 text-[#040D0A] font-mono font-black text-xs shadow-lg">
              Lv.{computedLevel}
            </span>
            <button
              onClick={() => {
                triggerHaptic('light');
                openEditProfileModal();
              }}
              aria-label="Profilni tahrirlash"
              className="absolute -bottom-2 -right-2 p-2.5 bg-emerald-500 text-[#040D0A] rounded-2xl shadow-xl hover:scale-110 active:scale-95 transition-all cursor-pointer"
            >
              <Camera className="w-4 h-4" />
            </button>
          </div>

          <div className="space-y-1.5 max-w-xl">
            <h1 className="font-display text-3xl sm:text-4xl font-black uppercase tracking-tight text-white drop-shadow">
              {user.fullName}
            </h1>
            <div className="flex flex-wrap items-center justify-center gap-2.5 text-[11px] font-bold text-slate-200 uppercase tracking-wider">
              <span className="flex items-center gap-1">
                <SchoolIcon className="w-3.5 h-3.5 text-emerald-400" /> {user.schoolName}
              </span>
              {user.district && (
                <>
                  <span>·</span>
                  <span>{user.district}</span>
                </>
              )}
              <span>·</span>
              <span className="flex items-center gap-1 text-emerald-300">
                <Shield className="w-3.5 h-3.5" /> {user.role}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 -mt-8 relative z-20 space-y-8">
        {/* XP Progress & Quick Stats */}
        <div className="eco-surface rounded-[28px] p-5 sm:p-6 shadow-xl space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 font-extrabold text-slate-900 dark:text-white">
              <TrendingUp className="w-4 h-4 text-emerald-500" />
              <span>Daraja {computedLevel} · {user.badge || 'Eko-Lochin'}</span>
            </div>
            <span className="font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-bold">
              {xpIntoLevel.toLocaleString()} / {xpRequiredForNextLevel.toLocaleString()} XP · Keyingi darajagacha {xpRemainingForNextLevel.toLocaleString()} XP
            </span>
          </div>
          <div className="w-full h-2.5 rounded-full bg-slate-200 dark:bg-[#040D0A] overflow-hidden border border-slate-200 dark:border-emerald-500/20">
            <div
              style={{ width: `${xpProgressPct}%` }}
              className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-emerald-400 to-teal-300 transition-all duration-500"
            />
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5 pt-1">
            {stats.map((stat, idx) => (
              <motion.div
                key={idx}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.06 }}
                className="p-4 bg-white/80 dark:bg-[#040D0A]/80 rounded-2xl border border-slate-200/80 dark:border-emerald-500/15 text-center space-y-1.5"
              >
                <div className={`w-9 h-9 rounded-xl bg-slate-100 dark:bg-[#081C15] ${stat.color} flex items-center justify-center mx-auto`}>
                  <stat.icon className="w-4 h-4" />
                </div>
                <div className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">
                  {stat.label}
                </div>
                <div className="text-lg font-black font-mono tabular-nums text-slate-900 dark:text-white">
                  {stat.value}
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        {/* Live School & District Student Ratings */}
        <StudentCabinetRatingsPanel onOpenFullRatings={() => setActiveTab('rating')} />

        {/* Achievements & Activity + Settings */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-8 space-y-6">
            {/* Achievement Collection Grid */}
            <div className="eco-surface rounded-3xl overflow-hidden shadow-xl">
              <div className="px-4 py-3.5 sm:px-5 sm:py-4 border-b border-slate-200/80 dark:border-emerald-500/15 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h3 className="font-display text-sm sm:text-base font-black uppercase tracking-tight truncate">
                    EcoPassport Nishonlari
                  </h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                    Ekologik yutuqlar kolleksiyasi
                  </p>
                </div>
                <span className="font-mono tabular-nums text-xs font-bold text-emerald-600 dark:text-emerald-400 whitespace-nowrap shrink-0">
                  {achievements.filter(a => a.unlocked).length} / {achievements.length}
                </span>
              </div>
              <div className="p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                {achievements.map(badge => {
                  const Icon = badge.icon;
                  return (
                    <div
                      key={badge.id}
                      className={`p-3 rounded-2xl border flex flex-col justify-between gap-2 transition-all min-w-0 ${
                        badge.unlocked
                          ? 'bg-white/90 dark:bg-[#040D0A]/80 border-emerald-500/35 shadow-sm'
                          : 'bg-slate-100/70 dark:bg-[#040D0A]/45 border-slate-200 dark:border-slate-800/80 opacity-75'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <div className={`w-8 h-8 rounded-xl border flex items-center justify-center shrink-0 ${badge.tone}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        {badge.unlocked ? (
                          <span className="text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider whitespace-nowrap">
                            Ochilgan
                          </span>
                        ) : (
                          <Lock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                      </div>
                      <div className="space-y-0.5 min-w-0">
                        <div className="text-xs font-extrabold text-slate-900 dark:text-white truncate">
                          {badge.title}
                        </div>
                        <div className="text-[10px] leading-snug text-slate-500 dark:text-slate-400 line-clamp-2">
                          {badge.desc}
                        </div>
                      </div>
                      <div className="text-[10px] font-mono tabular-nums font-bold text-slate-600 dark:text-emerald-300">
                        {badge.progressLabel}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Activity History */}
            <div className="eco-surface rounded-[28px] overflow-hidden shadow-xl">
              <div className="p-6 border-b border-slate-200/80 dark:border-emerald-500/15 flex items-center justify-between">
                <h3 className="font-display text-lg font-black uppercase tracking-tight">
                  So&apos;nggi Harakatlar
                </h3>
                <History className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="p-4 space-y-2">
                {recentTxs.length > 0 ? (
                  recentTxs.map(act => (
                    <div
                      key={act.id}
                      className="flex items-center justify-between p-3.5 hover:bg-emerald-500/5 rounded-2xl transition-colors"
                    >
                      <div className="flex items-center gap-3.5 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/15 flex items-center justify-center text-emerald-500 shrink-0">
                          <Zap className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs sm:text-sm font-extrabold tracking-tight truncate">{act.reason}</div>
                          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase font-mono">
                            {new Date(act.createdAt).toLocaleDateString('uz-UZ', {
                              day: '2-digit',
                              month: 'short',
                            })}
                          </div>
                        </div>
                      </div>
                      <div className={`font-black font-mono tabular-nums shrink-0 ml-3 ${act.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {act.amount >= 0 ? `+${act.amount}` : act.amount} EC
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-slate-500 dark:text-slate-400 font-semibold">
                    Hali tranzaksiyalar mavjud emas. Eko-hisobot yuboring yoki viktorina o&apos;ynang!
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="lg:col-span-4 space-y-6">
            {/* Unified Memory & Cross-Platform Sync Card */}
            <div className="eco-surface rounded-[28px] p-5 shadow-xl space-y-4">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 dark:text-white">
                      Yagona Xotira Tizimi
                    </h3>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400">
                      Bot · Mini App · Web/PWA
                    </p>
                  </div>
                </div>
                <button
                  onClick={handleManualSync}
                  disabled={syncingNow}
                  title="Natijalarni sinxronlash"
                  className="p-2 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-600 dark:text-emerald-400 transition-colors cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${syncingNow ? 'animate-spin' : ''}`} />
                </button>
              </div>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/70 dark:bg-[#040D0A]/70 border border-slate-200/70 dark:border-emerald-500/15">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Web / PWA Ilova</span>
                  <span className="font-extrabold text-emerald-600 dark:text-emerald-400">Faol</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/70 dark:bg-[#040D0A]/70 border border-slate-200/70 dark:border-emerald-500/15">
                  <span className="font-bold text-slate-700 dark:text-slate-300">Telegram Bot & Mini App</span>
                  {user.telegramId ? (
                    <span className="font-extrabold text-emerald-600 dark:text-emerald-400 truncate max-w-[140px]">
                      {user.telegramUsername || `ID:${user.telegramId}`}
                    </span>
                  ) : (
                    <span className="font-bold text-amber-500">Ulanmagan</span>
                  )}
                </div>
              </div>

              {!user.telegramId ? (
                <div className="space-y-3">
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                    Telegram botdagi va ilovadagi natijalaringiz bir xil bo&apos;lishi uchun profilingizni botga bog&apos;lang:
                  </p>
                  <button
                    onClick={handleGenerateTelegramLink}
                    disabled={linkingTelegram}
                    className="w-full py-2.5 px-3 rounded-2xl bg-emerald-500 hover:bg-emerald-400 text-[#040D0A] font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Link2 className="w-4 h-4" />
                    <span>{linkingTelegram ? 'Kod yaratilmoqda...' : "Telegram Bot bilan bog'lash"}</span>
                  </button>

                  {linkPayload?.code && (
                    <div className="p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 space-y-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200">
                          Botga yuborish kodi:
                        </span>
                        <button
                          type="button"
                          onClick={() => handleCopyCommand(`/link ${linkPayload.code}`)}
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-white/80 dark:bg-[#040D0A] text-[11px] font-mono font-bold text-emerald-600 dark:text-emerald-400 cursor-pointer"
                        >
                          <Copy className="w-3 h-3" />
                          <span>/link {linkPayload.code}</span>
                        </button>
                      </div>
                      {linkPayload.deepLink && (
                        <a
                          href={linkPayload.deepLink}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="w-full py-2 px-3 rounded-xl bg-slate-900 dark:bg-white text-white dark:text-[#040D0A] text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Telegram Botda 1 bosishda ulash</span>
                        </a>
                      )}
                    </div>
                  )}
                </div>
              ) : (
                <p className="text-[11px] text-emerald-700 dark:text-emerald-300/90 leading-relaxed">
                  EcoCoin, EcoXP, daraja va yutuqlaringiz barcha qurilmalarda yagona markaziy xotirada bir xil saqlanmoqda. Botda <code className="font-mono font-bold">/web</code> yuborib boshqa brauzerlarga ham kiring.
                </p>
              )}
            </div>

            <div className="eco-surface rounded-[28px] p-5 shadow-xl space-y-3">
              <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest px-2">
                Sozlamalar
              </h3>
              <div className="space-y-1">
                {[
                  { label: 'Profilni tahrirlash', icon: User, onClick: openEditProfileModal },
                  {
                    label: 'Bildirishnomalar',
                    icon: Settings,
                    onClick: () => showNotification('Barcha Telegram va tizim xabarnomalari yoqilgan!', 'info'),
                  },
                  {
                    label: 'Xavfsizlik',
                    icon: Shield,
                    onClick: () => showNotification("Ma'lumotlar shifrlangan va himoyalangan.", 'info'),
                  },
                  { label: "Do'stlarni taklif qilish", icon: Share2, onClick: () => setActiveTab('referral') },
                ].map((item, i) => (
                  <button
                    key={i}
                    onClick={item.onClick}
                    className="w-full flex items-center justify-between p-3.5 hover:bg-emerald-500/10 rounded-2xl transition-all group cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="w-4 h-4 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                      <span className="text-xs font-extrabold">{item.label}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-400 group-hover:translate-x-1 transition-transform" />
                  </button>
                ))}
              </div>
              <div className="pt-3 border-t border-slate-200 dark:border-emerald-500/15">
                <button
                  onClick={() => logoutUser()}
                  className="w-full flex items-center gap-3 p-3.5 text-rose-500 hover:bg-rose-500/10 rounded-2xl transition-all cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="text-xs font-black uppercase tracking-wider">Chiqish</span>
                </button>
              </div>
            </div>

            <div className="bg-gradient-to-br from-[#0A2E20] via-[#082218] to-[#040D0A] border border-emerald-500/30 rounded-[28px] p-6 text-white space-y-5 shadow-2xl">
              <div className="w-11 h-11 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300">
                <Star className="w-5 h-5 fill-emerald-400" />
              </div>
              <div className="space-y-1.5">
                <h4 className="font-display text-lg font-black uppercase tracking-tight">Eko-Bozor & Sovg&apos;alar</h4>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Yig&apos;gan EcoCoinlaringizni qimmatbaho sovg&apos;alar va rasmiy sertifikatlarga almashtiring.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('shop')}
                className="w-full py-3.5 bg-gradient-to-r from-emerald-400 to-teal-300 text-[#040D0A] rounded-2xl text-xs font-black uppercase tracking-wider hover:brightness-105 transition-all shadow-lg cursor-pointer"
              >
                Eko-Bozorga O&apos;tish
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
