import React, { useState } from 'react';
import { Megaphone, Send, Bell, MessageSquare, CheckCheck, AlertTriangle } from 'lucide-react';
import { DistrictAnnouncementRecord, Notification, School } from '../../../types/eco';
import { useEco } from '../../../context/EcoContext';
import { EcoTelegramChatPanel } from '../../chat/EcoTelegramChatPanel';

interface DistrictAnnouncementsSectionProps {
  district: string;
  schools: School[];
  announcements: DistrictAnnouncementRecord[];
  notifications: Notification[];
  initialChatChannelId?: string;
  onRefresh: () => Promise<void>;
}

export const DistrictAnnouncementsSection: React.FC<DistrictAnnouncementsSectionProps> = ({
  district,
  schools,
  announcements,
  notifications,
  initialChatChannelId,
  onRefresh,
}) => {
  const { sendDistrictAnnouncement, markNotificationRead } = useEco();

  const [view, setView] = useState<'announcements' | 'chat'>(initialChatChannelId ? 'chat' : 'announcements');
  const [title, setTitle] = useState('');
  const [message, setMessage] = useState('');
  const [targetAudience, setTargetAudience] = useState<'all' | 'school_admin' | 'ambassador' | 'student'>('all');
  const [schoolId, setSchoolId] = useState('all');
  const [priority, setPriority] = useState<'normal' | 'urgent'>('normal');
  const [sendTelegram, setSendTelegram] = useState(true);
  const [sending, setSending] = useState(false);

  const unreadCount = notifications.filter(n => !n.read).length;

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !message.trim()) return;
    setSending(true);
    try {
      const res = await sendDistrictAnnouncement({
        title: title.trim(),
        message: message.trim(),
        targetAudience,
        priority,
        schoolId: schoolId !== 'all' ? schoolId : undefined,
        sendTelegram,
      });
      if (res.success) {
        setTitle('');
        setMessage('');
        await onRefresh();
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setView('announcements')}
            className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer ${
              view === 'announcements'
                ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700'
                : 'bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-slate-600 dark:text-slate-300'
            }`}
          >
            <Megaphone className="w-3.5 h-3.5" />
            <span>Tuman E'lonlari & Bildirishnomalar</span>
          </button>
          <button
            type="button"
            onClick={() => setView('chat')}
            className={`px-3.5 py-2 min-h-[40px] rounded-xl text-xs font-black flex items-center gap-1.5 cursor-pointer ${
              view === 'chat'
                ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700'
                : 'bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-slate-600 dark:text-slate-300'
            }`}
          >
            <MessageSquare className="w-3.5 h-3.5" />
            <span>Sardorlar & Viloyat bilan Chat</span>
          </button>
        </div>
      </div>

      {view === 'chat' ? (
        <EcoTelegramChatPanel
          defaultChannelId={initialChatChannelId || undefined}
          title={`${district} · Sardorlar & Koordinatorlar Chati`}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Announcement Composer */}
          <form
            onSubmit={handleSend}
            className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3 text-xs"
          >
            <div className="flex items-center gap-2">
              <Megaphone className="w-4 h-4 text-emerald-400" />
              <h3 className="text-sm font-black">Tuman bo‘ylab rasmiy e'lon yuborish</h3>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Sarlavha *</label>
              <input
                type="text"
                required
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="Masalan: Shanba kuni umumtuman hashar!"
                className="w-full px-3.5 py-2.5 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-400"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Auditoriya</label>
                <select
                  value={targetAudience}
                  onChange={e => setTargetAudience(e.target.value as any)}
                  className="w-full px-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 font-bold outline-none"
                >
                  <option value="all">Barcha a'zolar</option>
                  <option value="school_admin">Maktab sardorlari</option>
                  <option value="ambassador">Eco Elchilar</option>
                  <option value="student">O‘quvchilar</option>
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Maktab</label>
                <select
                  value={schoolId}
                  onChange={e => setSchoolId(e.target.value)}
                  className="w-full px-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 font-bold outline-none"
                >
                  <option value="all">Barcha maktablar</option>
                  {schools.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-500 mb-1">Muhimlik</label>
                <select
                  value={priority}
                  onChange={e => setPriority(e.target.value as any)}
                  className="w-full px-3 py-2 min-h-[42px] rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 font-bold outline-none"
                >
                  <option value="normal">Oddiy e'lon</option>
                  <option value="urgent">Shoshilinch (Muhim)</option>
                </select>
              </div>
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-500 mb-1">Xabar matni *</label>
              <textarea
                rows={4}
                required
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="Batafsil topshiriq, vaqt va manzilni kiriting..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 outline-none focus:border-emerald-400"
              />
            </div>

            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer">
              <input
                type="checkbox"
                checked={sendTelegram}
                onChange={e => setSendTelegram(e.target.checked)}
                className="w-4 h-4 accent-emerald-500 rounded"
              />
              <span>Telegram bot ulangan foydalanuvchilarga ham yuborish</span>
            </label>

            <button
              type="submit"
              disabled={sending}
              className="w-full py-3 min-h-[44px] bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl font-black flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              <span>{sending ? 'Yuborilmoqda...' : "E'lonni yuborish"}</span>
            </button>
          </form>

          {/* Right Column: Sent Announcements + Inbox Notifications */}
          <div className="space-y-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-emerald-400" />
                  <h3 className="text-sm font-black">Sizning bildirishnomalaringiz</h3>
                  {unreadCount > 0 && (
                    <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-500 text-[10px] font-black tabular-nums">
                      {unreadCount}
                    </span>
                  )}
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={() => markNotificationRead('__all__')}
                    className="text-[11px] font-bold text-emerald-500 inline-flex items-center gap-1 cursor-pointer"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Barchasini o‘qish</span>
                  </button>
                )}
              </div>
              {notifications.length === 0 ? (
                <div className="py-5 text-center text-slate-400">Bildirishnomalar yo‘q.</div>
              ) : (
                <div className="space-y-2 max-h-52 overflow-y-auto">
                  {notifications.slice(0, 12).map(n => (
                    <div
                      key={n.id}
                      onClick={() => !n.read && markNotificationRead(n.id)}
                      className={`p-3 rounded-xl border cursor-pointer ${
                        n.read
                          ? 'bg-slate-50 dark:bg-[#040D0A] border-slate-200/70 dark:border-emerald-500/15 opacity-75'
                          : 'bg-emerald-500/10 border-emerald-500/35'
                      }`}
                    >
                      <div className="flex justify-between gap-2 font-bold">
                        <span className="truncate">{n.title}</span>
                        <span className="text-[10px] text-slate-400 shrink-0 tabular-nums">
                          {new Date(n.createdAt).toLocaleDateString('uz-UZ')}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 dark:text-slate-300 mt-0.5">{n.message}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-3 text-xs">
              <h3 className="text-sm font-black">Yuborilgan tuman e'lonlari ({announcements.length})</h3>
              {announcements.length === 0 ? (
                <div className="py-5 text-center text-slate-400">Hali tuman e'lonlari yuborilmagan.</div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto">
                  {announcements.map(ann => (
                    <div
                      key={ann.id}
                      className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200/70 dark:border-emerald-500/15 space-y-1"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-black flex items-center gap-1.5">
                          {ann.priority === 'urgent' && <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />}
                          <span>{ann.title}</span>
                        </div>
                        <span className="text-[10px] text-slate-400 tabular-nums">
                          {new Date(ann.createdAt).toLocaleDateString('uz-UZ')}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">{ann.message}</p>
                      <div className="text-[10px] text-emerald-500 font-bold tabular-nums">
                        {ann.schoolName || 'Barcha maktablar'} · {ann.recipientsCount} ta qabul qiluvchi
                        {ann.telegramDeliveredCount ? ` · Telegram: ${ann.telegramDeliveredCount}` : ''}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
