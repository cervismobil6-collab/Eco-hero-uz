import React, { useMemo, useState } from 'react';
import { Settings, Lock, History, Search, CheckCircle2, User, Sun, Moon } from 'lucide-react';
import { AuditLog, DistrictSectionId } from '../../../types/eco';
import { useEco } from '../../../context/EcoContext';

interface DistrictSettingsSectionProps {
  auditLogs: AuditLog[];
  onNavigate: (section: DistrictSectionId) => void;
}

export const DistrictSettingsSection: React.FC<DistrictSettingsSectionProps> = ({
  auditLogs,
  onNavigate,
}) => {
  const { user, theme, toggleTheme, updateUserProfile, apiFetch, showNotification } = useEco();

  const [fullName, setFullName] = useState(user.fullName || '');
  const [phoneNumber, setPhoneNumber] = useState(user.phoneNumber || '');
  const [telegramUsername, setTelegramUsername] = useState(user.telegramUsername || '');
  const [savingProfile, setSavingProfile] = useState(false);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [savingPass, setSavingPass] = useState(false);

  const [logSearch, setLogSearch] = useState('');
  const [logActionFilter, setLogActionFilter] = useState('all');

  const uniqueActions = useMemo(
    () => Array.from(new Set(auditLogs.map(l => l.action).filter(Boolean))).slice(0, 20),
    [auditLogs]
  );

  const filteredLogs = useMemo(() => {
    const q = logSearch.trim().toLowerCase();
    return auditLogs.filter(l => {
      if (logActionFilter !== 'all' && l.action !== logActionFilter) return false;
      if (!q) return true;
      return `${l.action} ${l.actorName} ${l.targetCollection} ${JSON.stringify(l.details || {})}`
        .toLowerCase()
        .includes(q);
    });
  }, [auditLogs, logSearch, logActionFilter]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;
    setSavingProfile(true);
    try {
      await updateUserProfile({
        fullName: fullName.trim(),
        phoneNumber: phoneNumber.trim(),
        telegramUsername: telegramUsername.trim(),
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 6) {
      showNotification("Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak", 'warning');
      return;
    }
    setSavingPass(true);
    try {
      const res = await apiFetch('/api/user/change-password', {
        method: 'POST',
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification(data.error || "Parol o'zgartirilmadi", 'warning');
        return;
      }
      setCurrentPassword('');
      setNewPassword('');
      showNotification('Parolingiz muvaffaqiyatli yangilandi!', 'success');
    } catch {
      showNotification("Server bilan bog'lanishda xatolik", 'warning');
    } finally {
      setSavingPass(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 text-xs">
        {/* Profile Form */}
        <form
          onSubmit={handleSaveProfile}
          className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3"
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-black">Koordinator profili</h3>
            </div>
            <button
              type="button"
              onClick={toggleTheme}
              className="px-3 py-1.5 min-h-[34px] rounded-xl bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 flex items-center gap-1.5 font-bold cursor-pointer"
            >
              {theme === 'dark' ? <Sun className="w-3.5 h-3.5 text-amber-400" /> : <Moon className="w-3.5 h-3.5 text-slate-600" />}
              <span>{theme === 'dark' ? 'Yorug‘ rejim' : 'Tungi rejim'}</span>
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 p-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/70 dark:border-emerald-500/15">
            <div>
              <div className="text-[10px] text-slate-400">Viloyat</div>
              <div className="font-bold">{user.region}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400">Tuman</div>
              <div className="font-bold text-emerald-500">{user.district}</div>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 mb-1">To‘liq ism</label>
            <input
              type="text"
              required
              value={fullName}
              onChange={e => setFullName(e.target.value)}
              className="w-full px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-400"
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Telefon</label>
              <input
                type="text"
                value={phoneNumber}
                onChange={e => setPhoneNumber(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Telegram @username</label>
              <input
                type="text"
                value={telegramUsername}
                onChange={e => setTelegramUsername(e.target.value)}
                className="w-full px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={savingProfile}
            className="w-full py-2.5 min-h-[42px] bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl font-black flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>{savingProfile ? 'Saqlanmoqda...' : 'Profilni saqlash'}</span>
          </button>
        </form>

        {/* Password + Quick Config */}
        <div className="space-y-4">
          <form
            onSubmit={handleChangePassword}
            className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3"
          >
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400" />
              <h3 className="text-sm font-black">Xavfsizlik va parol</h3>
            </div>
            <input
              type="password"
              value={currentPassword}
              onChange={e => setCurrentPassword(e.target.value)}
              placeholder="Joriy parol (agar o'rnatilgan bo'lsa)"
              className="w-full px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
            />
            <input
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={e => setNewPassword(e.target.value)}
              placeholder="Yangi parol (kamida 6 belgi)"
              className="w-full px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-400"
            />
            <button
              type="submit"
              disabled={savingPass}
              className="w-full py-2.5 min-h-[42px] rounded-xl bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/25 font-black hover:border-emerald-400 cursor-pointer disabled:opacity-50"
            >
              {savingPass ? 'Yangilanmoqda...' : 'Parolni yangilash'}
            </button>
          </form>

          <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 flex items-center justify-between gap-3">
            <div>
              <div className="font-black text-sm flex items-center gap-1.5">
                <Settings className="w-4 h-4 text-emerald-400" />
                <span>Oylik reyting chegarasi va sovrinlar</span>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                O‘quvchilar reytingi chegarasi va sovg‘a nomlarini sozlash
              </p>
            </div>
            <button
              type="button"
              onClick={() => onNavigate('district_ratings')}
              className="px-3.5 py-2 min-h-[38px] rounded-xl bg-emerald-500/15 text-emerald-500 font-black shrink-0 cursor-pointer"
            >
              Sozlash →
            </button>
          </div>
        </div>
      </div>

      {/* District-Scoped Audit Log */}
      <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3 text-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-black">Tuman boshqaruv audit tarixi ({filteredLogs.length})</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={logSearch}
                onChange={e => setLogSearch(e.target.value)}
                placeholder="Audit qidiruv..."
                className="pl-8 pr-3 py-1.5 min-h-[38px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none"
              />
            </div>
            <select
              value={logActionFilter}
              onChange={e => setLogActionFilter(e.target.value)}
              className="px-3 py-1.5 min-h-[38px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 font-bold outline-none"
            >
              <option value="all">Harakat: Barchasi</option>
              {uniqueActions.map(act => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>
        </div>

        {filteredLogs.length === 0 ? (
          <div className="py-6 text-center text-slate-400">Audit yozuvlari topilmadi.</div>
        ) : (
          <div className="overflow-x-auto max-h-80 overflow-y-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 dark:bg-[#040D0A] text-[10px] font-black uppercase text-slate-400">
                <tr>
                  <th className="px-3 py-2.5">Vaqt</th>
                  <th className="px-3 py-2.5">Ijrochi</th>
                  <th className="px-3 py-2.5">Harakat</th>
                  <th className="px-3 py-2.5">Tafsilotlar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-emerald-500/15">
                {filteredLogs.slice(0, 60).map((log, i) => (
                  <tr key={log.id || i}>
                    <td className="px-3 py-2.5 font-mono text-slate-400 whitespace-nowrap tabular-nums">
                      {new Date(log.timestamp).toLocaleString('uz-UZ')}
                    </td>
                    <td className="px-3 py-2.5 font-bold whitespace-nowrap">{log.actorName}</td>
                    <td className="px-3 py-2.5">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 text-[10px] font-black">
                        {log.action}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 font-mono text-[11px] text-slate-500 max-w-sm truncate">
                      {JSON.stringify(log.details || {})}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
