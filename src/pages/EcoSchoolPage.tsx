import React, { useState } from 'react';
import {
  School as SchoolIcon,
  Award,
  Users,
  TreePine,
  Star,
  Copy,
  Target,
  Check,
  X,
  Plus,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEco } from '../context/EcoContext';
import { UZBEKISTAN_REGIONS, UZBEKISTAN_DISTRICTS } from '../data/mockData';
import { resolveMediaUrl } from '../utils/api';
import cabinetCaptainBannerImg from '../assets/images/cabinet_captain_banner_1795687841413.jpg';

export const EcoSchoolPage: React.FC = () => {
  const {
    schools,
    registerSchool,
    user,
    reports,
    appointAmbassador,
    openRoleRequestModal,
    setActiveTab,
    showNotification,
  } = useEco();

  const [selectedSchoolId, setSelectedSchoolId] = useState<string>(schools[0]?.id || '');
  const selectedSchool = schools.find(s => s.id === selectedSchoolId) || schools[0];

  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [showAmbassadorModal, setShowAmbassadorModal] = useState(false);
  const [inviteCopied, setInviteCopied] = useState(false);

  // Add School Form State
  const [schoolNameInput, setSchoolNameInput] = useState('');
  const [schoolNumberInput, setSchoolNumberInput] = useState('');
  const [schoolRegionInput, setSchoolRegionInput] = useState(user.region || UZBEKISTAN_REGIONS[0]);
  const [schoolDistrictInput, setSchoolDistrictInput] = useState(
    (UZBEKISTAN_DISTRICTS[user.region || UZBEKISTAN_REGIONS[0]] || [])[0] || ''
  );
  const [schoolAdminEmailInput, setSchoolAdminEmailInput] = useState(user.email || '');
  const [schoolAmbInput, setSchoolAmbInput] = useState(user.fullName || '');

  // Ambassador Form State (for admins appointing or users applying)
  const [ambNameInput, setAmbNameInput] = useState(user.fullName || '');
  const [ambEmailInput, setAmbEmailInput] = useState(user.email || '');

  const isAdmin = user.role === 'super_admin' || user.role === 'school_admin' || user.role === 'regional_coordinator';

  const handleCopyInviteLink = () => {
    if (!selectedSchool) return;
    navigator.clipboard.writeText(`https://t.me/Ecoheros_bot?start=school_${selectedSchool.id}`);
    setInviteCopied(true);
    showNotification('Maktab taklif havolasi nusxalandi!', 'success');
    setTimeout(() => setInviteCopied(false), 2000);
  };

  const handleRegionChange = (regionVal: string) => {
    setSchoolRegionInput(regionVal);
    const dists = UZBEKISTAN_DISTRICTS[regionVal] || [];
    setSchoolDistrictInput(dists[0] || '');
  };

  const handleRegisterSchoolSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolNameInput.trim()) return;
    const created = registerSchool({
      name: schoolNameInput.trim(),
      number: schoolNumberInput.trim() || schoolNameInput.replace(/\D/g, '') || '1',
      region: schoolRegionInput,
      district: schoolDistrictInput || 'Markaziy tuman',
      ambassadorName: schoolAmbInput.trim() || 'Tayinlanmoqda',
      adminEmail: schoolAdminEmailInput.trim() || user.email,
      registeredStudentsCount: 1,
    });
    setSelectedSchoolId(created.id);
    setSchoolNameInput('');
    setSchoolNumberInput('');
    setShowRegisterModal(false);
  };

  const handleAmbassadorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSchool) return;
    if (isAdmin) {
      await appointAmbassador(selectedSchool.id, ambNameInput.trim() || user.fullName, ambEmailInput.trim() || user.email);
      setShowAmbassadorModal(false);
    } else {
      setShowAmbassadorModal(false);
      openRoleRequestModal('ambassador');
    }
  };

  const schoolReports = selectedSchool
    ? reports.filter(
        r =>
          r.schoolId === selectedSchool.id ||
          (selectedSchool.number && r.schoolName?.includes(selectedSchool.number)) ||
          r.region === selectedSchool.region
      )
    : [];

  return (
    <div className="min-h-screen bg-[#f2f7f4] dark:bg-[#040D0A] text-slate-900 dark:text-white pb-24">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 py-4 sm:py-6 space-y-5">
        {/* Compact Duolingo Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#072419] via-[#051811] to-[#040D0A] border border-emerald-500/30 p-4 sm:p-6 text-white shadow-sm">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <img
                src={cabinetCaptainBannerImg}
                alt="Eko-Maktablar"
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-emerald-400/40 shrink-0 shadow-md"
              />
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-[#00F5A0] uppercase tracking-wider">
                  <SchoolIcon className="w-3.5 h-3.5" /> Maktablar Tarmog&apos;i
                </span>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">Eko-Maktablar</h1>
                <p className="text-xs text-slate-300 mt-0.5 max-w-2xl">
                  O&apos;zbekiston maktablari ECO HERO tarmog&apos;ida bellashadi. Maktabingiz reytingini ko&apos;taring!
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-2.5 shrink-0">
              <button
                onClick={() => setShowRegisterModal(true)}
                className="min-h-[44px] px-4 py-2.5 bg-[#040D0A]/85 hover:bg-[#040D0A] border border-emerald-500/30 text-white rounded-xl font-bold text-xs transition-all cursor-pointer flex items-center gap-2"
              >
                <Plus className="w-4 h-4 text-[#00F5A0]" /> Maktab qo&apos;shish
              </button>
              {(isAdmin || user.role !== 'ambassador') && (
                <button
                  onClick={() => setShowAmbassadorModal(true)}
                  className="min-h-[44px] px-5 py-2.5 bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl font-black text-xs active:translate-y-[1px] transition-all cursor-pointer"
                >
                  {isAdmin ? 'Elchi Tayinlash' : "Eko-Elchi Bo'lish"}
                </button>
              )}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
          {/* Left: Directory Sidebar */}
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center justify-between px-1">
              <h3 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Maktablar Bazasi</h3>
              <span className="text-xs font-bold text-emerald-500 dark:text-[#00F5A0] tabular-nums">{schools.length} Maktab</span>
            </div>

            <div className="space-y-2.5 max-h-[640px] overflow-y-auto pr-1 scrollbar-hide">
              {schools.map(sc => (
                <motion.button
                  whileHover={{ x: 3 }}
                  key={sc.id}
                  onClick={() => setSelectedSchoolId(sc.id)}
                  className={`w-full p-3.5 rounded-2xl border transition-all text-left cursor-pointer ${
                    selectedSchool?.id === sc.id
                      ? 'bg-gradient-to-r from-[#072419] to-[#051811] border-emerald-500 text-white shadow-md'
                      : 'bg-white dark:bg-[#061812] border-slate-200 dark:border-emerald-500/20 hover:border-emerald-500/50'
                  }`}
                >
                  <div className="flex justify-between items-center mb-1.5">
                    <div className={`text-lg font-black font-mono tabular-nums ${selectedSchool?.id === sc.id ? 'text-[#00F5A0]' : 'text-slate-400'}`}>
                      #{sc.ratingRank}
                    </div>
                    <div
                      className={`px-2 py-0.5 rounded-lg text-[10px] font-black tabular-nums ${
                        selectedSchool?.id === sc.id
                          ? 'bg-emerald-500/20 text-[#00F5A0] border border-emerald-500/30'
                          : 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {sc.totalCoins} ECO
                    </div>
                  </div>
                  <h4
                    className={`font-black text-sm tracking-tight mb-0.5 truncate ${
                      selectedSchool?.id === sc.id ? 'text-white' : 'text-slate-900 dark:text-white'
                    }`}
                  >
                    {sc.name}
                  </h4>
                  <div
                    className={`text-[11px] font-medium ${
                      selectedSchool?.id === sc.id ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'
                    }`}
                  >
                    {sc.region} · {sc.district}
                  </div>
                </motion.button>
              ))}
            </div>
          </div>

          {/* Right: School Profile Details */}
          <div className="lg:col-span-8">
            {selectedSchool && (
              <AnimatePresence mode="wait">
                <motion.div
                  key={selectedSchool.id}
                  initial={{ opacity: 0, x: 16 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -16 }}
                  className="bg-white dark:bg-[#061812] rounded-3xl border border-slate-200 dark:border-emerald-500/25 shadow-sm overflow-hidden"
                >
                  <div className="relative h-44 sm:h-52 bg-[#040D0A] overflow-hidden">
                    <img
                      src={resolveMediaUrl(selectedSchool.logoUrl) || '/assets/schools/tashkent_campus.jpg'}
                      className="w-full h-full object-cover opacity-55 transition-all duration-700"
                      alt={selectedSchool.name}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#040D0A] via-[#040D0A]/30 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4 sm:bottom-6 sm:left-6 space-y-1.5">
                      <span className="inline-block px-2.5 py-0.5 bg-emerald-500/20 border border-emerald-400/30 text-[#00F5A0] rounded-lg text-[10px] font-bold">
                        {selectedSchool.region} · {selectedSchool.district}
                      </span>
                      <h2 className="text-xl sm:text-3xl font-black text-white tracking-tight leading-tight">
                        {selectedSchool.name}
                      </h2>
                    </div>
                  </div>

                  <div className="p-4 sm:p-6 space-y-5">
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      {[
                        { label: 'Jami EcoCoin', val: selectedSchool.totalCoins || 0, icon: Star, color: 'text-amber-400' },
                        { label: 'Ekildi (daraxt)', val: selectedSchool.treesPlanted || 0, icon: TreePine, color: 'text-emerald-400' },
                        {
                          label: "O'quvchilar",
                          val: selectedSchool.registeredStudentsCount ?? 0,
                          icon: Users,
                          color: 'text-sky-400',
                        },
                        { label: 'Tozalashlar', val: selectedSchool.cleanupsCompleted || 0, icon: Target, color: 'text-[#00F5A0]' },
                      ].map(m => (
                        <div key={m.label} className="p-3 rounded-2xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 space-y-1">
                          <div className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                            <m.icon className={`w-3.5 h-3.5 ${m.color}`} /> {m.label}
                          </div>
                          <div className="text-xl font-black text-slate-900 dark:text-white font-mono tabular-nums tracking-tight">
                            {m.val.toLocaleString()}
                          </div>
                        </div>
                      ))}
                    </div>

                    <div className="p-4 bg-slate-50 dark:bg-[#040D0A] rounded-2xl border border-slate-200 dark:border-emerald-500/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-3.5">
                        <div className="w-12 h-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 dark:text-[#00F5A0] flex items-center justify-center shrink-0">
                          <Award className="w-6 h-6" />
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Maktab Eko-Elchisi</div>
                          <div className="text-base font-black text-slate-900 dark:text-white">
                            {selectedSchool.ambassadorName || 'Tayinlanmoqda'}
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={handleCopyInviteLink}
                        className="w-full sm:w-auto min-h-[44px] px-5 py-2.5 bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl font-black text-xs flex items-center justify-center gap-2 active:translate-y-[1px] transition-all cursor-pointer"
                      >
                        {inviteCopied ? 'Nusxalandi!' : 'Taklif Havolasi'}
                        {inviteCopied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      </button>
                    </div>

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-black text-slate-500 dark:text-slate-400 uppercase tracking-wider">Maktab faoliyati</h4>
                        <button
                          onClick={() => setActiveTab('map')}
                          className="text-xs font-bold text-emerald-500 hover:underline cursor-pointer"
                        >
                          Barchasini ko&apos;rish
                        </button>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {schoolReports.slice(0, 4).map(rep => (
                          <div
                            key={rep.id}
                            className="p-3 bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 rounded-2xl hover:border-emerald-500/40 transition-all flex gap-3 items-center"
                          >
                            <img src={resolveMediaUrl(rep.imageUrl)} className="w-12 h-12 rounded-xl object-cover shrink-0" alt={rep.title} />
                            <div className="min-w-0">
                              <div className="font-bold text-xs text-slate-900 dark:text-white truncate">{rep.title}</div>
                              <div className="text-[10px] font-bold text-emerald-500">{rep.status}</div>
                            </div>
                          </div>
                        ))}
                        {schoolReports.length === 0 && (
                          <div className="col-span-2 text-xs text-slate-400 italic py-3">
                            Ushbu maktab bo&apos;yicha hali hisobotlar kiritilmagan.
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </AnimatePresence>
            )}
          </div>
        </div>
      </div>

      {/* Add School Modal */}
      <AnimatePresence>
        {showRegisterModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.form
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onSubmit={handleRegisterSchoolSubmit}
              className="w-full max-w-lg bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/25 rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black tracking-tight">Yangi Maktab Qo&apos;shish</h3>
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-[#040D0A] text-slate-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Maktab nomi</label>
                  <input
                    required
                    value={schoolNameInput}
                    onChange={e => setSchoolNameInput(e.target.value)}
                    placeholder="Masalan: Yunusobod 240-maktab"
                    className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Maktab raqami</label>
                  <input
                    value={schoolNumberInput}
                    onChange={e => setSchoolNumberInput(e.target.value)}
                    placeholder="240"
                    className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Viloyat</label>
                  <select
                    value={schoolRegionInput}
                    onChange={e => handleRegionChange(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                  >
                    {UZBEKISTAN_REGIONS.map(r => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Tuman / Shahar</label>
                  <select
                    value={schoolDistrictInput}
                    onChange={e => setSchoolDistrictInput(e.target.value)}
                    className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                  >
                    {(UZBEKISTAN_DISTRICTS[schoolRegionInput] || ['Markaziy tuman']).map(d => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Mas&apos;ul elchi</label>
                  <input
                    value={schoolAmbInput}
                    onChange={e => setSchoolAmbInput(e.target.value)}
                    placeholder="Ism Familiya"
                    className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Email</label>
                  <input
                    type="email"
                    value={schoolAdminEmailInput}
                    onChange={e => setSchoolAdminEmailInput(e.target.value)}
                    placeholder="school@ecohero.uz"
                    className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full min-h-[44px] py-3 bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl font-black text-xs cursor-pointer"
              >
                Maktabni Bazaga Qo&apos;shish
              </button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>

      {/* Ambassador Modal */}
      <AnimatePresence>
        {showAmbassadorModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.form
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onSubmit={handleAmbassadorSubmit}
              className="w-full max-w-md bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/25 rounded-3xl p-5 sm:p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-lg font-black tracking-tight">
                  {isAdmin ? 'Eko-Elchi Tayinlash' : "Eko-Elchi Bo'lish"}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAmbassadorModal(false)}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-[#040D0A] text-slate-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                {selectedSchool?.name} uchun eko-tadbirlarni muvofiqlashtiruvchi rasmiy elchi.
              </p>

              {isAdmin ? (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Nomzod F.I.Sh</label>
                    <input
                      required
                      value={ambNameInput}
                      onChange={e => setAmbNameInput(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[11px] font-bold text-slate-500 dark:text-slate-400">Email</label>
                    <input
                      required
                      type="email"
                      value={ambEmailInput}
                      onChange={e => setAmbEmailInput(e.target.value)}
                      className="w-full min-h-[42px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                    />
                  </div>
                </div>
              ) : null}

              <button
                type="submit"
                className="w-full min-h-[44px] py-3 bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl font-black text-xs cursor-pointer"
              >
                {isAdmin ? 'Elchini Tayinlash' : "Ariza Yuborish"}
              </button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
