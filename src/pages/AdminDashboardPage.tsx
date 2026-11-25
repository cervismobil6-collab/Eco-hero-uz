import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  XCircle,
  Clock,
  School as SchoolIcon,
  Database,
  ShieldCheck,
  Bot,
  Radio,
  BellRing,
  Copy,
  Check,
  Sparkles,
  AlertCircle,
  ListChecks,
  Package,
  MapPin,
  Globe,
  Building2,
  Shield,
  Activity,
  History,
  Settings,
  Briefcase,
  Layers,
  Menu,
  X,
  Search,
  RefreshCw,
  Key,
  Camera,
  Coins,
  Users,
  AlertTriangle,
  UserCheck,
  LayoutDashboard,
  QrCode,
  MessageSquare,
  TrendingUp,
  Lock,
  ShieldAlert,
  Upload,
  Film,
  Image as ImageIcon,
  Trash2,
  Edit2,
  Send,
  ExternalLink,
  Megaphone,
  Download,
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { useEco } from '../context/EcoContext';
import { DistrictUserGrowthResponse, EcoAd, ShopItem, ShopRedemptionGate } from '../types/eco';
import { resolveMediaUrl, openAdTargetUrl } from '../utils/api';
import { EcoTelegramChatPanel } from '../components/chat/EcoTelegramChatPanel';
import { StudentDashboardView } from '../components/dashboard/StudentDashboardView';
import { AmbassadorDashboardView } from '../components/dashboard/AmbassadorDashboardView';
import { SchoolCaptainDashboardView } from '../components/dashboard/SchoolCaptainDashboardView';
import { DistrictCoordinatorDashboardView } from '../components/dashboard/DistrictCoordinatorDashboardView';
import { RegionalCoordinatorDashboardView } from '../components/dashboard/RegionalCoordinatorDashboardView';
import { SuperAdminModerationView } from '../components/dashboard/SuperAdminModerationView';
import { ModeratorDashboardView } from '../components/dashboard/ModeratorDashboardView';
import { VoucherVerifierPanel } from '../components/shop/VoucherVerifierPanel';
import { GiftGateConfigEditor } from '../components/shop/GiftGateConfigEditor';
import { HomePostsManagerPanel } from '../components/dashboard/HomePostsManagerPanel';
import { DailyMissionsManagerPanel } from '../components/dashboard/DailyMissionsManagerPanel';
import heroEcoForestImg from '../assets/images/hero_eco_forest_1795179384249.jpg';

function getDefaultTabForRole(role: string): string {
  switch (role) {
    case 'super_admin':
      return 'role_requests';
    case 'regional_coordinator':
      return 'regional_dashboard';
    case 'district_coordinator':
      return 'district_dashboard';
    case 'school_admin':
      return 'school_dashboard';
    case 'ambassador':
      return 'ambassador_dashboard';
    case 'sponsor':
      return 'sponsor_dashboard';
    case 'moderator':
      return 'moderator_dashboard';
    default:
      return 'student_dashboard';
  }
}

export const AdminDashboardPage: React.FC = () => {
  const {
    user,
    reports,
    updateReportStatus,
    schools,
    auditLogs,
    sponsorshipProjects,
    ecoAds,
    createEcoAd,
    updateEcoAd,
    updateEcoAdStatus,
    deleteEcoAd,
    shopOrders,
    updateShopOrderStatus,
    shopItems,
    updateShopItem,
    createShopItem,
    uploadMediaFile,
    roleRequests,
    registrationApplications,
    mediaSubmissions,
    openRoleRequestModal,
    logoutUser,
    setActiveTab: setGlobalTab,
    showNotification,
    apiFetch,
    fetchDistrictUserGrowth,
    liveSyncVersion,
    liveMetrics,
    refreshBootstrap,
    dailyMissions,
    adminIntent,
  } = useEco();

  const [activeTab, setActiveTab] = useState<string>(() => getDefaultTabForRole(user.role));
  const [searchQuery, setSearchQuery] = useState('');
  const [reportFilterStatus, setReportFilterStatus] = useState<'all' | 'pending' | 'resolved' | 'rejected'>('all');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [growthData, setGrowthData] = useState<DistrictUserGrowthResponse | null>(null);
  const [growthLoading, setGrowthLoading] = useState(false);
  const [growthForbidden, setGrowthForbidden] = useState(false);

  // States for modals
  const [showShopCreateModal, setShowShopCreateModal] = useState(false);
  const [editingShopItem, setEditingShopItem] = useState<ShopItem | null>(null);
  const [showAdCreateModal, setShowAdCreateModal] = useState(false);
  const [editingAdItem, setEditingAdItem] = useState<EcoAd | null>(null);
  const [newShopTitle, setNewShopTitle] = useState('');
  const [newShopDesc, setNewShopDesc] = useState('');
  const [newShopPrice, setNewShopPrice] = useState('500');
  const [newShopStock, setNewShopStock] = useState('20');
  const [newShopCategory, setNewShopCategory] = useState<'accessories' | 'stationery' | 'eco_home' | 'education'>('accessories');
  const [newShopSponsor, setNewShopSponsor] = useState('ECO HERO');
  const [newShopImageUrl, setNewShopImageUrl] = useState('https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=600');
  const [newShopGate, setNewShopGate] = useState<ShopRedemptionGate>({
    mode: 'none',
    adId: 'auto',
    requiredSubscriptions: [],
  });
  const [savingShopItem, setSavingShopItem] = useState(false);

  const [newAdTitle, setNewAdTitle] = useState('');
  const [newAdSponsor, setNewAdSponsor] = useState('');
  const [newAdSponsorLogo, setNewAdSponsorLogo] = useState('');
  const [newAdHeadline, setNewAdHeadline] = useState('');
  const [newAdSubheadline, setNewAdSubheadline] = useState('');
  const [newAdCtaText, setNewAdCtaText] = useState("Batafsil ko'rish");
  const [newAdUrl, setNewAdUrl] = useState('https://t.me/Ecoheros_bot');
  const [newAdCtaType, setNewAdCtaType] = useState<'website' | 'telegram_bot' | 'telegram_channel'>('telegram_bot');
  const [newAdClickOpensLink, setNewAdClickOpensLink] = useState(true);
  const [newAdPlacement, setNewAdPlacement] = useState<'home_top' | 'shop_top' | 'post_purchase' | 'earn_coins'>('post_purchase');
  const [newAdType, setNewAdType] = useState<'banner' | 'video'>('banner');
  const [newAdImageUrl, setNewAdImageUrl] = useState('/assets/schools/eco_courtyard.jpg');
  const [newAdVideoUrl, setNewAdVideoUrl] = useState('');
  const [newAdRewardCoins, setNewAdRewardCoins] = useState('100');
  const [newAdSkipSeconds, setNewAdSkipSeconds] = useState('15');
  const [savingAdItem, setSavingAdItem] = useState(false);
  const [uploadingShopImg, setUploadingShopImg] = useState(false);
  const [uploadingAdImg, setUploadingAdImg] = useState(false);
  const [uploadingAdLogo, setUploadingAdLogo] = useState(false);
  const [uploadingAdVideo, setUploadingAdVideo] = useState(false);

  const openCreateShopModal = () => {
    setEditingShopItem(null);
    setNewShopTitle('');
    setNewShopDesc('');
    setNewShopPrice('500');
    setNewShopStock('20');
    setNewShopCategory('accessories');
    setNewShopSponsor('ECO HERO');
    setNewShopImageUrl('https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=600');
    setNewShopGate({ mode: 'none', adId: 'auto', requiredSubscriptions: [] });
    setShowShopCreateModal(true);
  };

  const openEditShopModal = (item: ShopItem) => {
    setEditingShopItem(item);
    setNewShopTitle(item.title || '');
    setNewShopDesc(item.description || '');
    setNewShopPrice(String(item.priceCoins || 500));
    setNewShopStock(String(item.stock ?? 10));
    setNewShopCategory((item.category as any) || 'accessories');
    setNewShopSponsor(item.sponsorName || 'ECO HERO');
    setNewShopImageUrl(item.imageUrl || '');
    setNewShopGate(
      item.redemptionGate
        ? {
            mode: item.redemptionGate.mode || 'none',
            adId: item.redemptionGate.adId || 'auto',
            requiredSubscriptions: item.redemptionGate.requiredSubscriptions || [],
          }
        : { mode: 'none', adId: 'auto', requiredSubscriptions: [] }
    );
    setShowShopCreateModal(true);
  };

  const openCreateAdModal = () => {
    setEditingAdItem(null);
    setNewAdTitle('');
    setNewAdSponsor('');
    setNewAdSponsorLogo('');
    setNewAdHeadline('');
    setNewAdSubheadline('');
    setNewAdCtaText("Batafsil ko'rish");
    setNewAdUrl('https://t.me/Ecoheros_bot');
    setNewAdCtaType('telegram_bot');
    setNewAdClickOpensLink(true);
    setNewAdPlacement('earn_coins');
    setNewAdType('banner');
    setNewAdImageUrl('/assets/schools/eco_courtyard.jpg');
    setNewAdVideoUrl('');
    setNewAdRewardCoins('100');
    setNewAdSkipSeconds('15');
    setShowAdCreateModal(true);
  };

  const openEditAdModal = (ad: EcoAd) => {
    setEditingAdItem(ad);
    setNewAdTitle(ad.title || '');
    setNewAdSponsor(ad.sponsorName || '');
    setNewAdSponsorLogo(ad.sponsorLogo || '');
    setNewAdHeadline(ad.headline || '');
    setNewAdSubheadline(ad.subheadline || '');
    setNewAdCtaText(ad.ctaText || "Batafsil ko'rish");
    setNewAdUrl(ad.ctaUrl || 'https://t.me/Ecoheros_bot');
    setNewAdCtaType(
      ad.ctaType ||
        (/t\.me\/|telegram\.me\//i.test(String(ad.ctaUrl || ''))
          ? /bot$/i.test(String(ad.ctaUrl || ''))
            ? 'telegram_bot'
            : 'telegram_channel'
          : 'website')
    );
    setNewAdClickOpensLink(ad.clickOpensLink !== false);
    setNewAdPlacement((['home_top', 'shop_top', 'post_purchase', 'earn_coins'].includes(ad.placement) ? ad.placement : 'earn_coins') as any);
    setNewAdType(ad.videoUrl || ad.type === 'video' ? 'video' : 'banner');
    setNewAdImageUrl(ad.imageUrl || '');
    setNewAdVideoUrl(ad.videoUrl || '');
    setNewAdRewardCoins(String(ad.rewardCoins || 100));
    setNewAdSkipSeconds(String(ad.skipAfterSeconds || 15));
    setShowAdCreateModal(true);
  };

  const handleAdminFileUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    target: 'shop_img' | 'ad_img' | 'ad_logo' | 'ad_video'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 80 * 1024 * 1024) {
      showNotification('Fayl hajmi 80 MB dan oshmasligi kerak', 'warning');
      e.target.value = '';
      return;
    }
    if (target === 'shop_img') setUploadingShopImg(true);
    if (target === 'ad_img') setUploadingAdImg(true);
    if (target === 'ad_logo') setUploadingAdLogo(true);
    if (target === 'ad_video') setUploadingAdVideo(true);
    try {
      const up = await uploadMediaFile(file, file.name);
      if (up.success && up.url) {
        if (target === 'shop_img') setNewShopImageUrl(up.url);
        if (target === 'ad_img') setNewAdImageUrl(up.url);
        if (target === 'ad_logo') setNewAdSponsorLogo(up.url);
        if (target === 'ad_video') {
          setNewAdVideoUrl(up.url);
          setNewAdType('video');
        }
        showNotification(target === 'ad_video' ? 'Video yuklandi!' : 'Rasm yuklandi!', 'success');
      } else {
        showNotification(up.error || 'Faylni yuklashda xatolik', 'warning');
      }
    } finally {
      setUploadingShopImg(false);
      setUploadingAdImg(false);
      setUploadingAdLogo(false);
      setUploadingAdVideo(false);
      e.target.value = '';
    }
  };

  // States for Telegram menu button sync & status
  const [syncLoading, setSyncLoading] = useState(false);
  const [syncStatus, setSyncStatus] = useState<string | null>(null);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [newTokenInput, setNewTokenInput] = useState('');
  const [tokenLoading, setTokenLoading] = useState(false);
  const [tokenStatus, setTokenStatus] = useState<string | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);
  const [webhookStatus, setWebhookStatus] = useState<string | null>(null);
  const [telegramStatusInfo, setTelegramStatusInfo] = useState<{
    botConfigured?: boolean;
    botUsername?: string;
    webhookConfigured?: boolean;
    webhookUrl?: string;
    miniAppUrl?: string;
    isTemporaryTunnel?: boolean;
    isProduction247?: boolean;
    totalSubscribers?: number;
  } | null>(null);
  const activeMiniAppUrl = telegramStatusInfo?.miniAppUrl || window.location.origin;

  const [botUsersReport, setBotUsersReport] = useState<{
    users: {
      key: string;
      uid: string;
      telegramId: string;
      username: string;
      fullName: string;
      phoneNumber: string;
      role: string;
      schoolName: string;
      region: string;
      district: string;
      ecoCoins: number;
      isOnboarded: boolean;
      hasTelegramBot: boolean;
      sources: string[];
      startedAt: string;
      lastSeenAt: string;
    }[];
    summary: {
      botUsersCount: number;
      totalDetectedUsers: number;
      registeredUsersCount: number;
      onboardedUsersCount: number;
      botOnlyVisitorsCount: number;
      totalSchools: number;
      persistentVolumeActive: boolean;
      dataDir: string;
      snapshotsCount: number;
      lastUpdatedAt: string;
    };
  } | null>(null);
  const [botUsersLoading, setBotUsersLoading] = useState(false);
  const [botUsersSearch, setBotUsersSearch] = useState('');
  const [backupBusy, setBackupBusy] = useState(false);

  const fetchTelegramStatus = async () => {
    try {
      const res = await apiFetch('/api/telegram/status');
      const data = await res.json();
      setTelegramStatusInfo(data);
    } catch {
      // ignore network error
    }
  };

  const fetchDetectedBotUsers = async () => {
    setBotUsersLoading(true);
    try {
      const res = await apiFetch('/api/admin/bot-users');
      const data = await res.json();
      if (res.ok && data?.success) {
        setBotUsersReport({ users: data.users || [], summary: data.summary });
      }
    } catch {
      // ignore network error
    } finally {
      setBotUsersLoading(false);
    }
  };

  const handleDownloadUltraBackup = async () => {
    setBackupBusy(true);
    try {
      const res = await apiFetch('/api/admin/cloud-backup/export');
      const data = await res.json();
      if (!res.ok || !data?.snapshot) {
        showNotification(data?.error || 'Zaxira faylini yaratib bo‘lmadi', 'warning');
        return;
      }
      const dateTag = new Date().toISOString().slice(0, 10);
      const blob = new Blob([JSON.stringify(data.snapshot, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `ecohero-ultra-backup-${dateTag}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      showNotification("To'liq JSON zaxira yuklab olindi!", 'success');
    } catch (e: any) {
      showNotification(e?.message || 'Yuklab olishda xatolik', 'warning');
    } finally {
      setBackupBusy(false);
    }
  };

  const handleRestoreUltraBackupFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBackupBusy(true);
    try {
      const rawText = await file.text();
      const parsed = JSON.parse(rawText);
      const res = await apiFetch('/api/admin/cloud-backup/restore', {
        method: 'POST',
        body: JSON.stringify({ snapshot: parsed }),
      });
      const data = await res.json();
      if (!res.ok || !data?.success) {
        showNotification(data?.error || 'Zaxiradan tiklashda xatolik', 'warning');
        return;
      }
      await refreshBootstrap();
      await fetchDetectedBotUsers();
      await fetchTelegramStatus();
      showNotification(
        `Tiklandi: +${data.restoredUsers || 0} foydalanuvchi, +${data.restoredSchools || 0} maktab, +${data.restoredStarters || 0} bot foydalanuvchisi`,
        'success'
      );
    } catch (err: any) {
      showNotification(`JSON fayl xatosi: ${err?.message || "Noto'g'ri format"}`, 'warning');
    } finally {
      setBackupBusy(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'telegram') {
      fetchTelegramStatus();
      fetchDetectedBotUsers();
    } else if (activeTab === 'district_growth_race') {
      setGrowthLoading(true);
      fetchDistrictUserGrowth()
        .then(res => {
          if (res.forbidden) setGrowthForbidden(true);
          else if (res.success && res.data) {
            setGrowthForbidden(false);
            setGrowthData(res.data);
          }
        })
        .finally(() => setGrowthLoading(false));
    }
  }, [activeTab, fetchDistrictUserGrowth, liveSyncVersion]);

  const handleActivateWebhook = async () => {
    setWebhookLoading(true);
    setWebhookStatus(null);
    try {
      const res = await apiFetch('/api/telegram/set-webhook', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setWebhookStatus(`✅ Doimiy Webhook faollashtirildi! Manzil: ${data.webhookUrl}`);
        fetchTelegramStatus();
      } else {
        setWebhookStatus(`❌ Xatolik: ${data.error || data.message || 'Webhook o‘rnatilmadi'}`);
      }
    } catch (e: any) {
      setWebhookStatus(`❌ Tarmoq xatosi: ${e?.message}`);
    } finally {
      setWebhookLoading(false);
    }
  };

  const handleUpdateBotToken = async () => {
    if (!newTokenInput || !newTokenInput.includes(':')) {
      setTokenStatus("⚠️ Iltimos, to'g'ri bot tokenini kiriting (masalan: 123456789:ABCdef...)");
      return;
    }
    setTokenLoading(true);
    setTokenStatus(null);
    try {
      const res = await apiFetch('/api/telegram/configure-token', {
        method: 'POST',
        body: JSON.stringify({ token: newTokenInput.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setTokenStatus(`✅ ${data.message || 'Yangi bot muvaffaqiyatli ulandi!'}`);
        setNewTokenInput('');
        fetchTelegramStatus();
      } else {
        setTokenStatus(`❌ Xatolik: ${data.error || 'Botga ulanib bo‘lmadi'}`);
      }
    } catch (e: any) {
      setTokenStatus(`❌ Tarmoq xatosi: ${e?.message}`);
    } finally {
      setTokenLoading(false);
    }
  };

  const handleSyncTelegramMenuButton = async () => {
    setSyncLoading(true);
    setSyncStatus(null);
    try {
      const res = await apiFetch('/api/telegram/sync-menu-button', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.success) {
        setSyncStatus('✅ Telegram Bot Menu Button muvaffaqiyatli doimiy HTTPS manziliga ulandi!');
        fetchTelegramStatus();
      } else {
        setSyncStatus(`❌ Xatolik: ${data.error || 'Ulanib bo‘lmadi'}`);
      }
    } catch (e: any) {
      setSyncStatus(`❌ Tarmoq xatosi: ${e?.message}`);
    } finally {
      setSyncLoading(false);
    }
  };

  const pendingAppsCount =
    registrationApplications.filter(a => a.status === 'pending' || a.status === 'needs_info').length +
    roleRequests.filter(r => r.status === 'pending').length;
  const pendingMediaCount = mediaSubmissions.filter(m => m.status === 'PENDING').length;

  const menuItems = [
    { id: 'student_dashboard', label: "O'quvchi Kabineti", icon: LayoutDashboard, roles: ['student'] },
    { id: 'role_apply', label: 'Lavozimga Ariza', icon: UserCheck, roles: ['student', 'ambassador'] },
    { id: 'role_requests', label: 'Arizalar & Tasdiqlash', icon: ShieldCheck, roles: ['super_admin'], badge: pendingAppsCount },
    { id: 'moderator_dashboard', label: 'Moderator Kabineti', icon: ShieldAlert, roles: ['super_admin', 'moderator'] },
    { id: 'media_moderation', label: 'Media Moderatsiya', icon: Camera, roles: ['super_admin', 'moderator'], badge: pendingMediaCount },
    { id: 'problem_workflow', label: 'Muammo 6-Bosqich', icon: AlertTriangle, roles: ['super_admin', 'moderator'] },
    { id: 'reward_settings', label: 'EcoCoin Sozlamalari', icon: Coins, roles: ['super_admin'] },
    { id: 'role_management', label: 'Rollar Boshqaruvi', icon: Users, roles: ['super_admin'] },
    { id: 'regional_dashboard', label: 'Viloyat Dashbordi', icon: Globe, roles: ['super_admin', 'regional_coordinator'] },
    { id: 'district_dashboard', label: 'Tuman Dashbordi', icon: MapPin, roles: ['super_admin', 'regional_coordinator', 'district_coordinator'] },
    { id: 'district_growth_race', label: 'TOP-3 Foydalanuvchi Poygasi', icon: TrendingUp, roles: ['super_admin', 'district_coordinator'] },
    { id: 'school_dashboard', label: 'Maktab Sardori', icon: SchoolIcon, roles: ['super_admin', 'school_admin'] },
    { id: 'ambassador_dashboard', label: 'Eko-Elchi Dashbordi', icon: ListChecks, roles: ['super_admin', 'ambassador'] },
    { id: 'sponsor_dashboard', label: 'Homiy Kabineti', icon: Briefcase, roles: ['super_admin', 'sponsor'] },
    { id: 'team_chat', label: 'Suhbat & Topshiriqlar', icon: MessageSquare, roles: ['super_admin', 'regional_coordinator', 'district_coordinator', 'school_admin', 'ambassador', 'moderator', 'sponsor', 'student'] },
    { id: 'reports', label: 'Muammolar Arxivi', icon: Activity, roles: ['super_admin', 'moderator', 'regional_coordinator', 'district_coordinator', 'school_admin', 'ambassador'] },
    { id: 'schools', label: 'Maktablar', icon: Building2, roles: ['super_admin', 'regional_coordinator', 'district_coordinator'] },
    { id: 'shop_management', label: 'Eko-Bozor', icon: Package, roles: ['super_admin'] },
    { id: 'voucher_verifier', label: 'Vaucher Tekshirgich', icon: QrCode, roles: ['super_admin', 'moderator', 'school_admin', 'district_coordinator', 'regional_coordinator'] },
    { id: 'shop_orders', label: 'Buyurtmalar', icon: Clock, roles: ['super_admin', 'sponsor', 'school_admin'] },
    { id: 'ads', label: 'Reklama (ADS)', icon: Sparkles, roles: ['super_admin', 'sponsor'] },
    { id: 'daily_missions', label: 'Bugungi Missiyalar', icon: Sparkles, roles: ['super_admin'], badge: dailyMissions.length },
    { id: 'home_posts', label: 'Bosh Sahifa Postlari', icon: Megaphone, roles: ['super_admin'] },
    { id: 'telegram', label: 'Telegram Bot', icon: Bot, roles: ['super_admin'] },
    { id: 'audit', label: 'Audit Log', icon: History, roles: ['super_admin'] },
    { id: 'firebase_guide', label: 'Firebase Info', icon: Database, roles: ['super_admin'] },
  ];

  const filteredMenu = menuItems.filter(item => item.roles.includes(user.role));

  useEffect(() => {
    if (filteredMenu.length > 0 && !filteredMenu.some(m => m.id === activeTab)) {
      setActiveTab(getDefaultTabForRole(user.role));
    }
  }, [user.role]);

  useEffect(() => {
    if (adminIntent?.adminTab && filteredMenu.some(m => m.id === adminIntent.adminTab)) {
      setActiveTab(adminIntent.adminTab);
    }
  }, [adminIntent, user.role]);

  const q = searchQuery.trim().toLowerCase();

  // Territorial Isolation for Reports
  const filteredReports = reports.filter(report => {
    const scopeOk =
      user.role === 'super_admin' ||
      user.role === 'moderator' ||
      (user.role === 'regional_coordinator' && report.region === user.region) ||
      (user.role === 'district_coordinator' && report.region === user.region && report.district === user.district) ||
      ((user.role === 'school_admin' || user.role === 'ambassador') &&
        (report.schoolId === user.schoolId || report.schoolName === user.schoolName));
    if (!scopeOk) return false;
    if (reportFilterStatus !== 'all') {
      const s = report.status.toLowerCase();
      if (reportFilterStatus === 'pending' && s !== 'pending' && s !== 'pending_review' && s !== 'needs_info') return false;
      if (reportFilterStatus === 'resolved' && s !== 'resolved' && s !== 'verified') return false;
      if (reportFilterStatus === 'rejected' && s !== 'rejected') return false;
    }
    if (!q) return true;
    return (
      report.title.toLowerCase().includes(q) ||
      (report.schoolName || '').toLowerCase().includes(q) ||
      (report.region || '').toLowerCase().includes(q)
    );
  });

  const filteredSchools = schools.filter(school => {
    const scopeOk =
      user.role === 'super_admin' ||
      (user.role === 'regional_coordinator' && school.region === user.region) ||
      (user.role === 'district_coordinator' && school.region === user.region && school.district === user.district) ||
      ((user.role === 'school_admin' || user.role === 'ambassador') && school.id === user.schoolId);
    if (!scopeOk) return false;
    if (!q) return true;
    return (
      school.name.toLowerCase().includes(q) ||
      school.region.toLowerCase().includes(q) ||
      school.district.toLowerCase().includes(q)
    );
  });

  const filteredOrders = shopOrders.filter(order => {
    if (!q) return true;
    return (
      order.userName.toLowerCase().includes(q) ||
      order.itemTitle.toLowerCase().includes(q) ||
      (order.voucherCode || '').toLowerCase().includes(q)
    );
  });

  return (
    <div className="min-h-screen bg-[#f8fafc] dark:bg-[#020617] flex text-slate-900 dark:text-white">
      {/* Mobile Sidebar Backdrop */}
      {isSidebarOpen && (
        <div
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-40 bg-slate-950/60 lg:hidden"
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-72 bg-white dark:bg-[#0f172a] border-r border-slate-200 dark:border-slate-800 transition-transform duration-300 lg:translate-x-0 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="h-full flex flex-col p-6 space-y-6 overflow-y-auto scrollbar-hide">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-emerald-600 flex items-center justify-center text-white shadow-lg shadow-emerald-600/20">
                <Shield className="w-6 h-6" />
              </div>
              <div className="space-y-0.5">
                <h2 className="text-lg font-black uppercase tracking-tighter">EcoHero Kabinet</h2>
                <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest leading-none">
                  {user.role.replace('_', ' ')}
                </p>
              </div>
            </div>
            <button
              onClick={() => setIsSidebarOpen(false)}
              className="lg:hidden p-2 rounded-xl text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <nav className="flex-1 space-y-1">
            {filteredMenu.map(item => (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setIsSidebarOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all cursor-pointer ${
                  activeTab === item.id
                    ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-600/20'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5'
                }`}
              >
                <item.icon className="w-4 h-4 shrink-0" />
                <span className="truncate">{item.label}</span>
                {typeof item.badge === 'number' && item.badge > 0 && (
                  <span className={`ml-auto px-2 py-0.5 rounded-lg text-[10px] font-bold tabular-nums ${
                    activeTab === item.id
                      ? 'bg-white/20 text-white'
                      : 'bg-amber-500 text-white'
                  }`}>
                    {item.badge}
                  </span>
                )}
              </button>
            ))}
          </nav>

          <div className="p-4 bg-slate-50 dark:bg-slate-900/70 rounded-3xl border border-slate-200 dark:border-slate-800 space-y-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full border-2 border-emerald-500 overflow-hidden bg-slate-200 shrink-0">
                <img
                  src={user.profileImage || `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(user.fullName || 'eco')}`}
                  alt={user.fullName}
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-black truncate">{user.fullName}</div>
                <div className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 uppercase tracking-wider truncate">
                  {user.schoolName || user.region}
                </div>
              </div>
            </div>
            <button
              onClick={() => {
                logoutUser();
                setGlobalTab('home');
              }}
              className="w-full py-2 bg-rose-500/10 text-rose-500 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all cursor-pointer"
            >
              Chiqish
            </button>
          </div>
        </div>
      </aside>

      {/* Content Area */}
      <main className="flex-1 lg:ml-72 min-h-screen p-5 md:p-8 space-y-8 max-w-full overflow-x-hidden">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="lg:hidden p-3 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 shadow-sm"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
            <div className="space-y-0.5">
              <h1 className="text-2xl md:text-3xl font-black uppercase tracking-tight">
                {menuItems.find(m => m.id === activeTab)?.label || 'Kabinet'}
              </h1>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold">
                {user.region} · {user.district} · {user.schoolName || 'EcoHero Platformasi'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3 w-full md:w-auto">
            <div className="relative flex-1 md:flex-none">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Qidiruv..."
                className="pl-10 pr-4 py-2.5 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 text-xs font-semibold outline-none focus:border-emerald-500 w-full md:w-60 shadow-sm"
              />
            </div>
            {user.role === 'super_admin' && (
              <button
                onClick={() => setActiveTab('role_requests')}
                title="Yangi arizalar"
                className="p-2.5 bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-emerald-600 shadow-sm relative cursor-pointer"
              >
                <BellRing className="w-5 h-5" />
                {pendingAppsCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-rose-500 rounded-full" />
                )}
              </button>
            )}
          </div>
        </div>

        {user.role === 'super_admin' && (
          <section
            aria-label="Jonli platforma ko'rsatkichlari"
            className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3"
          >
            <div className="p-4 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Botdan foydalanuvchilar
              </div>
              <div className="text-2xl font-black font-mono tabular-nums text-emerald-600 dark:text-emerald-400">
                {liveMetrics.botUsersCount.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400 tabular-nums">
                Jami a&apos;zolar: {liveMetrics.totalUsers}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Maktablar
              </div>
              <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
                {(liveMetrics.totalSchools || schools.length).toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400 tabular-nums">
                Sardorlar: {liveMetrics.schoolCaptainsCount}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Tumanlar
              </div>
              <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
                {liveMetrics.totalDistricts.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400 tabular-nums">
                Viloyatlar: {liveMetrics.totalRegions}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Eko-Elchilar
              </div>
              <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
                {liveMetrics.activeAmbassadors.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400 tabular-nums">
                Ko&apos;chatlar: {liveMetrics.treesPlanted}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Ekologik holatlar
              </div>
              <div className="text-2xl font-black font-mono tabular-nums text-slate-900 dark:text-white">
                {liveMetrics.totalReports.toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400 tabular-nums">
                Hal etilgan: {liveMetrics.resolvedReports}
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-1">
              <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">
                Sovg&apos;a buyurtmalari
              </div>
              <div className="text-2xl font-black font-mono tabular-nums text-amber-600 dark:text-amber-400">
                {(liveMetrics.shopOrdersCount || shopOrders.length).toLocaleString()}
              </div>
              <div className="text-[10px] text-slate-400 tabular-nums">
                Kutilayotgan arizalar: {liveMetrics.pendingApplicationsCount}
              </div>
            </div>
          </section>
        )}

        <AnimatePresence mode="wait">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-8"
          >
            {/* ROLE-SPECIFIC DASHBOARDS */}
            {activeTab === 'student_dashboard' && <StudentDashboardView />}

            {activeTab === 'role_apply' && (
              <div className="space-y-6">
                <div className="p-6 md:p-8 rounded-3xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-5">
                  <div>
                    <h2 className="text-xl font-black uppercase tracking-tight">Boshqaruv Lavozimiga Ariza Topshirish</h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Eko-Elchi arizasi ko‘rsatilgan maktab sardoriga, Maktab Sardori arizasi tuman koordinatoriga, Tuman Koordinatori arizasi esa viloyat koordinatoriga va Super Adminga borib tushadi.
                    </p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {[
                      { role: 'ambassador' as const, title: 'Eko-Elchi', desc: 'Maktab eko-patruli, media yuklash va vazifalarni bajarish' },
                      { role: 'school_admin' as const, title: 'Maktab Sardori (Captain)', desc: "O'z maktabi o'quvchilarini boshqarish va topshiriq berish" },
                      { role: 'district_coordinator' as const, title: 'Tuman Koordinatori', desc: 'Tuman maktablari va hisobotlarini monitoring qilish' },
                      { role: 'regional_coordinator' as const, title: 'Viloyat Koordinatori', desc: 'Viloyat tumanlari reytingi va nazorati' },
                      { role: 'moderator' as const, title: 'Moderator', desc: 'Ekologik hisobot va medialarni tekshirish' },
                      { role: 'sponsor' as const, title: 'Homiy Tashkilot', desc: "Sovg'alar va ekologik aksiyalarni moliyalashtirish" },
                    ].map(opt => (
                      <button
                        key={opt.role}
                        onClick={() => openRoleRequestModal(opt.role)}
                        className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-left hover:border-emerald-500 transition-all cursor-pointer space-y-1.5"
                      >
                        <div className="text-xs font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wider">
                          {opt.title}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-relaxed">{opt.desc}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {registrationApplications.filter(a => a.userId === user.uid).length > 0 && (
                  <div className="p-6 rounded-3xl bg-white dark:bg-[#0f172a] border border-slate-200 dark:border-slate-800 space-y-4">
                    <h3 className="text-sm font-black uppercase tracking-wider">Yuborgan Arizalaringiz Holati</h3>
                    <div className="space-y-3">
                      {registrationApplications
                        .filter(a => a.userId === user.uid)
                        .map(app => (
                          <div
                            key={app.id}
                            className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-1">
                              <div className="text-sm font-bold">
                                {app.requestedRoleName || app.requestedRole} · {app.officialSchoolName}
                              </div>
                              <div className="text-xs text-slate-500">
                                {app.region}, {app.district} · {new Date(app.createdAt).toLocaleDateString('uz-UZ')}
                              </div>
                              {app.adminNote && (
                                <div className="text-xs text-amber-600 dark:text-amber-400 font-semibold">
                                  Izoh: {app.adminNote}
                                </div>
                              )}
                            </div>
                            <span
                              className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase self-start sm:self-center ${
                                app.status === 'approved'
                                  ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                                  : app.status === 'rejected'
                                  ? 'bg-rose-500/10 text-rose-500'
                                  : 'bg-amber-500/10 text-amber-600 dark:text-amber-400'
                              }`}
                            >
                              {app.status}
                            </span>
                          </div>
                        ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {activeTab === 'role_requests' && <SuperAdminModerationView section="applications" />}
            {activeTab === 'moderator_dashboard' && <ModeratorDashboardView onNavigateTab={setActiveTab} />}
            {activeTab === 'media_moderation' && <SuperAdminModerationView section="media_moderation" />}
            {activeTab === 'problem_workflow' && <SuperAdminModerationView section="problem_workflow" />}
            {activeTab === 'reward_settings' && <SuperAdminModerationView section="reward_settings" />}
            {activeTab === 'role_management' && <SuperAdminModerationView section="role_management" />}
            {activeTab === 'regional_dashboard' && <RegionalCoordinatorDashboardView />}
            {activeTab === 'district_dashboard' && <DistrictCoordinatorDashboardView />}
            {activeTab === 'district_growth_race' && (
              <div className="p-6 md:p-8 rounded-3xl bg-white dark:bg-slate-900 border border-amber-500/40 space-y-5">
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-500">
                      <Lock className="w-3.5 h-3.5" />
                      <span>Faqat Tuman Koordinatorlari (Tuman Sardorlari) uchun</span>
                    </div>
                    <h2 className="text-2xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                      Eng Ko‘p Foydalanuvchi Yig‘gan TOP-3 Tuman Musobaqasi
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {growthData?.prizeNote ||
                        "Eng ko'p foydalanuvchi (Telegram bot va platforma a'zolari) yig'gan TOP-3 tuman juda qimmatbaho sovg'a bilan taqdirlanadi!"}
                    </p>
                  </div>
                  {growthData?.myDistrictRank && (
                    <div className="px-4 py-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-xs shrink-0">
                      <div className="text-slate-500">Sizning tumaningiz:</div>
                      <div className="font-mono tabular-nums font-black text-xl text-amber-500">
                        #{growthData.myDistrictRank.rank} / {growthData.totalDistricts} ·{' '}
                        <span className="text-emerald-500">{growthData.myDistrictRank.totalJoinedUsers} kishi</span>
                      </div>
                    </div>
                  )}
                </div>

                {growthLoading ? (
                  <div className="py-10 text-center text-xs text-slate-500">Reyting yuklanmoqda...</div>
                ) : growthForbidden ? (
                  <div className="p-5 rounded-2xl bg-rose-500/10 border border-rose-500/20 text-xs text-rose-500 flex items-center gap-2">
                    <Lock className="w-4 h-4 shrink-0" />
                    <span>Bu maxsus musobaqa reytingi faqat Tuman Koordinatorlari va Super Admin uchun ochiq.</span>
                  </div>
                ) : !growthData || growthData.items.length === 0 ? (
                  <div className="py-10 text-center text-xs text-slate-500">Ma’lumotlar topilmadi.</div>
                ) : (
                  <>
                    {/* Mobile Cards */}
                    <div className="md:hidden space-y-2.5">
                      {growthData.items.map(row => (
                        <div
                          key={row.id}
                          className={`p-3.5 rounded-2xl border text-xs space-y-2 ${
                            row.isMyDistrict
                              ? 'bg-emerald-500/10 border-emerald-500/40'
                              : row.isTop3
                              ? 'bg-amber-500/5 border-amber-500/30'
                              : 'bg-slate-50 dark:bg-slate-950 border-slate-200 dark:border-slate-800'
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                                <span className={`font-mono font-black ${row.isTop3 ? 'text-amber-500' : 'text-slate-400'}`}>
                                  #{row.rank} {row.isTop3 ? '★' : ''}
                                </span>
                                <span>{row.district}</span>
                                {row.isMyDistrict && <span className="text-emerald-500 text-[11px]">(Sizning tuman)</span>}
                              </div>
                              <div className="text-[11px] text-slate-500 truncate">
                                {row.region} · {row.coordinatorName}
                              </div>
                            </div>
                            <div className="text-right font-mono tabular-nums font-black text-emerald-500 shrink-0">
                              {row.totalJoinedUsers.toLocaleString()} kishi
                            </div>
                          </div>
                          <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-200/70 dark:border-slate-800 text-[11px] font-mono tabular-nums">
                            <div>
                              <div className="text-slate-400 font-sans">Maktablar</div>
                              <div className="font-bold">{row.schoolsCount}</div>
                            </div>
                            <div>
                              <div className="text-slate-400 font-sans">O‘quvchilar</div>
                              <div className="font-bold">{row.totalSchoolStudents.toLocaleString()}</div>
                            </div>
                            <div className="text-right">
                              <div className="text-slate-400 font-sans">Bot a’zolari</div>
                              <div className="font-bold text-sky-500">{row.botUsersCount.toLocaleString()}</div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    {/* Desktop Table */}
                    <div className="hidden md:block overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead className="border-b border-slate-200 dark:border-slate-800 text-slate-500">
                          <tr>
                            <th className="py-3 pr-3">O‘rin</th>
                            <th className="py-3 px-3">Tuman / Koordinator</th>
                            <th className="py-3 px-3 text-right">Maktablar</th>
                            <th className="py-3 px-3 text-right">Maktab o‘quvchilari</th>
                            <th className="py-3 px-3 text-right">Telegram Botdan kirgan</th>
                            <th className="py-3 pl-3 text-right">Jami Foydalanuvchi</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                          {growthData.items.map(row => (
                            <tr
                              key={row.id}
                              className={
                                row.isMyDistrict
                                  ? 'bg-emerald-500/10 font-semibold'
                                  : row.isTop3
                                  ? 'bg-amber-500/5'
                                  : ''
                              }
                            >
                              <td className="py-3.5 pr-3 font-mono tabular-nums font-black">
                                <span className={row.isTop3 ? 'text-amber-500' : 'text-slate-400'}>
                                  #{row.rank} {row.isTop3 ? '★' : ''}
                                </span>
                              </td>
                              <td className="py-3.5 px-3">
                                <div className="font-bold text-slate-900 dark:text-white">
                                  {row.district}{' '}
                                  {row.isMyDistrict && <span className="text-emerald-500">(Sizning tuman)</span>}
                                  {row.isTop3 && <span className="text-amber-500"> · TOP-3 Sovrin Zonasi</span>}
                                </div>
                                <div className="text-[11px] text-slate-500">
                                  {row.region} · {row.coordinatorName}
                                </div>
                              </td>
                              <td className="py-3.5 px-3 text-right font-mono tabular-nums">{row.schoolsCount}</td>
                              <td className="py-3.5 px-3 text-right font-mono tabular-nums">
                                {row.totalSchoolStudents.toLocaleString()}
                              </td>
                              <td className="py-3.5 px-3 text-right font-mono tabular-nums text-sky-500 font-bold">
                                {row.botUsersCount.toLocaleString()}
                              </td>
                              <td className="py-3.5 pl-3 text-right font-mono tabular-nums font-black text-emerald-500">
                                {row.totalJoinedUsers.toLocaleString()} kishi
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </div>
            )}
            {activeTab === 'school_dashboard' && <SchoolCaptainDashboardView />}
            {activeTab === 'ambassador_dashboard' && <AmbassadorDashboardView />}
            {activeTab === 'team_chat' && (
              <EcoTelegramChatPanel
                allowStudentDiscovery={['student', 'ambassador', 'super_admin'].includes(user.role)}
                title="EcoHero Jonli Suhbat & Topshiriqlar"
              />
            )}

            {/* SPONSOR DASHBOARD (Distinct Cabinet with KPIs & Campaigns) */}
            {activeTab === 'sponsor_dashboard' && (
              <div className="space-y-8">
                <div className="p-8 rounded-[32px] bg-slate-900 text-white border border-slate-800 shadow-xl flex flex-col md:flex-row items-center justify-between gap-6">
                  <div className="flex items-center gap-5">
                    <div className="w-16 h-16 rounded-2xl bg-amber-500 flex items-center justify-center text-white shadow-lg shadow-amber-500/20">
                      <Briefcase className="w-8 h-8" />
                    </div>
                    <div>
                      <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight">Homiy Kabineti</h2>
                      <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">
                        Ijtimoiy Mas'uliyat, Reklama & Sovg‘a Vaucherlari Boshqaruvi
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => setActiveTab('ads')}
                      className="px-5 py-3 bg-white/10 hover:bg-white/20 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Reklama Kampaniyalari
                    </button>
                    <button
                      onClick={() => setGlobalTab('partners')}
                      className="px-6 py-3 bg-amber-500 hover:bg-amber-400 text-white rounded-2xl font-black text-xs uppercase tracking-wider transition-all cursor-pointer"
                    >
                      Yangi Homiylik Taklifi +
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="text-xs text-slate-500">Homiylik loyihalari</div>
                    <div className="text-2xl font-black font-mono tabular-nums">{sponsorshipProjects.length}</div>
                  </div>
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="text-xs text-slate-500">Faol ADS kampaniyalar</div>
                    <div className="text-2xl font-black font-mono tabular-nums text-emerald-500">
                      {ecoAds.filter(a => a.status === 'active').length}
                    </div>
                  </div>
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="text-xs text-slate-500">Sovg‘a buyurtmalari</div>
                    <div className="text-2xl font-black font-mono tabular-nums text-amber-500">{shopOrders.length}</div>
                  </div>
                  <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-1">
                    <div className="text-xs text-slate-500">Do‘kon zaxirasi</div>
                    <div className="text-2xl font-black font-mono tabular-nums text-sky-500">
                      {shopItems.reduce((sum, it) => sum + (it.stock || 0), 0)} ta
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  <div className="lg:col-span-2 space-y-4">
                    <h3 className="text-lg font-black uppercase tracking-tight">Faol Homiylik Loyihalari</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      {sponsorshipProjects.slice(0, 4).map(proj => (
                        <div key={proj.id} className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                          <div className="h-32 relative">
                            <img src={proj.imageUrl} className="w-full h-full object-cover" alt={proj.title} />
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <span className="px-3 py-1 bg-emerald-600 text-white rounded-lg text-[10px] font-black uppercase tracking-wider">
                                {proj.status}
                              </span>
                            </div>
                          </div>
                          <div className="p-5 space-y-3">
                            <h4 className="text-sm font-black uppercase tracking-tight line-clamp-1">{proj.title}</h4>
                            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-emerald-500"
                                style={{ width: `${Math.min(100, (proj.raisedAmountUZS / Math.max(1, proj.targetAmountUZS)) * 100)}%` }}
                              />
                            </div>
                            <div className="flex justify-between text-[10px] font-bold text-slate-400 uppercase tabular-nums">
                              <span>Ta'sir: {proj.treesPlantedOrImpact}</span>
                              <span className="text-emerald-500">{proj.schoolsBenefited} maktab</span>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="space-y-4">
                    <h3 className="text-lg font-black uppercase tracking-tight">Taqdim Etilgan Sovg'alar</h3>
                    <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-5">
                      <div className="space-y-4">
                        {shopItems.slice(0, 4).map(item => (
                          <div key={item.id} className="flex items-center gap-3">
                            <img src={item.imageUrl} className="w-10 h-10 rounded-xl object-cover" alt={item.title} />
                            <div className="flex-1 min-w-0">
                              <div className="text-xs font-bold truncate">{item.title}</div>
                              <div className="text-[10px] font-semibold text-slate-400 tabular-nums">Zaxira: {item.stock} ta</div>
                            </div>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={() => setGlobalTab('shop')}
                        className="w-full py-3 bg-slate-100 dark:bg-slate-800 rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-emerald-600 hover:text-white transition-colors cursor-pointer"
                      >
                        Barcha Sovg'alarni Ko'rish
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* REPORTS ARCHIVE */}
            {activeTab === 'reports' && (
              <div className="space-y-6">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap gap-2">
                    {([
                      { id: 'all', label: 'Barchasi' },
                      { id: 'pending', label: 'Kutilmoqda' },
                      { id: 'resolved', label: 'Hal etilgan' },
                      { id: 'rejected', label: 'Rad etilgan' },
                    ] as const).map(s => (
                      <button
                        key={s.id}
                        onClick={() => setReportFilterStatus(s.id)}
                        className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border cursor-pointer transition-all ${
                          reportFilterStatus === s.id
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-white dark:bg-[#0f172a] border-slate-200 dark:border-slate-800 text-slate-500'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => setGlobalTab('report')}
                    className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg shadow-emerald-600/20 cursor-pointer"
                  >
                    + Yangi Hisobot
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredReports.map(report => (
                    <div
                      key={report.id}
                      className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm flex flex-col"
                    >
                      <div className="relative aspect-video bg-slate-100 dark:bg-slate-900">
                        {report.videoUrl ? (
                          <video src={resolveMediaUrl(report.videoUrl)} controls className="w-full h-full object-cover" />
                        ) : (
                          <img src={resolveMediaUrl(report.imageUrl)} className="w-full h-full object-cover" alt={report.title} />
                        )}
                        <div className="absolute top-3 left-3 px-2.5 py-1 bg-black/60 rounded-lg text-[9px] font-black text-white uppercase tracking-wider">
                          {report.category}
                        </div>
                        <div className={`absolute top-3 right-3 px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider ${
                          report.status.toLowerCase() === 'resolved' || report.status === 'verified'
                            ? 'bg-emerald-500 text-white'
                            : report.status.toLowerCase() === 'rejected'
                            ? 'bg-rose-500 text-white'
                            : report.status === 'ESCALATED'
                            ? 'bg-rose-600 text-white'
                            : 'bg-amber-500 text-white'
                        }`}>
                          {report.status}
                        </div>
                      </div>
                      <div className="p-6 space-y-4 flex-1 flex flex-col">
                        {report.isHazardous && (
                          <div className="p-2.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-[10px] font-bold flex items-center gap-2">
                            <AlertTriangle className="w-4 h-4 shrink-0" />
                            <span>Xavfli holat: Faqat mutasaddilar hal qiladi</span>
                          </div>
                        )}
                        <div className="space-y-1">
                          <h4 className="text-base font-black line-clamp-1">{report.title}</h4>
                          <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{report.description}</p>
                        </div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400 font-semibold pt-2 border-t border-slate-100 dark:border-slate-800 mt-auto">
                          {report.schoolName} · {report.region}
                        </div>
                        {(user.role === 'super_admin' || user.role === 'moderator') && (
                          <div className="flex gap-2">
                            <button
                              onClick={() => updateReportStatus(report.id, 'resolved')}
                              disabled={report.status.toLowerCase() === 'resolved' || report.isHazardous}
                              className="flex-1 py-2.5 bg-emerald-600 disabled:opacity-40 text-white rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer"
                            >
                              {report.status.toLowerCase() === 'resolved' ? 'Hal etilgan' : 'Tasdiqlash'}
                            </button>
                            <button
                              onClick={() => updateReportStatus(report.id, 'rejected')}
                              disabled={report.status.toLowerCase() === 'rejected'}
                              className="px-3.5 py-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-slate-500 hover:bg-rose-500 hover:text-white transition-colors cursor-pointer disabled:opacity-40"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SHOP MANAGEMENT */}
            {activeTab === 'shop_management' && (
              <div className="space-y-6">
                <div className="p-8 bg-gradient-to-br from-emerald-600 to-teal-500 rounded-[32px] text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
                  <div className="space-y-1">
                    <h2 className="text-2xl md:text-3xl font-black uppercase tracking-tight">Eko-Bozor Boshqaruvi</h2>
                    <p className="text-xs font-semibold opacity-90">Sovg'alar katalogini yangilang va zaxirani nazorat qiling</p>
                  </div>
                  <button
                    onClick={openCreateShopModal}
                    className="px-6 py-3.5 bg-white text-emerald-700 rounded-2xl font-black text-xs uppercase tracking-wider shadow-lg cursor-pointer"
                  >
                    + Yangi Sovg'a
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
                  {shopItems.map(item => (
                    <div key={item.id} className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
                      <div className="relative aspect-square">
                        <img src={resolveMediaUrl(item.imageUrl)} className="w-full h-full object-cover" alt={item.title} />
                        <div className="absolute top-3 right-3 px-2.5 py-1 bg-amber-500 text-white rounded-lg text-xs font-black font-mono tabular-nums">
                          {item.priceCoins} ECO
                        </div>
                      </div>
                      <div className="p-5 space-y-3">
                        <div>
                          <h4 className="text-sm font-black truncate">{item.title}</h4>
                          <div className="flex items-center justify-between text-[10px] font-bold text-slate-400 uppercase mt-1 tabular-nums">
                            <span>Zaxira: {item.stock} ta</span>
                            <span className="text-emerald-500">{item.category}</span>
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 truncate">
                            {item.redemptionGate?.mode === 'ad'
                              ? 'Shart · Reklama bilan'
                              : item.redemptionGate?.mode === 'subscription'
                              ? `Shart · Majburiy obuna (${item.redemptionGate.requiredSubscriptions?.length || 0})`
                              : item.redemptionGate?.mode === 'ad_and_subscription'
                              ? `Shart · Reklama va obuna (${item.redemptionGate.requiredSubscriptions?.length || 0})`
                              : 'To‘g‘ridan-to‘g‘ri promokod'}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => openEditShopModal(item)}
                            className="flex-1 py-2.5 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-emerald-600 hover:text-white transition-all cursor-pointer flex items-center justify-center gap-1"
                          >
                            <Edit2 className="w-3.5 h-3.5" /> Tahrirlash
                          </button>
                          <button
                            onClick={() => updateShopItem(item.id, { stock: item.stock + 10 })}
                            className="px-3 py-2.5 bg-slate-100 dark:bg-slate-800 rounded-xl text-[10px] font-black uppercase tracking-wider hover:bg-emerald-600 hover:text-white transition-all cursor-pointer tabular-nums"
                          >
                            +10
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* AUDIT LOG */}
            {activeTab === 'audit' && (
              <div className="bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <h3 className="text-lg font-black uppercase tracking-tight">Xavfsizlik Audit Jurnali</h3>
                  <div className="flex items-center gap-2 text-xs font-bold text-slate-500 tabular-nums">
                    <History className="w-4 h-4" /> {auditLogs.length} yozuvlar
                  </div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 dark:bg-slate-900">
                      <tr>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Sana / Vaqt</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Administrator</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Harakat</th>
                        <th className="px-6 py-4 text-[10px] font-black text-slate-400 uppercase tracking-wider">Tafsilotlar</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {auditLogs.map((log, i) => (
                        <tr key={log.id || i} className="hover:bg-slate-50 dark:hover:bg-slate-900/50">
                          <td className="px-6 py-4 font-mono text-slate-500 whitespace-nowrap tabular-nums">
                            {new Date(log.timestamp).toLocaleString('uz-UZ')}
                          </td>
                          <td className="px-6 py-4 font-bold">
                            {log.actorName} <span className="text-[10px] text-slate-400">({log.actorRole})</span>
                          </td>
                          <td className="px-6 py-4">
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 text-[10px] font-black uppercase">
                              {log.action}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-slate-500 dark:text-slate-400 font-mono text-[11px] max-w-md truncate">
                            {JSON.stringify(log.details || {})}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* TELEGRAM BOT & PERMANENT DOMAIN MANAGEMENT */}
            {activeTab === 'telegram' && (
              <div className="max-w-4xl mx-auto space-y-8">
                <div className="p-8 bg-gradient-to-br from-[#0f172a] via-[#1e293b] to-[#0f172a] rounded-[32px] border border-slate-800 text-white space-y-6 shadow-xl">
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-4">
                      <div className="w-14 h-14 rounded-2xl bg-gradient-to-tr from-sky-500 to-indigo-600 text-white flex items-center justify-center">
                        <Bot className="w-8 h-8" />
                      </div>
                      <div>
                        <h2 className="text-2xl font-black uppercase tracking-tight">Telegram Bot & Mini App</h2>
                        <p className="text-xs font-semibold text-sky-400 uppercase tracking-wider mt-0.5">
                          Doimiy HTTPS Domen va Avtonom Boshqaruv
                        </p>
                      </div>
                    </div>
                    <span className="px-3.5 py-1.5 rounded-full text-xs font-black uppercase tracking-wider border bg-emerald-500/20 border-emerald-500/30 text-emerald-400 tabular-nums">
                      {telegramStatusInfo?.botUsername ? `@${telegramStatusInfo.botUsername} Faol` : 'Doimiy HTTPS Faol'}
                      {typeof telegramStatusInfo?.totalSubscribers === 'number' ? ` · ${telegramStatusInfo.totalSubscribers} obunachi` : ''}
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                        Faol Mini App HTTPS Manzili
                      </label>
                      {telegramStatusInfo?.isTemporaryTunnel ? (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          Vaqtinchalik Tunnel (24/7 uchun deploy qiling)
                        </span>
                      ) : telegramStatusInfo?.isProduction247 ? (
                        <span className="text-[10px] font-bold px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          24/7 Doimiy Server Faol
                        </span>
                      ) : null}
                    </div>
                    <div className="flex flex-col sm:flex-row items-stretch gap-2">
                      <input
                        type="text"
                        readOnly
                        value={activeMiniAppUrl}
                        className="flex-1 px-4 py-3 bg-black/40 border border-white/10 rounded-2xl text-xs font-mono text-emerald-400 outline-none select-all"
                      />
                      <button
                        onClick={() => {
                          navigator.clipboard.writeText(activeMiniAppUrl);
                          setCopiedUrl(true);
                          setTimeout(() => setCopiedUrl(false), 2000);
                        }}
                        className="px-5 py-3 bg-white/10 hover:bg-white/20 rounded-2xl border border-white/10 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer"
                      >
                        {copiedUrl ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                        {copiedUrl ? 'Nusxalandi!' : 'Nusxalash'}
                      </button>
                    </div>
                  </div>

                  <div>
                    <button
                      onClick={handleSyncTelegramMenuButton}
                      disabled={syncLoading}
                      className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                    >
                      <RefreshCw className={`w-4 h-4 ${syncLoading ? 'animate-spin' : ''}`} />
                      {syncLoading ? 'Telegramga yuborilmoqda...' : 'Telegram Menu Buttonini Doimiy HTTPS Manziliga Sinxronlash'}
                    </button>
                    {syncStatus && (
                      <p className="mt-3 text-xs font-bold text-center text-slate-200 bg-white/5 py-2 px-4 rounded-xl border border-white/10">
                        {syncStatus}
                      </p>
                    )}
                  </div>
                </div>

                {/* Detected Bot Users & Ultra Persistence Backup/Restore */}
                <div className="p-6 sm:p-8 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 space-y-5 shadow-sm">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center shrink-0">
                        <Users className="w-6 h-6" />
                      </div>
                      <div>
                        <h3 className="text-base font-black uppercase tracking-tight">
                          Botdan Jami Foydalanganlar &amp; Ultra Xotira
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          Telegram Bot, Mini App va barcha arxivlardan aniqlangan foydalanuvchilar
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={fetchDetectedBotUsers}
                        disabled={botUsersLoading}
                        className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${botUsersLoading ? 'animate-spin' : ''}`} />
                        <span>Yangilash</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleDownloadUltraBackup}
                        disabled={backupBusy}
                        className="px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>.JSON Zaxira</span>
                      </button>
                      <label className="px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer">
                        <Upload className="w-3.5 h-3.5" />
                        <span>Tiklash (.JSON)</span>
                        <input
                          type="file"
                          accept=".json,application/json"
                          className="hidden"
                          disabled={backupBusy}
                          onChange={handleRestoreUltraBackupFile}
                        />
                      </label>
                    </div>
                  </div>

                  {botUsersReport?.summary && !botUsersReport.summary.persistentVolumeActive && (
                    <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-200">
                      <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                      <div className="space-y-1">
                        <p className="font-black uppercase tracking-wide text-[11px]">
                          Diqqat: Serverda Doimiy Disk (Railway Volume) ulanmagan!
                        </p>
                        <p className="leading-relaxed">
                          Hozirgi baza papkasi (<code>{botUsersReport.summary.dataDir}</code>) vaqtinchalik. Railway har qayta deploy bo‘lganda eski lokal JSON fayl tozalanadi va Telegram API avvalgi chatlar tarixini qaytadan bermaydi. Ma’lumotlar abadiy saqlanishi uchun Railway’da <b>Volume → /data</b> (<code>DATA_DIR=/data</code>) ulang yoki muntazam <b>/backup</b> / <b>.JSON Zaxira</b> olib saqlang.
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bot &amp; Mini App</div>
                      <div className="text-xl font-black text-emerald-500 tabular-nums mt-0.5">
                        {botUsersReport?.summary?.botUsersCount ?? liveMetrics.botUsersCount}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Jami hisoblar</div>
                      <div className="text-xl font-black tabular-nums mt-0.5">
                        {botUsersReport?.summary?.registeredUsersCount ?? liveMetrics.totalUsers}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Yagona Maktablar</div>
                      <div className="text-xl font-black text-indigo-500 tabular-nums mt-0.5">
                        {botUsersReport?.summary?.totalSchools ?? liveMetrics.totalSchools}
                      </div>
                    </div>
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Avto-Snapshotlar</div>
                      <div className="text-xl font-black text-teal-500 tabular-nums mt-0.5">
                        {botUsersReport?.summary?.snapshotsCount ?? 0}
                      </div>
                    </div>
                  </div>

                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={botUsersSearch}
                      onChange={e => setBotUsersSearch(e.target.value)}
                      placeholder="Ism, @username, Telegram ID yoki maktab bo'yicha qidirish..."
                      className="w-full pl-10 pr-4 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs outline-none"
                    />
                  </div>

                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/80 rounded-2xl border border-slate-200/80 dark:border-slate-800">
                    {(botUsersReport?.users || [])
                      .filter((u) => {
                        const q = botUsersSearch.trim().toLowerCase();
                        if (!q) return true;
                        return `${u.fullName} ${u.username} ${u.telegramId} ${u.uid} ${u.schoolName}`
                          .toLowerCase()
                          .includes(q);
                      })
                      .map((u) => (
                        <div key={u.key} className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-black text-slate-900 dark:text-white truncate">{u.fullName}</span>
                              {u.username && (
                                <span className="text-[11px] font-mono text-sky-500">{u.username}</span>
                              )}
                              <span
                                className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                                  u.isOnboarded
                                    ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-300'
                                }`}
                              >
                                {u.isOnboarded ? 'To‘liq Profil' : 'Faqat Bot / Mini App'}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-2">
                              <span className="font-mono">ID: {u.telegramId || u.uid}</span>
                              {u.schoolName && u.schoolName !== 'Maktab kiritilmagan' && (
                                <span>· 🏫 {u.schoolName}</span>
                              )}
                              <span>· Manba: {u.sources.join(', ')}</span>
                            </div>
                          </div>
                          <div className="shrink-0 flex items-center gap-3">
                            <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 font-black tabular-nums">
                              {u.ecoCoins} ECO
                            </span>
                          </div>
                        </div>
                      ))}
                    {(!botUsersReport || botUsersReport.users.length === 0) && (
                      <div className="p-6 text-center text-xs text-slate-400">
                        {botUsersLoading ? 'Aniqlanmoqda...' : 'Hozircha foydalanuvchilar topilmadi.'}
                      </div>
                    )}
                  </div>
                </div>

                {/* Switch to New Bot Token Card */}
                <div className="p-8 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex items-center gap-3">
                    <Key className="w-6 h-6 text-amber-500" />
                    <div>
                      <h3 className="text-base font-black uppercase">Yangi Bot Tokenni Ulash</h3>
                      <p className="text-xs text-slate-500">Yangi bot tokenini kiriting — server darhol ulanadi.</p>
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <input
                      type="text"
                      placeholder="123456789:ABCdefGHI..."
                      value={newTokenInput}
                      onChange={e => setNewTokenInput(e.target.value)}
                      className="flex-1 px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-mono outline-none"
                    />
                    <button
                      onClick={handleUpdateBotToken}
                      disabled={tokenLoading || !newTokenInput}
                      className="px-6 py-3 bg-amber-500 hover:bg-amber-600 disabled:opacity-50 text-white rounded-2xl font-black text-xs uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <RefreshCw className={`w-4 h-4 ${tokenLoading ? 'animate-spin' : ''}`} />
                      {tokenLoading ? 'Ulanmoqda...' : 'Botni Ulash'}
                    </button>
                  </div>
                  {tokenStatus && (
                    <p className="text-xs font-bold p-3 rounded-xl bg-slate-100 dark:bg-slate-900">{tokenStatus}</p>
                  )}
                </div>

                {/* 24/7 Webhook Card */}
                <div className="p-8 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4">
                  <div className="flex items-center gap-3">
                    <Radio className="w-6 h-6 text-emerald-500" />
                    <div>
                      <h3 className="text-base font-black uppercase">24/7 Doimiy Webhook Rejimi</h3>
                      <p className="text-xs text-slate-500">Brauzer yopiq bo‘lganda ham Telegram bot uzluksiz ishlaydi.</p>
                    </div>
                  </div>
                  <button
                    onClick={handleActivateWebhook}
                    disabled={webhookLoading}
                    className="w-full py-3.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-2xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${webhookLoading ? 'animate-spin' : ''}`} />
                    {webhookLoading ? 'Faollashtirilmoqda...' : 'Doimiy Webhookni Faollashtirish'}
                  </button>
                  {webhookStatus && (
                    <p className="text-xs font-bold p-3 rounded-xl bg-slate-100 dark:bg-slate-900">{webhookStatus}</p>
                  )}
                </div>
              </div>
            )}

            {/* SCHOOLS DIRECTORY */}
            {activeTab === 'schools' && (
              <div className="space-y-6">
                <div className="p-6 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black uppercase">Maktablar Ro'yxati</h3>
                    <p className="text-xs font-semibold text-slate-400 tabular-nums">Jami {filteredSchools.length} ta maktab</p>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {filteredSchools.map(s => (
                    <div key={s.id} className="p-6 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4">
                      <div className="flex items-center justify-between">
                        <span className="w-10 h-10 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                          <SchoolIcon className="w-5 h-5" />
                        </span>
                        <span className="px-3 py-1 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 rounded-lg text-[10px] font-black uppercase tabular-nums">
                          {s.totalCoins || 0} ECO
                        </span>
                      </div>
                      <div>
                        <h4 className="text-base font-black">{s.name}</h4>
                        <p className="text-xs text-slate-400 font-semibold">{s.region} · {s.district}</p>
                      </div>
                      <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 tabular-nums">
                        <span>O'quvchilar: <b>{s.registeredStudentsCount || s.studentsCount || 0}</b></span>
                        <span>Daraxtlar: <b>{s.treesPlanted || 0}</b></span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* VOUCHER VERIFIER TAB */}
            {activeTab === 'voucher_verifier' && <VoucherVerifierPanel />}

            {/* SHOP ORDERS MANAGEMENT */}
            {activeTab === 'shop_orders' && (
              <div className="space-y-6">
                <VoucherVerifierPanel />
                <div className="p-6 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black uppercase">Sovg'a Buyurtmalari</h3>
                    <p className="text-xs font-semibold text-slate-400 tabular-nums">Jami {filteredOrders.length} ta buyurtma</p>
                  </div>
                </div>
                {filteredOrders.length === 0 ? (
                  <div className="p-12 text-center bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 text-slate-400 text-xs font-bold uppercase">
                    Hozircha buyurtmalar yo'q
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {filteredOrders.map(order => (
                      <div key={order.id} className="p-6 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <h4 className="text-base font-black">{order.itemTitle}</h4>
                            <p className="text-xs text-slate-400 font-semibold">{order.userName} · {order.schoolName}</p>
                          </div>
                          <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase ${
                            order.status === 'delivered'
                              ? 'bg-emerald-500/10 text-emerald-500'
                              : order.status === 'cancelled'
                              ? 'bg-rose-500/10 text-rose-500'
                              : 'bg-amber-500/10 text-amber-500'
                          }`}>
                            {order.status}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-xs font-mono text-slate-500 tabular-nums">
                          <span>Vaucher: <b className="text-slate-900 dark:text-white">{order.voucherCode}</b></span>
                          <span className="font-black text-amber-500">{order.priceCoins} ECO</span>
                        </div>
                        {order.status !== 'delivered' && order.status !== 'cancelled' && (
                          <div className="flex gap-2 pt-2">
                            <button
                              onClick={() => updateShopOrderStatus(order.id, 'delivered')}
                              className="flex-1 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer"
                            >
                              Topshirildi
                            </button>
                            <button
                              onClick={() => updateShopOrderStatus(order.id, 'cancelled')}
                              className="px-4 py-2.5 bg-rose-500/10 text-rose-500 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer"
                            >
                              Bekor qilish
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ECO ADS MANAGEMENT */}
            {activeTab === 'ads' && (
              <div className="space-y-6">
                <div className="p-6 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 flex items-center justify-between">
                  <div>
                    <h3 className="text-lg font-black uppercase">Hamkorlik Reklamalari</h3>
                    <p className="text-xs font-semibold text-slate-400 tabular-nums">Jami {ecoAds.length} ta kampaniya</p>
                  </div>
                  <button
                    onClick={openCreateAdModal}
                    className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer"
                  >
                    + Yangi Reklama
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {ecoAds.map(ad => (
                    <div key={ad.id} className="p-5 bg-white dark:bg-[#0f172a] rounded-3xl border border-slate-200 dark:border-slate-800 space-y-4">
                      <div className="relative aspect-video rounded-2xl overflow-hidden bg-slate-100 dark:bg-slate-900">
                        <img
                          src={resolveMediaUrl(ad.imageUrl) || heroEcoForestImg}
                          alt={ad.title}
                          loading="lazy"
                          onError={e => {
                            e.currentTarget.src = heroEcoForestImg;
                          }}
                          className="w-full h-full object-cover"
                        />
                        {ad.videoUrl && (
                          <span className="absolute bottom-2.5 left-2.5 px-2 py-0.5 rounded-lg bg-black/75 text-white text-[10px] font-bold">
                            VIDEO
                          </span>
                        )}
                        <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-lg bg-slate-950/75 text-white text-[10px] font-black uppercase tabular-nums">
                            {ad.skipAfterSeconds || 15}s
                          </span>
                          {ad.rewardCoins ? (
                            <span className="px-2 py-0.5 rounded-lg bg-amber-500 text-slate-950 text-[10px] font-black uppercase tabular-nums">
                              +{ad.rewardCoins} EC
                            </span>
                          ) : null}
                        </div>
                        <span className={`absolute top-2.5 right-2.5 px-2.5 py-0.5 rounded-lg text-[10px] font-black uppercase ${
                          ad.status === 'active'
                            ? 'bg-emerald-500 text-white'
                            : ad.status === 'paused'
                            ? 'bg-rose-500 text-white'
                            : 'bg-amber-500 text-white'
                        }`}>
                          {ad.status}
                        </span>
                      </div>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2.5 min-w-0">
                            <div className="w-8 h-8 rounded-full overflow-hidden bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                              {/^(https?:\/\/|\/uploads\/|\/assets\/|data:image\/)/i.test(String(ad.sponsorLogo || '').trim()) ? (
                                <img
                                  src={resolveMediaUrl(ad.sponsorLogo || '')}
                                  alt={ad.sponsorName}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <span className="text-xs font-black text-emerald-500">
                                  {ad.sponsorLogo && ad.sponsorLogo.trim().length <= 3
                                    ? ad.sponsorLogo
                                    : (ad.sponsorName || 'E').slice(0, 1).toUpperCase()}
                                </span>
                              )}
                            </div>
                            <div className="min-w-0">
                              <h4 className="text-base font-black leading-tight truncate">{ad.title}</h4>
                              <div className="text-[11px] font-bold text-emerald-500 truncate">{ad.sponsorName}</div>
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-slate-400 shrink-0">{ad.placement}</span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">{ad.headline} — {ad.subheadline}</p>
                        {ad.ctaUrl && (
                          <button
                            type="button"
                            onClick={() => openAdTargetUrl(ad.ctaUrl)}
                            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-sky-500 hover:text-sky-400 cursor-pointer pt-1"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                            <span className="truncate max-w-[260px]">{ad.ctaUrl}</span>
                          </button>
                        )}
                      </div>

                      <div className="flex flex-wrap gap-2">
                        <button
                          onClick={() => openEditAdModal(ad)}
                          className="px-3.5 py-2.5 bg-sky-500/10 text-sky-500 border border-sky-500/20 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer flex items-center gap-1"
                        >
                          <Edit2 className="w-3.5 h-3.5" /> Tahrirlash
                        </button>
                        <button
                          onClick={() => updateEcoAdStatus(ad.id, ad.status === 'active' ? 'paused' : 'active')}
                          className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer ${
                            ad.status === 'active'
                              ? 'bg-amber-500/10 text-amber-500'
                              : 'bg-emerald-600 text-white'
                          }`}
                        >
                          {ad.status === 'active' ? "To'xtatish" : 'Faollashtirish'}
                        </button>
                        <button
                          onClick={() => deleteEcoAd(ad.id)}
                          className="px-3 py-2.5 bg-rose-500/10 text-rose-500 rounded-xl text-[10px] font-black uppercase tracking-widest cursor-pointer"
                          title="O'chirish"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* SUPER ADMIN HOME POSTS CMS */}
            {activeTab === 'home_posts' && user.role === 'super_admin' && <HomePostsManagerPanel />}

            {/* SUPER ADMIN DAILY MISSIONS MANAGER */}
            {activeTab === 'daily_missions' && user.role === 'super_admin' && <DailyMissionsManagerPanel />}

            {/* FIREBASE INFO GUIDE */}
            {activeTab === 'firebase_guide' && (
              <div className="max-w-4xl mx-auto">
                <div className="p-8 bg-gradient-to-br from-indigo-950 to-slate-900 rounded-3xl border border-slate-800 text-white space-y-6 shadow-xl">
                  <div className="flex items-center gap-4">
                    <div className="w-14 h-14 rounded-2xl bg-amber-500 text-white flex items-center justify-center">
                      <Database className="w-8 h-8" />
                    </div>
                    <div>
                      <h2 className="text-2xl font-black uppercase tracking-tight">Firebase & Firestore Security</h2>
                      <p className="text-xs font-semibold text-amber-400 uppercase tracking-wider">RBAC va Server-Tomon Himoyasi Faol</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-white/10 text-xs">
                    <div className="p-5 bg-black/40 rounded-2xl border border-white/10 font-mono space-y-1.5 text-slate-300">
                      <div className="text-emerald-400 font-bold mb-2">Firestore Collections</div>
                      <div>/users · /registrationApplications</div>
                      <div>/schools · /reports · /mediaSubmissions</div>
                      <div>/ecoTasks · /rewardSettings</div>
                      <div>/coinTransactions · /auditLogs</div>
                    </div>
                    <div className="p-5 bg-white/5 rounded-2xl border border-white/10 space-y-2 text-slate-300">
                      <div className="text-sky-400 font-bold uppercase">Xavfsizlik Kafolatlari</div>
                      <p>HMAC-SHA256 Session Token · Role & Territory Scoping · SHA-256 Media Dedup · Hazard Safeguards</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </main>

      {/* Create / Edit Shop Item Modal */}
      {showShopCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#0f172a] w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl my-4">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black uppercase">
                {editingShopItem ? "Sovg'ani Tahrirlash" : "Yangi Sovg'a Qo'shish"}
              </h3>
              <button
                onClick={() => {
                  setShowShopCreateModal(false);
                  setEditingShopItem(null);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <input
                type="text"
                placeholder="Sovg'a nomi"
                value={newShopTitle}
                onChange={e => setNewShopTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
              />
              <textarea
                rows={2}
                placeholder="Sovg'a tavsifi"
                value={newShopDesc}
                onChange={e => setNewShopDesc(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none resize-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="number"
                  placeholder="Narxi (EcoCoin)"
                  value={newShopPrice}
                  onChange={e => setNewShopPrice(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                />
                <input
                  type="number"
                  placeholder="Zaxira soni"
                  value={newShopStock}
                  onChange={e => setNewShopStock(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                />
              </div>
              <select
                value={newShopCategory}
                onChange={e => setNewShopCategory(e.target.value as any)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
              >
                <option value="accessories">Aksessuarlar</option>
                <option value="stationery">O'quv qurollari</option>
                <option value="eco_home">Eko uy</option>
                <option value="education">Ta'lim</option>
              </select>
              <input
                type="text"
                placeholder="Homiy nomi"
                value={newShopSponsor}
                onChange={e => setNewShopSponsor(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
              />
              <label className="w-full px-4 py-3 rounded-2xl bg-emerald-500/10 border border-dashed border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-xs font-bold flex items-center justify-center gap-2 cursor-pointer">
                <ImageIcon className="w-4 h-4" />
                <span>{uploadingShopImg ? 'Rasm yuklanmoqda...' : "Qurilmadan rasm yuklash"}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={e => handleAdminFileUpload(e, 'shop_img')}
                  className="hidden"
                />
              </label>
              {newShopImageUrl && (
                <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
                  <img
                    src={resolveMediaUrl(newShopImageUrl)}
                    alt="Preview"
                    className="w-12 h-12 rounded-xl object-cover shrink-0"
                  />
                  <span className="text-[11px] text-emerald-500 font-bold truncate">Rasm biriktirildi</span>
                </div>
              )}
              <input
                type="text"
                placeholder="Yoki rasm havolasi (ixtiyoriy)"
                value={newShopImageUrl}
                onChange={e => setNewShopImageUrl(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
              />
              <GiftGateConfigEditor
                gate={newShopGate}
                onChange={setNewShopGate}
                ecoAds={ecoAds}
              />
            </div>
            <button
              disabled={savingShopItem || uploadingShopImg}
              onClick={async () => {
                if (!newShopTitle.trim() || savingShopItem) return;
                setSavingShopItem(true);
                try {
                  const payload = {
                    title: newShopTitle.trim(),
                    description: newShopDesc.trim() || `${newShopTitle.trim()} - ECO HERO rasmiy sovg'asi`,
                    priceCoins: Math.max(10, Number(newShopPrice) || 500),
                    stock: Math.max(0, Number(newShopStock) || 10),
                    category: newShopCategory,
                    sponsorName: newShopSponsor.trim() || 'ECO HERO',
                    imageUrl:
                      newShopImageUrl.trim() ||
                      'https://images.unsplash.com/photo-1523275335684-37898b6baf30?auto=format&fit=crop&q=80&w=600',
                    redemptionGate: newShopGate,
                  };
                  if (editingShopItem) {
                    const ok = await updateShopItem(editingShopItem.id, payload);
                    if (!ok) return;
                  } else {
                    const ok = await createShopItem(payload);
                    if (!ok) return;
                  }
                  setShowShopCreateModal(false);
                  setEditingShopItem(null);
                  setNewShopTitle('');
                } finally {
                  setSavingShopItem(false);
                }
              }}
              className="w-full py-3.5 bg-emerald-600 disabled:opacity-50 text-white rounded-2xl text-xs font-black uppercase tracking-widest cursor-pointer"
            >
              {savingShopItem ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </div>
      )}

      {/* Create / Edit EcoAd Modal */}
      {showAdCreateModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/80 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-[#0f172a] w-full max-w-lg rounded-3xl border border-slate-200 dark:border-slate-800 p-6 space-y-4 shadow-2xl my-8 max-h-[92vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black uppercase">
                {editingAdItem ? 'Reklamani Tahrirlash' : 'Yangi Hamkorlik Reklamasi'}
              </h3>
              <button
                onClick={() => {
                  setShowAdCreateModal(false);
                  setEditingAdItem(null);
                }}
                className="p-2 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-3">
              <select
                value={newAdPlacement}
                onChange={e => setNewAdPlacement(e.target.value as any)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
              >
                <option value="earn_coins">Reklama ko'rib EcoCoin olish</option>
                <option value="post_purchase">Sovg'a sotib olgandan keyin</option>
                <option value="home_top">Bosh sahifa tepa banneri</option>
                <option value="shop_top">Do'kon tepa banneri</option>
              </select>

              <div className="space-y-1.5">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-1">
                  Reklama davomiyligi (5 – 300 soniya)
                </label>
                <div className="flex flex-wrap gap-1.5">
                  {[
                    { sec: '15', label: '15s' },
                    { sec: '30', label: '30s' },
                    { sec: '60', label: '1 min' },
                    { sec: '90', label: '1.5 min' },
                    { sec: '120', label: '2 min' },
                  ].map(preset => (
                    <button
                      key={preset.sec}
                      type="button"
                      onClick={() => setNewAdSkipSeconds(preset.sec)}
                      className={`px-3 py-1.5 rounded-xl text-[11px] font-black cursor-pointer transition-all ${
                        newAdSkipSeconds === preset.sec
                          ? 'bg-emerald-600 text-white'
                          : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <input
                    type="number"
                    min={5}
                    max={300}
                    placeholder="Soniyalar"
                    value={newAdSkipSeconds}
                    onChange={e => setNewAdSkipSeconds(e.target.value)}
                    className="w-20 px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none text-center tabular-nums"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {(
                  [
                    { id: 'website', label: 'Sayt', icon: Globe },
                    { id: 'telegram_bot', label: 'TG Bot', icon: Bot },
                    { id: 'telegram_channel', label: 'TG Kanal', icon: Send },
                  ] as const
                ).map(item => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setNewAdCtaType(item.id)}
                      className={`py-2 px-2 rounded-xl border text-[11px] font-black flex items-center justify-center gap-1.5 cursor-pointer ${
                        newAdCtaType === item.id
                          ? 'bg-sky-500/15 border-sky-500 text-sky-500'
                          : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-500'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              <input
                type="text"
                placeholder="Reklama nomi"
                value={newAdTitle}
                onChange={e => setNewAdTitle(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
              />
              <input
                type="text"
                placeholder="Homiy tashkilot"
                value={newAdSponsor}
                onChange={e => setNewAdSponsor(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
              />
              <textarea
                rows={2}
                placeholder="Sarlavha (Headline)"
                value={newAdHeadline}
                onChange={e => setNewAdHeadline(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none resize-none"
              />
              <input
                type="text"
                placeholder="Qisqa tavsif (Subheadline)"
                value={newAdSubheadline}
                onChange={e => setNewAdSubheadline(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
              />
              {/* Primary Ad Cover / Screen Image (Always visible before video play) */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-emerald-500/30 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-extrabold text-emerald-700 dark:text-emerald-300">
                    Reklama ekran rasmi (Videodan oldin tashqaridan ko&apos;rinadi)
                  </span>
                  {newAdImageUrl && (
                    <button
                      type="button"
                      onClick={() => setNewAdImageUrl('/assets/schools/eco_courtyard.jpg')}
                      className="text-[10px] font-bold text-slate-400 hover:text-emerald-500 cursor-pointer"
                    >
                      Standart rasm
                    </button>
                  )}
                </div>
                <div className="relative w-full aspect-video rounded-xl overflow-hidden bg-slate-950 border border-slate-200 dark:border-slate-800">
                  <img
                    src={resolveMediaUrl(newAdImageUrl) || heroEcoForestImg}
                    onError={e => {
                      e.currentTarget.src = heroEcoForestImg;
                    }}
                    alt="Reklama ekran rasmi"
                    className="w-full h-full object-cover"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <label className="px-3 py-2.5 rounded-xl bg-sky-500/15 border border-dashed border-sky-500/50 text-sky-600 dark:text-sky-300 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                    <ImageIcon className="w-4 h-4 shrink-0" />
                    <span>{uploadingAdImg ? 'Yuklanmoqda...' : 'Ekran rasmini yuklash'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleAdminFileUpload(e, 'ad_img')}
                      className="hidden"
                    />
                  </label>
                  <label className="px-3 py-2.5 rounded-xl bg-emerald-500/10 border border-dashed border-emerald-500/40 text-emerald-600 dark:text-emerald-400 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                    <Film className="w-4 h-4 shrink-0" />
                    <span>{uploadingAdVideo ? 'Video yuklanmoqda...' : newAdVideoUrl ? 'Video almashtirish' : 'Video fayl yuklash'}</span>
                    <input
                      type="file"
                      accept="video/*,.mp4,.mov,.webm,.m4v"
                      onChange={e => handleAdminFileUpload(e, 'ad_video')}
                      className="hidden"
                    />
                  </label>
                </div>
                {newAdVideoUrl && (
                  <div className="space-y-1.5 pt-1">
                    <video
                      src={resolveMediaUrl(newAdVideoUrl)}
                      poster={resolveMediaUrl(newAdImageUrl) || heroEcoForestImg}
                      controls
                      playsInline
                      className="w-full max-h-36 rounded-2xl bg-black object-contain"
                    />
                    <div className="flex items-center justify-between text-[11px] text-emerald-500 font-bold px-2">
                      <span className="truncate">Video biriktirildi</span>
                      <button
                        type="button"
                        onClick={() => {
                          setNewAdVideoUrl('');
                          setNewAdType('banner');
                        }}
                        className="text-rose-500 cursor-pointer shrink-0 ml-2"
                      >
                        Olib tashlash
                      </button>
                    </div>
                  </div>
                )}
              </div>

              {/* Secondary Optional Small Sponsor Corner Logo */}
              <div className="p-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full overflow-hidden bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
                    {/^(https?:\/\/|\/uploads\/|\/assets\/|data:image\/)/i.test(newAdSponsorLogo.trim()) ? (
                      <img
                        src={resolveMediaUrl(newAdSponsorLogo)}
                        alt="Homiy belgisi"
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <span className="text-xs font-black text-emerald-500">
                        {newAdSponsorLogo && newAdSponsorLogo.trim().length <= 3
                          ? newAdSponsorLogo
                          : (newAdSponsor || newAdTitle || 'E').slice(0, 1).toUpperCase()}
                      </span>
                    )}
                  </div>
                  <label className="flex-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold flex items-center justify-center gap-1.5 cursor-pointer">
                    <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                    <span>{uploadingAdLogo ? 'Yuklanmoqda...' : 'Kichik homiy belgisi (ixtiyoriy)'}</span>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={e => handleAdminFileUpload(e, 'ad_logo')}
                      className="hidden"
                    />
                  </label>
                  {/^(https?:\/\/|\/uploads\/|\/assets\/|data:image\/)/i.test(newAdSponsorLogo.trim()) && (
                    <button
                      type="button"
                      onClick={() => setNewAdSponsorLogo('')}
                      className="px-2.5 py-2 rounded-xl bg-rose-500/10 text-rose-500 text-[10px] font-bold cursor-pointer"
                    >
                      O&lsquo;chirish
                    </button>
                  )}
                </div>
              </div>
              <input
                type="text"
                placeholder="Rasm havolasi (ixtiyoriy)"
                value={newAdImageUrl}
                onChange={e => setNewAdImageUrl(e.target.value)}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
              />
              <input
                type="text"
                placeholder="Video havolasi (ixtiyoriy .mp4/.mov)"
                value={newAdVideoUrl}
                onChange={e => {
                  setNewAdVideoUrl(e.target.value);
                  if (e.target.value.trim()) setNewAdType('video');
                }}
                className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  type="text"
                  placeholder="Tugma matni (Batafsil)"
                  value={newAdCtaText}
                  onChange={e => setNewAdCtaText(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                />
                <input
                  type="text"
                  placeholder="Manzil URL (https://...)"
                  value={newAdUrl}
                  onChange={e => setNewAdUrl(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                />
              </div>
              {newAdPlacement === 'earn_coins' && (
                <input
                  type="number"
                  placeholder="Mukofot (100 EcoCoin)"
                  value={newAdRewardCoins}
                  onChange={e => setNewAdRewardCoins(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-bold outline-none"
                />
              )}
              <label className="flex items-center gap-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer px-1">
                <input
                  type="checkbox"
                  checked={newAdClickOpensLink}
                  onChange={e => setNewAdClickOpensLink(e.target.checked)}
                  className="w-4 h-4 accent-emerald-600 rounded"
                />
                <span>Reklama bosilganda to'g'ridan-to'g'ri havolaga o'tsin</span>
              </label>
            </div>
            <button
              disabled={savingAdItem || uploadingAdImg || uploadingAdLogo || uploadingAdVideo}
              onClick={async () => {
                if (!newAdTitle.trim() || savingAdItem) return;
                setSavingAdItem(true);
                try {
                  const cleanSkip = Math.max(5, Math.min(300, Number(newAdSkipSeconds) || 15));
                  const cleanReward = Math.max(10, Number(newAdRewardCoins) || 100);
                  const cleanLogo = newAdSponsorLogo.trim() || '🌿';
                  const resolvedType = newAdVideoUrl.trim() ? 'video' : newAdType;
                  if (editingAdItem) {
                    const res = await updateEcoAd(editingAdItem.id, {
                      title: newAdTitle.trim(),
                      sponsorName: newAdSponsor.trim() || 'Eco Sponsor',
                      sponsorLogo: cleanLogo,
                      type: resolvedType,
                      placement: newAdPlacement,
                      headline: newAdHeadline.trim() || newAdTitle.trim(),
                      subheadline: newAdSubheadline.trim(),
                      imageUrl: newAdImageUrl.trim() || '/assets/schools/eco_courtyard.jpg',
                      videoUrl: newAdVideoUrl.trim() || undefined,
                      ctaText: newAdCtaText.trim() || "Batafsil ko'rish",
                      ctaUrl: newAdUrl.trim() || 'https://t.me/Ecoheros_bot',
                      ctaType: newAdCtaType,
                      clickOpensLink: newAdClickOpensLink,
                      rewardCoins: newAdPlacement === 'earn_coins' ? cleanReward : 0,
                      skipAfterSeconds: cleanSkip,
                    });
                    if (!res.success) return;
                  } else {
                    const ok = await createEcoAd({
                      title: newAdTitle.trim(),
                      sponsorId: `sp_${Date.now()}`,
                      sponsorName: newAdSponsor.trim() || 'Eco Sponsor',
                      sponsorLogo: cleanLogo,
                      type: resolvedType,
                      placement: newAdPlacement,
                      headline: newAdHeadline.trim() || newAdTitle.trim(),
                      subheadline:
                        newAdSubheadline.trim() ||
                        (newAdPlacement === 'earn_coins'
                          ? `${cleanSkip} soniya reklama ko‘rib +${cleanReward} EcoCoin oling!`
                          : 'Ekologik hamkorlik dasturi'),
                      imageUrl: newAdImageUrl.trim() || '/assets/schools/eco_courtyard.jpg',
                      videoUrl: newAdVideoUrl.trim() ? newAdVideoUrl.trim() : undefined,
                      ctaText: newAdCtaText.trim() || "Batafsil ko'rish",
                      ctaUrl: newAdUrl.trim() || 'https://t.me/Ecoheros_bot',
                      ctaType: newAdCtaType,
                      clickOpensLink: newAdClickOpensLink,
                      isVerifiedSponsor: true,
                      startDate: new Date().toISOString().split('T')[0],
                      endDate: new Date(Date.now() + 30 * 86400000).toISOString().split('T')[0],
                      status: 'active',
                      complianceNote:
                        newAdPlacement === 'earn_coins'
                          ? `+${cleanReward} EcoCoin mukofot (${cleanSkip}s)`
                          : `${cleanSkip} soniyadan keyin o‘tkazib yuborish`,
                      rewardCoins: newAdPlacement === 'earn_coins' ? cleanReward : 0,
                      skipAfterSeconds: cleanSkip,
                    });
                    if (!ok) return;
                  }
                  setShowAdCreateModal(false);
                  setEditingAdItem(null);
                  setNewAdTitle('');
                  setNewAdSponsorLogo('');
                  setNewAdHeadline('');
                  setNewAdSubheadline('');
                  setNewAdVideoUrl('');
                } finally {
                  setSavingAdItem(false);
                }
              }}
              className="w-full py-3.5 bg-emerald-600 disabled:opacity-50 text-white rounded-2xl text-xs font-black uppercase tracking-widest cursor-pointer"
            >
              {savingAdItem ? 'Saqlanmoqda...' : editingAdItem ? 'Yangilash' : 'Yaratish'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
