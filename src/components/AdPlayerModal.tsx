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

export const AdPlayerModal: React.FC<AdPlayerModalProps> = ({ ad, mode, onComplete, onClose }) => {
  const { startAdWatch, claimAdWatchReward, recordAdClick, recordAdImpression } = useEco();
  const totalSeconds = Math.max(5, Math.min(300, Number(ad.skipAfterSeconds || 15)));
  const [secondsLeft, setSecondsLeft] = useState<number>(totalSeconds);
  const [watchSessionId, setWatchSessionId] = useState<string | null>(null);
  const [claiming, setClaiming] = useState(false);
  const [claimedCoins, setClaimedCoins] = useState<number | null>(null);
  const [claimError, setClaimError] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const autoClaimTriggeredRef = useRef(false);

  useEffect(() => {
    recordAdImpression(ad.id);
    if (mode === 'earn_coins') {
      startAdWatch(ad.id).then(res => {
        if (res.success && res.watchSessionId) {
          setWatchSessionId(res.watchSessionId);
        } else if (res.error) {
          setClaimError(res.error);
        }
      });
    }
  }, [ad.id, mode]);

  useEffect(() => {
    if (secondsLeft <= 0) return;
    const timer = window.setInterval(() => {
      setSecondsLeft(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [secondsLeft]);

  // Auto-claim EcoCoins as soon as countdown hits 0 in earn_coins mode
  useEffect(() => {
    if (mode !== 'earn_coins' || secondsLeft > 0 || autoClaimTriggeredRef.current || !watchSessionId) {
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
  }, [mode, secondsLeft, watchSessionId, ad.id, ad.rewardCoins]);

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

  return (
    <div className="fixed inset-0 z-[130] flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-2xl">
      <motion.div
        initial={{ opacity: 0, scale: 0.94, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        className="w-full max-w-xl rounded-[36px] bg-[#0f172a] border border-white/10 text-white shadow-2xl overflow-hidden"
      >
        {/* Top Countdown Bar */}
        <div className="h-1.5 w-full bg-slate-800">
          <div
            className="h-full bg-gradient-to-r from-emerald-500 via-teal-400 to-amber-400 transition-all duration-1000 ease-linear"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {/* Media Stage */}
        <div
          onClick={() => {
            if (!ad.videoUrl && ad.clickOpensLink !== false && ad.ctaUrl) {
              handleOpenDestination();
            }
          }}
          className={`relative aspect-video bg-black overflow-hidden ${
            !ad.videoUrl && ad.clickOpensLink !== false && ad.ctaUrl ? 'cursor-pointer' : ''
          }`}
        >
          {ad.videoUrl ? (
            <>
              <video
                src={resolveMediaUrl(ad.videoUrl)}
                poster={resolveMediaUrl(ad.imageUrl)}
                autoPlay
                loop
                playsInline
                muted={muted}
                controls
                className="w-full h-full object-cover"
              />
              <button
                type="button"
                onClick={e => {
                  e.stopPropagation();
                  setMuted(m => !m);
                }}
                className="absolute bottom-3 right-3 p-2 rounded-full bg-black/65 backdrop-blur-md text-white hover:bg-black/80 cursor-pointer z-10"
                aria-label="Ovoz"
              >
                {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
              </button>
            </>
          ) : (
            <img src={resolveMediaUrl(ad.imageUrl)} alt={ad.title} className="w-full h-full object-cover" />
          )}

          <div className="absolute inset-0 bg-gradient-to-t from-[#0f172a] via-transparent to-black/40 pointer-events-none" />

          {/* Top Left Sponsor Badge */}
          <div className="absolute top-4 left-4 flex items-center gap-2 px-3 py-1.5 rounded-full bg-black/70 backdrop-blur-md border border-white/10 text-[11px] font-bold pointer-events-none">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
            <span>{ad.sponsorName}</span>
            <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 text-[9px] font-black uppercase">
              REKLAMA
            </span>
          </div>

          {/* Top Right Countdown / Skip Pill */}
          <div className="absolute top-4 right-4 z-10">
            {secondsLeft > 0 ? (
              <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-black/75 backdrop-blur-md border border-white/15 text-xs font-black font-mono tabular-nums">
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
                className="flex items-center gap-1.5 px-4 py-2 rounded-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black text-xs uppercase tracking-wider shadow-lg cursor-pointer transition-transform active:scale-95"
              >
                <span>O'tkazib yuborish</span>
                <SkipForward className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-emerald-500 text-slate-950 text-xs font-black">
                <CheckCircle2 className="w-4 h-4" />
                <span>Tayyor!</span>
              </div>
            )}
          </div>
        </div>

        {/* Ad Content & Action */}
        <div className="p-6 sm:p-8 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-emerald-400">
                {mode === 'post_purchase' ? (
                  <>
                    <Gift className="w-3.5 h-3.5" /> Sovg'a vaucheringiz tayyorlanmoqda
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
            <h3 className="text-xl sm:text-2xl font-black leading-tight">{ad.headline}</h3>
            {ad.subheadline && <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">{ad.subheadline}</p>}
          </div>

          {mode === 'earn_coins' && claimError && (
            <div className="p-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-xs font-semibold text-rose-300">
              {claimError}
            </div>
          )}

          {mode === 'earn_coins' && claimedCoins !== null && (
            <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5 text-emerald-300 font-bold text-sm">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <span>Tabriklaymiz! +{claimedCoins} EcoCoin hisobingizga avtomatik qo'shildi!</span>
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row items-center gap-3 pt-2 border-t border-white/10">
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
                    <span>O'tkazib yuborish va Vaucher + QR kodni ko'rish</span>
                  </>
                )}
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
                      <span>+{rewardAmount} EcoCoin o'tkazilmoqda...</span>
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
                    className="px-4 py-3.5 rounded-2xl bg-white/5 hover:bg-white/10 text-slate-400 text-xs font-bold cursor-pointer"
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

