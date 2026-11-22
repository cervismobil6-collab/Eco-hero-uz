import React, { useEffect, useState } from 'react';
import {
  ExternalLink,
  Info,
  ShieldCheck,
  Volume2,
  VolumeX,
  Edit2,
  Trash2,
  Film,
  Image as ImageIcon,
  X,
  Globe,
  Bot,
  Send,
  Clock,
  Sparkles,
} from 'lucide-react';
import { useEco } from '../context/EcoContext';
import { EcoAd, EcoAdPlacement } from '../types/eco';
import { openAdTargetUrl, resolveMediaUrl } from '../utils/api';

interface EcoAdBannerProps {
  placement: 'home_top' | 'home_middle' | 'shop_top' | 'map_banner' | 'media_sidebar';
  className?: string;
  ad?: EcoAd;
}

type AdCtaKind = 'website' | 'telegram_bot' | 'telegram_channel';

function inferCtaKind(url?: string, explicit?: string): AdCtaKind {
  if (explicit === 'website' || explicit === 'telegram_bot' || explicit === 'telegram_channel') {
    return explicit;
  }
  const lower = String(url || '').toLowerCase();
  if (lower.includes('t.me/') || lower.includes('telegram.me/')) {
    return lower.includes('bot') ? 'telegram_bot' : 'telegram_channel';
  }
  return 'website';
}

export const EcoAdBanner: React.FC<EcoAdBannerProps> = ({ placement, className = '', ad: customAd }) => {
  const {
    user,
    ecoAds,
    recordAdImpression,
    recordAdClick,
    updateEcoAd,
    deleteEcoAd,
    uploadMediaFile,
    showNotification,
  } = useEco();

  const [showInfoModal, setShowInfoModal] = useState(false);
  const [isVideoMuted, setIsVideoMuted] = useState(true);
  const [showEditModal, setShowEditModal] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);
  const [uploadingImg, setUploadingImg] = useState(false);
  const [uploadingVid, setUploadingVid] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);

  const [editTitle, setEditTitle] = useState('');
  const [editSponsor, setEditSponsor] = useState('');
  const [editSponsorLogo, setEditSponsorLogo] = useState('');
  const [editHeadline, setEditHeadline] = useState('');
  const [editSubheadline, setEditSubheadline] = useState('');
  const [editImageUrl, setEditImageUrl] = useState('');
  const [editVideoUrl, setEditVideoUrl] = useState('');
  const [editCtaText, setEditCtaText] = useState('');
  const [editCtaUrl, setEditCtaUrl] = useState('');
  const [editCtaType, setEditCtaType] = useState<AdCtaKind>('website');
  const [editClickOpensLink, setEditClickOpensLink] = useState(true);
  const [editSkipSeconds, setEditSkipSeconds] = useState('15');
  const [editPlacement, setEditPlacement] = useState<EcoAdPlacement>(placement);

  const activeAd = customAd || ecoAds.find(a => a.placement === placement && a.status === 'active');

  useEffect(() => {
    if (activeAd?.id) {
      recordAdImpression(activeAd.id);
    }
  }, [activeAd?.id]);

  if (!activeAd) {
    return null;
  }

  const isSuperAdmin = user.role === 'super_admin';
  const ctaKind = inferCtaKind(activeAd.ctaUrl, activeAd.ctaType);
  const isSponsorLogoImg = /^(https?:\/\/|\/uploads\/|\/assets\/|data:image\/)/i.test(
    String(activeAd.sponsorLogo || '').trim()
  );

  const openEditModal = () => {
    setEditTitle(activeAd.title || '');
    setEditSponsor(activeAd.sponsorName || '');
    setEditSponsorLogo(activeAd.sponsorLogo || '');
    setEditHeadline(activeAd.headline || '');
    setEditSubheadline(activeAd.subheadline || '');
    setEditImageUrl(activeAd.imageUrl || '');
    setEditVideoUrl(activeAd.videoUrl || '');
    setEditCtaText(activeAd.ctaText || "Batafsil ko'rish");
    setEditCtaUrl(activeAd.ctaUrl || 'https://t.me/Ecoheros_bot');
    setEditCtaType(inferCtaKind(activeAd.ctaUrl, activeAd.ctaType));
    setEditClickOpensLink(activeAd.clickOpensLink !== false);
    setEditSkipSeconds(String(activeAd.skipAfterSeconds || 15));
    setEditPlacement(activeAd.placement);
    setShowEditModal(true);
  };

  const handleUploadMedia = async (e: React.ChangeEvent<HTMLInputElement>, target: 'image' | 'video' | 'logo') => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 80 * 1024 * 1024) {
      showNotification('Fayl hajmi 80 MB dan oshmasligi kerak', 'warning');
      e.target.value = '';
      return;
    }
    if (target === 'image') setUploadingImg(true);
    else if (target === 'logo') setUploadingLogo(true);
    else setUploadingVid(true);
    try {
      const up = await uploadMediaFile(file, file.name);
      if (up.success && up.url) {
        if (target === 'image') setEditImageUrl(up.url);
        else if (target === 'logo') setEditSponsorLogo(up.url);
        else setEditVideoUrl(up.url);
        showNotification(target === 'video' ? 'Video muvaffaqiyatli yuklandi!' : 'Rasm muvaffaqiyatli yuklandi!', 'success');
      } else {
        showNotification(up.error || 'Yuklashda xatolik', 'warning');
      }
    } finally {
      setUploadingImg(false);
      setUploadingLogo(false);
      setUploadingVid(false);
      e.target.value = '';
    }
  };

  const handleSaveAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (savingEdit) return;
    setSavingEdit(true);
    try {
      const cleanSkip = Math.max(5, Math.min(300, Number(editSkipSeconds) || 15));
      const res = await updateEcoAd(activeAd.id, {
        title: editTitle.trim() || activeAd.title,
        sponsorName: editSponsor.trim() || activeAd.sponsorName,
        sponsorLogo: editSponsorLogo.trim() || activeAd.sponsorLogo,
        headline: editHeadline.trim() || editTitle.trim() || activeAd.headline,
        subheadline: editSubheadline.trim(),
        imageUrl: editImageUrl.trim() || activeAd.imageUrl,
        videoUrl: editVideoUrl.trim() || undefined,
        type: editVideoUrl.trim() ? 'video' : 'banner',
        ctaText: editCtaText.trim() || "Batafsil ko'rish",
        ctaUrl: editCtaUrl.trim() || activeAd.ctaUrl,
        ctaType: editCtaType,
        clickOpensLink: editClickOpensLink,
        skipAfterSeconds: cleanSkip,
        placement: editPlacement,
      });
      if (res.success) {
        setShowEditModal(false);
      }
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteAd = async () => {
    await deleteEcoAd(activeAd.id);
  };

  const handleOpenAdDestination = (e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    recordAdClick(activeAd.id);
    if (activeAd.ctaUrl) {
      openAdTargetUrl(activeAd.ctaUrl);
    }
  };

  const handleCardSurfaceClick = () => {
    if (activeAd.clickOpensLink !== false && activeAd.ctaUrl) {
      handleOpenAdDestination();
    }
  };

  const resolvedImage = resolveMediaUrl(activeAd.imageUrl);
  const resolvedVideo = activeAd.videoUrl ? resolveMediaUrl(activeAd.videoUrl) : '';

  const CtaTypeIcon = ctaKind === 'telegram_bot' ? Bot : ctaKind === 'telegram_channel' ? Send : Globe;
  const ctaTypeLabel =
    ctaKind === 'telegram_bot'
      ? 'Telegram Bot'
      : ctaKind === 'telegram_channel'
      ? 'Telegram Kanal'
      : 'Rasmiy Sayt';

  return (
    <>
      <div
        onClick={handleCardSurfaceClick}
        className={`group relative overflow-hidden rounded-[28px] border border-emerald-500/25 bg-gradient-to-br from-[#071D15] via-[#061812] to-[#040D0A] text-white shadow-xl transition-all hover:border-emerald-400/50 ${
          activeAd.clickOpensLink !== false ? 'cursor-pointer' : ''
        } ${className}`}
      >
        <div className="absolute -right-20 -top-20 w-64 h-64 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -left-16 -bottom-16 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative p-4 sm:p-6 flex flex-col md:flex-row items-stretch justify-between gap-5 sm:gap-6">
          {/* Commercial Media Stage */}
          <div
            onClick={e => {
              if (!resolvedVideo && activeAd.clickOpensLink !== false) {
                handleOpenAdDestination(e);
              } else {
                e.stopPropagation();
              }
            }}
            className="w-full md:w-[44%] h-48 sm:h-52 rounded-2xl overflow-hidden relative bg-slate-950 border border-white/10 shrink-0 shadow-lg"
          >
            {resolvedVideo ? (
              <>
                {resolvedImage && (
                  <img
                    src={resolvedImage}
                    alt={activeAd.title}
                    className="absolute inset-0 w-full h-full object-cover"
                  />
                )}
                <video
                  src={resolvedVideo}
                  poster={resolvedImage || undefined}
                  preload="metadata"
                  loop
                  playsInline
                  muted={isVideoMuted}
                  controls
                  className="relative z-[1] w-full h-full object-cover"
                />
                <div className="absolute top-2.5 right-2.5 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/75 text-[10px] font-black z-10 border border-white/10">
                  <button
                    type="button"
                    onClick={e => {
                      e.stopPropagation();
                      setIsVideoMuted(!isVideoMuted);
                    }}
                    className="hover:text-emerald-400 cursor-pointer flex items-center gap-1"
                    aria-label="Ovoz"
                  >
                    {isVideoMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
                    <span>{isVideoMuted ? 'Ovozni yoqish' : 'Ovoz yoqilgan'}</span>
                  </button>
                </div>
              </>
            ) : (
              <img
                src={resolvedImage}
                alt={activeAd.title}
                className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
              />
            )}

            <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-black/30 pointer-events-none z-[2]" />

            <div className="absolute top-2.5 left-2.5 pr-2.5 pl-1 py-1 rounded-full bg-black/80 border border-white/15 text-[10px] font-bold text-emerald-300 flex items-center gap-1.5 pointer-events-none z-[3]">
              {isSponsorLogoImg ? (
                <img
                  src={resolveMediaUrl(activeAd.sponsorLogo!)}
                  alt={activeAd.sponsorName}
                  className="w-5 h-5 rounded-full object-cover border border-emerald-400/50 shrink-0"
                />
              ) : (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 ml-1 shrink-0" />
              )}
              <span className="truncate max-w-[140px]">{activeAd.sponsorName}</span>
            </div>

            {!resolvedVideo && activeAd.clickOpensLink !== false && (
              <div className="absolute bottom-2.5 right-2.5 px-2.5 py-1 rounded-full bg-emerald-500/90 text-slate-950 text-[10px] font-black uppercase tracking-wider flex items-center gap-1 shadow-md pointer-events-none">
                <CtaTypeIcon className="w-3 h-3" />
                <span>{ctaTypeLabel}</span>
              </div>
            )}
          </div>

          {/* Commercial Ad Copy & Actions */}
          <div className="flex-1 flex flex-col justify-between gap-4 min-w-0">
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2 text-[11px] font-bold">
                  <span className="px-2.5 py-0.5 rounded-md bg-amber-500/20 text-amber-300 border border-amber-400/30 text-[10px] font-black uppercase tracking-wider">
                    REKLAMA
                  </span>
                  <span className="text-slate-400 inline-flex items-center gap-1">
                    <CtaTypeIcon className="w-3.5 h-3.5 text-emerald-400" />
                    {ctaTypeLabel}
                  </span>
                  {activeAd.videoUrl && (
                    <span className="text-sky-400 inline-flex items-center gap-1">
                      · Video
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-1.5" onClick={e => e.stopPropagation()}>
                  {isSuperAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={openEditModal}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-slate-950 text-[11px] font-bold transition-colors cursor-pointer"
                        title="Reklamani o'zgartirish"
                      >
                        <Edit2 className="w-3 h-3" />
                        <span>O'zgartirish</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDeleteAd}
                        className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-rose-500/20 hover:bg-rose-500 text-rose-300 hover:text-white text-[11px] font-bold transition-colors cursor-pointer"
                        title="Reklamani o'chirish"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowInfoModal(true)}
                    className="flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] text-slate-400 hover:text-emerald-300 hover:bg-white/5 transition-colors cursor-pointer"
                    title="Reklama va homiylik qoidalari"
                  >
                    <Info className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              <h3 className="text-lg sm:text-xl font-black text-white tracking-tight leading-snug group-hover:text-emerald-300 transition-colors">
                {activeAd.headline}
              </h3>

              <p className="text-xs sm:text-sm text-slate-300 leading-relaxed line-clamp-2">
                {activeAd.subheadline}
              </p>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
              <div className="flex items-center gap-2 text-[11px] text-emerald-300/80 font-medium min-w-0">
                <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="truncate">{activeAd.complianceNote}</span>
              </div>

              <button
                type="button"
                onClick={handleOpenAdDestination}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:brightness-110 text-slate-950 font-black text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-emerald-500/25 transition-all cursor-pointer active:scale-95 shrink-0"
              >
                <CtaTypeIcon className="w-4 h-4" />
                <span>{activeAd.ctaText || ctaTypeLabel}</span>
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Inline Super Admin Ad Edit Modal */}
      {showEditModal && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm overflow-y-auto">
          <div className="w-full max-w-lg rounded-3xl bg-[#071812] border border-emerald-500/25 text-white p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black uppercase tracking-tight">Reklamani O'zgartirish</h3>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="p-2 rounded-xl text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveAd} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  placeholder="Reklama nomi"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-semibold outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  value={editSponsor}
                  onChange={e => setEditSponsor(e.target.value)}
                  placeholder="Homiy nomi"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-semibold outline-none focus:border-emerald-500"
                />
              </div>

              <input
                type="text"
                value={editHeadline}
                onChange={e => setEditHeadline(e.target.value)}
                placeholder="Asosiy sarlavha"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-semibold outline-none focus:border-emerald-500"
              />

              <textarea
                rows={2}
                value={editSubheadline}
                onChange={e => setEditSubheadline(e.target.value)}
                placeholder="Qisqa tavsif"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 font-semibold outline-none focus:border-emerald-500 resize-none"
              />

              {/* Direct File Uploads for Profile Avatar, Video and Cover Image */}
              <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                {/^(https?:\/\/|\/uploads\/|\/assets\/|data:image\/)/i.test(editSponsorLogo.trim()) ? (
                  <img
                    src={resolveMediaUrl(editSponsorLogo)}
                    alt="Profil rasmi"
                    className="w-10 h-10 rounded-full object-cover border border-emerald-500/40 shrink-0"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-300 font-black text-xs shrink-0">
                    {(editSponsor || 'E').trim().charAt(0).toUpperCase()}
                  </div>
                )}
                <label className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-xl bg-amber-500/15 border border-amber-500/40 hover:bg-amber-500/25 text-amber-300 font-bold cursor-pointer">
                  <ImageIcon className="w-4 h-4 shrink-0" />
                  <span>{uploadingLogo ? 'Yuklanmoqda...' : 'Reklama profil rasmi (Avatar)'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => handleUploadMedia(e, 'logo')}
                    className="hidden"
                  />
                </label>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                <label className="flex items-center justify-center gap-2 px-3.5 py-3 rounded-xl bg-emerald-600/20 border border-emerald-500/40 hover:bg-emerald-600/30 text-emerald-300 font-bold cursor-pointer">
                  <Film className="w-4 h-4 shrink-0" />
                  <span>{uploadingVid ? 'Video yuklanmoqda...' : editVideoUrl ? 'Video almashtirish' : 'Video fayl yuklash'}</span>
                  <input
                    type="file"
                    accept="video/*"
                    onChange={e => handleUploadMedia(e, 'video')}
                    className="hidden"
                  />
                </label>

                <label className="flex items-center justify-center gap-2 px-3.5 py-3 rounded-xl bg-sky-600/20 border border-sky-500/40 hover:bg-sky-600/30 text-sky-300 font-bold cursor-pointer">
                  <ImageIcon className="w-4 h-4 shrink-0" />
                  <span>{uploadingImg ? 'Rasm yuklanmoqda...' : 'Muqova rasm yuklash'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => handleUploadMedia(e, 'image')}
                    className="hidden"
                  />
                </label>
              </div>

              {(editImageUrl || editVideoUrl) && (
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  {editImageUrl && (
                    <img
                      src={resolveMediaUrl(editImageUrl)}
                      alt="Preview"
                      className="w-12 h-12 rounded-lg object-cover border border-white/10 shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="text-[11px] font-bold text-emerald-400 truncate">
                      {editVideoUrl ? `Video: ${editVideoUrl}` : `Rasm: ${editImageUrl}`}
                    </div>
                    {editVideoUrl && (
                      <button
                        type="button"
                        onClick={() => setEditVideoUrl('')}
                        className="text-[11px] text-rose-400 font-bold cursor-pointer"
                      >
                        Videoni olib tashlash
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Duration presets + custom seconds */}
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-400" />
                    Reklama davomiyligi (soniya)
                  </span>
                  <span className="text-amber-300 font-mono">{editSkipSeconds || 15}s</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[15, 30, 60, 90, 120].map(sec => (
                    <button
                      type="button"
                      key={sec}
                      onClick={() => setEditSkipSeconds(String(sec))}
                      className={`px-2.5 py-1 rounded-lg font-mono font-bold text-[11px] cursor-pointer transition-colors ${
                        Number(editSkipSeconds) === sec
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-slate-900 text-slate-300 border border-slate-800 hover:border-amber-500/40'
                      }`}
                    >
                      {sec >= 60 ? `${sec / 60} min (${sec}s)` : `${sec}s`}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={editSkipSeconds}
                    onChange={e => setEditSkipSeconds(e.target.value)}
                    className="w-20 px-2.5 py-1 rounded-lg bg-slate-900 border border-slate-700 font-mono font-bold text-white outline-none"
                    placeholder="soniya"
                  />
                </div>
              </div>

              {/* Destination type & URL */}
              <div className="p-3 rounded-2xl bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">
                  Reklama bosilganda qayerga o‘tsin?
                </div>
                <div className="grid grid-cols-3 gap-1.5">
                  {(
                    [
                      { id: 'website', label: 'Sayt', icon: Globe },
                      { id: 'telegram_bot', label: 'TG Bot', icon: Bot },
                      { id: 'telegram_channel', label: 'TG Kanal', icon: Send },
                    ] as const
                  ).map(kind => {
                    const Icon = kind.icon;
                    return (
                      <button
                        type="button"
                        key={kind.id}
                        onClick={() => setEditCtaType(kind.id)}
                        className={`py-2 px-2 rounded-xl font-bold text-[11px] flex items-center justify-center gap-1.5 border cursor-pointer transition-all ${
                          editCtaType === kind.id
                            ? 'bg-emerald-500/20 border-emerald-500 text-emerald-300'
                            : 'bg-slate-900 border-slate-800 text-slate-400'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{kind.label}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <input
                    type="text"
                    value={editCtaText}
                    onChange={e => setEditCtaText(e.target.value)}
                    placeholder="Tugma matni"
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 font-semibold outline-none focus:border-emerald-500"
                  />
                  <input
                    type="text"
                    value={editCtaUrl}
                    onChange={e => setEditCtaUrl(e.target.value)}
                    placeholder={
                      editCtaType === 'telegram_bot'
                        ? 'https://t.me/my_bot'
                        : editCtaType === 'telegram_channel'
                        ? 'https://t.me/my_channel'
                        : 'https://example.uz'
                    }
                    className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-slate-800 font-semibold outline-none focus:border-emerald-500"
                  />
                </div>
                <label className="flex items-center gap-2 text-[11px] text-slate-300 font-semibold cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editClickOpensLink}
                    onChange={e => setEditClickOpensLink(e.target.checked)}
                    className="accent-emerald-500 rounded"
                  />
                  <span>Reklama kartasi yoki rasmini bosganda ham ushbu havola ochilsin</span>
                </label>
              </div>

              <details className="text-[11px] text-slate-400">
                <summary className="cursor-pointer hover:text-slate-200">Ixtiyoriy URL kiritish</summary>
                <div className="mt-2 space-y-2">
                  <input
                    type="text"
                    value={editImageUrl}
                    onChange={e => setEditImageUrl(e.target.value)}
                    placeholder="Rasm URL (ixtiyoriy)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 outline-none"
                  />
                  <input
                    type="text"
                    value={editVideoUrl}
                    onChange={e => setEditVideoUrl(e.target.value)}
                    placeholder="Video URL (ixtiyoriy)"
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 outline-none"
                  />
                </div>
              </details>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-bold cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="submit"
                  disabled={savingEdit || uploadingImg || uploadingVid || uploadingLogo}
                  className="flex-1 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-black uppercase tracking-wider cursor-pointer disabled:opacity-50"
                >
                  {savingEdit ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Compliance / Transparency Info Modal */}
      {showInfoModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fadeIn">
          <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 text-white p-6 space-y-4 shadow-2xl">
            <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
              <ShieldCheck className="w-5 h-5" />
              <span>ECO HERO Reklama & Homiylik Xavfsizligi</span>
            </div>

            <div className="space-y-2.5 text-xs text-slate-300 leading-relaxed">
              <p>
                <b>1. Yosh chegarasi va etika:</b> Ushbu platformadagi barcha reklamalar maktab o'quvchilari yoshiga mos keladi (ekologiya, ta'lim, sog'lom turmush tarzi, innovatsiyalar).
              </p>
              <p>
                <b>2. Ma'lumotlar daxlsizligi:</b> Reklama beruvchilarga o'quvchilarning shaxsiy yoki maktab ma'lumotlari berilmaydi.
              </p>
              <p>
                <b>3. Mukofot qoidasi:</b> Oddiy bannerlarda avtomatik tanga berilmaydi. Maxsus &ldquo;EcoCoin Reklama&rdquo; bo&lsquo;limidagi Super Admin tasdiqlagan reklamalarni {activeAd.skipAfterSeconds || 15} soniya to&lsquo;liq ko&lsquo;rganda server tekshiruvidan so&lsquo;ng avtomatik EcoCoin beriladi.
              </p>
              <p>
                <b>4. Faqat tasdiqlangan kelishuvlar:</b> Har bir reklama banneri Super Admin va Eko-moderatorlar tomonidan qo'lda tasdiqlanadi.
              </p>
            </div>

            <div className="pt-2 flex justify-end">
              <button
                type="button"
                onClick={() => setShowInfoModal(false)}
                className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                Tushundim
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

