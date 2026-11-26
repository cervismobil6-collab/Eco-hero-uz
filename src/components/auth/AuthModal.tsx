import React, { useState } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  AlertCircle,
  KeyRound,
} from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import { UZBEKISTAN_REGIONS, UZBEKISTAN_DISTRICTS } from '../../data/mockData';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { loginUser, registerUser, loginWithGoogle, loginWithTelegramCode } = useEco();

  const [mode, setMode] = useState<'login' | 'register' | 'telegram'>('login');
  const [tgCode, setTgCode] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+998 ');
  const [region, setRegion] = useState(UZBEKISTAN_REGIONS[0]);
  const [district, setDistrict] = useState((UZBEKISTAN_DISTRICTS[UZBEKISTAN_REGIONS[0]] || [])[0] || 'Shayxontohur tumani');
  const [schoolName, setSchoolName] = useState('17-sonli maktab');
  const [schoolNumber] = useState('17');
  const [grade, setGrade] = useState('9-sinf');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'telegram') {
        await loginWithTelegramCode(tgCode);
        onClose();
      } else if (mode === 'login') {
        await loginUser(email, password);
        onClose();
      } else {
        await registerUser(email, password, {
          fullName,
          phoneNumber,
          role: 'student',
          region,
          district,
          schoolName,
          schoolNumber,
          grade,
        });
        onClose();
      }
    } catch (err: any) {
      setError(err?.message || 'Xatolik yuz berdi. Qaytadan urinib ko\'ring.');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError(null);
    setLoading(true);
    try {
      await loginWithGoogle();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Google orqali kirishda xatolik yuz berdi.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md overflow-y-auto">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/25 p-5 sm:p-6 space-y-5 shadow-2xl my-6 relative">

        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white bg-slate-100 dark:bg-[#040D0A] cursor-pointer"
          aria-label="Yopish"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Modal Header */}
        <div className="space-y-1">
          <span className="text-[10px] font-black text-emerald-600 dark:text-[#00F5A0] uppercase tracking-wider">
            ECO HERO XAVFSIZ TIZIMI
          </span>
          <h2 className="text-xl font-black text-slate-900 dark:text-white">
            {mode === 'login'
              ? 'Tizimga Kirish'
              : mode === 'telegram'
              ? 'Telegram Orqali Kirish'
              : "Eko-Qahramon Bo'lish"}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {mode === 'login'
              ? 'Shaxsiy hisobingizga kiring va EcoCoinlaringizni boshqaring'
              : mode === 'telegram'
              ? 'Telegram botdagi hisobingiz va balansingizni Web / PWA ilovaga ulang'
              : "O'zbekiston yoshlari ekologik ekotizimida ro'yxatdan o'ting"}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 p-1 text-[11px] font-bold gap-1">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg transition-colors cursor-pointer ${
              mode === 'login'
                ? 'bg-white dark:bg-[#061812] text-slate-900 dark:text-[#00F5A0] border border-emerald-500/20 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Kirish
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg transition-colors cursor-pointer ${
              mode === 'register'
                ? 'bg-white dark:bg-[#061812] text-slate-900 dark:text-[#00F5A0] border border-emerald-500/20 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Ro'yxatdan o'tish
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('telegram');
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg transition-colors cursor-pointer ${
              mode === 'telegram'
                ? 'bg-white dark:bg-[#061812] text-emerald-600 dark:text-[#00F5A0] border border-emerald-500/20 shadow-xs'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Telegram Kodi
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-3.5">

          {mode === 'register' && (
            <>
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  To'liq Ism va Familiya
                </label>
                <div className="relative">
                  <User className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Masalan: Sardor Aliyev"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <p className="text-[11px] text-emerald-700 dark:text-emerald-300 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2">
                Yangi hisoblar &quot;O&apos;quvchi&quot; maqomida ochiladi. Maktab sardori, Eko-Elchi yoki koordinator lavozimi uchun kirganingizdan so&apos;ng Kabinetdan ariza topshirishingiz mumkin.
              </p>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Telefon Raqami
                </label>
                <input
                  type="tel"
                  required
                  value={phoneNumber}
                  onChange={e => setPhoneNumber(e.target.value)}
                  placeholder="+998 90 123 45 67"
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Viloyat
                  </label>
                  <select
                    value={region}
                    onChange={e => {
                      const nextReg = e.target.value;
                      setRegion(nextReg);
                      const list = UZBEKISTAN_DISTRICTS[nextReg] || [];
                      setDistrict(list[0] || '');
                    }}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  >
                    {UZBEKISTAN_REGIONS.map(reg => (
                      <option key={reg} value={reg}>{reg}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Tuman / Shahar
                  </label>
                  <select
                    value={district}
                    onChange={e => setDistrict(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  >
                    {(UZBEKISTAN_DISTRICTS[region] || []).map(dist => (
                      <option key={dist} value={dist}>{dist}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Maktab nomi / raqami
                  </label>
                  <input
                    type="text"
                    required
                    value={schoolName}
                    onChange={e => setSchoolName(e.target.value)}
                    placeholder="17-maktab"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                    Sinf / Guruh
                  </label>
                  <input
                    type="text"
                    value={grade}
                    onChange={e => setGrade(e.target.value)}
                    placeholder="9-'B'"
                    className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </>
          )}

          {mode === 'telegram' ? (
            <div className="space-y-3">
              <div className="p-3.5 rounded-2xl bg-emerald-500/10 border border-emerald-500/25 text-xs text-slate-700 dark:text-slate-200 space-y-1.5">
                <p className="font-bold text-emerald-700 dark:text-[#00F5A0]">
                  Bot va Web / PWA yagona xotirasini ulash:
                </p>
                <p className="text-[11px] leading-relaxed">
                  1. Telegram botga kirib <code className="font-mono font-bold">/web</code> buyrug&apos;ini yuboring.
                  <br />
                  2. Bot bergan 6 belgili kodni pastga kiriting yoki tayyor havolani bosing.
                </p>
              </div>
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Telegram Bot Kirish Kodi
                </label>
                <div className="relative">
                  <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="text"
                    required
                    value={tgCode}
                    onChange={e => setTgCode(e.target.value.toUpperCase())}
                    placeholder="Masalan: A3F9C2"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-mono tracking-widest uppercase text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </div>
          ) : (
            <>
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Elektron Pochta
                </label>
                <div className="relative">
                  <Mail className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="misol@maktab.uz"
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Maxfiy Parol
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
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 text-[#04110B] font-black text-xs uppercase tracking-wider rounded-xl border-b-[3px] border-emerald-700 active:translate-y-[1px] transition-all cursor-pointer disabled:opacity-50 min-h-[44px]"
          >
            {loading
              ? 'Bajarilmoqda...'
              : mode === 'telegram'
              ? 'Telegram Kodi Bilan Kirish'
              : mode === 'login'
              ? 'Tizimga Kirish'
              : "Ro'yxatdan O'tish"}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleSignIn}
            className="w-full py-2.5 bg-slate-100 dark:bg-[#040D0A] hover:bg-slate-200 dark:hover:bg-emerald-500/10 text-slate-900 dark:text-white border border-slate-200 dark:border-emerald-500/20 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50 min-h-[42px]"
          >
            Google akkaunt bilan kirish
          </button>
        </form>
      </div>
    </div>
  );
};
