import React, { useState } from 'react';
import {
  X,
  Mail,
  Lock,
  User,
  School as SchoolIcon,
  MapPin,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  ShieldAlert,
  Award,
  Building2,
  Briefcase,
} from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import { UserRole } from '../../types/eco';
import { UZBEKISTAN_REGIONS, UZBEKISTAN_DISTRICTS } from '../../data/mockData';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({ isOpen, onClose }) => {
  const { loginUser, registerUser, loginWithGoogle, switchRole } = useEco();

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState('+998 ');
  const [role, setRole] = useState<UserRole>('student');
  const [region, setRegion] = useState(UZBEKISTAN_REGIONS[0]);
  const [district, setDistrict] = useState((UZBEKISTAN_DISTRICTS[UZBEKISTAN_REGIONS[0]] || [])[0] || 'Shayxontohur tumani');
  const [schoolName, setSchoolName] = useState('17-sonli maktab');
  const [schoolNumber, setSchoolNumber] = useState('17');
  const [grade, setGrade] = useState('9-sinf');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (mode === 'login') {
        await loginUser(email, password);
        onClose();
      } else {
        await registerUser(email, password, {
          fullName,
          phoneNumber,
          role,
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

  const handleQuickSwitch = (roleKey: UserRole) => {
    switchRole(roleKey);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-md rounded-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 sm:p-8 space-y-6 shadow-2xl my-8 relative">
        
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-5 right-5 p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="space-y-1">
          <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
            ECO HERO XAVFSIZ TIZIMI
          </span>
          <h2 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
            {mode === 'login' ? 'Tizimga Kirish' : 'Eko-Qahramon Bo\'lish'}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {mode === 'login'
              ? 'Shaxsiy hisobingizga kiring va EcoCoinlaringizni boshqaring'
              : 'O\'zbekiston yoshlari ekologik ekotizimida ro\'yxatdan o\'ting'}
          </p>
        </div>

        {/* Tab Switcher */}
        <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-xs font-semibold">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`flex-1 py-2 rounded-lg transition-colors cursor-pointer ${
              mode === 'login'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
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
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Ro'yxatdan o'tish
          </button>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          
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
                    className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              {/* Role selection */}
              <div>
                <label className="text-xs font-bold text-slate-700 dark:text-slate-300 block mb-1">
                  Rolingizni tanlang (Barcha 8 ta lavozim)
                </label>
                <select
                  value={role}
                  onChange={e => setRole(e.target.value as UserRole)}
                  className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-medium"
                >
                  <option value="student">🎓 O'quvchi (Student)</option>
                  <option value="ambassador">🌱 Eko-Elchi (Eco Ambassador)</option>
                  <option value="school_admin">🏫 Maktab Admini / Sardori</option>
                  <option value="moderator">🛡 Mintaqaviy Moderator</option>
                  <option value="district_coordinator">📍 Tuman Koordinator</option>
                  <option value="regional_coordinator">🌍 Viloyat Koordinator</option>
                  <option value="sponsor">💼 Homiy va Hamkor Tashkilot</option>
                  <option value="super_admin">👑 Super Admin (@jasurdost)</option>
                </select>
                {role !== 'student' && (
                  <p className="text-[10px] text-amber-500 font-semibold mt-1">
                    ℹ️ Eslatma: O'quvchidan tashqari barcha boshqaruv lavozimlari Super Admin <b>@jasurdost</b> tasdiqlaganidan so'ng faollashadi.
                  </p>
                )}
              </div>

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
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500 font-mono"
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
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
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
            </>
          )}

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
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
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
                className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-bold text-xs rounded-xl shadow-lg shadow-emerald-500/20 transition-all cursor-pointer disabled:opacity-50"
          >
            {loading ? 'Bajarilmoqda...' : mode === 'login' ? 'Tizimga Kirish' : 'Ro\'yxatdan O\'tish'}
          </button>

          <button
            type="button"
            disabled={loading}
            onClick={handleGoogleSignIn}
            className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer disabled:opacity-50"
          >
            Google akkaunt bilan kirish
          </button>
        </form>

        {/* Quick Demo Role Switcher for seamless testing */}
        <div className="pt-4 border-t border-slate-100 dark:border-slate-800 space-y-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
            Tezkor Sinov: Rolni Tanlash (Demo)
          </span>
          <div className="grid grid-cols-3 gap-1.5 text-[11px]">
            <button
              onClick={() => handleQuickSwitch('super_admin')}
              className="p-2 rounded-lg bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 font-semibold border border-amber-200 dark:border-amber-800 hover:bg-amber-100 text-center cursor-pointer"
            >
              Super Admin
            </button>
            <button
              onClick={() => handleQuickSwitch('moderator')}
              className="p-2 rounded-lg bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300 font-semibold border border-sky-200 dark:border-sky-800 hover:bg-sky-100 text-center cursor-pointer"
            >
              Moderator
            </button>
            <button
              onClick={() => handleQuickSwitch('school_admin')}
              className="p-2 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 font-semibold border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 text-center cursor-pointer"
            >
              Maktab Admin
            </button>
            <button
              onClick={() => handleQuickSwitch('ambassador')}
              className="p-2 rounded-lg bg-teal-50 dark:bg-teal-950/40 text-teal-700 dark:text-teal-300 font-semibold border border-teal-200 dark:border-teal-800 hover:bg-teal-100 text-center cursor-pointer"
            >
              Eko-Elchi
            </button>
            <button
              onClick={() => handleQuickSwitch('student')}
              className="p-2 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 font-semibold border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 text-center cursor-pointer"
            >
              O'quvchi
            </button>
            <button
              onClick={() => handleQuickSwitch('sponsor')}
              className="p-2 rounded-lg bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 font-semibold border border-purple-200 dark:border-purple-800 hover:bg-purple-100 text-center cursor-pointer"
            >
              Homiy
            </button>
          </div>
        </div>

      </div>
    </div>
  );
};
