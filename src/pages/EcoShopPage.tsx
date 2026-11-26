import React, { useEffect, useMemo, useState } from 'react';
import {
  ShoppingBag,
  Coins,
  CheckCircle2,
  AlertCircle,
  Tag,
  ShieldCheck,
  ArrowRight,
  ExternalLink,
  Package,
  Clock,
  Copy,
  Edit2,
  X,
  Sparkles,
  Plus,
  Image as ImageIcon,
  Search,
  Filter,
  Star,
  Zap,
  TrendingUp,
  PlayCircle,
  QrCode,
  Tv,
  Gift,
  Trash2,
  Film,
  Upload,
  Globe,
  Bot,
  Send,
  Instagram,
  Lock,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'qrcode';
import { useEco } from '../context/EcoContext';
import { EcoAd, ShopItem, ShopRedemptionGate } from '../types/eco';
import { EcoAdBanner } from '../components/EcoAdBanner';
import { AdPlayerModal } from '../components/AdPlayerModal';
import { GiftGateConfigEditor } from '../components/shop/GiftGateConfigEditor';
import { isInsideTelegramWebApp, normalizeAdTargetUrl, resolveMediaUrl, openAdTargetUrl } from '../utils/api';
import heroEcoForestImg from '../assets/images/hero_eco_forest_1795179384249.jpg';
import homeGiftLeavesImg from '../assets/images/home_gift_leaves_1795602395449.jpg';

function isAdLogoImage(val?: string): boolean {
  if (!val) return false;
  return /^(https?:\/\/|\/uploads\/|\/assets\/|data:image\/)/i.test(val.trim());
}

function formatCooldownHms(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const rem = s % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(rem).padStart(2, '0')}`;
}

export const EcoShopPage: React.FC = () => {
  const {
    user,
    shopItems,
    verifyGiftSubscriptions,
    redeemShopItem,
    shopOrders,
    updateShopItem,
    createShopItem,
    deleteShopItem,
    ecoAds,
    adWatchState,
    createEcoAd,
    updateEcoAd,
    updateEcoAdStatus,
    deleteEcoAd,
    recordAdClick,
    uploadMediaFile,
    triggerConfetti,
    triggerHaptic,
    showNotification,
  } = useEco();
  const [activeTabMode, setActiveTabMode] = useState<'catalog' | 'my_orders'>('catalog');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [activeModalItem, setActiveModalItem] = useState<ShopItem | null>(null);
  const [voucherResult, setVoucherResult] = useState<{
    code: string;
    title: string;
    itemImageUrl?: string;
    sponsorName?: string;
  } | null>(null);
  const [pendingVoucher, setPendingVoucher] = useState<{
    code: string;
    title: string;
    itemImageUrl?: string;
    sponsorName?: string;
  } | null>(null);
  const [postPurchaseAd, setPostPurchaseAd] = useState<EcoAd | null>(null);
  const [watchEarnAd, setWatchEarnAd] = useState<EcoAd | null>(null);
  const [voucherQrUrl, setVoucherQrUrl] = useState<string | null>(null);
  const [orderQrMap, setOrderQrMap] = useState<Record<string, string>>({});
  const [copied, setCopied] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Super Admin gift create/edit states
  const [editingItem, setEditingItem] = useState<ShopItem | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [savingLoading, setSavingLoading] = useState(false);
  const [giftTitle, setGiftTitle] = useState('');
  const [giftDescription, setGiftDescription] = useState('');
  const [giftPrice, setGiftPrice] = useState('500');
  const [giftStock, setGiftStock] = useState('20');
  const [giftCategory, setGiftCategory] = useState<ShopItem['category']>('accessories');
  const [giftSponsor, setGiftSponsor] = useState('ECO HERO');
  const [giftImageUrl, setGiftImageUrl] = useState('/assets/eco/gift_leaves.jpg');
  const [giftGate, setGiftGate] = useState<ShopRedemptionGate>({
    mode: 'none',
    adId: 'auto',
    requiredSubscriptions: [],
  });
  const [subscriptionGateItem, setSubscriptionGateItem] = useState<ShopItem | null>(null);
  const [visitedTargetIds, setVisitedTargetIds] = useState<string[]>([]);
  const [verifyingSubscription, setVerifyingSubscription] = useState(false);

  // Super Admin quick ad create/edit modal inside shop
  const [showShopAdModal, setShowShopAdModal] = useState(false);
  const [editingAd, setEditingAd] = useState<EcoAd | null>(null);
  const [adPlacementChoice, setAdPlacementChoice] = useState<'earn_coins' | 'post_purchase' | 'shop_top' | 'home_top'>('earn_coins');
  const [adTitleInput, setAdTitleInput] = useState('');
  const [adSponsorInput, setAdSponsorInput] = useState('');
  const [adSponsorLogoInput, setAdSponsorLogoInput] = useState('');
  const [adHeadlineInput, setAdHeadlineInput] = useState('');
  const [adSubheadlineInput, setAdSubheadlineInput] = useState('');
  const [adImageInput, setAdImageInput] = useState('/assets/schools/eco_courtyard.jpg');
  const [adVideoInput, setAdVideoInput] = useState('');
  const [adCtaTextInput, setAdCtaTextInput] = useState("Batafsil ko'rish");
  const [adCtaInput, setAdCtaInput] = useState('https://t.me/Ecoheros_bot');
  const [adCtaType, setAdCtaType] = useState<'website' | 'telegram_bot' | 'telegram_channel'>('telegram_bot');
  const [adClickOpensLink, setAdClickOpensLink] = useState(true);
  const [adSkipSecondsInput, setAdSkipSecondsInput] = useState('15');
  const [adRewardInput, setAdRewardInput] = useState('100');
  const [uploadingGiftImg, setUploadingGiftImg] = useState(false);
  const [uploadingAdImg, setUploadingAdImg] = useState(false);
  const [uploadingAdLogo, setUploadingAdLogo] = useState(false);
  const [uploadingAdVideo, setUploadingAdVideo] = useState(false);
  const [cooldownTickMs, setCooldownTickMs] = useState(() => Date.now());

  useEffect(() => {
    const nextIso = adWatchState?.nextAvailableAt;
    if (!nextIso) return;
    const targetMs = new Date(nextIso).getTime();
    if (!Number.isFinite(targetMs) || targetMs <= Date.now()) return;
    setCooldownTickMs(Date.now());
    const id = window.setInterval(() => {
      const now = Date.now();
      setCooldownTickMs(now);
      if (now >= targetMs) {
        window.clearInterval(id);
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [adWatchState?.nextAvailableAt]);

  const cooldownRemainingSec = useMemo(() => {
    if (!adWatchState?.nextAvailableAt) {
      return Math.max(0, Number(adWatchState?.remainingSeconds || 0));
    }
    const targetMs = new Date(adWatchState.nextAvailableAt).getTime();
    if (!Number.isFinite(targetMs)) return 0;
    return Math.max(0, Math.ceil((targetMs - cooldownTickMs) / 1000));
  }, [adWatchState?.nextAvailableAt, adWatchState?.remainingSeconds, cooldownTickMs]);

  const handleShopMediaUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'gift_img' | 'ad_img' | 'ad_logo' | 'ad_video'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 80 * 1024 * 1024) {
      showNotification('Fayl hajmi 80 MB dan oshmasligi kerak', 'warning');
      e.target.value = '';
      return;
    }
    if (target === 'gift_img') setUploadingGiftImg(true);
    if (target === 'ad_img') setUploadingAdImg(true);
    if (target === 'ad_logo') setUploadingAdLogo(true);
    if (target === 'ad_video') setUploadingAdVideo(true);
    try {
      const up = await uploadMediaFile(file, file.name);
      if (up.success && up.url) {
        if (target === 'gift_img') setGiftImageUrl(up.url);
        if (target === 'ad_img') setAdImageInput(up.url);
        if (target === 'ad_logo') setAdSponsorLogoInput(up.url);
        if (target === 'ad_video') setAdVideoInput(up.url);
        showNotification(target === 'ad_video' ? 'Video yuklandi!' : 'Rasm yuklandi!', 'success');
      } else {
        showNotification(up.error || 'Yuklashda xatolik', 'warning');
      }
    } finally {
      setUploadingGiftImg(false);
      setUploadingAdImg(false);
      setUploadingAdLogo(false);
      setUploadingAdVideo(false);
      e.target.value = '';
    }
  };

  const myOrders = shopOrders.filter(o => o.userId === user.uid);
  const lastWatchedAdId = adWatchState?.lastWatchedAdId || null;
  const perAdLastClaimedAt = adWatchState?.perAdLastClaimedAt || {};
  const earnCoinAds = useMemo(() => {
    const list = ecoAds.filter(
      a => a.placement === 'earn_coins' && (a.status === 'active' || user.role === 'super_admin')
    );
    return [...list].sort((a, b) => {
      if (a.status === 'active' && b.status !== 'active') return -1;
      if (a.status !== 'active' && b.status === 'active') return 1;
      const aIsLast = lastWatchedAdId && a.id === lastWatchedAdId ? 1 : 0;
      const bIsLast = lastWatchedAdId && b.id === lastWatchedAdId ? 1 : 0;
      if (aIsLast !== bIsLast) return aIsLast - bIsLast;
      const aTime = perAdLastClaimedAt[a.id] ? new Date(perAdLastClaimedAt[a.id]).getTime() : 0;
      const bTime = perAdLastClaimedAt[b.id] ? new Date(perAdLastClaimedAt[b.id]).getTime() : 0;
      return aTime - bTime;
    });
  }, [ecoAds, user.role, lastWatchedAdId, perAdLastClaimedAt]);
  const activePostPurchaseAds = ecoAds.filter(a => a.placement === 'post_purchase' && a.status === 'active');

  const categories = [
    { id: 'all', label: 'Barcha sovg\'alar' },
    { id: 'education', label: 'Smartfon & Ta\'lim' },
    { id: 'accessories', label: 'Sport & Aksessuarlar' },
    { id: 'stationery', label: 'O\'quv qurollari' },
    { id: 'eco_home', label: 'Uy & Ko\'chatlar' },
  ];

  const filteredItems = shopItems.filter(item => {
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    const matchesSearch = item.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
                         item.sponsorName?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const featuredItems = shopItems.slice(0, 3);

  React.useEffect(() => {
    if (!voucherResult?.code) {
      setVoucherQrUrl(null);
      return;
    }
    const url = `${window.location.origin}/voucher/${voucherResult.code}`;
    QRCode.toDataURL(url, { width: 220, margin: 1 })
      .then(setVoucherQrUrl)
      .catch(() => setVoucherQrUrl(null));
  }, [voucherResult?.code]);

  React.useEffect(() => {
    if (activeTabMode !== 'my_orders' || myOrders.length === 0) return;
    let active = true;
    Promise.all(
      myOrders.map(async ord => {
        try {
          const qr = await QRCode.toDataURL(`${window.location.origin}/voucher/${ord.voucherCode}`, {
            width: 140,
            margin: 1,
          });
          return [ord.id, qr] as const;
        } catch {
          return [ord.id, ''] as const;
        }
      })
    ).then(entries => {
      if (!active) return;
      const map: Record<string, string> = {};
      for (const [id, qr] of entries) {
        if (qr) map[id] = qr;
      }
      setOrderQrMap(map);
    });
    return () => {
      active = false;
    };
  }, [activeTabMode, myOrders.length]);

  const openCreateGiftModal = () => {
    setEditingItem(null);
    setGiftTitle('');
    setGiftDescription('');
    setGiftPrice('500');
    setGiftStock('20');
    setGiftCategory('accessories');
    setGiftSponsor('ECO HERO');
    setGiftImageUrl('/assets/eco/gift_leaves.jpg');
    setGiftGate({ mode: 'none', adId: 'auto', requiredSubscriptions: [] });
    setShowCreateModal(true);
  };

  const openEditGiftModal = (item: ShopItem) => {
    setEditingItem(item);
    setGiftTitle(item.title);
    setGiftDescription(item.description || '');
    setGiftPrice(String(item.priceCoins));
    setGiftStock(String(item.stock));
    setGiftCategory(item.category);
    setGiftSponsor(item.sponsorName || 'ECO HERO');
    setGiftImageUrl(item.imageUrl || '');
    setGiftGate(
      item.redemptionGate
        ? {
            mode: item.redemptionGate.mode || 'none',
            adId: item.redemptionGate.adId || 'auto',
            requiredSubscriptions: item.redemptionGate.requiredSubscriptions || [],
          }
        : { mode: 'none', adId: 'auto', requiredSubscriptions: [] }
    );
    setShowCreateModal(true);
  };

  const handleSaveGift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!giftTitle.trim() || savingLoading) return;
    setSavingLoading(true);
    try {
      const payload = {
        title: giftTitle.trim(),
        description: giftDescription.trim() || `${giftTitle.trim()} - ECO HERO rasmiy sovg'asi`,
        priceCoins: Math.max(10, Number(giftPrice) || 500),
        stock: Math.max(0, Number(giftStock) || 10),
        category: giftCategory,
        sponsorName: giftSponsor.trim() || 'ECO HERO',
        imageUrl: giftImageUrl.trim() || '/assets/eco/gift_leaves.jpg',
        redemptionGate: giftGate,
      };
      if (editingItem) {
        const ok = await updateShopItem(editingItem.id, payload);
        if (!ok) return;
      } else {
        const ok = await createShopItem(payload);
        if (!ok) return;
      }
      setShowCreateModal(false);
      setEditingItem(null);
    } finally {
      setSavingLoading(false);
    }
  };

  const openCreateAdModal = (placement: 'earn_coins' | 'post_purchase' | 'shop_top' | 'home_top' = 'earn_coins') => {
    setEditingAd(null);
    setAdPlacementChoice(placement);
    setAdTitleInput('');
    setAdSponsorInput('');
    setAdSponsorLogoInput('');
    setAdHeadlineInput('');
    setAdSubheadlineInput('');
    setAdImageInput('/assets/schools/eco_courtyard.jpg');
    setAdVideoInput('');
    setAdCtaTextInput("Batafsil ko'rish");
    setAdCtaInput('https://t.me/Ecoheros_bot');
    setAdCtaType('telegram_bot');
    setAdClickOpensLink(true);
    setAdSkipSecondsInput('15');
    setAdRewardInput('100');
    setShowShopAdModal(true);
  };

  const openEditAdModal = (ad: EcoAd) => {
    setEditingAd(ad);
    setAdPlacementChoice((['earn_coins', 'post_purchase', 'shop_top', 'home_top'].includes(ad.placement) ? ad.placement : 'earn_coins') as any);
    setAdTitleInput(ad.title || '');
    setAdSponsorInput(ad.sponsorName || '');
    setAdSponsorLogoInput(ad.sponsorLogo || '');
    setAdHeadlineInput(ad.headline || '');
    setAdSubheadlineInput(ad.subheadline || '');
    setAdImageInput(ad.imageUrl || '');
    setAdVideoInput(ad.videoUrl || '');
    setAdCtaTextInput(ad.ctaText || "Batafsil ko'rish");
    setAdCtaInput(ad.ctaUrl || 'https://t.me/Ecoheros_bot');
    setAdCtaType(
      ad.ctaType ||
        (/t\.me\/|telegram\.me\//i.test(String(ad.ctaUrl || ''))
          ? /bot$/i.test(String(ad.ctaUrl || ''))
            ? 'telegram_bot'
            : 'telegram_channel'
          : 'website')
    );
    setAdClickOpensLink(ad.clickOpensLink !== false);
    setAdSkipSecondsInput(String(ad.skipAfterSeconds || 15));
    setAdRewardInput(String(ad.rewardCoins || 100));
    setShowShopAdModal(true);
  };

  const handleSaveShopAd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adTitleInput.trim()) return;
    const cleanSkip = Math.max(5, Math.min(300, Number(adSkipSecondsInput) || 15));
    const cleanReward = Math.max(10, Number(adRewardInput) || 100);
    const cleanLogo = adSponsorLogoInput.trim() || '🌿';
    if (editingAd) {
      const res = await updateEcoAd(editingAd.id, {
        title: adTitleInput.trim(),
        sponsorName: adSponsorInput.trim() || 'Eco Sponsor',
        sponsorLogo: cleanLogo,
        type: adVideoInput.trim() ? 'video' : 'banner',
        placement: adPlacementChoice,
        headline: adHeadlineInput.trim() || adTitleInput.trim(),
        subheadline: adSubheadlineInput.trim(),
        imageUrl: adImageInput.trim() || '/assets/schools/eco_courtyard.jpg',
        videoUrl: adVideoInput.trim() || undefined,
        ctaText: adCtaTextInput.trim() || "Batafsil ko'rish",
        ctaUrl: adCtaInput.trim() || 'https://t.me/Ecoheros_bot',
        ctaType: adCtaType,
        clickOpensLink: adClickOpensLink,
        skipAfterSeconds: cleanSkip,
        rewardCoins: adPlacementChoice === 'earn_coins' ? cleanReward : 0,
      });
      if (res.success) {
        setShowShopAdModal(false);
        setEditingAd(null);
      }
      return;
    }

    const createdOk = await createEcoAd({
      title: adTitleInput.trim(),
      sponsorId: `sp_${Date.now()}`,
      sponsorName: adSponsorInput.trim() || 'Eco Sponsor',
      sponsorLogo: cleanLogo,
      type: adVideoInput.trim() ? 'video' : 'banner',
      placement: adPlacementChoice,
      headline: adHeadlineInput.trim() || adTitleInput.trim(),
      subheadline:
        adSubheadlineInput.trim() ||
        (adPlacementChoice === 'earn_coins'
          ? `${cleanSkip} soniya reklama ko‘rib avtomatik +${cleanReward} EcoCoin oling!`
          : 'Sovg‘a vaucheringiz tayyorlanmoqda'),
      imageUrl: adImageInput.trim() || '/assets/schools/eco_courtyard.jpg',
      videoUrl: adVideoInput.trim() || undefined,
      ctaText: adCtaTextInput.trim() || "Batafsil ko'rish",
      ctaUrl: adCtaInput.trim() || 'https://t.me/Ecoheros_bot',
      ctaType: adCtaType,
      clickOpensLink: adClickOpensLink,
      isVerifiedSponsor: true,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 60 * 86400000).toISOString().split('T')[0],
      status: 'active',
      complianceNote:
        adPlacementChoice === 'earn_coins'
          ? `+${cleanReward} EcoCoin avtomatik mukofot (${cleanSkip}s)`
          : `${cleanSkip} soniyadan keyin o‘tkazib yuborish mumkin`,
      rewardCoins: adPlacementChoice === 'earn_coins' ? cleanReward : 0,
      skipAfterSeconds: cleanSkip,
    });
    if (!createdOk) return;
    setShowShopAdModal(false);
    setAdTitleInput('');
    setAdSponsorLogoInput('');
    setAdHeadlineInput('');
    setAdSubheadlineInput('');
    setAdVideoInput('');
  };

  const executeRedeemWithGate = async (item: ShopItem, confirmedSubscriptionIds: string[]) => {
    const result = await redeemShopItem(item, { confirmedSubscriptionIds });
    if (result.success && result.voucherCode) {
      const wonVoucher = {
        code: result.voucherCode,
        title: item.title,
        itemImageUrl: result.itemImageUrl || item.imageUrl,
        sponsorName: item.sponsorName,
      };
      setActiveModalItem(null);
      setSubscriptionGateItem(null);

      const gate = item.redemptionGate;
      const mode = gate?.mode || 'none';
      const shouldShowAd = mode === 'ad' || mode === 'ad_and_subscription';

      if (shouldShowAd) {
        const specificAd =
          gate?.adId && gate.adId !== 'auto'
            ? ecoAds.find(a => a.id === gate.adId) || null
            : null;
        const rotatedPostAd =
          activePostPurchaseAds.find(a => a.id !== lastWatchedAdId) ||
          activePostPurchaseAds[0] ||
          ecoAds.find(a => a.status === 'active' && a.id !== lastWatchedAdId) ||
          ecoAds.find(a => a.status === 'active') ||
          null;
        const adToPlay = specificAd || rotatedPostAd;

        if (adToPlay) {
          setPendingVoucher(wonVoucher);
          setPostPurchaseAd(adToPlay);
          triggerHaptic('success');
          return;
        }
      }

      setVoucherResult(wonVoucher);
      triggerConfetti();
      triggerHaptic('success');
    } else {
      triggerHaptic('error');
    }
  };

  const handleConfirmRedeem = async () => {
    if (!activeModalItem || savingLoading) return;
    const gate = activeModalItem.redemptionGate;
    const mode = gate?.mode || 'none';
    const requiredSubs = gate?.requiredSubscriptions || [];

    if ((mode === 'subscription' || mode === 'ad_and_subscription') && requiredSubs.length > 0) {
      setVisitedTargetIds([]);
      setSubscriptionGateItem(activeModalItem);
      setActiveModalItem(null);
      return;
    }

    setSavingLoading(true);
    try {
      await executeRedeemWithGate(activeModalItem, []);
    } finally {
      setSavingLoading(false);
    }
  };

  const handleVerifyAndCompleteSubscriptionGate = async () => {
    if (!subscriptionGateItem || verifyingSubscription) return;
    setVerifyingSubscription(true);
    try {
      const verifyRes = await verifyGiftSubscriptions(subscriptionGateItem.id, visitedTargetIds);
      if (!verifyRes.success) {
        triggerHaptic('error');
        return;
      }
      await executeRedeemWithGate(
        subscriptionGateItem,
        verifyRes.verifiedTargetIds || visitedTargetIds
      );
    } finally {
      setVerifyingSubscription(false);
    }
  };

  const handleCopyVoucher = () => {
    if (voucherResult) {
      navigator.clipboard.writeText(voucherResult.code);
      setCopied(true);
      triggerHaptic('light');
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="min-h-screen bg-[#f2f7f4] dark:bg-[#040D0A] text-slate-900 dark:text-white pb-24">
      <div className="max-w-7xl mx-auto px-3 sm:px-4 pt-4 sm:pt-6 space-y-5">
        {/* Compact Duolingo Hero Header */}
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#072419] via-[#051811] to-[#040D0A] border border-emerald-500/30 p-4 sm:p-6 text-white shadow-sm">
          <img
            src={heroEcoForestImg}
            alt="Eko-Bozor"
            className="absolute inset-0 w-full h-full object-cover opacity-15 pointer-events-none"
          />
          <div className="relative z-10 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5 min-w-0">
              <img
                src={homeGiftLeavesImg}
                alt="Eko-Bozor sovg'alari"
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover border border-emerald-400/40 shrink-0 shadow-md"
              />
              <div className="min-w-0">
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-[#00F5A0] uppercase tracking-wider">
                  <Sparkles className="w-3.5 h-3.5" /> Eksklyuziv Eko-Bozor
                </span>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight leading-tight">
                  Eco <span className="text-[#00F5A0]">Shop</span>
                </h1>
                <p className="text-xs text-slate-300 mt-0.5 max-w-xl">
                  EcoCoinlaringizni qimmatbaho sovg&apos;alar va vaucherlarga almashtiring.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3 px-4 py-2.5 bg-[#040D0A]/85 rounded-2xl border border-emerald-500/30 shrink-0">
              <div className="w-9 h-9 rounded-xl bg-amber-500/15 text-amber-400 flex items-center justify-center shrink-0">
                <Coins className="w-5 h-5 fill-amber-400" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Balansingiz</div>
                <div className="text-lg font-black text-amber-400 font-mono tabular-nums leading-none">
                  {user.ecoCoins.toLocaleString()} <span className="text-[11px] font-bold text-slate-400">ECO</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation & Search Bar */}
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 p-3 bg-white dark:bg-[#061812] rounded-2xl border border-slate-200 dark:border-emerald-500/20 shadow-sm">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-[#040D0A] rounded-xl border border-slate-200 dark:border-emerald-500/15">
            <button
              onClick={() => setActiveTabMode('catalog')}
              className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTabMode === 'catalog'
                  ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black'
                  : 'text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Katalog
            </button>
            <button
              onClick={() => setActiveTabMode('my_orders')}
              className={`min-h-[38px] px-4 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer tabular-nums ${
                activeTabMode === 'my_orders'
                  ? 'bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black'
                  : 'text-slate-500 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Buyurtmalarim ({myOrders.length})
            </button>
          </div>

          <div className="flex-1 md:max-w-sm relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              placeholder="Sovg'alarni qidirish..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full min-h-[40px] pl-10 pr-3.5 py-2 bg-slate-100 dark:bg-[#040D0A] rounded-xl text-xs font-semibold outline-none border border-slate-200 dark:border-emerald-500/20 focus:border-emerald-500/60"
            />
          </div>

          {user.role === 'super_admin' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={openCreateGiftModal}
                className="min-h-[40px] px-4 py-2 bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] border-b-[3px] border-emerald-700 rounded-xl text-xs font-black flex items-center gap-1.5 active:translate-y-[1px] transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Sovg&apos;a Qo&apos;shish
              </button>
              <button
                onClick={() => openCreateAdModal('earn_coins')}
                className="min-h-[40px] px-4 py-2 bg-amber-400 hover:bg-amber-300 text-[#04110B] border-b-[3px] border-amber-600 rounded-xl text-xs font-black flex items-center gap-1.5 active:translate-y-[1px] transition-all cursor-pointer"
              >
                <Tv className="w-4 h-4" /> Reklama Qo&apos;shish
              </button>
            </div>
          )}
        </div>

        {/* Watch Ads to Earn +100 EcoCoin Service */}
        {(earnCoinAds.length > 0 || user.role === 'super_admin') && (
          <div className="p-4 sm:p-5 rounded-3xl bg-white dark:bg-[#061812] border border-amber-500/35 shadow-sm space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-2xl bg-amber-400 text-[#04110B] flex items-center justify-center shrink-0 border-b-[3px] border-amber-600">
                  <PlayCircle className="w-6 h-6" />
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-amber-500">
                      <Sparkles className="w-3 h-3" /> Reklama Xizmati
                    </span>
                    {cooldownRemainingSec > 0 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-rose-500/15 border border-rose-500/30 text-rose-400 text-[10px] font-mono font-bold tabular-nums">
                        <Lock className="w-3 h-3" />
                        <span>5 soatlik tanaffus: {formatCooldownHms(cooldownRemainingSec)}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-500 dark:text-[#00F5A0] text-[10px] font-bold">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Har {adWatchState?.cooldownHours || 5} soatda 1 ta reklama · Tayyor</span>
                      </span>
                    )}
                  </div>
                  <h2 className="text-base sm:text-lg font-black tracking-tight">
                    Reklama ko&lsquo;rib EcoCoin ishlab oling
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Har {adWatchState?.cooldownHours || 5} soatda 1 ta reklamani to&lsquo;liq tomosha qiling — yakunida avtomatik EcoCoin tushadi.
                  </p>
                </div>
              </div>
              {user.role === 'super_admin' && (
                <button
                  type="button"
                  onClick={() => openCreateAdModal('earn_coins')}
                  className="min-h-[40px] px-4 py-2 rounded-xl bg-amber-400 hover:bg-amber-300 text-[#04110B] border-b-[3px] border-amber-600 text-xs font-black cursor-pointer shrink-0"
                >
                  + Yangi Reklama
                </button>
              )}
            </div>

            {earnCoinAds.length === 0 ? (
              <p className="text-xs text-slate-500 font-semibold">
                Hozircha faol mukofotli reklamalar mavjud emas. Super Admin reklama qo&lsquo;shishi mumkin.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
                {earnCoinAds.map(ad => {
                  const adSec = ad.skipAfterSeconds || 15;
                  const adDurationLabel = adSec >= 60 && adSec % 60 === 0 ? `${adSec / 60} min` : `${adSec}s`;
                  const isLastWatched = Boolean(lastWatchedAdId && ad.id === lastWatchedAdId);
                  const isCooldownLocked = cooldownRemainingSec > 0;
                  const ctaKind =
                    ad.ctaType ||
                    (/t\.me\/|telegram\.me\//i.test(String(ad.ctaUrl || ''))
                      ? /bot$/i.test(String(ad.ctaUrl || ''))
                        ? 'telegram_bot'
                        : 'telegram_channel'
                      : 'website');
                  const CtaIcon = ctaKind === 'telegram_bot' ? Bot : ctaKind === 'telegram_channel' ? Send : Globe;
                  return (
                    <div
                      key={ad.id}
                      className="rounded-2xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 overflow-hidden shadow-sm flex flex-col"
                    >
                      <div className="relative h-40 bg-[#040D0A] overflow-hidden">
                        <img
                          src={resolveMediaUrl(ad.imageUrl) || heroEcoForestImg}
                          alt={ad.title}
                          loading="lazy"
                          onError={e => {
                            e.currentTarget.src = heroEcoForestImg;
                          }}
                          className="w-full h-full object-cover"
                        />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                        {ad.videoUrl && (
                          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="w-12 h-12 rounded-full bg-black/55 border border-white/25 text-white flex items-center justify-center shadow-lg">
                              <PlayCircle className="w-7 h-7" />
                            </div>
                          </div>
                        )}
                        <div className="absolute top-3 left-3 flex flex-wrap items-center gap-1.5">
                          <div className="px-2.5 py-1 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black uppercase flex items-center gap-1 shadow">
                            <Coins className="w-3 h-3" />
                            <span>+{ad.rewardCoins || 100} EcoCoin</span>
                          </div>
                          {isLastWatched && (
                            <span className="px-2 py-1 rounded-full bg-slate-950/80 border border-white/15 text-slate-200 text-[10px] font-bold">
                              Oxirgi ko&lsquo;rilgan
                            </span>
                          )}
                        </div>
                        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/75 text-white text-[10px] font-mono font-bold">
                          {ad.videoUrl ? 'VIDEO · ' : ''}{adDurationLabel}
                        </div>
                        <div className="absolute bottom-3 left-3 right-3 flex items-center gap-2.5 text-white">
                          <div className="w-9 h-9 rounded-full overflow-hidden bg-emerald-500/20 border border-white/25 flex items-center justify-center shrink-0">
                            {isAdLogoImage(ad.sponsorLogo) ? (
                              <img
                                src={resolveMediaUrl(ad.sponsorLogo || '')}
                                alt={ad.sponsorName}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <span className="text-xs font-black text-emerald-300">
                                {ad.sponsorLogo && ad.sponsorLogo.trim().length <= 3
                                  ? ad.sponsorLogo
                                  : (ad.sponsorName || 'E').slice(0, 1).toUpperCase()}
                              </span>
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-[10px] font-bold uppercase text-emerald-300 truncate">{ad.sponsorName}</div>
                            <div className="text-sm font-black line-clamp-1">{ad.headline}</div>
                          </div>
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between gap-2 mt-auto">
                        <button
                          type="button"
                          disabled={ad.status !== 'active' || isCooldownLocked}
                          onClick={() => setWatchEarnAd(ad)}
                          className={`flex-1 py-2.5 px-3 rounded-xl font-black text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                            isCooldownLocked
                              ? 'bg-slate-200 dark:bg-white/10 text-slate-500 dark:text-slate-400 cursor-not-allowed'
                              : 'bg-gradient-to-r from-amber-500 to-emerald-500 hover:brightness-110 disabled:opacity-40 text-slate-950'
                          }`}
                        >
                          {isCooldownLocked ? (
                            <>
                              <Lock className="w-3.5 h-3.5 shrink-0" />
                              <span className="font-mono tabular-nums">{formatCooldownHms(cooldownRemainingSec)}</span>
                            </>
                          ) : (
                            <>
                              <PlayCircle className="w-4 h-4 shrink-0" />
                              <span>{adDurationLabel} (+{ad.rewardCoins || 100})</span>
                            </>
                          )}
                        </button>
                        {ad.ctaUrl && (
                          <button
                            type="button"
                            onClick={() => {
                              recordAdClick(ad.id);
                              openAdTargetUrl(ad.ctaUrl);
                            }}
                            title={
                              ctaKind === 'telegram_bot'
                                ? 'Telegram Botga o‘tish'
                                : ctaKind === 'telegram_channel'
                                ? 'Telegram Kanalga o‘tish'
                                : 'Saytga o‘tish'
                            }
                            className="p-2.5 rounded-xl bg-sky-500/15 text-sky-400 hover:bg-sky-500 hover:text-slate-950 transition-colors cursor-pointer"
                          >
                            <CtaIcon className="w-4 h-4" />
                          </button>
                        )}
                        {user.role === 'super_admin' && (
                          <>
                            <button
                              type="button"
                              onClick={() => openEditAdModal(ad)}
                              className="p-2.5 rounded-xl bg-amber-500/15 text-amber-500 hover:bg-amber-500 hover:text-slate-950 transition-colors cursor-pointer"
                              title="Reklamani tahrirlash"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => updateEcoAdStatus(ad.id, ad.status === 'active' ? 'paused' : 'active')}
                              className="px-2.5 py-2.5 rounded-xl bg-slate-100 dark:bg-white/10 text-[10px] font-black uppercase cursor-pointer"
                            >
                              {ad.status === 'active' ? 'Pause' : 'Active'}
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteEcoAd(ad.id)}
                              className="p-2.5 rounded-xl bg-rose-500/15 text-rose-500 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
                              title="Reklamani o'chirish"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ECO ADS Banner */}
        <EcoAdBanner placement="shop_top" />

        {/* Content Area */}
        <AnimatePresence mode="wait">
          {activeTabMode === 'catalog' ? (
            <motion.div 
              key="catalog"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-12"
            >
              {/* Category Filter */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`min-h-[40px] px-4 py-2 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 transition-all border ${
                      selectedCategory === cat.id
                        ? 'bg-emerald-500 border-emerald-500 text-slate-950 shadow-sm shadow-emerald-500/20'
                        : 'bg-white dark:bg-[#061812] border-slate-200 dark:border-emerald-500/20 text-slate-600 dark:text-slate-300 hover:border-emerald-500/50 hover:text-emerald-400'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Featured Section — Compact 2-Column Mobile Grid */}
              {selectedCategory === 'all' && !searchQuery && featuredItems.length > 0 && (
                <div className="space-y-3.5">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                      Mashhur sovg'alar
                    </h2>
                    <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 text-xs font-semibold">
                      <Zap className="w-3.5 h-3.5 fill-current" />
                      Top tanlov
                    </span>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-3 gap-2.5 sm:gap-4">
                    {featuredItems.map(item => {
                      const isOutOfStock = (item.stock || 0) <= 0;
                      const canAfford = user.ecoCoins >= item.priceCoins;
                      return (
                        <div
                          key={item.id}
                          className="group flex flex-col h-full rounded-2xl overflow-hidden bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/25 shadow-sm hover:border-emerald-400/60 transition-all"
                        >
                          <div className="relative h-28 sm:h-36 w-full overflow-hidden bg-slate-100 dark:bg-[#040D0A] shrink-0">
                            <img
                              src={resolveMediaUrl(item.imageUrl)}
                              referrerPolicy="no-referrer"
                              className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${isOutOfStock ? 'grayscale opacity-50' : ''}`}
                              alt={item.title}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-transparent to-transparent" />
                            <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-1 text-[10px] font-semibold text-white/95">
                              <span className="truncate">Top · {item.sponsorName}</span>
                              <span className="font-mono tabular-nums shrink-0">{item.stock} ta</span>
                            </div>
                            {user.role === 'super_admin' && (
                              <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditGiftModal(item);
                                  }}
                                  className="w-8 h-8 rounded-lg bg-slate-900/80 text-white hover:bg-amber-500 hover:text-slate-950 flex items-center justify-center transition-colors cursor-pointer"
                                  title="Tahrirlash"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteShopItem(item.id);
                                  }}
                                  className="w-8 h-8 rounded-lg bg-slate-900/80 text-rose-400 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                                  title="O'chirish"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="p-2.5 sm:p-3.5 flex flex-col justify-between flex-1 gap-2">
                            <div className="space-y-1">
                              <h3 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug">
                                {item.title}
                              </h3>
                              {item.redemptionGate?.mode && item.redemptionGate.mode !== 'none' && (
                                <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 truncate">
                                  {item.redemptionGate.mode === 'ad'
                                    ? 'Reklama sharti'
                                    : item.redemptionGate.mode === 'subscription'
                                    ? `Obuna (${item.redemptionGate.requiredSubscriptions?.length || 0})`
                                    : 'Reklama + obuna'}
                                </p>
                              )}
                            </div>

                            <div className="pt-2 border-t border-slate-100 dark:border-emerald-500/15 space-y-2">
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex items-center gap-1 text-amber-500 dark:text-amber-400 font-bold font-mono tabular-nums text-xs sm:text-sm">
                                  <Coins className="w-3.5 h-3.5 fill-current shrink-0" />
                                  <span>{item.priceCoins.toLocaleString()}</span>
                                </div>
                                <span className="text-[10px] text-slate-400 truncate">EcoCoin</span>
                              </div>
                              <button
                                onClick={() => setActiveModalItem(item)}
                                disabled={isOutOfStock || !canAfford}
                                className={`w-full min-h-[40px] sm:min-h-[44px] px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                                  isOutOfStock || !canAfford
                                    ? 'bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed'
                                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 active:scale-[0.98]'
                                }`}
                              >
                                {isOutOfStock ? 'Tugagan' : !canAfford ? 'Yetarli emas' : 'Almashtirish'}
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Full Grid — Compact 2-Column Mobile / 3-4 Column Desktop */}
              <div className="space-y-3.5">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-lg sm:text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                    Barcha sovg'alar
                  </h2>
                  <span className="text-slate-500 dark:text-slate-400 text-xs font-semibold tabular-nums">
                    {filteredItems.length} ta mahsulot
                  </span>
                </div>

                {filteredItems.length === 0 ? (
                  <div className="p-10 rounded-2xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-center space-y-2">
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Mos sovg'a topilmadi</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">Boshqa kategoriya yoki qidiruv so'zini tanlang.</p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-2.5 sm:gap-4">
                    {filteredItems.map(item => {
                      const isOutOfStock = (item.stock || 0) <= 0;
                      const canAfford = user.ecoCoins >= item.priceCoins;

                      return (
                        <motion.div
                          layout
                          key={item.id}
                          className="group flex flex-col h-full bg-white dark:bg-[#061812] rounded-2xl border border-slate-200 dark:border-emerald-500/20 overflow-hidden shadow-sm hover:border-emerald-400/50 transition-all duration-200"
                        >
                          <div className="relative h-28 sm:h-36 w-full overflow-hidden bg-slate-100 dark:bg-[#040D0A] shrink-0">
                            <img
                              src={resolveMediaUrl(item.imageUrl)}
                              referrerPolicy="no-referrer"
                              className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-105 ${isOutOfStock ? 'grayscale opacity-50' : ''}`}
                              alt={item.title}
                            />
                            <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                            <div className="absolute bottom-2 left-2.5 right-2.5 flex items-center justify-between gap-1 text-[10px] font-semibold text-white/95">
                              <span className="truncate">{item.sponsorName}</span>
                              <span className="font-mono tabular-nums shrink-0">
                                {isOutOfStock ? 'Tugagan' : `${item.stock} ta`}
                              </span>
                            </div>
                            {user.role === 'super_admin' && (
                              <div className="absolute top-2 right-2 z-20 flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditGiftModal(item);
                                  }}
                                  className="w-8 h-8 rounded-lg bg-slate-900/80 text-white hover:bg-amber-500 hover:text-slate-950 flex items-center justify-center transition-colors cursor-pointer"
                                  title="Sovg'ani tahrirlash"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    deleteShopItem(item.id);
                                  }}
                                  className="w-8 h-8 rounded-lg bg-slate-900/80 text-rose-400 hover:bg-rose-500 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                                  title="Sovg'ani o'chirish"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            )}
                          </div>

                          <div className="p-2.5 sm:p-3.5 flex flex-col justify-between flex-1 gap-2">
                            <div className="space-y-1">
                              <h4 className="text-xs sm:text-sm font-bold text-slate-900 dark:text-white line-clamp-2 leading-snug">
                                {item.title}
                              </h4>
                              <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1">
                                {item.description}
                              </p>
                              {item.redemptionGate?.mode && item.redemptionGate.mode !== 'none' && (
                                <p className="text-[10px] font-medium text-amber-600 dark:text-amber-400 truncate">
                                  {item.redemptionGate.mode === 'ad'
                                    ? 'Reklama sharti'
                                    : item.redemptionGate.mode === 'subscription'
                                    ? `Obuna (${item.redemptionGate.requiredSubscriptions?.length || 0})`
                                    : `Reklama + obuna (${item.redemptionGate.requiredSubscriptions?.length || 0})`}
                                </p>
                              )}
                            </div>

                            <div className="pt-2 border-t border-slate-100 dark:border-emerald-500/15 space-y-2">
                              <div className="flex items-center justify-between gap-1">
                                <div className="flex items-center gap-1 text-amber-500 dark:text-amber-400 font-bold font-mono tabular-nums text-xs sm:text-sm">
                                  <Coins className="w-3.5 h-3.5 fill-current shrink-0" />
                                  <span>{item.priceCoins.toLocaleString()}</span>
                                </div>
                                <span className="text-[10px] text-slate-400 capitalize truncate">
                                  {item.category}
                                </span>
                              </div>
                              <button
                                disabled={isOutOfStock || !canAfford}
                                onClick={() => setActiveModalItem(item)}
                                className={`w-full min-h-[40px] sm:min-h-[44px] px-2.5 py-2 rounded-xl text-[11px] font-bold transition-all cursor-pointer ${
                                  isOutOfStock || !canAfford
                                    ? 'bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed'
                                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 active:scale-[0.98]'
                                }`}
                              >
                                {isOutOfStock ? 'Tugagan' : !canAfford ? 'Yetarli emas' : 'Almashtirish'}
                              </button>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </div>
            </motion.div>
          ) : (
            <motion.div 
              key="orders"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="space-y-6"
            >
              <div className="flex items-center justify-between">
                 <h2 className="text-2xl font-black uppercase tracking-tighter">Mening Buyurtmalarim</h2>
                 <div className="flex items-center gap-2 text-slate-400 text-[10px] font-black uppercase tracking-widest">
                   <Package className="w-3 h-3" /> {myOrders.length} ta vaucher
                 </div>
              </div>

              {myOrders.length === 0 ? (
                <div className="p-10 text-center bg-white dark:bg-[#061812] rounded-3xl border border-slate-200 dark:border-emerald-500/20 shadow-sm space-y-4">
                   <div className="w-16 h-16 rounded-2xl bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 flex items-center justify-center mx-auto text-emerald-500">
                     <ShoppingBag className="w-8 h-8" />
                   </div>
                   <div className="space-y-1.5">
                     <h3 className="text-lg font-black">Savatchangiz bo'sh</h3>
                     <p className="text-xs text-slate-500 dark:text-slate-400 font-medium max-w-xs mx-auto">Hali hech qanday sovg'a sotib olmadingiz. EcoCoinlarni foydali narsalarga sarflang!</p>
                   </div>
                   <button 
                     onClick={() => setActiveTabMode('catalog')}
                     className="min-h-[44px] px-6 py-2.5 bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black border-b-[3px] border-emerald-700 rounded-xl text-xs cursor-pointer"
                   >
                     Katalogga o'tish
                   </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {myOrders.map(order => (
                    <div key={order.id} className="bg-white dark:bg-[#061812] rounded-2xl border border-slate-200 dark:border-emerald-500/20 p-4 shadow-sm flex flex-col sm:flex-row gap-4">
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="w-20 h-20 rounded-xl bg-slate-100 dark:bg-[#040D0A] overflow-hidden border border-slate-200 dark:border-emerald-500/20">
                          {order.itemImageUrl ? (
                            <img src={resolveMediaUrl(order.itemImageUrl)} alt={order.itemTitle} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-emerald-500">
                              <Package className="w-7 h-7" />
                            </div>
                          )}
                        </div>
                        {orderQrMap[order.id] && (
                          <a
                            href={`/voucher/${order.voucherCode}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="QR kodni ochish"
                            className="w-20 h-20 rounded-xl bg-white p-1.5 border border-slate-200 flex items-center justify-center hover:scale-105 transition-transform"
                          >
                            <img src={orderQrMap[order.id]} alt="QR" className="w-full h-full object-contain" />
                          </a>
                        )}
                      </div>
                      <div className="flex-1 space-y-2.5 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <div className="space-y-0.5 min-w-0">
                             <h4 className="text-sm font-black truncate">{order.itemTitle}</h4>
                             <p className="text-[10px] text-slate-400 font-bold uppercase">{order.sponsorName}</p>
                          </div>
                          <div className={`px-2 py-0.5 rounded-lg text-[10px] font-bold shrink-0 ${
                            order.status === 'delivered' ? 'bg-emerald-500/15 text-emerald-500 border border-emerald-500/25' :
                            order.verifiedBySchoolAdmin ? 'bg-sky-500/15 text-sky-400 border border-sky-500/25' :
                            'bg-amber-500/15 text-amber-400 border border-amber-500/25'
                          }`}>
                            {order.status === 'delivered'
                              ? 'Topshirilgan'
                              : order.verifiedBySchoolAdmin
                              ? 'Maktab admini tasdiqlagan'
                              : order.status}
                          </div>
                        </div>

                        <div className="p-2.5 bg-slate-50 dark:bg-[#040D0A] rounded-xl border border-dashed border-emerald-500/35 flex items-center justify-between gap-2">
                           <div className="min-w-0">
                             <span className="text-[9px] font-bold text-slate-400 uppercase block">Promokod & QR</span>
                             <span className="text-sm font-black font-mono text-emerald-500 dark:text-[#00F5A0] tracking-wider">{order.voucherCode}</span>
                           </div>
                           <div className="flex items-center gap-1 shrink-0">
                             <button 
                               onClick={() => {
                                 navigator.clipboard.writeText(order.voucherCode);
                                 setCopied(true);
                                 setTimeout(() => setCopied(false), 2000);
                               }}
                               className="p-2 hover:bg-emerald-500/10 rounded-xl transition-colors text-emerald-500 cursor-pointer"
                               title="Kodni nusxalash"
                             >
                               <Copy className="w-4 h-4" />
                             </button>
                             <a
                               href={`/voucher/${order.voucherCode}`}
                               target="_blank"
                               rel="noopener noreferrer"
                               className="p-2 hover:bg-sky-500/10 rounded-xl transition-colors text-sky-500"
                               title="Tabrik sahifasini ochish"
                             >
                               <ExternalLink className="w-4 h-4" />
                             </a>
                           </div>
                        </div>

                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 tabular-nums">
                           <div className="flex items-center gap-1">
                             <Coins className="w-3.5 h-3.5 text-amber-400" />
                             <span>{order.priceCoins}</span>
                           </div>
                           <div className="flex items-center gap-1">
                             <Clock className="w-3.5 h-3.5" />
                             <span>{new Date(order.createdAt).toLocaleDateString()}</span>
                           </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Confirmation Modal */}
      <AnimatePresence>
        {activeModalItem && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setActiveModalItem(null)}
              className="absolute inset-0 bg-black/70 backdrop-blur-md"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              className="relative w-full max-w-md bg-white dark:bg-[#061812] rounded-3xl border border-slate-200 dark:border-emerald-500/25 shadow-2xl overflow-hidden"
            >
              <div className="relative aspect-video">
                <img src={resolveMediaUrl(activeModalItem.imageUrl)} className="w-full h-full object-cover" alt="" />
                <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-[#061812] via-transparent to-transparent" />
                <button 
                  onClick={() => setActiveModalItem(null)}
                  className="absolute top-3 right-3 p-2.5 bg-black/40 hover:bg-black/60 backdrop-blur-md rounded-xl text-white transition-all cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-5 sm:p-6 space-y-5">
                <div className="space-y-1.5 text-center">
                  <span className="text-[11px] font-bold text-emerald-500 uppercase tracking-wider">{activeModalItem.sponsorName}</span>
                  <h3 className="text-xl font-black tracking-tight">{activeModalItem.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                    {activeModalItem.redemptionGate?.mode === 'subscription'
                      ? "Ushbu sovg'a promokodini olish uchun belgilangan kanal yoki sahifalarga obuna bo'lish talab etiladi."
                      : activeModalItem.redemptionGate?.mode === 'ad'
                      ? "Ushbu sovg'ani olishda qisqa homiy reklamasi ko'rsatiladi va so'ng promokod beriladi."
                      : activeModalItem.redemptionGate?.mode === 'ad_and_subscription'
                      ? "Ushbu sovg'a uchun obuna shartini bajarib, homiy reklamasini ko'rgach promokod beriladi."
                      : "Ushbu sovg'ani olish uchun balansingizdan tangalar yechiladi va to'g'ridan-to'g'ri vaucher kodi beriladi."}
                  </p>
                </div>

                <div className="flex items-center justify-center gap-6 py-4 border-y border-slate-100 dark:border-emerald-500/15">
                  <div className="text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Narxi</span>
                    <div className="flex items-center gap-1.5 text-amber-500 font-black font-mono tabular-nums">
                      <Coins className="w-4 h-4 fill-amber-500" />
                      <span className="text-xl">{activeModalItem.priceCoins.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="w-px h-10 bg-slate-100 dark:bg-emerald-500/15" />
                  <div className="text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase block mb-0.5">Mavjud</span>
                    <div className="flex items-center gap-1.5 text-emerald-500 font-black font-mono tabular-nums">
                      <Package className="w-4 h-4" />
                      <span className="text-xl">{activeModalItem.stock} ta</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-3">
                   <button 
                     onClick={() => setActiveModalItem(null)}
                     className="flex-1 min-h-[44px] py-2.5 bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 transition-all cursor-pointer"
                   >
                     Bekor qilish
                   </button>
                   <button 
                     onClick={handleConfirmRedeem}
                     className="flex-[2] min-h-[44px] py-2.5 bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black border-b-[3px] border-emerald-700 rounded-xl text-xs transition-all cursor-pointer"
                   >
                     Tasdiqlash & Olish
                   </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Voucher Success Modal with Gift Photo & Scannable QR Code */}
      <AnimatePresence>
        {voucherResult && (
          <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-black/80 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              className="relative w-full max-w-md bg-white dark:bg-[#061812] rounded-3xl border border-slate-200 dark:border-emerald-500/30 p-5 sm:p-6 text-center shadow-2xl space-y-5 my-6"
            >
              <div className="flex items-center justify-center gap-3.5">
                {voucherResult.itemImageUrl && (
                  <img
                    src={resolveMediaUrl(voucherResult.itemImageUrl)}
                    alt={voucherResult.title}
                    className="w-18 h-18 rounded-2xl object-cover border-2 border-emerald-500 shadow-md"
                  />
                )}
                {voucherQrUrl && (
                  <div className="p-2 bg-white rounded-2xl border border-slate-200 shadow-md">
                    <img src={voucherQrUrl} alt="Voucher QR" className="w-18 h-18 object-contain" />
                  </div>
                )}
              </div>

              <div className="space-y-1">
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-500 text-[10px] font-black uppercase">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Bazaga Saqlandi
                </span>
                <h3 className="text-xl sm:text-2xl font-black tracking-tight">Muborak Bo'lsin!</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                  <b>{voucherResult.title}</b> sovg'asi uchun maxsus promokod va QR vaucheringiz yaratildi.
                </p>
              </div>

              <div className="p-4 bg-slate-50 dark:bg-[#040D0A] rounded-2xl border-2 border-dashed border-emerald-500/35 space-y-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Promokod</span>
                <div className="text-2xl font-black font-mono text-emerald-500 dark:text-[#00F5A0] tracking-widest uppercase">
                  {voucherResult.code}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={handleCopyVoucher}
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-4 py-2 bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] text-xs font-black rounded-xl border-b-[2px] border-emerald-700 cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    <span>{copied ? 'Nusxalandi!' : 'Kodni nusxalash'}</span>
                  </button>
                  <a
                    href={`/voucher/${voucherResult.code}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 min-h-[38px] px-3.5 py-2 bg-sky-500/15 text-sky-400 text-xs font-bold rounded-xl hover:bg-sky-500/25"
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    <span>QR Tabrikni Ochish</span>
                  </a>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed max-w-sm mx-auto">
                Sovg'ani olish uchun ushbu promokod yoki QR kodni maktab adminiga ko'rsating — admin bazadan tekshirib Super Adminga yuboradi.
              </p>

              <button
                onClick={() => setVoucherResult(null)}
                className="w-full min-h-[44px] py-2.5 bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/25 text-slate-900 dark:text-white rounded-xl text-xs font-black cursor-pointer"
              >
                Yopish
              </button>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Post-Purchase 15s Skippable Ad Modal */}
      {postPurchaseAd && pendingVoucher && (
        <AdPlayerModal
          ad={postPurchaseAd}
          mode="post_purchase"
          onComplete={() => {
            setVoucherResult(pendingVoucher);
            setPendingVoucher(null);
            setPostPurchaseAd(null);
            triggerConfetti();
            triggerHaptic('success');
          }}
        />
      )}

      {/* Watch Ad to Earn +100 EcoCoin Modal */}
      {watchEarnAd && (
        <AdPlayerModal
          ad={watchEarnAd}
          mode="earn_coins"
          onComplete={res => {
            setWatchEarnAd(null);
            if (res?.awardedCoins) {
              triggerConfetti();
              triggerHaptic('success');
            }
          }}
          onClose={() => setWatchEarnAd(null)}
        />
      )}

      {/* Mandatory Subscription Gate Modal (Before Deducting Coins / Showing Promo Code) */}
      <AnimatePresence>
        {subscriptionGateItem && (
          <div className="fixed inset-0 z-[105] flex items-center justify-center p-4 overflow-y-auto">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => !verifyingSubscription && setSubscriptionGateItem(null)}
              className="absolute inset-0 bg-black/70 backdrop-blur-xl"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 16 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 16 }}
              className="relative w-full max-w-lg bg-white dark:bg-[#061812] rounded-3xl border border-slate-200 dark:border-emerald-500/25 p-5 sm:p-6 shadow-2xl space-y-4 my-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-[#00F5A0]">
                    Majburiy obuna sharti
                  </span>
                  <h3 className="text-lg font-black tracking-tight text-slate-900 dark:text-white">
                    {subscriptionGateItem.title}
                  </h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Promokodni ochish uchun quyidagi manzillarga o&apos;tib obuna bo&apos;ling va so&apos;ng tekshirish tugmasini bosing.
                  </p>
                </div>
                <button
                  type="button"
                  disabled={verifyingSubscription}
                  onClick={() => setSubscriptionGateItem(null)}
                  className="p-2 text-slate-400 hover:text-slate-600 rounded-xl cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2.5">
                {(subscriptionGateItem.redemptionGate?.requiredSubscriptions || []).map(target => {
                  const visited = visitedTargetIds.includes(target.id);
                  const platformIcon =
                    target.platform === 'telegram_channel' ? (
                      <Send className="w-4 h-4 text-sky-500 shrink-0" />
                    ) : target.platform === 'telegram_bot' ? (
                      <Bot className="w-4 h-4 text-emerald-500 shrink-0" />
                    ) : target.platform === 'instagram' ? (
                      <Instagram className="w-4 h-4 text-pink-500 shrink-0" />
                    ) : (
                      <Globe className="w-4 h-4 text-amber-500 shrink-0" />
                    );
                  const platformLabel =
                    target.platform === 'telegram_channel'
                      ? 'Telegram kanal'
                      : target.platform === 'telegram_bot'
                      ? 'Telegram bot'
                      : target.platform === 'instagram'
                      ? 'Instagram'
                      : 'Veb-sayt';

                  return (
                    <div
                      key={target.id}
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        {platformIcon}
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                            {target.title}
                          </div>
                          <div className="text-[11px] text-slate-400 truncate">
                            {platformLabel} · {target.handle || target.url}
                          </div>
                        </div>
                      </div>
                      <a
                        href={normalizeAdTargetUrl(target.url)}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={e => {
                          setVisitedTargetIds(prev => (prev.includes(target.id) ? prev : [...prev, target.id]));
                          if (isInsideTelegramWebApp()) {
                            e.preventDefault();
                            openAdTargetUrl(target.url);
                          }
                        }}
                        className={`min-h-[38px] px-3.5 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors no-underline ${
                          visited
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-[#00F5A0] border border-emerald-500/30'
                            : 'bg-sky-600 text-white hover:bg-sky-500'
                        }`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{visited ? "O'tildi" : "Obuna bo'lish"}</span>
                      </a>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={verifyingSubscription}
                  onClick={() => setSubscriptionGateItem(null)}
                  className="flex-1 min-h-[44px] py-2.5 bg-slate-100 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  disabled={verifyingSubscription}
                  onClick={handleVerifyAndCompleteSubscriptionGate}
                  className="flex-[2] min-h-[44px] py-2.5 bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black border-b-[3px] border-emerald-700 rounded-xl text-xs cursor-pointer disabled:opacity-50"
                >
                  {verifyingSubscription ? 'Tekshirilmoqda...' : 'Obunani tekshirish & Olish'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Super Admin Create / Edit Gift Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#061812] w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 dark:border-emerald-500/25 p-5 sm:p-6 space-y-4 shadow-2xl my-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black">
                {editingItem ? "Sovg'ani Tahrirlash" : "Yangi Sovg'a Qo'shish"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowCreateModal(false);
                  setEditingItem(null);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveGift} className="space-y-3">
              <input
                type="text"
                required
                placeholder="Sovg'a nomi (masalan: Smart Soat)"
                value={giftTitle}
                onChange={e => setGiftTitle(e.target.value)}
                className="w-full min-h-[40px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
              />
              <textarea
                rows={2}
                placeholder="Tavsifi"
                value={giftDescription}
                onChange={e => setGiftDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  required
                  placeholder="Narxi (EcoCoin)"
                  value={giftPrice}
                  onChange={e => setGiftPrice(e.target.value)}
                  className="w-full min-h-[40px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                />
                <input
                  type="number"
                  required
                  placeholder="Zaxira soni"
                  value={giftStock}
                  onChange={e => setGiftStock(e.target.value)}
                  className="w-full min-h-[40px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                />
              </div>
              <select
                value={giftCategory}
                onChange={e => setGiftCategory(e.target.value as ShopItem['category'])}
                className="w-full min-h-[40px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
              >
                <option value="accessories">Sport & Aksessuarlar</option>
                <option value="stationery">O'quv qurollari</option>
                <option value="eco_home">Uy & Ko'chatlar</option>
                <option value="education">Smartfon & Ta'lim</option>
              </select>
              <input
                type="text"
                placeholder="Homiy nomi"
                value={giftSponsor}
                onChange={e => setGiftSponsor(e.target.value)}
                className="w-full min-h-[40px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
              />
              <div className="flex items-center gap-3">
                <label className="flex-1 min-h-[40px] px-3.5 py-2.5 rounded-xl bg-emerald-500/10 border border-dashed border-emerald-500/40 text-emerald-600 dark:text-[#00F5A0] text-xs font-bold flex items-center justify-center gap-2 cursor-pointer">
                  <ImageIcon className="w-4 h-4" />
                  <span>{uploadingGiftImg ? 'Rasm yuklanmoqda...' : 'Qurilmadan rasm yuklash'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => handleShopMediaUpload(e, 'gift_img')}
                    className="hidden"
                  />
                </label>
                {giftImageUrl && (
                  <img
                    src={resolveMediaUrl(giftImageUrl)}
                    alt="Preview"
                    className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-emerald-500/25 shrink-0"
                  />
                )}
              </div>
              <details className="text-[11px] text-slate-400">
                <summary className="cursor-pointer">Yoki rasm havolasi (ixtiyoriy)</summary>
                <input
                  type="text"
                  placeholder="Rasm URL (/assets/... yoki /uploads/...)"
                  value={giftImageUrl}
                  onChange={e => setGiftImageUrl(e.target.value)}
                  className="mt-2 w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                />
              </details>
              <GiftGateConfigEditor
                gate={giftGate}
                onChange={setGiftGate}
                ecoAds={ecoAds}
              />
              <button
                type="submit"
                disabled={savingLoading || uploadingGiftImg}
                className="w-full min-h-[44px] py-2.5 bg-gradient-to-r from-[#00F5A0] to-[#10B981] text-[#04110B] font-black border-b-[3px] border-emerald-700 rounded-xl text-xs cursor-pointer disabled:opacity-50"
              >
                {savingLoading ? 'Saqlanmoqda...' : editingItem ? 'Yangilash' : "Sovg'ani Saqlash"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Super Admin Quick Ad Create / Edit Modal */}
      {showShopAdModal && (
        <div className="fixed inset-0 z-[120] bg-black/80 backdrop-blur-sm flex items-start sm:items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#061812] w-full max-w-lg max-h-[92dvh] overflow-y-auto rounded-3xl border border-slate-200 dark:border-emerald-500/25 p-5 sm:p-6 space-y-4 shadow-2xl my-3 sm:my-6">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black">
                {editingAd ? 'Reklamani Tahrirlash' : "Super Admin Reklama Qo'shish"}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setShowShopAdModal(false);
                  setEditingAd(null);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <form onSubmit={handleSaveShopAd} className="space-y-3">
              <select
                value={adPlacementChoice}
                onChange={e => setAdPlacementChoice(e.target.value as any)}
                className="w-full min-h-[40px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
              >
                <option value="earn_coins">Reklama ko'rib EcoCoin olish</option>
                <option value="post_purchase">Sovg'a sotib olgandan keyin (Skip)</option>
                <option value="shop_top">Do'kon tepa banneri</option>
                <option value="home_top">Bosh sahifa tepa banneri</option>
              </select>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <input
                  type="text"
                  required
                  placeholder="Reklama nomi"
                  value={adTitleInput}
                  onChange={e => setAdTitleInput(e.target.value)}
                  className="w-full min-h-[40px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                />
                <input
                  type="text"
                  placeholder="Homiy / Kompaniya nomi"
                  value={adSponsorInput}
                  onChange={e => setAdSponsorInput(e.target.value)}
                  className="w-full min-h-[40px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                />
              </div>
              <input
                type="text"
                placeholder="Asosiy sarlavha"
                value={adHeadlineInput}
                onChange={e => setAdHeadlineInput(e.target.value)}
                className="w-full min-h-[40px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
              />
              <input
                type="text"
                placeholder="Qo'shimcha matn (ixtiyoriy)"
                value={adSubheadlineInput}
                onChange={e => setAdSubheadlineInput(e.target.value)}
                className="w-full min-h-[40px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
              />
              {/* Primary Ad Cover / Screen Image (Visible outside before pressing Watch Video) */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#040D0A] border border-emerald-500/30 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
                    Reklama ekran rasmi (Videodan oldin tashqaridan ko&apos;rinadi)
                  </span>
                  {adImageInput && (
                    <button
                      type="button"
                      onClick={() => setAdImageInput('/assets/schools/eco_courtyard.jpg')}
                      className="text-[10px] font-bold text-slate-400 hover:text-emerald-500 cursor-pointer"
                    >
                      Standart rasm
                    </button>
                  )}
                </div>
                <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20">
                  <img
                    src={resolveMediaUrl(adImageInput) || heroEcoForestImg}
                    onError={e => {
                      e.currentTarget.src = heroEcoForestImg;
                    }}
                    alt="Reklama ekran rasmi"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="grid grid-cols-2 gap-2.5">
                  <label className="px-3 py-2.5 rounded-xl bg-sky-500/15 border border-dashed border-sky-500/50 text-sky-600 dark:text-sky-300 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                    <ImageIcon className="w-4 h-4 shrink-0" />
                    <span>{uploadingAdImg ? 'Yuklanmoqda...' : 'Ekran rasmini yuklash'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleShopMediaUpload(e, 'ad_img')}
                      className="hidden"
                    />
                  </label>
                  <label className="px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-dashed border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                    <Film className="w-4 h-4 shrink-0" />
                    <span>{uploadingAdVideo ? 'Yuklanmoqda...' : adVideoInput ? 'Video almashtirish' : 'Video yuklash'}</span>
                    <input
                      type="file"
                      accept="video/*"
                      onChange={e => handleShopMediaUpload(e, 'ad_video')}
                      className="hidden"
                    />
                  </label>
                </div>
                {adVideoInput && (
                  <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/25 text-[11px] font-bold">
                    <span className="truncate text-emerald-600 dark:text-emerald-400">
                      Video biriktirildi: {adVideoInput}
                    </span>
                    <button
                      type="button"
                      onClick={() => setAdVideoInput('')}
                      className="text-rose-500 cursor-pointer shrink-0"
                    >
                      O&apos;chirish
                    </button>
                  </div>
                )}
              </div>

              {/* Secondary Optional Small Sponsor Logo */}
              <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    {isAdLogoImage(adSponsorLogoInput) ? (
                      <img
                        src={resolveMediaUrl(adSponsorLogoInput)}
                        alt="Homiy belgisi"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-black text-emerald-500">
                        {adSponsorLogoInput && adSponsorLogoInput.trim().length <= 3
                          ? adSponsorLogoInput
                          : (adSponsorInput || adTitleInput || 'E').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <label className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-slate-600 dark:text-slate-300 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                    <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{uploadingAdLogo ? 'Yuklanmoqda...' : 'Kichik homiy belgisi (ixtiyoriy)'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleShopMediaUpload(e, 'ad_logo')}
                      className="hidden"
                    />
                  </label>
                  {isAdLogoImage(adSponsorLogoInput) && (
                    <button
                      type="button"
                      onClick={() => setAdSponsorLogoInput('')}
                      className="px-2.5 py-2 rounded-xl bg-rose-500/10 text-rose-500 text-[10px] font-bold cursor-pointer"
                    >
                      O&lsquo;chirish
                    </button>
                  )}
                </div>
              </div>

              {/* Duration Presets (15s, 30s, 60s, 90s, 120s + custom) */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 space-y-2">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  <span className="inline-flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    Reklama davomiyligi (soniya)
                  </span>
                  <span className="font-mono text-amber-500">{adSkipSecondsInput || 15}s</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {[15, 30, 60, 90, 120].map(sec => (
                    <button
                      type="button"
                      key={sec}
                      onClick={() => setAdSkipSecondsInput(String(sec))}
                      className={`px-2.5 py-1 rounded-lg font-mono font-bold text-[11px] cursor-pointer ${
                        Number(adSkipSecondsInput) === sec
                          ? 'bg-amber-400 text-[#04110B]'
                          : 'bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-slate-500 dark:text-slate-300'
                      }`}
                    >
                      {sec >= 60 ? `${sec / 60} min` : `${sec}s`}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={5}
                    max={300}
                    value={adSkipSecondsInput}
                    onChange={e => setAdSkipSecondsInput(e.target.value)}
                    placeholder="soniya"
                    className="w-20 px-2.5 py-1 rounded-lg bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-mono font-bold outline-none"
                  />
                </div>
              </div>

              {/* Destination Link Type */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 space-y-2.5">
                <div className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                  Reklama bosilganda qayerga kirsin?
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
                        onClick={() => setAdCtaType(kind.id)}
                        className={`py-2 px-2 rounded-xl text-[11px] font-bold flex items-center justify-center gap-1 border cursor-pointer ${
                          adCtaType === kind.id
                            ? 'bg-emerald-500/15 border-emerald-500 text-emerald-500'
                            : 'bg-white dark:bg-[#061812] border-slate-200 dark:border-emerald-500/20 text-slate-500'
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
                    placeholder="Tugma matni"
                    value={adCtaTextInput}
                    onChange={e => setAdCtaTextInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                  />
                  <input
                    type="text"
                    placeholder={
                      adCtaType === 'telegram_bot'
                        ? 'https://t.me/my_bot'
                        : adCtaType === 'telegram_channel'
                        ? 'https://t.me/my_channel'
                        : 'https://sayt.uz'
                    }
                    value={adCtaInput}
                    onChange={e => setAdCtaInput(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-white dark:bg-[#061812] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                  />
                </div>
                <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={adClickOpensLink}
                    onChange={e => setAdClickOpensLink(e.target.checked)}
                    className="accent-emerald-500"
                  />
                  <span>Reklamani bosganda to'g'ridan-to'g'ri havolaga kirsin</span>
                </label>
              </div>

              <details className="text-[11px] text-slate-400">
                <summary className="cursor-pointer">Yoki rasm/video URL kiritish (ixtiyoriy)</summary>
                <div className="mt-2 space-y-2">
                  <input
                    type="text"
                    placeholder="Rasm URL (/assets/... yoki /uploads/...)"
                    value={adImageInput}
                    onChange={e => setAdImageInput(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Video URL (ixtiyoriy mp4)"
                    value={adVideoInput}
                    onChange={e => setAdVideoInput(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                  />
                </div>
              </details>
              {adPlacementChoice === 'earn_coins' && (
                <input
                  type="number"
                  placeholder="Mukofot (EcoCoin)"
                  value={adRewardInput}
                  onChange={e => setAdRewardInput(e.target.value)}
                  className="w-full min-h-[40px] px-3.5 py-2.5 rounded-xl bg-slate-50 dark:bg-[#040D0A] border border-slate-200 dark:border-emerald-500/20 text-xs font-bold outline-none"
                />
              )}
              <button
                type="submit"
                disabled={uploadingAdImg || uploadingAdLogo || uploadingAdVideo}
                className="w-full min-h-[44px] py-2.5 bg-amber-400 hover:bg-amber-300 text-[#04110B] font-black border-b-[3px] border-amber-600 rounded-xl text-xs cursor-pointer disabled:opacity-50"
              >
                {editingAd ? 'Saqlash' : 'Reklamani Joylash'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
