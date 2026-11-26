import React, { useState, useEffect } from 'react';
import {
  Leaf,
  MapPin,
  Sparkles,
  Coins,
  ShoppingBag,
  Trophy,
  School as SchoolIcon,
  Sun,
  Moon,
  ShieldAlert,
  Menu,
  X,
  UserCheck,
  Globe,
  Radio,
  Bell,
  LogIn,
  ChevronDown,
  Users,
  Lock,
  BarChart3,
  Video,
  Award,
  Target,
  Flame,
  ChevronRight,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEco } from '../../context/EcoContext';
import { UserRole } from '../../types/eco';
import { PWAInstallButton } from '../common/PWAInstallButton';
import { computeUserStreakState } from '../../utils/streak';
import realisticAvatarImg from '../../assets/images/profile_avatar_realistic_1795605008121.jpg';

export const Navbar: React.FC = () => {
  const {
    user,
    isSuperAdmin,
    switchRole,
    openRoleRequestModal,
    theme,
    toggleTheme,
    activeTab,
    setActiveTab,
    openAuthModal,
    openEditProfileModal,
    logoutUser,
    notifications,
    markNotificationRead,
    serverDateKey,
    openDailyStreakModal,
  } = useEco();

  const [roleMenuOpen, setRoleMenuOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notifDropdownOpen, setNotifDropdownOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const unreadNotifs = notifications.filter(n => !n.read).length;
  const streakState = computeUserStreakState(
    {
      lastStreakClaimDate: user.lastStreakClaimDate,
      storedStreakDays: user.streakDays ?? user.activityStats?.streakDays ?? 0,
    },
    serverDateKey
  );

  const navLinks = [
    { id: 'home', label: 'Bosh sahifa', icon: Leaf },
    { id: 'map', label: 'Eko Xarita', icon: MapPin },
    { id: 'missions', label: 'Missiyalar', icon: Target },
    { id: 'media', label: 'Eko-Media', icon: Video },
    { id: 'rating', label: 'Reyting', icon: Award },
    { id: 'shop', label: 'Eko Bozor', icon: ShoppingBag },
    { id: 'admin', label: 'Kabinet', icon: ShieldAlert },
    { id: 'impact', label: 'Analitika', icon: BarChart3 },
    { id: 'ai', label: 'Eco AI', icon: Sparkles },
    { id: 'rewards', label: 'Mukofotlar', icon: Trophy },
    { id: 'championship', label: 'Battle', icon: Trophy },
    { id: 'coins', label: 'Hamyon', icon: Coins },
    { id: 'school', label: 'Maktab', icon: SchoolIcon },
    { id: 'referral', label: 'Invite', icon: Users },
    { id: 'partners', label: 'Partners', icon: Globe },
  ];

  const roleLabels: Record<UserRole, { label: string; color: string; bg: string }> = {
    super_admin: { label: 'Super Admin', color: 'text-amber-400', bg: 'bg-amber-400/10' },
    regional_coordinator: { label: 'Viloyat', color: 'text-rose-400', bg: 'bg-rose-400/10' },
    district_coordinator: { label: 'Tuman', color: 'text-amber-500', bg: 'bg-amber-500/10' },
    moderator: { label: 'Moderator', color: 'text-sky-400', bg: 'bg-sky-400/10' },
    school_admin: { label: 'Maktab Admin', color: 'text-indigo-400', bg: 'bg-indigo-400/10' },
    ambassador: { label: 'Eko-Elchi', color: 'text-teal-400', bg: 'bg-teal-400/10' },
    student: { label: 'O\'quvchi', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    sponsor: { label: 'Homiy', color: 'text-purple-400', bg: 'bg-purple-400/10' },
  };

  return (
    <header
      className={`sticky top-0 z-50 w-full transition-all duration-300 ${
        scrolled
          ? 'bg-white/88 dark:bg-[#040D0A]/88 backdrop-blur-xl border-b border-emerald-500/15 shadow-lg shadow-emerald-950/10'
          : 'bg-transparent border-b border-transparent'
      }`}
    >
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 sm:h-18 gap-2 sm:gap-4">

          {/* Logo Section */}
          <div className="flex items-center min-w-0 shrink">
            <button
              onClick={() => setActiveTab('home')}
              className="flex items-center gap-2.5 sm:gap-3 group transition-transform active:scale-95 min-w-0 cursor-pointer"
            >
              <div className="relative shrink-0">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-emerald-600 via-emerald-500 to-teal-400 flex items-center justify-center text-[#040D0A] shadow-lg shadow-emerald-500/25 ring-1 ring-emerald-300/30 group-hover:rotate-3 transition-transform">
                  <Leaf className="w-5 h-5 sm:w-6 sm:h-6 stroke-[2.4]" />
                </div>
              </div>
              <div className="flex flex-col min-w-0 text-left">
                <span className="font-display font-extrabold text-lg sm:text-2xl tracking-tight text-slate-900 dark:text-white leading-none whitespace-nowrap">
                  ECO<span className="text-emerald-500 dark:text-emerald-400">HERO</span>
                </span>
                <span className="text-[9px] sm:text-[10px] text-emerald-700 dark:text-emerald-400/80 font-bold uppercase tracking-widest mt-0.5 whitespace-nowrap">
                  Uzbekistan 2.0
                </span>
              </div>
            </button>
          </div>

          {/* Desktop Nav */}
          <nav className="hidden xl:flex items-center bg-white/75 dark:bg-[#071812]/80 rounded-full p-1 border border-emerald-500/15 backdrop-blur-md shadow-sm">
            {navLinks.slice(0, 7).map(link => {
              const Icon = link.icon;
              const isActive = activeTab === link.id || (link.id === 'missions' && activeTab === 'tasks');
              return (
                <button
                  key={link.id}
                  onClick={() => setActiveTab(link.id)}
                  className={`relative flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-full transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    isActive
                      ? 'text-[#040D0A]'
                      : 'text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-emerald-300'
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="nav-pill"
                      className="absolute inset-0 bg-gradient-to-r from-emerald-400 to-teal-300 rounded-full shadow-md shadow-emerald-500/30"
                      transition={{ type: 'spring', duration: 0.45 }}
                    />
                  )}
                  <span className="relative z-10 flex items-center gap-1.5 whitespace-nowrap">
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {link.label}
                  </span>
                </button>
              );
            })}
          </nav>

          {/* Right Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">

            {/* Wallet Pill */}
            <motion.button
              whileHover={{ y: -1 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setActiveTab('coins')}
              className="hidden sm:flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-400/10 border border-amber-400/25 text-amber-600 dark:text-amber-300 text-xs font-extrabold shadow-sm cursor-pointer hover:bg-amber-400/15 transition-colors"
            >
              <Coins className="w-4 h-4 fill-amber-500/20" />
              <span className="font-mono tabular-nums">{user.ecoCoins.toLocaleString()}</span>
            </motion.button>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotifDropdownOpen(!notifDropdownOpen)}
                aria-label="Bildirishnomalar"
                className="p-2 sm:p-2.5 rounded-full bg-white/80 dark:bg-[#081C15]/80 border border-slate-200/70 dark:border-emerald-500/15 text-slate-600 dark:text-slate-300 hover:border-emerald-500/40 transition-colors relative cursor-pointer"
              >
                <Bell className="w-4 h-4 sm:w-5 sm:h-5" />
                <AnimatePresence>
                  {unreadNotifs > 0 && (
                    <motion.span
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      exit={{ scale: 0 }}
                      className="absolute top-1.5 right-1.5 sm:top-2 sm:right-2 w-2 h-2 sm:w-2.5 sm:h-2.5 rounded-full bg-rose-500 border-2 border-white dark:border-[#040D0A]"
                    />
                  )}
                </AnimatePresence>
              </button>

              <AnimatePresence>
                {notifDropdownOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="fixed sm:absolute right-3 sm:right-0 left-3 sm:left-auto mt-3 sm:mt-4 sm:w-80 bg-white/95 dark:bg-[#071912]/95 backdrop-blur-xl border border-slate-200 dark:border-emerald-500/20 rounded-3xl shadow-2xl overflow-hidden z-50"
                  >
                    <div className="p-4 border-b border-slate-100 dark:border-emerald-500/15 flex items-center justify-between">
                      <h3 className="font-black text-slate-900 dark:text-white uppercase tracking-wider text-xs">Notifikatsiyalar</h3>
                      <span className="px-2 py-0.5 bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 rounded-full text-[10px] font-black tabular-nums">{unreadNotifs} Yangi</span>
                    </div>
                    <div className="max-h-[400px] overflow-y-auto p-2 space-y-1">
                      {notifications.length > 0 ? (
                        notifications.map(notif => (
                          <button
                            key={notif.id}
                            onClick={() => markNotificationRead(notif.id)}
                            className={`w-full p-3 rounded-2xl text-left transition-colors cursor-pointer ${
                              notif.read
                                ? 'opacity-50'
                                : 'bg-emerald-500/5 hover:bg-emerald-500/10'
                            }`}
                          >
                            <div className="font-bold text-slate-900 dark:text-white text-xs">{notif.title}</div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{notif.message}</div>
                            <div className="text-[9px] text-slate-400 mt-2 font-medium">Hozirgina</div>
                          </button>
                        ))
                      ) : (
                        <div className="p-8 text-center text-slate-400 text-xs italic">Xabarlar mavjud emas</div>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Profile & Role */}
            <div className="relative">
              <motion.button
                whileTap={{ scale: 0.95 }}
                onClick={() => setRoleMenuOpen(!roleMenuOpen)}
                className={`flex items-center gap-1 sm:gap-2 pl-1 pr-2 sm:pr-3 py-1 rounded-full border border-emerald-500/20 transition-all cursor-pointer ${
                  roleLabels[user.role]?.bg || 'bg-slate-100 dark:bg-white/5'
                } ${roleLabels[user.role]?.color || 'text-slate-600 dark:text-slate-300'}`}
              >
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full overflow-hidden border-2 border-emerald-400/50 bg-[#040D0A]">
                  <img
                    src={
                      user.avatarUrl && !user.avatarUrl.includes('dicebear.com')
                        ? user.avatarUrl
                        : realisticAvatarImg
                    }
                    alt=""
                    className="w-full h-full object-cover"
                  />
                </div>
                <span className="hidden md:block text-xs font-black uppercase tracking-wide">
                  {roleLabels[user.role]?.label || user.role}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 sm:w-4 sm:h-4 transition-transform ${roleMenuOpen ? 'rotate-180' : ''}`} />
              </motion.button>

              <AnimatePresence>
                {roleMenuOpen && (
                  <motion.div
                    initial={{ opacity: 0, y: 10, scale: 0.95 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: 10, scale: 0.95 }}
                    className="absolute right-0 mt-4 w-64 bg-white/95 dark:bg-[#071912]/95 backdrop-blur-xl border border-slate-200 dark:border-emerald-500/20 rounded-3xl shadow-2xl overflow-hidden z-50 p-2"
                  >
                    <div className="p-3 mb-2 bg-slate-50 dark:bg-emerald-950/60 border border-slate-100 dark:border-emerald-500/15 rounded-2xl">
                      <div className="font-black text-slate-900 dark:text-white text-xs truncate">{user.fullName}</div>
                      <div className="text-[10px] text-slate-500 dark:text-emerald-300/70 truncate">{user.email || '@username'}</div>
                    </div>

                    <div className="space-y-1">
                      <button
                        onClick={() => { setActiveTab('profile'); setRoleMenuOpen(false); }}
                        className="w-full p-2.5 flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-500 rounded-xl transition-colors cursor-pointer"
                      >
                        <UserCheck className="w-4 h-4" />
                        Mening Profilim
                      </button>
                      <button
                        onClick={() => { setActiveTab('admin'); setRoleMenuOpen(false); }}
                        className="w-full p-2.5 flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-500 rounded-xl transition-colors cursor-pointer"
                      >
                        <ShieldAlert className="w-4 h-4" />
                        Kabinet (Rol Boshqaruvi)
                      </button>
                      <button
                        onClick={() => { openEditProfileModal(); setRoleMenuOpen(false); }}
                        className="w-full p-2.5 flex items-center gap-3 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-emerald-500/10 hover:text-emerald-500 rounded-xl transition-colors cursor-pointer"
                      >
                        <Radio className="w-4 h-4" />
                        Sozlamalar
                      </button>

                      <div className="h-px bg-slate-100 dark:bg-emerald-500/15 my-2 mx-2" />

                      <div className="px-3 py-1 text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center justify-between">
                        <span>8 Ta Boshqaruv Lavozimlari</span>
                        <span className="text-[8px] text-emerald-400">RBAC</span>
                      </div>
                      {([
                        'student',
                        'ambassador',
                        'school_admin',
                        'moderator',
                        'district_coordinator',
                        'regional_coordinator',
                        'super_admin',
                        'sponsor',
                      ] as UserRole[]).map((r) => {
                        const isApproved =
                          isSuperAdmin ||
                          r === 'student' ||
                          (user.approvedRoles && user.approvedRoles.includes(r));

                        const isCurrentRole = user.role === r;

                        return (
                          <button
                            key={r}
                            onClick={() => {
                              if (isApproved) {
                                switchRole(r);
                              } else {
                                openRoleRequestModal(r);
                              }
                              setRoleMenuOpen(false);
                            }}
                            className={`w-full p-2.5 flex items-center justify-between rounded-xl transition-all cursor-pointer ${
                              isCurrentRole
                                ? 'bg-gradient-to-r from-emerald-500 to-teal-500 text-[#040D0A] shadow-md shadow-emerald-900/40'
                                : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-white/5'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-black uppercase tracking-wider">
                                {roleLabels[r]?.label || r}
                              </span>
                              {isApproved ? (
                                <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded ${isCurrentRole ? 'bg-black/15 text-[#040D0A]' : 'bg-emerald-500/10 text-emerald-400'}`}>
                                  ✓
                                </span>
                              ) : (
                                <Lock className="w-3 h-3 text-amber-400" />
                              )}
                            </div>

                            {isCurrentRole ? (
                              <span className="w-2 h-2 rounded-full bg-[#040D0A]" />
                            ) : !isApproved ? (
                              <span className="text-[9px] font-bold text-amber-400">Ariza</span>
                            ) : null}
                          </button>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* In-App PWA Install Button */}
            <PWAInstallButton compact={true} />

            {/* Theme Toggle */}
            <button
              onClick={toggleTheme}
              aria-label="Mavzuni o'zgartirish"
              className="p-2 sm:p-2.5 rounded-full bg-white/80 dark:bg-[#081C15]/80 border border-slate-200/70 dark:border-emerald-500/15 text-slate-600 dark:text-slate-300 hover:border-emerald-500/40 transition-colors cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4 sm:w-5 sm:h-5 text-amber-400" /> : <Moon className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>

            {/* Mobile Menu Btn */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              aria-label="Menyu"
              className="xl:hidden p-2 sm:p-2.5 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 text-[#040D0A] shadow-lg shadow-emerald-500/25 active:scale-90 transition-transform cursor-pointer"
            >
              {mobileMenuOpen ? <X className="w-4 h-4 sm:w-5 sm:h-5" /> : <Menu className="w-4 h-4 sm:w-5 sm:h-5" />}
            </button>
          </div>
        </div>

        {/* Compact Top Navigation Streak Indicator */}
        <div className="pb-2 pt-0.5 flex items-center justify-center sm:justify-end">
          <button
            type="button"
            onClick={openDailyStreakModal}
            aria-label="Kunlik Eko-Streak kalendarini ochish"
            className={`group inline-flex max-w-full items-center gap-1.5 px-3 py-1 rounded-full border text-[11px] font-bold transition-all cursor-pointer whitespace-nowrap ${
              streakState.claimedToday
                ? 'bg-emerald-500/10 dark:bg-[#071D15]/90 border-emerald-500/30 text-slate-700 dark:text-emerald-200 hover:border-emerald-400/60'
                : 'bg-amber-500/15 dark:bg-amber-500/15 border-amber-400/50 text-amber-700 dark:text-amber-200 hover:border-amber-300 shadow-sm shadow-amber-500/10'
            }`}
          >
            <Flame className="w-3.5 h-3.5 text-amber-500 fill-amber-500 shrink-0" />
            <span className="truncate font-mono tabular-nums">
              {streakState.claimedToday ? (
                <>
                  {streakState.currentStreakDays} kun <span className="opacity-50">|</span> Ertaga +{streakState.nextTomorrowReward} EcoCoin
                </>
              ) : streakState.currentStreakDays > 0 ? (
                <>
                  {streakState.currentStreakDays} kun <span className="opacity-50">|</span> Bugun +{streakState.todayReward} EcoCoin
                </>
              ) : (
                <>
                  Bugun +{streakState.todayReward} EcoCoin <span className="opacity-50">|</span> Sovg&apos;ani olish
                </>
              )}
            </span>
            <ChevronRight className="w-3 h-3 opacity-70 group-hover:translate-x-0.5 transition-transform shrink-0" />
          </button>
        </div>

        {/* Mobile Sidebar/Menu overlay */}
        <AnimatePresence>
          {mobileMenuOpen && (
            <motion.div
              initial={{ opacity: 0, x: 100 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 100 }}
              className="fixed inset-y-0 right-0 w-full max-w-xs bg-white dark:bg-[#05120D] shadow-2xl z-[60] xl:hidden border-l border-slate-200 dark:border-emerald-500/20"
            >
              <div className="flex flex-col h-full p-6">
                <div className="flex items-center justify-between mb-6">
                  <div className="font-display font-black text-xl tracking-tight text-slate-900 dark:text-white">NAVIGATSIYA</div>
                  <button onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-full bg-slate-100 dark:bg-white/5 cursor-pointer">
                    <X className="w-5 h-5 text-slate-500" />
                  </button>
                </div>

                <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
                  {navLinks.map(link => {
                    const Icon = link.icon;
                    const isActive = activeTab === link.id;
                    return (
                      <button
                        key={link.id}
                        onClick={() => { setActiveTab(link.id); setMobileMenuOpen(false); }}
                        className={`w-full flex items-center gap-3.5 p-3.5 rounded-2xl transition-all cursor-pointer ${
                          isActive
                            ? 'bg-gradient-to-r from-emerald-500 to-teal-400 text-[#040D0A] shadow-lg shadow-emerald-500/20'
                            : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-emerald-950/60'
                        }`}
                      >
                        <div className={`p-2 rounded-xl ${isActive ? 'bg-black/15' : 'bg-emerald-500/10 text-emerald-500 dark:text-emerald-400'}`}>
                          <Icon className="w-4 h-4" />
                        </div>
                        <span className="font-extrabold text-xs uppercase tracking-wider">{link.label}</span>
                      </button>
                    );
                  })}
                </div>

                <div className="pt-5 mt-5 border-t border-slate-100 dark:border-emerald-500/15">
                  <div className="flex items-center gap-3.5 mb-4">
                    <img
                      src={
                        user.avatarUrl && !user.avatarUrl.includes('dicebear.com')
                          ? user.avatarUrl
                          : realisticAvatarImg
                      }
                      className="w-11 h-11 rounded-2xl border-2 border-emerald-500/30 object-cover"
                      alt=""
                    />
                    <div className="min-w-0">
                      <div className="font-black text-xs text-slate-900 dark:text-white truncate">{user.fullName}</div>
                      <div className="text-[10px] text-emerald-600 dark:text-emerald-400 uppercase tracking-widest">{roleLabels[user.role]?.label}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      setMobileMenuOpen(false);
                      if (user.isOnboarded) {
                        logoutUser();
                      } else {
                        openAuthModal();
                      }
                    }}
                    className="w-full py-3.5 bg-slate-900 dark:bg-emerald-500 text-white dark:text-[#040D0A] rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <LogIn className="w-4 h-4" />
                    {user.isOnboarded ? 'Tizimdan Chiqish' : 'Kirish / Hisob'}
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </header>
  );
};

