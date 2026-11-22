import React, { useState, useEffect, useRef } from 'react';
import {
  ShieldCheck,
  User,
  Phone,
  MapPin,
  School as SchoolIcon,
  GraduationCap,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  Share2,
  Mail,
  Lock,
} from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import { UZBEKISTAN_REGIONS, UZBEKISTAN_DISTRICTS } from '../../data/mockData';

interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  isEditMode?: boolean;
}

export const OnboardingModal: React.FC<OnboardingModalProps> = ({
  isOpen,
  onClose,
  isEditMode = false,
}) => {
  const { user, rewardSettings, completeOnboarding, updateUserProfile, registerUser, openAuthModal, sessionToken, isTelegramMiniApp } = useEco();

  const [email, setEmail] = useState(
    user.email && !user.email.endsWith('@ecohero.uz') && !user.email.endsWith('@telegram.ecohero.uz') ? user.email : ''
  );
  const [password, setPassword] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber || '+998 ');
  const [fullName, setFullName] = useState(user.fullName && user.fullName !== 'Eko-Qahramon' ? user.fullName : '');
  const [region, setRegion] = useState(user.region || UZBEKISTAN_REGIONS[0]);
  const [district, setDistrict] = useState(
    user.district || (UZBEKISTAN_DISTRICTS[UZBEKISTAN_REGIONS[0]] ? UZBEKISTAN_DISTRICTS[UZBEKISTAN_REGIONS[0]][0] : 'Chilonzor tumani')
  );
  const [schoolName, setSchoolName] = useState(user.schoolName && user.schoolName !== 'Maktab kiritilmagan' ? user.schoolName : '');
  const [grade, setGrade] = useState(user.grade || '9-sinf');

  const needsWebCredentials = !isEditMode && !sessionToken && !isTelegramMiniApp;

  const handleRegionChange = (newRegion: string) => {
    setRegion(newRegion);
    const districts = UZBEKISTAN_DISTRICTS[newRegion] || [];
    setDistrict(districts[0] || '');
  };
  const [privacyAccepted, setPrivacyAccepted] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [telegramDetectedId, setTelegramDetectedId] = useState<string | number | null>(null);
  const [telegramDetectedUsername, setTelegramDetectedUsername] = useState<string | null>(null);
  const wasOpenRef = useRef(false);

  // Initialize form state strictly when modal transitions from closed -> open (prevents background syncBootstrap from wiping user edits)
  useEffect(() => {
    const justOpened = isOpen && !wasOpenRef.current;
    wasOpenRef.current = isOpen;
    if (!justOpened) return;

    setError(null);
    if (user.phoneNumber) setPhoneNumber(user.phoneNumber);
    if (user.fullName && user.fullName !== 'Eko-Qahramon' && user.fullName !== 'Jasurbek Aliyev' && user.fullName !== "O'quvchi") {
      setFullName(user.fullName);
    }
    const initRegion = user.region && UZBEKISTAN_REGIONS.includes(user.region) ? user.region : UZBEKISTAN_REGIONS[0];
    setRegion(initRegion);
    const regDistricts = UZBEKISTAN_DISTRICTS[initRegion] || [];
    const initDistrict =
      user.district && regDistricts.includes(user.district) ? user.district : regDistricts[0] || user.district || '';
    setDistrict(initDistrict);

    if (
      user.schoolName &&
      user.schoolName !== 'Maktab kiritilmagan' &&
      (isEditMode || user.isOnboarded || user.schoolName !== 'Toshkent sh. 17-sonli ixtisoslashtirilgan maktab')
    ) {
      setSchoolName(user.schoolName);
    }
    if (user.grade) setGrade(user.grade);
  }, [isOpen, user, isEditMode]);

  // Auto-detect Telegram WebApp user and contact events
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg?.initDataUnsafe?.user) {
      const u = tg.initDataUnsafe.user;
      setTelegramDetectedId(u.id);
      if (u.username) {
        setTelegramDetectedUsername(`@${u.username}`);
      }
      if (!isEditMode && (!fullName || fullName === 'Jasurbek Aliyev' || fullName === 'Eko-Qahramon' || fullName === 'Eko Qahramon')) {
        const full = `${u.first_name || ''} ${u.last_name || ''}`.trim();
        if (full) setFullName(full);
      }
    } else if (user.telegramId) {
      setTelegramDetectedId(user.telegramId);
      if (user.telegramUsername) {
        setTelegramDetectedUsername(user.telegramUsername);
      }
    }

    const handleContactRequested = (event: any) => {
      const phone =
        event?.responseUnsafe?.contact?.phone_number ||
        event?.contact?.phone_number;
      if (phone) {
        const normalized = String(phone).startsWith('+') ? String(phone) : `+${phone}`;
        setPhoneNumber(normalized);
        tg?.HapticFeedback?.notificationOccurred('success');
      }
    };

    if (tg && typeof tg.onEvent === 'function') {
      tg.onEvent('contactRequested', handleContactRequested);
      return () => {
        if (typeof tg.offEvent === 'function') {
          tg.offEvent('contactRequested', handleContactRequested);
        }
      };
    }
  }, [user, isEditMode]);

  if (!isOpen) return null;

  // Request contact via Telegram WebApp if available
  const handleRequestTelegramContact = () => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg && typeof tg.requestContact === 'function') {
      try {
        tg.requestContact((shared: boolean, extra?: any) => {
          if (shared) {
            const phone = extra?.responseUnsafe?.contact?.phone_number || extra?.contact?.phone_number;
            if (phone) {
              setPhoneNumber(String(phone).startsWith('+') ? String(phone) : `+${phone}`);
            }
            tg.HapticFeedback?.notificationOccurred('success');
          }
        });
      } catch (e) {
        console.warn('Telegram requestContact error:', e);
      }
    } else {
      setError("Telegram WebApp orqali kontakt ulashish imkoni bo'lmadi. Iltimos raqamni qo'lda kiriting.");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanFullName = fullName.trim();
    if (!cleanFullName) {
      setError("Iltimos, ism va familiyangizni to'liq kiriting");
      return;
    }

    const phoneDigits = phoneNumber.replace(/\D/g, '');
    if (phoneDigits.length < 9) {
      setError("Iltimos, to'g'ri telefon raqamingizni kiriting (Masalan: +998 90 123 45 67)");
      return;
    }

    const cleanSchool = schoolName.trim();
    if (!cleanSchool) {
      setError("Iltimos, maktabingiz raqami yoki nomini kiriting (Masalan: 17-maktab)");
      return;
    }

    if (needsWebCredentials) {
      if (!email.trim() || !email.includes('@')) {
        setError("Iltimos, to'g'ri elektron pochta manzilini kiriting");
        return;
      }
      if (password.length < 6) {
        setError("Parol kamida 6 ta belgidan iborat bo'lishi kerak");
        return;
      }
    }

    if (!privacyAccepted) {
      setError("Ro'yxatdan o'tish uchun maxfiylik va xavfsizlik shartlariga rozilik bildiring");
      return;
    }

    const effectiveRegion = region || UZBEKISTAN_REGIONS[0];
    const validDistricts = UZBEKISTAN_DISTRICTS[effectiveRegion] || [];
    const effectiveDistrict =
      district && validDistricts.includes(district) ? district : validDistricts[0] || district || 'Markaziy tumani';
    const normalizedPhone = phoneNumber.trim();

    setLoading(true);
    try {
      if (isEditMode) {
        await updateUserProfile({
          fullName: cleanFullName,
          phoneNumber: normalizedPhone,
          region: effectiveRegion,
          district: effectiveDistrict,
          schoolName: cleanSchool,
          grade,
        });
        onClose();
      } else if (needsWebCredentials) {
        await registerUser(email.trim(), password, {
          fullName: cleanFullName,
          phoneNumber: normalizedPhone,
          region: effectiveRegion,
          district: effectiveDistrict,
          schoolName: cleanSchool,
          grade,
        });
        onClose();
      } else {
        await completeOnboarding({
          fullName: cleanFullName,
          phoneNumber: normalizedPhone,
          region: effectiveRegion,
          district: effectiveDistrict,
          schoolName: cleanSchool,
          grade,
          privacyAccepted,
        });
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || "Xatolik yuz berdi. Qaytadan urinib ko'ring.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/75 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-7 shadow-2xl my-6 relative">
        
        {/* Close button (allowed in edit mode or when already onboarded) */}
        {(isEditMode || user.isOnboarded) && (
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full text-slate-400 hover:text-slate-600 dark:hover:text-white bg-slate-100 dark:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {/* Header */}
        <div className="space-y-1.5">
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold tracking-wide">
            <Sparkles className="w-3.5 h-3.5" />
            <span>{isEditMode ? "PROFILNI TAHRIRLASH" : "BIRINCHI KIRISH: RO'YXATDAN O'TISH"}</span>
          </div>

          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {isEditMode ? "Shaxsiy Ma'lumotlarni Yangilash" : "ECO HERO Ekotizimiga Xush Kelibsiz!"}
          </h2>

          <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
            {isEditMode
              ? "Maktab, sinf va aloqa ma'lumotlaringizni to'g'irlang."
              : "Platformadan to'liq foydalanish va sovg'alarga ega bo'lish uchun profilingizni to'ldiring."}
          </p>
        </div>

        {/* Telegram Detection Pill */}
        {telegramDetectedId && (
          <div className="mt-3 p-2.5 rounded-2xl bg-sky-50 dark:bg-sky-950/40 border border-sky-200 dark:border-sky-800/60 flex items-center justify-between text-xs text-sky-800 dark:text-sky-300">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-sky-500" />
              <span className="font-semibold">Telegram orqali aniqlandi:</span>
              <span className="font-mono">{telegramDetectedUsername || `ID: ${telegramDetectedId}`}</span>
            </div>
            <span className="text-[10px] bg-sky-100 dark:bg-sky-900/60 px-2 py-0.5 rounded-md font-bold">
              Tasdiqlangan
            </span>
          </div>
        )}

        {/* Privacy Notice Banner */}
        <div className="mt-4 p-3.5 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800/60 text-xs text-emerald-900 dark:text-emerald-200 space-y-1">
          <div className="flex items-center gap-1.5 font-bold text-emerald-700 dark:text-emerald-300 text-xs">
            <ShieldCheck className="w-4 h-4 shrink-0 text-emerald-600" />
            <span>Maxfiylik va Bolalar Xavfsizligi Kafolati</span>
          </div>
          <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-normal">
            Sizning telefon raqamingiz va maktab ma'lumotlaringiz <b>faqat sovg'alarni topshirish</b> va hisobingizni himoya qilish uchun saqlanadi. Ular hech qachon ommaga yoki boshqa o'quvchilarga ko'rsatilmaydi.
          </p>
        </div>

        {error && (
          <div className="mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Registration Form */}
        <form onSubmit={handleSubmit} className="mt-4 space-y-3.5">
          {/* 1. Phone Number (First) */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300">
                Telefon Raqami <span className="text-rose-500">*</span>
              </label>
              {isTelegramMiniApp && (
                <button
                  type="button"
                  onClick={handleRequestTelegramContact}
                  className="text-[10px] text-sky-600 dark:text-sky-400 font-semibold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Share2 className="w-3 h-3" />
                  <span>Telegramdan olish</span>
                </button>
              )}
            </div>
            <div className="relative">
              <Phone className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="tel"
                required
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                placeholder="+998 90 123 45 67"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Biror sovrin yutganingizda siz bilan bog'lanish va yetkazish uchun kerak bo'ladi.
            </span>
          </div>

          {/* 2. Full Name (Second) */}
          <div>
            <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
              Haqiqiy Ism va Familiya <span className="text-rose-500">*</span>
            </label>
            <div className="relative">
              <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                required
                value={fullName}
                onChange={e => setFullName(e.target.value)}
                placeholder="Masalan: Anvar Qodirov"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
              />
            </div>
            <span className="text-[10px] text-slate-400 mt-0.5 block">
              Sovg'ani maktabingizga rasman topshirish uchun to'liq ism-familiyangizni kiriting.
            </span>
          </div>

          {/* 3. Region & 4. District (Select with specific districts) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Viloyat <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={region}
                  onChange={e => handleRegionChange(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                >
                  {UZBEKISTAN_REGIONS.map(reg => (
                    <option key={reg} value={reg}>{reg}</option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Shahar yoki Tuman <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <MapPin className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={district}
                  onChange={e => setDistrict(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                >
                  {(UZBEKISTAN_DISTRICTS[region] || []).map(dist => (
                    <option key={dist} value={dist}>{dist}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* School Name & Class/Grade */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Maktab Raqami yoki Nomi <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <SchoolIcon className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  required
                  value={schoolName}
                  onChange={e => setSchoolName(e.target.value)}
                  placeholder="Masalan: 17-sonli maktab"
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                Sinf <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <GraduationCap className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <select
                  value={grade}
                  onChange={e => setGrade(e.target.value)}
                  className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
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
            </div>
          </div>

          {needsWebCredentials && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Elektron Pochta <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="misol@maktab.uz"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Parol <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <Lock className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="Kamida 6 ta belgi"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Privacy Consent Checkbox */}
          <div className="pt-1">
            <label className="flex items-start gap-2.5 cursor-pointer text-xs text-slate-600 dark:text-slate-300">
              <input
                type="checkbox"
                checked={privacyAccepted}
                onChange={e => setPrivacyAccepted(e.target.checked)}
                className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500 w-4 h-4"
              />
              <span className="leading-tight">
                Men <b>ECO HERO</b> ekologik harakati qoidalariga rioya qilishga, ma'lumotlarim faqat shaxsiy hisobim va sovg'alar yetkazilishi uchun ishlatilishiga roziman.
              </span>
            </label>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs sm:text-sm rounded-2xl shadow-lg shadow-emerald-500/25 transition-all cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 mt-2"
          >
            {loading ? (
              <span>Saqlanmoqda...</span>
            ) : isEditMode ? (
              <span>Profilni Saqlash</span>
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                <span>Ro'yxatdan O'tish & +{rewardSettings.welcomeBonus} EcoCoin Olish</span>
              </>
            )}
          </button>
        </form>

        <div className="mt-3 text-center space-y-1.5">
          {needsWebCredentials ? (
            <button
              type="button"
              onClick={() => {
                onClose();
                openAuthModal();
              }}
              className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
            >
              Hisobingiz bormi? Kirish yoki Google orqali davom etish
            </button>
          ) : (
            <span className="text-[11px] text-slate-400 block">
              Hisobingiz tasdiqlangan sessiya bilan himoyalangan.
            </span>
          )}
        </div>

      </div>
    </div>
  );
};
