import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import confetti from 'canvas-confetti';
import { computeUserStreakState } from '../utils/streak';
import {
  UserProfile,
  EcoReport,
  School,
  ShopItem,
  CoinTransaction,
  UserRole,
  ProblemStatus,
  Ambassador,
  AuditLog,
  Notification,
  ReferralRecord,
  TelegramBroadcast,
  EcoPartner,
  SponsorshipProposal,
  SponsorshipProject,
  EcoAd,
  AdWatchState,
  ShopOrder,
  RoleRequest,
  CompetitionLevel,
  CompetitionScore,
  CompetitionPeriod,
  ChampionshipResult,
  Certificate,
  RegistrationApplication,
  MediaSubmission,
  MediaCategory,
  MediaModerationStatus,
  EcoTask,
  RewardSettings,
  AnalyticsResponse,
  LeaderboardTier,
  LeaderboardPeriod,
  VoucherCheckResult,
  HomePost,
  HomePostCategory,
  DistrictLeaderboardDetailsResponse,
  MonthlyAwardRecord,
  ChatScope,
  ChatMessageKind,
  EcoChatMessage,
  ChatThreadSummary,
  ChatPermissionRequest,
  RosterDirectoryResponse,
  DistrictUserGrowthResponse,
  LiveMetrics,
  EcoMission,
  MissionSubmission,
  QuizQuestionItem,
  StudentRatingsCabinetResponse,
  StudentRatingsManageResponse,
  StudentRatingScopePayload,
  StudentMonthlyAwardRecord,
  WeeklyChallengeSummary,
  SchoolTeamMissionSummary,
  ChampionshipEligibility,
  ChampionshipLiveResponse,
} from '../types/eco';
import {
  INITIAL_USER,
  INITIAL_SHOP_ITEMS,
  INITIAL_PARTNERS,
  INITIAL_SPONSORSHIP_PROJECTS,
  INITIAL_SPONSORSHIP_PROPOSALS,
  INITIAL_ECO_ADS,
  INITIAL_COMPETITION_PERIODS,
} from '../data/mockData';
import {
  auth,
  loginWithEmail,
  registerWithEmail,
  signInWithGoogle,
  logOutFirebase,
  testFirestoreConnection,
} from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getPendingReports, removePendingReport } from '../services/offlineQueue';
import { apiUrl, wsUrl, parseApiJson, isHtmlContentType } from '../utils/api';
import {
  fetchCatalogFromFirestore,
  syncCatalogRecordToFirestore,
  deleteCatalogRecordFromFirestore,
  mergeServerAndFirestoreCatalog,
  syncLiveMetricsToFirestore,
  subscribeLiveMetricsFromFirestore,
} from '../services/firestoreCatalogSync';

// One-time cleanup of legacy cached demo records in browser storage
if (typeof window !== 'undefined') {
  try {
    if (!localStorage.getItem('ecohero_purged_demo_v2')) {
      [
        'ecohero_reports',
        'ecohero_schools',
        'ecohero_ambassadors',
        'ecohero_audit_logs',
        'ecohero_notifications',
        'ecohero_txs',
        'ecohero_referrals',
        'ecohero_broadcasts',
        'ecohero_shop_orders',
        'ecohero_competition_scores',
        'ecohero_championship_results',
        'ecohero_certificates',
        'ecohero_home_posts',
        'ecohero_monthly_awards',
        'ecohero_live_metrics',
      ].forEach((k) => {
        try {
          localStorage.removeItem(k);
        } catch {}
      });
      localStorage.setItem('ecohero_purged_demo_v2', '1');
    }
  } catch {}
}

const generateWebUid = (): string => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `user_${crypto.randomUUID()}`;
  }
  return `user_web_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const getOrCreateBrowserUid = (): string => {
  if (typeof window === 'undefined') return 'user_web_ssr';
  try {
    const existing = localStorage.getItem('ecohero_session_uid');
    if (existing && existing.startsWith('user_') && existing !== 'user_student_01') {
      return existing;
    }
    const fresh = generateWebUid();
    localStorage.setItem('ecohero_session_uid', fresh);
    return fresh;
  } catch {
    return generateWebUid();
  }
};

interface AddReportInput
  extends Omit<EcoReport, 'id' | 'createdAt' | 'upvotes' | 'reporterUid' | 'reporterName' | 'schoolName'> {
  id?: string;
  createdAt?: string;
  skipLocalReward?: boolean;
}

interface EcoContextType {
  user: UserProfile;
  studentsLeaderboard: UserProfile[];
  switchRole: (role: UserRole) => void;
  roleRequests: RoleRequest[];
  roleRequestModalOpen: boolean;
  targetRequestedRole: UserRole | null;
  openRoleRequestModal: (role: UserRole) => void;
  closeRoleRequestModal: () => void;
  submitRoleRequest: (requestedRole: UserRole, reason: string) => Promise<{ success: boolean; message: string }>;
  approveRoleRequest: (requestId: string) => Promise<boolean>;
  rejectRoleRequest: (requestId: string, notes?: string) => Promise<boolean>;
  loginUser: (email: string, pass: string) => Promise<void>;
  registerUser: (email: string, pass: string, data: Partial<UserProfile>) => Promise<void>;
  loginWithGoogle: () => Promise<void>;
  logoutUser: () => Promise<void>;
  authModalOpen: boolean;
  openAuthModal: () => void;
  closeAuthModal: () => void;
  reports: EcoReport[];
  addReport: (report: AddReportInput) => EcoReport;
  updateReportStatus: (id: string, status: ProblemStatus, rewardCoins?: number) => Promise<void>;
  upvoteReport: (id: string) => void;
  schools: School[];
  registerSchool: (
    schoolData: Omit<School, 'id' | 'totalCoins' | 'treesPlanted' | 'cleanupsCompleted' | 'ratingRank' | 'status' | 'createdAt'>
  ) => School;
  ambassadors: Ambassador[];
  appointAmbassador: (schoolId: string, fullName: string, email: string) => Promise<void>;
  shopItems: ShopItem[];
  transactions: CoinTransaction[];
  verifyGiftSubscriptions: (
    itemId: string,
    visitedTargetIds: string[]
  ) => Promise<{ success: boolean; verifiedTargetIds?: string[]; error?: string }>;
  redeemShopItem: (
    item: ShopItem,
    options?: { confirmedSubscriptionIds?: string[] }
  ) => Promise<{
    success: boolean;
    message: string;
    voucherCode?: string;
    voucherUrl?: string;
    itemImageUrl?: string;
    order?: ShopOrder;
  }>;
  shopOrders: ShopOrder[];
  updateShopOrderStatus: (orderId: string, status: 'approved' | 'delivered' | 'cancelled') => Promise<void>;
  checkVoucherCode: (code: string) => Promise<VoucherCheckResult>;
  verifyAndForwardVoucher: (
    voucherCode: string,
    payload?: { note?: string; action?: 'forward' | 'deliver' }
  ) => Promise<{ success: boolean; order?: ShopOrder; message?: string; error?: string }>;
  startAdWatch: (adId: string) => Promise<{
    success: boolean;
    watchSessionId?: string;
    requiredSeconds?: number;
    cooldownActive?: boolean;
    remainingSeconds?: number;
    nextAvailableAt?: string | null;
    adWatchState?: AdWatchState | null;
    error?: string;
  }>;
  claimAdWatchReward: (
    adId: string,
    watchSessionId: string
  ) => Promise<{
    success: boolean;
    awardedCoins?: number;
    newBalance?: number;
    adWatchState?: AdWatchState | null;
    message?: string;
    error?: string;
  }>;
  auditLogs: AuditLog[];
  notifications: Notification[];
  markNotificationRead: (id: string) => void;
  theme: 'dark' | 'light';
  toggleTheme: () => void;
  activeTab: string;
  setActiveTab: (tab: string) => void;
  isTelegramMiniApp: boolean;
  triggerHaptic: (style?: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error') => void;
  referrals: ReferralRecord[];
  claimReferral: (codeOrUid: string) => Promise<{ success: boolean; message: string }>;
  broadcasts: TelegramBroadcast[];
  sendTelegramNotification: (chatId: string | number, message: string, type?: string, actionUrl?: string) => Promise<boolean>;
  sendBroadcastAnnouncement: (
    title: string,
    message: string,
    targetAudience: 'all' | 'students' | 'ambassadors' | 'region',
    targetRegion?: string
  ) => Promise<boolean>;
  partners: EcoPartner[];
  sponsorshipProjects: SponsorshipProject[];
  sponsorshipProposals: SponsorshipProposal[];
  submitSponsorshipProposal: (data: Omit<SponsorshipProposal, 'id' | 'status' | 'submittedAt'>) => Promise<boolean>;
  updateProposalStatus: (id: string, status: 'approved' | 'rejected', notes?: string) => Promise<boolean>;
  createSponsorshipProject: (data: Omit<SponsorshipProject, 'id' | 'raisedAmountUZS'>) => Promise<boolean>;
  ecoAds: EcoAd[];
  adWatchState: AdWatchState | null;
  createEcoAd: (data: Omit<EcoAd, 'id' | 'impressionsCount' | 'clicksCount'>) => Promise<boolean>;
  updateEcoAdStatus: (id: string, status: 'active' | 'paused' | 'expired') => void;
  recordAdImpression: (id: string) => void;
  recordAdClick: (id: string) => void;
  isOnboarded: boolean;
  onboardingModalOpen: boolean;
  openOnboardingModal: () => void;
  closeOnboardingModal: () => void;
  editProfileModalOpen: boolean;
  openEditProfileModal: () => void;
  closeEditProfileModal: () => void;
  completeOnboarding: (data: {
    fullName: string;
    phoneNumber: string;
    region: string;
    district: string;
    schoolName: string;
    grade: string;
    privacyAccepted: boolean;
  }) => Promise<void>;
  updateUserProfile: (data: Partial<UserProfile>) => Promise<void>;
  claimDailyQuizReward: (rewardCoins?: number, reason?: string) => Promise<boolean>;
  claimDailyStreakReward: () => Promise<{
    success: boolean;
    rewardCoins?: number;
    streakDays?: number;
    wasReset?: boolean;
    alreadyClaimed?: boolean;
  }>;
  syncBootstrap: (overrideUid?: string, overrideTelegramId?: number | string | null) => Promise<void>;
  updateShopItemPriceAndStock: (itemId: string, newPriceCoins: number, newStock: number) => Promise<boolean>;
  updateShopItem: (itemId: string, updates: Partial<ShopItem>) => Promise<boolean>;
  createShopItem: (itemData: Omit<ShopItem, 'id'>) => Promise<boolean>;
  notification: { message: string; type: 'success' | 'info' | 'warning' } | null;
  showNotification: (message: string, type?: 'success' | 'info' | 'warning') => void;
  clearNotification: () => void;
  triggerConfetti: () => void;
  competitionScores: CompetitionScore[];
  competitionPeriods: CompetitionPeriod[];
  championshipResults: ChampionshipResult[];
  certificates: Certificate[];
  isOnline: boolean;
  isServerConnected: boolean;
  isCheckingConnection: boolean;
  checkServerHealth: () => Promise<boolean>;
  // Advanced EcoHero RBAC, Applications, Media, Tasks, Rewards, Leaderboards & Analytics
  isSuperAdmin: boolean;
  sessionToken: string | null;
  apiFetch: (input: RequestInfo | URL, init?: RequestInit & { timeoutMs?: number }) => Promise<Response>;
  registrationApplications: RegistrationApplication[];
  submitApplication: (payload: {
    fullName: string;
    telegramId?: string;
    telegramUsername?: string;
    region: string;
    district: string;
    schoolNumber: string;
    officialSchoolName: string;
    requestedRole: UserRole;
    contactInfo: string;
    verificationDetails: string;
  }) => Promise<{ success: boolean; message: string; application?: RegistrationApplication }>;
  reviewApplication: (
    applicationId: string,
    action: 'approve' | 'reject' | 'request_info',
    adminNote?: string
  ) => Promise<{ success: boolean; error?: string }>;
  manageUserRole: (payload: {
    targetUid: string;
    newRole?: UserRole;
    revokeRole?: UserRole;
    reason: string;
    schoolId?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  mediaSubmissions: MediaSubmission[];
  uploadMediaFile: (
    fileDataOrFile: File | string,
    fileName?: string
  ) => Promise<{ success: boolean; url?: string; mediaType?: 'image' | 'video'; fileHash?: string; error?: string }>;
  submitEcoMedia: (payload: {
    activityCategory: MediaCategory;
    mediaType: 'image' | 'video';
    mediaUrl: string;
    fileHash?: string;
    description: string;
  }) => Promise<{ success: boolean; error?: string; submission?: MediaSubmission }>;
  moderateEcoMedia: (
    submissionId: string,
    decision: MediaModerationStatus,
    moderatorNote?: string,
    customCoins?: number
  ) => Promise<{ success: boolean; error?: string }>;
  ecoTasks: EcoTask[];
  createEcoTask: (payload: {
    schoolId?: string;
    assigneeUid: string;
    title: string;
    instructions: string;
    relatedReportId?: string;
  }) => Promise<{ success: boolean; error?: string; task?: EcoTask }>;
  updateEcoTask: (
    taskId: string,
    payload: { status?: string; evidenceUrl?: string; completionNote?: string }
  ) => Promise<{ success: boolean; error?: string }>;
  advanceReportWorkflow: (
    reportId: string,
    action:
      | 'approve_to_captain'
      | 'reject'
      | 'request_info'
      | 'assign_ambassador'
      | 'ambassador_solution'
      | 'escalate'
      | 'final_verify',
    payload?: {
      note?: string;
      assigneeUid?: string;
      resolutionEvidenceUrl?: string;
      escalationTarget?: string;
    }
  ) => Promise<{ success: boolean; error?: string }>;
  rewardSettings: RewardSettings;
  updateRewardSettings: (updates: Partial<RewardSettings>) => Promise<{ success: boolean; error?: string }>;
  adjustUserCoins: (targetUid: string, amount: number, reason: string) => Promise<{ success: boolean; error?: string }>;
  analytics: AnalyticsResponse | null;
  fetchAnalytics: (filters?: {
    region?: string;
    district?: string;
    schoolId?: string;
    category?: string;
  }) => Promise<AnalyticsResponse | null>;
  fetchLeaderboard: (
    tier: LeaderboardTier,
    params?: {
      period?: LeaderboardPeriod;
      region?: string;
      district?: string;
      search?: string;
      page?: number;
      limit?: number;
    }
  ) => Promise<{
    success: boolean;
    forbidden?: boolean;
    error?: string;
    items: any[];
    total: number;
    page: number;
    totalPages: number;
  }>;
  homePosts: HomePost[];
  monthlyAwards: MonthlyAwardRecord[];
  appointAmbassadorHierarchical: (payload: {
    schoolId?: string;
    schoolName?: string;
    schoolNumber?: string;
    fullName: string;
    phoneNumber?: string;
    email?: string;
    telegramUsername?: string;
    telegramId?: string;
    grade?: string;
  }) => Promise<{ success: boolean; error?: string; ambassador?: Ambassador }>;
  appointSchoolCaptain: (payload: {
    fullName: string;
    phoneNumber?: string;
    email?: string;
    telegramUsername?: string;
    telegramId?: string;
    grade?: string;
    schoolId?: string;
    schoolNumber?: string;
    schoolName?: string;
    region?: string;
    district?: string;
  }) => Promise<{ success: boolean; error?: string; school?: School }>;
  appointDistrictCoordinator: (payload: {
    fullName: string;
    phoneNumber?: string;
    email?: string;
    telegramUsername?: string;
    telegramId?: string;
    district: string;
    region?: string;
  }) => Promise<{ success: boolean; error?: string }>;
  appointRegionalCoordinator: (payload: {
    fullName: string;
    phoneNumber?: string;
    email?: string;
    telegramUsername?: string;
    telegramId?: string;
    region: string;
  }) => Promise<{ success: boolean; error?: string }>;
  fetchDistrictLeaderboardDetails: (params?: {
    region?: string;
    district?: string;
  }) => Promise<DistrictLeaderboardDetailsResponse | null>;
  awardMonthlyTop3: (params?: {
    region?: string;
    district?: string;
  }) => Promise<{ success: boolean; award?: MonthlyAwardRecord; details?: DistrictLeaderboardDetailsResponse; error?: string }>;
  createHomePost: (payload: {
    title: string;
    content: string;
    category: HomePostCategory;
    imageUrl?: string;
    ctaText?: string;
    ctaUrl?: string;
    isPinned?: boolean;
  }) => Promise<{ success: boolean; post?: HomePost; error?: string }>;
  updateHomePost: (
    id: string,
    updates: Partial<Pick<HomePost, 'title' | 'content' | 'category' | 'imageUrl' | 'ctaText' | 'ctaUrl' | 'isPinned' | 'status'>>
  ) => Promise<{ success: boolean; post?: HomePost; error?: string }>;
  deleteHomePost: (id: string) => Promise<{ success: boolean; error?: string }>;
  // Real-time WebSocket Telegram-style Chat, Scoped Rosters & District User-Growth Race
  wsConnected: boolean;
  liveSyncVersion: number;
  subscribeChatEvents: (
    listener: (event: { type: string; message?: EcoChatMessage; permission?: ChatPermissionRequest }) => void
  ) => () => void;
  fetchRosterDirectory: (params?: {
    region?: string;
    district?: string;
    schoolId?: string;
  }) => Promise<RosterDirectoryResponse | null>;
  fetchDistrictUserGrowth: () => Promise<{
    success: boolean;
    forbidden?: boolean;
    error?: string;
    data?: DistrictUserGrowthResponse;
  }>;
  fetchChatThreads: () => Promise<ChatThreadSummary[]>;
  fetchChatMessages: (channelId: string) => Promise<{ success: boolean; messages: EcoChatMessage[]; error?: string }>;
  sendChatMessage: (payload: {
    channelId: string;
    scope: ChatScope;
    messageKind?: ChatMessageKind;
    text: string;
    imageUrl?: string;
    recipientUid?: string;
    replyToId?: string;
  }) => Promise<{ success: boolean; message?: EcoChatMessage; code?: string; error?: string }>;
  fetchChatPermissions: () => Promise<{
    success: boolean;
    allowStudentMessages: boolean;
    permissions: ChatPermissionRequest[];
  }>;
  requestChatPermission: (
    targetUid: string,
    note?: string
  ) => Promise<{ success: boolean; permission?: ChatPermissionRequest; error?: string }>;
  respondChatPermission: (
    permId: string,
    action: 'approve' | 'reject' | 'block'
  ) => Promise<{ success: boolean; permission?: ChatPermissionRequest; error?: string }>;
  updateChatSettings: (
    allowStudentMessages: boolean
  ) => Promise<{ success: boolean; allowStudentMessages?: boolean; error?: string }>;
  liveMetrics: LiveMetrics;
  ecoMissions: EcoMission[];
  missionSubmissions: MissionSubmission[];
  missionCompletions: string[];
  editReport: (reportId: string, updates: Partial<EcoReport>) => Promise<{ success: boolean; error?: string }>;
  deleteReport: (reportId: string) => Promise<{ success: boolean; error?: string }>;
  schoolReportAction: (
    reportId: string,
    action: 'confirm_student_resolved' | 'assign_ambassador',
    payload?: { assignedAmbassadorUid?: string; note?: string }
  ) => Promise<{ success: boolean; error?: string; message?: string }>;
  resolveReportWithAiVerification: (
    reportId: string,
    payload: { beforeImageUrl?: string; afterImageUrl: string; note?: string }
  ) => Promise<{ success: boolean; error?: string; message?: string }>;
  updateEcoAd: (adId: string, updates: Partial<EcoAd>) => Promise<{ success: boolean; error?: string }>;
  deleteEcoAd: (adId: string) => Promise<{ success: boolean; error?: string }>;
  deleteShopItem: (itemId: string) => Promise<{ success: boolean; error?: string }>;
  createMission: (payload: Omit<EcoMission, 'id' | 'createdAt' | 'status'>) => Promise<{ success: boolean; mission?: EcoMission; error?: string }>;
  updateMission: (id: string, updates: Partial<EcoMission>) => Promise<{ success: boolean; error?: string }>;
  deleteMission: (id: string) => Promise<{ success: boolean; error?: string }>;
  submitMission: (
    id: string,
    payload: { selectedOptionIndex?: number; answers?: number[]; proofText?: string; mediaUrl?: string }
  ) => Promise<{
    success: boolean;
    passed?: boolean;
    scorePercent?: number;
    correctCount?: number;
    totalCount?: number;
    passingPercent?: number;
    results?: {
      questionId: string;
      question: string;
      selectedIndex: number;
      correctIndex: number;
      isCorrect: boolean;
      explanation?: string;
    }[];
    error?: string;
    message?: string;
    awardedCoins?: number;
    explanation?: string;
  }>;
  parseQuizFromText: (
    rawText: string
  ) => Promise<{ success: boolean; questions?: QuizQuestionItem[]; parser?: string; error?: string }>;
  reviewMissionSubmission: (
    subId: string,
    action: 'approve' | 'reject',
    adminNote?: string
  ) => Promise<{ success: boolean; error?: string }>;
  fetchStudentRatingsCabinet: (params?: {
    schoolId?: string;
    region?: string;
    district?: string;
  }) => Promise<StudentRatingsCabinetResponse | null>;
  fetchStudentRatingsManage: (params?: {
    schoolId?: string;
    region?: string;
    district?: string;
  }) => Promise<StudentRatingsManageResponse | null>;
  updateSchoolStudentRatingConfig: (payload: {
    schoolId?: string;
    schoolName?: string;
    enabled?: boolean;
    minMembersThreshold?: number;
    monthlyPrizeTitle?: string;
    bonusCoins?: number;
  }) => Promise<{ success: boolean; school?: StudentRatingScopePayload; error?: string }>;
  updateDistrictStudentRatingConfig: (payload: {
    region?: string;
    district?: string;
    enabled?: boolean;
    minMembersThreshold?: number;
    top1Prize?: string;
    top2Prize?: string;
    top3Prize?: string;
    bonuses?: [number, number, number];
  }) => Promise<{ success: boolean; district?: StudentRatingScopePayload; error?: string }>;
  awardSchoolTop1Student: (params?: {
    schoolId?: string;
    schoolName?: string;
  }) => Promise<{ success: boolean; award?: StudentMonthlyAwardRecord; school?: StudentRatingScopePayload; error?: string }>;
  awardDistrictTop3Students: (params?: {
    region?: string;
    district?: string;
  }) => Promise<{ success: boolean; award?: StudentMonthlyAwardRecord; district?: StudentRatingScopePayload; error?: string }>;
  weeklyChallenge: WeeklyChallengeSummary | null;
  schoolTeamMission: SchoolTeamMissionSummary | null;
  championshipMeta: ChampionshipEligibility | null;
  joinWeeklyChallenge: () => Promise<{ success: boolean; error?: string }>;
  claimWeeklyChallenge: () => Promise<{ success: boolean; awardedCoins?: number; error?: string }>;
  fetchChampionshipLive: (params: {
    level: 'district' | 'regional' | 'national';
    entity: 'schools' | 'students';
    region?: string;
    district?: string;
  }) => Promise<ChampionshipLiveResponse | null>;
}

const EcoContext = createContext<EcoContextType | undefined>(undefined);

const VALID_TABS = new Set([
  'home',
  'map',
  'report',
  'ai',
  'coins',
  'coin',
  'shop',
  'rating',
  'leaderboard',
  'school',
  'referral',
  'referrals',
  'invite',
  'partners',
  'media',
  'admin',
  'rewards',
  'eco_rewards',
  'missions',
  'tasks',
  'championship',
  'battle',
  'school_battle',
  'impact',
  'analytics',
  'profile',
  'user',
  'quiz',
  'knowledge',
  'innovation',
  'creator',
  'recycle',
  'ambassador',
]);

export const EcoProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<UserProfile>(() => {
    const fallbackUid = getOrCreateBrowserUid();
    const saved = localStorage.getItem('ecohero_user');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && parsed.fullName !== 'Jasurbek Aliyev' && parsed.uid !== 'user_student_01') {
          return {
            ...INITIAL_USER,
            ...parsed,
            uid: parsed.uid && parsed.uid !== 'new_student' ? parsed.uid : fallbackUid,
          };
        }
      } catch {
        // ignore parse failure
      }
    }
    return {
      ...INITIAL_USER,
      uid: fallbackUid,
    };
  });

  const userRef = useRef(user);
  useEffect(() => {
    userRef.current = user;
  }, [user]);

  const [studentsLeaderboard, setStudentsLeaderboard] = useState<UserProfile[]>([]);

  const [reports, setReports] = useState<EcoReport[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_reports');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [schools, setSchools] = useState<School[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_schools');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [ambassadors, setAmbassadors] = useState<Ambassador[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_ambassadors');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [auditLogs, setAuditLogs] = useState<AuditLog[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_audit_logs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [notifications, setNotifications] = useState<Notification[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_notifications');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [shopItems, setShopItems] = useState<ShopItem[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_shop_items');
      return saved ? JSON.parse(saved) : INITIAL_SHOP_ITEMS;
    } catch {
      return INITIAL_SHOP_ITEMS;
    }
  });

  const [onboardingModalOpen, setOnboardingModalOpen] = useState(false);
  const [editProfileModalOpen, setEditProfileModalOpen] = useState(false);

  const [transactions, setTransactions] = useState<CoinTransaction[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_txs');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [referrals, setReferrals] = useState<ReferralRecord[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_referrals');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [broadcasts, setBroadcasts] = useState<TelegramBroadcast[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_broadcasts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [partners, setPartners] = useState<EcoPartner[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_partners');
      return saved ? JSON.parse(saved) : INITIAL_PARTNERS;
    } catch {
      return INITIAL_PARTNERS;
    }
  });

  const [sponsorshipProjects, setSponsorshipProjects] = useState<SponsorshipProject[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_sponsorship_projects');
      return saved ? JSON.parse(saved) : INITIAL_SPONSORSHIP_PROJECTS;
    } catch {
      return INITIAL_SPONSORSHIP_PROJECTS;
    }
  });

  const [sponsorshipProposals, setSponsorshipProposals] = useState<SponsorshipProposal[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_sponsorship_proposals');
      return saved ? JSON.parse(saved) : INITIAL_SPONSORSHIP_PROPOSALS;
    } catch {
      return INITIAL_SPONSORSHIP_PROPOSALS;
    }
  });

  const [ecoAds, setEcoAds] = useState<EcoAd[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_eco_ads');
      return saved ? JSON.parse(saved) : INITIAL_ECO_ADS;
    } catch {
      return INITIAL_ECO_ADS;
    }
  });

  const [shopOrders, setShopOrders] = useState<ShopOrder[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_shop_orders');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [competitionScores] = useState<CompetitionScore[]>([]);

  const [competitionPeriods] = useState<CompetitionPeriod[]>(INITIAL_COMPETITION_PERIODS);

  const [championshipResults] = useState<ChampionshipResult[]>([]);

  const [certificates] = useState<Certificate[]>([]);

  const [roleRequests, setRoleRequests] = useState<RoleRequest[]>([]);
  const [roleRequestModalOpen, setRoleRequestModalOpen] = useState(false);
  const [targetRequestedRole, setTargetRequestedRole] = useState<UserRole | null>(null);

  const [registrationApplications, setRegistrationApplications] = useState<RegistrationApplication[]>([]);
  const [mediaSubmissions, setMediaSubmissions] = useState<MediaSubmission[]>([]);
  const [ecoTasks, setEcoTasks] = useState<EcoTask[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_eco_tasks');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [rewardSettings, setRewardSettings] = useState<RewardSettings>(() => {
    const defaults: RewardSettings = {
      id: 'global',
      welcomeBonus: 100,
      dailyQuiz: 50,
      referralInviter: 100,
      referralInvitee: 50,
      awarenessPost: 60,
      wasteSorting: 120,
      treeCareWatering: 150,
      treePlanting: 200,
      gardenProject: 250,
      environmentalCampaign: 180,
      schoolImprovement: 220,
      problemVerified: 100,
      problemResolved: 150,
      ambassadorTaskBonus: 120,
      duplicateWindowHours: 24,
      updatedAt: '',
      updatedBy: 'system',
    };
    try {
      const saved = localStorage.getItem('ecohero_reward_settings');
      return saved ? { ...defaults, ...JSON.parse(saved) } : defaults;
    } catch {
      return defaults;
    }
  });
  const [analytics, setAnalytics] = useState<AnalyticsResponse | null>(null);
  const [adWatchState, setAdWatchState] = useState<AdWatchState | null>(null);
  const [homePosts, setHomePosts] = useState<HomePost[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_home_posts');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [monthlyAwards, setMonthlyAwards] = useState<MonthlyAwardRecord[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_monthly_awards');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [liveMetrics, setLiveMetrics] = useState<LiveMetrics>(() => {
    const empty: LiveMetrics = {
      totalSchools: 0,
      totalUsers: 0,
      botUsersCount: 0,
      totalDistricts: 0,
      totalRegions: 0,
      schoolCaptainsCount: 0,
      pendingApplicationsCount: 0,
      shopOrdersCount: 0,
      resolvedReports: 0,
      totalReports: 0,
      treesPlanted: 0,
      activeAmbassadors: 0,
    };
    try {
      const saved = localStorage.getItem('ecohero_live_metrics');
      return saved ? { ...empty, ...JSON.parse(saved) } : empty;
    } catch {
      return empty;
    }
  });
  const [ecoMissions, setEcoMissions] = useState<EcoMission[]>(() => {
    try {
      const saved = localStorage.getItem('ecohero_eco_missions');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [missionSubmissions, setMissionSubmissions] = useState<MissionSubmission[]>([]);
  const [missionCompletions, setMissionCompletions] = useState<string[]>([]);
  const [weeklyChallenge, setWeeklyChallenge] = useState<WeeklyChallengeSummary | null>(null);
  const [schoolTeamMission, setSchoolTeamMission] = useState<SchoolTeamMissionSummary | null>(null);
  const [championshipMeta, setChampionshipMeta] = useState<ChampionshipEligibility | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem('ecohero_session_token');
    } catch {
      return null;
    }
  });
  const sessionTokenRef = useRef<string | null>(sessionToken);
  const refreshSessionPromiseRef = useRef<Promise<string | null> | null>(null);
  const silentRefreshTriedRef = useRef<boolean>(false);
  const lastBootstrapServerMsRef = useRef<number>(0);
  const lastSyncedMetricsKeyRef = useRef<string>('');
  const [firebaseAuthUid, setFirebaseAuthUid] = useState<string | null>(null);

  const saveSessionToken = useCallback((token: string | null) => {
    sessionTokenRef.current = token;
    setSessionToken(token);
    if (token) silentRefreshTriedRef.current = false;
    try {
      if (token) localStorage.setItem('ecohero_session_token', token);
      else localStorage.removeItem('ecohero_session_token');
    } catch {}
  }, []);

  const refreshSessionToken = useCallback(async (): Promise<string | null> => {
    if (refreshSessionPromiseRef.current) {
      return refreshSessionPromiseRef.current;
    }

    const runner = (async (): Promise<string | null> => {
      try {
        if (auth?.currentUser) {
          const idToken = await auth.currentUser.getIdToken(true);
          const res = await fetch(apiUrl('/api/auth/session'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              idToken,
              firebaseIdToken: idToken,
              uid: auth.currentUser.uid,
              email: auth.currentUser.email,
              fullName: auth.currentUser.displayName || undefined,
            }),
          });
          const data = await parseApiJson<any>(res);
          if (res.ok && data?.success && data?.sessionToken) {
            saveSessionToken(data.sessionToken);
            if (data.user) {
              setUser(prev => ({ ...prev, ...data.user }));
            }
            return String(data.sessionToken);
          }
        }
      } catch {
        // try Telegram WebApp fallback next
      }

      try {
        const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
        if (tg?.initData) {
          const res = await fetch(apiUrl('/api/telegram/auth-webapp'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              initData: tg.initData,
              unsafeUser: tg.initDataUnsafe?.user || null,
            }),
          });
          const data = await parseApiJson<any>(res);
          if (res.ok && data?.success && data?.sessionToken) {
            saveSessionToken(data.sessionToken);
            if (data.user) {
              setUser(prev => ({ ...prev, ...data.user }));
            }
            return String(data.sessionToken);
          }
        }
      } catch {
        // ignore
      }

      return null;
    })().finally(() => {
      refreshSessionPromiseRef.current = null;
    });

    refreshSessionPromiseRef.current = runner;
    return runner;
  }, [saveSessionToken]);

  const apiFetch = useCallback(
    async (input: RequestInfo | URL, init: RequestInit & { timeoutMs?: number } = {}) => {
      const { timeoutMs = 7000, ...fetchInit } = init;
      const inputStr = typeof input === 'string' ? input : String(input);
      const method = (fetchInit.method || 'GET').toUpperCase();
      const isMutation = method !== 'GET' && method !== 'HEAD';

      const buildHeaders = async (tokenOverride?: string | null) => {
        const headers = new Headers(fetchInit.headers || {});
        const tokenToUse = tokenOverride !== undefined ? tokenOverride : sessionTokenRef.current;
        if (tokenToUse) {
          headers.set('Authorization', `Bearer ${tokenToUse}`);
        }
        if (fetchInit.body && typeof fetchInit.body === 'string' && !headers.has('Content-Type')) {
          headers.set('Content-Type', 'application/json');
        }
        if (isMutation && auth?.currentUser && !headers.has('X-Firebase-Id-Token')) {
          try {
            const fbTok = await auth.currentUser.getIdToken();
            if (fbTok) headers.set('X-Firebase-Id-Token', fbTok);
          } catch {
            // ignore token read error
          }
        }
        return { headers, tokenToUse };
      };

      const execute = async (tokenOverride?: string | null) => {
        const { headers, tokenToUse } = await buildHeaders(tokenOverride);
        const resolvedInput = typeof input === 'string' ? apiUrl(input) : input;

        if (fetchInit.signal || timeoutMs <= 0) {
          const resp = await fetch(resolvedInput, { ...fetchInit, headers });
          return { resp, tokenToUse };
        }

        const controller = new AbortController();
        const timer = window.setTimeout(() => controller.abort(), timeoutMs);
        try {
          const resp = await fetch(resolvedInput, { ...fetchInit, headers, signal: controller.signal });
          return { resp, tokenToUse };
        } finally {
          window.clearTimeout(timer);
        }
      };

      const first = await execute();
      if (
        first.resp.status === 401 &&
        !fetchInit.signal &&
        !inputStr.includes('/api/auth/session') &&
        !inputStr.includes('/api/telegram/auth-webapp')
      ) {
        const refreshed = await refreshSessionToken();
        if (refreshed && refreshed !== first.tokenToUse) {
          const retried = await execute(refreshed);
          return retried.resp;
        }
      }
      return first.resp;
    },
    [refreshSessionToken]
  );

  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [theme, setTheme] = useState<'dark' | 'light'>('dark');

  const getTabFromPath = () => {
    if (typeof window === 'undefined') return 'home';
    const path = window.location.pathname.replace(/^\//, '').trim().toLowerCase();
    return VALID_TABS.has(path) ? path : 'home';
  };

  const [activeTab, setActiveTabState] = useState<string>(getTabFromPath);
  const [isTelegramMiniApp, setIsTelegramMiniApp] = useState(false);
  const [notification, setNotification] = useState<{ message: string; type: 'success' | 'info' | 'warning' } | null>(null);
  const notificationTimerRef = useRef<number | null>(null);

  const [isOnline, setIsOnline] = useState<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);
  const [isServerConnected, setIsServerConnected] = useState<boolean>(true);
  const [isCheckingConnection, setIsCheckingConnection] = useState<boolean>(false);

  const showNotification = useCallback((message: string, type: 'success' | 'info' | 'warning' = 'success') => {
    setNotification({ message, type });
    if (notificationTimerRef.current) {
      window.clearTimeout(notificationTimerRef.current);
    }
    notificationTimerRef.current = window.setTimeout(() => {
      setNotification(null);
    }, 4000);
  }, []);

  const clearNotification = useCallback(() => setNotification(null), []);

  const triggerHaptic = useCallback((style: 'light' | 'medium' | 'heavy' | 'success' | 'warning' | 'error' = 'medium') => {
    try {
      const tg = (window as any).Telegram?.WebApp;
      if (tg?.HapticFeedback) {
        if (style === 'success' || style === 'warning' || style === 'error') {
          tg.HapticFeedback.notificationOccurred(style);
        } else {
          tg.HapticFeedback.impactOccurred(style);
        }
      }
    } catch {
      // ignore in normal web browser
    }
  }, []);

  const triggerConfetti = useCallback(() => {
    try {
      confetti({
        particleCount: 80,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#10b981', '#059669', '#34d399', '#f59e0b', '#3b82f6'],
      });
    } catch {
      // ignore
    }
  }, []);

  const checkServerHealth = useCallback(async (): Promise<boolean> => {
    setIsCheckingConnection(true);
    try {
      const controller = new AbortController();
      const timeoutId = window.setTimeout(() => controller.abort(), 4500);
      const res = await fetch(apiUrl('/api/health'), { signal: controller.signal });
      window.clearTimeout(timeoutId);
      if (!res.ok || isHtmlContentType(res)) {
        setIsServerConnected(false);
        setIsCheckingConnection(false);
        return false;
      }
      const data = await parseApiJson<{ status?: string }>(res);
      const isOk = data?.status === 'ok';
      setIsServerConnected(isOk);
      setIsCheckingConnection(false);
      return isOk;
    } catch {
      setIsServerConnected(false);
      setIsCheckingConnection(false);
      return false;
    }
  }, []);

  const syncBootstrap = useCallback(
    async (overrideUid?: string, overrideTelegramId?: number | string | null) => {
      try {
        const current = userRef.current;
        const targetUid = overrideUid ?? current.uid;
        const targetTgId = overrideTelegramId ?? current.telegramId;
        const params = new URLSearchParams();
        if (targetUid) params.set('uid', targetUid);
        if (targetTgId) params.set('telegramId', String(targetTgId));

        const [res, fsSnapshot] = await Promise.all([
          apiFetch(`/api/bootstrap?${params.toString()}`),
          fetchCatalogFromFirestore().catch(() => null),
        ]);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.success) return;

        const callerRole = data.user?.role;
        const callerIsSuperAdmin =
          callerRole === 'super_admin' ||
          (Array.isArray(data.user?.approvedRoles) && data.user.approvedRoles.includes('super_admin'));
        const callerCanManageMissions = Boolean(
          data.user &&
            (callerIsSuperAdmin ||
              ['moderator', 'school_admin'].includes(callerRole) ||
              (Array.isArray(data.user?.approvedRoles) &&
                data.user.approvedRoles.some((r: string) => ['moderator', 'school_admin'].includes(r))))
        );

        setIsServerConnected(true);
        if (Array.isArray(data.schools)) setSchools(data.schools);
        if (Array.isArray(data.reports)) setReports(data.reports);
        if (Array.isArray(data.ambassadors)) setAmbassadors(data.ambassadors);

        if (Array.isArray(data.shopItems)) {
          const mergedShop = fsSnapshot
            ? mergeServerAndFirestoreCatalog(
                data.shopItems,
                fsSnapshot.shopItems,
                fsSnapshot.tombstones,
                'shopItems'
              )
            : data.shopItems;
          setShopItems(mergedShop);
        }

        if (Array.isArray(data.shopOrders)) setShopOrders(data.shopOrders);
        if (Array.isArray(data.transactions)) setTransactions(data.transactions);
        if (Array.isArray(data.roleRequests)) setRoleRequests(data.roleRequests);
        if (Array.isArray(data.registrationApplications)) setRegistrationApplications(data.registrationApplications);
        if (Array.isArray(data.mediaSubmissions)) setMediaSubmissions(data.mediaSubmissions);
        if (Array.isArray(data.ecoTasks)) setEcoTasks(data.ecoTasks);

        if (data.rewardSettings || fsSnapshot?.rewardSettings) {
          const serverSettings = data.rewardSettings || {};
          const fsSettings = fsSnapshot?.rewardSettings || null;
          const serverTs = Date.parse(String(serverSettings.updatedAt || '')) || 0;
          const fsTs = Date.parse(String(fsSettings?.updatedAt || '')) || 0;
          const chosen = fsSettings && fsTs > serverTs ? { ...serverSettings, ...fsSettings } : serverSettings;
          setRewardSettings(prev => ({ ...prev, ...chosen }));
        }

        if (Array.isArray(data.partners)) setPartners(data.partners);
        if (Array.isArray(data.sponsorshipProjects)) setSponsorshipProjects(data.sponsorshipProjects);
        if (Array.isArray(data.sponsorshipProposals)) setSponsorshipProposals(data.sponsorshipProposals);

        if (Array.isArray(data.ecoAds)) {
          const mergedAds = fsSnapshot
            ? mergeServerAndFirestoreCatalog(
                data.ecoAds,
                fsSnapshot.ecoAds,
                fsSnapshot.tombstones,
                'eco_ads'
              ).filter((a) => a.status === 'active' || callerIsSuperAdmin)
            : data.ecoAds;
          setEcoAds(mergedAds);
        }
        if ('adWatchState' in data) {
          setAdWatchState(data.adWatchState || null);
        }

        if (Array.isArray(data.referrals)) setReferrals(data.referrals);
        if (Array.isArray(data.broadcasts)) setBroadcasts(data.broadcasts);
        if (Array.isArray(data.auditLogs)) setAuditLogs(data.auditLogs);
        if (Array.isArray(data.notifications)) setNotifications(data.notifications);
        if (Array.isArray(data.studentsLeaderboard)) setStudentsLeaderboard(data.studentsLeaderboard);

        if (Array.isArray(data.homePosts)) {
          const mergedPosts = fsSnapshot
            ? mergeServerAndFirestoreCatalog(
                data.homePosts,
                fsSnapshot.homePosts,
                fsSnapshot.tombstones,
                'home_posts'
              ).filter((p) => p.status === 'active' || callerIsSuperAdmin || callerRole === 'moderator')
            : data.homePosts;
          setHomePosts(mergedPosts);
        }

        if (Array.isArray(data.monthlyAwards)) setMonthlyAwards(data.monthlyAwards);
        if (data.serverNow) {
          const parsedNow = Date.parse(String(data.serverNow));
          if (Number.isFinite(parsedNow)) lastBootstrapServerMsRef.current = parsedNow;
        }
        if (data.liveMetrics) {
          setLiveMetrics(data.liveMetrics);
          try {
            localStorage.setItem('ecohero_live_metrics', JSON.stringify(data.liveMetrics));
          } catch {}
        }
        if (Array.isArray(data.ecoMissions)) {
          const mergedMissions = fsSnapshot
            ? mergeServerAndFirestoreCatalog(
                data.ecoMissions,
                fsSnapshot.missions,
                fsSnapshot.tombstones,
                'eco_missions'
              ).filter((m) => m.status === 'active' || callerCanManageMissions)
            : data.ecoMissions;
          setEcoMissions(mergedMissions);
          try {
            localStorage.setItem('ecohero_eco_missions', JSON.stringify(mergedMissions));
          } catch {}
        }
        if (Array.isArray(data.missionSubmissions)) setMissionSubmissions(data.missionSubmissions);
        if (Array.isArray(data.missionCompletions)) setMissionCompletions(data.missionCompletions);
        if (data.weeklyChallenge) setWeeklyChallenge(data.weeklyChallenge);
        if (data.schoolTeamMission) setSchoolTeamMission(data.schoolTeamMission);
        if (data.championshipMeta) setChampionshipMeta(data.championshipMeta);

        if (data.sessionToken) {
          saveSessionToken(data.sessionToken);
        }

        if (data.user) {
          setUser(prev => ({
            ...prev,
            ...data.user,
          }));
          if (data.user.uid) {
            localStorage.setItem('ecohero_session_uid', data.user.uid);
          }
          if (data.user.isOnboarded) {
            localStorage.setItem('ecohero_onboarded', 'true');
          }
          if (data.user.welcomeBonusClaimed) {
            localStorage.setItem('ecohero_welcome_bonus_claimed', 'true');
          }
        } else {
          const tg = typeof window !== 'undefined' ? (window as any).Telegram?.WebApp : null;
          const canSilentRefresh = Boolean(auth?.currentUser || tg?.initData);
          if (canSilentRefresh && !silentRefreshTriedRef.current) {
            silentRefreshTriedRef.current = true;
            refreshSessionToken().then((newTok) => {
              if (newTok) {
                syncBootstrap();
              }
            });
          } else if (!canSilentRefresh && userRef.current.role !== 'student') {
            if (sessionTokenRef.current) saveSessionToken(null);
            setUser(prev => ({
              ...prev,
              role: 'student',
              approvedRoles: ['student'],
              isVerified: false,
            }));
          }
        }
      } catch (err) {
        console.warn('[EcoContext] Bootstrap sync skipped:', err);
      }
    },
    [apiFetch, saveSessionToken, refreshSessionToken]
  );

  const flushOfflineQueue = useCallback(async () => {
    if (typeof navigator !== 'undefined' && !navigator.onLine) return;
    try {
      const pending = await getPendingReports();
      if (!pending || pending.length === 0) return;
      let synced = 0;
      for (const item of pending) {
        try {
          const res = await apiFetch('/api/reports/submit', {
            method: 'POST',
            body: JSON.stringify({
              clientReportId: item.id,
              title: item.title,
              description: item.description,
              category: item.category,
              severity: item.severity,
              region: item.region,
              district: item.district,
              address: item.address,
              lat: item.lat,
              lng: item.lng,
              imageUrl: item.imageUrl,
              imageBase64: item.imageBase64,
              authorSchool: item.authorSchool,
            }),
          });
          if (res.ok && !isHtmlContentType(res)) {
            await removePendingReport(item.id);
            synced++;
          }
        } catch {
          // keep in queue until next online event
        }
      }
      if (synced > 0) {
        await syncBootstrap();
        showNotification(`${synced} ta oflayn hisobot serverga sinxronlandi!`, 'success');
      }
    } catch {
      // ignore IndexedDB errors
    }
  }, [apiFetch, syncBootstrap, showNotification]);

  const setActiveTab = (tab: string) => {
    setActiveTabState(tab);
    if (typeof window !== 'undefined') {
      const targetPath = tab === 'home' ? '/' : `/${tab}`;
      if (window.location.pathname !== targetPath) {
        window.history.pushState(null, '', targetPath);
      }
    }
  };

  useEffect(() => {
    const handlePopState = () => setActiveTabState(getTabFromPath());
    const handleOnline = () => {
      setIsOnline(true);
      checkServerHealth();
      flushOfflineQueue();
    };
    const handleOffline = () => {
      setIsOnline(false);
      setIsServerConnected(false);
    };

    window.addEventListener('popstate', handlePopState);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    checkServerHealth();
    syncBootstrap();
    flushOfflineQueue();

    return () => {
      window.removeEventListener('popstate', handlePopState);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [checkServerHealth, syncBootstrap, flushOfflineQueue]);

  // Persist slices locally for fast offline startup
  useEffect(() => {
    localStorage.setItem('ecohero_partners', JSON.stringify(partners));
  }, [partners]);
  useEffect(() => {
    localStorage.setItem('ecohero_sponsorship_projects', JSON.stringify(sponsorshipProjects));
  }, [sponsorshipProjects]);
  useEffect(() => {
    localStorage.setItem('ecohero_sponsorship_proposals', JSON.stringify(sponsorshipProposals));
  }, [sponsorshipProposals]);
  useEffect(() => {
    localStorage.setItem('ecohero_eco_ads', JSON.stringify(ecoAds));
  }, [ecoAds]);
  useEffect(() => {
    localStorage.setItem('ecohero_shop_orders', JSON.stringify(shopOrders));
  }, [shopOrders]);
  useEffect(() => {
    localStorage.setItem('ecohero_shop_items', JSON.stringify(shopItems));
  }, [shopItems]);
  useEffect(() => {
    localStorage.setItem('ecohero_user', JSON.stringify(user));
  }, [user]);
  useEffect(() => {
    localStorage.setItem('ecohero_reports', JSON.stringify(reports));
  }, [reports]);
  useEffect(() => {
    localStorage.setItem('ecohero_schools', JSON.stringify(schools));
  }, [schools]);
  useEffect(() => {
    localStorage.setItem('ecohero_ambassadors', JSON.stringify(ambassadors));
  }, [ambassadors]);
  useEffect(() => {
    localStorage.setItem('ecohero_audit_logs', JSON.stringify(auditLogs));
  }, [auditLogs]);
  useEffect(() => {
    localStorage.setItem('ecohero_notifications', JSON.stringify(notifications));
  }, [notifications]);
  useEffect(() => {
    localStorage.setItem('ecohero_txs', JSON.stringify(transactions));
  }, [transactions]);
  useEffect(() => {
    localStorage.setItem('ecohero_referrals', JSON.stringify(referrals));
  }, [referrals]);
  useEffect(() => {
    localStorage.setItem('ecohero_broadcasts', JSON.stringify(broadcasts));
  }, [broadcasts]);
  useEffect(() => {
    try {
      localStorage.setItem('ecohero_eco_tasks', JSON.stringify(ecoTasks));
    } catch {}
  }, [ecoTasks]);
  useEffect(() => {
    try {
      localStorage.setItem('ecohero_reward_settings', JSON.stringify(rewardSettings));
    } catch {}
  }, [rewardSettings]);
  useEffect(() => {
    try {
      localStorage.setItem('ecohero_home_posts', JSON.stringify(homePosts));
    } catch {}
  }, [homePosts]);
  useEffect(() => {
    try {
      localStorage.setItem('ecohero_monthly_awards', JSON.stringify(monthlyAwards));
    } catch {}
  }, [monthlyAwards]);
  useEffect(() => {
    try {
      localStorage.setItem('ecohero_eco_missions', JSON.stringify(ecoMissions));
    } catch {}
  }, [ecoMissions]);

  // Prompt registration automatically for unauthenticated non-Telegram web visitors
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    const isTg = Boolean(tg?.initData || tg?.initDataUnsafe?.user);
    if (isTg) return;

    const isAlreadyOnboarded = localStorage.getItem('ecohero_onboarded') === 'true';
    if (!isAlreadyOnboarded && !user.isOnboarded && !user.isVerified) {
      const timer = window.setTimeout(() => {
        setOnboardingModalOpen(true);
      }, 900);
      return () => window.clearTimeout(timer);
    }
  }, [user.isOnboarded, user.isVerified]);

  // Sync theme
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // Test Firestore connection safely (guarded when anonymous)
  useEffect(() => {
    testFirestoreConnection();
  }, []);

  // Exchange Firebase Auth session for verified server HMAC sessionToken
  useEffect(() => {
    if (!auth) return;
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      setFirebaseAuthUid(fbUser ? fbUser.uid : null);
      if (!fbUser) return;
      try {
        const idToken = await fbUser.getIdToken();
        const sessionController = new AbortController();
        const sessionTimer = window.setTimeout(() => sessionController.abort(), 7000);
        const res = await fetch(apiUrl('/api/auth/session'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          signal: sessionController.signal,
          body: JSON.stringify({
            idToken,
            firebaseIdToken: idToken,
            uid: fbUser.uid,
            email: fbUser.email,
            fullName: fbUser.displayName || undefined,
          }),
        }).finally(() => window.clearTimeout(sessionTimer));
        const data = await parseApiJson<any>(res);
        if (res.ok && data.success && data.sessionToken) {
          saveSessionToken(data.sessionToken);
          if (data.user) {
            setUser(prev => ({ ...prev, ...data.user }));
            await syncBootstrap(data.user.uid, data.user.telegramId);
          }
        }
      } catch {
        // non-blocking
      }
    });
    return () => unsub();
  }, [saveSessionToken, syncBootstrap]);

  // Real-time Google Cloud Firestore onSnapshot listener for live_metrics/global (when Firebase Auth is ready)
  useEffect(() => {
    if (!firebaseAuthUid) return;
    const unsubscribe = subscribeLiveMetricsFromFirestore((remoteMetrics) => {
      const remoteTs = remoteMetrics.updatedAt ? Date.parse(remoteMetrics.updatedAt) : 0;
      if (Number.isFinite(remoteTs) && remoteTs > lastBootstrapServerMsRef.current) {
        const { updatedAt: _u, ...cleanMetrics } = remoteMetrics as any;
        setLiveMetrics((prev) => ({ ...prev, ...cleanMetrics }));
      }
    });
    return () => unsubscribe();
  }, [firebaseAuthUid]);

  // Mirror authoritative liveMetrics to Firestore live_metrics/global when signed-in Super Admin is active
  useEffect(() => {
    if (!firebaseAuthUid || !auth?.currentUser) return;
    const isSuper =
      user.role === 'super_admin' ||
      (Array.isArray(user.approvedRoles) && user.approvedRoles.includes('super_admin'));
    if (!isSuper) return;
    const signature = JSON.stringify({
      s: liveMetrics.totalSchools,
      u: liveMetrics.totalUsers,
      b: liveMetrics.botUsersCount,
      r: liveMetrics.resolvedReports,
      t: liveMetrics.treesPlanted,
      a: liveMetrics.activeAmbassadors,
    });
    if (signature === lastSyncedMetricsKeyRef.current) return;
    const timer = window.setTimeout(() => {
      lastSyncedMetricsKeyRef.current = signature;
      syncLiveMetricsToFirestore(liveMetrics).catch(() => {});
    }, 600);
    return () => window.clearTimeout(timer);
  }, [firebaseAuthUid, user.role, user.approvedRoles, liveMetrics]);

  // Telegram WebApp detection & auto-authentication
  useEffect(() => {
    const tg = (window as any).Telegram?.WebApp;
    if (tg && (tg.initData || tg.initDataUnsafe?.user)) {
      setIsTelegramMiniApp(true);
      try {
        tg.ready();
        tg.expand();
        if (typeof tg.setHeaderColor === 'function') tg.setHeaderColor('#020617');
        if (typeof tg.setBackgroundColor === 'function') tg.setBackgroundColor('#020617');
        if (tg.colorScheme === 'light') setTheme('light');
      } catch {
        // ignore WebApp styling issues
      }

      const authController = new AbortController();
      const authTimeout = window.setTimeout(() => authController.abort(), 7000);
      fetch(apiUrl('/api/telegram/auth-webapp'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: authController.signal,
        body: JSON.stringify({
          initData: tg.initData || '',
          unsafeUser: tg.initDataUnsafe?.user || null,
        }),
      })
        .finally(() => window.clearTimeout(authTimeout))
        .then(res => parseApiJson<any>(res))
        .then(data => {
          if (data.success && data.user) {
            if (data.sessionToken) saveSessionToken(data.sessionToken);
            setUser(prev => ({
              ...prev,
              ...data.user,
            }));
            if (data.user.uid) {
              localStorage.setItem('ecohero_session_uid', data.user.uid);
            }
            if (data.user.isOnboarded) {
              localStorage.setItem('ecohero_onboarded', 'true');
              setOnboardingModalOpen(false);
              showNotification(`Xush kelibsiz, ${data.user.fullName || 'Eko-Qahramon'}!`, 'success');
            } else {
              localStorage.removeItem('ecohero_onboarded');
              setOnboardingModalOpen(true);
            }
            syncBootstrap(data.user.uid, data.user.telegramId);
            triggerHaptic('success');
          }
        })
        .catch(err => {
          console.error('Telegram WebApp auth error:', err);
        });
    }
  }, [syncBootstrap, showNotification, triggerHaptic, saveSessionToken]);

  // URL query parameter routing & referral linking
  const claimReferral = useCallback(
    async (codeOrUid: string): Promise<{ success: boolean; message: string }> => {
      try {
        const clean = codeOrUid.trim();
        const isCodeFormat = clean.toUpperCase().startsWith('ECO') && clean.length <= 12;
        const res = await apiFetch('/api/referrals/claim', {
          method: 'POST',
          body: JSON.stringify({
            referrerUid: isCodeFormat ? undefined : clean,
            referralCode: isCodeFormat ? clean.toUpperCase() : undefined,
            newUserId: userRef.current.uid,
            newUserName: userRef.current.fullName,
            referredSchool: userRef.current.schoolName,
          }),
        });
        const data = await res.json();
        if (data.success) {
          const rewardAmt = data.reward ?? rewardSettings.referralInvitee;
          showNotification(`Taklif bonusi faollashtirildi! +${rewardAmt} EcoCoin qo'shildi.`, 'success');
          triggerConfetti();
          triggerHaptic('success');
          setUser(prev => ({
            ...prev,
            ecoCoins: (prev.ecoCoins || 0) + rewardAmt,
            referredBy: clean,
          }));
          if (data.record) {
            setReferrals(prev => [data.record, ...prev]);
          }
          await syncBootstrap();
          return { success: true, message: 'Referal muvaffaqiyatli qabul qilindi' };
        }
        return { success: false, message: data.error || 'Taklif havolasi aktivlashtirilmadi' };
      } catch (err: any) {
        return { success: false, message: err.message };
      }
    },
    [apiFetch, rewardSettings.referralInvitee, showNotification, triggerConfetti, triggerHaptic, syncBootstrap]
  );

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    if (tab && VALID_TABS.has(tab.toLowerCase())) {
      setActiveTab(tab.toLowerCase());
    }
    const refCode = params.get('ref');
    if (refCode && refCode !== userRef.current.uid && refCode !== userRef.current.referralCode) {
      claimReferral(refCode);
    }
  }, [claimReferral]);

  const toggleTheme = () => setTheme(prev => (prev === 'dark' ? 'light' : 'dark'));

  const isSuperAdminUser =
    user.role === 'super_admin' ||
    (Array.isArray(user.approvedRoles) && user.approvedRoles.includes('super_admin'));

  const openRoleRequestModal = (role: UserRole) => {
    setTargetRequestedRole(role);
    setRoleRequestModalOpen(true);
  };

  const closeRoleRequestModal = () => {
    setRoleRequestModalOpen(false);
    setTargetRequestedRole(null);
  };

  const submitRoleRequest = async (requestedRole: UserRole, reason: string): Promise<{ success: boolean; message: string }> => {
    try {
      const roleNames: Record<UserRole, string> = {
        student: "O'quvchi",
        ambassador: 'Eko-Elchi',
        school_admin: 'Maktab Admini / Sardori',
        district_coordinator: 'Tuman Koordinator',
        regional_coordinator: 'Viloyat Koordinator',
        moderator: 'Mintaqaviy Moderator',
        super_admin: 'Super Admin',
        sponsor: 'Homiy va Hamkor',
      };

      const requestedRoleName = roleNames[requestedRole] || requestedRole;
      const messageTemplate = `${requestedRoleName} bo'lmoqchiman shunga ruxsat berishingizni so'rayman. Sabab: ${reason}`;

      const res = await apiFetch('/api/roles/request', {
        method: 'POST',
        body: JSON.stringify({
          userName: user.fullName,
          userPhone: user.phoneNumber,
          userSchool: user.schoolName,
          requestedRole,
          requestedRoleName,
          reason: messageTemplate,
          telegramUsername: user.telegramUsername,
        }),
      });

      const data = await res.json();
      if (data.success && data.request) {
        setRoleRequests(prev => [data.request, ...prev]);
        showNotification(`So'rovingiz @jasurdost ma'muriyatiga yuborildi! Telegram orqali xabar berildi.`, 'success');
        triggerHaptic('success');
        return { success: true, message: "So'rov yuborildi" };
      }
      return { success: false, message: data.error || 'Xatolik yuz berdi' };
    } catch (err: any) {
      console.error('submitRoleRequest error:', err);
      return { success: false, message: err.message };
    }
  };

  const approveRoleRequest = async (requestId: string): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/roles/approve', {
        method: 'POST',
        body: JSON.stringify({ requestId }),
      });
      const data = await res.json();
      if (data.success) {
        setRoleRequests(prev =>
          prev.map(r => (r.id === requestId ? { ...r, status: 'approved', reviewedAt: new Date().toISOString() } : r))
        );
        await syncBootstrap();
        showNotification("Rol so'rovi muvaffaqiyatli tasdiqlandi!", 'success');
        triggerConfetti();
        return true;
      }
    } catch (e) {
      console.error('approveRoleRequest error:', e);
    }
    return false;
  };

  const rejectRoleRequest = async (requestId: string, notes?: string): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/roles/reject', {
        method: 'POST',
        body: JSON.stringify({ requestId, adminNotes: notes }),
      });
      const data = await res.json();
      if (data.success) {
        setRoleRequests(prev =>
          prev.map(r => (r.id === requestId ? { ...r, status: 'rejected', adminNotes: notes } : r))
        );
        await syncBootstrap();
        showNotification("Rol so'rovi rad etildi", 'info');
        return true;
      }
    } catch (e) {
      console.error('rejectRoleRequest error:', e);
    }
    return false;
  };

  const switchRole = async (newRole: UserRole) => {
    const isApproved =
      isSuperAdminUser ||
      newRole === 'student' ||
      (user.approvedRoles && user.approvedRoles.includes(newRole));

    if (!isApproved) {
      setTargetRequestedRole(newRole);
      setRoleRequestModalOpen(true);
      showNotification(`Ushbu lavozimga o'tish uchun Super Admin ruxsati zarur!`, 'warning');
      return;
    }

    try {
      const res = await apiFetch('/api/user/profile', {
        method: 'POST',
        body: JSON.stringify({ activeRole: newRole }),
      });
      const data = await res.json();
      if (res.ok && data.success && data.profile) {
        setUser(prev => ({ ...prev, ...data.profile }));
        showNotification(`Hozirgi rolingiz: ${newRole.replace('_', ' ').toUpperCase()}`, 'info');
        await syncBootstrap();
        return;
      }
      if (!res.ok) {
        showNotification(data.error || "Rolni almashtirish rad etildi", 'warning');
        return;
      }
    } catch {
      // ignore if offline
    }
    setUser(prev => ({ ...prev, role: newRole }));
  };

  const loginUser = async (email: string, pass: string) => {
    let fbUid: string | null = null;
    try {
      const fbUser = await loginWithEmail(email, pass);
      fbUid = fbUser?.uid || null;
    } catch {
      // ignore if Firebase Auth account only exists in centralDb
    }

    const res = await fetch(apiUrl('/api/auth/login-user'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email.trim(), password: pass }),
    });
    const data = await parseApiJson<any>(res);
    if (!res.ok || !data.success || !data.user) {
      throw new Error(data.error || "Email yoki parol noto'g'ri");
    }

    if (data.sessionToken) saveSessionToken(data.sessionToken);
    setUser(prev => ({
      ...prev,
      ...data.user,
      ...(fbUid ? { uid: data.user.uid || fbUid } : {}),
    }));
    if (data.user.uid) localStorage.setItem('ecohero_session_uid', data.user.uid);
    if (data.user.isOnboarded) localStorage.setItem('ecohero_onboarded', 'true');
    if (data.user.welcomeBonusClaimed) localStorage.setItem('ecohero_welcome_bonus_claimed', 'true');

    await syncBootstrap(data.user.uid, data.user.telegramId);
    triggerHaptic('success');
    showNotification(`Xush kelibsiz, ${data.user.fullName}!`, 'success');
  };

  const registerUser = async (email: string, pass: string, profileData: Partial<UserProfile>) => {
    try {
      await registerWithEmail(email, pass, profileData);
    } catch {
      // proceed with unified centralDb registration
    }

    const res = await fetch(apiUrl('/api/auth/register-user'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: email.trim(),
        password: pass,
        fullName: profileData.fullName,
        phoneNumber: profileData.phoneNumber,
        schoolName: profileData.schoolName,
        schoolNumber: profileData.schoolNumber,
        region: profileData.region,
        district: profileData.district,
        grade: profileData.grade,
      }),
    });

    const data = await parseApiJson<any>(res);
    if (!res.ok || !data.success || !data.user) {
      throw new Error(data.error || "Ro'yxatdan o'tishda xatolik yuz berdi");
    }

    if (data.sessionToken) saveSessionToken(data.sessionToken);
    setUser(data.user);
    localStorage.setItem('ecohero_session_uid', data.user.uid);
    localStorage.setItem('ecohero_onboarded', 'true');
    localStorage.setItem('ecohero_welcome_bonus_claimed', 'true');
    if (data.school) {
      setSchools(prev => {
        const exists = prev.some(s => s.id === data.school.id);
        return exists ? prev.map(s => (s.id === data.school.id ? data.school : s)) : [...prev, data.school];
      });
    }

    await syncBootstrap(data.user.uid, data.user.telegramId);
    triggerConfetti();
    triggerHaptic('success');
    showNotification(`Ro'yxatdan muvaffaqiyatli o'tdingiz! +${rewardSettings.welcomeBonus} EcoCoin qo'shildi.`, 'success');
  };

  const loginWithGoogle = async () => {
    const fbUser = await signInWithGoogle();
    const idToken = await fbUser.getIdToken();
    const res = await fetch(apiUrl('/api/auth/session'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        idToken,
        firebaseIdToken: idToken,
        uid: fbUser.uid,
        email: fbUser.email,
        fullName: fbUser.displayName || undefined,
      }),
    });
    const data = await parseApiJson<any>(res);
    if (!res.ok || !data.success || !data.user) {
      throw new Error(data.error || "Google orqali sessiya ochib bo'lmadi");
    }
    if (data.sessionToken) saveSessionToken(data.sessionToken);
    setUser(prev => ({ ...prev, ...data.user }));
    if (data.user.uid) localStorage.setItem('ecohero_session_uid', data.user.uid);
    if (data.user.isOnboarded) localStorage.setItem('ecohero_onboarded', 'true');
    if (data.user.welcomeBonusClaimed) localStorage.setItem('ecohero_welcome_bonus_claimed', 'true');
    await syncBootstrap(data.user.uid, data.user.telegramId);
    triggerHaptic('success');
    showNotification(`Xush kelibsiz, ${data.user.fullName || fbUser.displayName || 'Eko-Qahramon'}!`, 'success');
  };

  const logoutUser = async () => {
    await logOutFirebase();
    saveSessionToken(null);
    const freshUid = generateWebUid();
    localStorage.removeItem('ecohero_user');
    localStorage.removeItem('ecohero_onboarded');
    localStorage.removeItem('ecohero_welcome_bonus_claimed');
    localStorage.setItem('ecohero_session_uid', freshUid);
    const resetUser: UserProfile = {
      ...INITIAL_USER,
      uid: freshUid,
    };
    setUser(resetUser);
    setShopOrders([]);
    await syncBootstrap(freshUid, null);
    showNotification('Tizimdan chiqdingiz', 'info');
  };

  const openOnboardingModal = () => setOnboardingModalOpen(true);
  const closeOnboardingModal = () => setOnboardingModalOpen(false);
  const openEditProfileModal = () => setEditProfileModalOpen(true);
  const closeEditProfileModal = () => setEditProfileModalOpen(false);

  const completeOnboarding = async (data: {
    fullName: string;
    phoneNumber: string;
    region: string;
    district: string;
    schoolName: string;
    grade: string;
    privacyAccepted: boolean;
  }) => {
    const hadBonusBefore = Boolean(user.welcomeBonusClaimed || localStorage.getItem('ecohero_welcome_bonus_claimed') === 'true');

    try {
      const res = await apiFetch('/api/user/onboarding', {
        method: 'POST',
        body: JSON.stringify({
          fullName: data.fullName,
          phoneNumber: data.phoneNumber,
          region: data.region,
          district: data.district,
          schoolName: data.schoolName,
          grade: data.grade,
        }),
      });

      const result = await parseApiJson<any>(res);
      if (res.status === 401) {
        setAuthModalOpen(true);
        throw new Error(result?.error || "Ro'yxatdan o'tishni yakunlash uchun avval hisobingizga kiring.");
      }
      if (!res.ok || !result.success || !result.profile) {
        throw new Error(result.error || "Ma'lumotlarni saqlashda xatolik yuz berdi");
      }

      if (result.sessionToken) saveSessionToken(result.sessionToken);
      const savedProfile: UserProfile = {
        ...user,
        ...result.profile,
        privacyConsentAccepted: data.privacyAccepted,
      };
      setUser(savedProfile);
      if (savedProfile.uid) {
        localStorage.setItem('ecohero_session_uid', savedProfile.uid);
      }
      localStorage.setItem('ecohero_user', JSON.stringify(savedProfile));
      localStorage.setItem('ecohero_onboarded', 'true');
      localStorage.setItem('ecohero_welcome_bonus_claimed', 'true');
      setOnboardingModalOpen(false);

      if (result.school) {
        setSchools(prev => {
          const exists = prev.some(s => s.id === result.school.id);
          return exists ? prev.map(s => (s.id === result.school.id ? result.school : s)) : [...prev, result.school];
        });
      }

      await syncBootstrap(savedProfile.uid, savedProfile.telegramId);

      if (!hadBonusBefore) {
        triggerConfetti();
        triggerHaptic('success');
        showNotification(`Tabriklaymiz! Ro'yxatdan o'tdingiz va +${rewardSettings.welcomeBonus} EcoCoin hamda maktabingiz reytingga qo'shildi!`, 'success');
      } else {
        showNotification("Ma'lumotlaringiz yagona bazada yangilandi!", 'success');
      }
    } catch (e: any) {
      console.warn('Backend onboarding error:', e);
      throw e;
    }
  };

  const updateUserProfile = async (data: Partial<UserProfile>) => {
    try {
      const res = await apiFetch('/api/user/profile', {
        method: 'POST',
        body: JSON.stringify({ ...data }),
      });
      const result = await res.json();
      if (result.success && result.profile) {
        setUser(prev => {
          const updated = { ...prev, ...result.profile };
          localStorage.setItem('ecohero_user', JSON.stringify(updated));
          return updated;
        });
        await syncBootstrap(result.profile.uid, result.profile.telegramId);
      }
    } catch (e) {
      console.warn('Profile sync error:', e);
    }
    showNotification("Ma'lumotlar saqlandi", 'success');
  };

  const claimDailyQuizReward = async (
    _rewardCoins?: number,
    reason: string = 'Kunlik Eko-Viktorina bonusi'
  ): Promise<boolean> => {
    const dynamicReward = rewardSettings.dailyQuiz;
    try {
      const res = await apiFetch('/api/quiz/claim', {
        method: 'POST',
        body: JSON.stringify({ reason }),
      });
      const data = await res.json();
      if (data.alreadyClaimed) {
        showNotification(data.message || 'Bugungi viktorina mukofoti allaqachon olingan', 'info');
        return false;
      }
      if (data.success) {
        const earned = data.rewardCoins ?? dynamicReward;
        setUser(prev => ({
          ...prev,
          ecoCoins: data.ecoCoins ?? (prev.ecoCoins || 0) + earned,
          totalCoinsEarned: (prev.totalCoinsEarned || 0) + earned,
        }));
        await syncBootstrap();
        triggerConfetti();
        triggerHaptic('success');
        showNotification(`Ajoyib! +${earned} EcoCoin balansingizga qo'shildi!`, 'success');
        return true;
      }
    } catch (e) {
      console.warn('Quiz claim error:', e);
    }
    return false;
  };

  const claimDailyStreakReward = async (): Promise<{
    success: boolean;
    rewardCoins?: number;
    streakDays?: number;
    wasReset?: boolean;
    alreadyClaimed?: boolean;
  }> => {
    try {
      if (sessionToken) {
        const res = await apiFetch('/api/streak/claim', {
          method: 'POST',
          body: JSON.stringify({}),
        });
        const data = await res.json();
        if (data.alreadyClaimed) {
          if (data.user) {
            setUser(prev => {
              const updated = { ...prev, ...data.user };
              localStorage.setItem('ecohero_user', JSON.stringify(updated));
              return updated;
            });
          }
          showNotification(data.message || 'Bugungi kunlik streak mukofoti allaqachon olingan', 'info');
          return { success: false, alreadyClaimed: true, streakDays: data.streakDays };
        }

        if (data.success) {
          const earned = Number(data.rewardCoins || 50);
          const nextDays = Number(data.streakDays || 1);
          setUser(prev => {
            const updated: UserProfile = {
              ...prev,
              ...(data.user || {}),
              ecoCoins: data.ecoCoins ?? (prev.ecoCoins || 0) + earned,
              totalCoinsEarned: (prev.totalCoinsEarned || 0) + earned,
              streakDays: nextDays,
              lastStreakClaimDate: data.lastStreakClaimDate,
              activityStats: {
                ...(prev.activityStats || {
                  reportsCount: 0,
                  cleanupsCount: 0,
                  treesPlanted: 0,
                  streakDays: nextDays,
                  totalCoinsEarned: 0,
                }),
                ...(data.user?.activityStats || {}),
                streakDays: nextDays,
                totalCoinsEarned:
                  data.user?.activityStats?.totalCoinsEarned ??
                  (prev.activityStats?.totalCoinsEarned || 0) + earned,
              },
            };
            localStorage.setItem('ecohero_user', JSON.stringify(updated));
            return updated;
          });
          await syncBootstrap();
          triggerConfetti();
          triggerHaptic('success');
          if (data.wasResetDueToInactivity) {
            showNotification(
              `Kecha kirmaganingiz uchun streak 1-kundan boshlandi: +${earned} EcoCoin! Ertaga +${data.nextTomorrowReward || 100} oling!`,
              'info'
            );
          } else {
            showNotification(
              `${nextDays}-kunlik Eko-Streak! +${earned} EcoCoin qo'shildi. Ertaga kirsangiz +${data.nextTomorrowReward || 100} EcoCoin!`,
              'success'
            );
          }
          return {
            success: true,
            rewardCoins: earned,
            streakDays: nextDays,
            wasReset: Boolean(data.wasResetDueToInactivity),
          };
        }
      }
    } catch (e) {
      console.warn('Server streak claim error, checking guest state:', e);
    }

    // Guest / pre-auth fallback using exact same calendar-day escalating logic
    const computed = computeUserStreakState({
      lastStreakClaimDate: user.lastStreakClaimDate,
      storedStreakDays: user.streakDays ?? user.activityStats?.streakDays ?? 0,
    });

    if (computed.claimedToday) {
      showNotification('Bugungi kunlik streak mukofoti allaqachon olingan', 'info');
      return { success: false, alreadyClaimed: true, streakDays: computed.currentStreakDays };
    }

    const earned = computed.todayReward;
    const nextDays = computed.claimDayNumber;
    setUser(prev => {
      const updated: UserProfile = {
        ...prev,
        ecoCoins: (prev.ecoCoins || 0) + earned,
        totalCoinsEarned: (prev.totalCoinsEarned || 0) + earned,
        streakDays: nextDays,
        lastStreakClaimDate: computed.todayKey,
        activityStats: {
          ...(prev.activityStats || {
            reportsCount: 0,
            cleanupsCount: 0,
            treesPlanted: 0,
            streakDays: nextDays,
            totalCoinsEarned: 0,
          }),
          streakDays: nextDays,
          totalCoinsEarned: (prev.activityStats?.totalCoinsEarned || 0) + earned,
        },
      };
      localStorage.setItem('ecohero_user', JSON.stringify(updated));
      return updated;
    });
    triggerConfetti();
    triggerHaptic('success');
    showNotification(
      computed.wasResetDueToInactivity
        ? `Kecha kirmaganingiz uchun streak 1-kundan boshlandi: +${earned} EcoCoin!`
        : `${nextDays}-kunlik Eko-Streak! +${earned} EcoCoin qo'shildi!`,
      computed.wasResetDueToInactivity ? 'info' : 'success'
    );
    return {
      success: true,
      rewardCoins: earned,
      streakDays: nextDays,
      wasReset: computed.wasResetDueToInactivity,
    };
  };

  const updateShopItemPriceAndStock = async (itemId: string, newPriceCoins: number, newStock: number): Promise<boolean> => {
    return updateShopItem(itemId, { priceCoins: newPriceCoins, stock: newStock });
  };

  const updateShopItem = async (itemId: string, updates: Partial<ShopItem>): Promise<boolean> => {
    const previousItems = shopItems;
    setShopItems(prev => prev.map(item => (item.id === itemId ? { ...item, ...updates } : item)));

    try {
      const res = await apiFetch('/api/admin/shop/item-update', {
        method: 'POST',
        body: JSON.stringify({
          itemId,
          ...updates,
          newPriceCoins: updates.priceCoins,
          newStock: updates.stock,
        }),
      });
      const data = await parseApiJson<any>(res);
      if (res.ok && data?.success) {
        if (data.item) {
          setShopItems(prev => prev.map(item => (item.id === itemId ? data.item : item)));
          syncCatalogRecordToFirestore('shopItems', data.item.id, data.item).catch(() => {});
        }
        await syncBootstrap();
        showNotification("Sovg'a muvaffaqiyatli yangilandi!", 'success');
        return true;
      }
      setShopItems(previousItems);
      await syncBootstrap();
      if (res.status === 401 || res.status === 403) {
        showNotification("Sessiya tasdiqlanmagan. Super Admin hisobiga qayta kiring.", 'warning');
        if (res.status === 401) setAuthModalOpen(true);
      } else {
        showNotification(data?.error || "Sovg'ani yangilashda xatolik", 'warning');
      }
      return false;
    } catch (e: any) {
      console.error('Failed to update shop item on server:', e);
      setShopItems(previousItems);
      await syncBootstrap();
      showNotification(e?.message || "Server bilan bog'lanishda xatolik", 'warning');
      return false;
    }
  };

  const createShopItem = async (itemData: Omit<ShopItem, 'id'>): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/admin/shop/item-create', {
        method: 'POST',
        body: JSON.stringify(itemData),
      });
      const data = await parseApiJson<any>(res);
      if (res.ok && data?.success && data?.item) {
        setShopItems(prev => [data.item, ...prev]);
        syncCatalogRecordToFirestore('shopItems', data.item.id, data.item).catch(() => {});
        await syncBootstrap();
        showNotification("Yangi sovg'a Eko-Bozorga muvaffaqiyatli qo'shildi!", 'success');
        triggerConfetti();
        return true;
      }
      if (res.status === 401 || res.status === 403) {
        showNotification("Sessiya tasdiqlanmagan. Super Admin hisobiga qayta kiring.", 'warning');
        if (res.status === 401) setAuthModalOpen(true);
      } else {
        showNotification(data?.error || "Sovg'ani saqlashda xatolik yuz berdi", 'warning');
      }
      return false;
    } catch (e: any) {
      console.error('Failed to create shop item on server:', e);
      showNotification(e?.message || "Server bilan bog'lanishda xatolik", 'warning');
      return false;
    }
  };

  const addReport = (reportData: AddReportInput): EcoReport => {
    const newId = reportData.id || `rep_${Date.now()}`;
    const newReport: EcoReport = {
      title: reportData.title,
      description: reportData.description,
      category: reportData.category,
      severity: reportData.severity,
      status: reportData.status || 'pending',
      region: reportData.region,
      district: reportData.district,
      address: reportData.address,
      lat: reportData.lat,
      lng: reportData.lng,
      imageUrl: reportData.imageUrl,
      resolvedImageUrl: reportData.resolvedImageUrl,
      rewardCoins: reportData.rewardCoins ?? rewardSettings.problemVerified,
      aiAnalysis: reportData.aiAnalysis,
      id: newId,
      createdAt: reportData.createdAt || new Date().toISOString(),
      upvotes: 1,
      hasUpvoted: true,
      reporterUid: user.uid,
      reporterName: user.fullName,
      schoolId: reportData.schoolId || user.schoolId,
      schoolName: user.schoolName,
    };

    setReports(prev => [newReport, ...prev.filter(r => r.id !== newId)]);

    if (!reportData.skipLocalReward) {
      setUser(prev => ({
        ...prev,
        reportsCount: (prev.reportsCount || 0) + 1,
        activityStats: {
          ...prev.activityStats,
          reportsCount: (prev.activityStats?.reportsCount || 0) + 1,
        },
      }));
    }

    triggerConfetti();
    triggerHaptic('success');
    showNotification(`Arizangiz qabul qilindi! Moderator tasdiqlagach +${rewardSettings.problemVerified} EcoCoin beriladi.`, 'success');
    return newReport;
  };

  const updateReportStatus = async (id: string, status: ProblemStatus, _rewardCoins?: number) => {
    setReports(prev =>
      prev.map(rep =>
        rep.id === id
          ? {
              ...rep,
              status,
              resolvedAt: status === 'resolved' ? new Date().toISOString() : rep.resolvedAt,
            }
          : rep
      )
    );

    try {
      const res = await apiFetch(`/api/reports/${id}/status`, {
        method: 'POST',
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        await syncBootstrap();
        if (status === 'resolved' || status === 'verified') {
          triggerConfetti();
          triggerHaptic('success');
          showNotification("Hisobot tasdiqlandi! O'quvchi va maktab balansiga EcoCoin qo'shildi.", 'success');
        } else {
          showNotification(`Arizaning holati yangilandi: ${status}`, 'info');
        }
        return;
      } else if (!res.ok) {
        showNotification(data.error || "Ruxsat yo'q", 'warning');
        return;
      }
    } catch (e) {
      console.error('updateReportStatus error:', e);
    }

    showNotification(`Arizaning holati o'zgartirildi: ${status}`, 'info');
  };

  const upvoteReport = (id: string) => {
    setReports(prev =>
      prev.map(rep => {
        if (rep.id === id) {
          const already = rep.hasUpvoted;
          return {
            ...rep,
            upvotes: already ? Math.max(0, rep.upvotes - 1) : rep.upvotes + 1,
            hasUpvoted: !already,
          };
        }
        return rep;
      })
    );

    apiFetch(`/api/reports/${id}/upvote`, {
      method: 'POST',
      body: JSON.stringify({ userId: user.uid }),
    }).catch(() => {});
  };

  const registerSchool = (
    schoolData: Omit<School, 'id' | 'totalCoins' | 'treesPlanted' | 'cleanupsCompleted' | 'ratingRank' | 'status' | 'createdAt'>
  ): School => {
    const schoolId = `school_${Date.now()}`;
    const newSchool: School = {
      ...schoolData,
      id: schoolId,
      totalCoins: 0,
      treesPlanted: 0,
      cleanupsCompleted: 0,
      ratingRank: schools.length + 1,
      status: 'active',
      createdAt: new Date().toISOString(),
    };

    setSchools(prev => [...prev, newSchool]);

    apiFetch('/api/schools/register', {
      method: 'POST',
      body: JSON.stringify(schoolData),
    })
      .then(res => res.json())
      .then(data => {
        if (data.success && data.school) {
          syncBootstrap();
        }
      })
      .catch(() => {});

    triggerConfetti();
    showNotification(`"${newSchool.name}" maktabi bazaga qo'shildi!`, 'success');
    return newSchool;
  };

  const appointAmbassador = async (schoolId: string, fullName: string, email: string) => {
    const targetSchool = schools.find(s => s.id === schoolId);
    const optimisticAmb: Ambassador = {
      id: `amb_${Date.now()}`,
      schoolId,
      schoolName: targetSchool?.name || 'Maktab',
      fullName,
      email,
      phone: user.phoneNumber || '',
      status: 'active',
      appointedAt: new Date().toISOString(),
      permissions: ['manage_reports', 'host_cleanup', 'invite_students', 'redeem_vouchers'],
    };

    try {
      const res = await apiFetch('/api/ambassadors/appoint', {
        method: 'POST',
        body: JSON.stringify({
          schoolId,
          schoolName: targetSchool?.name,
          fullName,
          email,
          phone: user.phoneNumber || '',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        showNotification(data.error || "Ruxsat yo'q", 'warning');
        return;
      }
      if (data.success) {
        setAmbassadors(prev => [data.ambassador || optimisticAmb, ...prev]);
        await syncBootstrap();
        showNotification(`${fullName} ${optimisticAmb.schoolName} elchisi etib tayinlandi!`, 'success');
      }
    } catch (e) {
      console.error('appointAmbassador error:', e);
    }
  };

  const verifyGiftSubscriptions = async (
    itemId: string,
    visitedTargetIds: string[]
  ): Promise<{ success: boolean; verifiedTargetIds?: string[]; error?: string }> => {
    try {
      const res = await apiFetch('/api/shop/verify-subscriptions', {
        method: 'POST',
        body: JSON.stringify({ itemId, visitedTargetIds }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        const msg = data.error || "Obunani tekshirishda xatolik";
        showNotification(msg, 'warning');
        return { success: false, error: msg };
      }
      return { success: true, verifiedTargetIds: data.verifiedTargetIds || visitedTargetIds };
    } catch (e: any) {
      const msg = e?.message || "Server bilan bog'lanishda xatolik";
      showNotification(msg, 'warning');
      return { success: false, error: msg };
    }
  };

  const redeemShopItem = async (
    item: ShopItem,
    options?: { confirmedSubscriptionIds?: string[] }
  ): Promise<{
    success: boolean;
    message: string;
    voucherCode?: string;
    voucherUrl?: string;
    itemImageUrl?: string;
    order?: ShopOrder;
  }> => {
    if ((item.stock || 0) <= 0) {
      showNotification('Ushbu mahsulot omborda qolmagan!', 'warning');
      return { success: false, message: 'Mahsulot omborda tugagan' };
    }
    if (user.ecoCoins < item.priceCoins) {
      showNotification(`Mablag' yetarli emas! Sizga yana ${item.priceCoins - user.ecoCoins} EcoCoin kerak.`, 'warning');
      return { success: false, message: 'Tangalar yetarli emas' };
    }

    try {
      const res = await apiFetch('/api/shop/order', {
        method: 'POST',
        body: JSON.stringify({
          itemId: item.id,
          itemTitle: item.title,
          itemImageUrl: item.imageUrl,
          priceCoins: item.priceCoins,
          sponsorName: item.sponsorName,
          confirmedSubscriptionIds: options?.confirmedSubscriptionIds || [],
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification(data.error || 'Buyurtma rasmiylashtirilmadi', 'warning');
        return { success: false, message: data.error || 'Buyurtma xatoligi' };
      }

      if (data.order) {
        setShopOrders(prev => [data.order, ...prev]);
      }
      setShopItems(prev =>
        prev.map(i => (i.id === item.id ? { ...i, stock: data.updatedStock ?? Math.max(0, (i.stock || 0) - 1) } : i))
      );
      setUser(prev => ({
        ...prev,
        ecoCoins: data.newBalance ?? Math.max(0, prev.ecoCoins - item.priceCoins),
      }));

      await syncBootstrap();
      triggerConfetti();
      triggerHaptic('success');
      showNotification(`Xaridingiz muvaffaqiyatli! Vaucher kodi: ${data.voucherCode}`, 'success');
      return {
        success: true,
        message: "Sovg'a qabul qilindi!",
        voucherCode: data.voucherCode,
        voucherUrl: data.voucherUrl,
        itemImageUrl: data.order?.itemImageUrl || item.imageUrl,
        order: data.order,
      };
    } catch (e) {
      console.error('redeemShopItem network fallback:', e);
      return { success: false, message: "Server bilan aloqa yo'q" };
    }
  };

  const updateShopOrderStatus = async (orderId: string, status: 'approved' | 'delivered' | 'cancelled') => {
    const previousOrders = shopOrders;
    setShopOrders(prev =>
      prev.map(o => (o.id === orderId ? { ...o, status, approvedAt: new Date().toISOString() } : o))
    );
    try {
      const res = await apiFetch(`/api/admin/shop/orders/${orderId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      const data = await parseApiJson<any>(res);
      if (!res.ok || !data?.success) {
        setShopOrders(previousOrders);
        showNotification(data?.error || 'Buyurtma holati yangilanmadi', 'warning');
        if (res.status === 401) setAuthModalOpen(true);
        return;
      }
      await syncBootstrap();
      showNotification(`Buyurtma holati yangilandi: ${status}`, 'info');
    } catch (err: any) {
      setShopOrders(previousOrders);
      showNotification(err?.message || "Server bilan bog'lanishda xatolik", 'warning');
    }
  };

  const checkVoucherCode = async (code: string): Promise<VoucherCheckResult> => {
    const clean = code.trim().toUpperCase();
    if (!clean) return { valid: false, error: 'Promokod kiritilishi shart' };
    try {
      const res = await apiFetch(`/api/shop/voucher/check/${encodeURIComponent(clean)}`);
      const data = await res.json();
      if (!res.ok || !data.valid) {
        return { valid: false, error: data.error || 'Vaucher topilmadi' };
      }
      return {
        valid: true,
        alreadyDelivered: Boolean(data.alreadyDelivered),
        order: data.order,
      };
    } catch (err: any) {
      return { valid: false, error: err?.message || 'Serverga ulanib bo‘lmadi' };
    }
  };

  const verifyAndForwardVoucher = async (
    voucherCode: string,
    payload: { note?: string; action?: 'forward' | 'deliver' } = {}
  ): Promise<{ success: boolean; order?: ShopOrder; message?: string; error?: string }> => {
    try {
      const res = await apiFetch('/api/shop/voucher/verify-forward', {
        method: 'POST',
        body: JSON.stringify({ voucherCode, note: payload.note, action: payload.action }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification(data.error || 'Vaucher tasdiqlanmadi', 'warning');
        return { success: false, error: data.error || 'Xatolik' };
      }
      if (data.order) {
        setShopOrders(prev => {
          const exists = prev.some(o => o.id === data.order.id);
          return exists ? prev.map(o => (o.id === data.order.id ? data.order : o)) : [data.order, ...prev];
        });
      }
      await syncBootstrap();
      triggerConfetti();
      showNotification(data.message || 'Vaucher tasdiqlandi!', 'success');
      return { success: true, order: data.order, message: data.message };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Tarmoq xatoligi' };
    }
  };

  const startAdWatch = async (adId: string) => {
    try {
      const res = await apiFetch('/api/ads/watch-start', {
        method: 'POST',
        body: JSON.stringify({ adId }),
      });
      const data = await res.json();
      if (data.adWatchState) {
        setAdWatchState(data.adWatchState);
      }
      if (!res.ok || !data.success) {
        return {
          success: false,
          cooldownActive: Boolean(data.cooldownActive),
          remainingSeconds: data.remainingSeconds,
          nextAvailableAt: data.nextAvailableAt,
          adWatchState: data.adWatchState || null,
          error: data.error || 'Reklama boshlanmadi',
        };
      }
      return {
        success: true,
        watchSessionId: data.watchSessionId,
        requiredSeconds: data.requiredSeconds || 15,
        adWatchState: data.adWatchState || null,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Server xatoligi' };
    }
  };

  const claimAdWatchReward = async (adId: string, watchSessionId: string) => {
    try {
      const res = await apiFetch('/api/ads/watch-reward', {
        method: 'POST',
        body: JSON.stringify({ adId, watchSessionId }),
      });
      const data = await res.json();
      if (data.adWatchState) {
        setAdWatchState(data.adWatchState);
      }
      if (!res.ok || !data.success) {
        showNotification(data.error || 'Mukofot olinmadi', 'warning');
        return {
          success: false,
          adWatchState: data.adWatchState || null,
          error: data.error || 'Mukofot olinmadi',
        };
      }
      const awarded = Number(data.awardedCoins || 100);
      setUser(prev => ({
        ...prev,
        ecoCoins: data.newBalance ?? (prev.ecoCoins || 0) + awarded,
        totalCoinsEarned: (prev.totalCoinsEarned || 0) + awarded,
      }));
      await syncBootstrap();
      triggerConfetti();
      triggerHaptic('success');
      showNotification(data.message || `+${awarded} EcoCoin balansingizga qo'shildi!`, 'success');
      return {
        success: true,
        awardedCoins: awarded,
        newBalance: data.newBalance,
        adWatchState: data.adWatchState || null,
        message: data.message,
      };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Tarmoq xatoligi' };
    }
  };

  const submitSponsorshipProposal = async (
    data: Omit<SponsorshipProposal, 'id' | 'status' | 'submittedAt'>
  ): Promise<boolean> => {
    try {
      const res = await fetch(apiUrl('/api/partners/proposal'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      const result = await parseApiJson<any>(res);
      if (result.success && result.proposal) {
        setSponsorshipProposals(prev => [result.proposal, ...prev]);
        await syncBootstrap();
        triggerConfetti();
        showNotification('Homiylik arizangiz muvaffaqiyatli qabul qilindi!', 'success');
        return true;
      }
      return false;
    } catch {
      const localProp: SponsorshipProposal = {
        ...data,
        id: `prop_${Date.now()}`,
        status: 'pending',
        submittedAt: new Date().toISOString(),
      };
      setSponsorshipProposals(prev => [localProp, ...prev]);
      showNotification('Homiylik arizangiz qabul qilindi!', 'success');
      return true;
    }
  };

  const updateProposalStatus = async (
    id: string,
    status: 'approved' | 'rejected',
    notes?: string
  ): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/admin/partners/proposal-status', {
        method: 'POST',
        body: JSON.stringify({ proposalId: id, status, adminNotes: notes }),
      });
      const data = await parseApiJson<any>(res);
      if (!res.ok || !data?.success) {
        showNotification(data?.error || 'Homiylik arizasi yangilanmadi', 'warning');
        if (res.status === 401) setAuthModalOpen(true);
        return false;
      }
      setSponsorshipProposals(prev =>
        prev.map(p =>
          p.id === id
            ? {
                ...p,
                status,
                adminNotes: notes || p.adminNotes,
                reviewedBy: user.fullName,
                reviewedAt: new Date().toISOString(),
              }
            : p
        )
      );
      await syncBootstrap();
      showNotification(`Homiylik arizasi holati yangilandi: ${status === 'approved' ? 'Tasdiqlandi' : 'Rad etildi'}`, 'info');
      return true;
    } catch (err: any) {
      showNotification(err?.message || "Server bilan bog'lanishda xatolik", 'warning');
      return false;
    }
  };

  const createSponsorshipProject = async (
    data: Omit<SponsorshipProject, 'id' | 'raisedAmountUZS'>
  ): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/admin/sponsorship-projects', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      const result = await parseApiJson<any>(res);
      if (!res.ok || !result?.success || !result?.project) {
        showNotification(result?.error || "Homiylik aksiyasi saqlanmadi", 'warning');
        if (res.status === 401) setAuthModalOpen(true);
        return false;
      }
      setSponsorshipProjects(prev => [result.project, ...prev]);
      await syncBootstrap();
      showNotification("Yangi ekologik homiylik aksiyasi e'lon qilindi!", 'success');
      return true;
    } catch (err: any) {
      showNotification(err?.message || "Server bilan bog'lanishda xatolik", 'warning');
      return false;
    }
  };

  const createEcoAd = async (
    data: Omit<EcoAd, 'id' | 'impressionsCount' | 'clicksCount'>
  ): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/admin/ads', {
        method: 'POST',
        body: JSON.stringify(data),
      });
      const result = await parseApiJson<any>(res);
      if (res.ok && result?.success && result?.ad) {
        setEcoAds(prev => [result.ad, ...prev]);
        syncCatalogRecordToFirestore('eco_ads', result.ad.id, result.ad).catch(() => {});
        await syncBootstrap();
        showNotification('Yangi reklama banneri muvaffaqiyatli yaratildi!', 'success');
        return true;
      }
      if (res.status === 401 || res.status === 403) {
        showNotification("Sessiya tasdiqlanmagan. Super Admin hisobiga qayta kiring.", 'warning');
        if (res.status === 401) setAuthModalOpen(true);
      } else {
        showNotification(result?.error || 'Reklama serverga saqlanmadi', 'warning');
      }
      return false;
    } catch (e: any) {
      showNotification(e?.message || "Server bilan bog'lanishda xatolik", 'warning');
      return false;
    }
  };

  const updateEcoAdStatus = (id: string, status: 'active' | 'paused' | 'expired') => {
    const previousAds = ecoAds;
    setEcoAds(prev => prev.map(a => (a.id === id ? { ...a, status } : a)));
    apiFetch(`/api/admin/ads/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    })
      .then(async (res) => {
        const data = await parseApiJson<any>(res);
        if (!res.ok || !data?.success) {
          setEcoAds(previousAds);
          showNotification(data?.error || 'Reklama holati yangilanmadi', 'warning');
          if (res.status === 401) setAuthModalOpen(true);
          return;
        }
        if (data.ad) {
          syncCatalogRecordToFirestore('eco_ads', data.ad.id, data.ad).catch(() => {});
        }
        await syncBootstrap();
      })
      .catch(() => {
        setEcoAds(previousAds);
        showNotification("Server bilan bog'lanishda xatolik", 'warning');
      });
  };

  const recordAdImpression = (id: string) => {
    setEcoAds(prev => prev.map(a => (a.id === id ? { ...a, impressionsCount: (a.impressionsCount || 0) + 1 } : a)));
    fetch(apiUrl(`/api/ads/impression/${id}`), { method: 'POST' }).catch(() => {});
  };

  const recordAdClick = (id: string) => {
    setEcoAds(prev => prev.map(a => (a.id === id ? { ...a, clicksCount: (a.clicksCount || 0) + 1 } : a)));
    fetch(apiUrl(`/api/ads/click/${id}`), { method: 'POST' }).catch(() => {});
  };

  const markNotificationRead = (id: string) => {
    setNotifications(prev => prev.map(n => (n.id === id ? { ...n, read: true } : n)));
  };

  const sendTelegramNotification = async (
    chatId: string | number,
    message: string,
    type: string = 'info',
    actionUrl?: string
  ): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/telegram/send-notification', {
        method: 'POST',
        body: JSON.stringify({
          chatId: String(chatId),
          message,
          type,
          actionUrl,
        }),
      });
      const data = await res.json();
      return Boolean(data.success);
    } catch (err) {
      console.error('Send telegram notification error:', err);
      return false;
    }
  };

  const sendBroadcastAnnouncement = async (
    title: string,
    message: string,
    targetAudience: 'all' | 'students' | 'ambassadors' | 'region',
    targetRegion?: string
  ): Promise<boolean> => {
    try {
      const res = await apiFetch('/api/telegram/broadcast', {
        method: 'POST',
        body: JSON.stringify({
          title,
          message,
          targetAudience,
          targetRegion,
        }),
      });
      const data = await res.json();
      if (data.success && data.broadcast) {
        setBroadcasts(prev => [data.broadcast, ...prev]);
        showNotification(
          `Telegram xabarnomasi muvaffaqiyatli yuborildi (${data.broadcast.recipientsCount} nafar foydalanuvchiga)`,
          'success'
        );
        triggerHaptic('success');
        return true;
      }
      return false;
    } catch (err) {
      console.error('Send broadcast announcement error:', err);
      return false;
    }
  };

  const submitApplication: EcoContextType['submitApplication'] = async (payload) => {
    try {
      const res = await apiFetch('/api/applications', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification(data.error || 'Ariza yuborilmadi', 'warning');
        return { success: false, message: data.error || 'Xatolik' };
      }
      setRegistrationApplications(prev => [data.application, ...prev]);
      const targetMsg =
        payload.requestedRole === 'ambassador'
          ? 'Arizangiz maktab sardoriga va Super Adminga yuborildi!'
          : payload.requestedRole === 'school_admin'
          ? 'Arizangiz tuman koordinatoriga va Super Adminga yuborildi!'
          : payload.requestedRole === 'district_coordinator'
          ? 'Arizangiz viloyat koordinatoriga va Super Adminga yuborildi!'
          : 'Arizangiz Super Admin tasdig‘iga yuborildi!';
      showNotification(targetMsg, 'success');
      triggerHaptic('success');
      return { success: true, message: targetMsg, application: data.application };
    } catch (err: any) {
      return { success: false, message: err.message };
    }
  };

  const reviewApplication: EcoContextType['reviewApplication'] = async (applicationId, action, adminNote) => {
    try {
      const res = await apiFetch(`/api/applications/${applicationId}/review`, {
        method: 'POST',
        body: JSON.stringify({ action, adminNote }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification(data.error || 'Ariza ko‘rib chiqilmadi', 'warning');
        return { success: false, error: data.error };
      }
      await syncBootstrap();
      if (action === 'approve') triggerConfetti();
      showNotification(
        action === 'approve' ? 'Ariza tasdiqlandi va foydalanuvchi lavozimi yangilandi!' : 'Ariza holati yangilandi',
        action === 'approve' ? 'success' : 'info'
      );
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const manageUserRole: EcoContextType['manageUserRole'] = async (payload) => {
    try {
      const res = await apiFetch('/api/admin/roles/manage', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification(data.error || 'Rol o‘zgartirilmadi', 'warning');
        return { success: false, error: data.error };
      }
      await syncBootstrap();
      showNotification('Foydalanuvchi roli yangilandi va audit jurnaliga yozildi', 'success');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const uploadMediaFile: EcoContextType['uploadMediaFile'] = async (fileDataOrFile, fileName) => {
    try {
      let res: Response;
      if (typeof fileDataOrFile !== 'string' && fileDataOrFile instanceof Blob) {
        const resolvedName =
          fileName || (fileDataOrFile instanceof File ? fileDataOrFile.name : 'upload.bin');
        res = await apiFetch('/api/storage/upload-binary', {
          method: 'POST',
          timeoutMs: 120000,
          headers: {
            'Content-Type': fileDataOrFile.type || 'application/octet-stream',
            'x-file-name': encodeURIComponent(resolvedName),
          },
          body: fileDataOrFile,
        });
      } else {
        res = await apiFetch('/api/storage/upload', {
          method: 'POST',
          timeoutMs: 60000,
          body: JSON.stringify({ fileData: fileDataOrFile, fileName }),
        });
      }
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Fayl yuklanmadi' };
      }
      return {
        success: true,
        url: data.url,
        mediaType: data.mediaType,
        fileHash: data.fileHash,
      };
    } catch (err: any) {
      const isAbort = err?.name === 'AbortError';
      return {
        success: false,
        error: isAbort ? 'Fayl yuklash vaqti tugadi. Qayta urinib ko‘ring.' : err?.message || 'Yuklash xatoligi',
      };
    }
  };

  const submitEcoMedia: EcoContextType['submitEcoMedia'] = async (payload) => {
    try {
      const res = await apiFetch('/api/media', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification(data.error || 'Media yuklanmadi', 'warning');
        return { success: false, error: data.error };
      }
      setMediaSubmissions(prev => [data.submission, ...prev]);
      showNotification('Eko-faoliyat moderatsiyaga yuborildi!', 'success');
      triggerConfetti();
      return { success: true, submission: data.submission };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const moderateEcoMedia: EcoContextType['moderateEcoMedia'] = async (submissionId, decision, moderatorNote, customCoins) => {
    try {
      const res = await apiFetch(`/api/media/${submissionId}/moderate`, {
        method: 'POST',
        body: JSON.stringify({ decision, moderatorNote, customCoins }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification(data.error || 'Moderatsiya xatoligi', 'warning');
        return { success: false, error: data.error };
      }
      await syncBootstrap();
      if (decision === 'APPROVED') triggerConfetti();
      showNotification(
        decision === 'APPROVED' ? `Media tasdiqlandi! +${data.submission?.awardedCoins || 0} EcoCoin berildi.` : 'Media holati yangilandi',
        decision === 'APPROVED' ? 'success' : 'info'
      );
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const createEcoTask: EcoContextType['createEcoTask'] = async (payload) => {
    try {
      const res = await apiFetch('/api/tasks', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification(data.error || 'Vazifa yaratilmadi', 'warning');
        return { success: false, error: data.error };
      }
      setEcoTasks(prev => [data.task, ...prev]);
      showNotification('Eko-Elchiga vazifa biriktirildi!', 'success');
      return { success: true, task: data.task };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const updateEcoTask: EcoContextType['updateEcoTask'] = async (taskId, payload) => {
    try {
      const res = await apiFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification(data.error || 'Vazifa yangilanmadi', 'warning');
        return { success: false, error: data.error };
      }
      await syncBootstrap();
      showNotification('Vazifa holati yangilandi!', 'success');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const advanceReportWorkflow: EcoContextType['advanceReportWorkflow'] = async (reportId, action, payload = {}) => {
    try {
      const actionMap: Record<string, string> = {
        approve_to_captain: 'forward_to_captain',
        ambassador_solution: 'submit_completion',
      };
      const serverAction = actionMap[action] || action;
      const bodyPayload = {
        action: serverAction,
        note: payload.note,
        assignedAmbassadorUid: payload.assigneeUid,
        captainInstructions: serverAction === 'assign_ambassador' || serverAction === 'escalate' ? payload.note : undefined,
        ambassadorSolutions: serverAction === 'submit_completion' ? payload.note : undefined,
        progressEvidenceUrl: payload.resolutionEvidenceUrl,
        resolvedImageUrl: payload.resolutionEvidenceUrl,
        escalationTarget: payload.escalationTarget,
      };
      const res = await apiFetch(`/api/reports/${reportId}/workflow`, {
        method: 'POST',
        body: JSON.stringify(bodyPayload),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification(data.error || 'Jarayon yangilanmadi', 'warning');
        return { success: false, error: data.error };
      }
      await syncBootstrap();
      showNotification('Muammo bosqichi muvaffaqiyatli yangilandi', 'success');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const updateRewardSettings: EcoContextType['updateRewardSettings'] = async (updates) => {
    try {
      const res = await apiFetch('/api/admin/reward-settings', {
        method: 'PATCH',
        body: JSON.stringify(updates),
      });
      const data = await parseApiJson<any>(res);
      if (!res.ok || !data?.success) {
        showNotification(data?.error || 'Sozlamalar saqlanmadi', 'warning');
        if (res.status === 401) setAuthModalOpen(true);
        return { success: false, error: data?.error };
      }
      setRewardSettings(data.settings);
      syncCatalogRecordToFirestore('reward_settings', 'default', data.settings).catch(() => {});
      await syncBootstrap();
      showNotification('Mukofot mezonlari yangilandi va saqlandi!', 'success');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const adjustUserCoins: EcoContextType['adjustUserCoins'] = async (targetUid, amount, reason) => {
    try {
      const res = await apiFetch('/api/admin/coins/adjust', {
        method: 'POST',
        body: JSON.stringify({ targetUid, amount, reason }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        showNotification(data.error || 'Balans yangilanmadi', 'warning');
        return { success: false, error: data.error };
      }
      await syncBootstrap();
      showNotification('Foydalanuvchi tanga balansi yangilandi!', 'success');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  };

  const fetchAnalytics: EcoContextType['fetchAnalytics'] = useCallback(
    async (filters = {}) => {
      try {
        const params = new URLSearchParams();
        if (filters.region) params.set('region', filters.region);
        if (filters.district) params.set('district', filters.district);
        if (filters.schoolId) params.set('schoolId', filters.schoolId);
        if (filters.category) params.set('category', filters.category);
        const res = await apiFetch(`/api/analytics?${params.toString()}`);
        const data = await res.json();
        if (res.ok && data.success) {
          setAnalytics(data);
          return data as AnalyticsResponse;
        }
      } catch {
        // ignore
      }
      return null;
    },
    [apiFetch]
  );

  const fetchLeaderboard: EcoContextType['fetchLeaderboard'] = useCallback(
    async (tier, params = {}) => {
      try {
        const q = new URLSearchParams();
        if (params.period) q.set('period', params.period);
        if (params.region) q.set('region', params.region);
        if (params.district) q.set('district', params.district);
        if (params.search) q.set('search', params.search);
        if (params.page) q.set('page', String(params.page));
        if (params.limit) q.set('limit', String(params.limit));

        const res = await apiFetch(`/api/leaderboards/${tier}?${q.toString()}`);
        const data = await res.json();
        if (res.status === 403) {
          return {
            success: false,
            forbidden: true,
            error: data.error || "Bu reytingni ko'rishga ruxsatingiz yo'q",
            items: [],
            total: 0,
            page: 1,
            totalPages: 1,
          };
        }
        if (!res.ok || !data.success) {
          return { success: false, error: data.error, items: [], total: 0, page: 1, totalPages: 1 };
        }
        return {
          success: true,
          items: data.items || [],
          total: data.total || 0,
          page: data.page || 1,
          totalPages: data.totalPages || 1,
        };
      } catch (err: any) {
        return { success: false, error: err.message, items: [], total: 0, page: 1, totalPages: 1 };
      }
    },
    [apiFetch]
  );

  const appointAmbassadorHierarchical: EcoContextType['appointAmbassadorHierarchical'] = useCallback(
    async (payload) => {
      try {
        const res = await apiFetch('/api/roles/appoint-ambassador', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || "Eko-Elchi qo'shishda xatolik", 'warning');
          return { success: false, error: data.error || 'Xatolik' };
        }
        if (data.ambassador) {
          setAmbassadors(prev => [data.ambassador, ...prev.filter(a => a.id !== data.ambassador.id)]);
        }
        await syncBootstrap();
        triggerConfetti();
        showNotification(`${payload.fullName} maktab Eko-Elchisi etib tayinlandi!`, 'success');
        return { success: true, ambassador: data.ambassador };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap, triggerConfetti]
  );

  const appointSchoolCaptain: EcoContextType['appointSchoolCaptain'] = useCallback(
    async (payload) => {
      try {
        const res = await apiFetch('/api/roles/appoint-school-captain', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || "Maktab sardori tayinlashda xatolik", 'warning');
          return { success: false, error: data.error || 'Xatolik' };
        }
        await syncBootstrap();
        triggerConfetti();
        showNotification(`${payload.fullName} ${data.school?.name || ''} Maktab Sardori etib tayinlandi!`, 'success');
        return { success: true, school: data.school };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap, triggerConfetti]
  );

  const appointDistrictCoordinator: EcoContextType['appointDistrictCoordinator'] = useCallback(
    async (payload) => {
      try {
        const res = await apiFetch('/api/roles/appoint-district-coordinator', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || "Tuman koordinatori saylashda xatolik", 'warning');
          return { success: false, error: data.error || 'Xatolik' };
        }
        await syncBootstrap();
        triggerConfetti();
        showNotification(`${payload.fullName} (${payload.district}) Tuman Koordinatori etib saylandi!`, 'success');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap, triggerConfetti]
  );

  const appointRegionalCoordinator: EcoContextType['appointRegionalCoordinator'] = useCallback(
    async (payload) => {
      try {
        const res = await apiFetch('/api/roles/appoint-regional-coordinator', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || 'Viloyat koordinatorini tayinlashda xatolik', 'warning');
          return { success: false, error: data.error || 'Xatolik' };
        }
        await syncBootstrap();
        triggerConfetti();
        showNotification(`${payload.fullName} (${payload.region}) Viloyat Koordinatori etib tayinlandi!`, 'success');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap, triggerConfetti]
  );

  const fetchDistrictLeaderboardDetails: EcoContextType['fetchDistrictLeaderboardDetails'] = useCallback(
    async (params = {}) => {
      try {
        const q = new URLSearchParams();
        if (params.region) q.set('region', params.region);
        if (params.district) q.set('district', params.district);
        const res = await apiFetch(`/api/leaderboards/district-details?${q.toString()}`);
        const data = await res.json();
        if (!res.ok || !data.success) return null;
        return data as DistrictLeaderboardDetailsResponse;
      } catch {
        return null;
      }
    },
    [apiFetch]
  );

  const awardMonthlyTop3: EcoContextType['awardMonthlyTop3'] = useCallback(
    async (params = {}) => {
      try {
        const res = await apiFetch('/api/leaderboards/award-monthly-top3', {
          method: 'POST',
          body: JSON.stringify(params),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || 'Taqdirlash bajarilmadi', 'warning');
          return { success: false, error: data.error || 'Xatolik' };
        }
        if (data.award) {
          setMonthlyAwards(prev => [data.award, ...prev]);
        }
        await syncBootstrap();
        triggerConfetti();
        showNotification('Tuman TOP-3 maktab va Eko-Elchilari muvaffaqiyatli taqdirlandi!', 'success');
        return { success: true, award: data.award, details: data.details };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap, triggerConfetti]
  );

  const createHomePost: EcoContextType['createHomePost'] = useCallback(
    async (payload) => {
      try {
        const res = await apiFetch('/api/home-posts', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const data = await parseApiJson<any>(res);
        if (!res.ok || !data?.success) {
          showNotification(data?.error || "Post qo'shilmadi", 'warning');
          if (res.status === 401) setAuthModalOpen(true);
          return { success: false, error: data?.error || 'Xatolik' };
        }
        setHomePosts(prev => [data.post, ...prev]);
        syncCatalogRecordToFirestore('home_posts', data.post.id, data.post).catch(() => {});
        await syncBootstrap();
        showNotification('Post asosiy sahifaga joylashtirildi!', 'success');
        return { success: true, post: data.post };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap]
  );

  const updateHomePost: EcoContextType['updateHomePost'] = useCallback(
    async (id, updates) => {
      try {
        const res = await apiFetch(`/api/home-posts/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
        const data = await parseApiJson<any>(res);
        if (!res.ok || !data?.success) {
          showNotification(data?.error || 'Post yangilanmadi', 'warning');
          if (res.status === 401) setAuthModalOpen(true);
          return { success: false, error: data?.error || 'Xatolik' };
        }
        setHomePosts(prev => prev.map(p => (p.id === id ? data.post : p)));
        syncCatalogRecordToFirestore('home_posts', data.post.id, data.post).catch(() => {});
        await syncBootstrap();
        showNotification('Post muvaffaqiyatli yangilandi', 'success');
        return { success: true, post: data.post };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap]
  );

  const deleteHomePost: EcoContextType['deleteHomePost'] = useCallback(
    async (id) => {
      try {
        const res = await apiFetch(`/api/home-posts/${id}`, {
          method: 'DELETE',
        });
        const data = await parseApiJson<any>(res);
        if (!res.ok || !data?.success) {
          showNotification(data?.error || "Post o'chirilmadi", 'warning');
          if (res.status === 401) setAuthModalOpen(true);
          return { success: false, error: data?.error || 'Xatolik' };
        }
        setHomePosts(prev => prev.filter(p => p.id !== id));
        deleteCatalogRecordFromFirestore('home_posts', id).catch(() => {});
        await syncBootstrap();
        showNotification("Post o'chirildi", 'info');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap]
  );

  const editReport: EcoContextType['editReport'] = useCallback(
    async (reportId, updates) => {
      try {
        const res = await apiFetch(`/api/reports/${reportId}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || 'Hisobot yangilanmadi', 'warning');
          return { success: false, error: data.error || 'Xatolik' };
        }
        setReports(prev => prev.map(r => (r.id === reportId ? { ...r, ...data.report } : r)));
        await syncBootstrap();
        showNotification('Hisobot yangilandi!', 'success');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap]
  );

  const deleteReport: EcoContextType['deleteReport'] = useCallback(
    async (reportId) => {
      try {
        const res = await apiFetch(`/api/reports/${reportId}`, { method: 'DELETE' });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || "Hisobot o'chirilmadi", 'warning');
          return { success: false, error: data.error || 'Xatolik' };
        }
        setReports(prev => prev.filter(r => r.id !== reportId));
        await syncBootstrap();
        showNotification("Hisobot o'chirildi", 'info');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap]
  );

  const schoolReportAction: EcoContextType['schoolReportAction'] = useCallback(
    async (reportId, action, payload = {}) => {
      try {
        const res = await apiFetch(`/api/reports/${reportId}/school-action`, {
          method: 'POST',
          body: JSON.stringify({ action, ...payload }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || 'Amal bajarilmadi', 'warning');
          return { success: false, error: data.error || 'Xatolik' };
        }
        await syncBootstrap();
        if (action === 'confirm_student_resolved') triggerConfetti();
        showNotification(data.message || 'Muvaffaqiyatli bajarildi!', 'success');
        return { success: true, message: data.message };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap, triggerConfetti]
  );

  const resolveReportWithAiVerification: EcoContextType['resolveReportWithAiVerification'] = useCallback(
    async (reportId, payload) => {
      try {
        const res = await apiFetch(`/api/reports/${reportId}/ambassador-resolve`, {
          method: 'POST',
          timeoutMs: 28000,
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || 'AI tekshiruvi rad etdi', 'warning');
          return { success: false, error: data.error || 'AI tasdiqlamadi' };
        }
        await syncBootstrap();
        triggerConfetti();
        showNotification(data.message || '+200 EcoCoin berildi!', 'success');
        return { success: true, message: data.message };
      } catch (err: any) {
        showNotification(err?.message || 'Tarmoq xatoligi', 'warning');
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap, triggerConfetti]
  );

  const updateEcoAd: EcoContextType['updateEcoAd'] = useCallback(
    async (adId, updates) => {
      try {
        const res = await apiFetch(`/api/admin/ads/${adId}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
        const data = await parseApiJson<any>(res);
        if (!res.ok || !data?.success) {
          showNotification(data?.error || 'Reklama yangilanmadi', 'warning');
          if (res.status === 401) setAuthModalOpen(true);
          return { success: false, error: data?.error || 'Xatolik' };
        }
        setEcoAds(prev => prev.map(a => (a.id === adId ? data.ad : a)));
        syncCatalogRecordToFirestore('eco_ads', data.ad.id, data.ad).catch(() => {});
        await syncBootstrap();
        showNotification('Reklama muvaffaqiyatli yangilandi!', 'success');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap]
  );

  const deleteEcoAd: EcoContextType['deleteEcoAd'] = useCallback(
    async (adId) => {
      try {
        const res = await apiFetch(`/api/admin/ads/${adId}`, { method: 'DELETE' });
        const data = await parseApiJson<any>(res);
        if (!res.ok || !data?.success) {
          showNotification(data?.error || "Reklama o'chirilmadi", 'warning');
          if (res.status === 401) setAuthModalOpen(true);
          return { success: false, error: data?.error || 'Xatolik' };
        }
        setEcoAds(prev => prev.filter(a => a.id !== adId));
        deleteCatalogRecordFromFirestore('eco_ads', adId).catch(() => {});
        await syncBootstrap();
        showNotification("Reklama o'chirildi", 'info');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap]
  );

  const deleteShopItem: EcoContextType['deleteShopItem'] = useCallback(
    async (itemId) => {
      try {
        const res = await apiFetch(`/api/admin/shop/items/${itemId}`, { method: 'DELETE' });
        const data = await parseApiJson<any>(res);
        if (!res.ok || !data?.success) {
          showNotification(data?.error || "Mahsulot o'chirilmadi", 'warning');
          if (res.status === 401) setAuthModalOpen(true);
          return { success: false, error: data?.error || 'Xatolik' };
        }
        setShopItems(prev => prev.filter(i => i.id !== itemId));
        deleteCatalogRecordFromFirestore('shopItems', itemId).catch(() => {});
        await syncBootstrap();
        showNotification("Sovg'a o'chirildi", 'info');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap]
  );

  const createMission: EcoContextType['createMission'] = useCallback(
    async (payload) => {
      try {
        const res = await apiFetch('/api/missions', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const data = await parseApiJson<any>(res);
        if (!res.ok || !data?.success) {
          if (res.status === 401 || res.status === 403) {
            showNotification("Sessiya tasdiqlanmagan. Super Admin hisobiga qayta kiring.", 'warning');
            if (res.status === 401) setAuthModalOpen(true);
          } else {
            showNotification(data?.error || "Topshiriq qo'shilmadi", 'warning');
          }
          return { success: false, error: data?.error || 'Xatolik' };
        }
        setEcoMissions(prev => [data.mission, ...prev]);
        syncCatalogRecordToFirestore('eco_missions', data.mission.id, data.mission).catch(() => {});
        await syncBootstrap();
        showNotification("Yangi missiya qo'shildi va saqlandi!", 'success');
        return { success: true, mission: data.mission };
      } catch (err: any) {
        showNotification(err?.message || 'Tarmoq xatoligi', 'warning');
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap]
  );

  const updateMission: EcoContextType['updateMission'] = useCallback(
    async (id, updates) => {
      try {
        const res = await apiFetch(`/api/missions/${id}`, {
          method: 'PATCH',
          body: JSON.stringify(updates),
        });
        const data = await parseApiJson<any>(res);
        if (!res.ok || !data?.success) {
          if (res.status === 401 || res.status === 403) {
            showNotification("Sessiya tasdiqlanmagan. Super Admin hisobiga qayta kiring.", 'warning');
            if (res.status === 401) setAuthModalOpen(true);
          } else {
            showNotification(data?.error || 'Missiya yangilanmadi', 'warning');
          }
          return { success: false, error: data?.error || 'Xatolik' };
        }
        setEcoMissions(prev => prev.map(m => (m.id === id ? data.mission : m)));
        syncCatalogRecordToFirestore('eco_missions', data.mission.id, data.mission).catch(() => {});
        await syncBootstrap();
        showNotification('Missiya yangilandi!', 'success');
        return { success: true };
      } catch (err: any) {
        showNotification(err?.message || 'Tarmoq xatoligi', 'warning');
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap]
  );

  const deleteMission: EcoContextType['deleteMission'] = useCallback(
    async (id) => {
      try {
        const res = await apiFetch(`/api/missions/${id}`, { method: 'DELETE' });
        const data = await parseApiJson<any>(res);
        if (!res.ok || !data?.success) {
          if (res.status === 401 || res.status === 403) {
            showNotification("Sessiya tasdiqlanmagan. Super Admin hisobiga qayta kiring.", 'warning');
            if (res.status === 401) setAuthModalOpen(true);
          } else {
            showNotification(data?.error || "Missiya o'chirilmadi", 'warning');
          }
          return { success: false, error: data?.error || 'Xatolik' };
        }
        setEcoMissions(prev => prev.filter(m => m.id !== id));
        deleteCatalogRecordFromFirestore('eco_missions', id).catch(() => {});
        await syncBootstrap();
        showNotification("Missiya o'chirildi", 'info');
        return { success: true };
      } catch (err: any) {
        showNotification(err?.message || 'Tarmoq xatoligi', 'warning');
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap]
  );

  const joinWeeklyChallenge = useCallback(async () => {
    try {
      const res = await apiFetch('/api/missions/weekly/join', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const data = await parseApiJson<any>(res);
      if (!res.ok || !data?.success) {
        showNotification(data?.error || "Haftalik chellenjga qo'shilishda xatolik", 'warning');
        return { success: false, error: data?.error };
      }
      if (data.weeklyChallenge) setWeeklyChallenge(data.weeklyChallenge);
      await syncBootstrap();
      showNotification("Haftalik chellenjga qo'shildingiz!", 'success');
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }, [apiFetch, showNotification, syncBootstrap]);

  const claimWeeklyChallenge = useCallback(async () => {
    try {
      const res = await apiFetch('/api/missions/weekly/claim', {
        method: 'POST',
        body: JSON.stringify({}),
      });
      const data = await parseApiJson<any>(res);
      if (!res.ok || !data?.success) {
        showNotification(data?.error || 'Mukofot olib bo‘lmadi', 'warning');
        return { success: false, error: data?.error };
      }
      if (data.weeklyChallenge) setWeeklyChallenge(data.weeklyChallenge);
      await syncBootstrap();
      triggerConfetti();
      showNotification(data.message || `+${data.awardedCoins || 250} EcoCoin qo'shildi!`, 'success');
      return { success: true, awardedCoins: data.awardedCoins };
    } catch (err: any) {
      return { success: false, error: err?.message };
    }
  }, [apiFetch, showNotification, syncBootstrap, triggerConfetti]);

  const fetchChampionshipLive: EcoContextType['fetchChampionshipLive'] = useCallback(
    async ({ level, entity, region, district }) => {
      try {
        const qs = new URLSearchParams({ level, entity });
        if (region) qs.set('region', region);
        if (district) qs.set('district', district);
        const res = await apiFetch(`/api/championship/live?${qs.toString()}`);
        const data = await parseApiJson<ChampionshipLiveResponse>(res);
        if (res.ok && data?.success) {
          if (data.eligibility) setChampionshipMeta(data.eligibility);
          return data;
        }
        return null;
      } catch {
        return null;
      }
    },
    [apiFetch]
  );

  const submitMission: EcoContextType['submitMission'] = useCallback(
    async (id, payload) => {
      try {
        const res = await apiFetch(`/api/missions/${id}/submit`, {
          method: 'POST',
          timeoutMs: 25000,
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || 'Topshiriq bajarilmadi', 'warning');
          return { success: false, error: data.error || 'Xatolik' };
        }
        if (data.passed !== false) {
          await syncBootstrap();
          if (data.awardedCoins) {
            triggerConfetti();
          }
          showNotification(data.message || 'Topshiriq qabul qilindi!', 'success');
        } else {
          showNotification(data.message || "O'tish baliga yetmadi", 'warning');
        }
        return {
          success: true,
          passed: data.passed,
          scorePercent: data.scorePercent,
          correctCount: data.correctCount,
          totalCount: data.totalCount,
          passingPercent: data.passingPercent,
          results: data.results,
          message: data.message,
          awardedCoins: data.awardedCoins,
          explanation: data.explanation,
        };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap, triggerConfetti]
  );

  const parseQuizFromText: EcoContextType['parseQuizFromText'] = useCallback(
    async (rawText) => {
      try {
        const res = await apiFetch('/api/missions/parse-quiz', {
          method: 'POST',
          timeoutMs: 30000,
          body: JSON.stringify({ rawText }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          return { success: false, error: data.error || 'Testlarni tahlil qilib bo‘lmadi' };
        }
        return { success: true, questions: data.questions || [], parser: data.parser };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch]
  );

  const reviewMissionSubmission: EcoContextType['reviewMissionSubmission'] = useCallback(
    async (subId, action, adminNote) => {
      try {
        const res = await apiFetch(`/api/missions/submissions/${subId}/review`, {
          method: 'POST',
          body: JSON.stringify({ action, adminNote }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || 'Tasdiqlanmadi', 'warning');
          return { success: false, error: data.error || 'Xatolik' };
        }
        await syncBootstrap();
        if (action === 'approve') triggerConfetti();
        showNotification(action === 'approve' ? 'Missiya tasdiqlandi va EcoCoin berildi!' : 'Ariza rad etildi', action === 'approve' ? 'success' : 'info');
        return { success: true };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap, triggerConfetti]
  );

  // Real-time WebSocket subscription for /ws/chat + instant live DB sync
  const [wsConnected, setWsConnected] = useState(false);
  const [liveSyncVersion, setLiveSyncVersion] = useState(0);
  const syncDebounceRef = useRef<number | null>(null);
  const chatListenersRef = useRef<
    Set<(event: { type: string; message?: EcoChatMessage; permission?: ChatPermissionRequest }) => void>
  >(new Set());

  const subscribeChatEvents: EcoContextType['subscribeChatEvents'] = useCallback((listener) => {
    chatListenersRef.current.add(listener);
    return () => {
      chatListenersRef.current.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      setWsConnected(false);
      return;
    }

    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let closedByCleanup = false;

    const connect = () => {
      if (closedByCleanup) return;
      try {
        const tok = sessionTokenRef.current;
        const url = tok
          ? wsUrl(`/ws/chat?token=${encodeURIComponent(tok)}`)
          : wsUrl('/ws/chat?public=1');
        ws = new WebSocket(url);

        ws.onopen = () => {
          setWsConnected(true);
        };

        ws.onmessage = (evt) => {
          try {
            const payload = JSON.parse(evt.data);
            if (!payload || !payload.type) return;
            if (payload.type === 'db:updated') {
              if (syncDebounceRef.current) window.clearTimeout(syncDebounceRef.current);
              syncDebounceRef.current = window.setTimeout(() => {
                syncBootstrap();
                setLiveSyncVersion((v) => v + 1);
              }, 250);
              return;
            }
            chatListenersRef.current.forEach((cb) => {
              try {
                cb(payload);
              } catch {
                // isolate listener error
              }
            });
          } catch {
            // ignore non-json frames
          }
        };

        ws.onclose = () => {
          setWsConnected(false);
          if (!closedByCleanup) {
            reconnectTimer = window.setTimeout(connect, 3000);
          }
        };

        ws.onerror = () => {
          setWsConnected(false);
        };
      } catch {
        setWsConnected(false);
      }
    };

    connect();

    return () => {
      closedByCleanup = true;
      setWsConnected(false);
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      if (syncDebounceRef.current) window.clearTimeout(syncDebounceRef.current);
      if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        try {
          ws.close();
        } catch {}
      }
    };
  }, [sessionToken, syncBootstrap]);

  const fetchRosterDirectory: EcoContextType['fetchRosterDirectory'] = useCallback(
    async (params = {}) => {
      try {
        const q = new URLSearchParams();
        if (params.region) q.set('region', params.region);
        if (params.district) q.set('district', params.district);
        if (params.schoolId) q.set('schoolId', params.schoolId);
        const suffix = q.toString() ? `?${q.toString()}` : '';
        const res = await apiFetch(`/api/roster/directory${suffix}`);
        const data = await res.json();
        if (!res.ok || !data.success) return null;
        return data as RosterDirectoryResponse;
      } catch {
        return null;
      }
    },
    [apiFetch]
  );

  const fetchDistrictUserGrowth: EcoContextType['fetchDistrictUserGrowth'] = useCallback(async () => {
    try {
      const res = await apiFetch('/api/leaderboards/district-user-growth');
      const data = await res.json();
      if (res.status === 403) {
        return {
          success: false,
          forbidden: true,
          error: data.error || "Bu reyting faqat Tuman Koordinatorlari va Super Admin uchun ko'rinadi.",
        };
      }
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || "Ma'lumot yuklanmadi" };
      }
      return { success: true, data: data as DistrictUserGrowthResponse };
    } catch (err: any) {
      return { success: false, error: err?.message || 'Tarmoq xatoligi' };
    }
  }, [apiFetch]);

  const fetchChatThreads: EcoContextType['fetchChatThreads'] = useCallback(async () => {
    try {
      const res = await apiFetch('/api/chat/threads');
      const data = await res.json();
      if (!res.ok || !data.success) return [];
      return (data.threads || []) as ChatThreadSummary[];
    } catch {
      return [];
    }
  }, [apiFetch]);

  const fetchChatMessages: EcoContextType['fetchChatMessages'] = useCallback(
    async (channelId) => {
      try {
        const res = await apiFetch(`/api/chat/messages?channelId=${encodeURIComponent(channelId)}`);
        const data = await res.json();
        if (!res.ok || !data.success) {
          return { success: false, messages: [], error: data.error || 'Xabarlar yuklanmadi' };
        }
        return { success: true, messages: (data.messages || []) as EcoChatMessage[] };
      } catch (err: any) {
        return { success: false, messages: [], error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch]
  );

  const sendChatMessage: EcoContextType['sendChatMessage'] = useCallback(
    async (payload) => {
      try {
        const res = await apiFetch('/api/chat/messages', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          if (data?.error) showNotification(data.error, 'warning');
          return {
            success: false,
            code: data?.code,
            error: data?.error || 'Xabar yuborilmadi',
          };
        }
        return { success: true, message: data.message as EcoChatMessage };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification]
  );

  const fetchChatPermissions: EcoContextType['fetchChatPermissions'] = useCallback(async () => {
    try {
      const res = await apiFetch('/api/chat/permissions');
      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, allowStudentMessages: true, permissions: [] };
      }
      return {
        success: true,
        allowStudentMessages: data.allowStudentMessages !== false,
        permissions: (data.permissions || []) as ChatPermissionRequest[],
      };
    } catch {
      return { success: false, allowStudentMessages: true, permissions: [] };
    }
  }, [apiFetch]);

  const requestChatPermission: EcoContextType['requestChatPermission'] = useCallback(
    async (targetUid, note) => {
      try {
        const res = await apiFetch('/api/chat/permissions/request', {
          method: 'POST',
          body: JSON.stringify({ targetUid, note }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || "Ruxsat so'rovi yuborilmadi", 'warning');
          return { success: false, error: data.error || 'Xatolik' };
        }
        showNotification(
          data.alreadyExists
            ? 'Ruxsat so‘rovi allaqachon yuborilgan'
            : 'Suhbatlashish uchun ruxsat so‘rovi yuborildi!',
          'success'
        );
        return { success: true, permission: data.permission as ChatPermissionRequest };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification]
  );

  const respondChatPermission: EcoContextType['respondChatPermission'] = useCallback(
    async (permId, action) => {
      try {
        const res = await apiFetch(`/api/chat/permissions/${encodeURIComponent(permId)}/respond`, {
          method: 'POST',
          body: JSON.stringify({ action }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || 'Javob saqlanmadi', 'warning');
          return { success: false, error: data.error || 'Xatolik' };
        }
        showNotification(
          action === 'approve'
            ? 'Suhbat ruxsati tasdiqlandi!'
            : action === 'block'
            ? 'Foydalanuvchi bloklandi'
            : 'So‘rov rad etildi',
          action === 'approve' ? 'success' : 'info'
        );
        return { success: true, permission: data.permission as ChatPermissionRequest };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification]
  );

  const updateChatSettings: EcoContextType['updateChatSettings'] = useCallback(
    async (allowStudentMessages) => {
      try {
        const res = await apiFetch('/api/chat/settings', {
          method: 'POST',
          body: JSON.stringify({ allowStudentMessages }),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || 'Sozlama saqlanmadi', 'warning');
          return { success: false, error: data.error || 'Xatolik' };
        }
        setUser(prev => ({ ...prev, allowStudentMessages: Boolean(data.allowStudentMessages) }));
        showNotification(
          data.allowStudentMessages
            ? "O'quvchilardan ruxsat so'rovlarini qabul qilish yoqildi"
            : "O'quvchilardan xabar qabul qilish o'chirildi",
          'info'
        );
        return { success: true, allowStudentMessages: Boolean(data.allowStudentMessages) };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification]
  );

  const fetchStudentRatingsCabinet: EcoContextType['fetchStudentRatingsCabinet'] = useCallback(
    async (params = {}) => {
      try {
        const q = new URLSearchParams();
        if (params.schoolId) q.set('schoolId', params.schoolId);
        if (params.region) q.set('region', params.region);
        if (params.district) q.set('district', params.district);
        const suffix = q.toString() ? `?${q.toString()}` : '';
        const res = await apiFetch(`/api/student-ratings/cabinet${suffix}`);
        const data = await res.json();
        if (!res.ok || !data.success) return null;
        return data as StudentRatingsCabinetResponse;
      } catch {
        return null;
      }
    },
    [apiFetch]
  );

  const fetchStudentRatingsManage: EcoContextType['fetchStudentRatingsManage'] = useCallback(
    async (params = {}) => {
      try {
        const q = new URLSearchParams();
        if (params.schoolId) q.set('schoolId', params.schoolId);
        if (params.region) q.set('region', params.region);
        if (params.district) q.set('district', params.district);
        const suffix = q.toString() ? `?${q.toString()}` : '';
        const res = await apiFetch(`/api/student-ratings/manage${suffix}`);
        const data = await res.json();
        if (!res.ok || !data.success) return null;
        return data as StudentRatingsManageResponse;
      } catch {
        return null;
      }
    },
    [apiFetch]
  );

  const updateSchoolStudentRatingConfig: EcoContextType['updateSchoolStudentRatingConfig'] = useCallback(
    async (payload) => {
      try {
        const res = await apiFetch('/api/student-ratings/school/config', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || 'Maktab reyting sozlamasi saqlanmadi', 'warning');
          return { success: false, error: data.error || 'Xatolik' };
        }
        await syncBootstrap();
        showNotification(
          typeof payload.enabled === 'boolean'
            ? payload.enabled
              ? 'Maktab o‘quvchilar reytingi jonli rejimda yoqildi!'
              : 'Maktab o‘quvchilar reytingi o‘chirildi'
            : 'Maktab reyting sozlamalari saqlandi!',
          'success'
        );
        return { success: true, school: data.school };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap]
  );

  const updateDistrictStudentRatingConfig: EcoContextType['updateDistrictStudentRatingConfig'] = useCallback(
    async (payload) => {
      try {
        const res = await apiFetch('/api/student-ratings/district/config', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || 'Tuman reyting sozlamasi saqlanmadi', 'warning');
          return { success: false, error: data.error || 'Xatolik' };
        }
        await syncBootstrap();
        showNotification(
          typeof payload.enabled === 'boolean'
            ? payload.enabled
              ? 'Tuman o‘quvchilar oylik reytingi jonli rejimda yoqildi!'
              : 'Tuman o‘quvchilar oylik reytingi o‘chirildi'
            : 'Tuman reyting sozlamalari saqlandi!',
          'success'
        );
        return { success: true, district: data.district };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap]
  );

  const awardSchoolTop1Student: EcoContextType['awardSchoolTop1Student'] = useCallback(
    async (params = {}) => {
      try {
        const res = await apiFetch('/api/student-ratings/school/award-top1', {
          method: 'POST',
          body: JSON.stringify(params),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || 'Taqdirlash bajarilmadi', 'warning');
          return { success: false, error: data.error || 'Xatolik' };
        }
        await syncBootstrap();
        triggerConfetti();
        showNotification("Maktabning eng faol 1-o'rin o'quvchisi taqdirlandi!", 'success');
        return { success: true, award: data.award, school: data.school };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap, triggerConfetti]
  );

  const awardDistrictTop3Students: EcoContextType['awardDistrictTop3Students'] = useCallback(
    async (params = {}) => {
      try {
        const res = await apiFetch('/api/student-ratings/district/award-top3', {
          method: 'POST',
          body: JSON.stringify(params),
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          showNotification(data.error || 'Taqdirlash bajarilmadi', 'warning');
          return { success: false, error: data.error || 'Xatolik' };
        }
        await syncBootstrap();
        triggerConfetti();
        showNotification("Tuman oylik reytingi TOP-3 o'quvchilari taqdirlandi!", 'success');
        return { success: true, award: data.award, district: data.district };
      } catch (err: any) {
        return { success: false, error: err?.message || 'Tarmoq xatoligi' };
      }
    },
    [apiFetch, showNotification, syncBootstrap, triggerConfetti]
  );

  return (
    <EcoContext.Provider
      value={{
        user,
        studentsLeaderboard,
        switchRole,
        roleRequests,
        roleRequestModalOpen,
        targetRequestedRole,
        openRoleRequestModal,
        closeRoleRequestModal,
        submitRoleRequest,
        approveRoleRequest,
        rejectRoleRequest,
        loginUser,
        registerUser,
        loginWithGoogle,
        logoutUser,
        authModalOpen,
        openAuthModal: () => setAuthModalOpen(true),
        closeAuthModal: () => setAuthModalOpen(false),
        reports,
        addReport,
        updateReportStatus,
        upvoteReport,
        schools,
        registerSchool,
        ambassadors,
        appointAmbassador,
        shopItems,
        transactions,
        verifyGiftSubscriptions,
        redeemShopItem,
        shopOrders,
        updateShopOrderStatus,
        checkVoucherCode,
        verifyAndForwardVoucher,
        startAdWatch,
        claimAdWatchReward,
        auditLogs,
        notifications,
        markNotificationRead,
        theme,
        toggleTheme,
        activeTab,
        setActiveTab,
        isTelegramMiniApp,
        triggerHaptic,
        referrals,
        claimReferral,
        broadcasts,
        sendTelegramNotification,
        sendBroadcastAnnouncement,
        partners,
        sponsorshipProjects,
        sponsorshipProposals,
        submitSponsorshipProposal,
        updateProposalStatus,
        createSponsorshipProject,
        ecoAds,
        adWatchState,
        createEcoAd,
        updateEcoAdStatus,
        recordAdImpression,
        recordAdClick,
        isOnboarded: Boolean(user.isOnboarded),
        onboardingModalOpen,
        openOnboardingModal,
        closeOnboardingModal,
        editProfileModalOpen,
        openEditProfileModal,
        closeEditProfileModal,
        completeOnboarding,
        updateUserProfile,
        claimDailyQuizReward,
        claimDailyStreakReward,
        syncBootstrap,
        updateShopItemPriceAndStock,
        updateShopItem,
        createShopItem,
        notification,
        showNotification,
        clearNotification,
        triggerConfetti,
        competitionScores,
        competitionPeriods,
        championshipResults,
        certificates,
        isOnline,
        isServerConnected,
        isCheckingConnection,
        checkServerHealth,
        isSuperAdmin: Boolean(isSuperAdminUser),
        sessionToken,
        apiFetch,
        registrationApplications,
        submitApplication,
        reviewApplication,
        manageUserRole,
        mediaSubmissions,
        uploadMediaFile,
        submitEcoMedia,
        moderateEcoMedia,
        ecoTasks,
        createEcoTask,
        updateEcoTask,
        advanceReportWorkflow,
        rewardSettings,
        updateRewardSettings,
        adjustUserCoins,
        analytics,
        fetchAnalytics,
        fetchLeaderboard,
        homePosts,
        monthlyAwards,
        appointAmbassadorHierarchical,
        appointSchoolCaptain,
        appointDistrictCoordinator,
        appointRegionalCoordinator,
        fetchDistrictLeaderboardDetails,
        awardMonthlyTop3,
        createHomePost,
        updateHomePost,
        deleteHomePost,
        wsConnected,
        liveSyncVersion,
        subscribeChatEvents,
        fetchRosterDirectory,
        fetchDistrictUserGrowth,
        fetchChatThreads,
        fetchChatMessages,
        sendChatMessage,
        fetchChatPermissions,
        requestChatPermission,
        respondChatPermission,
        updateChatSettings,
        liveMetrics,
        ecoMissions,
        missionSubmissions,
        missionCompletions,
        editReport,
        deleteReport,
        schoolReportAction,
        resolveReportWithAiVerification,
        updateEcoAd,
        deleteEcoAd,
        deleteShopItem,
        createMission,
        updateMission,
        deleteMission,
        submitMission,
        parseQuizFromText,
        reviewMissionSubmission,
        fetchStudentRatingsCabinet,
        fetchStudentRatingsManage,
        updateSchoolStudentRatingConfig,
        updateDistrictStudentRatingConfig,
        awardSchoolTop1Student,
        awardDistrictTop3Students,
        weeklyChallenge,
        schoolTeamMission,
        championshipMeta,
        joinWeeklyChallenge,
        claimWeeklyChallenge,
        fetchChampionshipLive,
      }}
    >
      {children}
    </EcoContext.Provider>
  );
};

export const useEco = () => {
  const context = useContext(EcoContext);
  if (!context) {
    throw new Error('useEco must be used within an EcoProvider');
  }
  return context;
};
