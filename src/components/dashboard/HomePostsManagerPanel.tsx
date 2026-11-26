import React, { useEffect, useState } from 'react';
import {
  Megaphone,
  Plus,
  Pin,
  Trash2,
  Edit3,
  Pause,
  Play,
  ExternalLink,
  Upload,
  Check,
  X,
  Send,
} from 'lucide-react';
import { useEco } from '../../context/EcoContext';
import { HomePost, HomePostCategory } from '../../types/eco';
import {
  ECOHERO_NEWS_CHANNEL_URL,
  ECOHERO_NEWS_CHANNEL_USERNAME,
  isGenericEcoHerouzChannelUrl,
  resolveNewsTelegramPostUrl,
  validateEcoHerouzPostInput,
} from '../../utils/telegramNews';

const CATEGORY_LABELS: Record<HomePostCategory, string> = {
  bot_news: 'Bot yangiligi',
  channel_ad: 'Telegram kanal reklamasi',
  website: 'Sayt / Foydali havola',
  school_event: 'Maktab tadbiri',
  news: 'Eko-yangilik',
};

export const HomePostsManagerPanel: React.FC = () => {
  const {
    user,
    apiFetch,
    homePosts,
    createHomePost,
    updateHomePost,
    deleteHomePost,
    uploadMediaFile,
    showNotification,
  } = useEco();

  const isSuperAdmin = user.role === 'super_admin';
  const [managedPosts, setManagedPosts] = useState<HomePost[]>(homePosts);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<HomePostCategory>('bot_news');
  const [ctaText, setCtaText] = useState('');
  const [ctaUrl, setCtaUrl] = useState('');
  const [telegramPostInput, setTelegramPostInput] = useState('');
  const [imageUrl, setImageUrl] = useState('/assets/schools/eco_courtyard.jpg');
  const [isPinned, setIsPinned] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCtaText, setEditCtaText] = useState('');
  const [editCtaUrl, setEditCtaUrl] = useState('');
  const [editTelegramPostInput, setEditTelegramPostInput] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');

  const refreshManaged = async () => {
    if (!isSuperAdmin) return;
    try {
      const res = await apiFetch('/api/home-posts?scope=manage');
      const data = await res.json();
      if (res.ok && data.success && Array.isArray(data.posts)) {
        setManagedPosts(data.posts);
      }
    } catch {
      setManagedPosts(homePosts);
    }
  };

  useEffect(() => {
    if (isSuperAdmin) {
      refreshManaged();
    }
  }, [homePosts.length, isSuperAdmin]);

  if (!isSuperAdmin) {
    return null;
  }

  const handleImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    mode: 'create' | 'edit' = 'create'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIsUploading(true);
    try {
      const uploaded = await uploadMediaFile(file, file.name);
      if (uploaded.success && uploaded.url) {
        if (mode === 'edit') setEditImageUrl(uploaded.url);
        else setImageUrl(uploaded.url);
        showNotification('Post rasmi yuklandi', 'success');
      } else {
        showNotification(uploaded.error || 'Rasm yuklanmadi', 'warning');
      }
    } finally {
      setIsUploading(false);
      e.target.value = '';
    }
  };

  const createTgPreview = validateEcoHerouzPostInput(telegramPostInput);
  const editTgPreview = validateEcoHerouzPostInput(editTelegramPostInput);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !content.trim()) {
      showNotification('Post sarlavhasi va matnini kiriting', 'warning');
      return;
    }
    if (!createTgPreview.valid) {
      showNotification(createTgPreview.error || 'Telegram post havolasi noto‘g‘ri', 'warning');
      return;
    }
    if (isGenericEcoHerouzChannelUrl(ctaUrl)) {
      showNotification(
        `Umumiy kanal havolasi emas, aniq post ID yoki ${ECOHERO_NEWS_CHANNEL_URL}/POST_ID kiriting`,
        'warning'
      );
      return;
    }
    setIsSaving(true);
    const res = await createHomePost({
      title: title.trim(),
      content: content.trim(),
      category,
      imageUrl: imageUrl.trim() || '/assets/schools/eco_courtyard.jpg',
      ctaText: ctaText.trim() || undefined,
      ctaUrl: ctaUrl.trim() || undefined,
      telegramPostId: createTgPreview.normalized?.postId || '',
      telegramPostUrl: createTgPreview.normalized?.postUrl || '',
      telegramPostInput: telegramPostInput.trim(),
      isPinned,
    });
    setIsSaving(false);
    if (res.success) {
      setTitle('');
      setContent('');
      setCtaText('');
      setCtaUrl('');
      setTelegramPostInput('');
      setIsPinned(false);
      await refreshManaged();
    }
  };

  const startEdit = (post: HomePost) => {
    setEditingId(post.id);
    setEditTitle(post.title);
    setEditContent(post.content);
    setEditCtaText(post.ctaText || '');
    setEditCtaUrl(post.ctaUrl || '');
    setEditTelegramPostInput(post.telegramPostUrl || post.telegramPostId || '');
    setEditImageUrl(post.imageUrl || '');
  };

  const handleSaveEdit = async (id: string) => {
    if (!editTitle.trim() || !editContent.trim()) return;
    if (!editTgPreview.valid) {
      showNotification(editTgPreview.error || 'Telegram post havolasi noto‘g‘ri', 'warning');
      return;
    }
    if (isGenericEcoHerouzChannelUrl(editCtaUrl)) {
      showNotification(
        `Umumiy kanal havolasi emas, aniq post ID yoki ${ECOHERO_NEWS_CHANNEL_URL}/POST_ID kiriting`,
        'warning'
      );
      return;
    }
    const res = await updateHomePost(id, {
      title: editTitle.trim(),
      content: editContent.trim(),
      ctaText: editCtaText.trim(),
      ctaUrl: editCtaUrl.trim(),
      telegramPostId: editTgPreview.normalized?.postId || '',
      telegramPostUrl: editTgPreview.normalized?.postUrl || '',
      telegramPostInput: editTelegramPostInput.trim(),
      imageUrl: editImageUrl.trim() || undefined,
    });
    if (res.success) {
      setEditingId(null);
      await refreshManaged();
    }
  };

  return (
    <div className="p-4 sm:p-5 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
        <div>
          <h3 className="text-base font-black text-slate-900 dark:text-white flex items-center gap-2">
            <Megaphone className="w-4 h-4 text-emerald-500" />
            <span>Asosiy Sahifa Postlari Boshqaruvi</span>
          </h3>
          <p className="text-xs text-slate-500 dark:text-emerald-200/70">
            Botdagi yangiliklar, sayt havolalari, Telegram kanal reklamalari va maktab e’lonlarini bosh sahifaga joylashtiring va tahrirlang.
          </p>
        </div>
        <span className="text-xs font-mono tabular-nums text-emerald-600 dark:text-emerald-400 font-bold shrink-0">
          {managedPosts.length} ta post
        </span>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* Create Post Form */}
        <form onSubmit={handleSubmit} className="lg:col-span-5 space-y-3 p-4 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20">
          <div className="text-xs font-bold uppercase tracking-wider text-slate-700 dark:text-emerald-300 flex items-center gap-1.5">
            <Plus className="w-3.5 h-3.5 text-emerald-500" />
            <span>Yangi post qo‘shish</span>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Post turi</label>
            <select
              value={category}
              onChange={e => setCategory(e.target.value as HomePostCategory)}
              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
            >
              <option value="bot_news">Bot yangiligi</option>
              <option value="channel_ad">Telegram kanal reklamasi</option>
              <option value="website">Sayt / Foydali havola</option>
              <option value="school_event">Maktab tadbiri</option>
              <option value="news">Eko-yangilik</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Sarlavha</label>
            <input
              type="text"
              required
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="Masalan: @Ecoheros_bot yangi eko-tanlovi!"
              className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Post matni</label>
            <textarea
              rows={3}
              required
              value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Batafsil ma'lumot, e'lon yoki hamkor kanal haqida yozing..."
              className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs text-slate-900 dark:text-white resize-none outline-none focus:border-emerald-500"
            />
          </div>

          <div className="space-y-1.5 p-3 rounded-xl bg-white dark:bg-[#061812] border border-emerald-500/20">
            <label className="flex items-center justify-between gap-2 text-[11px] font-semibold text-slate-700 dark:text-emerald-300">
              <span className="flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-emerald-500" />
                <span>Telegram post ID yoki havolasi ({ECOHERO_NEWS_CHANNEL_USERNAME})</span>
              </span>
              <span className="text-[10px] font-mono text-slate-400">ixtiyoriy</span>
            </label>
            <input
              type="text"
              value={telegramPostInput}
              onChange={e => setTelegramPostInput(e.target.value)}
              placeholder={`Masalan: 125 yoki ${ECOHERO_NEWS_CHANNEL_URL}/125`}
              className="w-full min-h-[38px] px-3 py-1.5 rounded-lg bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-emerald-500"
            />
            {telegramPostInput.trim() ? (
              createTgPreview.valid && createTgPreview.normalized ? (
                <p className="text-[11px] text-emerald-600 dark:text-emerald-400 font-mono truncate">
                  «Batafsil o‘qish» → {createTgPreview.normalized.postUrl}
                </p>
              ) : (
                <p className="text-[11px] text-rose-500 font-medium">{createTgPreview.error}</p>
              )
            ) : (
              <p className="text-[10px] text-slate-400">
                Bo‘sh qoldirilsa, yangilikda «Batafsil o‘qish» tugmasi chiqmaydi.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Tugma matni (ixtiyoriy)</label>
              <input
                type="text"
                value={ctaText}
                onChange={e => setCtaText(e.target.value)}
                placeholder="Batafsil o‘qish"
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs text-slate-900 dark:text-white outline-none focus:border-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400 mb-1">Qo‘shimcha havola (ixtiyoriy)</label>
              <input
                type="text"
                value={ctaUrl}
                onChange={e => setCtaUrl(e.target.value)}
                placeholder="https://..."
                className="w-full min-h-[40px] px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-emerald-500"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-[11px] font-semibold text-slate-600 dark:text-slate-400">Rasm manzili yoki yuklash</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={imageUrl}
                onChange={e => setImageUrl(e.target.value)}
                placeholder="/assets/schools/eco_courtyard.jpg"
                className="flex-1 min-w-0 min-h-[40px] px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-mono text-slate-900 dark:text-white outline-none focus:border-emerald-500"
              />
              <label className="min-h-[40px] px-3 py-2 rounded-xl border border-slate-300 dark:border-emerald-500/25 bg-white dark:bg-[#061812] text-xs font-semibold flex items-center gap-1.5 cursor-pointer shrink-0 hover:border-emerald-500/50">
                <Upload className="w-3.5 h-3.5 text-emerald-500" />
                <span>{isUploading ? '...' : 'Yuklash'}</span>
                <input type="file" accept="image/*" onChange={e => handleImageUpload(e, 'create')} className="hidden" />
              </label>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300 cursor-pointer pt-1">
            <input
              type="checkbox"
              checked={isPinned}
              onChange={e => setIsPinned(e.target.checked)}
              className="rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
            />
            <span>Asosiy sahifada eng yuqorida (qadab) ko‘rsatish</span>
          </label>

          <button
            type="submit"
            disabled={isSaving}
            className="w-full min-h-[44px] py-2.5 rounded-xl bg-gradient-to-r from-[#00F5A0] to-[#10B981] hover:brightness-105 disabled:opacity-50 text-[#04110B] text-xs font-black border-b-[3px] border-emerald-700 active:translate-y-[1px] cursor-pointer transition-all"
          >
            {isSaving ? 'Joylashtirilmoqda...' : 'Asosiy sahifaga chiqarish'}
          </button>
        </form>

        {/* Managed Posts List */}
        <div className="lg:col-span-7 divide-y divide-slate-100 dark:divide-emerald-500/15 max-h-[520px] overflow-y-auto pr-1">
          {managedPosts.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500">
              Hozircha siz boshqarayotgan postlar yo‘q. Chap tarafdan yangi post qo‘shing.
            </div>
          ) : (
            managedPosts.map(post => (
              <div key={post.id} className="py-3.5 first:pt-0 space-y-2.5">
                {editingId === post.id ? (
                  <div className="p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 space-y-2.5">
                    <input
                      type="text"
                      value={editTitle}
                      onChange={e => setEditTitle(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none focus:border-emerald-500"
                    />
                    <textarea
                      rows={2}
                      value={editContent}
                      onChange={e => setEditContent(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs resize-none outline-none focus:border-emerald-500"
                    />
                    <div className="space-y-1">
                      <input
                        type="text"
                        value={editTelegramPostInput}
                        onChange={e => setEditTelegramPostInput(e.target.value)}
                        placeholder={`Post ID (125) yoki ${ECOHERO_NEWS_CHANNEL_URL}/125`}
                        className="w-full px-3 py-1.5 rounded-lg bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-mono outline-none focus:border-emerald-500"
                      />
                      {editTelegramPostInput.trim() && (
                        editTgPreview.valid && editTgPreview.normalized ? (
                          <p className="text-[10px] text-emerald-500 font-mono truncate">
                            {editTgPreview.normalized.postUrl}
                          </p>
                        ) : (
                          <p className="text-[10px] text-rose-500">{editTgPreview.error}</p>
                        )
                      )}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        value={editCtaText}
                        onChange={e => setEditCtaText(e.target.value)}
                        placeholder="Tugma matni"
                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs outline-none focus:border-emerald-500"
                      />
                      <input
                        type="text"
                        value={editCtaUrl}
                        onChange={e => setEditCtaUrl(e.target.value)}
                        placeholder="Qo‘shimcha havola (https://...)"
                        className="px-3 py-1.5 rounded-lg bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-mono outline-none focus:border-emerald-500"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={editImageUrl}
                        onChange={e => setEditImageUrl(e.target.value)}
                        placeholder="Rasm havolasi"
                        className="flex-1 min-w-0 px-3 py-1.5 rounded-lg bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-mono outline-none focus:border-emerald-500"
                      />
                      <label className="px-3 py-1.5 rounded-lg border border-slate-300 dark:border-emerald-500/25 bg-white dark:bg-[#061812] text-xs font-semibold flex items-center gap-1 cursor-pointer shrink-0">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Rasm</span>
                        <input type="file" accept="image/*" onChange={e => handleImageUpload(e, 'edit')} className="hidden" />
                      </label>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setEditingId(null)}
                        className="px-3 py-1.5 rounded-lg text-xs text-slate-500 hover:bg-slate-200 dark:hover:bg-emerald-500/10 flex items-center gap-1 cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" /> Bekor
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit(post.id)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-600 text-white text-xs font-bold flex items-center gap-1 cursor-pointer"
                      >
                        <Check className="w-3.5 h-3.5" /> Saqlash
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                        <span className="font-bold text-emerald-600 dark:text-emerald-400">
                          {CATEGORY_LABELS[post.category] || post.category}
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className={post.status === 'active' ? 'text-emerald-500 font-semibold' : 'text-amber-500 font-semibold'}>
                          {post.status === 'active' ? 'Faol' : 'To‘xtatilgan'}
                        </span>
                        {post.isPinned && (
                          <>
                            <span className="text-slate-400">·</span>
                            <span className="text-sky-500 font-semibold">Qadalgan</span>
                          </>
                        )}
                      </div>
                      <h4 className="text-sm font-bold text-slate-900 dark:text-white leading-snug">{post.title}</h4>
                      <p className="text-xs text-slate-600 dark:text-slate-400 line-clamp-2">{post.content}</p>
                      <div className="flex flex-wrap items-center gap-3 text-[11px] text-slate-400 pt-0.5">
                        <span>{post.authorName}{post.schoolName ? ` · ${post.schoolName}` : ''}</span>
                        {(() => {
                          const tgUrl = resolveNewsTelegramPostUrl(post);
                          const displayUrl =
                            tgUrl ||
                            (post.category !== 'news' && post.ctaUrl && !isGenericEcoHerouzChannelUrl(post.ctaUrl)
                              ? post.ctaUrl
                              : '');
                          if (!displayUrl) return null;
                          return (
                            <a
                              href={displayUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-emerald-500 hover:underline font-medium"
                            >
                              <ExternalLink className="w-3 h-3" />
                              <span>{tgUrl ? `Batafsil o‘qish (${displayUrl})` : post.ctaText || 'Havola'}</span>
                            </a>
                          );
                        })()}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        title={post.isPinned ? 'Qadashdan olish' : 'Yuqoriga qadash'}
                        onClick={async () => {
                          await updateHomePost(post.id, { isPinned: !post.isPinned });
                          await refreshManaged();
                        }}
                        className={`p-2 rounded-lg border transition-colors cursor-pointer ${
                          post.isPinned
                            ? 'border-sky-500/40 bg-sky-500/10 text-sky-500'
                            : 'border-slate-200 dark:border-emerald-500/20 text-slate-400 hover:text-sky-500'
                        }`}
                      >
                        <Pin className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title={post.status === 'active' ? "To'xtatish" : 'Faollashtirish'}
                        onClick={async () => {
                          await updateHomePost(post.id, { status: post.status === 'active' ? 'paused' : 'active' });
                          await refreshManaged();
                        }}
                        className="p-2 rounded-lg border border-slate-200 dark:border-emerald-500/20 text-slate-400 hover:text-amber-500 transition-colors cursor-pointer"
                      >
                        {post.status === 'active' ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        type="button"
                        title="Tahrirlash"
                        onClick={() => startEdit(post)}
                        className="p-2 rounded-lg border border-slate-200 dark:border-emerald-500/20 text-slate-400 hover:text-emerald-500 transition-colors cursor-pointer"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        title="O'chirish"
                        onClick={async () => {
                          await deleteHomePost(post.id);
                          await refreshManaged();
                        }}
                        className="p-2 rounded-lg border border-slate-200 dark:border-emerald-500/20 text-slate-400 hover:text-rose-500 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
