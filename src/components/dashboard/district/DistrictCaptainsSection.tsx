import React, { useEffect, useMemo, useState } from 'react';
import {
  ShieldCheck,
  Search,
  UserPlus,
  MessageSquare,
  RefreshCw,
  UserMinus,
  X,
  CheckCircle2,
  Send,
} from 'lucide-react';
import { RosterCaptainEntry, School } from '../../../types/eco';
import { useEco } from '../../../context/EcoContext';

interface DistrictCaptainsSectionProps {
  region: string;
  district: string;
  schools: School[];
  captains: RosterCaptainEntry[];
  globalSearchQuery?: string;
  onOpenCaptainChat: (captainUid?: string, districtName?: string) => void;
  onRefresh: () => Promise<void>;
}

export const DistrictCaptainsSection: React.FC<DistrictCaptainsSectionProps> = ({
  region,
  district,
  schools,
  captains,
  globalSearchQuery = '',
  onOpenCaptainChat,
  onRefresh,
}) => {
  const { appointSchoolCaptain, manageDistrictCaptain } = useEco();

  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'students' | 'coins' | 'name'>('students');
  const [showAppointForm, setShowAppointForm] = useState(false);

  // Appoint form
  const [captainFullName, setCaptainFullName] = useState('');
  const [captainPhone, setCaptainPhone] = useState('');
  const [captainTelegram, setCaptainTelegram] = useState('');
  const [captainEmail, setCaptainEmail] = useState('');
  const [captainGrade, setCaptainGrade] = useState('10-A');
  const [selectedSchoolId, setSelectedSchoolId] = useState('');
  const [newSchoolNumber, setNewSchoolNumber] = useState('');
  const [newSchoolName, setNewSchoolName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Reassign / revoke modal
  const [reassignCaptain, setReassignCaptain] = useState<RosterCaptainEntry | null>(null);
  const [reassignSchoolId, setReassignSchoolId] = useState('');
  const [confirmRevokeUid, setConfirmRevokeUid] = useState<string | null>(null);
  const [busyUid, setBusyUid] = useState<string | null>(null);

  useEffect(() => {
    if (!selectedSchoolId) {
      setSelectedSchoolId(schools[0]?.id || '__new__');
    }
  }, [schools, selectedSchoolId]);

  const effectiveQuery = (search || globalSearchQuery).trim().toLowerCase();

  const filtered = useMemo(() => {
    const list = captains.filter(c => {
      if (!effectiveQuery) return true;
      return `${c.fullName} ${c.schoolName} ${c.telegramUsername || ''} ${c.phoneNumber || ''}`
        .toLowerCase()
        .includes(effectiveQuery);
    });
    return [...list].sort((a, b) => {
      if (sortBy === 'coins') return (b.ecoCoins || 0) - (a.ecoCoins || 0);
      if (sortBy === 'name') return a.fullName.localeCompare(b.fullName);
      return (b.studentsCount || 0) - (a.studentsCount || 0);
    });
  }, [captains, effectiveQuery, sortBy]);

  const handleAppoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!captainFullName.trim()) return;
    setSubmitting(true);
    try {
      const isNew = selectedSchoolId === '__new__' || !selectedSchoolId;
      const res = await appointSchoolCaptain({
        fullName: captainFullName.trim(),
        phoneNumber: captainPhone.trim() || undefined,
        telegramUsername: captainTelegram.trim() || undefined,
        email: captainEmail.trim() || undefined,
        grade: captainGrade.trim() || undefined,
        schoolId: isNew ? undefined : selectedSchoolId,
        schoolNumber: isNew ? newSchoolNumber.trim() : undefined,
        schoolName: isNew ? newSchoolName.trim() : undefined,
        region,
        district,
      });
      if (res.success) {
        setCaptainFullName('');
        setCaptainPhone('');
        setCaptainTelegram('');
        setCaptainEmail('');
        setNewSchoolNumber('');
        setNewSchoolName('');
        setShowAppointForm(false);
        await onRefresh();
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleReassign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reassignCaptain || !reassignSchoolId) return;
    setBusyUid(reassignCaptain.uid);
    try {
      const res = await manageDistrictCaptain(reassignCaptain.uid, {
        action: 'reassign',
        schoolId: reassignSchoolId,
      });
      if (res.success) {
        setReassignCaptain(null);
        await onRefresh();
      }
    } finally {
      setBusyUid(null);
    }
  };

  const handleRevoke = async (uid: string) => {
    setBusyUid(uid);
    try {
      const res = await manageDistrictCaptain(uid, {
        action: 'revoke',
        reason: 'Tuman koordinatori tomonidan lavozimdan olindi',
      });
      if (res.success) {
        setConfirmRevokeUid(null);
        await onRefresh();
      }
    } finally {
      setBusyUid(null);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-black">Maktab sardorlari ({filtered.length})</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Har bir maktabning sardorini tayinlash, qayta biriktirish va tezkor aloqa
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onOpenCaptainChat(undefined, district)}
              className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/25 text-xs font-bold flex items-center gap-1.5 cursor-pointer hover:border-emerald-400"
            >
              <Send className="w-3.5 h-3.5 text-emerald-500" />
              <span>Umumiy guruh</span>
            </button>
            <button
              type="button"
              onClick={() => setShowAppointForm(v => !v)}
              className="px-4 py-2.5 min-h-[42px] bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer"
            >
              <UserPlus className="w-4 h-4" />
              <span>{showAppointForm ? 'Yopish' : 'Sardor tayinlash'}</span>
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Sardor ismi, maktab yoki @username..."
              className="w-full pl-9 pr-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-400"
            />
          </div>
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value as any)}
            className="px-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
          >
            <option value="students">Saralash: O‘quvchilar soni</option>
            <option value="coins">EcoCoin bo‘yicha</option>
            <option value="name">Ism (A–Z)</option>
          </select>
        </div>
      </div>

      {/* Inline Appoint Captain Drawer */}
      {showAppointForm && (
        <form
          onSubmit={handleAppoint}
          className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-emerald-500/35 space-y-3 text-xs"
        >
          <div className="font-black text-sm flex items-center gap-2 text-emerald-500">
            <UserPlus className="w-4 h-4" />
            <span>Yangi Maktab Sardori tayinlash ({district})</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
            <input
              type="text"
              required
              value={captainFullName}
              onChange={e => setCaptainFullName(e.target.value)}
              placeholder="To'liq ismi *"
              className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-400"
            />
            <input
              type="text"
              value={captainPhone}
              onChange={e => setCaptainPhone(e.target.value)}
              placeholder="Telefon (+998...)"
              className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
            />
            <input
              type="text"
              value={captainTelegram}
              onChange={e => setCaptainTelegram(e.target.value)}
              placeholder="Telegram @username"
              className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
            />
            <input
              type="email"
              value={captainEmail}
              onChange={e => setCaptainEmail(e.target.value)}
              placeholder="Email (ixtiyoriy)"
              className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
            />
            <input
              type="text"
              value={captainGrade}
              onChange={e => setCaptainGrade(e.target.value)}
              placeholder="Sinf (masalan 10-A)"
              className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
            />
            <select
              value={selectedSchoolId}
              onChange={e => setSelectedSchoolId(e.target.value)}
              className="px-3 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 font-bold outline-none"
            >
              {schools.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
              <option value="__new__">+ Yangi maktab kiritish</option>
            </select>
          </div>
          {selectedSchoolId === '__new__' && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <input
                type="text"
                required
                value={newSchoolNumber}
                onChange={e => setNewSchoolNumber(e.target.value)}
                placeholder="Maktab raqami *"
                className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
              />
              <input
                type="text"
                required
                value={newSchoolName}
                onChange={e => setNewSchoolName(e.target.value)}
                placeholder="Maktab to'liq nomi *"
                className="px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
              />
            </div>
          )}
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 min-h-[42px] bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl font-black cursor-pointer disabled:opacity-50"
            >
              {submitting ? 'Tayinlanmoqda...' : 'Sardorni tasdiqlash'}
            </button>
          </div>
        </form>
      )}

      {/* Captains Grid */}
      {filtered.length === 0 ? (
        <div className="p-10 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-center text-xs text-slate-400">
          Tumanda hozircha maktab sardorlari topilmadi.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {filtered.map(cap => (
            <div
              key={cap.uid}
              className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 flex flex-col justify-between gap-3 text-xs"
            >
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="font-black text-sm text-slate-900 dark:text-white truncate">{cap.fullName}</div>
                      <div className="text-[11px] text-slate-500 truncate">{cap.schoolName}</div>
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 rounded-md text-[10px] font-bold shrink-0 ${
                      cap.telegramLinked ? 'bg-sky-500/15 text-sky-400' : 'bg-slate-500/10 text-slate-400'
                    }`}
                  >
                    {cap.telegramLinked ? 'Telegram ✓' : 'Bot ulanmagan'}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/70 dark:border-emerald-500/15 font-mono tabular-nums">
                  <div>
                    <div className="text-[10px] font-sans text-slate-400">O‘quvchilar</div>
                    <div className="font-black text-slate-900 dark:text-white">{cap.studentsCount}</div>
                  </div>
                  <div>
                    <div className="text-[10px] font-sans text-slate-400">EcoCoin</div>
                    <div className="font-black text-emerald-500">{cap.ecoCoins.toLocaleString()}</div>
                  </div>
                </div>

                <div className="text-[11px] text-slate-500 truncate">
                  {cap.phoneNumber || 'Telefon ko‘rsatilmagan'}
                  {cap.telegramUsername ? ` · @${cap.telegramUsername.replace(/^@/, '')}` : ''}
                </div>
              </div>

              {confirmRevokeUid === cap.uid ? (
                <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 space-y-2">
                  <div className="text-[11px] font-bold text-rose-500">
                    Sardorlik vakolatini olib tashlaysizmi?
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      disabled={busyUid === cap.uid}
                      onClick={() => handleRevoke(cap.uid)}
                      className="flex-1 py-1.5 min-h-[36px] rounded-lg bg-rose-500 text-white font-black cursor-pointer disabled:opacity-50"
                    >
                      Ha, olib tashlash
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmRevokeUid(null)}
                      className="px-3 py-1.5 min-h-[36px] rounded-lg bg-slate-200 dark:bg-[#040D0A] font-bold cursor-pointer"
                    >
                      Bekor
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex flex-wrap gap-1.5 pt-2 border-t border-slate-100 dark:border-emerald-500/15">
                  <button
                    type="button"
                    onClick={() => onOpenCaptainChat(cap.uid, cap.district || district)}
                    className="flex-1 py-2 min-h-[38px] rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-bold flex items-center justify-center gap-1 cursor-pointer hover:bg-emerald-500 hover:text-[#04110B] transition-colors"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Suhbat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setReassignCaptain(cap);
                      setReassignSchoolId(cap.schoolId || schools[0]?.id || '');
                    }}
                    className="px-3 py-2 min-h-[38px] rounded-xl bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 font-bold flex items-center gap-1 cursor-pointer hover:border-emerald-400"
                    title="Boshqa maktabga biriktirish"
                  >
                    <RefreshCw className="w-3.5 h-3.5 text-sky-400" />
                    <span>Maktab</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmRevokeUid(cap.uid)}
                    className="px-2.5 py-2 min-h-[38px] rounded-xl bg-rose-500/10 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
                    title="Vakolatni olib tashlash"
                  >
                    <UserMinus className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Reassign Captain Modal */}
      {reassignCaptain && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-3xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/30 p-5 space-y-4 text-xs">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-base font-black">{reassignCaptain.fullName}</h3>
                <p className="text-slate-500">Yangi maktabga biriktirish</p>
              </div>
              <button
                type="button"
                onClick={() => setReassignCaptain(null)}
                className="p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-emerald-500/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleReassign} className="space-y-3">
              <select
                value={reassignSchoolId}
                onChange={e => setReassignSchoolId(e.target.value)}
                className="w-full px-3 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/25 font-bold outline-none"
              >
                {schools.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
              <button
                type="submit"
                disabled={busyUid === reassignCaptain.uid}
                className="w-full py-3 min-h-[44px] bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl font-black cursor-pointer disabled:opacity-50 flex items-center justify-center gap-1.5"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{busyUid === reassignCaptain.uid ? 'Saqlanmoqda...' : 'Biriktirishni saqlash'}</span>
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
