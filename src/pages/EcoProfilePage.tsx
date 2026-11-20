import React from 'react';
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
} from 'lucide-react';
import { motion } from 'framer-motion';
import { useEco } from '../context/EcoContext';
import { computeUserStreakState } from '../utils/streak';

export const EcoProfilePage: React.FC = () => {
  const {
    user,
    transactions,
    studentsLeaderboard,
    schools,
    openEditProfileModal,
    logoutUser,
    setActiveTab,
    showNotification,
    triggerHaptic,
  } = useEco();

  const userRankIdx = studentsLeaderboard.findIndex(s => s.uid === user.uid);
  const schoolObj = schools.find(s => s.id === user.schoolId);
  const rankDisplay = userRankIdx >= 0 ? `#${userRankIdx + 1}` : schoolObj ? `#${schoolObj.ratingRank}` : '—';

  const stats = [
    { label: 'EcoCoins', value: (user.ecoCoins || 0).toLocaleString(), icon: Coins, color: 'text-amber-500' },
    { label: 'EcoXP', value: (user.ecoXP || (user.totalCoinsEarned || 0) * 4).toLocaleString(), icon: TrendingUp, color: 'text-emerald-500' },
    { label: 'Hisobotlar', value: `${user.reportsCount || 0} ta`, icon: Target, color: 'text-sky-500' },
    { label: 'Reyting', value: rankDisplay, icon: Award, color: 'text-indigo-500' },
  ];

  const recentTxs = transactions.slice(0, 5);

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-white pb-24">
      {/* Cinematic Header */}
      <div className="relative h-[350px] w-full overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img
            src="https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=2000&q=80"
            className="w-full h-full object-cover opacity-40 dark:opacity-20 scale-110 blur-sm"
            alt="Profile Background"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-50/0 via-slate-50/50 to-slate-50 dark:from-[#020617]/0 dark:via-[#020617]/50 dark:to-[#020617]" />
        </div>

        <div className="relative z-10 max-w-4xl mx-auto px-4 h-full flex flex-col items-center justify-center space-y-6 pt-12 text-center">
          <div className="relative group">
            <div className="w-32 h-32 rounded-[40px] border-4 border-white dark:border-[#0f172a] shadow-2xl overflow-hidden relative bg-slate-900">
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
            <button
              onClick={() => {
                triggerHaptic('light');
                openEditProfileModal();
              }}
              className="absolute -bottom-2 -right-2 p-3 bg-emerald-600 text-white rounded-2xl shadow-xl hover:scale-110 active:scale-95 transition-all cursor-pointer"
            >
              <Camera className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-1">
            <h1 className="text-4xl font-black uppercase tracking-tighter">{user.fullName}</h1>
            <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] font-black text-slate-400 uppercase tracking-widest">
              <span className="flex items-center gap-1">
                <SchoolIcon className="w-3 h-3" /> {user.schoolName}
              </span>
              <span>•</span>
              <span className="flex items-center gap-1 text-emerald-500">
                <Shield className="w-3 h-3" /> {user.role}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-12 relative z-20 space-y-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, idx) => (
            <motion.div
              key={idx}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.1 }}
              className="p-6 bg-white dark:bg-[#0f172a] rounded-[32px] border border-slate-200 dark:border-white/5 shadow-xl text-center space-y-2"
            >
              <div className={`w-10 h-10 rounded-xl bg-slate-50 dark:bg-white/5 ${stat.color} flex items-center justify-center mx-auto`}>
                <stat.icon className="w-5 h-5" />
              </div>
              <div>
                <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{stat.label}</div>
                <div className="text-xl font-black font-mono">{stat.value}</div>
              </div>
            </motion.div>
          ))}
        </div>

        {/* Action Menu */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          <div className="md:col-span-8 space-y-6">
            <div className="bg-white dark:bg-[#0f172a] rounded-[40px] border border-slate-200 dark:border-white/5 overflow-hidden shadow-2xl">
              <div className="p-8 border-b border-slate-100 dark:border-white/5">
                <h3 className="text-xl font-black uppercase tracking-tight">Mening Yutuqlarim</h3>
              </div>
              <div className="p-8 grid grid-cols-3 gap-6">
                {[
                  { label: user.badge || 'Eko-Lochin', icon: Star, color: 'text-amber-400' },
                  { label: `${user.treesPlanted || 0} Daraxt`, icon: TreePine, color: 'text-emerald-400' },
                  { label: `${computeUserStreakState({ lastStreakClaimDate: user.lastStreakClaimDate, storedStreakDays: user.streakDays ?? user.activityStats?.streakDays }).currentStreakDays} Kun Streak`, icon: Shield, color: 'text-indigo-400' },
                ].map((badge, i) => (
                  <div key={i} className="flex flex-col items-center gap-3 text-center">
                    <div className="w-16 h-16 rounded-[24px] bg-slate-50 dark:bg-white/5 flex items-center justify-center relative group">
                      <badge.icon className={`w-8 h-8 ${badge.color}`} />
                      <div className="absolute inset-0 bg-emerald-500/10 rounded-[24px] opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{badge.label}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-[#0f172a] rounded-[40px] border border-slate-200 dark:border-white/5 overflow-hidden shadow-2xl">
              <div className="p-8 border-b border-slate-100 dark:border-white/5 flex items-center justify-between">
                <h3 className="text-xl font-black uppercase tracking-tight">So'nggi Harakatlar</h3>
                <History className="w-5 h-5 text-slate-300" />
              </div>
              <div className="p-4 space-y-2">
                {recentTxs.length > 0 ? (
                  recentTxs.map(act => (
                    <div
                      key={act.id}
                      className="flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-white/5 rounded-2xl transition-colors"
                    >
                      <div className="flex items-center gap-4 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center text-emerald-500 shrink-0">
                          <Zap className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-black uppercase tracking-tight truncate">{act.reason}</div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase">
                            {new Date(act.createdAt).toLocaleDateString('uz-UZ', {
                              day: '2-digit',
                              month: 'short',
                            })}
                          </div>
                        </div>
                      </div>
                      <div className={`font-black font-mono shrink-0 ml-3 ${act.amount >= 0 ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {act.amount >= 0 ? `+${act.amount}` : act.amount}
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="p-8 text-center text-xs text-slate-400 font-semibold">
                    Hali tranzaksiyalar mavjud emas. Eko-hisobot yuboring yoki viktorina o'ynang!
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="md:col-span-4 space-y-6">
            <div className="bg-white dark:bg-[#0f172a] rounded-[40px] border border-slate-200 dark:border-white/5 p-6 shadow-2xl space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-2">Sozlamalar</h3>
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
                    className="w-full flex items-center justify-between p-4 hover:bg-slate-50 dark:hover:bg-white/5 rounded-2xl transition-all group cursor-pointer"
                  >
                    <div className="flex items-center gap-3">
                      <item.icon className="w-5 h-5 text-slate-400 group-hover:text-emerald-500 transition-colors" />
                      <span className="text-[11px] font-black uppercase tracking-widest">{item.label}</span>
                    </div>
                    <ChevronRight className="w-4 h-4 text-slate-300 group-hover:translate-x-1 transition-transform" />
                  </button>
                ))}
              </div>
              <div className="pt-4 border-t border-slate-100 dark:border-white/5">
                <button
                  onClick={() => logoutUser()}
                  className="w-full flex items-center gap-3 p-4 text-rose-500 hover:bg-rose-500/5 rounded-2xl transition-all cursor-pointer"
                >
                  <LogOut className="w-5 h-5" />
                  <span className="text-[11px] font-black uppercase tracking-widest">Chiqish</span>
                </button>
              </div>
            </div>

            <div className="bg-gradient-to-br from-indigo-600 to-indigo-800 rounded-[40px] p-8 text-white space-y-6 shadow-2xl">
              <div className="w-12 h-12 rounded-2xl bg-white/20 backdrop-blur-md flex items-center justify-center">
                <Star className="w-6 h-6 fill-white" />
              </div>
              <div className="space-y-2">
                <h4 className="text-xl font-black uppercase tracking-tighter">Eko-Bozor & Sovg'alar</h4>
                <p className="text-[10px] font-bold uppercase tracking-widest opacity-80 leading-relaxed">
                  Yig'gan EcoCoinlaringizni qimmatbaho sovg'alar va sertifikatlarga almashtiring.
                </p>
              </div>
              <button
                onClick={() => setActiveTab('shop')}
                className="w-full py-4 bg-white text-indigo-900 rounded-[20px] text-[10px] font-black uppercase tracking-widest hover:scale-105 transition-all shadow-xl cursor-pointer"
              >
                Eko-Bozorga O'tish
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
