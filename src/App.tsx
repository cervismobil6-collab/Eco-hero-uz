import React, { Suspense, lazy, useEffect } from 'react';
import { EcoProvider, useEco } from './context/EcoContext';
import { Navbar } from './components/layout/Navbar';
import { MobileNav } from './components/layout/MobileNav';
import { Footer } from './components/layout/Footer';
import { AuthModal } from './components/auth/AuthModal';
import { OnboardingModal } from './components/auth/OnboardingModal';
import { RoleRequestModal } from './components/auth/RoleRequestModal';

// Home Page is loaded directly for instant 0ms first-paint
import { HomePage } from './pages/HomePage';

// Code-Split All Heavy Sub-Pages for Lightning-Fast Initial Telegram Load
const EcoMapPage = lazy(() => import('./pages/EcoMapPage').then(m => ({ default: m.EcoMapPage })));
const ReportProblemPage = lazy(() => import('./pages/ReportProblemPage').then(m => ({ default: m.ReportProblemPage })));
const EcoAiPage = lazy(() => import('./pages/EcoAiPage').then(m => ({ default: m.EcoAiPage })));
const EcoCoinPage = lazy(() => import('./pages/EcoCoinPage').then(m => ({ default: m.EcoCoinPage })));
const EcoShopPage = lazy(() => import('./pages/EcoShopPage').then(m => ({ default: m.EcoShopPage })));
const EcoRatingPage = lazy(() => import('./pages/EcoRatingPage').then(m => ({ default: m.EcoRatingPage })));
const EcoSchoolPage = lazy(() => import('./pages/EcoSchoolPage').then(m => ({ default: m.EcoSchoolPage })));
const EcoPartnersPage = lazy(() => import('./pages/EcoPartnersPage').then(m => ({ default: m.EcoPartnersPage })));
const EcoMediaPage = lazy(() => import('./pages/EcoMediaPage').then(m => ({ default: m.EcoMediaPage })));
const AdminDashboardPage = lazy(() => import('./pages/AdminDashboardPage').then(m => ({ default: m.AdminDashboardPage })));
const EcoReferralPage = lazy(() => import('./pages/EcoReferralPage').then(m => ({ default: m.EcoReferralPage })));
const EcoRewardsHubPage = lazy(() => import('./pages/EcoRewardsHubPage').then(m => ({ default: m.EcoRewardsHubPage })));
const EcoMissionsPage = lazy(() => import('./pages/EcoMissionsPage').then(m => ({ default: m.EcoMissionsPage })));
const EcoChampionshipPage = lazy(() => import('./pages/EcoChampionshipPage').then(m => ({ default: m.EcoChampionshipPage })));
const EcoImpactPage = lazy(() => import('./pages/EcoImpactPage').then(m => ({ default: m.EcoImpactPage })));
const EcoProfilePage = lazy(() => import('./pages/EcoProfilePage').then(m => ({ default: m.EcoProfilePage })));
const VoucherPublicPage = lazy(() => import('./pages/VoucherPublicPage').then(m => ({ default: m.VoucherPublicPage })));

import { GlobalErrorBoundary } from './components/common/GlobalErrorBoundary';
import { OfflineSyncBanner } from './components/common/OfflineSyncBanner';
import { CheckCircle2, AlertTriangle, X, Loader2, Sparkles, WifiOff, RotateCw } from 'lucide-react';

function getVoucherCodeFromLocation(): string | null {
  try {
    const pathMatch = window.location.pathname.match(/^\/voucher\/([A-Za-z0-9\-_]+)/i);
    if (pathMatch?.[1]) return pathMatch[1].toUpperCase();
    const params = new URLSearchParams(window.location.search);
    const qVoucher = params.get('voucher');
    if (qVoucher && qVoucher.trim()) return qVoucher.trim().toUpperCase();
  } catch {
    // ignore URL parsing errors
  }
  return null;
}

// Ultra-Smooth Native Telegram Shimmer Skeleton
const PageSkeletonLoader: React.FC = () => {
  return (
    <div className="max-w-7xl mx-auto px-4 py-8 space-y-6 animate-pulse">
      {/* Header Skeleton */}
      <div className="h-32 rounded-3xl bg-slate-900/40 border border-slate-800/60 p-6 flex items-center justify-between">
        <div className="space-y-3 w-2/3">
          <div className="h-4 w-32 bg-emerald-500/20 rounded-full" />
          <div className="h-8 w-64 bg-slate-800 rounded-2xl" />
          <div className="h-3 w-48 bg-slate-800/60 rounded-full" />
        </div>
        <div className="w-12 h-12 rounded-2xl bg-slate-800/80 flex items-center justify-center">
          <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
        </div>
      </div>

      {/* Grid Skeleton */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="h-48 rounded-3xl bg-slate-900/30 border border-slate-800/40 p-6 space-y-4" />
        <div className="h-48 rounded-3xl bg-slate-900/30 border border-slate-800/40 p-6 space-y-4" />
        <div className="h-48 rounded-3xl bg-slate-900/30 border border-slate-800/40 p-6 space-y-4" />
      </div>

      {/* Content Skeleton */}
      <div className="h-96 rounded-3xl bg-slate-900/20 border border-slate-800/30 p-8 flex flex-col items-center justify-center text-center space-y-3">
        <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400">
          <Sparkles className="w-6 h-6 animate-bounce" />
        </div>
        <div className="h-4 w-40 bg-slate-800 rounded-full" />
        <div className="h-3 w-24 bg-slate-800/60 rounded-full" />
      </div>
    </div>
  );
};

const AppContent: React.FC = () => {
  const {
    activeTab,
    setActiveTab,
    triggerHaptic,
    notification,
    clearNotification,
    authModalOpen,
    closeAuthModal,
    onboardingModalOpen,
    closeOnboardingModal,
    editProfileModalOpen,
    closeEditProfileModal,
    roleRequestModalOpen,
    closeRoleRequestModal,
    targetRequestedRole,
    isOnline,
    isServerConnected,
    isCheckingConnection,
    checkServerHealth,
  } = useEco();

  const [publicVoucherCode, setPublicVoucherCode] = React.useState<string | null>(() => getVoucherCodeFromLocation());
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = React.useState(false);

  useEffect(() => {
    const onQuotaExceeded = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', onQuotaExceeded);
    return () => window.removeEventListener('gmp-quota-exceeded', onQuotaExceeded);
  }, []);

  useEffect(() => {
    const onPopState = () => {
      setPublicVoucherCode(getVoucherCodeFromLocation());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const exitPublicVoucherView = (targetTab: 'home' | 'shop') => {
    try {
      window.history.pushState({}, '', '/');
    } catch {
      // ignore
    }
    setPublicVoucherCode(null);
    setActiveTab(targetTab);
  };

  // Telegram Native BackButton Sync
  useEffect(() => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (!tg?.BackButton) return;

      if (activeTab !== 'home') {
        tg.BackButton.show();
        const handleBack = () => {
          triggerHaptic('light');
          setActiveTab('home');
        };
        tg.BackButton.onClick(handleBack);
        return () => {
          tg.BackButton.offClick(handleBack);
        };
      } else {
        tg.BackButton.hide();
      }
    } catch (e) {
      // ignore
    }
  }, [activeTab, setActiveTab, triggerHaptic]);

  // Idle Preload of lightweight secondary tabs (avoid preloading heavy 1.2MB map bundle at Mini App startup)
  useEffect(() => {
    if ('requestIdleCallback' in window) {
      (window as any).requestIdleCallback(() => {
        import('./pages/EcoAiPage');
        import('./pages/EcoRewardsHubPage');
        import('./pages/EcoMissionsPage');
        import('./pages/EcoProfilePage');
      });
    }
  }, []);

  const renderActivePage = () => {
    switch (activeTab) {
      case 'home':
        return <HomePage />;
      case 'map':
      case 'recycle':
        return (
          <Suspense fallback={<PageSkeletonLoader />}>
            <EcoMapPage />
          </Suspense>
        );
      case 'report':
        return (
          <Suspense fallback={<PageSkeletonLoader />}>
            <ReportProblemPage />
          </Suspense>
        );
      case 'ai':
      case 'quiz':
      case 'knowledge':
      case 'innovation':
        return (
          <Suspense fallback={<PageSkeletonLoader />}>
            <EcoAiPage />
          </Suspense>
        );
      case 'coins':
      case 'coin':
        return (
          <Suspense fallback={<PageSkeletonLoader />}>
            <EcoCoinPage />
          </Suspense>
        );
      case 'shop':
        return (
          <Suspense fallback={<PageSkeletonLoader />}>
            <EcoShopPage />
          </Suspense>
        );
      case 'rating':
      case 'leaderboard':
        return (
          <Suspense fallback={<PageSkeletonLoader />}>
            <EcoRatingPage />
          </Suspense>
        );
      case 'school':
      case 'ambassador':
        return (
          <Suspense fallback={<PageSkeletonLoader />}>
            <EcoSchoolPage />
          </Suspense>
        );
      case 'referral':
      case 'referrals':
      case 'invite':
        return (
          <Suspense fallback={<PageSkeletonLoader />}>
            <EcoReferralPage />
          </Suspense>
        );
      case 'partners':
        return (
          <Suspense fallback={<PageSkeletonLoader />}>
            <EcoPartnersPage />
          </Suspense>
        );
      case 'media':
      case 'creator':
        return (
          <Suspense fallback={<PageSkeletonLoader />}>
            <EcoMediaPage />
          </Suspense>
        );
      case 'admin':
        return (
          <Suspense fallback={<PageSkeletonLoader />}>
            <AdminDashboardPage />
          </Suspense>
        );
      case 'rewards':
      case 'eco_rewards':
        return (
          <Suspense fallback={<PageSkeletonLoader />}>
            <EcoRewardsHubPage />
          </Suspense>
        );
      case 'missions':
      case 'tasks':
        return (
          <Suspense fallback={<PageSkeletonLoader />}>
            <EcoMissionsPage />
          </Suspense>
        );
      case 'championship':
      case 'battle':
      case 'school_battle':
        return (
          <Suspense fallback={<PageSkeletonLoader />}>
            <EcoChampionshipPage />
          </Suspense>
        );
      case 'impact':
      case 'analytics':
        return (
          <Suspense fallback={<PageSkeletonLoader />}>
            <EcoImpactPage />
          </Suspense>
        );
      case 'profile':
      case 'user':
        return (
          <Suspense fallback={<PageSkeletonLoader />}>
            <EcoProfilePage />
          </Suspense>
        );
      default:
        return <HomePage />;
    }
  };

  if (publicVoucherCode) {
    return (
      <Suspense fallback={<PageSkeletonLoader />}>
        <VoucherPublicPage
          voucherCode={publicVoucherCode}
          onGoHome={() => exitPublicVoucherView('home')}
          onGoShop={() => exitPublicVoucherView('shop')}
        />
      </Suspense>
    );
  }

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col transition-colors selection:bg-emerald-500/20 selection:text-emerald-300">
      {gmpQuotaExceeded && (
        <div className="bg-amber-50 border-b border-amber-200 text-amber-900 px-4 py-2.5 text-xs md:text-sm text-center sticky top-0 z-50 shadow-sm">
          <span>
            Google Maps Platform quota reached. If you are the app owner, visit{' '}
            <a
              href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
              target="_blank"
              rel="noopener noreferrer"
              className="underline font-semibold text-amber-950 hover:text-amber-800"
            >
              maps developer site
            </a>{' '}
            for instructions to update your account.
          </span>
        </div>
      )}

      {/* Toast Notification */}
      {notification && (
        <div className="fixed top-20 right-4 z-50 max-w-sm w-[calc(100%-2rem)] animate-bounce">
          <div
            className={`p-4 rounded-2xl shadow-xl flex items-center justify-between gap-3 text-xs font-semibold ${
              notification.type === 'success'
                ? 'bg-emerald-600 text-white'
                : notification.type === 'warning'
                ? 'bg-amber-600 text-white'
                : 'bg-slate-800 text-white'
            }`}
          >
            <div className="flex items-center gap-2">
              {notification.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 shrink-0" />
              )}
              <span>{notification.message}</span>
            </div>
            <button
              onClick={clearNotification}
              className="p-1 hover:bg-white/20 rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Offline & Sync Status Banner */}
      <OfflineSyncBanner />

      {/* Top Navbar */}
      <Navbar />

      {/* Main Viewport Content */}
      <main className="flex-1 w-full max-w-full min-w-0 pb-28 xl:pb-8">
        {renderActivePage()}
      </main>

      {/* Footer (hidden on map and AI chat for full-screen experience) */}
      {!['map', 'recycle', 'ai', 'quiz', 'knowledge', 'innovation'].includes(activeTab) && <Footer />}

      {/* Floating Bottom Nav for Mobile & Telegram Mini App */}
      <MobileNav />

      {/* Authentication & User Management Modal */}
      <AuthModal isOpen={authModalOpen} onClose={closeAuthModal} />

      {/* First-time Onboarding & Profile Editing Modal */}
      <OnboardingModal
        isOpen={onboardingModalOpen || editProfileModalOpen}
        onClose={() => {
          closeOnboardingModal();
          closeEditProfileModal();
        }}
        isEditMode={editProfileModalOpen}
      />

      {/* Role Request Modal for Student Privileges requiring @jasurdost approval */}
      <RoleRequestModal
        isOpen={roleRequestModalOpen}
        onClose={closeRoleRequestModal}
        targetRole={targetRequestedRole}
      />
    </div>
  );
};

export default function App() {
  return (
    <GlobalErrorBoundary>
      <EcoProvider>
        <AppContent />
      </EcoProvider>
    </GlobalErrorBoundary>
  );
}
