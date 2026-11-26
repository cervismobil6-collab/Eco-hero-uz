import React, { useState } from 'react';
import { Plus, Trash2, Tv, Send, Bot, Globe, Instagram, ShieldCheck } from 'lucide-react';
import { EcoAd, ShopRedemptionGate, ShopSubscriptionPlatform, ShopSubscriptionTarget } from '../../types/eco';

interface GiftGateConfigEditorProps {
  gate: ShopRedemptionGate;
  onChange: (next: ShopRedemptionGate) => void;
  ecoAds: EcoAd[];
}

const PLATFORM_LABELS: Record<ShopSubscriptionPlatform, string> = {
  telegram_channel: 'Telegram kanal',
  telegram_bot: 'Telegram bot',
  instagram: 'Instagram',
  website: 'Veb-sayt',
};

export const GiftGateConfigEditor: React.FC<GiftGateConfigEditorProps> = ({
  gate,
  onChange,
  ecoAds,
}) => {
  const [subPlatform, setSubPlatform] = useState<ShopSubscriptionPlatform>('telegram_channel');
  const [subTitle, setSubTitle] = useState('');
  const [subUrl, setSubUrl] = useState('');

  const mode = gate?.mode || 'none';
  const subs = gate?.requiredSubscriptions || [];
  const showAdSelect = mode === 'ad' || mode === 'ad_and_subscription';
  const showSubBuilder = mode === 'subscription' || mode === 'ad_and_subscription';

  const handleAddTarget = () => {
    const cleanUrl = subUrl.trim();
    if (!cleanUrl) return;
    let normalizedUrl = cleanUrl;
    let handle: string | undefined;

    if (cleanUrl.startsWith('@')) {
      handle = cleanUrl;
      normalizedUrl =
        subPlatform === 'instagram'
          ? `https://instagram.com/${cleanUrl.slice(1)}`
          : `https://t.me/${cleanUrl.slice(1)}`;
    } else if (!/^https?:\/\//i.test(cleanUrl)) {
      if (subPlatform === 'telegram_channel' || subPlatform === 'telegram_bot') {
        handle = `@${cleanUrl.replace(/^t\.me\//i, '').replace(/^@/, '')}`;
        normalizedUrl = cleanUrl.includes('t.me/')
          ? `https://${cleanUrl}`
          : `https://t.me/${cleanUrl.replace(/^@/, '')}`;
      } else if (subPlatform === 'instagram') {
        normalizedUrl = cleanUrl.includes('instagram.com/')
          ? `https://${cleanUrl}`
          : `https://instagram.com/${cleanUrl.replace(/^@/, '')}`;
      } else {
        normalizedUrl = `https://${cleanUrl}`;
      }
    } else {
      const m = cleanUrl.match(/t\.me\/([A-Za-z0-9_]+)/i);
      if (m) handle = `@${m[1]}`;
    }

    const nextTarget: ShopSubscriptionTarget = {
      id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      platform: subPlatform,
      title: subTitle.trim() || handle || PLATFORM_LABELS[subPlatform],
      url: normalizedUrl,
      ...(handle ? { handle } : {}),
    };

    onChange({
      ...gate,
      requiredSubscriptions: [...subs, nextTarget],
    });
    setSubTitle('');
    setSubUrl('');
  };

  const handleRemoveTarget = (id: string) => {
    onChange({
      ...gate,
      requiredSubscriptions: subs.filter(s => s.id !== id),
    });
  };

  const renderPlatformIcon = (platform: ShopSubscriptionPlatform) => {
    if (platform === 'telegram_channel') return <Send className="w-3.5 h-3.5 text-sky-500 shrink-0" />;
    if (platform === 'telegram_bot') return <Bot className="w-3.5 h-3.5 text-emerald-500 shrink-0" />;
    if (platform === 'instagram') return <Instagram className="w-3.5 h-3.5 text-pink-500 shrink-0" />;
    return <Globe className="w-3.5 h-3.5 text-amber-500 shrink-0" />;
  };

  return (
    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold text-slate-700 dark:text-slate-200 flex items-center gap-1.5">
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
          Sovg&apos;ani olish sharti
        </span>
        <span className="text-[10px] text-slate-400">Admin tanlovi</span>
      </div>

      <div className="grid grid-cols-2 gap-1.5">
        {[
          { id: 'none', label: 'Reklamasiz / Obunasiz' },
          { id: 'ad', label: 'Reklama bilan' },
          { id: 'subscription', label: 'Majburiy obuna' },
          { id: 'ad_and_subscription', label: 'Reklama + Obuna' },
        ].map(opt => (
          <button
            key={opt.id}
            type="button"
            onClick={() =>
              onChange({
                ...gate,
                mode: opt.id as ShopRedemptionGate['mode'],
                adId: gate?.adId || 'auto',
                requiredSubscriptions: gate?.requiredSubscriptions || [],
              })
            }
            className={`min-h-[38px] px-2.5 py-2 rounded-xl text-[10px] font-bold text-left transition-colors cursor-pointer border ${
              mode === opt.id
                ? 'bg-emerald-600 text-white border-emerald-500 border-b-2 border-b-emerald-800'
                : 'bg-white dark:bg-[#061812] text-slate-600 dark:text-slate-300 border-slate-200 dark:border-emerald-500/20 hover:border-emerald-500/40'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === 'none' && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400">
          Foydalanuvchi sovg&apos;ani bosishi bilan reklamasiz va obunasiz to&apos;g&apos;ridan-to&apos;g&apos;ri promokodni oladi.
        </p>
      )}

      {showAdSelect && (
        <div className="space-y-1.5 pt-1 border-t border-slate-200 dark:border-emerald-500/15">
          <label className="text-[10px] font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Tv className="w-3.5 h-3.5 text-amber-500" />
            Qaysi reklama ko&apos;rsatilsin?
          </label>
          <select
            value={gate?.adId || 'auto'}
            onChange={e => onChange({ ...gate, adId: e.target.value })}
            className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none focus:border-emerald-500"
          >
            <option value="auto">Istalgan faol homiy reklamasi</option>
            {ecoAds.map(ad => (
              <option key={ad.id} value={ad.id}>
                {ad.title} ({ad.skipAfterSeconds || 15}s · {ad.status === 'active' ? 'Faol' : 'Nofaol'})
              </option>
            ))}
          </select>
        </div>
      )}

      {showSubBuilder && (
        <div className="space-y-2.5 pt-2 border-t border-slate-200 dark:border-emerald-500/15">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold text-slate-500 dark:text-slate-400">
              Majburiy obuna manzillari ({subs.length} ta)
            </span>
          </div>

          {subs.length > 0 && (
            <div className="space-y-1.5">
              {subs.map(sub => (
                <div
                  key={sub.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    {renderPlatformIcon(sub.platform)}
                    <div className="min-w-0">
                      <div className="text-[11px] font-bold truncate text-slate-800 dark:text-slate-100">
                        {sub.title}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">
                        {PLATFORM_LABELS[sub.platform]} · {sub.url}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveTarget(sub.id)}
                    className="p-1.5 text-rose-500 hover:bg-rose-500/10 rounded-lg cursor-pointer shrink-0"
                    title="O'chirish"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <select
              value={subPlatform}
              onChange={e => setSubPlatform(e.target.value as ShopSubscriptionPlatform)}
              className="px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none focus:border-emerald-500"
            >
              <option value="telegram_channel">Telegram kanal</option>
              <option value="telegram_bot">Telegram bot</option>
              <option value="instagram">Instagram sahifa</option>
              <option value="website">Veb-sayt</option>
            </select>
            <input
              type="text"
              placeholder="Nomi (masalan: EcoHero kanali)"
              value={subTitle}
              onChange={e => setSubTitle(e.target.value)}
              className="px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none focus:border-emerald-500"
            />
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder={
                subPlatform === 'instagram'
                  ? 'https://instagram.com/ecohero_uz'
                  : subPlatform === 'website'
                  ? 'https://example.uz'
                  : '@kanal_yoki_bot yoki https://t.me/...'
              }
              value={subUrl}
              onChange={e => setSubUrl(e.target.value)}
              className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-semibold outline-none focus:border-emerald-500"
            />
            <button
              type="button"
              onClick={handleAddTarget}
              className="px-3 py-2 bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] rounded-xl text-xs font-black border-b-2 border-emerald-700 flex items-center gap-1 hover:brightness-105 cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Qo&apos;shish
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
