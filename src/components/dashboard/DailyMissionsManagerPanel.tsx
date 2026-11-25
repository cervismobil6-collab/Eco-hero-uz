import React, { useState } from 'react';
import { CheckCircle2, Plus, Sparkles, Trash2, XCircle } from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import { resolveMediaUrl } from '../../utils/api';

export const DailyMissionsManagerPanel: React.FC = () => {
  const {
    dailyMissions,
    dailyMissionSubmissions,
    createDailyMission,
    deleteDailyMission,
    clearDailyMissions,
    reviewDailyMissionSubmission,
    showNotification,
  } = useEco();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [rewardCoins, setRewardCoins] = useState('50');
  const [saving, setSaving] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reviewingId, setReviewingId] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      showNotification('Kunlik missiya nomini kiriting', 'warning');
      return;
    }
    setSaving(true);
    try {
      const res = await createDailyMission({
        title: title.trim(),
        description:
          description.trim() ||
          "Vazifani bajaring va tasdiqlovchi rasm yuklang. Maktab Sardori tasdiqlagach EcoCoin beriladi.",
        rewardCoins: Math.max(5, Number(rewardCoins) || 50),
      });
      if (res.success) {
        setTitle('');
        setDescription('');
        setRewardCoins('50');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteDailyMission(id);
    } finally {
      setDeletingId(null);
    }
  };

  const handleClearAll = async () => {
    setClearing(true);
    try {
      await clearDailyMissions();
    } finally {
      setClearing(false);
    }
  };

  const pendingSubmissions = dailyMissionSubmissions.filter(s => s.status === 'pending');

  return (
    <div className="space-y-6">
      {/* Header & Create Form */}
      <div className="p-6 md:p-8 rounded-3xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-emerald-500" />
              <span>Bugungi Missiyalar Boshqaruvi (Super Admin)</span>
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              Bu yerda qo‘shilgan vazifalar O‘quvchi Kabinetida «Bugungi missiyalar» bo‘limida ko‘rinadi va o‘quvchilarning Telegram chatiga xabar sifatida boradi.
            </p>
          </div>
          {dailyMissions.length > 0 && (
            <button
              type="button"
              disabled={clearing}
              onClick={handleClearAll}
              className="px-4 py-2.5 rounded-xl bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-500 text-xs font-extrabold inline-flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" />
              <span>{clearing ? 'Tozalanmoqda...' : 'Avvalgilarini hammasini o‘chirish'}</span>
            </button>
          )}
        </div>

        <form onSubmit={handleCreate} className="grid grid-cols-1 md:grid-cols-12 gap-3 pt-2 border-t border-slate-100 dark:border-slate-800">
          <div className="md:col-span-5 space-y-1">
            <label className="text-[11px] font-bold text-slate-500">Missiya sarlavhasi</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Masalan: Maktab hovlisiga 3 ta gul ekish"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold outline-none focus:border-emerald-500"
            />
          </div>

          <div className="md:col-span-5 space-y-1">
            <label className="text-[11px] font-bold text-slate-500">Vazifa tavsifi</label>
            <input
              type="text"
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Qisqacha ko'rsatma..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold outline-none focus:border-emerald-500"
            />
          </div>

          <div className="md:col-span-2 space-y-1">
            <label className="text-[11px] font-bold text-slate-500">Mukofot (EcoCoin)</label>
            <input
              type="number"
              min={5}
              max={5000}
              value={rewardCoins}
              onChange={e => setRewardCoins(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold outline-none focus:border-emerald-500"
            />
          </div>

          <div className="md:col-span-12 flex justify-end pt-1">
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-extrabold inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <Plus className="w-4 h-4" />
              <span>{saving ? 'Qo‘shilmoqda...' : 'Yangi Missiya Qo‘shish & Chatga Yuborish'}</span>
            </button>
          </div>
        </form>
      </div>

      {/* Active Daily Missions List */}
      <div className="p-6 rounded-3xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-black uppercase tracking-wider">
            Joriy Faol Kunlik Missiyalar ({dailyMissions.length} ta)
          </h3>
        </div>

        {dailyMissions.length === 0 ? (
          <div className="py-8 text-center text-xs text-slate-500 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl">
            Hozircha kunlik missiyalar yo‘q. Yuqoridagi forma orqali bugungi 3 ta missiyani qo‘shing.
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {dailyMissions.map(m => (
              <div key={m.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-extrabold text-slate-900 dark:text-white">{m.title}</span>
                    <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 text-amber-500 font-mono text-[11px] font-bold">
                      +{m.rewardCoins} ECO
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 dark:text-slate-400">{m.description}</p>
                </div>

                <button
                  type="button"
                  disabled={deletingId === m.id}
                  onClick={() => handleDelete(m.id)}
                  className="px-3.5 py-2 rounded-xl bg-rose-500/10 hover:bg-rose-500 hover:text-white text-rose-500 text-xs font-bold inline-flex items-center gap-1.5 shrink-0 self-start sm:self-center cursor-pointer transition-colors disabled:opacity-50"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{deletingId === m.id ? 'O‘chirilmoqda...' : 'O‘chirish'}</span>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pending Submissions Across All Schools (Super Admin Oversight) */}
      {pendingSubmissions.length > 0 && (
        <div className="p-6 rounded-3xl bg-white dark:bg-[#0f172a] border border-emerald-500/30 space-y-4">
          <h3 className="text-sm font-black uppercase tracking-wider text-emerald-500">
            Tekshiruv Kutilayotgan O‘quvchi Rasmlari ({pendingSubmissions.length})
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pendingSubmissions.map(sub => (
              <div
                key={sub.id}
                className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-3"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-xs font-extrabold">{sub.userName}</div>
                    <div className="text-[11px] text-slate-500">{sub.schoolName} · {sub.missionTitle}</div>
                  </div>
                  <span className="font-mono text-xs font-bold text-amber-500">+{sub.awardedCoins} ECO</span>
                </div>
                <img
                  src={resolveMediaUrl(sub.photoUrl)}
                  alt={sub.missionTitle}
                  className="w-full aspect-video object-cover rounded-xl"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={reviewingId === sub.id}
                    onClick={async () => {
                      setReviewingId(sub.id);
                      try {
                        await reviewDailyMissionSubmission(sub.id, 'approve');
                      } finally {
                        setReviewingId(null);
                      }
                    }}
                    className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold inline-flex items-center justify-center gap-1 cursor-pointer"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Tasdiqlash</span>
                  </button>
                  <button
                    type="button"
                    disabled={reviewingId === sub.id}
                    onClick={async () => {
                      setReviewingId(sub.id);
                      try {
                        await reviewDailyMissionSubmission(sub.id, 'reject');
                      } finally {
                        setReviewingId(null);
                      }
                    }}
                    className="px-3 py-2 rounded-xl bg-rose-500/15 text-rose-500 text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Rad etish</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
