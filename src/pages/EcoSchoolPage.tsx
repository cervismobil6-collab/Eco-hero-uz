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
    <div className="max-w-7xl mx-auto px-4 py-10 space-y-12">
      {/* Cinematic Header */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-8 border-b border-slate-200 dark:border-slate-800 pb-10">
        <div className="space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-500 text-[10px] font-black uppercase tracking-widest">
            <SchoolIcon className="w-3.5 h-3.5" /> Institutional Network
          </div>
          <h1 className="text-5xl font-black text-slate-900 dark:text-white uppercase tracking-tighter">Eko-Maktablar</h1>
          <p className="text-slate-500 dark:text-slate-400 font-medium max-w-2xl">
            O'zbekiston bo'ylab minglab maktablar ECO HERO tarmog'iga qo'shilmoqda. O'z maktabingiz reytingini ko'taring va haqiqiy eko-elchiga aylaning.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            onClick={() => setShowRegisterModal(true)}
            className="px-6 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-black/5 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer flex items-center gap-2"
          >
            <Plus className="w-4 h-4" /> Maktab qo'shish
          </button>
          <button
            onClick={() => setShowAmbassadorModal(true)}
            className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-indigo-600/20 active:scale-95 transition-all cursor-pointer"
          >
            {isAdmin ? 'Elchi Tayinlash' : "Ambassador Bo'lish"}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 items-start">
        {/* Left: Directory Sidebar */}
        <div className="lg:col-span-4 space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Maktablar Bazasi</h3>
            <span className="text-[10px] font-bold text-emerald-500">{schools.length} Maktab</span>
          </div>

          <div className="space-y-3 max-h-[700px] overflow-y-auto pr-2 scrollbar-hide">
            {schools.map(sc => (
              <motion.button
                whileHover={{ x: 5 }}
                key={sc.id}
                onClick={() => setSelectedSchoolId(sc.id)}
                className={`w-full p-5 rounded-[24px] border transition-all text-left group cursor-pointer ${
                  selectedSchool?.id === sc.id
                    ? 'bg-slate-900 dark:bg-white border-slate-900 dark:border-white shadow-2xl'
                    : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-500'
                }`}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className={`text-2xl font-black font-mono tracking-tighter ${selectedSchool?.id === sc.id ? 'text-indigo-400' : 'text-slate-300'}`}>
                    #{sc.ratingRank}
                  </div>
                  <div
                    className={`px-2 py-1 rounded-lg text-[9px] font-black uppercase ${
                      selectedSchool?.id === sc.id
                        ? 'bg-white/10 text-white dark:bg-black/10 dark:text-black'
                        : 'bg-emerald-500/10 text-emerald-500'
                    }`}
                  >
                    {sc.totalCoins} ECO
                  </div>
                </div>
                <h4
                  className={`font-black text-sm uppercase tracking-tight mb-1 truncate ${
                    selectedSchool?.id === sc.id ? 'text-white dark:text-slate-950' : 'text-slate-900 dark:text-white'
                  }`}
                >
                  {sc.name}
                </h4>
                <div
                  className={`text-[10px] font-medium uppercase tracking-widest ${
                    selectedSchool?.id === sc.id ? 'text-slate-400 dark:text-slate-500' : 'text-slate-500'
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
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="bg-white dark:bg-slate-900 rounded-[48px] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden"
              >
                <div className="relative h-48 sm:h-64 bg-slate-900 overflow-hidden">
                  <img
                    src={resolveMediaUrl(selectedSchool.logoUrl) || 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1200&q=80'}
                    className="w-full h-full object-cover opacity-50 grayscale hover:grayscale-0 transition-all duration-1000"
                    alt=""
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-transparent to-transparent" />
                  <div className="absolute bottom-8 left-8 space-y-2">
                    <span className="px-3 py-1 bg-indigo-600 text-white rounded-full text-[10px] font-black uppercase tracking-widest">
                      {selectedSchool.region}
                    </span>
                    <h2 className="text-3xl sm:text-5xl font-black text-white uppercase tracking-tighter leading-none">
                      {selectedSchool.name}
                    </h2>
                  </div>
                </div>

                <div className="p-8 sm:p-12 space-y-10">
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                    {[
                      { label: 'Total Points', val: selectedSchool.totalCoins || 0, icon: Star, color: 'text-amber-500' },
                      { label: 'Trees Planted', val: selectedSchool.treesPlanted || 0, icon: TreePine, color: 'text-emerald-500' },
                      {
                        label: 'Students',
                        val: selectedSchool.registeredStudentsCount ?? 0,
                        icon: Users,
                        color: 'text-indigo-500',
                      },
                      { label: 'Cleanups', val: selectedSchool.cleanupsCompleted || 0, icon: Target, color: 'text-teal-500' },
                    ].map(m => (
                      <div key={m.label} className="space-y-1">
                        <div className="text-[9px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                          <m.icon className={`w-3 h-3 ${m.color}`} /> {m.label}
                        </div>
                        <div className="text-2xl font-black text-slate-900 dark:text-white font-mono tracking-tighter">
                          {m.val.toLocaleString()}
                        </div>
                      </div>
                    ))}
                  </div>

                  <div className="p-8 bg-slate-50 dark:bg-white/5 rounded-[32px] border border-slate-100 dark:border-white/5 flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="flex items-center gap-6">
                      <div className="w-16 h-16 rounded-[24px] bg-emerald-500 text-white flex items-center justify-center shadow-2xl shadow-emerald-500/20">
                        <Award className="w-8 h-8" />
                      </div>
                      <div className="space-y-1">
                        <div className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Maktab Ambassadori</div>
                        <div className="text-xl font-black text-slate-900 dark:text-white uppercase tracking-tight">
                          {selectedSchool.ambassadorName || 'Tayinlanmoqda'}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={handleCopyInviteLink}
                      className="px-8 py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-950 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-xl active:scale-95 transition-all cursor-pointer"
                    >
                      {inviteCopied ? 'Nusxalandi!' : 'Taklif Havolasi'}
                      {inviteCopied ? <Check className="w-4 h-4 text-emerald-500" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>

                  <div className="space-y-6">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Impact History</h4>
                      <button
                        onClick={() => setActiveTab('map')}
                        className="text-[9px] font-black text-emerald-500 uppercase hover:underline cursor-pointer"
                      >
                        Barchasini ko'rish
                      </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {schoolReports.slice(0, 4).map(rep => (
                        <div
                          key={rep.id}
                          className="p-5 bg-white dark:bg-slate-950 border border-slate-100 dark:border-slate-800 rounded-[24px] shadow-sm hover:border-emerald-500/30 transition-all flex gap-4 items-center"
                        >
                          <img src={rep.imageUrl} className="w-12 h-12 rounded-xl object-cover" alt="" />
                          <div className="min-w-0">
                            <div className="font-black text-xs text-slate-900 dark:text-white uppercase truncate">{rep.title}</div>
                            <div className="text-[9px] font-bold text-emerald-500 uppercase">{rep.status}</div>
                          </div>
                        </div>
                      ))}
                      {schoolReports.length === 0 && (
                        <div className="col-span-2 text-xs text-slate-400 italic py-4">
                          Ushbu maktab bo'yicha hali hisobotlar kiritilmagan.
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

      {/* Add School Modal */}
      <AnimatePresence>
        {showRegisterModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.form
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onSubmit={handleRegisterSchoolSubmit}
              className="w-full max-w-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] p-8 space-y-5 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black uppercase tracking-tight">Yangi Maktab Qo'shish</h3>
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Maktab nomi</label>
                  <input
                    required
                    value={schoolNameInput}
                    onChange={e => setSchoolNameInput(e.target.value)}
                    placeholder="Masalan: Yunusobod 240-maktab"
                    className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Maktab raqami</label>
                  <input
                    value={schoolNumberInput}
                    onChange={e => setSchoolNumberInput(e.target.value)}
                    placeholder="240"
                    className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Viloyat</label>
                  <select
                    value={schoolRegionInput}
                    onChange={e => handleRegionChange(e.target.value)}
                    className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                  >
                    {UZBEKISTAN_REGIONS.map(r => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <label className="text-[10px] font-black uppercase text-slate-400">Tuman / Shahar</label>
                  <select
                    value={schoolDistrictInput}
                    onChange={e => setSchoolDistrictInput(e.target.value)}
                    className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                  >
                    {(UZBEKISTAN_DISTRICTS[schoolRegionInput] || ['Markaziy tuman']).map(d => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Mas'ul elchi</label>
                  <input
                    value={schoolAmbInput}
                    onChange={e => setSchoolAmbInput(e.target.value)}
                    placeholder="Ism Familiya"
                    className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-400">Email</label>
                  <input
                    type="email"
                    value={schoolAdminEmailInput}
                    onChange={e => setSchoolAdminEmailInput(e.target.value)}
                    placeholder="school@ecohero.uz"
                    className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                  />
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-4 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest cursor-pointer"
              >
                Maktabni Bazaga Qo'shish
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
              className="w-full max-w-md bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[32px] p-8 space-y-5 shadow-2xl"
            >
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-black uppercase tracking-tight">
                  {isAdmin ? 'Eko-Elchi Tayinlash' : "Eko-Elchi Bo'lish"}
                </h3>
                <button
                  type="button"
                  onClick={() => setShowAmbassadorModal(false)}
                  className="p-2 rounded-xl bg-slate-100 dark:bg-white/5 text-slate-500 cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-xs text-slate-500 font-medium">
                {selectedSchool?.name} uchun eko-tadbirlarni muvofiqlashtiruvchi rasmiy elchi.
              </p>

              {isAdmin ? (
                <div className="space-y-4">
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Nomzod F.I.Sh</label>
                    <input
                      required
                      value={ambNameInput}
                      onChange={e => setAmbNameInput(e.target.value)}
                      className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-black uppercase text-slate-400">Email</label>
                    <input
                      required
                      type="email"
                      value={ambEmailInput}
                      onChange={e => setAmbEmailInput(e.target.value)}
                      className="w-full p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                    />
                  </div>
                </div>
              ) : null}

              <button
                type="submit"
                className="w-full py-4 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl font-black text-xs uppercase tracking-widest cursor-pointer"
              >
                {isAdmin ? 'Elchini Tayinlash' : "Ariza Yuborish (@jasurdost)"}
              </button>
            </motion.form>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
};
