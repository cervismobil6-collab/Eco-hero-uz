import React, { useMemo, useState } from 'react';
import {
  Building2,
  ShieldCheck,
  Users,
  GraduationCap,
  Search,
  Download,
  Plus,
  Edit3,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import {
  RegionalDistrictSummary,
  RosterAmbassadorEntry,
  RosterCaptainEntry,
  RosterStudentEntry,
  School,
} from '../../../types/eco';
import { UZBEKISTAN_DISTRICTS } from '../../../data/mockData';
import realisticAvatarImg from '../../../assets/images/profile_avatar_realistic_1795605008121.jpg';

interface RegionalSchoolsStudentsSectionProps {
  region: string;
  districts: RegionalDistrictSummary[];
  schools: School[];
  captains: RosterCaptainEntry[];
  ambassadors: RosterAmbassadorEntry[];
  students: RosterStudentEntry[];
  globalSearchQuery: string;
  initialDistrictFilter?: string;
  onRegisterSchool: (data: {
    name: string;
    number: string;
    region: string;
    district: string;
    address?: string;
    ambassadorName: string;
    registeredStudentsCount: number;
  }) => void;
  onUpdateSchool: (
    schoolId: string,
    updates: {
      name?: string;
      number?: string;
      address?: string;
      status?: 'verified' | 'pending';
      ambassadorName?: string;
    }
  ) => Promise<{ success: boolean }>;
}

export const RegionalSchoolsStudentsSection: React.FC<RegionalSchoolsStudentsSectionProps> = ({
  region,
  districts,
  schools,
  captains,
  ambassadors,
  students,
  globalSearchQuery,
  initialDistrictFilter = 'all',
  onRegisterSchool,
  onUpdateSchool,
}) => {
  const [subTab, setSubTab] = useState<'schools' | 'leaders' | 'students'>('schools');
  const [search, setSearch] = useState('');
  const [districtFilter, setDistrictFilter] = useState<string>(initialDistrictFilter || 'all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'verified' | 'pending'>('all');
  const [sortBy, setSortBy] = useState<'coins' | 'trees' | 'students'>('coins');

  // Create/Edit school modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newName, setNewName] = useState('');
  const [newNumber, setNewNumber] = useState('');
  const [newDistrict, setNewDistrict] = useState(
    districts[0]?.district || (UZBEKISTAN_DISTRICTS[region] || [])[0] || ''
  );
  const [newAddress, setNewAddress] = useState('');
  const [newAmbName, setNewAmbName] = useState('');
  const [editingSchool, setEditingSchool] = useState<School | null>(null);
  const [editStatus, setEditStatus] = useState<'verified' | 'pending'>('verified');
  const [editSaving, setEditSaving] = useState(false);

  const q = (search || globalSearchQuery).trim().toLowerCase();

  const districtNames = useMemo(() => {
    const set = new Set<string>(districts.map(d => d.district));
    for (const s of schools) if (s.district) set.add(s.district);
    return Array.from(set).sort();
  }, [districts, schools]);

  const filteredSchools = useMemo(() => {
    return schools
      .filter(s => {
        if (districtFilter !== 'all' && s.district?.toLowerCase() !== districtFilter.toLowerCase()) return false;
        if (statusFilter !== 'all') {
          const isVer = s.status === 'verified' || s.status === 'active';
          if (statusFilter === 'verified' && !isVer) return false;
          if (statusFilter === 'pending' && isVer) return false;
        }
        if (!q) return true;
        return (
          s.name.toLowerCase().includes(q) ||
          (s.number || '').toLowerCase().includes(q) ||
          (s.district || '').toLowerCase().includes(q) ||
          (s.ambassadorName || '').toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (sortBy === 'trees') return (b.treesPlanted || 0) - (a.treesPlanted || 0);
        if (sortBy === 'students') {
          return (b.registeredStudentsCount || b.studentsCount || 0) - (a.registeredStudentsCount || a.studentsCount || 0);
        }
        return (b.totalCoins || 0) - (a.totalCoins || 0);
      });
  }, [schools, districtFilter, statusFilter, sortBy, q]);

  const filteredCaptains = useMemo(() => {
    return captains.filter(c => {
      if (districtFilter !== 'all' && c.district?.toLowerCase() !== districtFilter.toLowerCase()) return false;
      if (!q) return true;
      return (
        c.fullName.toLowerCase().includes(q) ||
        (c.schoolName || '').toLowerCase().includes(q) ||
        (c.district || '').toLowerCase().includes(q)
      );
    });
  }, [captains, districtFilter, q]);

  const filteredAmbassadors = useMemo(() => {
    return ambassadors.filter(a => {
      if (districtFilter !== 'all' && a.district?.toLowerCase() !== districtFilter.toLowerCase()) return false;
      if (!q) return true;
      return (
        a.fullName.toLowerCase().includes(q) ||
        (a.schoolName || '').toLowerCase().includes(q) ||
        (a.district || '').toLowerCase().includes(q)
      );
    });
  }, [ambassadors, districtFilter, q]);

  const filteredStudents = useMemo(() => {
    return students.filter(st => {
      if (districtFilter !== 'all' && st.district?.toLowerCase() !== districtFilter.toLowerCase()) return false;
      if (!q) return true;
      return (
        st.fullName.toLowerCase().includes(q) ||
        (st.schoolName || '').toLowerCase().includes(q) ||
        (st.district || '').toLowerCase().includes(q)
      );
    });
  }, [students, districtFilter, q]);

  const exportCsv = () => {
    const rows =
      subTab === 'schools'
        ? [
            ['Maktab', 'Tuman', "O'quvchilar", 'Daraxtlar', 'EcoCoin', 'Holat'],
            ...filteredSchools.map(s => [
              s.name,
              s.district,
              String(s.registeredStudentsCount || s.studentsCount || 0),
              String(s.treesPlanted || 0),
              String(s.totalCoins || 0),
              s.status,
            ]),
          ]
        : [
            ["F.I.Sh.", 'Tuman', 'Maktab', 'Sinf', 'EcoCoin', 'Daraxtlar'],
            ...filteredStudents.map(st => [
              st.fullName,
              st.district,
              st.schoolName,
              st.grade || '',
              String(st.ecoCoins || 0),
              String(st.treesPlanted || 0),
            ]),
          ];
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ecohero-${region}-${subTab}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleCreateSchool = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim() || !newDistrict) return;
    onRegisterSchool({
      name: newName.trim(),
      number: newNumber.trim() || '1',
      region,
      district: newDistrict,
      address: newAddress.trim(),
      ambassadorName: newAmbName.trim() || 'Tayinlanmagan',
      registeredStudentsCount: 0,
    });
    setNewName('');
    setNewNumber('');
    setNewAddress('');
    setNewAmbName('');
    setShowCreateModal(false);
  };

  const handleSaveSchoolEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSchool) return;
    setEditSaving(true);
    try {
      const res = await onUpdateSchool(editingSchool.id, {
        name: editingSchool.name,
        number: editingSchool.number,
        address: editingSchool.address,
        ambassadorName: editingSchool.ambassadorName,
        status: editStatus,
      });
      if (res.success) setEditingSchool(null);
    } finally {
      setEditSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-1.5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20">
        <div className="flex flex-wrap gap-1.5 flex-1">
          {[
            { id: 'schools' as const, label: `Maktablar (${schools.length})`, icon: Building2 },
            {
              id: 'leaders' as const,
              label: `Sardorlar & Elchilar (${captains.length + ambassadors.length})`,
              icon: ShieldCheck,
            },
            { id: 'students' as const, label: `O‘quvchilar (${students.length})`, icon: GraduationCap },
          ].map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id)}
              className={`min-h-[42px] px-3.5 py-2 rounded-xl text-xs font-extrabold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                subTab === tab.id
                  ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700'
                  : 'text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#040D0A]'
              }`}
            >
              <tab.icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={exportCsv}
            className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-emerald-500" />
            <span>CSV</span>
          </button>
          {subTab === 'schools' && (
            <button
              type="button"
              onClick={() => setShowCreateModal(true)}
              className="min-h-[40px] px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] text-xs font-black border-b-[2px] border-emerald-700 inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Maktab qo‘shish</span>
            </button>
          )}
        </div>
      </div>

      {/* Filter Bar */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
        <div className="relative sm:col-span-2 lg:col-span-2">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Maktab, o‘quvchi, sardor yoki tuman nomi..."
            className="w-full min-h-[44px] pl-10 pr-4 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-400"
          />
        </div>
        <select
          value={districtFilter}
          onChange={e => setDistrictFilter(e.target.value)}
          className="min-h-[44px] px-3.5 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none focus:border-emerald-400"
        >
          <option value="all">Barcha tumanlar</option>
          {districtNames.map(d => (
            <option key={d} value={d}>
              {d}
            </option>
          ))}
        </select>
        {subTab === 'schools' ? (
          <div className="flex gap-2">
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none"
            >
              <option value="all">Barcha holatlar</option>
              <option value="verified">Tasdiqlangan</option>
              <option value="pending">Kutilmoqda</option>
            </select>
            <select
              value={sortBy}
              onChange={e => setSortBy(e.target.value as any)}
              className="flex-1 min-h-[44px] px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none"
            >
              <option value="coins">EcoCoin</option>
              <option value="trees">Daraxtlar</option>
              <option value="students">O‘quvchilar</option>
            </select>
          </div>
        ) : null}
      </div>

      {/* Schools Tab */}
      {subTab === 'schools' && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20">
          {filteredSchools.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-500">Tanlangan filtr bo‘yicha maktablar topilmadi.</p>
          ) : (
            <>
              <div className="md:hidden space-y-2.5">
                {filteredSchools.map((s, idx) => (
                  <div
                    key={s.id}
                    className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate">
                          <span className="font-mono text-slate-400 mr-1.5">#{idx + 1}</span>
                          {s.name}
                        </div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {s.district} · Elchi: {s.ambassadorName || 'Tayinlanmagan'}
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingSchool({ ...s });
                          setEditStatus(s.status === 'pending' ? 'pending' : 'verified');
                        }}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-500 cursor-pointer"
                      >
                        <Edit3 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-[11px] font-mono tabular-nums pt-1 border-t border-slate-200/70 dark:border-emerald-500/15">
                      <span>{s.registeredStudentsCount || s.studentsCount || 0} o‘quvchi</span>
                      <span className="text-emerald-500">{s.treesPlanted || 0} daraxt</span>
                      <span className="font-black text-amber-500">{(s.totalCoins || 0).toLocaleString()} ECO</span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="hidden md:block overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="border-b border-slate-200 dark:border-emerald-500/20 text-slate-500">
                    <tr>
                      <th className="py-3 pr-3">#</th>
                      <th className="py-3 px-3">Maktab</th>
                      <th className="py-3 px-3">Tuman</th>
                      <th className="py-3 px-3">Mas&apos;ul / Elchi</th>
                      <th className="py-3 px-3 text-right">O‘quvchilar</th>
                      <th className="py-3 px-3 text-right">Daraxt</th>
                      <th className="py-3 px-3 text-right">EcoCoin</th>
                      <th className="py-3 pl-3 text-right">Amal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-emerald-500/15">
                    {filteredSchools.map((s, idx) => (
                      <tr key={s.id} className="hover:bg-slate-50 dark:hover:bg-[#040D0A]/70">
                        <td className="py-3 pr-3 font-mono tabular-nums text-slate-400">#{idx + 1}</td>
                        <td className="py-3 px-3 font-bold text-slate-900 dark:text-white">
                          {s.name}
                          <div className="text-[11px] font-normal text-slate-500">
                            {s.status === 'verified' || s.status === 'active' ? 'Tasdiqlangan' : 'Kutilmoqda'}
                          </div>
                        </td>
                        <td className="py-3 px-3 text-slate-500">{s.district}</td>
                        <td className="py-3 px-3 text-slate-500">{s.ambassadorName || 'Tayinlanmagan'}</td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums">
                          {s.registeredStudentsCount || s.studentsCount || 0}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums text-emerald-500">
                          {s.treesPlanted || 0}
                        </td>
                        <td className="py-3 px-3 text-right font-mono tabular-nums font-bold text-amber-500">
                          {(s.totalCoins || 0).toLocaleString()} ECO
                        </td>
                        <td className="py-3 pl-3 text-right">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingSchool({ ...s });
                              setEditStatus(s.status === 'pending' ? 'pending' : 'verified');
                            }}
                            className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-[#040D0A] hover:text-emerald-500 font-bold text-[11px] cursor-pointer"
                          >
                            Tahrirlash
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      )}

      {/* Captains & Ambassadors Tab */}
      {subTab === 'leaders' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-emerald-500" />
              <span>Maktab Sardorlari ({filteredCaptains.length})</span>
            </h3>
            {filteredCaptains.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">Maktab sardorlari topilmadi.</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {filteredCaptains.map(c => (
                  <div
                    key={c.uid}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={c.avatarUrl || realisticAvatarImg}
                        alt={c.fullName}
                        className="w-9 h-9 rounded-full object-cover border border-emerald-500/30 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate">{c.fullName}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {c.district} · {c.schoolName}
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="font-black text-amber-500">{c.ecoCoins.toLocaleString()} ECO</div>
                      <div className="text-[10px] text-slate-500">{c.studentsCount} o‘quvchi</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
            <h3 className="text-sm font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-sky-500" />
              <span>Eco Elchilar ({filteredAmbassadors.length})</span>
            </h3>
            {filteredAmbassadors.length === 0 ? (
              <p className="py-8 text-center text-xs text-slate-500">Eco Elchilar topilmadi.</p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {filteredAmbassadors.map(a => (
                  <div
                    key={a.id}
                    className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 flex items-center justify-between gap-2 text-xs"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={a.avatarUrl || realisticAvatarImg}
                        alt={a.fullName}
                        className="w-9 h-9 rounded-full object-cover border border-sky-500/30 shrink-0"
                      />
                      <div className="min-w-0">
                        <div className="font-bold text-slate-900 dark:text-white truncate">{a.fullName}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {a.district} · {a.schoolName}
                        </div>
                      </div>
                    </div>
                    <div className="text-right font-mono tabular-nums shrink-0">
                      <div className="font-black text-emerald-500">{a.ecoCoins.toLocaleString()} ECO</div>
                      <div className="text-[10px] text-slate-500">
                        {a.verifiedActivitiesCount} faoliyat · {a.tasksCompletedCount} vazifa
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Students Activity Tab */}
      {subTab === 'students' && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
          <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
            Viloyatdagi faol o‘quvchilar ({filteredStudents.length})
          </h3>
          {filteredStudents.length === 0 ? (
            <p className="py-10 text-center text-xs text-slate-500">O‘quvchilar ma’lumoti topilmadi.</p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {filteredStudents.slice(0, 60).map((st, idx) => (
                <div
                  key={st.uid}
                  className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="font-mono text-[11px] text-slate-400">#{idx + 1}</span>
                    <img
                      src={st.avatarUrl || realisticAvatarImg}
                      alt={st.fullName}
                      className="w-8 h-8 rounded-full object-cover border border-emerald-500/30 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="font-bold text-slate-900 dark:text-white truncate">{st.fullName}</div>
                      <div className="text-[11px] text-slate-500 truncate">
                        {st.district} · {st.schoolName} {st.grade ? `(${st.grade})` : ''}
                      </div>
                    </div>
                  </div>
                  <div className="text-right font-mono tabular-nums shrink-0">
                    <div className="font-black text-amber-500">{st.ecoCoins.toLocaleString()} ECO</div>
                    <div className="text-[10px] text-emerald-500">
                      {st.treesPlanted} daraxt · {st.reportsCount} xabar
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Create School Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateSchool}
            className="w-full max-w-md p-5 rounded-3xl bg-white dark:bg-[#061812] border border-emerald-500/30 space-y-3.5 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 dark:text-white">Viloyatga Maktab Qo‘shish</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="font-semibold text-slate-500">Tuman / Shahar *</label>
              <select
                value={newDistrict}
                onChange={e => setNewDistrict(e.target.value)}
                className="w-full mt-1 min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
              >
                {districtNames.map(d => (
                  <option key={d} value={d}>
                    {d}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="font-semibold text-slate-500">Maktab nomi *</label>
                <input
                  type="text"
                  required
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Masalan: 17-sonli umumta'lim maktabi"
                  className="w-full mt-1 min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
                />
              </div>
              <div>
                <label className="font-semibold text-slate-500">Raqami</label>
                <input
                  type="text"
                  value={newNumber}
                  onChange={e => setNewNumber(e.target.value)}
                  placeholder="17"
                  className="w-full mt-1 min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
                />
              </div>
            </div>
            <div>
              <label className="font-semibold text-slate-500">Manzil</label>
              <input
                type="text"
                value={newAddress}
                onChange={e => setNewAddress(e.target.value)}
                placeholder="Ko‘cha, mahalla nomi"
                className="w-full mt-1 min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-500">Mas&apos;ul Eco Elchi (ixtiyoriy)</label>
              <input
                type="text"
                value={newAmbName}
                onChange={e => setNewAmbName(e.target.value)}
                placeholder="F.I.Sh."
                className="w-full mt-1 min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
              />
            </div>
            <button
              type="submit"
              className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black border-b-[3px] border-emerald-700 cursor-pointer"
            >
              Maktabni ro‘yxatdan o‘tkazish
            </button>
          </form>
        </div>
      )}

      {/* Edit School Modal */}
      {editingSchool && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveSchoolEdit}
            className="w-full max-w-md p-5 rounded-3xl bg-white dark:bg-[#061812] border border-emerald-500/30 space-y-3.5 text-xs shadow-2xl"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-slate-900 dark:text-white">Maktab Ma&apos;lumotini Tahrirlash</h3>
              <button
                type="button"
                onClick={() => setEditingSchool(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <XCircle className="w-5 h-5" />
              </button>
            </div>
            <div>
              <label className="font-semibold text-slate-500">Maktab nomi</label>
              <input
                type="text"
                required
                value={editingSchool.name}
                onChange={e => setEditingSchool({ ...editingSchool, name: e.target.value })}
                className="w-full mt-1 min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-500">Mas&apos;ul Eco Elchi</label>
              <input
                type="text"
                value={editingSchool.ambassadorName || ''}
                onChange={e => setEditingSchool({ ...editingSchool, ambassadorName: e.target.value })}
                className="w-full mt-1 min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
              />
            </div>
            <div>
              <label className="font-semibold text-slate-500">Holati</label>
              <select
                value={editStatus}
                onChange={e => setEditStatus(e.target.value as 'verified' | 'pending')}
                className="w-full mt-1 min-h-[42px] px-3 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
              >
                <option value="verified">Tasdiqlangan (Faol)</option>
                <option value="pending">Tekshiruvda</option>
              </select>
            </div>
            <button
              type="submit"
              disabled={editSaving}
              className="w-full min-h-[44px] rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black border-b-[3px] border-emerald-700 cursor-pointer disabled:opacity-60 inline-flex items-center justify-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{editSaving ? 'Saqlanmoqda...' : 'O‘zgarishlarni saqlash'}</span>
            </button>
          </form>
        </div>
      )}
    </div>
  );
};
