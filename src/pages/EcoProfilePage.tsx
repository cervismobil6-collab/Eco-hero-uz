import React, { useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  Bell,
  Building2,
  Camera,
  Check,
  ChevronRight,
  Copy,
  Crown,
  ExternalLink,
  Globe,
  Headphones,
  Link2,
  Loader2,
  Lock,
  LogOut,
  Mail,
  MapPin,
  MessageCircle,
  Moon,
  Palette,
  Phone,
  School as SchoolIcon,
  ShieldCheck,
  Sun,
  User,
  X,
} from 'lucide-react';
import { useEco } from '../context/EcoContext';
import { UZBEKISTAN_DISTRICTS, UZBEKISTAN_REGIONS } from '../data/mockData';
import { openAdTargetUrl, parseApiJson, resolveMediaUrl } from '../utils/api';
import { calculateLevelProgress } from '../utils/level';
import realisticAvatarImg from '../assets/images/profile_avatar_realistic_1795605008121.jpg';
import heroForestBackdropImg from '../assets/images/profile_hero_forest_1795605007665.jpg';
import leafEmblemImg from '../assets/images/profile_leaf_emblem_1795605008107.jpg';

type ActiveSheet =
  | null
  | 'personal'
  | 'security'
  | 'school'
  | 'appearance'
  | 'language'
  | 'support'
  | 'logout';

type LanguageCode = 'uz' | 'ru' | 'en';

const LANGUAGE_OPTIONS: { code: LanguageCode; label: string; native: string }[] = [
  { code: 'uz', label: "O‘zbek tili", native: 'Lotin yozuvi' },
  { code: 'ru', label: 'Русский язык', native: 'Rus tili' },
  { code: 'en', label: 'English', native: 'Ingliz tili' },
];

const NOTIF_STORAGE_KEY = 'ecohero_notifications_enabled';
const LANG_STORAGE_KEY = 'ecohero_preferred_language';
const HAPTIC_STORAGE_KEY = 'ecohero_haptics_enabled';

export const EcoProfilePage: React.FC = () => {
  const {
    user,
    schools,
    theme,
    toggleTheme,
    updateUserProfile,
    uploadMediaFile,
    createTelegramLinkToken,
    openAuthModal,
    logoutUser,
    apiFetch,
    sessionToken,
    showNotification,
    triggerHaptic,
  } = useEco();

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [activeSheet, setActiveSheet] = useState<ActiveSheet>(null);
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // Live toggle & preference state
  const [notificationsEnabled, setNotificationsEnabled] = useState<boolean>(() => {
    if (typeof user.notificationsEnabled === 'boolean') return user.notificationsEnabled;
    try {
      const saved = localStorage.getItem(NOTIF_STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const [preferredLanguage, setPreferredLanguage] = useState<LanguageCode>(() => {
    if (user.preferredLanguage && ['uz', 'ru', 'en'].includes(user.preferredLanguage)) {
      return user.preferredLanguage;
    }
    try {
      const saved = localStorage.getItem(LANG_STORAGE_KEY) as LanguageCode | null;
      return saved && ['uz', 'ru', 'en'].includes(saved) ? saved : 'uz';
    } catch {
      return 'uz';
    }
  });

  const [hapticsEnabled, setHapticsEnabled] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem(HAPTIC_STORAGE_KEY);
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  // Personal info form state
  const [fullNameInput, setFullNameInput] = useState(user.fullName || '');
  const [phoneInput, setPhoneInput] = useState(user.phoneNumber || '');
  const [savingPersonal, setSavingPersonal] = useState(false);

  // School & education form state
  const [regionInput, setRegionInput] = useState(
    user.region && UZBEKISTAN_REGIONS.includes(user.region) ? user.region : UZBEKISTAN_REGIONS[0]
  );
  const [districtInput, setDistrictInput] = useState(user.district || '');
  const [schoolNameInput, setSchoolNameInput] = useState(user.schoolName || '');
  const [gradeInput, setGradeInput] = useState(user.grade || '9-sinf');
  const [savingSchool, setSavingSchool] = useState(false);

  // Security & password form state
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [allowStudentMessages, setAllowStudentMessages] = useState<boolean>(
    user.allowStudentMessages !== false
  );
  const [linkingTelegram, setLinkingTelegram] = useState(false);
  const [telegramLinkInfo, setTelegramLinkInfo] = useState<{
    code?: string;
    deepLink?: string;
  } | null>(null);
  const [loggingOut, setLoggingOut] = useState(false);

  useEffect(() => {
    setAvatarFailed(false);
  }, [user.avatarUrl, user.profileImage]);

  useEffect(() => {
    if (typeof user.notificationsEnabled === 'boolean') {
      setNotificationsEnabled(user.notificationsEnabled);
    }
    if (user.preferredLanguage && ['uz', 'ru', 'en'].includes(user.preferredLanguage)) {
      setPreferredLanguage(user.preferredLanguage);
    }
    setAllowStudentMessages(user.allowStudentMessages !== false);
  }, [user.notificationsEnabled, user.preferredLanguage, user.allowStudentMessages]);

  const openModalSheet = (sheet: ActiveSheet) => {
    triggerHaptic('light');
    if (sheet === 'personal') {
      setFullNameInput(user.fullName || '');
      setPhoneInput(user.phoneNumber || '');
    } else if (sheet === 'school') {
      const nextRegion =
        user.region && UZBEKISTAN_REGIONS.includes(user.region) ? user.region : UZBEKISTAN_REGIONS[0];
      const districts = UZBEKISTAN_DISTRICTS[nextRegion] || [];
      setRegionInput(nextRegion);
      setDistrictInput(
        user.district && districts.includes(user.district) ? user.district : districts[0] || user.district || ''
      );
      setSchoolNameInput(
        user.schoolName && user.schoolName !== 'Maktab kiritilmagan' ? user.schoolName : ''
      );
      setGradeInput(user.grade || '9-sinf');
    } else if (sheet === 'security') {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setAllowStudentMessages(user.allowStudentMessages !== false);
    }
    setActiveSheet(sheet);
  };

  // Non-cartoon realistic avatar resolution
  const rawAvatar = (user.avatarUrl || user.profileImage || '').trim();
  const isCartoonOrEmpty = !rawAvatar || rawAvatar.includes('dicebear.com');
  const displayAvatar = avatarFailed || isCartoonOrEmpty ? realisticAvatarImg : resolveMediaUrl(rawAvatar);

  // Username / handle line
  const cleanedTg = (user.telegramUsername || '').replace(/^@/, '').trim();
  const emailHandle =
    user.email && !user.email.endsWith('@ecohero.uz') && !user.email.endsWith('@telegram.ecohero.uz')
      ? user.email.split('@')[0]
      : '';
  const handleText = cleanedTg || emailHandle || (user.referralCode || 'ecohero').toLowerCase();

  // Level & progressive XP math
  const userXP = user.ecoXP || (user.totalCoinsEarned || user.ecoCoins || 0) * 4;
  const levelProgress = calculateLevelProgress(userXP);
  const computedLevel = levelProgress.level;
  const xpIntoLevel = levelProgress.xpIntoLevel;
  const xpRequiredForNextLevel = levelProgress.xpRequiredForNextLevel;
  const xpProgressPct = levelProgress.progressPct;

  const activeLanguageLabel =
    LANGUAGE_OPTIONS.find(l => l.code === preferredLanguage)?.label || "O‘zbek tili";

  const schoolObj = schools.find(s => s.id === user.schoolId);

  const handleAvatarSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    if (!file.type.startsWith('image/')) {
      showNotification('Iltimos, faqat rasm faylini tanlang', 'warning');
      return;
    }

    setUploadingAvatar(true);
    triggerHaptic('light');
    try {
      const uploadRes = await uploadMediaFile(file, file.name);
      if (!uploadRes.success || !uploadRes.url) {
        showNotification(uploadRes.error || "Rasmni yuklab bo'lmadi", 'warning');
        return;
      }
      await updateUserProfile({
        avatarUrl: uploadRes.url,
        profileImage: uploadRes.url,
      });
      setAvatarFailed(false);
      triggerHaptic('success');
      showNotification('Profil rasmi yangilandi!', 'success');
    } catch {
      showNotification("Rasmni saqlashda xatolik yuz berdi", 'warning');
    } finally {
      setUploadingAvatar(false);
    }
  };

  const handleToggleNotifications = async () => {
    const next = !notificationsEnabled;
    setNotificationsEnabled(next);
    triggerHaptic(next ? 'success' : 'light');
    try {
      localStorage.setItem(NOTIF_STORAGE_KEY, String(next));
    } catch {
      // ignore storage errors
    }

    if (sessionToken) {
      try {
        await apiFetch('/api/user/profile', {
          method: 'POST',
          body: JSON.stringify({ notificationsEnabled: next }),
        });
      } catch {
        // non-blocking preference sync
      }
    }

    showNotification(
      next ? 'Bildirishnomalar yoqildi' : "Bildirishnomalar o'chirildi",
      'info'
    );
  };

  const handleSelectLanguage = async (lang: LanguageCode) => {
    setPreferredLanguage(lang);
    triggerHaptic('success');
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // ignore storage errors
    }
    if (sessionToken) {
      try {
        await apiFetch('/api/user/profile', {
          method: 'POST',
          body: JSON.stringify({ preferredLanguage: lang }),
        });
      } catch {
        // non-blocking preference sync
      }
    }
    const label = LANGUAGE_OPTIONS.find(l => l.code === lang)?.label || "O‘zbek tili";
    showNotification(`Ilova tili tanlandi: ${label}`, 'success');
    setActiveSheet(null);
  };

  const handleSavePersonalInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = fullNameInput.trim();
    if (cleanName.length < 2) {
      showNotification("Iltimos, to'liq ism va familiyangizni kiriting", 'warning');
      return;
    }
    setSavingPersonal(true);
    try {
      await updateUserProfile({
        fullName: cleanName,
        phoneNumber: phoneInput.trim(),
      });
      triggerHaptic('success');
      setActiveSheet(null);
    } finally {
      setSavingPersonal(false);
    }
  };

  const handleSaveSchoolInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanSchool = schoolNameInput.trim();
    if (!cleanSchool) {
      showNotification("Maktab nomi yoki raqamini kiriting", 'warning');
      return;
    }
    setSavingSchool(true);
    try {
      await updateUserProfile({
        region: regionInput,
        district: districtInput,
        schoolName: cleanSchool,
        grade: gradeInput,
      });
      triggerHaptic('success');
      setActiveSheet(null);
    } finally {
      setSavingSchool(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sessionToken) {
      openAuthModal();
      showNotification("Parolni o'zgartirish uchun avval hisobingizga kiring", 'info');
      return;
    }
    if (newPassword.length < 6) {
      showNotification("Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak", 'warning');
      return;
    }
    if (newPassword !== confirmPassword) {
      showNotification("Yangi parollar mos kelmadi", 'warning');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await apiFetch('/api/user/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await parseApiJson<any>(res);
      if (!res.ok || !data.success) {
        showNotification(data.error || "Parolni o'zgartirib bo'lmadi", 'warning');
        return;
      }
      triggerHaptic('success');
      showNotification(data.message || 'Parol muvaffaqiyatli yangilandi!', 'success');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
    } catch (err: any) {
      showNotification(err?.message || "Server bilan bog'lanishda xatolik", 'warning');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleToggleStudentMessages = async () => {
    const next = !allowStudentMessages;
    setAllowStudentMessages(next);
    triggerHaptic('light');
    if (sessionToken) {
      try {
        await apiFetch('/api/user/profile', {
          method: 'POST',
          body: JSON.stringify({ allowStudentMessages: next }),
        });
      } catch {
        // non-blocking
      }
    }
    showNotification(
      next ? "O'quvchilar xabarlari yoqildi" : "O'quvchilar xabarlari cheklandi",
      'info'
    );
  };

  const handleGenerateTelegramLink = async () => {
    if (!sessionToken) {
      openAuthModal();
      showNotification("Avval veb-hisobingizga kiring", 'info');
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
      setTelegramLinkInfo({ code: res.code, deepLink: res.deepLink });
      showNotification("Telegram bog'lash kodi tayyor!", 'success');
    } finally {
      setLinkingTelegram(false);
    }
  };

  const handleCopyCommand = async (cmd: string) => {
    try {
      await navigator.clipboard.writeText(cmd);
      triggerHaptic('success');
      showNotification(`Nusxalandi: ${cmd}`, 'success');
    } catch {
      showNotification(`Qo'lda nusxalang: ${cmd}`, 'info');
    }
  };

  const handleToggleHaptics = () => {
    const next = !hapticsEnabled;
    setHapticsEnabled(next);
    try {
      localStorage.setItem(HAPTIC_STORAGE_KEY, String(next));
    } catch {
      // ignore
    }
    if (next) triggerHaptic('light');
    showNotification(next ? 'Taktil tebranish yoqildi' : "Taktil tebranish o'chirildi", 'info');
  };

  const handleConfirmLogout = async () => {
    setLoggingOut(true);
    try {
      await logoutUser();
      setActiveSheet(null);
    } finally {
      setLoggingOut(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F3F8F5] dark:bg-[#040D09] text-slate-900 dark:text-white pb-28 pt-3 sm:pt-5">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleAvatarSelected}
      />

      <div className="max-w-xl mx-auto px-3.5 sm:px-4 space-y-3.5">
        {/* 1. PROFILE HERO CARD */}
        <section
          aria-label="Profil ma'lumotlari"
          className="relative overflow-hidden rounded-[24px] bg-white dark:bg-[#061A12] border border-emerald-200 dark:border-emerald-500/25 shadow-[0_14px_40px_rgba(0,0,0,0.10)] dark:shadow-[0_18px_45px_rgba(0,0,0,0.48)] p-4 sm:p-5"
        >
          {/* Realistic forest leaves background on right edge (dark mode) */}
          <div aria-hidden="true" className="absolute inset-0 pointer-events-none hidden dark:block">
            <img
              src={heroForestBackdropImg}
              alt=""
              className="w-full h-full object-cover object-right opacity-65"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-[#051710] via-[#061A12]/85 to-transparent" />
          </div>

          <div className="relative z-10 flex items-center gap-4 sm:gap-5">
            {/* Avatar with emerald aura ring & realistic photo */}
            <div className="relative shrink-0">
              <div className="w-[84px] h-[84px] sm:w-[96px] sm:h-[96px] rounded-full p-[3px] bg-gradient-to-tr from-[#10B981] via-[#34D399] to-[#22C55E] shadow-[0_0_24px_rgba(16,185,129,0.45)]">
                <div className="w-full h-full rounded-full overflow-hidden bg-[#04120C]">
                  <img
                    src={displayAvatar}
                    alt={user.fullName || 'EcoHero foydalanuvchisi'}
                    onError={() => setAvatarFailed(true)}
                    className="w-full h-full object-cover"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                aria-label="Profil rasmini o'zgartirish"
                className="absolute -bottom-0.5 -right-0.5 w-8 h-8 rounded-full bg-[#092319] hover:bg-[#0D3123] border border-emerald-400/50 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95 cursor-pointer disabled:opacity-60"
              >
                {uploadingAvatar ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin text-emerald-300" />
                ) : (
                  <Camera className="w-3.5 h-3.5 text-white" />
                )}
              </button>
            </div>

            {/* Identity + Level + XP */}
            <div className="flex-1 min-w-0 space-y-2">
              <div className="min-w-0">
                <div className="flex items-center gap-1.5 min-w-0">
                  <h1 className="text-lg sm:text-xl font-bold tracking-tight text-slate-900 dark:text-white truncate">
                    {user.fullName || 'EcoHero Foydalanuvchisi'}
                  </h1>
                  {(user.isVerified || user.isOnboarded) && (
                    <BadgeCheck
                      aria-label="Tasdiqlangan hisob"
                      className="w-4 h-4 sm:w-[18px] sm:h-[18px] text-[#10B981] shrink-0"
                    />
                  )}
                </div>
                <p className="text-xs sm:text-sm text-slate-500 dark:text-emerald-100/65 truncate">
                  @{handleText}
                </p>
              </div>

              {/* Level Badge & XP Ratio */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-xl bg-emerald-50 dark:bg-[#0A261B] border border-emerald-200 dark:border-emerald-500/35 text-xs font-bold text-emerald-800 dark:text-white shrink-0">
                    <Crown className="w-3.5 h-3.5 text-amber-400 fill-amber-400" />
                    <span className="tabular-nums">Lv. {computedLevel}</span>
                  </span>

                  <span className="text-[11px] sm:text-xs font-mono tabular-nums font-medium text-slate-600 dark:text-emerald-100/80 truncate">
                    {xpIntoLevel.toLocaleString()} / {xpRequiredForNextLevel.toLocaleString()} XP
                  </span>
                </div>

                {/* Progress Bar */}
                <div
                  role="progressbar"
                  aria-valuenow={xpIntoLevel}
                  aria-valuemin={0}
                  aria-valuemax={xpRequiredForNextLevel}
                  className="w-full h-2 rounded-full bg-slate-200 dark:bg-[#03100A] border border-slate-300/60 dark:border-emerald-500/15 overflow-hidden"
                >
                  <div
                    style={{ width: `${xpProgressPct}%` }}
                    className="h-full rounded-full bg-gradient-to-r from-[#22C55E] to-[#4ADE80] transition-all duration-500 shadow-[0_0_10px_rgba(34,197,94,0.55)]"
                  />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 2. PROFILE SETTINGS MENU LIST */}
        <nav
          aria-label="Profil menyusi"
          className="rounded-[24px] bg-white dark:bg-[#061A12]/90 border border-slate-200/90 dark:border-emerald-500/20 shadow-[0_10px_30px_rgba(0,0,0,0.06)] dark:shadow-[0_14px_35px_rgba(0,0,0,0.40)] divide-y divide-slate-100 dark:divide-emerald-500/10 overflow-hidden"
        >
          {/* Row 1: Shaxsiy ma'lumotlar */}
          <button
            type="button"
            onClick={() => openModalSheet('personal')}
            className="w-full px-4 py-3.5 sm:px-5 flex items-center justify-between gap-3 text-left hover:bg-emerald-50/70 dark:hover:bg-emerald-500/[0.06] active:bg-emerald-500/10 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-600 dark:text-[#22C55E]">
                <User className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  Shaxsiy ma&apos;lumotlar
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Profilingizni ko&lsquo;ring va tahrirlang
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
          </button>

          {/* Row 2: Xavfsizlik va akkaunt */}
          <button
            type="button"
            onClick={() => openModalSheet('security')}
            className="w-full px-4 py-3.5 sm:px-5 flex items-center justify-between gap-3 text-left hover:bg-emerald-50/70 dark:hover:bg-emerald-500/[0.06] active:bg-emerald-500/10 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-600 dark:text-[#22C55E]">
                <ShieldCheck className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  Xavfsizlik va akkaunt
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Parolni o&lsquo;zgartirish va xavfsizlik
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
          </button>

          {/* Row 3: Maktab va ta'lim ma'lumotlari */}
          <button
            type="button"
            onClick={() => openModalSheet('school')}
            className="w-full px-4 py-3.5 sm:px-5 flex items-center justify-between gap-3 text-left hover:bg-emerald-50/70 dark:hover:bg-emerald-500/[0.06] active:bg-emerald-500/10 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-600 dark:text-[#22C55E]">
                <Building2 className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  Maktab va ta&apos;lim ma&apos;lumotlari
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Maktab ma&apos;lumotlaringiz
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
          </button>

          {/* Row 4: Bildirishnoma sozlamalari (live switch) */}
          <div
            onClick={handleToggleNotifications}
            role="button"
            tabIndex={0}
            onKeyDown={e => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleToggleNotifications();
              }
            }}
            className="w-full px-4 py-3.5 sm:px-5 flex items-center justify-between gap-3 text-left hover:bg-emerald-50/70 dark:hover:bg-emerald-500/[0.06] transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-600 dark:text-[#22C55E]">
                <Bell className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  Bildirishnoma sozlamalari
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Xabarnomalarni boshqarish
                </div>
              </div>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={notificationsEnabled}
              aria-label="Bildirishnomalarni yoqish yoki o'chirish"
              onClick={e => {
                e.stopPropagation();
                handleToggleNotifications();
              }}
              className={`relative w-12 h-7 rounded-full transition-colors shrink-0 cursor-pointer ${
                notificationsEnabled
                  ? 'bg-[#22C55E]'
                  : 'bg-slate-300 dark:bg-emerald-950/90 border border-emerald-500/20'
              }`}
            >
              <span
                className={`absolute top-1 left-1 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                  notificationsEnabled ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Row 5: Ilova ko‘rinishi */}
          <button
            type="button"
            onClick={() => openModalSheet('appearance')}
            className="w-full px-4 py-3.5 sm:px-5 flex items-center justify-between gap-3 text-left hover:bg-emerald-50/70 dark:hover:bg-emerald-500/[0.06] active:bg-emerald-500/10 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-600 dark:text-[#22C55E]">
                <Palette className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  Ilova ko&lsquo;rinishi
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Mavzu va interfeys sozlamalari
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
          </button>

          {/* Row 6: Tilni tanlash */}
          <button
            type="button"
            onClick={() => openModalSheet('language')}
            className="w-full px-4 py-3.5 sm:px-5 flex items-center justify-between gap-3 text-left hover:bg-emerald-50/70 dark:hover:bg-emerald-500/[0.06] active:bg-emerald-500/10 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-600 dark:text-[#22C55E]">
                <Globe className="w-[18px] h-[18px]" />
              </div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                Tilni tanlash
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <span className="text-xs sm:text-sm text-slate-500 dark:text-slate-300 font-medium">
                {activeLanguageLabel}
              </span>
              <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500" />
            </div>
          </button>

          {/* Row 7: Yordam va qo‘llab-quvvatlash */}
          <button
            type="button"
            onClick={() => openModalSheet('support')}
            className="w-full px-4 py-3.5 sm:px-5 flex items-center justify-between gap-3 text-left hover:bg-emerald-50/70 dark:hover:bg-emerald-500/[0.06] active:bg-emerald-500/10 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-500/20 flex items-center justify-center shrink-0 text-emerald-600 dark:text-[#22C55E]">
                <Headphones className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-slate-900 dark:text-white truncate">
                  Yordam va qo&lsquo;llab-quvvatlash
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Biz bilan bog&lsquo;laning
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
          </button>

          {/* Row 8: Tizimdan chiqish */}
          <button
            type="button"
            onClick={() => openModalSheet('logout')}
            className="w-full px-4 py-3.5 sm:px-5 flex items-center justify-between gap-3 text-left hover:bg-rose-50/70 dark:hover:bg-rose-500/[0.07] active:bg-rose-500/10 transition-colors cursor-pointer"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-rose-500/12 border border-rose-500/20 flex items-center justify-center shrink-0 text-rose-500 dark:text-rose-400">
                <LogOut className="w-[18px] h-[18px]" />
              </div>
              <div className="min-w-0">
                <div className="text-sm font-semibold text-rose-600 dark:text-rose-400 truncate">
                  Tizimdan chiqish
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  Hisobingizdan chiqish
                </div>
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-400 dark:text-slate-500 shrink-0" />
          </button>
        </nav>

        {/* 3. BOTTOM BRAND FOOTER CARD */}
        <footer className="rounded-[20px] bg-white dark:bg-[#061A12]/85 border border-slate-200/90 dark:border-emerald-500/20 px-4 py-3 flex items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3 min-w-0">
            <img
              src={leafEmblemImg}
              alt="EcoHero 2.0"
              className="w-10 h-10 rounded-xl object-cover border border-emerald-500/25 shrink-0"
            />
            <div className="min-w-0">
              <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                EcoHero 2.0
              </div>
              <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                Yashil kelajak uchun birgalikda!
              </div>
            </div>
          </div>
          <span className="px-3 py-1 rounded-full bg-slate-100 dark:bg-[#092319] border border-slate-200 dark:border-emerald-500/25 text-xs font-mono tabular-nums text-slate-600 dark:text-emerald-200/80 shrink-0">
            v2.0.0
          </span>
        </footer>
      </div>

      {/* ================= WORKING SUB-MODALS FOR EACH MENU ITEM ================= */}

      {/* 1. Shaxsiy ma'lumotlar modal */}
      {activeSheet === 'personal' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto"
          onClick={() => setActiveSheet(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#061A12] border border-slate-200 dark:border-emerald-500/30 p-5 sm:p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Shaxsiy ma&apos;lumotlar
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Ism, aloqa va profil rasmini tahrirlash
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                aria-label="Yopish"
                className="p-2 rounded-full bg-slate-100 dark:bg-[#0A261B] text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-4 p-3.5 rounded-2xl bg-slate-50 dark:bg-[#04110B] border border-slate-200 dark:border-emerald-500/15">
              <img
                src={displayAvatar}
                alt={user.fullName}
                className="w-14 h-14 rounded-full object-cover ring-2 ring-emerald-400/70 shrink-0"
              />
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-700 dark:text-emerald-200 truncate">
                  Profil surati
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                  Haqiqiy surat yuklang (JPG, PNG)
                </div>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadingAvatar}
                className="px-3 py-2 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-semibold text-emerald-700 dark:text-emerald-300 cursor-pointer shrink-0"
              >
                {uploadingAvatar ? 'Yuklanmoqda...' : 'Rasm tanlash'}
              </button>
            </div>

            <form onSubmit={handleSavePersonalInfo} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Ism va familiya
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={fullNameInput}
                    onChange={e => setFullNameInput(e.target.value)}
                    placeholder="Masalan: Jasurbek Alisherov"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#04110B] border border-slate-200 dark:border-emerald-500/25 text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Telefon raqami
                </label>
                <div className="relative">
                  <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="tel"
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value)}
                    placeholder="+998 90 123 45 67"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#04110B] border border-slate-200 dark:border-emerald-500/25 text-sm font-mono text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {user.email && !user.email.endsWith('@ecohero.uz') && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                    Elektron pochta
                  </label>
                  <div className="flex items-center gap-2 px-3 py-2.5 rounded-xl bg-slate-100/80 dark:bg-[#04110B]/60 border border-slate-200/80 dark:border-emerald-500/15 text-xs text-slate-600 dark:text-slate-300">
                    <Mail className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="truncate">{user.email}</span>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveSheet(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={savingPersonal}
                  className="px-5 py-2.5 rounded-xl bg-[#22C55E] hover:bg-emerald-500 text-[#04110B] text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {savingPersonal ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Xavfsizlik va akkaunt modal */}
      {activeSheet === 'security' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto"
          onClick={() => setActiveSheet(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#061A12] border border-slate-200 dark:border-emerald-500/30 p-5 sm:p-6 shadow-2xl space-y-5 my-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Xavfsizlik va akkaunt
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Parol, maxfiylik va Telegram ulanishi
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                aria-label="Yopish"
                className="p-2 rounded-full bg-slate-100 dark:bg-[#0A261B] text-slate-500 dark:text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Password update */}
            <form onSubmit={handleChangePassword} className="space-y-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-[#04110B] border border-slate-200 dark:border-emerald-500/15">
              <div className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-white">
                <Lock className="w-4 h-4 text-emerald-500" />
                <span>Parolni yangilash</span>
              </div>

              <input
                type="password"
                value={currentPassword}
                onChange={e => setCurrentPassword(e.target.value)}
                placeholder="Joriy parol (yangi parol o'rnatishda bo'sh qolishi mumkin)"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#071D14] border border-slate-200 dark:border-emerald-500/20 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
              <input
                type="password"
                required
                minLength={6}
                value={newPassword}
                onChange={e => setNewPassword(e.target.value)}
                placeholder="Yangi parol (kamida 6 ta belgi)"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#071D14] border border-slate-200 dark:border-emerald-500/20 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
              <input
                type="password"
                required
                minLength={6}
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                placeholder="Yangi parolni tasdiqlang"
                className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#071D14] border border-slate-200 dark:border-emerald-500/20 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
              <button
                type="submit"
                disabled={savingPassword}
                className="w-full py-2.5 rounded-xl bg-[#22C55E] hover:bg-emerald-500 text-[#04110B] text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {savingPassword ? 'Yangilanmoqda...' : 'Parolni saqlash'}
              </button>
            </form>

            {/* Student messages privacy toggle */}
            <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-[#04110B] border border-slate-200 dark:border-emerald-500/15">
              <div className="min-w-0">
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  O&lsquo;quvchilardan xabar qabul qilish
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Maktab va sinfdoshlar bilan muloqot
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={allowStudentMessages}
                onClick={handleToggleStudentMessages}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                  allowStudentMessages ? 'bg-[#22C55E]' : 'bg-slate-300 dark:bg-emerald-950'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    allowStudentMessages ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Telegram Link status */}
            <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#04110B] border border-slate-200 dark:border-emerald-500/15 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-slate-700 dark:text-slate-200">
                  Telegram Bot hisobi
                </span>
                {user.telegramId ? (
                  <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                    {user.telegramUsername || `Ulangan (${user.telegramId})`}
                  </span>
                ) : (
                  <span className="text-amber-500 font-semibold">Ulanmagan</span>
                )}
              </div>

              {!user.telegramId && (
                <>
                  <button
                    type="button"
                    onClick={handleGenerateTelegramLink}
                    disabled={linkingTelegram}
                    className="w-full py-2.5 px-3 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-semibold text-emerald-700 dark:text-emerald-300 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <Link2 className="w-4 h-4" />
                    <span>{linkingTelegram ? 'Kod yaratilmoqda...' : "Telegram bilan bog'lash"}</span>
                  </button>

                  {telegramLinkInfo?.code && (
                    <div className="flex items-center justify-between gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => handleCopyCommand(`/link ${telegramLinkInfo.code}`)}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-[#071D14] border border-emerald-500/25 text-xs font-mono text-emerald-600 dark:text-emerald-400 cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>/link {telegramLinkInfo.code}</span>
                      </button>
                      {telegramLinkInfo.deepLink && (
                        <button
                          type="button"
                          onClick={() => openAdTargetUrl(telegramLinkInfo.deepLink)}
                          className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#22C55E] text-[#04110B] text-xs font-bold cursor-pointer"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                          <span>Botda ochish</span>
                        </button>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Maktab va ta'lim ma'lumotlari modal */}
      {activeSheet === 'school' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto"
          onClick={() => setActiveSheet(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#061A12] border border-slate-200 dark:border-emerald-500/30 p-5 sm:p-6 shadow-2xl space-y-4 my-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Maktab va ta&apos;lim ma&apos;lumotlari
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Reyting va jamoaviy topshiriqlar uchun maktabingiz
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                aria-label="Yopish"
                className="p-2 rounded-full bg-slate-100 dark:bg-[#0A261B] text-slate-500 dark:text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {schoolObj && (
              <div className="p-3 rounded-2xl bg-emerald-50 dark:bg-[#04110B] border border-emerald-200 dark:border-emerald-500/20 flex items-center justify-between text-xs">
                <span className="font-semibold text-emerald-800 dark:text-emerald-200 truncate">
                  {schoolObj.name}
                </span>
                <span className="font-mono font-bold text-emerald-600 dark:text-emerald-400 shrink-0 ml-2">
                  Reyting #{schoolObj.ratingRank || 1}
                </span>
              </div>
            )}

            <form onSubmit={handleSaveSchoolInfo} className="space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Viloyat / Shahar
                </label>
                <div className="relative">
                  <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <select
                    value={regionInput}
                    onChange={e => {
                      const nextReg = e.target.value;
                      setRegionInput(nextReg);
                      const list = UZBEKISTAN_DISTRICTS[nextReg] || [];
                      setDistrictInput(list[0] || '');
                    }}
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#04110B] border border-slate-200 dark:border-emerald-500/25 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  >
                    {UZBEKISTAN_REGIONS.map(r => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Tuman / Shahar
                </label>
                <select
                  value={districtInput}
                  onChange={e => setDistrictInput(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#04110B] border border-slate-200 dark:border-emerald-500/25 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                >
                  {(UZBEKISTAN_DISTRICTS[regionInput] || []).map(d => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Maktab nomi yoki raqami
                </label>
                <div className="relative">
                  <SchoolIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={schoolNameInput}
                    onChange={e => setSchoolNameInput(e.target.value)}
                    placeholder="Masalan: 17-sonli maktab"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#04110B] border border-slate-200 dark:border-emerald-500/25 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-300 mb-1">
                  Sinf / Bosqich
                </label>
                <select
                  value={gradeInput}
                  onChange={e => setGradeInput(e.target.value)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#04110B] border border-slate-200 dark:border-emerald-500/25 text-xs sm:text-sm text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="5-sinf">5-sinf</option>
                  <option value="6-sinf">6-sinf</option>
                  <option value="7-sinf">7-sinf</option>
                  <option value="8-sinf">8-sinf</option>
                  <option value="9-sinf">9-sinf</option>
                  <option value="10-sinf">10-sinf</option>
                  <option value="11-sinf">11-sinf</option>
                  <option value="Akademik litsey / Kollej">Akademik litsey / Kollej</option>
                  <option value="Talaba">Talaba</option>
                </select>
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setActiveSheet(null)}
                  className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={savingSchool}
                  className="px-5 py-2.5 rounded-xl bg-[#22C55E] hover:bg-emerald-500 text-[#04110B] text-xs font-bold cursor-pointer disabled:opacity-50"
                >
                  {savingSchool ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 4. Ilova ko‘rinishi modal */}
      {activeSheet === 'appearance' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setActiveSheet(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#061A12] border border-slate-200 dark:border-emerald-500/30 p-5 sm:p-6 shadow-2xl space-y-5"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Ilova ko&lsquo;rinishi
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Mavzu va interfeys qulayliklari
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                aria-label="Yopish"
                className="p-2 rounded-full bg-slate-100 dark:bg-[#0A261B] text-slate-500 dark:text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => {
                  if (theme !== 'dark') toggleTheme();
                  triggerHaptic('light');
                }}
                className={`p-4 rounded-2xl border text-left space-y-2 transition-all cursor-pointer ${
                  theme === 'dark'
                    ? 'bg-emerald-500/15 border-emerald-400 text-slate-900 dark:text-white'
                    : 'bg-slate-50 dark:bg-[#04110B] border-slate-200 dark:border-emerald-500/15 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Moon className="w-5 h-5 text-emerald-400" />
                <div className="text-sm font-bold">Tungi rejim</div>
                <div className="text-[11px] opacity-75">To&lsquo;q yashil obsidian mavzu</div>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (theme !== 'light') toggleTheme();
                  triggerHaptic('light');
                }}
                className={`p-4 rounded-2xl border text-left space-y-2 transition-all cursor-pointer ${
                  theme === 'light'
                    ? 'bg-emerald-500/15 border-emerald-500 text-slate-900 dark:text-white'
                    : 'bg-slate-50 dark:bg-[#04110B] border-slate-200 dark:border-emerald-500/15 text-slate-600 dark:text-slate-300'
                }`}
              >
                <Sun className="w-5 h-5 text-amber-400" />
                <div className="text-sm font-bold">Kunduzgi rejim</div>
                <div className="text-[11px] opacity-75">Yorug&lsquo; va tiniq ko&lsquo;rinish</div>
              </button>
            </div>

            <div className="flex items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-[#04110B] border border-slate-200 dark:border-emerald-500/15">
              <div>
                <div className="text-xs font-semibold text-slate-900 dark:text-white">
                  Taktil tebranish (Haptic)
                </div>
                <div className="text-[11px] text-slate-500 dark:text-slate-400">
                  Tugmalar bosilganda yumshoq javob
                </div>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={hapticsEnabled}
                onClick={handleToggleHaptics}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 cursor-pointer ${
                  hapticsEnabled ? 'bg-[#22C55E]' : 'bg-slate-300 dark:bg-emerald-950'
                }`}
              >
                <span
                  className={`absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow transition-transform ${
                    hapticsEnabled ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Tilni tanlash modal */}
      {activeSheet === 'language' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setActiveSheet(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#061A12] border border-slate-200 dark:border-emerald-500/30 p-5 sm:p-6 shadow-2xl space-y-4"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">Tilni tanlash</h2>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                aria-label="Yopish"
                className="p-2 rounded-full bg-slate-100 dark:bg-[#0A261B] text-slate-500 dark:text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              {LANGUAGE_OPTIONS.map(option => {
                const selected = preferredLanguage === option.code;
                return (
                  <button
                    key={option.code}
                    type="button"
                    onClick={() => handleSelectLanguage(option.code)}
                    className={`w-full px-4 py-3 rounded-2xl border flex items-center justify-between text-left transition-colors cursor-pointer ${
                      selected
                        ? 'bg-emerald-500/15 border-emerald-400 text-slate-900 dark:text-white'
                        : 'bg-slate-50 dark:bg-[#04110B] border-slate-200 dark:border-emerald-500/15 text-slate-700 dark:text-slate-200 hover:border-emerald-500/40'
                    }`}
                  >
                    <div>
                      <div className="text-sm font-semibold">{option.label}</div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        {option.native}
                      </div>
                    </div>
                    {selected && <Check className="w-4 h-4 text-[#22C55E]" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 6. Yordam va qo‘llab-quvvatlash modal */}
      {activeSheet === 'support' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm overflow-y-auto"
          onClick={() => setActiveSheet(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#061A12] border border-slate-200 dark:border-emerald-500/30 p-5 sm:p-6 shadow-2xl space-y-4 my-6"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                  Yordam va qo&lsquo;llab-quvvatlash
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  EcoHero jamoasi bilan tezkor aloqa
                </p>
              </div>
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                aria-label="Yopish"
                className="p-2 rounded-full bg-slate-100 dark:bg-[#0A261B] text-slate-500 dark:text-slate-300 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#04110B] border border-slate-200 dark:border-emerald-500/15 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">
                  XP va daraja qanday oshadi?
                </div>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                  Topshiriqlarni bajarish, ekologik muammolar yuborish va testlardan o&lsquo;tish orqali XP yig&lsquo;asiz. Har bir keyingi daraja qiyinlashib boradi.
                </p>
              </div>
              <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#04110B] border border-slate-200 dark:border-emerald-500/15 space-y-1">
                <div className="font-bold text-slate-900 dark:text-white">
                  EcoCoin sovg&lsquo;alari qanday olinadi?
                </div>
                <p className="text-slate-500 dark:text-slate-400 leading-relaxed">
                  Eko-Bozor bo&lsquo;limida vaucherlar va sovg&lsquo;alarni xarid qiling, maktab koordinatori yoki hamkorlar orqali rasman qabul qiling.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => openAdTargetUrl('https://t.me/Ecoheros_uz')}
              className="w-full py-3 px-4 rounded-2xl bg-[#22C55E] hover:bg-emerald-500 text-[#04110B] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
            >
              <MessageCircle className="w-4 h-4" />
              <span>Telegram orqali bog&lsquo;lanish (@Ecoheros_uz)</span>
            </button>
          </div>
        </div>
      )}

      {/* 7. Tizimdan chiqish confirmation modal */}
      {activeSheet === 'logout' && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
          onClick={() => setActiveSheet(null)}
        >
          <div
            onClick={e => e.stopPropagation()}
            className="w-full max-w-sm rounded-3xl bg-white dark:bg-[#061A12] border border-slate-200 dark:border-rose-500/30 p-5 sm:p-6 shadow-2xl space-y-4 text-center"
          >
            <div className="w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/25 text-rose-500 flex items-center justify-center mx-auto">
              <LogOut className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white">
                Tizimdan chiqish
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Hisobingizdan chiqmoqchimisiz? Natijalaringiz bazada saqlanib qoladi.
              </p>
            </div>
            <div className="flex items-center gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setActiveSheet(null)}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
              >
                Bekor qilish
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                disabled={loggingOut}
                className="flex-1 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold cursor-pointer disabled:opacity-50"
              >
                {loggingOut ? 'Chiqilmoqda...' : 'Chiqish'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
