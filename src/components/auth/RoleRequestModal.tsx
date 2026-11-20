import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Send,
  X,
  Lock,
  UserCheck,
  Building,
  GraduationCap,
  Sparkles,
  CheckCircle2,
  MapPin,
  Globe,
  Clock,
  AlertCircle,
} from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import { UserRole } from '../../types/eco';
import { UZBEKISTAN_REGIONS, UZBEKISTAN_DISTRICTS } from '../../data/mockData';

interface RoleRequestModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetRole: UserRole | null;
}

export const RoleRequestModal: React.FC<RoleRequestModalProps> = ({
  isOpen,
  onClose,
  targetRole,
}) => {
  const { user, submitApplication, registrationApplications, triggerHaptic } = useEco();

  const [requestedRole, setRequestedRole] = useState<UserRole>(targetRole || 'school_admin');
  const [fullName, setFullName] = useState(user.fullName || '');
  const [telegramId, setTelegramId] = useState(user.telegramId ? String(user.telegramId) : '');
  const [region, setRegion] = useState(user.region || UZBEKISTAN_REGIONS[0]);
  const [district, setDistrict] = useState(
    user.district || (UZBEKISTAN_DISTRICTS[UZBEKISTAN_REGIONS[0]]?.[0] ?? '')
  );
  const [schoolNumber, setSchoolNumber] = useState(user.schoolNumber || '');
  const [officialSchoolName, setOfficialSchoolName] = useState(
    user.schoolName && user.schoolName !== 'Maktab kiritilmagan' ? user.schoolName : ''
  );
  const [contactInfo, setContactInfo] = useState(user.phoneNumber || user.email || '');
  const [verificationDetails, setVerificationDetails] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setRequestedRole(targetRole || 'school_admin');
    setFullName(user.fullName || '');
    setTelegramId(user.telegramId ? String(user.telegramId) : '');
    const reg = user.region || UZBEKISTAN_REGIONS[0];
    setRegion(reg);
    setDistrict(user.district || (UZBEKISTAN_DISTRICTS[reg]?.[0] ?? ''));
    setSchoolNumber(user.schoolNumber || '');
    setOfficialSchoolName(
      user.schoolName && user.schoolName !== 'Maktab kiritilmagan' ? user.schoolName : ''
    );
    setContactInfo(user.phoneNumber || user.email || '');
    setErrorMsg(null);
    setSubmitted(false);
  }, [isOpen, targetRole, user]);

  if (!isOpen) return null;

  const roleMeta: Record<UserRole, { title: string; desc: string; icon: any; color: string }> = {
    student: {
      title: "Eko-O'quvchi",
      desc: "Oddiy o'quvchi hisobi (avtomatik ruxsat)",
      icon: GraduationCap,
      color: 'text-emerald-500',
    },
    ambassador: {
      title: 'Maktab Eko-Elchisi',
      desc: 'Maktabda ekologik vazifalarni bajaruvchi va loyihalarni yurituvchi yetakchi',
      icon: Sparkles,
      color: 'text-teal-500',
    },
    school_admin: {
      title: 'Maktab Sardori / Admini',
      desc: 'Faqat biriktirilgan maktab o‘quvchilari, elchilari va hisobotlarini boshqaruvchi mas’ul',
      icon: Building,
      color: 'text-indigo-500',
    },
    district_coordinator: {
      title: 'Tuman Eko-Koordinatori',
      desc: 'Tuman miqyosidagi barcha maktablar va tuman koordinatorlari reytingi boshqaruvi',
      icon: MapPin,
      color: 'text-amber-500',
    },
    regional_coordinator: {
      title: 'Viloyat Eko-Koordinatori',
      desc: 'Viloyat tumanlari taqqoslamasi va hududiy koordinatorlar faoliyatini nazorat qilish',
      icon: Globe,
      color: 'text-rose-500',
    },
    moderator: {
      title: 'Mintaqaviy Moderator',
      desc: 'Hisobotlar va media faoliyatlarni tekshirish',
      icon: UserCheck,
      color: 'text-sky-500',
    },
    super_admin: {
      title: 'Super Admin',
      desc: 'Markaziy platforma boshqaruvi',
      icon: ShieldAlert,
      color: 'text-amber-500',
    },
    sponsor: {
      title: 'Homiy / Hamkor',
      desc: 'Ekologik loyiha va sovg‘alar homiysi',
      icon: Building,
      color: 'text-purple-500',
    },
  };

  const meta = roleMeta[requestedRole] || roleMeta.school_admin;
  const RoleIcon = meta.icon;

  const myApps = registrationApplications.filter(a => a.userId === user.uid).slice(0, 3);

  const handleRegionChange = (nextReg: string) => {
    setRegion(nextReg);
    setDistrict(UZBEKISTAN_DISTRICTS[nextReg]?.[0] || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!fullName.trim() || !region || !district || !schoolNumber.trim() || !officialSchoolName.trim() || !contactInfo.trim() || !verificationDetails.trim()) {
      setErrorMsg("Barcha majburiy ariza maydonlarini to'liq kiriting.");
      return;
    }

    setIsSubmitting(true);
    triggerHaptic('medium');
    const res = await submitApplication({
      fullName: fullName.trim(),
      telegramId: telegramId.trim(),
      telegramUsername: user.telegramUsername,
      region,
      district,
      schoolNumber: schoolNumber.trim(),
      officialSchoolName: officialSchoolName.trim(),
      requestedRole,
      contactInfo: contactInfo.trim(),
      verificationDetails: verificationDetails.trim(),
    });
    setIsSubmitting(false);

    if (res.success) {
      setSubmitted(true);
      triggerHaptic('success');
    } else {
      setErrorMsg(res.message);
    }
  };

  const handleClose = () => {
    setSubmitted(false);
    setVerificationDetails('');
    setErrorMsg(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm overflow-y-auto">
      <div className="w-full max-w-2xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-6 space-y-5 shadow-2xl relative my-6">
        <button
          onClick={handleClose}
          className="absolute top-4 right-4 p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>

        {!submitted ? (
          <>
            <div className="flex items-start gap-4 pr-8">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-500 flex items-center justify-center shrink-0">
                <Lock className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-500">
                  Rasmiy Lavozim Arizasi · Ierarxik Tasdiqlash
                </span>
                <h3 className="text-lg font-extrabold text-slate-900 dark:text-white leading-tight">
                  {meta.title} Lavozimiga Ariza Topshirish
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Eko-Elchi arizasi to‘g‘ridan-to‘g‘ri ko‘rsatilgan maktab sardoriga, Maktab Sardori tuman koordinatoriga, Tuman Koordinatori esa viloyat koordinatoriga (hamda Super Adminga) borib tushadi.
                </p>
              </div>
            </div>

            {myApps.length > 0 && (
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5" /> So‘nggi arizalaringiz holati
                </div>
                {myApps.map(app => (
                  <div key={app.id} className="flex items-center justify-between text-xs border-t border-slate-200 dark:border-slate-700/60 pt-2">
                    <div>
                      <span className="font-bold text-slate-800 dark:text-slate-200">{app.requestedRoleName || app.requestedRole}</span>
                      <span className="text-slate-500 dark:text-slate-400"> · {app.officialSchoolName}</span>
                      {app.adminNote && (
                        <div className="text-[11px] text-amber-600 dark:text-amber-400 mt-0.5">Izoh: {app.adminNote}</div>
                      )}
                    </div>
                    <span
                      className={`text-[11px] font-bold uppercase ${
                        app.status === 'approved'
                          ? 'text-emerald-500'
                          : app.status === 'rejected'
                          ? 'text-rose-500'
                          : 'text-amber-500'
                      }`}
                    >
                      {app.status === 'needs_info' ? "Qo'shimcha ma'lumot" : app.status}
                    </span>
                  </div>
                ))}
              </div>
            )}

            <div className="p-3.5 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-800 flex items-center gap-3">
              <div className={`p-2.5 rounded-xl bg-slate-200 dark:bg-slate-700 ${meta.color}`}>
                <RoleIcon className="w-5 h-5" />
              </div>
              <div className="text-xs flex-1">
                <div className="font-bold text-slate-900 dark:text-white">{meta.title}</div>
                <div className="text-slate-500 dark:text-slate-400 text-[11px] leading-snug">{meta.desc}</div>
              </div>
              <select
                value={requestedRole}
                onChange={e => setRequestedRole(e.target.value as UserRole)}
                className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-800 dark:text-slate-200"
              >
                <option value="ambassador">Maktab Eko-Elchisi</option>
                <option value="school_admin">Maktab Sardori</option>
                <option value="district_coordinator">Tuman Koordinatori</option>
                <option value="regional_coordinator">Viloyat Koordinatori</option>
              </select>
            </div>

            {errorMsg && (
              <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-600 dark:text-rose-400 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    To‘liq ism-familiya <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={e => setFullName(e.target.value)}
                    placeholder="Masalan: Azizbek Karimov"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Telegram User ID
                  </label>
                  <input
                    type="text"
                    value={telegramId}
                    onChange={e => setTelegramId(e.target.value)}
                    placeholder="Masalan: 8832599080"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Viloyat <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={region}
                    onChange={e => handleRegionChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    {UZBEKISTAN_REGIONS.map(r => (
                      <option key={r} value={r}>{r}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Tuman / Shahar <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={district}
                    onChange={e => setDistrict(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                  >
                    {(UZBEKISTAN_DISTRICTS[region] || []).map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Maktab raqami <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={schoolNumber}
                    onChange={e => setSchoolNumber(e.target.value)}
                    placeholder="Masalan: 17"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Rasmiy maktab nomi <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={officialSchoolName}
                    onChange={e => setOfficialSchoolName(e.target.value)}
                    placeholder="Masalan: Toshkent sh. 17-sonli umumta'lim maktabi"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Aloqa ma'lumoti (Telefon / Email) <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={contactInfo}
                  onChange={e => setContactInfo(e.target.value)}
                  placeholder="+998 90 123 45 67"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Qo'shimcha tasdiqlovchi ma'lumot (Lavozim asosi, tavsiya, sinf) <span className="text-rose-500">*</span>
                </label>
                <textarea
                  rows={3}
                  required
                  value={verificationDetails}
                  onChange={e => setVerificationDetails(e.target.value)}
                  placeholder="Masalan: Maktab sardoriman, direktor o'rinbosari tavsiyasi va 10-A sinf eko-guruhi rahbariman..."
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs text-slate-900 dark:text-white resize-none"
                />
              </div>

              <div className="flex gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={handleClose}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white text-xs font-bold transition-all shadow-md flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Send className="w-3.5 h-3.5" />
                  <span>
                    {isSubmitting
                      ? 'Yuborilmoqda...'
                      : requestedRole === 'ambassador'
                      ? 'Maktab Sardoriga Yuborish'
                      : requestedRole === 'school_admin'
                      ? 'Tuman Koordinatoriga Yuborish'
                      : requestedRole === 'district_coordinator'
                      ? 'Viloyat Koordinatoriga Yuborish'
                      : 'Arizani Yuborish'}
                  </span>
                </button>
              </div>
            </form>
          </>
        ) : (
          <div className="text-center py-6 space-y-4">
            <div className="w-14 h-14 rounded-full bg-emerald-500/10 text-emerald-500 mx-auto flex items-center justify-center">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <div className="space-y-1">
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                Arizangiz Mas’ul Rahbarga Yuborildi!
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto leading-relaxed">
                {requestedRole === 'ambassador'
                  ? 'Ko‘rsatilgan maktab sardori (va Super Admin) arizangizni tekshirib tasdiqlashi bilan kabinetingiz ochiladi.'
                  : requestedRole === 'school_admin'
                  ? 'Tuman koordinatoringiz (va Super Admin) arizangizni ko‘rib chiqqanidan so‘ng maktab sardori kabineti faollashadi.'
                  : 'Mas’ul koordinator va Super Admin tasdig‘idan so‘ng Telegram orqali xabar keladi.'}
              </p>
            </div>
            <button
              onClick={handleClose}
              className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-all shadow-md cursor-pointer"
            >
              Tushundim
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
