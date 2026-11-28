import React, { useMemo, useState } from 'react';
import { Search, GraduationCap, Edit2, X, CheckCircle2, Coins, FileText, Trees } from 'lucide-react';
import { RosterStudentEntry, School } from '../../../types/eco';
import { useEco } from '../../../context/EcoContext';

interface DistrictStudentsSectionProps {
  students: RosterStudentEntry[];
  schools: School[];
  globalSearchQuery?: string;
  onRefresh: () => Promise<void>;
}

export const DistrictStudentsSection: React.FC<DistrictStudentsSectionProps> = ({
  students,
  schools,
  globalSearchQuery = '',
  onRefresh,
}) => {
  const { updateDistrictStudent } = useEco();

  const [search, setSearch] = useState('');
  const [schoolFilter, setSchoolFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'coins' | 'reports' | 'trees' | 'name'>('coins');

  const [editingStudent, setEditingStudent] = useState<RosterStudentEntry | null>(null);
  const [editSchoolId, setEditSchoolId] = useState('');
  const [editGrade, setEditGrade] = useState('');
  const [saving, setSaving] = useState(false);

  const effectiveQuery = (search || globalSearchQuery).trim().toLowerCase();

  const filtered = useMemo(() => {
    const list = students.filter(st => {
      if (schoolFilter !== 'all' && st.schoolId !== schoolFilter && st.schoolName !== schoolFilter) return false;
      if (!effectiveQuery) return true;
      return `${st.fullName} ${st.schoolName} ${st.grade || ''} ${st.telegramUsername || ''}`
        .toLowerCase()
        .includes(effectiveQuery);
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'reports') return (b.reportsCount || 0) - (a.reportsCount || 0);
      if (sortBy === 'trees') return (b.treesPlanted || 0) - (a.treesPlanted || 0);
      if (sortBy === 'name') return a.fullName.localeCompare(b.fullName);
      return (b.ecoCoins || 0) - (a.ecoCoins || 0);
    });
  }, [students, schoolFilter, effectiveQuery, sortBy]);

  const totalCoins = useMemo(
    () => filtered.reduce((sum, s) => sum + (s.ecoCoins || 0), 0),
    [filtered]
  );

  const openEdit = (st: RosterStudentEntry) => {
    setEditingStudent(st);
    setEditSchoolId(st.schoolId || schools[0]?.id || '');
    setEditGrade(st.grade || '9-A');
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStudent) return;
    setSaving(true);
    try {
      const res = await updateDistrictStudent(editingStudent.uid, {
        schoolId: editSchoolId || undefined,
        grade: editGrade.trim() || undefined,
      });
      if (res.success) {
        setEditingStudent(null);
        await onRefresh();
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h2 className="text-base font-black">Tuman o‘quvchilari ({filtered.length})</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Ro‘yxatdan o‘tgan o‘quvchilar faolligi, sinf va maktab biriktiruvi
            </p>
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-xs font-black text-emerald-500 font-mono tabular-nums self-start sm:self-center">
            Jami balans: {totalCoins.toLocaleString()} ECO
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ism, sinf yoki @username..."
              className="w-full pl-9 pr-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-400"
            />
          </div>

          <select
            value={schoolFilter}
            onChange={e => setSchoolFilter(e.target.value)}
            className="px-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
          >
            <option value="all">Maktab: Barchasi ({schools.length})</option>
            {schools.map(sc => (
              <option key={sc.id} value={sc.id}>
                {sc.name}
              </option>
            ))}
          </select>

          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="px-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
          >
            <option value="coins">Saralash: EcoCoin</option>
            <option value="reports">Hisobotlar soni</option>
            <option value="trees">Ekilgan daraxtlar</option>
            <option value="name">Ism (A–Z)</option>
          </select>
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-center text-xs text-slate-400">
          O‘quvchilar topilmadi.
        </div>
      ) : (
        <>
          {/* Mobile Cards */}
          <div className="md:hidden space-y-2.5">
            {filtered.map((st, idx) => (
              <div
                key={st.uid}
                className="p-3.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-2.5 text-xs"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-black text-slate-900 dark:text-white flex items-center gap-1.5">
                      <span className="font-mono text-emerald-500">#{idx + 1}</span>
                      <span className="truncate">{st.fullName}</span>
                    </div>
                    <div className="text-[11px] text-slate-500 truncate">
                      {st.schoolName} · {st.grade || '—'}
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-500 font-mono font-black tabular-nums shrink-0">
                    {st.ecoCoins.toLocaleString()} ECO
                  </span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-500 pt-2 border-t border-slate-100 dark:border-emerald-500/15">
                  <div className="flex items-center gap-3 font-mono tabular-nums">
                    <span className="flex items-center gap-1">
                      <FileText className="w-3 h-3 text-sky-400" /> {st.reportsCount}
                    </span>
                    <span className="flex items-center gap-1">
                      <Trees className="w-3 h-3 text-emerald-400" /> {st.treesPlanted}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEdit(st)}
                    className="px-3 py-1.5 min-h-[34px] rounded-lg bg-emerald-500/15 text-emerald-500 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Edit2 className="w-3 h-3" /> Tahrirlash
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Desktop Table */}
          <div className="hidden md:block rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-slate-50 dark:bg-[#040D0A] text-[10px] font-black uppercase text-slate-400">
                  <tr>
                    <th className="px-4 py-3">#</th>
                    <th className="px-4 py-3">O‘quvchi</th>
                    <th className="px-4 py-3">Maktab / Sinf</th>
                    <th className="px-4 py-3 text-right">Hisobot</th>
                    <th className="px-4 py-3 text-right">Daraxt</th>
                    <th className="px-4 py-3 text-right">EcoCoin</th>
                    <th className="px-4 py-3 text-right">Amal</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-emerald-500/15">
                  {filtered.map((st, idx) => (
                    <tr key={st.uid} className="hover:bg-slate-50 dark:hover:bg-[#040D0A]/60">
                      <td className="px-4 py-3 font-mono text-slate-400 tabular-nums">{idx + 1}</td>
                      <td className="px-4 py-3">
                        <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                          <GraduationCap className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                          <span>{st.fullName}</span>
                        </div>
                        <div className="text-[11px] text-slate-400">
                          {st.telegramUsername ? `@${st.telegramUsername.replace(/^@/, '')}` : st.badge}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="font-semibold">{st.schoolName}</div>
                        <div className="text-[11px] text-slate-400">Sinf: {st.grade || '—'}</div>
                      </td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{st.reportsCount}</td>
                      <td className="px-4 py-3 text-right font-mono tabular-nums">{st.treesPlanted}</td>
                      <td className="px-4 py-3 text-right font-mono font-black text-emerald-500 tabular-nums">
                        <span className="inline-flex items-center gap-1">
                          <Coins className="w-3 h-3 text-amber-400" />
                          {st.ecoCoins.toLocaleString()}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => openEdit(st)}
                          className="px-3 py-1.5 min-h-[34px] rounded-lg bg-emerald-500/15 text-emerald-500 hover:bg-emerald-500 hover:text-[#04110B] font-bold inline-flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Tahrirlash</span>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {/* Edit Student Modal */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/30 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black">{editingStudent.fullName}</h3>
                <p className="text-xs text-slate-500">Maktab va sinf ma'lumotini tahrirlash</p>
              </div>
              <button
                type="button"
                onClick={() => setEditingStudent(null)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-emerald-500/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSave} className="space-y-3 text-xs">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Maktab</label>
                <select
                  value={editSchoolId}
                  onChange={e => setEditSchoolId(e.target.value)}
                  className="w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/25 font-bold outline-none"
                >
                  {schools.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Sinf</label>
                <input
                  type="text"
                  value={editGrade}
                  onChange={e => setEditGrade(e.target.value)}
                  placeholder="9-A"
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/25 outline-none focus:border-emerald-400"
                />
              </div>
              <button
                type="submit"
                disabled={saving}
                className="w-full py-3 min-h-[44px] bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl font-black cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{saving ? 'Saqlanmoqda...' : 'Saqlash'}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
