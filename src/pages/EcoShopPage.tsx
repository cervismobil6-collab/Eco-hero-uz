import React, { useState } from 'react';
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
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import QRCode from 'qrcode';
import { useEco } from '../context/EcoContext';
import { EcoAd, ShopItem, ShopRedemptionGate } from '../types/eco';
import { EcoAdBanner } from '../components/EcoAdBanner';
import { AdPlayerModal } from '../components/AdPlayerModal';
import { GiftGateConfigEditor } from '../components/shop/GiftGateConfigEditor';
import { resolveMediaUrl, openAdTargetUrl } from '../utils/api';

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
  const [giftImageUrl, setGiftImageUrl] = useState(
    'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=600'
  );
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
  const [adHeadlineInput, setAdHeadlineInput] = useState('');
  const [adSubheadlineInput, setAdSubheadlineInput] = useState('');
  const [adImageInput, setAdImageInput] = useState(
    'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1000&q=80'
  );
  const [adVideoInput, setAdVideoInput] = useState('');
  const [adCtaTextInput, setAdCtaTextInput] = useState("Batafsil ko'rish");
  const [adCtaInput, setAdCtaInput] = useState('https://t.me/Ecoheros_bot');
  const [adCtaType, setAdCtaType] = useState<'website' | 'telegram_bot' | 'telegram_channel'>('telegram_bot');
  const [adClickOpensLink, setAdClickOpensLink] = useState(true);
  const [adSkipSecondsInput, setAdSkipSecondsInput] = useState('15');
  const [adRewardInput, setAdRewardInput] = useState('100');
  const [uploadingGiftImg, setUploadingGiftImg] = useState(false);
  const [uploadingAdImg, setUploadingAdImg] = useState(false);
  const [uploadingAdVideo, setUploadingAdVideo] = useState(false);

  const handleShopMediaUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'gift_img' | 'ad_img' | 'ad_video'
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
    if (target === 'ad_video') setUploadingAdVideo(true);
    try {
      const up = await uploadMediaFile(file, file.name);
      if (up.success && up.url) {
        if (target === 'gift_img') setGiftImageUrl(up.url);
        if (target === 'ad_img') setAdImageInput(up.url);
        if (target === 'ad_video') setAdVideoInput(up.url);
        showNotification(target === 'ad_video' ? 'Video yuklandi!' : 'Rasm yuklandi!', 'success');
      } else {
        showNotification(up.error || 'Yuklashda xatolik', 'warning');
      }
    } finally {
      setUploadingGiftImg(false);
      setUploadingAdImg(false);
      setUploadingAdVideo(false);
      e.target.value = '';
    }
  };

  const myOrders = shopOrders.filter(o => o.userId === user.uid);
  const earnCoinAds = ecoAds.filter(
    a => a.placement === 'earn_coins' && (a.status === 'active' || user.role === 'super_admin')
  );
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
    setGiftImageUrl('https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=600');
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
        imageUrl:
          giftImageUrl.trim() ||
          'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=600',
        redemptionGate: giftGate,
      };
      if (editingItem) {
        const ok = await updateShopItem(editingItem.id, payload);
        if (!ok) return;
      } else {
        await createShopItem(payload);
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
    setAdHeadlineInput('');
    setAdSubheadlineInput('');
    setAdImageInput('https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1000&q=80');
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
    if (editingAd) {
      const res = await updateEcoAd(editingAd.id, {
        title: adTitleInput.trim(),
        sponsorName: adSponsorInput.trim() || 'Eco Sponsor',
        type: adVideoInput.trim() ? 'video' : 'banner',
        placement: adPlacementChoice,
        headline: adHeadlineInput.trim() || adTitleInput.trim(),
        subheadline: adSubheadlineInput.trim(),
        imageUrl:
          adImageInput.trim() ||
          'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1000&q=80',
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

    await createEcoAd({
      title: adTitleInput.trim(),
      sponsorId: `sp_${Date.now()}`,
      sponsorName: adSponsorInput.trim() || 'Eco Sponsor',
      sponsorLogo: '🌿',
      type: adVideoInput.trim() ? 'video' : 'banner',
      placement: adPlacementChoice,
      headline: adHeadlineInput.trim() || adTitleInput.trim(),
      subheadline:
        adSubheadlineInput.trim() ||
        (adPlacementChoice === 'earn_coins'
          ? `${cleanSkip} soniya reklama ko‘rib avtomatik +${cleanReward} EcoCoin oling!`
          : 'Sovg‘a vaucheringiz tayyorlanmoqda'),
      imageUrl:
        adImageInput.trim() ||
        'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1000&q=80',
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
    setShowShopAdModal(false);
    setAdTitleInput('');
    setAdHeadlineInput('');
    setAdSubheadlineInput('');
    setAdVideoInput('');
    showNotification('Reklama muvaffaqiyatli qo‘shildi!', 'success');
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
        const adToPlay =
          specificAd ||
          activePostPurchaseAds[0] ||
          ecoAds.find(a => a.status === 'active') ||
          null;

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
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] text-slate-900 dark:text-white pb-24">
      {/* Cinematic Hero Section */}
      <div className="relative h-[400px] w-full overflow-hidden">
        <div className="absolute inset-0 z-0">
          <img 
            src="https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=2000&q=80" 
            className="w-full h-full object-cover opacity-60 dark:opacity-40 scale-110"
            alt="Eco Shop Hero"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-slate-50/0 via-slate-50/50 to-slate-50 dark:from-[#020617]/0 dark:via-[#020617]/50 dark:to-[#020617]" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 h-full flex flex-col justify-center space-y-6 pt-12">
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-500 text-[10px] font-black uppercase tracking-widest"
          >
            <Sparkles className="w-3 h-3" /> Eksklyuziv Eko-Bozor
          </motion.div>
          
          <div className="space-y-2">
            <motion.h1 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.1 }}
              className="text-5xl md:text-7xl font-black uppercase tracking-tighter leading-none"
            >
              Eco <span className="text-emerald-500">Shop</span>
            </motion.h1>
            <motion.p 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
              className="text-lg text-slate-600 dark:text-slate-400 font-medium max-w-2xl"
            >
              Ekologik faollik va daraxt ekish evaziga yig'ilgan EcoCoinlarni smartfon, planshet va boshqa qimmatbaho sovg'alarga almashtiring.
            </motion.p>
          </div>

          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="flex items-center gap-4"
          >
            <div className="flex items-center gap-3 px-6 py-3 bg-white dark:bg-white/5 backdrop-blur-xl rounded-[24px] border border-slate-200 dark:border-white/10 shadow-xl">
              <div className="w-10 h-10 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center">
                <Coins className="w-6 h-6 fill-amber-500" />
              </div>
              <div>
                <div className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Sizning Balansingiz</div>
                <div className="text-xl font-black text-amber-500 font-mono tabular-nums leading-none">
                  {user.ecoCoins} <span className="text-xs font-bold text-slate-500 ml-1">EcoCoin</span>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 -mt-12 relative z-20 space-y-12">
        {/* Navigation & Search Bar */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-6 p-4 bg-white dark:bg-[#0f172a] rounded-[32px] border border-slate-200 dark:border-white/5 shadow-2xl">
          <div className="flex items-center gap-1 p-1 bg-slate-100 dark:bg-white/5 rounded-2xl border border-slate-200 dark:border-white/5">
            <button
              onClick={() => setActiveTabMode('catalog')}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTabMode === 'catalog' 
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' 
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Katalog
            </button>
            <button
              onClick={() => setActiveTabMode('my_orders')}
              className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                activeTabMode === 'my_orders' 
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20' 
                  : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Buyurtmalarim
            </button>
          </div>

          <div className="flex-1 max-w-md relative group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-emerald-500 transition-colors" />
            <input 
              type="text"
              placeholder="Sovg'alarni qidirish..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-11 pr-4 py-3 bg-slate-100 dark:bg-white/5 rounded-2xl text-xs font-bold outline-none border border-transparent focus:border-emerald-500/50 transition-all"
            />
          </div>

          {user.role === 'super_admin' && (
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={openCreateGiftModal}
                className="px-5 py-3 bg-slate-900 dark:bg-white text-white dark:text-slate-950 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-xl cursor-pointer"
              >
                <Plus className="w-4 h-4" /> Sovg'a Qo'shish
              </button>
              <button
                onClick={() => openCreateAdModal('earn_coins')}
                className="px-5 py-3 bg-amber-500 text-slate-950 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 hover:scale-105 active:scale-95 transition-all shadow-xl cursor-pointer"
              >
                <Tv className="w-4 h-4" /> Reklama Qo'shish
              </button>
            </div>
          )}
        </div>

        {/* Watch Ads to Earn +100 EcoCoin Service */}
        {(earnCoinAds.length > 0 || user.role === 'super_admin') && (
          <div className="p-6 sm:p-8 rounded-[32px] bg-gradient-to-br from-amber-500/15 via-emerald-500/10 to-slate-900/5 dark:to-[#0f172a] border border-amber-500/30 shadow-xl space-y-5">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-amber-500 text-slate-950 flex items-center justify-center shadow-lg shadow-amber-500/20 shrink-0">
                  <PlayCircle className="w-7 h-7" />
                </div>
                <div>
                  <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-amber-500">
                    <Sparkles className="w-3.5 h-3.5" /> Reklama Xizmati
                  </div>
                  <h2 className="text-xl sm:text-2xl font-black uppercase tracking-tight">
                    Reklama ko&lsquo;rib EcoCoin ishlab oling
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    Har bir tasdiqlangan reklamani belgilangan vaqt davomida tomosha qiling — yakunida hisobingizga avtomatik EcoCoin tushadi.
                  </p>
                </div>
              </div>
              {user.role === 'super_admin' && (
                <button
                  type="button"
                  onClick={() => openCreateAdModal('earn_coins')}
                  className="px-4 py-2.5 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-slate-950 text-[10px] font-black uppercase tracking-widest cursor-pointer shrink-0"
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
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {earnCoinAds.map(ad => {
                  const adSec = ad.skipAfterSeconds || 15;
                  const adDurationLabel = adSec >= 60 && adSec % 60 === 0 ? `${adSec / 60} min` : `${adSec}s`;
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
                      className="rounded-3xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-white/10 overflow-hidden shadow-md flex flex-col"
                    >
                      <div className="relative h-40 bg-slate-900 overflow-hidden">
                        {ad.videoUrl ? (
                          <video
                            src={resolveMediaUrl(ad.videoUrl)}
                            poster={resolveMediaUrl(ad.imageUrl)}
                            muted
                            playsInline
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <img src={resolveMediaUrl(ad.imageUrl)} alt={ad.title} className="w-full h-full object-cover" />
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                        <div className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-amber-500 text-slate-950 text-[10px] font-black uppercase flex items-center gap-1 shadow">
                          <Coins className="w-3 h-3" />
                          <span>+{ad.rewardCoins || 100} EcoCoin</span>
                        </div>
                        <div className="absolute top-3 right-3 px-2.5 py-1 rounded-full bg-black/75 text-white text-[10px] font-mono font-bold">
                          {ad.videoUrl ? 'VIDEO · ' : ''}{adDurationLabel}
                        </div>
                        <div className="absolute bottom-3 left-3 right-3 text-white">
                          <div className="text-[10px] font-bold uppercase text-emerald-300">{ad.sponsorName}</div>
                          <div className="text-sm font-black line-clamp-1">{ad.headline}</div>
                        </div>
                      </div>
                      <div className="p-4 flex items-center justify-between gap-2 mt-auto">
                        <button
                          type="button"
                          disabled={ad.status !== 'active'}
                          onClick={() => setWatchEarnAd(ad)}
                          className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-emerald-500 hover:brightness-110 disabled:opacity-40 text-slate-950 font-black text-[11px] uppercase tracking-wider flex items-center justify-center gap-1.5 cursor-pointer"
                        >
                          <PlayCircle className="w-4 h-4 shrink-0" />
                          <span>{adDurationLabel} (+{ad.rewardCoins || 100})</span>
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
              <div className="flex items-center gap-2 overflow-x-auto pb-4 scrollbar-hide">
                {categories.map(cat => (
                  <button
                    key={cat.id}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-5 py-2.5 rounded-full text-[10px] font-black uppercase tracking-widest whitespace-nowrap transition-all border-2 ${
                      selectedCategory === cat.id
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                        : 'bg-white dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-500 dark:text-slate-400 hover:border-emerald-500/50 hover:text-emerald-500'
                    }`}
                  >
                    {cat.label}
                  </button>
                ))}
              </div>

              {/* Featured Section */}
              {selectedCategory === 'all' && !searchQuery && (
                <div className="space-y-6">
                  <div className="flex items-center justify-between">
                    <h2 className="text-2xl font-black uppercase tracking-tighter">Mashhur Sovg'alar</h2>
                    <div className="flex items-center gap-2 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
                      <Zap className="w-3 h-3 fill-emerald-500" /> Tez sotilmoqda
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    {featuredItems.map(item => (
                      <div key={item.id} className="group relative aspect-[4/5] rounded-[40px] overflow-hidden border border-slate-200 dark:border-white/10 shadow-2xl">
                        <img src={resolveMediaUrl(item.imageUrl)} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" alt={item.title} />
                        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/20 to-transparent" />
                        {user.role === 'super_admin' && (
                          <div className="absolute top-5 right-5 z-20 flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => openEditGiftModal(item)}
                              className="p-2 rounded-xl bg-slate-900/80 text-white hover:bg-amber-500 hover:text-slate-950 transition-colors cursor-pointer"
                              title="Tahrirlash"
                            >
                              <Edit2 className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteShopItem(item.id)}
                              className="p-2 rounded-xl bg-slate-900/80 text-rose-400 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
                              title="O'chirish"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                        <div className="absolute inset-0 p-8 flex flex-col justify-end space-y-4">
                          <div className="inline-flex self-start px-3 py-1 rounded-full bg-emerald-500 text-white text-[10px] font-black uppercase tracking-widest shadow-lg">
                            Featured
                          </div>
                          <div className="space-y-1">
                            <h3 className="text-2xl font-black text-white uppercase leading-none">{item.title}</h3>
                            <p className="text-white/60 text-[10px] font-bold uppercase tracking-widest">{item.sponsorName}</p>
                          </div>
                          <div className="flex items-center justify-between pt-4 border-t border-white/10">
                            <div className="flex items-center gap-2 text-amber-400 font-black font-mono">
                              <Coins className="w-5 h-5 fill-amber-400" />
                              <span className="text-xl">{item.priceCoins.toLocaleString()}</span>
                            </div>
                            <button 
                              onClick={() => setActiveModalItem(item)}
                              disabled={(item.stock || 0) <= 0 || user.ecoCoins < item.priceCoins}
                              className="px-6 py-3 bg-white text-slate-950 rounded-2xl text-[10px] font-black uppercase tracking-widest hover:scale-105 active:scale-95 transition-all disabled:opacity-50"
                            >
                              {(item.stock || 0) <= 0 ? 'Tugagan' : 'Almashtirish'}
                            </button>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Full Grid */}
              <div className="space-y-8">
                <div className="flex items-center justify-between">
                  <h2 className="text-2xl font-black uppercase tracking-tighter">Barcha Mahsulotlar</h2>
                  <span className="text-slate-400 text-[10px] font-black uppercase tracking-widest">{filteredItems.length} ta sovg'a</span>
                </div>
                
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
                  {filteredItems.map(item => {
                    const isOutOfStock = (item.stock || 0) <= 0;
                    const canAfford = user.ecoCoins >= item.priceCoins;

                    return (
                      <motion.div 
                        layout
                        key={item.id}
                        className="group bg-white dark:bg-[#0f172a] rounded-[32px] border border-slate-200 dark:border-white/5 overflow-hidden shadow-xl hover:shadow-2xl hover:-translate-y-2 transition-all duration-300"
                      >
                        <div className="relative aspect-square overflow-hidden bg-slate-100 dark:bg-slate-800">
                          <img 
                            src={resolveMediaUrl(item.imageUrl)} 
                            className={`w-full h-full object-cover transition-transform duration-500 group-hover:scale-110 ${isOutOfStock ? 'grayscale opacity-50' : ''}`}
                            alt={item.title} 
                          />
                          <div className="absolute top-4 left-4 flex flex-col gap-2">
                             <div className="px-2 py-1 rounded-lg bg-black/50 backdrop-blur-md text-[8px] font-black text-white uppercase tracking-widest">
                               {item.sponsorName}
                             </div>
                             {isOutOfStock && (
                               <div className="px-2 py-1 rounded-lg bg-rose-600 text-white text-[8px] font-black uppercase tracking-widest">
                                 Tugagan
                               </div>
                             )}
                          </div>
                          <div className="absolute top-4 right-4 flex items-center gap-1.5">
                            {user.role === 'super_admin' && (
                              <>
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    openEditGiftModal(item);
                                  }}
                                  className="p-1.5 rounded-lg bg-slate-900/80 text-white hover:bg-amber-500 hover:text-slate-950 transition-colors cursor-pointer"
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
                                  className="p-1.5 rounded-lg bg-slate-900/80 text-rose-400 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer"
                                  title="Sovg'ani o'chirish"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </>
                            )}
                            <div className="px-2 py-1 rounded-lg bg-emerald-600 text-white text-[10px] font-black font-mono shadow-lg">
                              {item.stock} ta
                            </div>
                          </div>
                        </div>

                        <div className="p-6 space-y-4">
                          <div className="space-y-1">
                            <h4 className="text-base font-black uppercase tracking-tight line-clamp-1 dark:text-white">{item.title}</h4>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-medium line-clamp-2 leading-relaxed">
                              {item.description}
                            </p>
                            {item.redemptionGate?.mode && item.redemptionGate.mode !== 'none' && (
                              <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 truncate">
                                {item.redemptionGate.mode === 'ad'
                                  ? 'Shart · Reklama bilan'
                                  : item.redemptionGate.mode === 'subscription'
                                  ? `Shart · Majburiy obuna (${item.redemptionGate.requiredSubscriptions?.length || 0})`
                                  : `Shart · Reklama va obuna (${item.redemptionGate.requiredSubscriptions?.length || 0})`}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-white/5">
                            <div className="flex flex-col">
                              <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest">Narxi</span>
                              <div className="flex items-center gap-1.5 text-amber-500 font-black font-mono">
                                <Coins className="w-4 h-4 fill-amber-500" />
                                <span className="text-lg">{item.priceCoins.toLocaleString()}</span>
                              </div>
                            </div>
                            <button
                              disabled={isOutOfStock || !canAfford}
                              onClick={() => setActiveModalItem(item)}
                              className={`p-3 rounded-2xl transition-all ${
                                isOutOfStock || !canAfford
                                  ? 'bg-slate-100 dark:bg-white/5 text-slate-400 cursor-not-allowed'
                                  : 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20 hover:scale-110 active:scale-95'
                              }`}
                            >
                              <ArrowRight className="w-5 h-5" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
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
                <div className="p-20 text-center bg-white dark:bg-[#0f172a] rounded-[40px] border border-slate-200 dark:border-white/5 shadow-2xl space-y-6">
                   <div className="w-20 h-20 rounded-3xl bg-slate-100 dark:bg-white/5 flex items-center justify-center mx-auto text-slate-300">
                     <ShoppingBag className="w-10 h-10" />
                   </div>
                   <div className="space-y-2">
                     <h3 className="text-xl font-black uppercase">Savatchangiz bo'sh</h3>
                     <p className="text-xs text-slate-500 font-medium max-w-xs mx-auto">Hali hech qanday sovg'a sotib olmadingiz. EcoCoinlarni foydali narsalarga sarflang!</p>
                   </div>
                   <button 
                     onClick={() => setActiveTabMode('catalog')}
                     className="px-8 py-4 bg-emerald-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-emerald-600/20"
                   >
                     Katalogga o'tish
                   </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {myOrders.map(order => (
                    <div key={order.id} className="bg-white dark:bg-[#0f172a] rounded-[32px] border border-slate-200 dark:border-white/5 p-6 shadow-xl flex flex-col sm:flex-row gap-5">
                      <div className="flex items-center gap-3 shrink-0">
                        <div className="w-24 h-24 rounded-2xl bg-slate-100 dark:bg-white/5 overflow-hidden border border-slate-200 dark:border-white/10">
                          {order.itemImageUrl ? (
                            <img src={resolveMediaUrl(order.itemImageUrl)} alt={order.itemTitle} className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-emerald-500">
                              <Package className="w-8 h-8" />
                            </div>
                          )}
                        </div>
                        {orderQrMap[order.id] && (
                          <a
                            href={`/voucher/${order.voucherCode}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            title="QR kodni ochish"
                            className="w-24 h-24 rounded-2xl bg-white p-1.5 border border-slate-200 flex items-center justify-center hover:scale-105 transition-transform"
                          >
                            <img src={orderQrMap[order.id]} alt="QR" className="w-full h-full object-contain" />
                          </a>
                        )}
                      </div>
                      <div className="flex-1 space-y-3 min-w-0">
                        <div className="flex justify-between items-start gap-2">
                          <div className="space-y-1 min-w-0">
                             <h4 className="text-base font-black uppercase tracking-tight truncate">{order.itemTitle}</h4>
                             <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{order.sponsorName}</p>
                          </div>
                          <div className={`px-2 py-1 rounded-lg text-[8px] font-black uppercase tracking-widest shrink-0 ${
                            order.status === 'delivered' ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' :
                            order.verifiedBySchoolAdmin ? 'bg-sky-500/10 text-sky-500 border border-sky-500/20' :
                            'bg-amber-500/10 text-amber-500 border border-amber-500/20'
                          }`}>
                            {order.status === 'delivered'
                              ? 'Topshirilgan'
                              : order.verifiedBySchoolAdmin
                              ? 'Maktab admini tasdiqlagan'
                              : order.status}
                          </div>
                        </div>

                        <div className="p-3 bg-slate-50 dark:bg-white/5 rounded-2xl border border-dashed border-emerald-500/30 flex items-center justify-between gap-2">
                           <div className="min-w-0">
                             <span className="text-[8px] font-black text-slate-400 uppercase block">Promokod & QR Vaucher</span>
                             <span className="text-sm font-black font-mono text-emerald-500 tracking-wider">{order.voucherCode}</span>
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

                        <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                           <div className="flex items-center gap-1">
                             <Coins className="w-3.5 h-3.5" />
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
              className="absolute inset-0 bg-black/60 backdrop-blur-xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-[#0f172a] rounded-[48px] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden"
            >
              <div className="relative aspect-video">
                <img src={resolveMediaUrl(activeModalItem.imageUrl)} className="w-full h-full object-cover" alt="" />
                <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-[#0f172a] via-transparent to-transparent" />
                <button 
                  onClick={() => setActiveModalItem(null)}
                  className="absolute top-6 right-6 p-3 bg-black/20 hover:bg-black/40 backdrop-blur-md rounded-full text-white transition-all"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="p-10 space-y-8">
                <div className="space-y-2 text-center">
                  <span className="text-[10px] font-black text-emerald-500 uppercase tracking-widest">{activeModalItem.sponsorName}</span>
                  <h3 className="text-3xl font-black uppercase tracking-tighter">{activeModalItem.title}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                    {activeModalItem.redemptionGate?.mode === 'subscription'
                      ? "Ushbu sovg'a promokodini olish uchun belgilangan kanal yoki sahifalarga obuna bo'lish talab etiladi."
                      : activeModalItem.redemptionGate?.mode === 'ad'
                      ? "Ushbu sovg'ani olishda qisqa homiy reklamasi ko'rsatiladi va so'ng promokod beriladi."
                      : activeModalItem.redemptionGate?.mode === 'ad_and_subscription'
                      ? "Ushbu sovg'a uchun obuna shartini bajarib, homiy reklamasini ko'rgach promokod beriladi."
                      : "Ushbu sovg'ani olish uchun balansingizdan tangalar yechiladi va to'g'ridan-to'g'ri vaucher kodi beriladi."}
                  </p>
                </div>

                <div className="flex items-center justify-center gap-8 py-6 border-y border-slate-100 dark:border-white/5">
                  <div className="text-center">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Narxi</span>
                    <div className="flex items-center gap-2 text-amber-500 font-black font-mono">
                      <Coins className="w-5 h-5 fill-amber-500" />
                      <span className="text-2xl">{activeModalItem.priceCoins.toLocaleString()}</span>
                    </div>
                  </div>
                  <div className="w-px h-12 bg-slate-100 dark:bg-white/5" />
                  <div className="text-center">
                    <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest block mb-1">Mavjud</span>
                    <div className="flex items-center gap-2 text-emerald-500 font-black font-mono">
                      <Package className="w-5 h-5" />
                      <span className="text-2xl">{activeModalItem.stock} ta</span>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                   <button 
                     onClick={() => setActiveModalItem(null)}
                     className="flex-1 py-5 bg-slate-100 dark:bg-white/5 rounded-[24px] text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 transition-all"
                   >
                     Bekor qilish
                   </button>
                   <button 
                     onClick={handleConfirmRedeem}
                     className="flex-2 py-5 bg-emerald-600 text-white rounded-[24px] text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-600/20 hover:scale-105 active:scale-95 transition-all"
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
              className="absolute inset-0 bg-emerald-950/90 backdrop-blur-2xl"
            />
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative w-full max-w-lg bg-white dark:bg-[#0f172a] rounded-[40px] p-6 sm:p-8 text-center shadow-2xl space-y-6 my-8"
            >
              <div className="flex items-center justify-center gap-4">
                {voucherResult.itemImageUrl && (
                  <img
                    src={resolveMediaUrl(voucherResult.itemImageUrl)}
                    alt={voucherResult.title}
                    className="w-20 h-20 rounded-2xl object-cover border-2 border-emerald-500 shadow-lg"
                  />
                )}
                {voucherQrUrl && (
                  <div className="p-2 bg-white rounded-2xl border border-slate-200 shadow-lg">
                    <img src={voucherQrUrl} alt="Voucher QR" className="w-20 h-20 object-contain" />
                  </div>
                )}
              </div>

              <div className="space-y-1.5">
                <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-black uppercase tracking-widest">
                  <CheckCircle2 className="w-3.5 h-3.5" /> Bazaga Saqlandi
                </span>
                <h3 className="text-2xl sm:text-3xl font-black uppercase tracking-tighter">Muborak Bo'lsin!</h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium leading-relaxed">
                  <b>{voucherResult.title}</b> sovg'asi uchun maxsus promokod va QR vaucheringiz yaratildi.
                </p>
              </div>

              <div className="p-6 bg-slate-50 dark:bg-white/5 rounded-[28px] border-2 border-dashed border-emerald-500/30 space-y-3">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Promokod</span>
                <div className="text-3xl font-black font-mono text-emerald-500 tracking-widest uppercase">
                  {voucherResult.code}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2">
                  <button
                    onClick={handleCopyVoucher}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-emerald-600 text-white text-[10px] font-black uppercase tracking-widest rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-emerald-600/20 cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                    <span>{copied ? 'Nusxalandi!' : 'Kodni nusxalash'}</span>
                  </button>
                  <a
                    href={`/voucher/${voucherResult.code}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-sky-500/10 text-sky-500 text-[10px] font-black uppercase tracking-widest rounded-xl hover:bg-sky-500/20"
                  >
                    <QrCode className="w-4 h-4" />
                    <span>QR Tabrikni Ochish</span>
                  </a>
                </div>
              </div>

              <p className="text-[11px] text-slate-400 font-medium leading-relaxed max-w-sm mx-auto">
                Sovg'ani olish uchun ushbu promokod yoki QR kodni maktab adminiga ko'rsating — admin bazadan tekshirib Super Adminga yuboradi. Telefondan skanerlansa EcoHero jamoasidan tabrik chiqadi!
              </p>

              <button
                onClick={() => setVoucherResult(null)}
                className="w-full py-4 bg-slate-900 dark:bg-white text-white dark:text-slate-950 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl transition-all active:scale-95 cursor-pointer"
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
              className="relative w-full max-w-lg bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 p-6 sm:p-8 shadow-2xl space-y-5 my-6"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <span className="text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    Majburiy obuna sharti
                  </span>
                  <h3 className="text-xl font-black tracking-tight text-slate-900 dark:text-white">
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
                      className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800"
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
                      <button
                        type="button"
                        onClick={() => {
                          openAdTargetUrl(target.url);
                          setVisitedTargetIds(prev => (prev.includes(target.id) ? prev : [...prev, target.id]));
                        }}
                        className={`px-4 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer shrink-0 transition-colors ${
                          visited
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30'
                            : 'bg-sky-600 text-white hover:bg-sky-500'
                        }`}
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>{visited ? "O'tildi" : "Obuna bo'lish"}</span>
                      </button>
                    </div>
                  );
                })}
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  disabled={verifyingSubscription}
                  onClick={() => setSubscriptionGateItem(null)}
                  className="flex-1 py-3.5 bg-slate-100 dark:bg-white/5 rounded-2xl text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  Bekor qilish
                </button>
                <button
                  type="button"
                  disabled={verifyingSubscription}
                  onClick={handleVerifyAndCompleteSubscriptionGate}
                  className="flex-[2] py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl text-xs font-bold cursor-pointer disabled:opacity-50"
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
        <div className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#0f172a] w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl my-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black uppercase">
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
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
              />
              <textarea
                rows={2}
                placeholder="Tavsifi"
                value={giftDescription}
                onChange={e => setGiftDescription(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  required
                  placeholder="Narxi (EcoCoin)"
                  value={giftPrice}
                  onChange={e => setGiftPrice(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                />
                <input
                  type="number"
                  required
                  placeholder="Zaxira soni"
                  value={giftStock}
                  onChange={e => setGiftStock(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                />
              </div>
              <select
                value={giftCategory}
                onChange={e => setGiftCategory(e.target.value as ShopItem['category'])}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
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
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
              />
              <div className="flex items-center gap-3">
                <label className="flex-1 px-4 py-3 rounded-2xl bg-emerald-500/10 border border-dashed border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer">
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
                    className="w-12 h-12 rounded-xl object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                )}
              </div>
              <details className="text-[11px] text-slate-400">
                <summary className="cursor-pointer">Yoki rasm havolasi (ixtiyoriy)</summary>
                <input
                  type="text"
                  placeholder="Rasm URL (https://... yoki /uploads/...)"
                  value={giftImageUrl}
                  onChange={e => setGiftImageUrl(e.target.value)}
                  className="mt-2 w-full px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
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
                className="w-full py-3.5 bg-emerald-600 text-white rounded-2xl text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-50"
              >
                {savingLoading ? 'Saqlanmoqda...' : editingItem ? 'Yangilash' : "Sovg'ani Saqlash"}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Super Admin Quick Ad Create / Edit Modal */}
      {showShopAdModal && (
        <div className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#0f172a] w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl my-8">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black uppercase">
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
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
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
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                />
                <input
                  type="text"
                  placeholder="Homiy / Kompaniya nomi"
                  value={adSponsorInput}
                  onChange={e => setAdSponsorInput(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                />
              </div>
              <input
                type="text"
                placeholder="Asosiy sarlavha"
                value={adHeadlineInput}
                onChange={e => setAdHeadlineInput(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
              />
              <input
                type="text"
                placeholder="Qo'shimcha matn (ixtiyoriy)"
                value={adSubheadlineInput}
                onChange={e => setAdSubheadlineInput(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <label className="px-3 py-3 rounded-2xl bg-sky-500/10 border border-dashed border-sky-500/40 text-sky-600 dark:text-sky-400 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                  <ImageIcon className="w-4 h-4 shrink-0" />
                  <span>{uploadingAdImg ? 'Yuklanmoqda...' : 'Rasm yuklash'}</span>
                  <input
                    type="file"
                    accept="image/*"
                    onChange={e => handleShopMediaUpload(e, 'ad_img')}
                    className="hidden"
                  />
                </label>
                <label className="px-3 py-3 rounded-2xl bg-emerald-500/10 border border-dashed border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer">
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
              {(adImageInput || adVideoInput) && (
                <div className="flex items-center gap-3 px-3 py-2 rounded-2xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  {adImageInput && (
                    <img
                      src={resolveMediaUrl(adImageInput)}
                      alt="Ad preview"
                      className="w-11 h-11 rounded-xl object-cover shrink-0"
                    />
                  )}
                  <div className="min-w-0 flex-1 text-[11px] font-bold">
                    <div className="truncate text-emerald-500">
                      {adVideoInput ? `Video: ${adVideoInput}` : `Rasm: ${adImageInput}`}
                    </div>
                    {adVideoInput && (
                      <button
                        type="button"
                        onClick={() => setAdVideoInput('')}
                        className="text-rose-500 cursor-pointer"
                      >
                        Videoni o'chirish
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Duration Presets (15s, 30s, 60s, 90s, 120s + custom) */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
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
                          ? 'bg-amber-500 text-slate-950'
                          : 'bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-300'
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
                    className="w-20 px-2.5 py-1 rounded-lg bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-mono font-bold outline-none"
                  />
                </div>
              </div>

              {/* Destination Link Type */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2.5">
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
                            : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-800 text-slate-500'
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
                    className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
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
                    className="w-full px-3 py-2.5 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
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
                    placeholder="Rasm URL (https://... yoki /uploads/...)"
                    value={adImageInput}
                    onChange={e => setAdImageInput(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                  />
                  <input
                    type="text"
                    placeholder="Video URL (ixtiyoriy mp4)"
                    value={adVideoInput}
                    onChange={e => setAdVideoInput(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                  />
                </div>
              </details>
              {adPlacementChoice === 'earn_coins' && (
                <input
                  type="number"
                  placeholder="Mukofot (EcoCoin)"
                  value={adRewardInput}
                  onChange={e => setAdRewardInput(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                />
              )}
              <button
                type="submit"
                disabled={uploadingAdImg || uploadingAdVideo}
                className="w-full py-3.5 bg-amber-500 text-slate-950 rounded-2xl text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-50"
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
