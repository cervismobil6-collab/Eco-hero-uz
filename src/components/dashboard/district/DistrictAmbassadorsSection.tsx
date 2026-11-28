import React, { useEffect, useMemo, useState } from 'react';
import { Users, Search, UserPlus, PauseCircle, PlayCircle, UserX, Trophy, Award } from 'lucide-react';
import { DistrictAmbassadorRating, RosterAmbassadorEntry, School } from '../../../types/eco';
import { useEco } from '../../../context/EcoContext';

interface DistrictAmbassadorsSectionProps {
  schools: School[];
  ambassadors: RosterAmbassadorEntry[];
  ambassadorRatings: DistrictAmbassadorRating[];
  globalSearchQuery?: string;
  onRefresh: () => Promise<void>;
}

export const DistrictAmbassadorsSection: React.FC<DistrictAmbassadorsSectionProps> = ({
  schools,
  ambassadors,
  ambassadorRatings,
  globalSearchQuery = '',
  onRefresh,
}) => {
  const { appointAmbassadorHierarchical, updateDistrictAmbassadorStatus } = useEco();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'revoked'>('active');
  const [schoolFilter, setSchoolFilter] = useState('all');
  const [sortBy, setSortBy] = useState<'score' | 'activities' | 'coins' | 'name'>('score');

  // Appoint form
  const [showAppoint, setShowAppoint] = useState(false);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [telegram, setTelegram] = useState('');
  const [grade, setGrade] = useState('9-A');
  const [schoolId, setSchoolId] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [confirmRevokeId, setConfirmRevokeId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (!schoolId && schools.length > 0) {
      setSchoolId(schools[0].id);
    }
  }, [schools, schoolId]);

  const effectiveQuery = (search || globalSearchQuery).trim().toLowerCase();

  const ratingById = useMemo(() => {
    const m = new Map<string, DistrictAmbassadorRating>();
    for (const r of ambassadorRatings) m.set(r.id, r);
    return m;
  }, [ambassadorRatings]);

  const filtered = useMemo(() => {
    const list = ambassadors.filter(a => {
      if (statusFilter !== 'all' && a.status !== statusFilter) return false;
      if (schoolFilter !== 'all' && a.schoolId !== schoolFilter && a.schoolName !== schoolFilter) return false;
      if (!effectiveQuery) return true;
      return `${a.fullName} ${a.schoolName} ${a.telegramUsername || ''} ${a.phone || ''}`
        .toLowerCase()
        .includes(effectiveQuery);
    });
    return [...list].sort((a, b) => {
      const ra = ratingById.get(a.id) || ratingById.get(a.uid);
      const rb = ratingById.get(b.id) || ratingById.get(b.uid);
      if (sortBy === 'activities') return (b.verifiedActivitiesCount || 0) - (a.verifiedActivitiesCount || 0);
      if (sortBy === 'coins') return (b.ecoCoins || 0) - (a.ecoCoins || 0);
      if (sortBy === 'name') return a.fullName.localeCompare(b.fullName);
      return (rb?.realScore || b.verifiedActivitiesCount * 100 + b.ecoCoins) - (ra?.realScore || a.verifiedActivitiesCount * 100 + a.ecoCoins);
    });
  }, [ambassadors, statusFilter, schoolFilter, effectiveQuery, sortBy, ratingById]);

  const handleAppoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || !schoolId) return;
    setSubmitting(true);
    try {
      const res = await appointAmbassadorHierarchical({
        schoolId,
        fullName: fullName.trim(),
        phoneNumber: phone.trim() || undefined,
        telegramUsername: telegram.trim() || undefined,
        grade: grade.trim() || undefined,
      });
      if (res.success) {
        setFullName('');
        setPhone('');
        setTelegram('');
        setShowAppoint(false);
        await onRefresh();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleStatusChange = async (id: string, status: 'active' | 'paused' | 'revoked') => {
    setBusyId(id);
    try {
      const res = await updateDistrictAmbassadorStatus(id, status);
      if (res.success) {
        setConfirmRevokeId(null);
        await onRefresh();
      }
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              <span>Tuman Eco Elchilari ({filtered.length})</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Eco Elchilarni tayinlash, faoliyat reytingi va vakolat holatini boshqarish
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowAppoint(v => !v)}
            className="px-4 py-2.5 min-h-[42px] bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer self-start sm:self-center"
          >
            <UserPlus className="w-4 h-4" />
            <span>{showAppoint ? 'Yopish' : 'Eco Elchi tayinlash'}</span>
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Ism, maktab yoki @username..."
              className="w-full pl-9 pr-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-400"
            />
          </div>
          <select
            value={statusFilter}
            onChange={e => setStatusFilter(e.target.value as any)}
            className="px-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
          >
            <option value="active">Faol elchilar</option>
            <option value="paused">To‘xtatilgan</option>
            <option value="revoked">Bekor qilingan</option>
            <option value="all">Barcha holatlar</option>
          </select>
          <select
            value={schoolFilter}
            onChange={e => setSchoolFilter(e.target.value)}
            className="px-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
          >
            <option value="all">Maktab: Barchasi</option>
            {schools.map(s => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="px-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
          >
            <option value="score">Saralash: Umumiy reyting</option>
            <option value="activities">Tasdiqlangan media</option>
            <option value="coins">EcoCoin</option>
            <option value="name">Ism (A–Z)</option>
          </select>
        </div>
      </div>

      {showAppoint && (
        <form
          onSubmit={handleAppoint}
          className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-emerald-500/35 space-y-3 text-xs"
        >
          <div className="font-black text-sm text-emerald-500">Yangi Eco Elchi tayinlash</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
            <input
              type="text"
              required
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              placeholder="To'liq ismi *"
              className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-400"
            />
            <select
              value={schoolId}
              onChange={e => setSchoolId(e.target.value)}
              className="px-3 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 font-bold outline-none"
            >
              {schools.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <input
              type="text"
              value={grade}
              onChange={e => setGrade(e.target.value)}
              placeholder="Sinf (9-A)"
              className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
            />
            <input
              type="text"
              value={phone}
              onChange={e => setPhone(e.target.value)}
              placeholder="Telefon (+998...)"
              className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
            />
            <input
              type="text"
              value={telegram}
              onChange={e => setTelegram(e.target.value)}
              placeholder="Telegram @username"
              className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 min-h-[42px] bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl font-black cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Tayinlanmoqda...' : 'Elchini tasdiqlash'}
            </button>
          </div>
        </form>
      )}

      {filtered.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-center text-xs text-slate-400">
          Eco Elchilar topilmadi.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map((amb, idx) => {
            const rating = ratingById.get(amb.id) || ratingById.get(amb.uid);
            const isTop3 = rating ? rating.isTop3 : idx < 3 && amb.status === 'active';
            return (
              <div
                key={amb.id}
                className={`p-4 rounded-2xl border flex flex-col justify-between gap-3 text-xs ${
                  isTop3
                    ? 'bg-gradient-to-br from-amber-500/10 via-white to-white dark:via-[#061812] dark:to-[#061812] border-amber-500/40'
                    : 'bg-white dark:bg-[#061812] border-slate-200 dark:border-emerald-500/20'
                }`}
              >
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className={`w-9 h-9 rounded-xl flex items-center justify-center font-mono font-black shrink-0 ${
                          isTop3
                            ? 'bg-amber-500 text-[#04110B]'
                            : 'bg-emerald-500/15 text-emerald-500'
                        }`}
                      >
                        {isTop3 ? <Trophy className="w-4 h-4" /> : `#${idx + 1}`}
                      </div>
                      <div className="min-w-0">
                        <div className="font-black text-sm text-slate-900 dark:text-white truncate">{amb.fullName}</div>
                        <div className="text-[11px] text-slate-500 truncate">{amb.schoolName}</div>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                        amb.status === 'active'
                          ? 'bg-emerald-500/15 text-emerald-500'
                          : amb.status === 'paused'
                          ? 'bg-amber-500/15 text-amber-500'
                          : 'bg-rose-500/15 text-rose-500'
                      }`}
                    >
                      {amb.status === 'active' ? 'Faol' : amb.status === 'paused' ? 'To‘xtatilgan' : 'Bekor'}
                    </span>
                  </div>

                  <div className="grid grid-cols-3 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/70 dark:border-emerald-500/15 font-mono tabular-nums">
                    <div>
                      <div className="text-[10px] font-sans text-slate-400">Ball</div>
                      <div className="font-black text-amber-500 flex items-center gap-1">
                        <Award className="w-3 h-3" />
                        {(rating?.realScore ?? amb.verifiedActivitiesCount * 100 + amb.ecoCoins).toLocaleString()}
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] font-sans text-slate-400">Faoliyat</div>
                      <div className="font-black text-slate-900 dark:text-white">{amb.verifiedActivitiesCount}</div>
                    </div>
                    <div>
                      <div className="text-[10px] font-sans text-slate-400">EcoCoin</div>
                      <div className="font-black text-emerald-500">{amb.ecoCoins.toLocaleString()}</div>
                    </div>
                  </div>
                </div>

                {confirmRevokeId === amb.id ? (
                  <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                    <div className="text-[11px] font-bold text-rose-500">Elchi maqomini bekor qilasizmi?</div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={busyId === amb.id}
                        onClick={() => handleStatusChange(amb.id, 'revoked')}
                        className="flex-1 py-1.5 min-h-[34px] rounded-lg bg-rose-500 text-white font-black cursor-pointer disabled:opacity-50"
                      >
                        Bekor qilish
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmRevokeId(null)}
                        className="px-3 py-1.5 min-h-[34px] rounded-lg bg-slate-200 dark:bg-[#040D0A] font-bold cursor-pointer"
                      >
                        Qoldirish
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-1.5 pt-2 border-t border-slate-100 dark:border-emerald-500/15">
                    {amb.status !== 'active' ? (
                      <button
                        type="button"
                        disabled={busyId === amb.id}
                        onClick={() => handleStatusChange(amb.id, 'active')}
                        className="flex-1 py-2 min-h-[38px] rounded-xl bg-emerald-500/15 text-emerald-500 font-bold flex items-center justify-center gap-1 cursor-pointer hover:bg-emerald-500 hover:text-[#04110B] transition-colors disabled:opacity-50"
                      >
                        <PlayCircle className="w-3.5 h-3.5" />
                        <span>Faollashtirish</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busyId === amb.id}
                        onClick={() => handleStatusChange(amb.id, 'paused')}
                        className="flex-1 py-2 min-h-[38px] rounded-xl bg-amber-500/15 text-amber-500 font-bold flex items-center justify-center gap-1 cursor-pointer hover:bg-amber-500 hover:text-[#04110B] transition-colors disabled:opacity-50"
                      >
                        <PauseCircle className="w-3.5 h-3.5" />
                        <span>To‘xtatish</span>
                      </button>
                    )}
                    {amb.status !== 'revoked' && (
                      <button
                        type="button"
                        disabled={busyId === amb.id}
                        onClick={() => setConfirmRevokeId(amb.id)}
                        className="px-3 py-2 min-h-[38px] rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                        title="Maqomni bekor qilish"
                      >
                        <UserX className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
