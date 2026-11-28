import React, { useMemo, useState } from 'react';
import {
  Building2,
  Search,
  Plus,
  Edit2,
  X,
  CheckCircle2,
  Users,
  Trees,
  Coins,
  ShieldCheck,
  UserCheck,
} from 'lucide-react';
import { EcoReport, RosterAmbassadorEntry, RosterCaptainEntry, School } from '../../../types/eco';
import { useEco } from '../../../context/EcoContext';

interface DistrictSchoolsSectionProps {
  region: string;
  district: string;
  schools: School[];
  captains: RosterCaptainEntry[];
  ambassadors: RosterAmbassadorEntry[];
  reports: EcoReport[];
  globalSearchQuery?: string;
  onRefresh: () => Promise<void>;
}

export const DistrictSchoolsSection: React.FC<DistrictSchoolsSectionProps> = ({
  region,
  district,
  schools,
  captains,
  ambassadors,
  reports,
  globalSearchQuery = '',
  onRefresh,
}) => {
  const { apiFetch, updateDistrictSchool, showNotification } = useEco();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'pending'>('all');
  const [sortBy, setSortBy] = useState<'coins' | 'students' | 'trees' | 'name'>('coins');

  // Add School modal state
  const [showAddModal, setShowAddModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newAmbassador, setNewAmbassador] = useState('');
  const [adding, setAdding] = useState(false);

  // Edit School modal state
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [editName, setEditName] = useState('');
  const [editNumber, setEditNumber] = useState('');
  const [editAddress, setEditAddress] = useState('');
  const [editStatus, setEditStatus] = useState<'verified' | 'pending'>('verified');
  const [editAmbassador, setEditAmbassador] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);

  // Detail inspect modal
  const [inspectSchool, setInspectSchool] = useState<School | null>(null);

  const effectiveQuery = (search || globalSearchQuery).trim().toLowerCase();

  const filtered = useMemo(() => {
    const list = schools.filter(s => {
      if (statusFilter !== 'all' && s.status !== statusFilter) return false;
      if (!effectiveQuery) return true;
      return `${s.name} ${s.number || ''} ${s.ambassadorName || ''} ${s.address || ''}`
        .toLowerCase()
        .includes(effectiveQuery);
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'students') {
        return (b.registeredStudentsCount || b.studentsCount || 0) - (a.registeredStudentsCount || a.studentsCount || 0);
      }
      if (sortBy === 'trees') return (b.treesPlanted || 0) - (a.treesPlanted || 0);
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      return (b.totalCoins || 0) - (a.totalCoins || 0);
    });
  }, [schools, statusFilter, effectiveQuery, sortBy]);

  const handleAddSchool = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setAdding(true);
    try {
      const res = await apiFetch('/api/schools/register', {
        method: 'POST',
        body: JSON.stringify({
          name: newName.trim(),
          number: newNumber.trim() || undefined,
          region,
          district,
          ambassadorName: newAmbassador.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification(data.error || "Maktab qo'shilmadi", 'warning');
        return;
      }
      showNotification("Yangi maktab tuman ro'yxatiga qo'shildi!", 'success');
      setShowAddModal(false);
      setNewName('');
      setNewNumber('');
      setNewAmbassador('');
      await onRefresh();
    } catch {
      showNotification("Server bilan bog'lanishda xatolik", 'warning');
    } finally {
      setAdding(false);
    }
  };

  const openEdit = (school: School) => {
    setEditingSchool(school);
    setEditName(school.name || '');
    setEditNumber(school.number || '');
    setEditAddress(school.address || '');
    setEditStatus(school.status === 'pending' ? 'pending' : 'verified');
    setEditAmbassador(school.ambassadorName || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchool || !editName.trim()) return;
    setSavingEdit(true);
    try {
      const res = await updateDistrictSchool(editingSchool.id, {
        name: editName.trim(),
        number: editNumber.trim(),
        address: editAddress.trim(),
        status: editStatus,
        ambassadorName: editAmbassador.trim(),
      });
      if (res.success) {
        setEditingSchool(null);
        await onRefresh();
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const getSchoolCaptain = (s: School) =>
    captains.find(c => c.schoolId === s.id || c.uid === s.captainId || c.schoolName === s.name);

  const getSchoolAmbassadors = (s: School) =>
    ambassadors.filter(a => a.status !== 'revoked' && (a.schoolId === s.id || a.schoolName === s.name));

  const getSchoolReportsCount = (s: School) =>
    reports.filter(r => r.schoolId === s.id || r.schoolName === s.name).length;

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black">Tuman maktablari ({filtered.length})</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {region} · {district} hududidagi maktablar katalogi va tahrirlash
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-4 py-2.5 min-h-[44px] bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl text-xs font-black flex items-center justify-center gap-1.5 cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Maktab qo‘shish</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Maktab nomi yoki raqami..."
              className="w-full pl-9 pr-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-400"
            />
          </div>

          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
          >
            <option value="all">Holat: Barchasi</option>
            <option value="verified">Tasdiqlangan</option>
            <option value="pending">Kutilmoqda</option>
          </select>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="px-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
          >
            <option value="coins">Saralash: EcoCoin bo‘yicha</option>
            <option value="students">O‘quvchilar soni</option>
            <option value="trees">Ekilgan daraxtlar</option>
            <option value="name">Nomi (A–Z)</option>
          </select>
        </div>
      </div>

      {/* Schools Grid */}
      {filtered.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-center text-xs text-slate-400">
          Mos maktab topilmadi.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(s => {
            const cap = getSchoolCaptain(s);
            const ambs = getSchoolAmbassadors(s);
            const repCount = getSchoolReportsCount(s);
            return (
              <div
                key={s.id}
                className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 flex flex-col justify-between gap-3"
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-sm font-black truncate text-slate-900 dark:text-white">{s.name}</h3>
                        <div className="text-[11px] text-slate-500 truncate">
                          {s.number ? `№${s.number} · ` : ''}{s.address || district}
                        </div>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                        s.status === 'verified'
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : 'bg-amber-500/15 text-amber-500'
                      }`}
                    >
                      {s.status === 'verified' ? 'Tasdiqlangan' : 'Kutilmoqda'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/70 dark:border-emerald-500/15 text-[11px] font-mono tabular-nums">
                    <div>
                      <div className="text-slate-400 font-sans flex items-center gap-1">
                        <Users className="w-3 h-3" /> O‘quvchi
                      </div>
                      <div className="font-black text-slate-900 dark:text-white">
                        {s.registeredStudentsCount || s.studentsCount || 0}
                      </div>
                    </div>
                    <div>
                      <div className="text-slate-400 font-sans flex items-center gap-1">
                        <Coins className="w-3 h-3 text-amber-400" /> EcoCoin
                      </div>
                      <div className="font-black text-emerald-500">{(s.totalCoins || 0).toLocaleString()}</div>
                    </div>
                    <div>
                      <div className="text-slate-400 font-sans flex items-center gap-1">
                        <Trees className="w-3 h-3 text-emerald-400" /> Daraxt
                      </div>
                      <div className="font-black text-slate-900 dark:text-white">{s.treesPlanted || 0}</div>
                    </div>
                  </div>

                  <div className="space-y-1 text-[11px] text-slate-500 dark:text-slate-300">
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 text-slate-400">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" /> Sardor:
                      </span>
                      <span className="font-bold truncate">{cap ? cap.fullName : 'Biriktirilmagan'}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1 text-slate-400">
                        <UserCheck className="w-3.5 h-3.5 text-sky-400" /> Elchilar:
                      </span>
                      <span className="font-bold tabular-nums">{ambs.length} nafar · Hisobot: {repCount}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-emerald-500/15">
                  <button
                    type="button"
                    onClick={() => setInspectSchool(s)}
                    className="flex-1 py-2 min-h-[40px] rounded-xl bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold text-slate-700 dark:text-slate-200 hover:border-emerald-400 cursor-pointer"
                  >
                    Batafsil
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(s)}
                    className="px-3.5 py-2 min-h-[40px] rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 text-xs font-black flex items-center gap-1 cursor-pointer hover:bg-emerald-500 hover:text-[#04110B] transition-colors"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                    <span>Tahrirlash</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add School Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/30 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black">Yangi maktab qo‘shish</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-emerald-500/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleAddSchool} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Maktab nomi *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Masalan: 15-sonli umumta'lim maktabi"
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/25 outline-none focus:border-emerald-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Maktab raqami</label>
                  <input
                    type="text"
                    value={newNumber}
                    onChange={e => setNewNumber(e.target.value)}
                    placeholder="15"
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/25 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Hudud</label>
                  <input
                    type="text"
                    readOnly
                    value={district}
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-100 dark:bg-[#040D0A]/60 border border-slate-200 dark:border-emerald-500/15 text-slate-500 outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Mas'ul Eco Elchi (ixtiyoriy)</label>
                <input
                  type="text"
                  value={newAmbassador}
                  onChange={e => setNewAmbassador(e.target.value)}
                  placeholder="Ism familiya"
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/25 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={adding}
                className="w-full py-3 min-h-[44px] bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl font-black cursor-pointer disabled:opacity-50"
              >
                {adding ? 'Saqlanmoqda...' : 'Maktabni saqlash'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Edit School Modal */}
      {editingSchool && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/30 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black">Maktabni tahrirlash</h3>
              <button
                type="button"
                onClick={() => setEditingSchool(null)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-emerald-500/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveEdit} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Maktab nomi</label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={e => setEditName(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/25 outline-none focus:border-emerald-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Maktab raqami</label>
                  <input
                    type="text"
                    value={editNumber}
                    onChange={e => setEditNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/25 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-500 mb-1">Holat</label>
                  <select
                    value={editStatus}
                    onChange={e => setEditStatus(e.target.value as 'verified' | 'pending')}
                    className="w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/25 outline-none font-bold"
                  >
                    <option value="verified">Tasdiqlangan</option>
                    <option value="pending">Kutilmoqda</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Manzil / Ko‘cha</label>
                <input
                  type="text"
                  value={editAddress}
                  onChange={e => setEditAddress(e.target.value)}
                  placeholder="Mahalla, ko‘cha..."
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/25 outline-none"
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Mas'ul Eco Elchi nomi</label>
                <input
                  type="text"
                  value={editAmbassador}
                  onChange={e => setEditAmbassador(e.target.value)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/25 outline-none"
                />
              </div>
              <button
                type="submit"
                disabled={savingEdit}
                className="w-full py-3 min-h-[44px] bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl font-black cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{savingEdit ? 'Saqlanmoqda...' : 'O‘zgarishlarni saqlash'}</span>
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Inspect School Modal */}
      {inspectSchool && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/30 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black">{inspectSchool.name}</h3>
                <p className="text-xs text-slate-500">{inspectSchool.region} · {inspectSchool.district}</p>
              </div>
              <button
                type="button"
                onClick={() => setInspectSchool(null)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-emerald-500/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-2.5 text-xs">
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/70 dark:border-emerald-500/15">
                <div className="text-slate-400">O‘quvchilar</div>
                <div className="text-lg font-black font-mono tabular-nums">
                  {inspectSchool.registeredStudentsCount || inspectSchool.studentsCount || 0}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/70 dark:border-emerald-500/15">
                <div className="text-slate-400">Jami EcoCoin</div>
                <div className="text-lg font-black font-mono tabular-nums text-emerald-500">
                  {(inspectSchool.totalCoins || 0).toLocaleString()}
                </div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/70 dark:border-emerald-500/15">
                <div className="text-slate-400">Ekilgan daraxtlar</div>
                <div className="text-lg font-black font-mono tabular-nums">{inspectSchool.treesPlanted || 0}</div>
              </div>
              <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/70 dark:border-emerald-500/15">
                <div className="text-slate-400">Tozalash aksiyalari</div>
                <div className="text-lg font-black font-mono tabular-nums">{inspectSchool.cleanupsCompleted || 0}</div>
              </div>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/70 dark:border-emerald-500/15 text-xs space-y-1">
              <div>
                <span className="text-slate-400">Maktab sardori: </span>
                <span className="font-bold">{getSchoolCaptain(inspectSchool)?.fullName || 'Biriktirilmagan'}</span>
              </div>
              <div>
                <span className="text-slate-400">Eco Elchilar: </span>
                <span className="font-bold">
                  {getSchoolAmbassadors(inspectSchool).map(a => a.fullName).join(', ') || 'Yo‘q'}
                </span>
              </div>
              <div>
                <span className="text-slate-400">Ekologik hisobotlar: </span>
                <span className="font-bold tabular-nums">{getSchoolReportsCount(inspectSchool)} ta</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
