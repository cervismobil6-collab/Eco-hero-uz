import React, { useMemo, useState } from 'react';
import {
  Megaphone,
  Send,
  Bell,
  Pin,
  CheckCircle2,
  AlertTriangle,
  Users,
  Globe,
  MessageSquare,
} from 'lucide-react';
import {
  Notification,
  RegionalAnnouncementRecord,
  RegionalDistrictSummary,
} from '../../../types/eco';
import { EcoTelegramChatPanel } from '../../chat/EcoTelegramChatPanel';
import { slugifyRegionalKey } from './regionalTypes';

interface RegionalAnnouncementsSectionProps {
  region: string;
  districts: RegionalDistrictSummary[];
  announcements: RegionalAnnouncementRecord[];
  notifications: Notification[];
  onSendAnnouncement: (payload: {
    title: string;
    message: string;
    targetMode: 'all_districts' | 'selected_districts';
    targetDistricts?: string[];
    targetAudience: 'all' | 'district_coordinator' | 'school_admin' | 'ambassador' | 'student';
    priority?: 'normal' | 'urgent';
    pinToHome?: boolean;
    sendTelegram?: boolean;
    region?: string;
  }) => Promise<{ success: boolean; announcement?: RegionalAnnouncementRecord; error?: string }>;
  onMarkNotificationRead: (id: string) => void;
}

export const RegionalAnnouncementsSection: React.FC<RegionalAnnouncementsSectionProps> = ({
  region,
  districts,
  announcements,
  notifications,
  onSendAnnouncement,
  onMarkNotificationRead,
}) => {
  const [subTab, setSubTab] = useState<'compose' | 'inbox' | 'chat'>('compose');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetMode, setTargetMode] = useState<'all_districts' | 'selected_districts'>('all_districts');
  const [selectedDistricts, setSelectedDistricts] = useState<string[]>([]);
  const [targetAudience, setTargetAudience] = useState<
    'all' | 'district_coordinator' | 'school_admin' | 'ambassador' | 'student'
  >('all');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [pinToHome, setPinToHome] = useState(true);
  const [sendTelegram, setSendTelegram] = useState(true);
  const [sending, setSending] = useState(false);

  const districtNames = useMemo(() => districts.map(d => d.district), [districts]);
  const unreadCount = notifications.filter(n => !n.read).length;

  const toggleDistrict = (dist: string) => {
    setSelectedDistricts(prev =>
      prev.includes(dist) ? prev.filter(d => d !== dist) : [...prev, dist]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim() || sending) return;
    if (targetMode === 'selected_districts' && selectedDistricts.length === 0) return;
    setSending(true);
    try {
      const res = await onSendAnnouncement({
        title: title.trim(),
        message: message.trim(),
        targetMode,
        targetDistricts: targetMode === 'selected_districts' ? selectedDistricts : undefined,
        targetAudience,
        priority,
        pinToHome,
        sendTelegram,
        region,
      });
      if (res.success) {
        setTitle('');
        setMessage('');
        setSelectedDistricts([]);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'compose' as const, label: "E'lon Yuborish & Bosh Sahifa", icon: Megaphone, badge: 0 },
          { id: 'inbox' as const, label: 'Viloyat Bildirishnomalari', icon: Bell, badge: unreadCount },
          { id: 'chat' as const, label: 'Koordinatorlar Guruh Chati', icon: MessageSquare, badge: 0 },
        ].map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id)}
            className={`px-4 py-2.5 min-h-[44px] rounded-xl text-xs font-extrabold inline-flex items-center gap-2 transition-all cursor-pointer ${
              subTab === t.id
                ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700'
                : 'bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-slate-600 dark:text-emerald-100/75'
            }`}
          >
            <t.icon className="w-4 h-4 shrink-0" />
            <span>{t.label}</span>
            {t.badge > 0 && (
              <span className="px-1.5 py-0.5 rounded-md bg-rose-500 text-white text-[10px] font-black tabular-nums">
                {t.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {subTab === 'compose' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Compose Form */}
          <form
            onSubmit={handleSubmit}
            className="lg:col-span-7 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-4"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Megaphone className="w-5 h-5 text-emerald-500" />
                <h3 className="text-base font-black">Viloyat E&apos;lonini Yaratish</h3>
              </div>
              <span className="text-[11px] font-semibold text-slate-400">{region}</span>
            </div>

            {/* Target Mode */}
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => setTargetMode('all_districts')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer min-h-[54px] ${
                  targetMode === 'all_districts'
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-[#00F5A0]'
                    : 'bg-slate-50 dark:bg-[#040D0A] border-slate-200 dark:border-emerald-500/15 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-black">
                  <Globe className="w-4 h-4" />
                  <span>Barcha tumanlarga</span>
                </div>
                <div className="text-[11px] opacity-75">Butun {region} bo‘ylab</div>
              </button>
              <button
                type="button"
                onClick={() => setTargetMode('selected_districts')}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer min-h-[54px] ${
                  targetMode === 'selected_districts'
                    ? 'bg-emerald-500/15 border-emerald-500 text-emerald-700 dark:text-[#00F5A0]'
                    : 'bg-slate-50 dark:bg-[#040D0A] border-slate-200 dark:border-emerald-500/15 text-slate-500'
                }`}
              >
                <div className="flex items-center gap-1.5 text-xs font-black">
                  <Users className="w-4 h-4" />
                  <span>Alohida tumanlarga</span>
                </div>
                <div className="text-[11px] opacity-75">Tanlangan tumanlar ({selectedDistricts.length})</div>
              </button>
            </div>

            {targetMode === 'selected_districts' && (
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500">
                  <span>Tumanlarni tanlang:</span>
                  <button
                    type="button"
                    onClick={() =>
                      setSelectedDistricts(
                        selectedDistricts.length === districtNames.length ? [] : districtNames
                      )
                    }
                    className="text-emerald-500 cursor-pointer"
                  >
                    {selectedDistricts.length === districtNames.length ? 'Barchasini bekor' : 'Barchasini tanlash'}
                  </button>
                </div>
                <div className="flex flex-wrap gap-1.5 max-h-40 overflow-y-auto">
                  {districtNames.map(dist => {
                    const active = selectedDistricts.includes(dist);
                    return (
                      <button
                        key={dist}
                        type="button"
                        onClick={() => toggleDistrict(dist)}
                        className={`px-2.5 py-1.5 min-h-[34px] rounded-lg text-[11px] font-bold border transition-all cursor-pointer ${
                          active
                            ? 'bg-emerald-500 text-[#04110B] border-emerald-600'
                            : 'bg-white dark:bg-[#061812] border-slate-200 dark:border-emerald-500/20 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {dist}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Kimga yuborilsin</label>
                <select
                  value={targetAudience}
                  onChange={e => setTargetAudience(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none"
                >
                  <option value="all">Barcha foydalanuvchilarga</option>
                  <option value="district_coordinator">Faqat tuman koordinatorlariga</option>
                  <option value="school_admin">Maktab sardorlariga</option>
                  <option value="ambassador">Eco Elchilarga</option>
                  <option value="student">O‘quvchilarga</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Muhimlik darajasi</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value as any)}
                  className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none"
                >
                  <option value="normal">Oddiy xabar</option>
                  <option value="urgent">Shoshilinch / Muhim</option>
                </select>
              </div>
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">E&apos;lon sarlavhasi</label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Masalan: Shanba kuni umumviloyat ko‘chat ekish aksiyasi"
                className="w-full px-3.5 py-2.5 min-h-[44px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none focus:border-emerald-400"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Xabar matni</label>
              <textarea
                rows={4}
                required
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Barcha tafsilotlar, vaqt va topshiriqlarni kiriting..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-medium outline-none focus:border-emerald-400 resize-none"
              />
            </div>

            <div className="space-y-2 pt-1">
              <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={pinToHome}
                  onChange={e => setPinToHome(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
                <span>Bosh sahifada muhim e&apos;lon sifatida chiqarish</span>
              </label>
              <label className="flex items-center gap-2.5 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendTelegram}
                  onChange={e => setSendTelegram(e.target.checked)}
                  className="w-4 h-4 accent-emerald-500 rounded"
                />
                <span>Telegram bot orqali koordinatorlarga tezkor yuborish</span>
              </label>
            </div>

            <button
              type="submit"
              disabled={sending || (targetMode === 'selected_districts' && selectedDistricts.length === 0)}
              className="w-full py-3 min-h-[44px] rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 text-xs font-black inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{sending ? 'Yuborilmoqda...' : "E'lonni Nashr Qilish"}</span>
            </button>
          </form>

          {/* Sent Announcements History */}
          <div className="lg:col-span-5 p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-black">Yuborilgan Viloyat E&apos;lonlari</h3>
              <span className="text-xs font-mono tabular-nums text-slate-400">{announcements.length} ta</span>
            </div>

            <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
              {announcements.map(ann => (
                <div
                  key={ann.id}
                  className="p-3.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/15 space-y-1.5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-black text-xs text-slate-900 dark:text-white flex items-center gap-1.5">
                      {ann.priority === 'urgent' && <AlertTriangle className="w-3.5 h-3.5 text-rose-500 shrink-0" />}
                      <span>{ann.title}</span>
                    </div>
                    {ann.pinToHome && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-500 shrink-0">
                        <Pin className="w-3 h-3" /> Bosh sahifa
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-3">{ann.message}</p>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] text-slate-400 pt-1">
                    <span>
                      {ann.targetMode === 'all_districts'
                        ? 'Barcha tumanlar'
                        : `${ann.targetDistricts?.length || 0} ta tuman`}
                    </span>
                    <span className="font-mono tabular-nums">
                      {ann.recipientsCount} qabul qiluvchi · {new Date(ann.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
              {announcements.length === 0 && (
                <div className="py-12 text-center text-xs text-slate-400">
                  Hozircha viloyat e&apos;lonlari yuborilmagan.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {subTab === 'inbox' && (
        <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black">Bildirishnomalar Markazi</h3>
            <span className="text-xs text-slate-400 tabular-nums">O‘qilmagan: {unreadCount}</span>
          </div>
          <div className="space-y-2">
            {notifications.map(n => (
              <div
                key={n.id}
                className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
                  n.read
                    ? 'bg-slate-50 dark:bg-[#040D0A] border-slate-200 dark:border-emerald-500/15 opacity-75'
                    : 'bg-emerald-500/5 border-emerald-500/35'
                }`}
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="text-xs font-black text-slate-900 dark:text-white">{n.title}</div>
                  <div className="text-xs text-slate-600 dark:text-slate-300">{n.message}</div>
                  <div className="text-[10px] text-slate-400 font-mono">
                    {new Date(n.createdAt).toLocaleString()}
                  </div>
                </div>
                {!n.read && (
                  <button
                    type="button"
                    onClick={() => onMarkNotificationRead(n.id)}
                    className="px-3 py-1.5 min-h-[36px] rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-[#00F5A0] text-[11px] font-bold inline-flex items-center gap-1 shrink-0 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>O‘qildi</span>
                  </button>
                )}
              </div>
            ))}
            {notifications.length === 0 && (
              <div className="py-10 text-center text-xs text-slate-400">Bildirishnomalar yo‘q</div>
            )}
          </div>
        </div>
      )}

      {subTab === 'chat' && (
        <EcoTelegramChatPanel
          defaultChannelId={`reg_group:${slugifyRegionalKey(region || 'toshkent_shahri')}`}
          title={`${region} — Viloyat va Tuman Koordinatorlari Aloqasi`}
        />
      )}
    </div>
  );
};
