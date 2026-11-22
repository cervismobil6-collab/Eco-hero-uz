import React, { useEffect, useRef, useState } from 'react';
import {
  Clock,
  Coins,
  ExternalLink,
  Gift,
  ShieldCheck,
  SkipForward,
  Sparkles,
  CheckCircle2,
  Loader2,
  Volume2,
  VolumeX,
  Bot,
  Globe,
  Send,
  X,
  Lock,
} from 'lucide-react';
import { motion } from 'framer-motion';
import { EcoAd } from '../types/eco';
import { useEco } from '../context/EcoContext';
import { openAdTargetUrl, resolveMediaUrl } from '../utils/api';

interface AdPlayerModalProps {
  ad: EcoAd;
  mode: 'post_purchase' | 'earn_coins';
  onComplete: (result?: { awardedCoins?: number }) => void;
  onClose?: () => void;
}

function formatTimer(sec: number): string {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

function isLogoImage(val?: string): boolean {
  if (!val) return false;
  const s = val.trim();
  return /^(https?:\/\/|\/uploads\/|\/assets\/|data:image\/)/i.test(s);
}

export const AdPlayerModal: React.FC<AdPlayerModalProps> = ({ ad, mode, onComplete, onClose }) => {
  const { startAdWatch, claimAdWatchReward, recordAdClick, recordAdImpression } = useEco();
  const totalSeconds = Math.max(5, Math.min(300, Number(ad.skipAfterSeconds || 15)));
  const [secondsLeft, setSecondsLeft] = useState<number>(totalSeconds);
  const [watchSessionId, setWatchSessionId] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimedCoins, setClaimedCoins] = useState<number | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [cooldownBlocked, setCooldownBlocked] = useState(false);
  const [muted, setMuted] = useState(true);
  const [videoReady, setVideoReady] = useState(false);
  const [videoFailed, setVideoFailed] = useState(false);
  const autoClaimTriggeredRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    setSecondsLeft(totalSeconds);
    setWatchSessionId(null);
    setClaimedCoins(null);
    setClaimError(null);
    setCooldownBlocked(false);
    setVideoReady(false);
    setVideoFailed(false);
    autoClaimTriggeredRef.current = false;

    recordAdImpression(ad.id);
    if (mode === 'earn_coins') {
      let active = true;
      startAdWatch(ad.id).then(res => {
        if (!active) return;
        if (res.success && res.watchSessionId) {
          setWatchSessionId(res.watchSessionId);
        } else if (res.error) {
          setClaimError(res.error);
          if (res.cooldownActive) {
            setCooldownBlocked(true);
          }
        }
      });
      return () => {
        active = false;
      };
    }
  }, [ad.id, mode, totalSeconds]);

  // Single stable 1s interval (never recreate interval every second!)
  useEffect(() => {
    if (cooldownBlocked) return;
    const timer = window.setInterval(() => {
      setSecondsLeft(prev => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [ad.id, mode, cooldownBlocked]);

  // Auto-claim EcoCoins as soon as countdown hits 0 in earn_coins mode
  useEffect(() => {
    if (
      mode !== 'earn_coins' ||
      cooldownBlocked ||
      secondsLeft > 0 ||
      autoClaimTriggeredRef.current ||
      !watchSessionId
    ) {
      return;
    }
    autoClaimTriggeredRef.current = true;
    setClaiming(true);
    claimAdWatchReward(ad.id, watchSessionId)
      .then(res => {
        if (res.success) {
          setClaimedCoins(res.awardedCoins || ad.rewardCoins || 100);
        } else {
          setClaimError(res.error || 'Mukofot berilmadi');
        }
      })
      .finally(() => setClaiming(false));
  }, [mode, cooldownBlocked, secondsLeft, watchSessionId, ad.id, ad.rewardCoins]);

  const progressPercent = Math.min(100, Math.round(((totalSeconds - secondsLeft) / totalSeconds) * 100));
  const rewardAmount = Number(ad.rewardCoins) > 0 ? Number(ad.rewardCoins) : 100;

  const ctaKind =
    ad.ctaType ||
    (/t\.me\/|telegram\.me\//i.test(String(ad.ctaUrl || ''))
      ? /bot$/i.test(String(ad.ctaUrl || ''))
        ? 'telegram_bot'
        : 'telegram_channel'
      : 'website');

  const CtaIcon = ctaKind === 'telegram_bot' ? Bot : ctaKind === 'telegram_channel' ? Send : Globe;
  const defaultCtaLabel =
    ctaKind === 'telegram_bot'
      ? "Botga o'tish"
      : ctaKind === 'telegram_channel'
      ? "Kanalga o'tish"
      : 'Saytga kirish';

  const handleOpenDestination = () => {
    recordAdClick(ad.id);
    if (ad.ctaUrl) {
      openAdTargetUrl(ad.ctaUrl);
    }
  };

  const hasSponsorAvatar = isLogoImage(ad.sponsorLogo);
  const posterUrl = resolveMediaUrl(ad.imageUrl);
  const videoUrl = ad.videoUrl ? resolveMediaUrl(ad.videoUrl) : '';

  return (
    <div className="fixed inset-0 z-[130] flex items-start justify-center pt-3 sm:pt-6 px-2.5 sm:px-5 pb-6 overflow-y-auto bg-[#020907]/95">
      <motion.div
        initial={{ opacity: 0, scale: 0.97, y: -8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.18 }}
        className="w-full max-w-2xl rounded-[28px] bg-[#071812] border border-emerald-500/25 text-white shadow-2xl overflow-hidden"
      >
        {/* Top Progress Line */}
        <div className="h-1.5 w-full bg-slate-900">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400 transition-[width] duration-700 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* ~60% Viewport Cinema Media Stage */}
        <div
          onClick={() => {
            if (!videoUrl && ad.clickOpensLink !== false && ad.ctaUrl) {
              handleOpenDestination();
            }
          }}
          className={`relative h-[50dvh] min-h-[300px] sm:h-[55dvh] max-h-[62dvh] w-full bg-[#030A07] overflow-hidden ${
            !videoUrl && ad.clickOpensLink !== false && ad.ctaUrl ? 'cursor-pointer' : ''
          }`}
        >
          {/* Ambient poster layer prevents black blank flicker & cushions portrait/landscape videos */}
          {posterUrl && (
            <img
              src={posterUrl}
              alt=""
              aria-hidden="true"
              className={`absolute inset-0 w-full h-full object-cover ${
                videoUrl && !videoFailed ? 'opacity-25 scale-105' : 'opacity-100'
              }`}
            />
          )}

          {videoUrl && !videoFailed ? (
            <>
              <video
                ref={videoRef}
                key={videoUrl}
                src={videoUrl}
                poster={posterUrl}
                autoPlay
                loop
                playsInline
                preload="auto"
                muted={muted}
                controls
                onCanPlay={() => setVideoReady(true)}
                onPlaying={() => setVideoReady(true)}
                onWaiting={() => setVideoReady(false)}
                onError={() => {
                  setVideoFailed(true);
                  setVideoReady(true);
                }}
                className="relative z-[1] w-full h-full object-contain"
              />
              {!videoReady && (
                <div className="absolute inset-0 z-[2] flex flex-col items-center justify-center gap-2 bg-black/45 pointer-events-none">
                  <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                  <span className="text-[11px] font-bold text-slate-200">Video yuklanmoqda...</span>
                </div>
              )}
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setMuted(m => {
                    const next = !m;
                    if (videoRef.current) videoRef.current.muted = next;
                    return next;
                  });
                }}
                className="absolute bottom-14 right-3 px-3 py-2 rounded-full bg-black/75 border border-white/15 text-white hover:bg-black/90 cursor-pointer z-10 flex items-center gap-1.5 text-[11px] font-bold"
                aria-label="Ovoz"
              >
                {muted ? <VolumeX className="w-4 h-4 text-amber-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
                <span>{muted ? 'Ovozni yoqish' : 'Ovoz yoniq'}</span>
              </button>
            </>
          ) : (
            <img
              src={posterUrl}
              alt={ad.title}
              className="relative z-[1] w-full h-full object-cover"
            />
          )}

          <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/75 to-transparent pointer-events-none z-[3]" />
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-[#071812] to-transparent pointer-events-none z-[3]" />

          {/* Top Left Sponsor Profile Avatar & Name */}
          <div className="absolute top-3 left-3 z-10 flex items-center gap-2 pr-3 pl-1.5 py-1 rounded-full bg-black/75 border border-white/15 text-xs font-bold max-w-[64%]">
            {hasSponsorAvatar ? (
              <img
                src={resolveMediaUrl(ad.sponsorLogo!)}
                alt={ad.sponsorName}
                className="w-7 h-7 rounded-full object-cover border border-emerald-400/50 shrink-0"
              />
            ) : (
              <div className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-teal-400 text-slate-950 font-black text-[11px] flex items-center justify-center shrink-0">
                {(ad.sponsorName || 'E').trim().charAt(0).toUpperCase()}
              </div>
            )}
            <span className="truncate text-white">{ad.sponsorName}</span>
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          </div>

          {/* Top Right Timer / Close */}
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            {cooldownBlocked ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-amber-500/20 border border-amber-400/40 text-amber-300 text-xs font-black">
                <Lock className="w-3.5 h-3.5" />
                <span>5 soat kutilmoqda</span>
              </div>
            ) : secondsLeft > 0 ? (
              <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-black/80 border border-white/15 text-xs font-black font-mono tabular-nums">
                <Clock className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
                <span>{formatTimer(secondsLeft)}</span>
              </div>
            ) : mode === 'post_purchase' ? (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onComplete();
                }}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg cursor-pointer"
              >
                <span>O'tkazib yuborish</span>
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500 text-slate-950 text-xs font-black">
                <CheckCircle2 className="w-4 h-4" />
                <span>Tayyor!</span>
              </div>
            )}
            {onClose && (
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  onClose();
                }}
                aria-label="Yopish"
                className="w-8 h-8 rounded-full bg-black/75 border border-white/15 text-slate-300 hover:text-white flex items-center justify-center cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Sleek Footer Info & Action Controls */}
        <div className="p-4 sm:p-6 space-y-4">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-emerald-400">
                {mode === 'post_purchase' ? (
                  <>
                    <Gift className="w-3.5 h-3.5" /> Sovg&apos;a vaucheringiz tayyorlanmoqda
                  </>
                ) : (
                  <>
                    <Coins className="w-3.5 h-3.5 text-amber-400" /> +{rewardAmount} EcoCoin · {formatTimer(totalSeconds)}
                  </>
                )}
              </span>
              {ad.ctaUrl && (
                <button
                  type="button"
                  onClick={handleOpenDestination}
                  className="px-3 py-1.5 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-xs font-black text-sky-300 inline-flex items-center gap-1.5 cursor-pointer transition-colors"
                >
                  <CtaIcon className="w-3.5 h-3.5" />
                  <span>{ad.ctaText || defaultCtaLabel}</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <h3 className="text-lg sm:text-xl font-black leading-snug">{ad.headline}</h3>
            {ad.subheadline && <p className="text-xs sm:text-sm text-slate-300 leading-relaxed line-clamp-2">{ad.subheadline}</p>}
          </div>

          {mode === 'earn_coins' && claimError && (
            <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs font-semibold text-amber-200 flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>{claimError}</span>
            </div>
          )}

          {mode === 'earn_coins' && claimedCoins !== null && (
            <div className="p-3.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-emerald-300 font-bold text-xs sm:text-sm">
                <Sparkles className="w-5 h-5 text-amber-400 shrink-0" />
                <span>Tabriklaymiz! +{claimedCoins} EcoCoin qo&apos;shildi! Keyingi reklama 5 soatdan so&apos;ng ochiladi.</span>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-2.5 pt-2 border-t border-white/10">
            {mode === 'post_purchase' ? (
              <button
                type="button"
                disabled={secondsLeft > 0}
                onClick={() => onComplete()}
                className={`w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                  secondsLeft > 0
                    ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 shadow-lg shadow-emerald-500/20 cursor-pointer'
                }`}
              >
                {secondsLeft > 0 ? (
                  <>
                    <Clock className="w-4 h-4" />
                    <span>Vaucherni ochishga {formatTimer(secondsLeft)} qoldi...</span>
                  </>
                ) : (
                  <>
                    <SkipForward className="w-4 h-4" />
                    <span>O&apos;tkazib yuborish va Vaucher + QR kodni ko&apos;rish</span>
                  </>
                )}
              </button>
            ) : cooldownBlocked ? (
              <button
                type="button"
                onClick={() => (onClose ? onClose() : onComplete())}
                className="w-full py-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-white font-black text-xs uppercase tracking-wider cursor-pointer"
              >
                Yopish
              </button>
            ) : (
              <>
                <button
                  type="button"
                  disabled={secondsLeft > 0 || claiming}
                  onClick={() => {
                    if (claimedCoins !== null) {
                      onComplete({ awardedCoins: claimedCoins });
                    } else if (watchSessionId && !claiming) {
                      setClaiming(true);
                      claimAdWatchReward(ad.id, watchSessionId)
                        .then(res => {
                          if (res.success) {
                            const coins = res.awardedCoins || rewardAmount;
                            setClaimedCoins(coins);
                            onComplete({ awardedCoins: coins });
                          }
                        })
                        .finally(() => setClaiming(false));
                    }
                  }}
                  className={`flex-1 w-full py-3.5 rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all ${
                    secondsLeft > 0 || claiming
                      ? 'bg-slate-800 text-slate-400 cursor-not-allowed'
                      : 'bg-gradient-to-r from-amber-500 to-emerald-500 hover:brightness-110 text-slate-950 shadow-lg cursor-pointer'
                  }`}
                >
                  {claiming ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>+{rewardAmount} EcoCoin o&apos;tkazilmoqda...</span>
                    </>
                  ) : secondsLeft > 0 ? (
                    <>
                      <Clock className="w-4 h-4" />
                      <span>+{rewardAmount} EcoCoin olish ({formatTimer(secondsLeft)})</span>
                    </>
                  ) : claimedCoins !== null ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      <span>Davom etish (+{claimedCoins} EcoCoin olindi)</span>
                    </>
                  ) : (
                    <>
                      <Coins className="w-4 h-4" />
                      <span>+{rewardAmount} EcoCoin olish</span>
                    </>
                  )}
                </button>
                {onClose && secondsLeft > 0 && (
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-full sm:w-auto px-5 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold cursor-pointer"
                  >
                    Bekor qilish
                  </button>
                )}
              </>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
};


