export type UserRole =
  | 'student'
  | 'ambassador'
  | 'school_admin'
  | 'district_coordinator'
  | 'regional_coordinator'
  | 'moderator'
  | 'super_admin'
  | 'sponsor';

export type ProblemCategory =
  | 'waste'
  | 'water'
  | 'deforestation'
  | 'air'
  | 'greening_needed'
  | 'school_ecology'
  | 'other'
  | 'electrical_hazard'
  | 'chemical_hazard';

export type ProblemSeverity = 'low' | 'medium' | 'high';

export type ProblemStatus =
  | 'pending'
  | 'verified'
  | 'in_progress'
  | 'resolved'
  | 'rejected'
  | 'PENDING_REVIEW'
  | 'APPROVED'
  | 'NEEDS_INFO'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'FINAL_REVIEW'
  | 'REUPLOAD_REQUIRED'
  | 'ESCALATED'
  | 'RESOLVED'
  | 'REJECTED';

export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'needs_info' | 'revoked';

export type MediaCategory =
  | 'tree_planting'
  | 'tree_care'
  | 'school_garden'
  | 'awareness_video'
  | 'waste_sorting'
  | 'school_improvement'
  | 'environmental_campaign';

export type MediaModerationStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';

export type EcoTaskStatus = 'assigned' | 'in_progress' | 'submitted' | 'verified' | 'needs_revision';

export type LeaderboardPeriod = 'monthly' | 'quarterly' | 'yearly';

export type LeaderboardTier =
  | 'student'
  | 'school'
  | 'district'
  | 'regional'
  | 'ambassador'
  | 'district_leaders';

export interface UserActivityStats {
  reportsCount: number;
  cleanupsCount: number;
  treesPlanted: number;
  streakDays: number;
  totalCoinsEarned: number;
}

export interface UserProfile {
  uid: string;
  fullName: string;
  email: string;
  profileImage: string;
  schoolId: string;
  schoolName: string;
  schoolNumber: string;
  region: string;
  district: string;
  role: UserRole;
  ecoCoins: number;
  registrationDate: string;
  isVerified: boolean;
  badge: string;
  telegramUsername?: string;
  telegramId?: number | string;
  telegramChatId?: string | number;
  telegramAuth?: boolean;
  referralCode?: string;
  referredBy?: string;
  referralCount?: number;
  referralEarnings?: number;
  activityStats: UserActivityStats;
  ecoXP?: number;
  ecoImpact?: string;
  level?: number;
  phoneNumber?: string;
  grade?: string;
  isOnboarded?: boolean;
  privacyConsentAccepted?: boolean;
  welcomeBonusClaimed?: boolean;
  approvedRoles?: UserRole[];
  roleRevocationReason?: string;
  allowStudentMessages?: boolean;
  notificationsEnabled?: boolean;
  preferredLanguage?: 'uz' | 'ru' | 'en';
  // Legacy accessors
  reportsCount?: number;
  cleanupsCount?: number;
  treesPlanted?: number;
  totalCoinsEarned?: number;
  streakDays?: number;
  lastStreakClaimDate?: string;
  avatarUrl?: string;
}

export interface RegistrationApplication {
  id: string;
  userId: string;
  fullName: string;
  telegramId: string;
  telegramUsername?: string;
  region: string;
  district: string;
  schoolId?: string;
  schoolNumber: string;
  officialSchoolName: string;
  requestedRole: UserRole;
  requestedRoleName?: string;
  contactInfo: string;
  verificationDetails: string;
  status: ApplicationStatus;
  adminNote?: string;
  reviewedBy?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface MediaSubmission {
  id: string;
  userId: string;
  userName: string;
  userRole?: UserRole;
  schoolId: string;
  schoolName: string;
  region: string;
  district: string;
  activityCategory: MediaCategory;
  mediaType: 'image' | 'video';
  mediaUrl: string;
  fileHash?: string;
  description: string;
  status: MediaModerationStatus;
  awardedCoins: number;
  moderatorNote?: string;
  moderatedBy?: string;
  moderatedAt?: string;
  createdAt: string;
  updatedAt?: string;
}

export interface EcoTask {
  id: string;
  schoolId: string;
  schoolName?: string;
  region: string;
  district: string;
  title: string;
  instructions: string;
  assignedByUid: string;
  assignedByName?: string;
  assigneeUid: string;
  assigneeName?: string;
  relatedReportId?: string;
  status: EcoTaskStatus;
  evidenceUrl?: string;
  completionNote?: string;
  rewardCoins: number;
  createdAt: string;
  updatedAt?: string;
}

export interface RewardSettings {
  id: string;
  welcomeBonus: number;
  dailyQuiz: number;
  referralInviter: number;
  referralInvitee: number;
  awarenessPost: number;
  wasteSorting: number;
  treeCareWatering: number;
  treePlanting: number;
  gardenProject: number;
  environmentalCampaign: number;
  schoolImprovement: number;
  problemVerified: number;
  problemResolved: number;
  ambassadorTaskBonus: number;
  duplicateWindowHours: number;
  updatedAt: string;
  updatedBy: string;
}

export interface RoleRequest {
  id: string;
  userId: string;
  userName: string;
  userPhone: string;
  userSchool: string;
  currentRole: UserRole;
  requestedRole: UserRole;
  requestedRoleName: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | 'needs_info';
  requestedAt: string;
  reviewedAt?: string;
  reviewedBy?: string;
  adminNotes?: string;
  adminNote?: string;
  userTelegramUsername?: string;
  schoolName?: string;
  schoolNumber?: string;
  region?: string;
  district?: string;
  createdAt?: string;
}

export interface SchoolEcoReportStats {
  total: number;
  resolved: number;
  pending: number;
  inProgress: number;
}

export interface School {
  id: string;
  name: string;
  number: string;
  region: string;
  district: string;
  address?: string;
  logoUrl?: string;
  verifiedPhotos?: string[];
  glbModelUrl?: string;
  environmentalScore?: number;
  greenAreaSqm?: number;
  ecoReportStats?: SchoolEcoReportStats;
  ambassadorId?: string;
  ambassadorName: string;
  captainId?: string;
  adminEmail?: string;
  registeredStudentsCount: number;
  totalCoins: number;
  treesPlanted: number;
  cleanupsCompleted: number;
  ratingRank: number;
  status: 'active' | 'pending' | 'verified';
  createdAt: string;
  lat?: number;
  lng?: number;
  studentsCount?: number;
}

export type MapBaseStyleId = 'hybrid' | 'roadmap' | 'satellite' | 'terrain' | 'street' | 'dark';

export type EcologicalLayerId =
  | 'schools'
  | 'green_spaces'
  | 'trees'
  | 'waste_reports'
  | 'water_reports'
  | 'problem_locations'
  | 'school_rankings'
  | 'eco_heatmap'
  | 'district_boundaries';

export interface MapLayerConfig {
  id: EcologicalLayerId;
  label: string;
  description: string;
  enabledByDefault: boolean;
  category: 'infrastructure' | 'ecology' | 'reports' | 'analytics';
  requiresPaidApi?: boolean;
}

export interface MapImageryProvider {
  id: MapBaseStyleId;
  name: string;
  tileUrls: string[];
  attribution: string;
  maxZoom: number;
  isPaid: boolean;
  isLiveImagery: boolean;
  licenseNote: string;
}

export interface MapProviderConfigResponse {
  defaultBaseStyle: MapBaseStyleId;
  googleMapsApiKey?: string;
  providers: MapImageryProvider[];
  cesium: {
    enabled: boolean;
    hasIonToken: boolean;
    hasCustom3DTiles?: boolean;
    photorealistic3DAvailable: boolean;
    dailyQuotaLimit?: number;
    paidWarning: string;
  };
  limits: {
    maxPageSize: number;
    cacheTtlMs: number;
  };
}

export type Cesium3DPreset = 'free' | 'ion_hd' | 'google_photorealistic';

export interface CesiumSessionResponse {
  freeModeOnly: boolean;
  ionToken?: string;
  custom3DTilesUrl?: string;
  supportedPresets?: Cesium3DPreset[];
  recommendedPreset?: Cesium3DPreset;
  remainingQuota?: number;
  dailyQuotaLimit?: number;
  message: string;
}

export interface EcoReportStatusEvent {
  status: string;
  actorName: string;
  actorRole: string;
  note?: string;
  timestamp: string;
}

export interface EcoReport {
  id: string;
  title: string;
  description: string;
  category: ProblemCategory;
  severity: ProblemSeverity;
  status: ProblemStatus;
  region: string;
  district: string;
  address: string;
  lat: number;
  lng: number;
  imageUrl: string;
  beforeImageUrl?: string;
  videoUrl?: string;
  beforeVideoUrl?: string;
  resolvedImageUrl?: string;
  afterImageUrl?: string;
  afterVideoUrl?: string;
  resolutionDescription?: string;
  aiAuthenticityCheck?: {
    isAiGenerated: boolean;
    isVerifiedResolved: boolean;
    confidence: number;
    verdictUz: string;
    checkedAt: string;
  };
  rewardsIssued?: boolean;
  ambassadorResolutionRewarded?: boolean;
  studentRewardedCoins?: number;
  ambassadorRewardedCoins?: number;
  studentRewardTxId?: string;
  ambassadorRewardTxId?: string;
  reuploadRequestCount?: number;
  reporterUid: string;
  reporterName: string;
  schoolId?: string;
  schoolName: string;
  schoolNumber?: string;
  rewardCoins: number;
  assignedAmbassadorUid?: string;
  assignedAmbassadorName?: string;
  assignedAt?: string;
  submittedForFinalReviewAt?: string;
  finalReviewedBy?: string;
  finalReviewedByUid?: string;
  finalReviewedAt?: string;
  finalReviewNote?: string;
  captainInstructions?: string;
  ambassadorSolutions?: string;
  progressEvidenceUrl?: string;
  completionNote?: string;
  escalationTarget?: string;
  isHazardous?: boolean;
  safetyWarning?: string;
  moderatorNote?: string;
  statusHistory?: EcoReportStatusEvent[];
  aiAnalysis?: {
    severityScore: number;
    recommendedAction: string;
    treeRecommendations?: string[];
    neededEquipment?: string[];
    urgencyNote?: string;
  };
  upvotes: number;
  hasUpvoted?: boolean;
  createdAt: string;
  updatedAt?: string;
  resolvedAt?: string;
}

export interface Ambassador {
  id: string;
  schoolId: string;
  schoolName: string;
  region?: string;
  district?: string;
  fullName: string;
  email?: string;
  phone?: string;
  telegramUsername?: string;
  grade?: string;
  status: 'active' | 'pending' | 'revoked';
  approvedBy?: string;
  appointedAt: string;
  permissions: string[];
  verifiedActivitiesCount?: number;
  tasksCompletedCount?: number;
  ecoCoins?: number;
}

export interface AuditLog {
  id: string;
  actorUid: string;
  actorName: string;
  actorRole: UserRole | string;
  action: string;
  targetCollection: string;
  targetId: string;
  details?: Record<string, any>;
  timestamp: string;
  ipAddress?: string;
}

export interface Notification {
  id: string;
  userId: string;
  title: string;
  message: string;
  type: 'coin' | 'status' | 'ambassador' | 'system' | 'role' | 'media' | 'task' | 'award';
  read: boolean;
  createdAt: string;
}

export type ShopSubscriptionPlatform = 'telegram_channel' | 'telegram_bot' | 'instagram' | 'website';

export interface ShopSubscriptionTarget {
  id: string;
  platform: ShopSubscriptionPlatform;
  title: string;
  url: string;
  handle?: string;
}

export interface ShopRedemptionGate {
  mode: 'none' | 'ad' | 'subscription' | 'ad_and_subscription';
  adId?: string;
  requiredSubscriptions?: ShopSubscriptionTarget[];
}

export interface ShopItem {
  id: string;
  title: string;
  description: string;
  priceCoins: number;
  category: 'accessories' | 'stationery' | 'eco_home' | 'education';
  stock: number;
  imageUrl: string;
  sponsorName: string;
  features?: string[];
  redemptionGate?: ShopRedemptionGate;
}

export interface CoinTransaction {
  id: string;
  userId: string;
  amount: number;
  type: 'earn' | 'spend' | 'bonus' | 'adjustment';
  status?: 'pending' | 'approved' | 'rejected';
  reason: string;
  adjustedBy?: string;
  mediaSubmissionId?: string;
  reportId?: string;
  rewardStage?: string;
  createdAt: string;
}

export interface EcoArticle {
  id: string;
  title: string;
  excerpt: string;
  content: string;
  category: string;
  author: string;
  readTime: string;
  date: string;
  imageUrl: string;
  views: number;
  telegramPostId?: string;
  telegramPostUrl?: string;
}

export interface EcoPartner {
  id: string;
  name: string;
  category: string;
  logoText: string;
  logoUrl?: string;
  description: string;
  website: string;
  projectsSupported: string;
  contactEmail?: string;
  contactPhone?: string;
  contactPerson?: string;
  region?: string;
  isVerified?: boolean;
  totalDonationUZS?: number;
  sponsoredProductsCount?: number;
}

export interface SponsorshipProposal {
  id: string;
  companyName: string;
  contactPerson: string;
  contactEmail: string;
  contactPhone: string;
  sponsorshipType: 'funds' | 'products' | 'events' | 'mixed';
  fundingAmountUZS?: number;
  productDescription?: string;
  targetSchoolsOrRegions: string;
  proposalDetails: string;
  status: 'pending' | 'approved' | 'rejected';
  submittedAt: string;
  reviewedBy?: string;
  reviewedAt?: string;
  adminNotes?: string;
}

export interface SponsorshipProject {
  id: string;
  partnerId: string;
  partnerName: string;
  partnerLogoText?: string;
  title: string;
  description: string;
  category: 'greening' | 'cleanup' | 'equipment' | 'shop_gifts' | 'solar' | 'education';
  targetAmountUZS: number;
  raisedAmountUZS: number;
  inKindItems?: string;
  schoolsBenefited: number;
  treesPlantedOrImpact: string;
  status: 'active' | 'completed' | 'upcoming';
  startDate: string;
  endDate: string;
  imageUrl: string;
}

export type EcoAdPlacement =
  | 'home_top'
  | 'home_middle'
  | 'shop_top'
  | 'map_banner'
  | 'media_sidebar'
  | 'post_purchase'
  | 'earn_coins';

export interface EcoAd {
  id: string;
  title: string;
  sponsorId: string;
  sponsorName: string;
  sponsorLogo?: string;
  type: 'banner' | 'video' | 'card';
  placement: EcoAdPlacement;
  headline: string;
  subheadline: string;
  imageUrl: string;
  videoUrl?: string;
  ctaText: string;
  ctaUrl: string;
  ctaType?: 'website' | 'telegram_bot' | 'telegram_channel';
  clickOpensLink?: boolean;
  rewardCoins?: number;
  skipAfterSeconds?: number;
  isVerifiedSponsor: boolean;
  startDate: string;
  endDate: string;
  status: 'active' | 'paused' | 'pending' | 'expired';
  impressionsCount: number;
  clicksCount: number;
  impressions?: number;
  clicks?: number;
  complianceNote: string;
}

export interface AdWatchState {
  cooldownHours: number;
  lastWatchedAdId: string | null;
  lastClaimedAt: string | null;
  nextAvailableAt: string | null;
  remainingSeconds: number;
  perAdLastClaimedAt: Record<string, string>;
}

export interface ShopOrder {
  id: string;
  userId: string;
  userName: string;
  userEmail: string;
  schoolId?: string;
  schoolName: string;
  itemId: string;
  itemTitle: string;
  itemImageUrl?: string;
  priceCoins: number;
  voucherCode: string;
  status: 'pending' | 'approved' | 'delivered' | 'cancelled';
  createdAt: string;
  approvedAt?: string;
  sponsorName: string;
  verifiedBySchoolAdmin?: boolean;
  verifiedByUid?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  forwardedToSuperAdminAt?: string;
  verificationNote?: string;
  qrToken?: string;
}

export interface PublicVoucherInfo {
  valid: boolean;
  voucherCode: string;
  itemTitle: string;
  itemImageUrl: string;
  sponsorName: string;
  winnerName: string;
  schoolName: string;
  status: 'pending' | 'approved' | 'delivered' | 'cancelled';
  createdAt: string;
  verifiedBySchoolAdmin?: boolean;
  verifiedByName?: string;
}

export interface VoucherCheckResult {
  valid: boolean;
  alreadyDelivered?: boolean;
  order?: ShopOrder;
  error?: string;
}

export interface EcoQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
  rewardCoins: number;
}

export interface ReferralRecord {
  id: string;
  referrerUid: string;
  referrerName: string;
  referredUid: string;
  referredName: string;
  referredSchool: string;
  rewardCoins: number;
  status: 'pending' | 'verified' | 'rewarded';
  createdAt: string;
}

export interface TelegramBroadcast {
  id: string;
  title: string;
  message: string;
  targetAudience: 'all' | 'students' | 'ambassadors' | 'region';
  targetRegion?: string;
  sentAt: string;
  sentBy: string;
  recipientsCount: number;
  status: 'sent' | 'failed';
}

export interface TelegramBotStatus {
  botConfigured: boolean;
  botUsername: string;
  webhookConfigured: boolean;
  webhookUrl?: string;
  miniAppUrl: string;
  totalSubscribers: number;
}

export type CompetitionLevel = 'district' | 'regional' | 'national';

export interface CompetitionScore {
  id: string;
  entityId: string;
  entityName: string;
  entityType: 'school' | 'student';
  points: number;
  periodId: string;
  region: string;
  district: string;
  breakdown: {
    reports: number;
    missions: number;
    quiz: number;
    creator: number;
    recycle: number;
    innovation: number;
    impact: number;
  };
  lastUpdated: string;
}

export interface CompetitionPeriod {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  status: 'active' | 'frozen' | 'finalized';
}

export interface ChampionshipResult {
  id: string;
  periodId: string;
  level: CompetitionLevel;
  scope: string;
  rankings: {
    id: string;
    name: string;
    points: number;
    position: number;
    qualified: boolean;
  }[];
  finalizedAt: string;
  finalizedBy: string;
}

export interface Certificate {
  id: string;
  uid: string;
  entityName: string;
  type: 'school' | 'student';
  category: string;
  level: CompetitionLevel;
  position: number;
  periodId: string;
  periodName: string;
  issuedAt: string;
  verificationCode: string;
  qrCodeUrl: string;
}

export interface AnalyticsResponse {
  scopeLabel: string;
  role: UserRole | 'guest';
  totals: {
    students: number;
    schools: number;
    ambassadors: number;
    reportsTotal: number;
    reportsResolved: number;
    reportsPending: number;
    reportsEscalated: number;
    mediaApproved: number;
    mediaPending: number;
    totalEcoCoins: number;
    treesPlanted: number;
    cleanupsCompleted: number;
  };
  monthlySeries: {
    label: string;
    reports: number;
    mediaApproved: number;
    resolved: number;
    coinsAwarded: number;
  }[];
  categoryBreakdown: { category: string; label: string; count: number }[];
  regionPerformance: { region: string; schools: number; students: number; reports: number; resolved: number; coins: number }[];
  districtPerformance: { district: string; region: string; schools: number; students: number; resolved: number; coins: number }[];
}

export type HomePostCategory = 'bot_news' | 'website' | 'channel_ad' | 'news' | 'school_event';

export interface HomePost {
  id: string;
  title: string;
  content: string;
  category: HomePostCategory;
  imageUrl?: string;
  videoUrl?: string;
  ctaText?: string;
  ctaUrl?: string;
  telegramPostId?: string;
  telegramPostUrl?: string;
  authorUid: string;
  authorName: string;
  authorRole: UserRole | string;
  schoolId?: string;
  schoolName?: string;
  region?: string;
  district?: string;
  isPinned: boolean;
  status: 'active' | 'paused';
  createdAt: string;
  updatedAt?: string;
}

export interface DistrictSchoolRating {
  id: string;
  name: string;
  number: string;
  region: string;
  district: string;
  ambassadorName: string;
  captainId?: string;
  captainName?: string;
  registeredStudentsCount: number;
  totalCoins: number;
  treesPlanted: number;
  cleanupsCompleted: number;
  resolvedReportsCount: number;
  approvedMediaCount: number;
  realScore: number;
  rank: number;
  isTop3: boolean;
  isMySchool: boolean;
}

export interface DistrictAmbassadorRating {
  id: string;
  fullName: string;
  schoolId: string;
  schoolName: string;
  region: string;
  district: string;
  ecoCoins: number;
  ecoXP?: number;
  monthlyXP?: number;
  monthlyCoinsEarned?: number;
  verifiedActivitiesCount: number;
  monthlyVerifiedActivitiesCount?: number;
  tasksCompletedCount: number;
  monthlyTasksCompletedCount?: number;
  resolvedReportsCount: number;
  resolvedProblemsCount?: number;
  monthlyResolvedProblemsCount?: number;
  monthlyScore?: number;
  overallScore?: number;
  realScore: number;
  rank: number;
  isTop3: boolean;
  isMe: boolean;
  isLast: boolean;
}

export interface MonthlyAwardRecord {
  id: string;
  periodKey: string;
  periodLabel: string;
  region: string;
  district: string;
  topSchools: { id: string; name: string; rank: number; score: number; bonusCoins: number; promoCode?: string; captainUid?: string; captainName?: string }[];
  topAmbassadors: { id: string; fullName: string; schoolName: string; rank: number; score: number; bonusCoins: number; promoCode?: string }[];
  awardedByUid: string;
  awardedByName: string;
  awardedAt: string;
}

export interface DistrictLeaderboardDetailsResponse {
  success: boolean;
  region: string;
  district: string;
  rankingMode?: 'monthly' | 'overall';
  periodKey: string;
  periodLabel?: string;
  daysRemainingInMonth: number;
  isLastDayOfMonth?: boolean;
  lastDayDateLabel?: string;
  alreadyAwardedThisMonth?: boolean;
  schoolRatings: DistrictSchoolRating[];
  mySchoolRating: DistrictSchoolRating | null;
  totalSchoolsInDistrict: number;
  ambassadorRatings: DistrictAmbassadorRating[];
  top10Ambassadors?: DistrictAmbassadorRating[];
  myAmbassadorRating: DistrictAmbassadorRating | null;
  ambassadorRatingsMonthly?: DistrictAmbassadorRating[];
  ambassadorRatingsOverall?: DistrictAmbassadorRating[];
  myAmbassadorMonthlyRating?: DistrictAmbassadorRating | null;
  myAmbassadorOverallRating?: DistrictAmbassadorRating | null;
  totalAmbassadorsInDistrict: number;
  monthlyAwards: MonthlyAwardRecord[];
}

export type ChatScope =
  | 'school_ambassadors'
  | 'district_captains'
  | 'regional_coordinators'
  | 'student_dm';

export type ChatMessageKind = 'chat' | 'command' | 'idea' | 'bot_notice';

export type ChatPermissionStatus = 'pending' | 'approved' | 'rejected' | 'blocked';

export interface EcoChatMessage {
  id: string;
  channelId: string;
  scope: ChatScope;
  messageKind: ChatMessageKind;
  senderUid: string;
  senderName: string;
  senderRole: UserRole | string;
  senderAvatar?: string;
  senderTelegramUsername?: string;
  recipientUid?: string;
  recipientName?: string;
  schoolId?: string;
  schoolName?: string;
  region?: string;
  district?: string;
  text: string;
  imageUrl?: string;
  promoCode?: string;
  viaBot?: boolean;
  botHandle?: string;
  replyToId?: string;
  replyPreview?: {
    senderName: string;
    text: string;
  };
  createdAt: string;
}

export interface ChatThreadSummary {
  channelId: string;
  scope: ChatScope;
  title: string;
  subtitle: string;
  isGroup: boolean;
  viaBot?: boolean;
  allowedMessageKinds: ChatMessageKind[];
  recipientUid?: string;
  recipientRole?: UserRole | string;
  recipientAvatar?: string;
  recipientTelegramLinked?: boolean;
  recipientTelegramUsername?: string;
  schoolId?: string;
  schoolName?: string;
  region?: string;
  district?: string;
  permissionStatus?: ChatPermissionStatus | 'not_requested' | 'disabled_by_recipient';
  lastMessage?: EcoChatMessage | null;
  unreadCount?: number;
}

export interface ChatPermissionRequest {
  id: string;
  requesterUid: string;
  requesterName: string;
  requesterSchoolName: string;
  requesterGrade?: string;
  requesterAvatar?: string;
  targetUid: string;
  targetName: string;
  targetSchoolName: string;
  targetGrade?: string;
  targetAvatar?: string;
  note?: string;
  status: ChatPermissionStatus;
  createdAt: string;
  respondedAt?: string;
}

export interface RosterStudentEntry {
  uid: string;
  fullName: string;
  grade?: string;
  schoolId: string;
  schoolName: string;
  region: string;
  district: string;
  role: UserRole | string;
  ecoCoins: number;
  reportsCount: number;
  treesPlanted: number;
  badge: string;
  avatarUrl?: string;
  phoneNumber?: string;
  telegramUsername?: string;
  telegramLinked?: boolean;
  allowStudentMessages?: boolean;
}

export interface RosterAmbassadorEntry {
  id: string;
  uid: string;
  fullName: string;
  schoolId: string;
  schoolName: string;
  region: string;
  district: string;
  grade?: string;
  phone?: string;
  telegramUsername?: string;
  telegramLinked?: boolean;
  ecoCoins: number;
  verifiedActivitiesCount: number;
  tasksCompletedCount: number;
  status: string;
  avatarUrl?: string;
}

export interface RosterCaptainEntry {
  uid: string;
  fullName: string;
  schoolId: string;
  schoolName: string;
  schoolNumber?: string;
  region: string;
  district: string;
  grade?: string;
  phoneNumber?: string;
  telegramUsername?: string;
  telegramLinked?: boolean;
  ecoCoins: number;
  studentsCount: number;
  avatarUrl?: string;
}

export interface RosterCoordinatorEntry {
  uid: string;
  fullName: string;
  region: string;
  district: string;
  phoneNumber?: string;
  telegramUsername?: string;
  telegramLinked?: boolean;
  schoolsCount: number;
  studentsCount: number;
  avatarUrl?: string;
}

export interface RosterDirectoryResponse {
  success: boolean;
  role: UserRole | string;
  schoolStudents: RosterStudentEntry[];
  schoolAmbassadors: RosterAmbassadorEntry[];
  districtCaptains: RosterCaptainEntry[];
  districtCoordinators: RosterCoordinatorEntry[];
  regionalCoordinators?: RosterCoordinatorEntry[];
  peerStudents: RosterStudentEntry[];
  myDistrictCoordinator?: RosterCoordinatorEntry | null;
  mySchoolCaptain?: RosterCaptainEntry | null;
}

export interface DistrictUserGrowthEntry {
  id: string;
  region: string;
  district: string;
  coordinatorName: string;
  schoolsCount: number;
  botUsersCount: number;
  webUsersCount: number;
  totalJoinedUsers: number;
  totalSchoolStudents: number;
  newUsersLast30Days: number;
  rank: number;
  isTop3: boolean;
  isMyDistrict: boolean;
}

export interface DistrictUserGrowthResponse {
  success: boolean;
  prizeNote: string;
  totalDistricts: number;
  myDistrictRank: DistrictUserGrowthEntry | null;
  items: DistrictUserGrowthEntry[];
}

export interface LiveMetrics {
  totalSchools: number;
  totalUsers: number;
  botUsersCount: number;
  totalDistricts: number;
  totalRegions: number;
  schoolCaptainsCount: number;
  pendingApplicationsCount: number;
  shopOrdersCount: number;
  resolvedReports: number;
  totalReports: number;
  treesPlanted: number;
  activeAmbassadors: number;
}

export type MissionType = 'quiz' | 'channel_subscribe' | 'custom_task';

export interface QuizQuestionItem {
  id: string;
  question: string;
  options: string[];
  correctIndex?: number;
  explanation?: string;
  imageUrl?: string;
}

export interface ProctoredQuizQuestionView {
  id: string;
  question: string;
  options: string[];
  imageUrl?: string;
}

export interface ProctoredQuizStartResponse {
  success: boolean;
  sessionId?: string;
  totalQuestions?: number;
  currentIndex?: number;
  timeLimitSeconds?: number;
  questionStartedAt?: string;
  attemptsUsedToday?: number;
  maxAttemptsPerDay?: number;
  alreadyRewarded?: boolean;
  noticeUz?: string;
  question?: ProctoredQuizQuestionView;
  error?: string;
  limitReached?: boolean;
}

export interface ProctoredQuizAnswerResponse {
  success: boolean;
  finished?: boolean;
  currentIndex?: number;
  totalQuestions?: number;
  timeLimitSeconds?: number;
  questionStartedAt?: string;
  question?: ProctoredQuizQuestionView;
  lastQuestionTimedOut?: boolean;
  lastQuestionSuspiciousFast?: boolean;
  passed?: boolean;
  scorePercent?: number;
  correctCount?: number;
  totalCount?: number;
  passingPercent?: number;
  awardedCoins?: number;
  awardedXp?: number;
  isSuspicious?: boolean;
  suspiciousReason?: string;
  alreadyRewarded?: boolean;
  noticeUz?: string;
  message?: string;
  results?: {
    questionId: string;
    question: string;
    selectedIndex: number;
    correctIndex: number;
    isCorrect: boolean;
    timedOut?: boolean;
    explanation?: string;
  }[];
  error?: string;
}

export interface EcoMission {
  id: string;
  type: MissionType;
  title: string;
  description: string;
  rewardCoins: number;
  status: 'active' | 'paused';
  category?: string;
  questions?: QuizQuestionItem[];
  questionCount?: number;
  passingPercent?: number;
  question?: string;
  options?: string[];
  correctIndex?: number;
  explanation?: string;
  channelUsername?: string;
  channelUrl?: string;
  requiresProof?: boolean;
  proofType?: 'image' | 'video' | 'text' | 'any';
  difficulty?: 'easy' | 'medium' | 'hard';
  durationMinutes?: number;
  durationLabel?: string;
  imageUrl?: string;
  createdAt: string;
  createdByUid?: string;
  createdByName?: string;
}

export interface MissionSubmission {
  id: string;
  missionId: string;
  missionTitle: string;
  missionType: MissionType;
  userId: string;
  userName: string;
  schoolId?: string;
  schoolName?: string;
  proofText?: string;
  mediaUrl?: string;
  status: 'pending' | 'approved' | 'rejected';
  awardedCoins: number;
  aiCheck?: {
    isValidEco: boolean;
    isAiGenerated: boolean;
    verdictUz: string;
  };
  adminNote?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  createdAt: string;
}

export interface StudentRatingEntry {
  uid: string;
  fullName: string;
  grade?: string;
  schoolId?: string;
  schoolName?: string;
  region?: string;
  district?: string;
  badge?: string;
  avatarUrl?: string;
  role?: string;
  rank: number;
  monthlyScore: number;
  monthlyEarnedCoins: number;
  monthlyActivitiesCount: number;
  monthlyReportsCount: number;
  monthlyMediaCount: number;
  monthlyMissionsCount: number;
  totalCoins: number;
  treesPlanted: number;
  isMe?: boolean;
}

export interface StudentRatingPrizeTier {
  rank: number;
  title: string;
  bonusCoins: number;
}

export interface StudentMonthlyAwardRecord {
  id: string;
  scope: 'school' | 'district';
  periodKey: string;
  periodLabel: string;
  region: string;
  district: string;
  schoolId?: string;
  schoolName?: string;
  winners: {
    uid: string;
    fullName: string;
    schoolName?: string;
    grade?: string;
    rank: number;
    monthlyScore: number;
    prizeTitle: string;
    bonusCoins: number;
    promoCode: string;
  }[];
  awardedByUid: string;
  awardedByName: string;
  awardedAt: string;
}

export interface StudentRatingScopePayload {
  scope: 'school' | 'district';
  schoolId?: string;
  schoolName?: string;
  region: string;
  district: string;
  enabled: boolean;
  minMembersThreshold: number;
  currentMembersCount: number;
  canActivate: boolean;
  isLiveActive: boolean;
  periodKey: string;
  periodLabel: string;
  daysRemainingInMonth: number;
  isLastDayOfMonth: boolean;
  lastDayDateLabel: string;
  prizes: StudentRatingPrizeTier[];
  top10: StudentRatingEntry[];
  previewTop10?: StudentRatingEntry[];
  totalParticipants: number;
  myRank: number | null;
  myEntry: StudentRatingEntry | null;
  isCallerInTop10: boolean;
  pointsToTop10: number | null;
  pointsToTop3?: number | null;
  pointsToTop1?: number | null;
  alreadyAwardedThisMonth: boolean;
  recentWinners: StudentMonthlyAwardRecord[];
}

export interface StudentRatingsCabinetResponse {
  success: boolean;
  school: StudentRatingScopePayload;
  district: StudentRatingScopePayload;
}

export interface StudentRatingsManageResponse {
  success: boolean;
  school?: StudentRatingScopePayload | null;
  district?: StudentRatingScopePayload | null;
}

export interface WeeklyChallengeSummary {
  weekKey: string;
  title: string;
  description: string;
  targetActions: number;
  rewardCoins: number;
  endIso: string;
  serverNow?: string;
  daysRemaining: number;
  hoursRemaining: number;
  minutesRemaining?: number;
  secondsRemaining?: number;
  participantsCount: number;
  joined: boolean;
  progress: number;
  completed: boolean;
  claimed: boolean;
}

export interface SchoolTeamMissionSummary {
  schoolId: string;
  schoolName: string;
  region?: string;
  district?: string;
  membersCount: number;
  currentXp: number;
  targetXp: number;
  rewardCoins: number;
  schoolRank: number | null;
  progressPct: number;
}

export interface ChampionshipStageScheduleInfo {
  cycleLabel: string;
  periodKey: string;
  endsAt?: string;
  serverNow?: string;
  daysRemaining: number;
  hoursRemaining: number;
  minutesRemaining?: number;
  secondsRemaining?: number;
  unlocked?: boolean;
}

export interface ChampionshipEligibility {
  districtUnlocked: boolean;
  regionalUnlocked: boolean;
  nationalUnlocked: boolean;
  isPrivileged: boolean;
  isQualifiedTop3: boolean;
  callerDistrictRank: number | null;
  callerSchoolDistrictRank: number | null;
  reasonUz: string;
  stageSchedule: {
    district: ChampionshipStageScheduleInfo;
    regional: ChampionshipStageScheduleInfo;
    national: ChampionshipStageScheduleInfo;
  };
}

export interface ChampionshipSchoolEntry {
  id: string;
  name: string;
  number?: string;
  region: string;
  district: string;
  studentsCount: number;
  treesPlanted: number;
  resolvedReports: number;
  approvedMedia: number;
  totalCoins: number;
  points: number;
  logoUrl?: string;
  isMine?: boolean;
  rank: number;
  qualified?: boolean;
}

export interface ChampionshipStudentEntry {
  uid: string;
  name: string;
  schoolId?: string;
  schoolName: string;
  grade?: string;
  region: string;
  district: string;
  avatarUrl?: string;
  badge?: string;
  totalCoins: number;
  points: number;
  reportsCount?: number;
  treesPlanted?: number;
  cleanupsCount?: number;
  isMe?: boolean;
  rank: number;
  qualified?: boolean;
}

export interface ChampionshipLiveResponse {
  success: boolean;
  level: 'district' | 'regional' | 'national';
  entity: 'schools' | 'students';
  serverNow?: string;
  locked?: boolean;
  lockReason?: string;
  eligibility: ChampionshipEligibility;
  schools: ChampionshipSchoolEntry[];
  students: ChampionshipStudentEntry[];
  totals: {
    schoolsCount: number;
    studentsCount: number;
    allPlatformSchools?: number;
    allPlatformUsers?: number;
  };
  recentWinners: any[];
}

export interface DailyMission {
  id: string;
  title: string;
  description: string;
  rewardCoins: number;
  status: 'active' | 'archived';
  createdAt: string;
  createdByName?: string;
}

export interface DailyMissionSubmission {
  id: string;
  missionId: string;
  missionTitle: string;
  userId: string;
  userName: string;
  userGrade?: string;
  schoolId: string;
  schoolName: string;
  photoUrl: string;
  comment?: string;
  status: 'pending' | 'approved' | 'rejected';
  awardedCoins: number;
  reviewedBy?: string;
  reviewedAt?: string;
  adminNote?: string;
  createdAt: string;
}

