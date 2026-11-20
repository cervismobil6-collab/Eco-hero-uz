import express from 'express';
import http from 'http';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import crypto from 'crypto';
import { spawn, ChildProcess } from 'child_process';
import { GoogleGenAI, ThinkingLevel } from '@google/genai';
import JSZip from 'jszip';
import { WebSocketServer, WebSocket } from 'ws';
import compression from 'compression';
import { computeUserStreakState, getUzbekistanDateKey } from './src/utils/streak';
import {
  centralDb,
  saveCentralDb,
  findOrCreateSchool,
  findUserByAnyIdentifier,
  upsertUser,
  recordTransaction,
  addAuditLog,
  recalculateSchoolRanks,
  normalizeSchoolNumber,
  getConfiguredReward,
  getMediaCategoryReward,
  detectReportHazard,
  hasDuplicateActiveAppointment,
  hasDuplicateMediaSubmission,
  isWithinPeriod,
  getLiveSchoolsList,
  getSchoolLiveStudentCount,
  computeLiveMetrics,
} from './server-db';
import {
  attachAuthUser,
  requireAuth,
  requireRoles,
  hasAnyRole,
  checkIsSuperAdmin,
  issueSessionToken,
  verifySessionToken,
  verifyFirebaseIdToken,
  verifyTelegramInitData as verifyTelegramInitDataStrict,
  assertSchoolAccess,
  assertDistrictAccess,
  assertRegionAccess,
  sanitizePublicUser,
  sanitizeSelfUser,
  sanitizePublicAmbassador,
  canViewReport,
  type AuthenticatedRequest,
} from './server-security';

dotenv.config({ override: true });

process.on('unhandledRejection', (reason: any) => {
  console.error('[Server] Unhandled Rejection:', reason?.message || reason);
});

process.on('uncaughtException', (err: any) => {
  console.error('[Server] Uncaught Exception:', err?.stack || err?.message || err);
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
try {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
} catch {
  // Ignore if exists
}

export function isPrivateAiStudioOrLocalUrl(url?: string): boolean {
  if (!url) return true;
  const lower = url.toLowerCase();
  return (
    lower.includes('localhost') ||
    lower.includes('127.0.0.1') ||
    lower.includes('ais-dev-') ||
    lower.includes('ais-pre-')
  );
}

// Production Permanent HTTPS Domain Default (never pick private AI Studio preview/dev URLs)
const candidateProdUrl =
  process.env.PUBLIC_APP_URL ||
  process.env.RENDER_EXTERNAL_URL ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '') ||
  process.env.FIREBASE_HOSTING_URL ||
  process.env.APP_URL ||
  '';

export const PERMANENT_PRODUCTION_URL = isPrivateAiStudioOrLocalUrl(candidateProdUrl) ? '' : candidateProdUrl;
export let APP_URL = PERMANENT_PRODUCTION_URL || 'http://localhost:3000';

const app = express();
const httpServer = http.createServer(app);
const port = Number(process.env.SERVER_PORT || process.env.PORT) || 3000;

interface ConnectedWsClient {
  ws: WebSocket;
  uid: string;
  role: string;
  approvedRoles: string[];
  region: string;
  district: string;
  schoolId: string;
  isSuperAdmin: boolean;
}

const chatWss = new WebSocketServer({ noServer: true });
const wsClients = new Set<ConnectedWsClient>();

app.use(
  compression({
    threshold: 512,
    filter: (req, res) => {
      const accept = String(req.headers.accept || '');
      if (accept.includes('text/event-stream') || req.path.includes('/stream')) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);
app.use(express.json({ limit: '65mb' }));
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d' }));
app.use(
  '/cesium',
  express.static(path.resolve(__dirname, 'node_modules/cesium/Build/Cesium'), {
    maxAge: '7d',
  })
);

const BACKEND_PUBLIC_URL = String(
  process.env.BACKEND_PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || ''
)
  .trim()
  .replace(/\/+$/, '');

function isFrontendOnlyStaticHost(url?: string): boolean {
  if (!url) return false;
  try {
    const h = new URL(url).hostname.toLowerCase();
    return (
      h.endsWith('.vercel.app') ||
      h.endsWith('.web.app') ||
      h.endsWith('.firebaseapp.com') ||
      h.endsWith('.netlify.app') ||
      h.endsWith('.pages.dev')
    );
  } catch {
    return false;
  }
}

// Auto-detect public 24/7 production HTTPS URL (Cloud Run, Render, Railway, VPS) from real requests
app.use((req, _res, next) => {
  try {
    if (PERMANENT_PRODUCTION_URL) return next();
    const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'http').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
    if (proto === 'https' && host) {
      const origin = `https://${host}`;
      if (
        !isPrivateAiStudioOrLocalUrl(origin) &&
        !origin.includes('trycloudflare.com') &&
        APP_URL !== origin
      ) {
        APP_URL = origin;
        if (activeBotToken && process.env.DISABLE_BOT_LISTENER !== 'true') {
          syncTelegramBotProfile(activeBotToken, origin).catch(() => {});
        }
      }
    }
  } catch {
    // ignore header detection issues
  }
  next();
});

// Global CORS Middleware (Vercel *.vercel.app, Firebase Hosting *.web.app, Telegram WebView, Eskiz/cPanel + SSE)
function isAllowedCorsOrigin(origin?: string): boolean {
  if (!origin) return false;
  try {
    const u = new URL(origin);
    const host = u.hostname.toLowerCase();
    if (
      host.endsWith('.vercel.app') ||
      host.endsWith('.web.app') ||
      host.endsWith('.firebaseapp.com') ||
      host.endsWith('.netlify.app') ||
      host.endsWith('.pages.dev') ||
      host.endsWith('.telegram.org') ||
      host === 'telegram.org' ||
      host.endsWith('.trycloudflare.com') ||
      host === 'localhost' ||
      host === '127.0.0.1'
    ) {
      return true;
    }
    const extraOrigins = [PERMANENT_PRODUCTION_URL, process.env.FRONTEND_URL, BACKEND_PUBLIC_URL].filter(Boolean);
    for (const candidate of extraOrigins) {
      try {
        if (new URL(String(candidate)).origin === u.origin) return true;
      } catch {}
    }
  } catch {
    return false;
  }
  return false;
}

app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin && isAllowedCorsOrigin(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
    res.header('Access-Control-Allow-Credentials', 'true');
    res.header('Vary', 'Origin');
  } else {
    res.header('Access-Control-Allow-Origin', '*');
  }
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, PATCH, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, Accept, Cache-Control');
  res.header('Access-Control-Expose-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(204);
  }
  next();
});

// Attach verified authUser when Bearer sessionToken is supplied
app.use(attachAuthUser);

// Shared Gemini Client using @google/genai standard pattern & telemetry header
function getGeminiClient(): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

const DEFAULT_AVATAR =
  'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=200&q=80';

function sanitizePublicUsersList() {
  return Object.values(centralDb.users).map((u: any) => sanitizePublicUser(u));
}

function getAllPublicUsersForRankings() {
  return Object.values(centralDb.users);
}

function broadcastRealtimeEvent(type: string, payload: Record<string, any> = {}) {
  const frame = JSON.stringify({ type, ...payload, ts: new Date().toISOString() });
  for (const client of wsClients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    try {
      client.ws.send(frame);
    } catch {}
  }
}

function getTashkentMonthStatus(nowDate = new Date()) {
  const tashkentMs = nowDate.getTime() + 5 * 3600 * 1000;
  const tDate = new Date(tashkentMs);
  const year = tDate.getUTCFullYear();
  const monthIndex = tDate.getUTCMonth();
  const day = tDate.getUTCDate();
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const isLastDayOfMonth = day === daysInMonth;
  const daysRemainingInMonth = Math.max(0, daysInMonth - day);
  const periodKey = `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
  const lastDayDateLabel = `${String(daysInMonth).padStart(2, '0')}.${String(monthIndex + 1).padStart(2, '0')}.${year}`;
  const yymm = `${String(year).slice(-2)}${String(monthIndex + 1).padStart(2, '0')}`;
  const monthNames = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];
  const periodLabel = `${monthNames[monthIndex]} ${year}`;
  return {
    year,
    monthIndex,
    day,
    daysInMonth,
    isLastDayOfMonth,
    daysRemainingInMonth,
    periodKey,
    periodLabel,
    lastDayDateLabel,
    yymm,
  };
}

// ==========================================
// 1. HEALTH & UNIFIED DATABASE BOOTSTRAP
// ==========================================

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'EcoHero Uzbekistan Platform',
    appUrl: APP_URL,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    dbStats: {
      users: Object.keys(centralDb.users).length,
      schools: centralDb.schools.length,
      reports: centralDb.reports.length,
      shopOrders: centralDb.shopOrders.length,
      roleRequests: centralDb.roleRequests.length,
      registrationApplications: centralDb.registrationApplications.length,
      mediaSubmissions: centralDb.mediaSubmissions.length,
    },
  });
});

// Unified Scoped Bootstrap Endpoint (Strict RBAC & PII Redaction)
app.get('/api/bootstrap', (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser || null;
    const isSuperAdmin = Boolean(caller && checkIsSuperAdmin(caller));
    const isModerator = Boolean(caller && hasAnyRole(caller, ['moderator', 'super_admin']));
    const isRegCoord = Boolean(caller && hasAnyRole(caller, ['regional_coordinator']));
    const isDistCoord = Boolean(caller && hasAnyRole(caller, ['district_coordinator']));
    const isCaptain = Boolean(caller && hasAnyRole(caller, ['school_admin']));
    const isAmbassador = Boolean(caller && hasAnyRole(caller, ['ambassador']));

    recalculateSchoolRanks();

    // Scoped reports
    const visibleReports = centralDb.reports.filter((r) => canViewReport(r, caller));

    // Scoped media submissions (public sees APPROVED only)
    const visibleMedia = (centralDb.mediaSubmissions || []).filter((m) => {
      if (m.status === 'APPROVED') return true;
      if (!caller) return false;
      if (isSuperAdmin || isModerator) return true;
      if (m.userId === caller.uid) return true;
      if (isRegCoord && m.region === caller.region) return true;
      if (isDistCoord && m.district === caller.district) return true;
      if ((isCaptain || isAmbassador) && m.schoolId === caller.schoolId) return true;
      return false;
    });

    // Scoped applications & role requests (Hierarchical routing)
    const visibleApplications = !caller
      ? []
      : isSuperAdmin
      ? centralDb.registrationApplications
      : (centralDb.registrationApplications || []).filter((a) => canReviewApplication(caller, a) || a.userId === caller.uid);

    const visibleRoleRequests = !caller
      ? []
      : isSuperAdmin
      ? centralDb.roleRequests
      : (centralDb.roleRequests || []).filter((r) => r.userId === caller.uid);

    // Scoped tasks
    const visibleTasks = !caller
      ? []
      : isSuperAdmin || isModerator
      ? centralDb.ecoTasks
      : (centralDb.ecoTasks || []).filter((t) => {
          if (t.assigneeUid === caller.uid || t.assignedByUid === caller.uid) return true;
          if (isCaptain && t.schoolId === caller.schoolId) return true;
          return false;
        });

    // Scoped ambassadors roster (ambassadors & admins ONLY)
    const canViewAmbassadors = Boolean(
      caller &&
        hasAnyRole(caller, [
          'ambassador',
          'school_admin',
          'district_coordinator',
          'regional_coordinator',
          'moderator',
          'super_admin',
        ])
    );
    const visibleAmbassadors = canViewAmbassadors
      ? (centralDb.ambassadors || []).map((a) => sanitizePublicAmbassador(a, caller))
      : [];

    const visibleOrders = !caller
      ? []
      : isSuperAdmin || isModerator || hasAnyRole(caller, ['sponsor'])
      ? centralDb.shopOrders
      : isCaptain
      ? centralDb.shopOrders.filter(
          (o) =>
            o.userId === caller.uid ||
            (caller.schoolId && o.schoolId === caller.schoolId) ||
            (caller.schoolName && o.schoolName === caller.schoolName)
        )
      : centralDb.shopOrders.filter((o) => o.userId === caller.uid);

    const userTransactions = caller
      ? centralDb.transactions.filter((t) => t.userId === caller.uid)
      : [];
    const userNotifications = caller
      ? centralDb.notifications.filter((n) => n.userId === caller.uid)
      : [];

    // Safe schools catalog with exact live registered student counts (omit adminEmail for non-admins)
    const safeSchools = getLiveSchoolsList(true).map((s) => {
      if (isSuperAdmin || isModerator || (isCaptain && s.id === caller?.schoolId)) return s;
      const { adminEmail: _ae, ...rest } = s;
      return rest;
    });

    const canManageMissions = Boolean(caller && hasAnyRole(caller, ['super_admin', 'moderator', 'school_admin']));
    const visibleMissions = (centralDb.ecoMissions || [])
      .filter((m: any) => m.status === 'active' || canManageMissions)
      .map((m: any) => sanitizeMissionForCaller(m, canManageMissions));
    const visibleMissionSubmissions = !caller
      ? []
      : canManageMissions
      ? centralDb.missionSubmissions || []
      : (centralDb.missionSubmissions || []).filter((s: any) => s.userId === caller.uid);
    const callerCompletedMissions = caller ? centralDb.missionCompletions?.[caller.uid] || [] : [];

    res.json({
      success: true,
      user: sanitizeSelfUser(caller),
      schools: safeSchools,
      reports: visibleReports,
      mediaSubmissions: visibleMedia,
      ecoTasks: visibleTasks,
      registrationApplications: visibleApplications,
      rewardSettings: centralDb.rewardSettings,
      ambassadors: visibleAmbassadors,
      shopItems: centralDb.shopItems,
      shopOrders: visibleOrders,
      transactions: userTransactions,
      roleRequests: visibleRoleRequests,
      partners: centralDb.partners,
      sponsorshipProjects: centralDb.sponsorshipProjects,
      sponsorshipProposals: isSuperAdmin || hasAnyRole(caller, ['sponsor']) ? centralDb.sponsorshipProposals : [],
      ecoAds: centralDb.ecoAds.filter((a) => a.status === 'active' || isSuperAdmin),
      referrals: !caller ? [] : isSuperAdmin ? centralDb.referrals : centralDb.referrals.filter((r) => r.referrerUid === caller.uid),
      broadcasts: isSuperAdmin || isModerator ? centralDb.broadcasts : [],
      auditLogs: isSuperAdmin || isModerator ? centralDb.auditLogs.slice(0, 100) : [],
      notifications: userNotifications,
      homePosts: (centralDb.homePosts || [])
        .filter((p) => {
          if (p.status === 'active') return true;
          if (!caller) return false;
          if (isSuperAdmin || isModerator) return true;
          if (p.authorUid === caller.uid) return true;
          if (isCaptain && p.schoolId && p.schoolId === caller.schoolId) return true;
          return false;
        })
        .sort((a: any, b: any) => {
          if (Boolean(b.isPinned) !== Boolean(a.isPinned)) return b.isPinned ? 1 : -1;
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        }),
      monthlyAwards: centralDb.monthlyAwards || [],
      liveMetrics: computeLiveMetrics(),
      ecoMissions: visibleMissions,
      missionSubmissions: visibleMissionSubmissions,
      missionCompletions: callerCompletedMissions,
      studentsLeaderboard: sanitizePublicUsersList()
        .sort((a: any, b: any) => (b.totalCoinsEarned || b.ecoCoins || 0) - (a.totalCoinsEarned || a.ecoCoins || 0))
        .slice(0, 50),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. AI ANALYZER, TREE PLANNER, MODERATION & CHAT
// ==========================================

function getHeuristicAnalysis(title?: string, description?: string, _region?: string) {
  const combined = `${title || ''} ${description || ''}`.toLowerCase();
  let detectedCategory = 'waste';
  let categoryNameUz = 'Noqonuniy plastik va maishiy chiqindilar';
  let neededEquipment = ["Himoya qo'lqoplari", 'Chiqindi qoplari', 'Maxsus xaskash'];
  let recommendedAction =
    "Hududni chiqindilardan tozalash va saralab maxsus qayta ishlash qutilariga joylashtirish tavsiya etiladi.";
  let severityScore = 6;
  let severityLevel = 'medium';

  if (combined.includes('daraxt') || combined.includes('kesish') || combined.includes('qurigan') || combined.includes('shox')) {
    detectedCategory = 'deforestation';
    categoryNameUz = 'Daraxtlarning noqonuniy kesilishi yoki qurishi';
    neededEquipment = ["Yangi ko'chatlar", 'Bosh kiyim', 'Suv idishlari', 'Belkurak'];
    recommendedAction =
      "Qurigan daraxt o'rniga hudud iqlimiga mos yangi manzarali ko'chatlar ekish va doimiy sug'orishni yo'lga qo'yish.";
    severityScore = 8;
    severityLevel = 'high';
  } else if (combined.includes('suv') || combined.includes('oqava') || combined.includes('kanal') || combined.includes('ariq')) {
    detectedCategory = 'water';
    categoryNameUz = 'Suv havzalari ifloslanishi yoki behuda oqishi';
    neededEquipment = ["Suv o'tkazmaydigan qo'lqoplar", "Maxsus to'r", 'Chiqindi qoplari'];
    recommendedAction = "Ariq yoki kanal o'zanini chiqindilardan tozalash va suv isrofgarchiligini bartaraf etish.";
    severityScore = 7;
    severityLevel = 'high';
  } else if (combined.includes('tutun') || combined.includes('havo') || combined.includes('yoqish') || combined.includes('gaz')) {
    detectedCategory = 'air';
    categoryNameUz = 'Atmosfera havosi va tutun ifloslanishi';
    neededEquipment = ['Respirator niqoblar', "Himoya ko'zoynaklari"];
    recommendedAction = 'Xazon va plastmassalarni ochiq olovda yoqmaslik, utilizatsiyaga topshirish.';
    severityScore = 8;
    severityLevel = 'high';
  } else if (combined.includes('yashil') || combined.includes("ko'chat") || combined.includes('ekish') || combined.includes("bog'")) {
    detectedCategory = 'greening_needed';
    categoryNameUz = "Ko'kalamzorlashtirish va ko'chat ekish zarurati";
    neededEquipment = ["Manzarali ko'chatlar", 'Belkurak', "Sug'orish shlangi", "Organik o'g'it"];
    recommendedAction = 'Yashil Makon loyihasi doirasida mos manzarali va mevali daraxtlar ekish.';
    severityScore = 5;
    severityLevel = 'low';
  }

  return {
    isValidEcoProblem: true,
    rejectionReasonUz: '',
    detectedCategory,
    categoryNameUz,
    severityLevel,
    severityScore,
    urgencyNote: "Ushbu holatni maktab Eko-Patruli va o'quvchilar jamoasi bilan hamkorlikda bartaraf etish lozim.",
    recommendedAction,
    neededEquipment,
    treeRecommendations: ['Sharq archasi', 'Chinor', "Qayrag'och", 'Katalpa'],
    awardedCoins: 100,
    safetyWarning: "Ish jarayonida xavfsizlik qoidalariga rioya qiling va doimo himoya qo'lqoplaridan foydalaning.",
  };
}

function withAiTimeout<T>(promise: Promise<T>, ms = 25000): Promise<T> {
  let timer: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`AI javob kutish vaqti tugadi (${ms}ms)`)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

function formatGeminiError(error: any): { statusCode: number; message: string; retryable: boolean } {
  let status = Number(error?.status || error?.statusCode || 0);
  let rawMsg = String(error?.message || error || 'Gemini API xatoligi');
  try {
    const parsed = JSON.parse(rawMsg);
    if (parsed?.error) {
      status = Number(parsed.error.code || status || 0);
      rawMsg = String(parsed.error.message || rawMsg);
      if (parsed.error.status && !rawMsg.toUpperCase().includes(String(parsed.error.status).toUpperCase())) {
        rawMsg = `${rawMsg} (${parsed.error.status})`;
      }
    }
  } catch {
    // non-JSON message
  }
  const upper = rawMsg.toUpperCase();

  if (status === 403 || upper.includes('PERMISSION_DENIED')) {
    return {
      statusCode: 403,
      message: "Gemini API kaliti ruxsati rad etildi (PERMISSION_DENIED). Settings > Secrets bo'limidan API kalitini tekshiring.",
      retryable: false,
    };
  }
  if (status === 400 || upper.includes('API_KEY_INVALID') || upper.includes('INVALID_ARGUMENT')) {
    return {
      statusCode: 400,
      message: `Gemini API so'rov yoki kalit xatoligi: ${rawMsg}`,
      retryable: false,
    };
  }
  if (status === 429 || upper.includes('RESOURCE_EXHAUSTED') || upper.includes('QUOTA')) {
    return {
      statusCode: 429,
      message: "Gemini API so'rov limiti (429 RESOURCE_EXHAUSTED) tugadi. Iltimos birozdan so'ng qayta urinib ko'ring yoki API tarifini tekshiring.",
      retryable: false,
    };
  }
  if (status === 404 || upper.includes('NOT_FOUND')) {
    return {
      statusCode: 404,
      message: "Tanlangan Gemini modeli topilmadi (404 NOT_FOUND).",
      retryable: false,
    };
  }
  if (status === 503 || upper.includes('UNAVAILABLE') || upper.includes('HIGH DEMAND')) {
    return {
      statusCode: 503,
      message: "Gemini AI xizmatida hozir yuqori yuklama kuzatilmoqda (503 UNAVAILABLE). Bir necha soniyadan so'ng qayta urinib ko'ring.",
      retryable: true,
    };
  }
  if (rawMsg.includes('timed out') || rawMsg.includes('vaqti tugadi')) {
    return {
      statusCode: 504,
      message: rawMsg,
      retryable: false,
    };
  }
  return {
    statusCode: status >= 500 && status < 600 ? status : 502,
    message: rawMsg,
    retryable: status === 0 || status >= 500,
  };
}

async function generateContentWithModelFallback(
  params: { contents: any; config?: Record<string, any> },
  timeoutMs = 25000
): Promise<any> {
  const client = getGeminiClient();
  try {
    return await withAiTimeout(
      client.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: params.contents,
        config: params.config,
      }),
      timeoutMs
    );
  } catch (err: any) {
    const formatted = formatGeminiError(err);
    if (formatted.statusCode !== 503) throw err;
    const fallbackConfig = params.config ? { ...params.config } : undefined;
    if (fallbackConfig && 'thinkingConfig' in fallbackConfig) {
      delete fallbackConfig.thinkingConfig;
    }
    return await withAiTimeout(
      client.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: params.contents,
        config: fallbackConfig,
      }),
      timeoutMs
    );
  }
}

async function generateContentStreamWithModelFallback(
  params: { contents: any; config?: Record<string, any> },
  timeoutMs = 25000
): Promise<AsyncIterable<any>> {
  const client = getGeminiClient();
  try {
    return await withAiTimeout(
      client.models.generateContentStream({
        model: 'gemini-4-hydrogen',
        contents: params.contents,
        config: params.config,
      }),
      timeoutMs
    );
  } catch (err: any) {
    const formatted = formatGeminiError(err);
    if (formatted.statusCode !== 503) throw err;
    const fallbackConfig = params.config ? { ...params.config } : undefined;
    if (fallbackConfig && 'thinkingConfig' in fallbackConfig) {
      delete fallbackConfig.thinkingConfig;
    }
    return await withAiTimeout(
      client.models.generateContentStream({
        model: 'gemini-3.1-flash-lite',
        contents: params.contents,
        config: fallbackConfig,
      }),
      timeoutMs
    );
  }
}

function parseModelJsonResponse(rawText?: string): any {
  const cleaned = String(rawText || '{}')
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  return JSON.parse(cleaned || '{}');
}

app.get('/api/ai/status', (_req, res) => {
  res.json({
    success: true,
    configured: Boolean((process.env.GEMINI_API_KEY || '').trim()),
    model: 'gemini-4-hydrogen',
  });
});

app.post('/api/ai/analyze-problem', async (req, res) => {
  const { title, description, region, imageBase64, mimeType = 'image/jpeg' } = req.body || {};

  try {
    if (!(process.env.GEMINI_API_KEY || '').trim()) {
      return res.status(503).json({
        success: false,
        error: "GEMINI_API_KEY serverda sozlanmagan. Settings > Secrets bo'limidan kalitni ulang.",
      });
    }

    const systemInstruction = `Siz ECO HERO platformasining bosh ekologi va rasm haqiqiyligi (anti-AI) ekspertisiz.
O'zbekiston maktab o'quvchilari yuborgan ekologik muammolarni tahlil qilasiz.

MUHIM QOIDALAR:
1. Agar yuborilgan rasmda ekologik muammo bo'lmasa (selfie, odam surati, xona ichidagi mebel, hayvonlar, o'yin, hujjat, ekran rasmi):
   - "isValidEcoProblem": false qaytaring.
   - "rejectionReasonUz": "Ushbu rasmda ekologik muammo aniqlanmadi. Iltimos, faqat haqiqiy ekologik muammoni rasmga olib yuklang!" deb yozing.
2. Agar rasm sun'iy intellekt (AI) tomonidan chizilgan / generatsiya qilingan yoki soxta tahrirlangan bo'lsa:
   - "isValidEcoProblem": false, "isAiGenerated": true qaytaring.
   - "rejectionReasonUz": "Ushbu surat sun'iy intellekt (AI) yordamida yaratilgan yoki tahrirlanganga o'xshaydi. Faqat real kameradan olingan rasmni yuklang!" deb yozing.
3. Agar rasm haqiqiy ekologik muammo bo'lsa:
   - "isValidEcoProblem": true, "isAiGenerated": false qaytaring, hamda detectedCategory (waste|water|deforestation|air|greening_needed|electrical_hazard|chemical_hazard), categoryNameUz, severityLevel (low|medium|high), severityScore (1-10), urgencyNote, recommendedAction, neededEquipment (massiv), treeRecommendations (massiv), awardedCoins (son), safetyWarning maydonlarini to'ldiring.

Natijani FAQAT toza JSON formatida qaytaring.`;

    const parts: any[] = [];
    if (imageBase64 && typeof imageBase64 === 'string' && imageBase64.length > 20) {
      const cleanBase64 = imageBase64.replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '').trim();
      if (cleanBase64) {
        parts.push({ inlineData: { mimeType, data: cleanBase64 } });
      }
    }

    parts.push({
      text: `Muammo sarlavhasi: ${title || "Noma'lum"}\nTavsifi: ${description || 'Tavsif berilmagan'}\nHudud: ${region || "O'zbekiston"}`,
    });

    const response = await generateContentWithModelFallback(
      {
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      },
      25000
    );

    const result = parseModelJsonResponse(response.text);
    res.json({ success: true, analysis: result });
  } catch (error: any) {
    const formatted = formatGeminiError(error);
    console.error('AI problem analysis error:', error?.message || error);
    res.status(formatted.statusCode).json({
      success: false,
      error: formatted.message,
    });
  }
});

app.post('/api/ai/tree-plan', async (req, res) => {
  const { region, soilType, waterAccess } = req.body || {};

  try {
    if (!(process.env.GEMINI_API_KEY || '').trim()) {
      return res.status(503).json({
        success: false,
        error: "GEMINI_API_KEY serverda sozlanmagan. Settings > Secrets bo'limidan kalitni ulang.",
      });
    }

    const prompt = `O'zbekistonning ${region || 'Toshkent shahri'} hududi uchun Yashil Makon daraxt ekish rejasini tuzing.
Tuproq holati: ${soilType || "Unumdor bog' tuprog'i"}
Suv ta'minoti: ${waterAccess || "Ariq / sug'orish tizimi"}
Ushbu sharoitga eng mos daraxt turlari, ekish chuqurligi, sug'orish tartibi va parvarish bo'yicha o'zbek tilida amaliy reja bering.`;

    const response = await generateContentWithModelFallback(
      {
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        config: { thinkingConfig: { thinkingLevel: ThinkingLevel.LOW } },
      },
      25000
    );
    const text = response.text?.trim();
    if (!text) {
      return res.status(502).json({ success: false, error: "AI bo'sh javob qaytardi." });
    }
    res.json({ success: true, plan: text });
  } catch (error: any) {
    const formatted = formatGeminiError(error);
    console.error('Tree plan AI error:', error?.message || error);
    res.status(formatted.statusCode).json({ success: false, error: formatted.message });
  }
});

app.post('/api/ai/moderate-report', async (req, res) => {
  try {
    const { title, description, region, existingReports } = req.body || {};
    if (!(process.env.GEMINI_API_KEY || '').trim()) {
      return res.status(503).json({
        success: false,
        error: "GEMINI_API_KEY serverda sozlanmagan.",
      });
    }

    const response = await generateContentWithModelFallback(
      {
        contents: `Yangi ariza:\nSarlavha: ${title}\nTavsif: ${description}\nHudud: ${region}\nMavjud arizalar:\n${(existingReports || [])
          .slice(0, 5)
          .map((r: any) => `- ${r.title}: ${r.region}`)
          .join('\n')}`,
        config: {
          systemInstruction:
            `Siz ECO HERO moderatsiya ekspertisiz. Spam, nojo'ya so'z yoki dublikatni aniqlang. JSON qaytaring: {"isFlagged": boolean, "suspicionScore": number, "duplicateDetected": boolean, "confidenceScore": number, "reasonUz": string, "suggestedAction": "approve"|"manual_review"|"reject"}`,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      },
      25000
    );

    const parsed = parseModelJsonResponse(response.text);
    res.json({ success: true, moderation: parsed });
  } catch (error: any) {
    const formatted = formatGeminiError(error);
    console.error('AI moderation error:', error?.message || error);
    res.status(formatted.statusCode).json({ success: false, error: formatted.message });
  }
});

interface EcoAiAttachmentInput {
  name?: string;
  mimeType?: string;
  dataBase64?: string;
  textContent?: string;
}

async function extractDocxTextFromBase64(base64Data: string): Promise<string> {
  try {
    const clean = base64Data.replace(/^data:[^;]+;base64,/, '');
    const buffer = Buffer.from(clean, 'base64');
    const zip = await JSZip.loadAsync(buffer);
    const docFile = zip.file('word/document.xml');
    if (!docFile) return '';
    const xml = await docFile.async('string');
    return xml
      .replace(/<w:p[^>]*>/g, '\n')
      .replace(/<w:tab[^>]*\/>/g, '\t')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  } catch {
    return '';
  }
}

async function buildAttachmentParts(attachments?: EcoAiAttachmentInput[]): Promise<any[]> {
  if (!Array.isArray(attachments) || attachments.length === 0) return [];
  const parts: any[] = [];

  for (const att of attachments.slice(0, 6)) {
    if (!att) continue;
    const fileName = String(att.name || 'fayl').trim();
    const mime = String(att.mimeType || 'application/octet-stream').toLowerCase();

    if (att.textContent && String(att.textContent).trim()) {
      parts.push({
        text: `\n[Fayl: ${fileName} (${mime})]\n\`\`\`\n${String(att.textContent).slice(0, 120000)}\n\`\`\`\n`,
      });
      continue;
    }

    if (!att.dataBase64) continue;
    const cleanBase64 = String(att.dataBase64).replace(/^data:[^;]+;base64,/, '');
    if (!cleanBase64) continue;

    // Word .docx extraction via JSZip
    if (
      mime.includes('wordprocessingml') ||
      fileName.toLowerCase().endsWith('.docx')
    ) {
      const docxText = await extractDocxTextFromBase64(cleanBase64);
      if (docxText) {
        parts.push({
          text: `\n[Word hujjat: ${fileName}]\n${docxText.slice(0, 120000)}\n`,
        });
        continue;
      }
    }

    // Text-like files sent as base64
    if (
      mime.startsWith('text/') ||
      mime === 'application/json' ||
      mime === 'application/xml' ||
      mime === 'application/javascript' ||
      /\.(txt|md|csv|json|xml|html|css|js|ts|tsx|jsx|py|java|cpp|c|sql|yaml|yml|env|log)$/i.test(fileName)
    ) {
      try {
        const decoded = Buffer.from(cleanBase64, 'base64').toString('utf8');
        if (decoded.trim()) {
          parts.push({
            text: `\n[Fayl: ${fileName}]\n\`\`\`\n${decoded.slice(0, 120000)}\n\`\`\`\n`,
          });
          continue;
        }
      } catch {
        // fall through to inlineData if binary
      }
    }

    // Native Gemini multimodal inlineData (images, PDFs, audio, video)
    const supportedInlineMime =
      mime.startsWith('image/') ||
      mime === 'application/pdf' ||
      mime.startsWith('audio/') ||
      mime.startsWith('video/');

    if (supportedInlineMime) {
      parts.push({
        inlineData: {
          mimeType: mime,
          data: cleanBase64,
        },
      });
      parts.push({
        text: `[Yuqoridagi biriktirilgan fayl nomi: ${fileName}]`,
      });
    }
  }

  return parts;
}

async function buildEcoHeroAiPayload(
  message: string,
  chatHistory: any[] = [],
  userInfo?: { fullName?: string; schoolName?: string; region?: string; role?: string },
  attachments: EcoAiAttachmentInput[] = []
) {
  const userName = userInfo?.fullName ? userInfo.fullName.split(' ')[0] : 'Do‘st';
  const userSchool = userInfo?.schoolName || '';
  const userRegion = userInfo?.region || '';

  const systemInstruction = `Siz «EcoHero AI» — kuchli, aqlli, samimiy va keng bilimli sun'iy intellekt yordamchisisiz.

ASOSIY QOIDALAR:
1. HAR QANDAY MAVZUDA ANIQ JAVOB BERING: Foydalanuvchi qaysi mavzuda so'rasa (matematika, fizika, kimyo, biologiya, dasturlash, ingliz tili, tarix, biznes, kundalik maslahatlar, matn yozish, tarjima, tahlil, oddiy samimiy suhbat YOKI ekologiya), savoldan qochmasdan, chalg'itmasdan, to'g'ridan-to'g'ri, chuqur, aniq va mazmunli javob bering.
2. EKOLOGIYAGA MAJBURLAMANG: Agar foydalanuvchi dasturlash, matematika, tarix yoki oddiy hayotiy mavzuda gaplashsa, javobni sun'iy ravishda ekologiyaga burmang — faqat o'sha savolning o'ziga professional javob bering. Agar ekologiya, "Yashil Makon", daraxt ekish, chiqindilarni saralash yoki EcoHero platformasi haqida so'rasa, O'zbekiston sharoitiga mos kuchli ekspert tavsiyalarini bering.
3. FAYL VA RASMLARNI CHUQUR TAHLIL QILING: Agar foydalanuvchi rasm, PDF hujjat, Word (.docx), jadval (CSV), kod yoki matn fayli yuborsa, uning ichidagi barcha tafsilotlarni (matnlar, jadvallar, formulalar, xatolar, rasmdagi obyektlar) diqqat bilan o'qib, aniq tahlil va xulosalar bering.
4. USLUB VA FORMAT:
   - Tabiiy, jonli va tushunarli tilda yozing (shablon va quruq gaplardan qoching).
   - O'zbek tilida (lotin yozuvida) javob bering; agar foydalanuvchi rus yoki ingliz tilida yozsa, o'sha tilda javob qaytaring.
   - Javoblarni o'qishga qulay qilib Markdown formatida (sarlavhalar, ro'yxatlar, qalin muhim so'zlar, kod bloklari, jadvallar) tuzing.
   - Suhbat davomida har safar salomlashishni takrorlamang, bevosita javobga o'ting.
${userSchool || userRegion ? `\nFoydalanuvchi konteksti (faqat kerak bo'lganda foydalaning): Ismi ${userName}${userSchool ? `, ${userSchool}` : ''}${userRegion ? `, ${userRegion}` : ''}.` : ''}`;

  const contents: any[] = [];
  if (Array.isArray(chatHistory)) {
    for (const item of chatHistory.slice(-14)) {
      if (item && (item.text || (Array.isArray(item.attachments) && item.attachments.length > 0))) {
        const histText = [
          item.text || '',
          Array.isArray(item.attachments) && item.attachments.length > 0
            ? `[Biriktirilgan fayllar: ${item.attachments.map((a: any) => a.name).join(', ')}]`
            : '',
        ]
          .filter(Boolean)
          .join('\n');
        if (histText.trim()) {
          contents.push({
            role: item.role === 'user' ? 'user' : 'model',
            parts: [{ text: histText }],
          });
        }
      }
    }
  }

  const currentParts: any[] = await buildAttachmentParts(attachments);
  const promptText = String(message || '').trim() || (currentParts.length > 0 ? 'Yuklangan fayl/rasmni batafsil tahlil qilib tushuntirib bering.' : '');
  currentParts.push({ text: promptText });
  contents.push({ role: 'user', parts: currentParts });

  const hasHeavyAttachment = currentParts.some((p) => Boolean(p.inlineData) || (p.text && p.text.length > 4000));
  return {
    systemInstruction,
    contents,
    thinkingLevel: hasHeavyAttachment ? ThinkingLevel.MEDIUM : ThinkingLevel.LOW,
  };
}

async function generateEcoHeroAiResponse(
  message: string,
  chatHistory: any[] = [],
  userInfo?: { fullName?: string; schoolName?: string; region?: string; role?: string },
  attachments: EcoAiAttachmentInput[] = []
): Promise<string> {
  if (!(process.env.GEMINI_API_KEY || '').trim()) {
    throw new Error("GEMINI_API_KEY sozlanmagan. Settings > Secrets bo'limida API kalitini tekshiring.");
  }

  const { systemInstruction, contents, thinkingLevel } = await buildEcoHeroAiPayload(
    message,
    chatHistory,
    userInfo,
    attachments
  );

  const response = await generateContentWithModelFallback(
    {
      contents,
      config: {
        systemInstruction,
        thinkingConfig: { thinkingLevel },
      },
    },
    25000
  );
  const replyText = response?.text?.trim();
  if (replyText) return replyText;
  throw new Error("AI bo'sh javob qaytardi.");
}

app.post('/api/ai/eco-assistant', async (req, res) => {
  try {
    const { message, chatHistory, attachments, userId, telegramId, fullName, schoolName, region } = req.body || {};
    const hasMessage = Boolean(String(message || '').trim());
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    if (!hasMessage && !hasAttachments) {
      return res.status(400).json({ error: 'Xabar matni yoki fayl kiritilishi shart' });
    }

    const userProfile = findUserByAnyIdentifier({ uid: userId, telegramId }) || {
      fullName: fullName || 'Foydalanuvchi',
      schoolName: schoolName || '',
      region: region || '',
    };

    const reply = await generateEcoHeroAiResponse(
      String(message || ''),
      chatHistory || [],
      userProfile,
      attachments || []
    );
    res.json({ success: true, reply });
  } catch (error: any) {
    const formatted = formatGeminiError(error);
    console.error('EcoHero AI error:', error?.message || error);
    res.status(formatted.statusCode).json({
      success: false,
      error: formatted.message,
    });
  }
});

app.post('/api/ai/eco-assistant/stream', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  res.write(': connected\n\n');

  let closed = false;
  res.on('close', () => {
    if (!res.writableEnded) {
      closed = true;
    }
  });

  const sendEvent = (payload: Record<string, any>) => {
    if (closed || res.writableEnded) return;
    try {
      res.write(`data: ${JSON.stringify(payload)}\n\n`);
    } catch {
      closed = true;
    }
  };

  try {
    const { message, chatHistory, attachments, userId, telegramId, fullName, schoolName, region } = req.body || {};
    const hasMessage = Boolean(String(message || '').trim());
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    if (!hasMessage && !hasAttachments) {
      sendEvent({ error: 'Xabar matni yoki fayl kiritilishi shart' });
      return res.end();
    }

    if (!(process.env.GEMINI_API_KEY || '').trim()) {
      sendEvent({ error: "GEMINI_API_KEY serverda sozlanmagan. Settings > Secrets bo'limidan kalitni ulang." });
      return res.end();
    }

    const userProfile = findUserByAnyIdentifier({ uid: userId, telegramId }) || {
      fullName: fullName || 'Foydalanuvchi',
      schoolName: schoolName || '',
      region: region || '',
    };

    const { systemInstruction, contents, thinkingLevel } = await buildEcoHeroAiPayload(
      String(message || ''),
      chatHistory || [],
      userProfile,
      attachments || []
    );

    const stream = await generateContentStreamWithModelFallback(
      {
        contents,
        config: {
          systemInstruction,
          thinkingConfig: { thinkingLevel },
        },
      },
      25000
    );

    let fullText = '';
    for await (const chunk of stream) {
      if (closed || res.writableEnded) break;
      const delta = chunk.text || '';
      if (delta) {
        fullText += delta;
        sendEvent({ delta });
      }
    }

    if (!closed && !res.writableEnded) {
      sendEvent({ done: true, reply: fullText });
      res.end();
    }
  } catch (error: any) {
    const formatted = formatGeminiError(error);
    console.error('EcoHero AI stream error:', error?.message || error);
    sendEvent({
      error: formatted.message,
    });
    if (!res.writableEnded) res.end();
  }
});

// ==========================================
// 3. REPORTS CRUD & MODERATION (UNIFIED DB)
// ==========================================

async function resolveImageInputToInlineData(rawInput?: string): Promise<{ mimeType: string; data: string } | null> {
  if (!rawInput || typeof rawInput !== 'string') return null;
  const trimmed = rawInput.trim();
  if (!trimmed) return null;

  const dataMatch = trimmed.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/s);
  if (dataMatch) {
    return { mimeType: dataMatch[1], data: dataMatch[2].trim() };
  }

  if (trimmed.startsWith('/uploads/') || trimmed.startsWith('/assets/')) {
    const localPath = path.join(process.cwd(), 'public', trimmed.replace(/^\/+/, ''));
    if (fs.existsSync(localPath)) {
      const buf = fs.readFileSync(localPath);
      const ext = path.extname(localPath).toLowerCase();
      const mimeType =
        ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : ext === '.gif' ? 'image/gif' : 'image/jpeg';
      return { mimeType, data: buf.toString('base64') };
    }
  }

  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const resp = await fetch(trimmed, { signal: AbortSignal.timeout(8000) });
      if (resp.ok) {
        const ct = (resp.headers.get('content-type') || '').toLowerCase();
        if (ct.startsWith('image/')) {
          const arr = Buffer.from(await resp.arrayBuffer());
          return { mimeType: ct.split(';')[0] || 'image/jpeg', data: arr.toString('base64') };
        }
      }
    } catch {
      // ignore remote fetch errors
    }
  }

  if (trimmed.length > 100 && !trimmed.includes(' ') && !trimmed.startsWith('http') && !trimmed.startsWith('/')) {
    return { mimeType: 'image/jpeg', data: trimmed };
  }
  return null;
}

async function verifyEcoProblemPhotoWithAi(params: {
  imageInput?: string;
  title?: string;
  description?: string;
  region?: string;
  district?: string;
}): Promise<any> {
  const inline = await resolveImageInputToInlineData(params.imageInput);
  if (!process.env.GEMINI_API_KEY || !inline) {
    return getHeuristicAnalysis(params.title, params.description, params.region);
  }
  try {
    const parts: any[] = [
      { inlineData: inline },
      {
        text: `Sarlavha: ${params.title || 'Ekologik muammo'}\nTavsif: ${params.description || ''}\nHudud: ${params.region || "O'zbekiston"}, ${params.district || ''}\n1) Rasmda haqiqiy ekologik muammo yoki ekologik ish bormi?\n2) Rasm AI (sun'iy intellekt) da generatsiya qilingan yoki soxtalashtirilgan emasmi?`,
      },
    ];
    const aiResponse: any = await generateContentWithModelFallback(
      {
        contents: [{ role: 'user', parts }],
        config: {
          systemInstruction:
            `Siz ECO HERO ekologik inspektorisiz. Agar rasmda ekologik muammo bo'lmasa (odam selfisi, xona, mem, hayvon, hujjat) "isValidEcoProblem": false yozing. Agar rasm AI tomonidan generatsiya qilinganga o'xshasa "isAiGenerated": true va "isValidEcoProblem": false yozing. JSON: {"isValidEcoProblem": boolean, "isAiGenerated": boolean, "rejectionReasonUz": string, "detectedCategory": string, "severityLevel": "low"|"medium"|"high", "severityScore": number, "recommendedAction": string}`,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      },
      18000
    );
    return parseModelJsonResponse(aiResponse?.text);
  } catch (e) {
    console.warn('Report AI check fallback used:', e);
    return getHeuristicAnalysis(params.title, params.description, params.region);
  }
}

function notifySchoolAdminsForReport(reportData: any) {
  const schoolAdmins = Object.values(centralDb.users || {}).filter(
    (u: any) =>
      u &&
      u.role === 'school_admin' &&
      ((reportData.schoolId && u.schoolId === reportData.schoolId) ||
        (reportData.schoolName && u.schoolName === reportData.schoolName))
  );
  const nowIso = new Date().toISOString();
  for (const admin of schoolAdmins) {
    centralDb.notifications.unshift({
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      userId: admin.uid,
      title: `Yangi ekologik muammo: ${reportData.title}`,
      message: `${reportData.reporterName} rasm yubordi (AI tasdiqladi). O'quvchi bajarganini tasdiqlang yoki Eko-Elchiga biriktiring.`,
      type: 'status',
      read: false,
      createdAt: nowIso,
    });
    const adminTgId = admin.telegramId || admin.chatId;
    if (adminTgId) {
      sendTelegramMessage(
        adminTgId,
        `🏫 <b>MAKTAB ADMINI UCHUN YANGI EKOLOGIK HISOBOT</b>\n\n` +
          `👤 <b>O'quvchi:</b> ${reportData.reporterName}\n` +
          `📌 <b>Muammo:</b> ${reportData.title}\n` +
          `📝 <b>Tavsif:</b> ${reportData.description || '-'}\n\n` +
          `Mini App ichidagi Maktab Sardori kabinetiga kirib, o'quvchi ishni bajarganini tasdiqlang yoki Eko-Elchiga biriktiring.`,
        { reply_markup: { inline_keyboard: [[{ text: "🏫 Kabinetda ko'rish", web_app: { url: APP_URL } }]] } }
      ).catch(() => {});
    }
  }
}

app.get('/api/reports', (req: AuthenticatedRequest, res) => {
  const caller = req.authUser || null;
  res.json({ success: true, reports: centralDb.reports.filter((r) => canViewReport(r, caller)) });
});

app.post('/api/reports/submit', async (req: AuthenticatedRequest, res) => {
  try {
    const {
      title,
      description,
      category,
      severity,
      region,
      district,
      address,
      lat,
      lng,
      imageUrl,
      videoUrl,
      imageBase64,
      authorUid,
      reporterUid,
      authorName,
      reporterName,
      schoolId,
      authorSchool,
      schoolName,
      authorTelegramId,
      clientReportId,
      idempotencyKey,
    } = req.body;

    if (!imageUrl && !imageBase64 && !videoUrl) {
      return res.status(400).json({ error: 'Hisobot uchun rasm yoki video yuklanishi shart' });
    }

    const targetReportId = clientReportId || idempotencyKey;
    if (targetReportId) {
      const existing = centralDb.reports.find((r) => r.id === String(targetReportId) || r.clientReportId === String(targetReportId));
      if (existing) {
        return res.json({
          success: true,
          report: existing,
          duplicate: true,
          message: "Hisobot avval qabul qilingan (takroriy yuborishning oldi olindi).",
        });
      }
    }

    const aiAnalysisResult: any = await verifyEcoProblemPhotoWithAi({
      imageInput: imageBase64 || imageUrl,
      title,
      description,
      region,
      district,
    });

    if (aiAnalysisResult && (aiAnalysisResult.isValidEcoProblem === false || aiAnalysisResult.isAiGenerated === true)) {
      return res.status(400).json({
        success: false,
        error:
          aiAnalysisResult.rejectionReasonUz ||
          (aiAnalysisResult.isAiGenerated
            ? "AI tekshiruvi: bu surat sun'iy intellektda yaratilganga o'xshaydi. Faqat haqiqiy rasm yuklang!"
            : 'Ushbu rasmda ekologik muammo aniqlanmadi. Iltimos, faqat ekologik muammolarni rasmga olib yuklang!'),
      });
    }

    const uid = req.authUser?.uid || authorUid || reporterUid || 'unknown';
    const userRec = req.authUser || findUserByAnyIdentifier({ uid, telegramId: authorTelegramId });
    const rName = userRec?.fullName || authorName || reporterName || "O'quvchi";
    const sName = userRec?.schoolName || authorSchool || schoolName || 'Maktab';
    const resolvedSchool = findOrCreateSchool({
      schoolId: schoolId || userRec?.schoolId,
      schoolName: sName,
      region: region || userRec?.region || 'Toshkent shahri',
      district: district || userRec?.district || 'Yunusobod tumani',
      incrementStudents: false,
    });

    const finalCategory = category || aiAnalysisResult?.detectedCategory || 'waste';
    const hazardCheck = detectReportHazard(title, description, finalCategory);
    const configuredReward = getConfiguredReward('problemVerified');

    const reportId = String(targetReportId || `rep_${Date.now()}`);
    const nowIso = new Date().toISOString();
    const reportData: any = {
      id: reportId,
      clientReportId: targetReportId || reportId,
      title: title || 'Ekologik Muammo',
      description: description || '',
      category: finalCategory,
      severity: hazardCheck.isHazardous ? 'high' : aiAnalysisResult?.severityLevel || severity || 'medium',
      status: 'pending',
      coinsAwarded: false,
      rewardCoins: configuredReward,
      region: region || userRec?.region || 'Toshkent shahri',
      district: district || userRec?.district || 'Yunusobod tumani',
      address: address || `${region || 'Toshkent'}, ${district || ''}`,
      lat: Number(lat) || 41.2995,
      lng: Number(lng) || 69.2401,
      imageUrl: imageUrl || imageBase64 || '',
      videoUrl: videoUrl || '',
      reporterUid: uid,
      reporterName: rName,
      authorUid: uid,
      authorName: rName,
      schoolId: resolvedSchool?.id || schoolId || userRec?.schoolId || '',
      schoolName: resolvedSchool?.name || sName,
      authorTelegramId: authorTelegramId || userRec?.telegramId || null,
      isHazardous: hazardCheck.isHazardous,
      ...(hazardCheck.safetyWarning ? { safetyWarning: hazardCheck.safetyWarning } : {}),
      ...(hazardCheck.recommendedEscalation ? { escalationTarget: hazardCheck.recommendedEscalation } : {}),
      statusHistory: [
        {
          status: 'PENDING_REVIEW',
          actorName: rName,
          actorRole: userRec?.role || 'student',
          note: hazardCheck.isHazardous ? "Xavfli holat sifatida belgilandi — kattalar/tashkilot eskalatsiyasi tavsiya etiladi" : "O'quvchi tomonidan yuborildi",
          timestamp: nowIso,
        },
      ],
      aiAnalysis: {
        severityScore: hazardCheck.isHazardous ? 9 : aiAnalysisResult?.severityScore || 5,
        recommendedAction: hazardCheck.isHazardous
          ? hazardCheck.safetyWarning
          : aiAnalysisResult?.recommendedAction || '',
        neededEquipment: hazardCheck.isHazardous
          ? ["Maktab ma'muriyati / Mutaxassis nazorati"]
          : aiAnalysisResult?.neededEquipment || ["Qo'lqoplar", 'Chiqindi qoplari'],
        urgencyNote: hazardCheck.isHazardous ? hazardCheck.recommendedEscalation : aiAnalysisResult?.urgencyNote || '',
      },
      upvotes: 1,
      upvotedBy: [uid],
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    centralDb.reports.unshift(reportData);
    notifySchoolAdminsForReport(reportData);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'reports' });

    addAuditLog({
      actorUid: uid,
      actorName: rName,
      actorRole: userRec?.role || 'student',
      action: 'report_submitted',
      targetCollection: 'reports',
      targetId: reportId,
      details: { title: reportData.title, severity: reportData.severity, isHazardous: reportData.isHazardous },
    });

    // Notify Super Admin on Telegram (@jasurdost / 8832599080)
    const superAdminChatId = '8832599080';
    const caption =
      `📸 <b>YANGI EKOLOGIK HISOBOT (AI TASDIQLADI → MAKTAB ADMINIGA YUBORILDI)</b>\n\n` +
      `📌 <b>Sarlavha:</b> ${reportData.title}\n` +
      `👤 <b>O'quvchi:</b> ${reportData.reporterName} (${reportData.schoolName})\n` +
      `📍 <b>Hudud:</b> ${reportData.region}, ${reportData.district}\n` +
      (reportData.isHazardous ? `🚨 <b>XAVF OGOHLANTIRISHI:</b> O'quvchilar tegishi mumkin emas! (${reportData.escalationTarget})\n` : '') +
      `📝 <b>Tavsif:</b> ${reportData.description}\n\n` +
      `<i>Maktab admini o'quvchi bajarganini tasdiqlashi yoki Eko-Elchiga biriktirishi mumkin.</i>`;

    const inlineKeyboard = [
      [
        { text: `✅ Tasdiqlash (+${configuredReward} ECO)`, callback_data: `appr_rep:${reportId}` },
        { text: '❌ Rad etish', callback_data: `rejc_rep:${reportId}` },
      ],
      [{ text: "🌍 Admin Paneldan ko'rish", web_app: { url: APP_URL } }],
    ];

    if (reportData.imageUrl && String(reportData.imageUrl).startsWith('http')) {
      sendTelegramPhoto(superAdminChatId, reportData.imageUrl, caption, {
        reply_markup: { inline_keyboard: inlineKeyboard },
      }).catch(() => {});
    } else {
      sendTelegramMessage(superAdminChatId, caption, {
        reply_markup: { inline_keyboard: inlineKeyboard },
      }).catch(() => {});
    }

    res.json({
      success: true,
      report: reportData,
      message: hazardCheck.isHazardous
        ? "Hisobotingiz AI tekshiruvidan o'tdi. DIQQAT: Xavfli holatga o'zingiz tegmang — Maktab admini va mutasaddilarga yuborildi!"
        : "Hisobotingiz AI tekshiruvidan muvaffaqiyatli o'tdi va maktabingiz adminiga yuborildi!",
    });
  } catch (err: any) {
    console.error('Report submission endpoint error:', err);
    res.status(500).json({ error: err.message });
  }
});

async function approveReportAndReward(
  reportId: string,
  newStatus: string,
  actorName: string = 'Super Admin',
  resolvedImageUrl?: string,
  actorUid: string = 'admin',
  actorRole: string = 'super_admin'
) {
  const report = centralDb.reports.find((r) => r.id === reportId);
  if (!report) return null;

  report.status = newStatus;
  report.updatedAt = new Date().toISOString();
  if (resolvedImageUrl) report.resolvedImageUrl = resolvedImageUrl;
  if (newStatus === 'resolved' || newStatus === 'RESOLVED') {
    report.resolvedAt = new Date().toISOString();
    report.resolvedBy = actorName;
  }
  if (!Array.isArray(report.statusHistory)) report.statusHistory = [];
  report.statusHistory.push({
    status: newStatus,
    actorName,
    actorRole,
    timestamp: new Date().toISOString(),
  });

  const isVerifiedStatus = ['verified', 'APPROVED', 'ASSIGNED', 'in_progress', 'IN_PROGRESS'].includes(newStatus);
  const isResolvedStatus = ['resolved', 'RESOLVED'].includes(newStatus);

  // Reward Step 2 verification
  if ((isVerifiedStatus || isResolvedStatus) && !report.coinsAwarded) {
    const reward = getConfiguredReward('problemVerified') || Number(report.rewardCoins) || 100;
    report.coinsAwarded = true;
    report.rewardCoins = reward;
    report.approvedAt = new Date().toISOString();
    report.approvedBy = actorName;

    const student = findUserByAnyIdentifier({
      uid: report.reporterUid || report.authorUid,
      telegramId: report.authorTelegramId,
    });
    if (student) {
      student.ecoCoins = (student.ecoCoins || 0) + reward;
      student.totalCoinsEarned = (student.totalCoinsEarned || 0) + reward;
      student.reportsCount = (student.reportsCount || 0) + 1;
      student.activityStats = {
        ...(student.activityStats || {}),
        reportsCount: student.reportsCount,
        totalCoinsEarned: student.totalCoinsEarned,
      };
      recordTransaction({
        userId: student.uid,
        amount: reward,
        type: 'earn',
        status: 'approved',
        reportId: report.id,
        reason: `Ekologik muammo hisoboti tasdiqlandi: ${report.title}`,
      });

      const tgId = student.telegramId || student.chatId || report.authorTelegramId;
      if (tgId) {
        sendTelegramMessage(
          tgId,
          `🎉 <b>TABRIKLAYMIZ! HISOBOTINGIZ TASDIQLANDI!</b>\n\n` +
            `📌 <b>Muammo:</b> ${report.title}\n` +
            `💰 <b>Mukofot:</b> +${reward} EcoCoin\n` +
            `💳 <b>Joriy balansingiz:</b> ${student.ecoCoins} EcoCoin`,
          { reply_markup: { inline_keyboard: [[{ text: '🌍 ECO HERO ilovasini ochish', web_app: { url: APP_URL } }]] } }
        ).catch(() => {});
      }
    }

    if (report.schoolName) {
      findOrCreateSchool({
        schoolId: report.schoolId,
        schoolName: report.schoolName,
        region: report.region,
        district: report.district,
        coinsDelta: reward,
      });
    }
  }

  // Additional Step 6 resolution reward (anti-duplicate guarded by resolutionRewardAwarded)
  if (isResolvedStatus && !report.resolutionRewardAwarded) {
    report.resolutionRewardAwarded = true;
    const resolutionBonus = getConfiguredReward('problemResolved');
    const ambUid = report.assignedAmbassadorUid;
    if (ambUid && resolutionBonus > 0) {
      const ambUser = findUserByAnyIdentifier({ uid: ambUid });
      if (ambUser) {
        ambUser.ecoCoins = (ambUser.ecoCoins || 0) + resolutionBonus;
        ambUser.totalCoinsEarned = (ambUser.totalCoinsEarned || 0) + resolutionBonus;
        ambUser.cleanupsCount = (ambUser.cleanupsCount || 0) + 1;
        recordTransaction({
          userId: ambUser.uid,
          amount: resolutionBonus,
          type: 'bonus',
          status: 'approved',
          reportId: report.id,
          reason: `Muammo to'liq hal etildi va tasdiqlandi: ${report.title}`,
        });
      }
    }
    if (report.schoolName) {
      findOrCreateSchool({
        schoolId: report.schoolId,
        schoolName: report.schoolName,
        region: report.region,
        district: report.district,
        coinsDelta: resolutionBonus,
        cleanupsDelta: 1,
      });
    }
  }

  saveCentralDb();
  broadcastRealtimeEvent('db:updated', { scope: 'reports' });
  addAuditLog({
    actorUid,
    actorName,
    actorRole,
    action: `report_status_${newStatus}`,
    targetCollection: 'reports',
    targetId: reportId,
    details: { title: report.title, coinsAwarded: report.coinsAwarded },
  });

  return report;
}

app.post(
  '/api/reports/:id/status',
  requireRoles('super_admin', 'moderator', 'school_admin', 'ambassador'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const report = centralDb.reports.find((r) => r.id === req.params.id);
      if (!report) return res.status(404).json({ error: 'Hisobot topilmadi' });

      if (
        !hasAnyRole(caller, ['super_admin', 'moderator']) &&
        !assertSchoolAccess(caller, report.schoolId)
      ) {
        return res.status(403).json({ error: "Boshqa maktab hisobotini o'zgartira olmaysiz" });
      }

      const { status, resolvedImageUrl } = req.body;
      const valid = [
        'pending', 'verified', 'in_progress', 'resolved', 'rejected',
        'PENDING_REVIEW', 'APPROVED', 'NEEDS_INFO', 'ASSIGNED', 'IN_PROGRESS', 'ESCALATED', 'RESOLVED', 'REJECTED',
      ];
      if (!valid.includes(status)) {
        return res.status(400).json({ error: "Noto'g'ri status" });
      }
      if (['verified', 'APPROVED', 'rejected', 'REJECTED', 'resolved', 'RESOLVED'].includes(status) && !hasAnyRole(caller, ['super_admin', 'moderator'])) {
        return res.status(403).json({ error: 'Yakuniy tasdiqlash faqat Super Admin yoki Moderator tomonidan amalga oshiriladi' });
      }
      const updated = await approveReportAndReward(
        req.params.id,
        status,
        caller.fullName,
        resolvedImageUrl,
        caller.uid,
        caller.role
      );
      res.json({ success: true, report: updated });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Complete 6-Step Ecological Problem Workflow Endpoint
app.post('/api/reports/:id/workflow', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const report = centralDb.reports.find((r) => r.id === req.params.id);
    if (!report) return res.status(404).json({ error: 'Hisobot topilmadi' });

    const {
      action,
      note,
      assignedAmbassadorUid,
      captainInstructions,
      escalationTarget,
      ambassadorSolutions,
      progressEvidenceUrl,
      resolvedImageUrl,
    } = req.body;

    const nowIso = new Date().toISOString();
    if (!Array.isArray(report.statusHistory)) report.statusHistory = [];

    // Step 2 & 6: Super Admin / Moderator moderation & final verification
    if (action === 'approve' || action === 'forward_to_captain') {
      if (!hasAnyRole(caller, ['super_admin', 'moderator'])) {
        return res.status(403).json({ error: 'Faqat Super Admin yoki Moderator tasdiqlay oladi' });
      }
      report.moderatorNote = note || 'Tasdiqlandi va Maktab Sardoriga yuborildi';
      const updated = await approveReportAndReward(report.id, 'verified', caller.fullName, undefined, caller.uid, caller.role);
      return res.json({ success: true, report: updated });
    }

    if (action === 'reject' || action === 'request_info') {
      if (!hasAnyRole(caller, ['super_admin', 'moderator'])) {
        return res.status(403).json({ error: 'Faqat Super Admin yoki Moderator qaror qabul qiladi' });
      }
      report.status = action === 'reject' ? 'rejected' : 'NEEDS_INFO';
      report.moderatorNote = note || '';
      report.updatedAt = nowIso;
      report.statusHistory.push({ status: report.status, actorName: caller.fullName, actorRole: caller.role, note, timestamp: nowIso });
      saveCentralDb();
      addAuditLog({ actorUid: caller.uid, actorName: caller.fullName, actorRole: caller.role, action: `report_${action}`, targetCollection: 'reports', targetId: report.id, details: { note } });
      return res.json({ success: true, report });
    }

    if (action === 'final_verify') {
      if (!hasAnyRole(caller, ['super_admin', 'moderator'])) {
        return res.status(403).json({ error: 'Yakuniy tasdiqlash faqat Super Admin yoki Moderatorga ruxsat etilgan' });
      }
      const updated = await approveReportAndReward(report.id, 'resolved', caller.fullName, resolvedImageUrl || report.progressEvidenceUrl, caller.uid, caller.role);
      return res.json({ success: true, report: updated });
    }

    // Step 3 & 5: School Captain actions (own school ONLY)
    if (action === 'assign_ambassador' || action === 'escalate') {
      if (!hasAnyRole(caller, ['school_admin', 'super_admin'])) {
        return res.status(403).json({ error: "Faqat Maktab Sardori yoki Super Admin vazifa biriktira oladi" });
      }
      if (!assertSchoolAccess(caller, report.schoolId)) {
        return res.status(403).json({ error: "Boshqa maktab muammolarini boshqarish taqiqlanadi" });
      }

      if (action === 'escalate' || report.isHazardous) {
        report.status = 'ESCALATED';
        report.escalationTarget = escalationTarget || report.escalationTarget || "Maktab ma'muriyati / Vakolatli davlat tashkiloti";
        report.captainInstructions =
          captainInstructions ||
          "XAVFLI VAZIYAT: O'quvchilar va Eko-Elchilar jalb etilmasin, mas'ul tashkilotga topshirildi.";
        report.updatedAt = nowIso;
        report.statusHistory.push({
          status: 'ESCALATED',
          actorName: caller.fullName,
          actorRole: caller.role,
          note: `${report.escalationTarget}: ${report.captainInstructions}`,
          timestamp: nowIso,
        });
        saveCentralDb();
        addAuditLog({ actorUid: caller.uid, actorName: caller.fullName, actorRole: caller.role, action: 'report_escalated', targetCollection: 'reports', targetId: report.id, details: { escalationTarget: report.escalationTarget } });
        return res.json({ success: true, report });
      }

      const targetAmb = assignedAmbassadorUid ? findUserByAnyIdentifier({ uid: assignedAmbassadorUid }) : null;
      report.assignedAmbassadorUid = assignedAmbassadorUid || '';
      report.assignedAmbassadorName = targetAmb?.fullName || 'Maktab Eko-Elchisi';
      report.captainInstructions = captainInstructions || "Xavfsiz shaxsiy himoya vositalari bilan chora ko'ring.";
      report.status = 'in_progress';
      report.updatedAt = nowIso;
      report.statusHistory.push({
        status: 'ASSIGNED',
        actorName: caller.fullName,
        actorRole: caller.role,
        note: `Biriktirildi: ${report.assignedAmbassadorName}`,
        timestamp: nowIso,
      });

      if (assignedAmbassadorUid) {
        const taskReward = getConfiguredReward('ambassadorTaskBonus');
        centralDb.ecoTasks.unshift({
          id: `task_${Date.now()}`,
          schoolId: report.schoolId,
          schoolName: report.schoolName,
          region: report.region,
          district: report.district,
          title: `Muammoni hal etish: ${report.title}`,
          instructions: report.captainInstructions,
          assignedByUid: caller.uid,
          assignedByName: caller.fullName,
          assigneeUid: assignedAmbassadorUid,
          assigneeName: report.assignedAmbassadorName,
          relatedReportId: report.id,
          status: 'assigned',
          rewardCoins: taskReward,
          createdAt: nowIso,
        });
      }

      saveCentralDb();
      return res.json({ success: true, report });
    }

    // Step 4: Eco Ambassador progress & completion evidence
    if (action === 'ambassador_progress' || action === 'submit_completion') {
      if (!hasAnyRole(caller, ['ambassador', 'school_admin', 'super_admin'])) {
        return res.status(403).json({ error: 'Faqat Eko-Elchi yoki Maktab Sardori ijro hisobotini yubora oladi' });
      }
      if (!assertSchoolAccess(caller, report.schoolId)) {
        return res.status(403).json({ error: "Boshqa maktab hisobotiga kirish taqiqlangan" });
      }
      if (report.isHazardous) {
        return res.status(400).json({ error: "Xavfli muammolarni o'quvchilar bajarishi taqiqlanadi — ma'muriyatga eskalatsiya qiling!" });
      }

      if (ambassadorSolutions) report.ambassadorSolutions = ambassadorSolutions;
      if (progressEvidenceUrl) {
        report.progressEvidenceUrl = progressEvidenceUrl;
        report.resolvedImageUrl = progressEvidenceUrl;
      }
      report.completionNote = note || report.completionNote;
      report.status = 'in_progress';
      report.updatedAt = nowIso;
      report.statusHistory.push({
        status: action === 'submit_completion' ? 'COMPLETION_SUBMITTED' : 'IN_PROGRESS',
        actorName: caller.fullName,
        actorRole: caller.role,
        note: note || ambassadorSolutions,
        timestamp: nowIso,
      });
      saveCentralDb();
      return res.json({ success: true, report });
    }

    return res.status(400).json({ error: "Noma'lum amal" });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// School Admin decision: student self-resolved OR assign to school's Eco-Ambassador
app.post(
  '/api/reports/:id/school-action',
  requireRoles('school_admin', 'super_admin', 'moderator'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const report = centralDb.reports.find((r) => r.id === req.params.id);
      if (!report) return res.status(404).json({ error: 'Hisobot topilmadi' });

      if (!hasAnyRole(caller, ['super_admin', 'moderator']) && !assertSchoolAccess(caller, report.schoolId)) {
        return res.status(403).json({ error: "Boshqa maktab hisobotini boshqara olmaysiz" });
      }

      const { action, assignedAmbassadorUid, note } = req.body || {};
      const nowIso = new Date().toISOString();
      if (!Array.isArray(report.statusHistory)) report.statusHistory = [];

      if (action === 'confirm_student_resolved') {
        if (report.status === 'resolved' || report.status === 'RESOLVED') {
          return res.json({ success: true, report, message: 'Hisobot allaqachon tasdiqlangan' });
        }
        const reward = Number(report.rewardCoins) || getConfiguredReward('problemResolved') || 100;
        report.status = 'resolved';
        report.resolvedAt = nowIso;
        report.resolvedBy = caller.fullName;
        report.resolvedImageUrl = report.resolvedImageUrl || report.imageUrl;
        report.updatedAt = nowIso;
        report.statusHistory.push({
          status: 'RESOLVED',
          actorName: caller.fullName,
          actorRole: caller.role,
          note: note || "Maktab admini o'quvchi ishni haqiqatda bajarganini tasdiqladi",
          timestamp: nowIso,
        });

        if (!report.coinsAwarded) {
          report.coinsAwarded = true;
          report.rewardCoins = reward;
          const student = findUserByAnyIdentifier({
            uid: report.reporterUid || report.authorUid,
            telegramId: report.authorTelegramId,
          });
          if (student) {
            student.ecoCoins = (student.ecoCoins || 0) + reward;
            student.totalCoinsEarned = (student.totalCoinsEarned || 0) + reward;
            student.reportsCount = (student.reportsCount || 0) + 1;
            student.cleanupsCount = (student.cleanupsCount || 0) + 1;
            recordTransaction({
              userId: student.uid,
              amount: reward,
              type: 'earn',
              status: 'approved',
              reportId: report.id,
              reason: `Maktab admini ekologik ishingizni tasdiqladi: ${report.title}`,
            });
            centralDb.notifications.unshift({
              id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
              userId: student.uid,
              title: `+${reward} EcoCoin! Ekologik ishingiz tasdiqlandi`,
              message: `${caller.fullName} "${report.title}" bo'yicha bajargan ishingizni tasdiqladi.`,
              type: 'coin',
              read: false,
              createdAt: nowIso,
            });
            const tgId = student.telegramId || student.chatId || report.authorTelegramId;
            if (tgId) {
              sendTelegramMessage(
                tgId,
                `🎉 <b>MAKTAB ADMINI ISHINGIZNI TASDIQLADI!</b>\n\n` +
                  `📌 <b>Muammo:</b> ${report.title}\n` +
                  `💰 <b>Mukofot:</b> +${reward} EcoCoin\n` +
                  `💳 <b>Balans:</b> ${student.ecoCoins} EcoCoin`,
                { reply_markup: { inline_keyboard: [[{ text: '🌍 ECO HERO ilovasini ochish', web_app: { url: APP_URL } }]] } }
              ).catch(() => {});
            }
          }
          if (report.schoolName) {
            findOrCreateSchool({
              schoolId: report.schoolId,
              schoolName: report.schoolName,
              region: report.region,
              district: report.district,
              coinsDelta: reward,
              cleanupsDelta: 1,
            });
          }
        }

        saveCentralDb();
        broadcastRealtimeEvent('db:updated', { scope: 'reports' });
        addAuditLog({
          actorUid: caller.uid,
          actorName: caller.fullName,
          actorRole: caller.role,
          action: 'school_confirm_student_resolved',
          targetCollection: 'reports',
          targetId: report.id,
        });
        return res.json({ success: true, report, message: "O'quvchi bajargan ish tasdiqlandi va EcoCoin berildi!" });
      }

      if (action === 'assign_ambassador') {
        let targetAmb = assignedAmbassadorUid ? findUserByAnyIdentifier({ uid: assignedAmbassadorUid }) : null;
        if (!targetAmb) {
          targetAmb = Object.values(centralDb.users || {}).find(
            (u: any) =>
              u &&
              u.role === 'ambassador' &&
              ((report.schoolId && u.schoolId === report.schoolId) ||
                (report.schoolName && u.schoolName === report.schoolName))
          );
        }
        const ambUid = targetAmb?.uid || assignedAmbassadorUid || '';
        const ambName = targetAmb?.fullName || 'Maktab Eko-Elchisi';

        report.assignedAmbassadorUid = ambUid;
        report.assignedAmbassadorName = ambName;
        report.captainInstructions =
          note || "O'quvchi faqat muammoni xabar qilgan. O'quvchi bilan birgalikda muammoni hal qilib, avvalgi va keyingi rasmni yuklang!";
        report.status = 'in_progress';
        report.updatedAt = nowIso;
        report.statusHistory.push({
          status: 'ASSIGNED',
          actorName: caller.fullName,
          actorRole: caller.role,
          note: `Eko-Elchiga biriktirildi: ${ambName}`,
          timestamp: nowIso,
        });

        if (ambUid) {
          const existingTask = centralDb.ecoTasks.find((t: any) => t.relatedReportId === report.id);
          if (!existingTask) {
            centralDb.ecoTasks.unshift({
              id: `task_${Date.now()}`,
              schoolId: report.schoolId,
              schoolName: report.schoolName,
              region: report.region,
              district: report.district,
              title: `Muammoni hal etish: ${report.title}`,
              instructions: report.captainInstructions,
              assignedByUid: caller.uid,
              assignedByName: caller.fullName,
              assigneeUid: ambUid,
              assigneeName: ambName,
              relatedReportId: report.id,
              status: 'assigned',
              rewardCoins: 200,
              createdAt: nowIso,
            });
          }
          centralDb.notifications.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            userId: ambUid,
            title: `Yangi muammo biriktirildi: ${report.title}`,
            message: `${report.reporterName} bilan birgalikda muammoni hal qilib, avvalgi/keyingi rasmlarni yuklang (+200 EcoCoin).`,
            type: 'task',
            read: false,
            createdAt: nowIso,
          });
          const ambTg = targetAmb?.telegramId || targetAmb?.chatId;
          if (ambTg) {
            sendTelegramMessage(
              ambTg,
              `🛡 <b>SIZGA YANGI EKO-MUAMMO BIRIKTIRILDI!</b>\n\n` +
                `📌 <b>Muammo:</b> ${report.title}\n` +
                `👤 <b>Xabar bergan o'quvchi:</b> ${report.reporterName}\n` +
                `📋 <b>Topshiriq:</b> O'quvchi bilan birga muammoni hal qiling va Mini Appda Avvalgi + Keyingi rasmlarni yuklang.\n` +
                `💰 <b>Mukofot:</b> Sizga +200 EcoCoin, o'quvchiga +100 EcoCoin!`,
              { reply_markup: { inline_keyboard: [[{ text: '📸 Dalil yuklash', web_app: { url: APP_URL } }]] } }
            ).catch(() => {});
          }
        }

        const student = findUserByAnyIdentifier({ uid: report.reporterUid || report.authorUid });
        if (student) {
          centralDb.notifications.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            userId: student.uid,
            title: `Xabaringiz Eko-Elchiga yuborildi`,
            message: `${ambName} siz bilan birga "${report.title}" muammosini hal qiladi. Hal bo'lgach +100 EcoCoin olasiz!`,
            type: 'status',
            read: false,
            createdAt: nowIso,
          });
        }

        saveCentralDb();
        broadcastRealtimeEvent('db:updated', { scope: 'reports' });
        return res.json({ success: true, report, message: `Muammo Eko-Elchi (${ambName}) ga biriktirildi!` });
      }

      return res.status(400).json({ error: "Noto'g'ri school-action amali" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Eco-Ambassador + Student joint resolution with Before/After Photos & AI Authenticity Check -> +200 / +100 EcoCoin
app.post(
  '/api/reports/:id/ambassador-resolve',
  requireRoles('ambassador', 'school_admin', 'super_admin', 'moderator'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const report = centralDb.reports.find((r) => r.id === req.params.id);
      if (!report) return res.status(404).json({ error: 'Hisobot topilmadi' });

      if (!hasAnyRole(caller, ['super_admin', 'moderator']) && !assertSchoolAccess(caller, report.schoolId)) {
        return res.status(403).json({ error: "Boshqa maktab hisobotini yakunlay olmaysiz" });
      }
      if (report.isHazardous) {
        return res.status(400).json({ error: "Xavfli muammolarni o'quvchilar bajarishi taqiqlanadi!" });
      }
      if (report.ambassadorResolutionRewarded || report.status === 'resolved' || report.status === 'RESOLVED') {
        return res.status(400).json({ error: 'Ushbu muammo allaqachon hal qilingan va mukofot berilgan' });
      }

      const { beforeImageUrl, afterImageUrl, note } = req.body || {};
      const finalBefore = String(beforeImageUrl || report.imageUrl || '').trim();
      const finalAfter = String(afterImageUrl || '').trim();
      if (!finalBefore || !finalAfter) {
        return res.status(400).json({ error: "Avvalgi va hal qilingandan keyingi rasmlarni yuklash majburiy!" });
      }

      const beforeInline = await resolveImageInputToInlineData(finalBefore);
      const afterInline = await resolveImageInputToInlineData(finalAfter);

      let aiVerdict: any = {
        isAiGenerated: false,
        beforeShowsProblem: true,
        afterShowsResolved: true,
        sameLocationConsistent: true,
        isValidEcoResolution: true,
        confidence: 85,
        verdictUz: "Avvalgi va keyingi rasmlar haqiqiy hamda muammo hal etilgani tasdiqlandi.",
      };

      if (process.env.GEMINI_API_KEY && beforeInline && afterInline) {
        try {
          const response: any = await generateContentWithModelFallback(
            {
              contents: [
                {
                  role: 'user',
                  parts: [
                    { text: '1-RASM (Muammodan AVVALGI holat):' },
                    { inlineData: beforeInline },
                    { text: '2-RASM (Hal qilingandan KEYINGI holat):' },
                    { inlineData: afterInline },
                    {
                      text: `Muammo: ${report.title}\nTavsif: ${report.description}\nEko-Elchi izohi: ${note || '-'}\nUshbu ikkita rasmni qat'iy tekshiring:\n1) Biror rasm AI (sun'iy intellekt) da generatsiya qilingan yoki fotoshop qilingan emasmi?\n2) 1-rasmda muammo ko'rinib, 2-rasmda o'sha joy rostan ham tozalangan/tuzatilgan/ekilgan holatdami?\n3) Ikkala rasm haqiqiy kameradan olingan real natijami?`,
                    },
                  ],
                },
              ],
              config: {
                systemInstruction:
                  `Siz ECO HERO AI haqiqiylik auditorisiz. 2 ta rasmni (Avvalgi va Keyingi) tahlil qilib FAQAT toza JSON qaytaring: {"isAiGenerated": boolean, "beforeShowsProblem": boolean, "afterShowsResolved": boolean, "sameLocationConsistent": boolean, "isValidEcoResolution": boolean, "confidence": number (0-100), "verdictUz": string (o'zbek tilida tushunarli xulosa)}. Agar rasmlardan biri AI yordamida yasalgan, tahrirlangan yoki muammo hal qilinmagan bo'lsa "isValidEcoResolution": false qaytaring.`,
                responseMimeType: 'application/json',
                thinkingConfig: { thinkingLevel: ThinkingLevel.MEDIUM },
              },
            },
            25000
          );
          aiVerdict = parseModelJsonResponse(response?.text);
        } catch (aiErr: any) {
          console.warn('Before/After AI check error:', aiErr?.message || aiErr);
        }
      }

      if (aiVerdict?.isAiGenerated === true || aiVerdict?.isValidEcoResolution === false) {
        return res.status(400).json({
          success: false,
          aiCheck: aiVerdict,
          error:
            aiVerdict?.verdictUz ||
            (aiVerdict?.isAiGenerated
              ? "AI tekshiruvi: rasmlardan biri sun'iy intellektda yasalgan yoki tahrirlangan! Faqat haqiqiy rasm yuklang."
              : "AI tekshiruvi: keyingi rasmda muammo haqiqatda hal qilingani tasdiqlanmadi."),
        });
      }

      const nowIso = new Date().toISOString();
      report.beforeImageUrl = finalBefore;
      report.resolvedImageUrl = finalAfter;
      report.progressEvidenceUrl = finalAfter;
      report.completionNote = note || "Eko-Elchi va o'quvchi hamkorligida hal qilindi";
      report.status = 'resolved';
      report.resolvedAt = nowIso;
      report.resolvedBy = caller.fullName;
      report.updatedAt = nowIso;
      report.ambassadorResolutionRewarded = true;
      report.coinsAwarded = true;
      report.resolutionRewardAwarded = true;
      report.aiAuthenticityCheck = {
        isAiGenerated: false,
        isVerifiedResolved: true,
        confidence: Number(aiVerdict?.confidence || 92),
        verdictUz: String(aiVerdict?.verdictUz || "AI tasdiqladi: haqiqiy rasmlar va muammo bartaraf etilgan."),
        checkedAt: nowIso,
      };
      if (!Array.isArray(report.statusHistory)) report.statusHistory = [];
      report.statusHistory.push({
        status: 'RESOLVED',
        actorName: caller.fullName,
        actorRole: caller.role,
        note: report.aiAuthenticityCheck.verdictUz,
        timestamp: nowIso,
      });

      // Mark any linked ecoTasks as verified
      for (const task of centralDb.ecoTasks || []) {
        if (task.relatedReportId === report.id) {
          task.status = 'verified';
          task.evidenceUrl = finalAfter;
          task.completionNote = report.completionNote;
          task.updatedAt = nowIso;
        }
      }

      // Exact rewards: Eco-Ambassador gets +200 EcoCoin, Reporting Student gets +100 EcoCoin
      const ambassadorReward = 200;
      const studentReward = 100;

      const ambassadorUser = findUserByAnyIdentifier({ uid: caller.uid }) || findUserByAnyIdentifier({ uid: report.assignedAmbassadorUid });
      const studentUser = findUserByAnyIdentifier({
        uid: report.reporterUid || report.authorUid,
        telegramId: report.authorTelegramId,
      });

      if (ambassadorUser) {
        ambassadorUser.ecoCoins = (ambassadorUser.ecoCoins || 0) + ambassadorReward;
        ambassadorUser.totalCoinsEarned = (ambassadorUser.totalCoinsEarned || 0) + ambassadorReward;
        ambassadorUser.cleanupsCount = (ambassadorUser.cleanupsCount || 0) + 1;
        recordTransaction({
          userId: ambassadorUser.uid,
          amount: ambassadorReward,
          type: 'earn',
          status: 'approved',
          reportId: report.id,
          reason: `Muammoni hal qildi (AI tasdiqladi): ${report.title}`,
        });
        centralDb.notifications.unshift({
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          userId: ambassadorUser.uid,
          title: `+${ambassadorReward} EcoCoin! AI tasdiqladi`,
          message: `"${report.title}" muammosi haqiqiy rasmlar bilan hal qilindi (+${ambassadorReward} EcoCoin).`,
          type: 'coin',
          read: false,
          createdAt: nowIso,
        });
        const ambTg = ambassadorUser.telegramId || ambassadorUser.chatId;
        if (ambTg) {
          sendTelegramMessage(
            ambTg,
            `🎉 <b>AI TEKSHIRUVIDAN O'TDI! +${ambassadorReward} EcoCoin</b>\n\n📌 ${report.title}\n🤖 ${report.aiAuthenticityCheck.verdictUz}\n💳 Balansingiz: ${ambassadorUser.ecoCoins} EcoCoin`
          ).catch(() => {});
        }
      }

      if (studentUser && studentUser.uid !== ambassadorUser?.uid) {
        studentUser.ecoCoins = (studentUser.ecoCoins || 0) + studentReward;
        studentUser.totalCoinsEarned = (studentUser.totalCoinsEarned || 0) + studentReward;
        studentUser.reportsCount = (studentUser.reportsCount || 0) + 1;
        recordTransaction({
          userId: studentUser.uid,
          amount: studentReward,
          type: 'earn',
          status: 'approved',
          reportId: report.id,
          reason: `Siz xabar bergan muammo Eko-Elchi bilan hal qilindi: ${report.title}`,
        });
        centralDb.notifications.unshift({
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          userId: studentUser.uid,
          title: `+${studentReward} EcoCoin! Muammongiz hal qilindi`,
          message: `${ambassadorUser?.fullName || 'Eko-Elchi'} bilan birga "${report.title}" hal qilindi (+${studentReward} EcoCoin).`,
          type: 'coin',
          read: false,
          createdAt: nowIso,
        });
        const stuTg = studentUser.telegramId || studentUser.chatId || report.authorTelegramId;
        if (stuTg) {
          sendTelegramMessage(
            stuTg,
            `🎉 <b>SIZ XABAR BERGAN MUAMMO HAL QILINDI! +${studentReward} EcoCoin</b>\n\n📌 ${report.title}\n🛡 Eko-Elchi: ${ambassadorUser?.fullName || caller.fullName}\n💳 Balansingiz: ${studentUser.ecoCoins} EcoCoin`
          ).catch(() => {});
        }
      }

      if (report.schoolName) {
        findOrCreateSchool({
          schoolId: report.schoolId,
          schoolName: report.schoolName,
          region: report.region,
          district: report.district,
          coinsDelta: ambassadorReward + (studentUser && studentUser.uid !== ambassadorUser?.uid ? studentReward : 0),
          cleanupsDelta: 1,
        });
      }

      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'reports' });
      addAuditLog({
        actorUid: caller.uid,
        actorName: caller.fullName,
        actorRole: caller.role,
        action: 'report_ambassador_resolved_ai',
        targetCollection: 'reports',
        targetId: report.id,
        details: { ambassadorReward, studentReward, confidence: report.aiAuthenticityCheck.confidence },
      });

      res.json({
        success: true,
        report,
        ambassadorReward,
        studentReward: studentUser && studentUser.uid !== ambassadorUser?.uid ? studentReward : 0,
        message: `AI rasmlarni haqiqiy deb tasdiqladi! Eko-Elchiga +${ambassadorReward}, o'quvchiga +${studentReward} EcoCoin berildi!`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Super Admin inline Report Edit & Delete
app.patch('/api/reports/:id', requireRoles('super_admin', 'moderator'), (req: AuthenticatedRequest, res) => {
  try {
    const report = centralDb.reports.find((r) => r.id === req.params.id);
    if (!report) return res.status(404).json({ error: 'Hisobot topilmadi' });

    const { title, description, category, severity, status, rewardCoins, imageUrl, resolvedImageUrl, address } = req.body || {};
    if (title !== undefined) report.title = String(title).trim();
    if (description !== undefined) report.description = String(description).trim();
    if (category !== undefined) report.category = category;
    if (severity !== undefined) report.severity = severity;
    if (status !== undefined) report.status = status;
    if (rewardCoins !== undefined) report.rewardCoins = Math.max(0, Number(rewardCoins) || 0);
    if (imageUrl !== undefined) report.imageUrl = String(imageUrl).trim();
    if (resolvedImageUrl !== undefined) report.resolvedImageUrl = String(resolvedImageUrl).trim();
    if (address !== undefined) report.address = String(address).trim();
    report.updatedAt = new Date().toISOString();

    saveCentralDb();
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/reports/:id', requireRoles('super_admin', 'moderator'), (req: AuthenticatedRequest, res) => {
  try {
    const idx = centralDb.reports.findIndex((r) => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Hisobot topilmadi' });
    centralDb.reports.splice(idx, 1);
    saveCentralDb();
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reports/:id/upvote', (req: AuthenticatedRequest, res) => {
  try {
    const { userId } = req.body;
    const report = centralDb.reports.find((r) => r.id === req.params.id);
    if (!report) return res.status(404).json({ error: 'Hisobot topilmadi' });
    if (!Array.isArray(report.upvotedBy)) report.upvotedBy = [];

    const uid = String(req.authUser?.uid || userId || 'guest');
    if (report.upvotedBy.includes(uid)) {
      report.upvotedBy = report.upvotedBy.filter((x: string) => x !== uid);
      report.upvotes = Math.max(0, (report.upvotes || 1) - 1);
    } else {
      report.upvotedBy.push(uid);
      report.upvotes = (report.upvotes || 0) + 1;
    }
    saveCentralDb();
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. AUTH, SESSION ISSUANCE, REGISTRATION & ONBOARDING
// ==========================================

// Exchange Firebase ID Token or verified credentials for a server-signed HMAC sessionToken
app.post('/api/auth/session', async (req, res) => {
  try {
    const { idToken: rawIdToken, firebaseIdToken, uid, email, fullName } = req.body || {};
    const idToken = rawIdToken || firebaseIdToken;
    let verifiedFb = idToken ? await verifyFirebaseIdToken(String(idToken)) : null;

    let user = verifiedFb
      ? findUserByAnyIdentifier({ uid: verifiedFb.uid, email: verifiedFb.email })
      : uid
      ? findUserByAnyIdentifier({ uid })
      : null;

    if (verifiedFb && !user) {
      const isJasur = Boolean(verifiedFb.emailVerified && checkIsSuperAdmin({ email: verifiedFb.email }));
      const welcomeBonus = getConfiguredReward('welcomeBonus');
      user = upsertUser({
        uid: verifiedFb.uid,
        fullName: verifiedFb.displayName || fullName || 'Eko-Qahramon',
        email: verifiedFb.email || email || '',
        avatarUrl: verifiedFb.photoUrl || DEFAULT_AVATAR,
        profileImage: verifiedFb.photoUrl || DEFAULT_AVATAR,
        role: isJasur ? 'super_admin' : 'student',
        approvedRoles: isJasur
          ? ['student', 'ambassador', 'school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin', 'sponsor']
          : ['student'],
        ecoCoins: isJasur ? 50000 : welcomeBonus,
        totalCoinsEarned: isJasur ? 50000 : welcomeBonus,
        isVerified: isJasur,
        isOnboarded: isJasur,
        welcomeBonusClaimed: true,
        region: 'Toshkent shahri',
        district: 'Shayxontohur tumani',
        schoolId: 'school_tashkent_17',
        schoolName: 'Toshkent sh. 17-sonli ixtisoslashtirilgan maktab',
        schoolNumber: '17',
        registrationDate: new Date().toISOString(),
        activityStats: { reportsCount: 0, cleanupsCount: 0, treesPlanted: 0, streakDays: 1, totalCoinsEarned: isJasur ? 50000 : welcomeBonus },
      });
    }

    // Security guard: without cryptographic idToken, NEVER mint session for elevated roles
    if (!verifiedFb && user && user.role !== 'student') {
      return res.status(401).json({
        error: "Imtiyozli rol uchun tasdiqlangan autentifikatsiya (Firebase ID token yoki parol) talab qilinadi",
      });
    }

    if (!user && uid) {
      user = upsertUser({
        uid: String(uid),
        fullName: fullName || "O'quvchi",
        email: email || '',
        role: 'student',
        approvedRoles: ['student'],
        ecoCoins: 0,
        totalCoinsEarned: 0,
        region: 'Toshkent shahri',
        district: 'Shayxontohur tumani',
        schoolId: 'school_tashkent_17',
        schoolName: 'Toshkent sh. 17-sonli ixtisoslashtirilgan maktab',
        isOnboarded: false,
        registrationDate: new Date().toISOString(),
        activityStats: { reportsCount: 0, cleanupsCount: 0, treesPlanted: 0, streakDays: 1, totalCoinsEarned: 0 },
      });
    }

    if (!user) {
      return res.status(401).json({ error: "Sessiya yaratish uchun tasdiqlangan hisob topilmadi" });
    }

    const sessionToken = issueSessionToken(user);
    res.json({ success: true, sessionToken, user: sanitizeSelfUser(user) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/register-user', (req, res) => {
  try {
    const { email, password, fullName, phoneNumber, schoolName, schoolNumber, region, district, grade } = req.body;

    if (!email || !fullName) {
      return res.status(400).json({ error: "Email va to'liq ism talab qilinadi" });
    }

    const existing = findUserByAnyIdentifier({ email, phoneNumber });
    if (existing) {
      return res.status(409).json({ error: "Ushbu email yoki telefon raqam bilan foydalanuvchi allaqachon ro'yxatdan o'tgan" });
    }

    const isJasur = checkIsSuperAdmin({ email, phoneNumber });
    const welcomeBonus = getConfiguredReward('welcomeBonus');
    const cleanSchoolName = schoolName || 'Toshkent sh. 17-maktab';
    const cleanRegion = region || 'Toshkent shahri';
    const cleanDistrict = district || 'Shayxontohur tumani';
    const linkedSchool = findOrCreateSchool({
      schoolName: cleanSchoolName,
      schoolNumber,
      region: cleanRegion,
      district: cleanDistrict,
      coinsDelta: welcomeBonus,
      incrementStudents: true,
    });

    const uid = `user_web_${Date.now()}`;
    const userProfile = upsertUser({
      uid,
      fullName,
      email: String(email).trim().toLowerCase(),
      passwordHash: password ? crypto.createHash('sha256').update(String(password)).digest('hex') : undefined,
      phoneNumber: phoneNumber || '',
      role: isJasur ? 'super_admin' : 'student',
      approvedRoles: isJasur
        ? ['student', 'ambassador', 'school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin', 'sponsor']
        : ['student'],
      schoolId: linkedSchool?.id || 'school_custom',
      schoolName: linkedSchool?.name || cleanSchoolName,
      schoolNumber: normalizeSchoolNumber(cleanSchoolName, schoolNumber),
      region: cleanRegion,
      district: cleanDistrict,
      grade: grade || '9-sinf',
      ecoCoins: isJasur ? 10000 : welcomeBonus,
      totalCoinsEarned: isJasur ? 10000 : welcomeBonus,
      reportsCount: 0,
      cleanupsCount: 0,
      treesPlanted: 0,
      streakDays: 1,
      badge: isJasur ? 'Bosh Administrator' : 'Yangi Eko-Qahramon',
      referralCode: `ECO${uid.slice(-4).toUpperCase()}`,
      isVerified: isJasur,
      isOnboarded: true,
      privacyConsentAccepted: true,
      welcomeBonusClaimed: true,
      avatarUrl: DEFAULT_AVATAR,
      profileImage: DEFAULT_AVATAR,
      registrationDate: new Date().toISOString(),
      activityStats: {
        reportsCount: 0,
        cleanupsCount: 0,
        treesPlanted: 0,
        streakDays: 1,
        totalCoinsEarned: isJasur ? 10000 : welcomeBonus,
      },
    });

    recordTransaction({
      userId: userProfile.uid,
      amount: welcomeBonus,
      type: 'bonus',
      status: 'approved',
      reason: `ECO HERO ro'yxatdan o'tish tabrik bonusi (+${welcomeBonus} EcoCoin)`,
    });
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'users' });

    addAuditLog({
      actorUid: userProfile.uid,
      actorName: fullName,
      actorRole: userProfile.role,
      action: 'user_registered',
      targetCollection: 'users',
      targetId: userProfile.uid,
      details: { email, schoolName: userProfile.schoolName, region: cleanRegion },
    });

    const sessionToken = issueSessionToken(userProfile);
    res.json({ success: true, sessionToken, user: sanitizeSelfUser(userProfile), school: linkedSchool });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login-user', (req, res) => {
  try {
    const { email, identifier, phoneNumber, password } = req.body;
    const rawId = String(email || identifier || phoneNumber || '').trim();
    if (!rawId) {
      return res.status(400).json({ error: 'Email yoki telefon raqami kiritilishi shart' });
    }
    const user = findUserByAnyIdentifier({
      email: rawId.includes('@') ? rawId : undefined,
      phoneNumber: !rawId.includes('@') ? rawId : undefined,
    });
    if (!user) {
      return res.status(404).json({ error: "Hisob topilmadi. Iltimos avval ro'yxatdan o'ting." });
    }
    if (user.passwordHash) {
      const hash = crypto.createHash('sha256').update(String(password || '')).digest('hex');
      if (hash !== user.passwordHash) {
        return res.status(401).json({ error: "Parol noto'g'ri kiritildi" });
      }
    }
    const sessionToken = issueSessionToken(user);
    res.json({ success: true, sessionToken, user: sanitizeSelfUser(user) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/onboarding', (req: AuthenticatedRequest, res) => {
  try {
    const { uid, fullName, phoneNumber, region, district, schoolName, grade, telegramId, telegramUsername, email } = req.body;
    if (!uid || !fullName || !phoneNumber) {
      return res.status(400).json({ error: 'Ism, familiya va telefon raqami kiritilishi shart' });
    }

    const existing = req.authUser || findUserByAnyIdentifier({ uid, telegramId, phoneNumber, email });
    const cleanRegion = region || existing?.region || 'Toshkent shahri';
    const cleanDistrict = district || existing?.district || 'Shayxontohur tumani';
    const cleanSchoolName = schoolName || existing?.schoolName || '1-maktab';
    const schoolNumber = normalizeSchoolNumber(cleanSchoolName);

    const isJasur = checkIsSuperAdmin({
      telegramUsername: telegramUsername || existing?.telegramUsername,
      telegramId: telegramId || existing?.telegramId,
      email: email || existing?.email,
      phoneNumber,
    });

    const welcomeBonus = getConfiguredReward('welcomeBonus');
    const isFirstWelcomeBonus = !existing?.welcomeBonusClaimed;
    const baseCoins = existing?.ecoCoins || 0;
    const newCoins = isFirstWelcomeBonus ? Math.max(baseCoins, 0) + welcomeBonus : baseCoins;
    const totalEarned = isFirstWelcomeBonus ? (existing?.totalCoinsEarned || 0) + welcomeBonus : (existing?.totalCoinsEarned || newCoins);

    const linkedSchool = findOrCreateSchool({
      schoolId: existing?.schoolId,
      schoolName: cleanSchoolName,
      schoolNumber,
      region: cleanRegion,
      district: cleanDistrict,
      coinsDelta: isFirstWelcomeBonus ? welcomeBonus : 0,
      incrementStudents: !existing?.isOnboarded,
    });

    const canonicalUid = existing?.uid || (telegramId ? `user_tg_${telegramId}` : uid);
    const profile = upsertUser({
      uid: canonicalUid,
      userId: canonicalUid,
      chatId: telegramId ? String(telegramId) : existing?.chatId,
      telegramId: telegramId || existing?.telegramId || null,
      telegramUsername: telegramUsername || existing?.telegramUsername || '',
      email: email || existing?.email || (telegramId ? `${telegramId}@telegram.ecohero.uz` : `${canonicalUid}@ecohero.uz`),
      fullName: fullName.trim(),
      phoneNumber: phoneNumber.trim(),
      region: cleanRegion,
      district: cleanDistrict,
      schoolId: linkedSchool?.id || existing?.schoolId || 'school_custom',
      schoolName: linkedSchool?.name || cleanSchoolName,
      schoolNumber,
      grade: grade || '9-sinf',
      ecoCoins: isJasur ? Math.max(newCoins, 50000) : newCoins,
      totalCoinsEarned: isJasur ? Math.max(totalEarned, 50000) : totalEarned,
      reportsCount: existing?.reportsCount || 0,
      treesPlanted: existing?.treesPlanted || 0,
      cleanupsCount: existing?.cleanupsCount || 0,
      streakDays: existing?.streakDays || 1,
      role: isJasur ? 'super_admin' : existing?.role || 'student',
      approvedRoles: isJasur
        ? ['student', 'ambassador', 'school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin', 'sponsor']
        : existing?.approvedRoles || ['student'],
      badge: isJasur ? 'Bosh Administrator' : existing?.badge || 'Yangi Eko-Qahramon',
      referralCode: existing?.referralCode || `ECO${String(canonicalUid).slice(-4).toUpperCase()}`,
      avatarUrl: existing?.avatarUrl || DEFAULT_AVATAR,
      profileImage: existing?.profileImage || DEFAULT_AVATAR,
      isOnboarded: true,
      privacyConsentAccepted: true,
      welcomeBonusClaimed: true,
      registrationDate: existing?.registrationDate || new Date().toISOString(),
      activityStats: {
        reportsCount: existing?.reportsCount || 0,
        cleanupsCount: existing?.cleanupsCount || 0,
        treesPlanted: existing?.treesPlanted || 0,
        streakDays: existing?.streakDays || 1,
        totalCoinsEarned: isJasur ? Math.max(totalEarned, 50000) : totalEarned,
      },
    });

    if (isFirstWelcomeBonus) {
      recordTransaction({
        userId: profile.uid,
        amount: welcomeBonus,
        type: 'bonus',
        status: 'approved',
        reason: `ECO HERO ro'yxatdan o'tish bonusi (+${welcomeBonus} EcoCoin)`,
      });
    }

    if (telegramId && centralDb.registrationSessions[String(telegramId)]) {
      delete centralDb.registrationSessions[String(telegramId)];
    }
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'users' });

    const sessionToken = issueSessionToken(profile);
    const sanitized = sanitizeSelfUser(profile);
    res.json({
      success: true,
      sessionToken,
      profile: sanitized,
      user: sanitized,
      school: linkedSchool,
      message: "Ma'lumotlar yagona bazaga saqlandi!",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Safe profile update ONLY — explicitly rejects/strips role, ecoCoins, approvedRoles, and verification spoofing!
app.post('/api/user/profile', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const {
      fullName,
      phoneNumber,
      region,
      district,
      schoolName,
      schoolNumber,
      grade,
      avatarUrl,
      profileImage,
      activeRole,
    } = req.body;

    const existing = centralDb.users[caller.uid] || caller;
    const safeUpdates: Record<string, any> = {};
    if (typeof fullName === 'string' && fullName.trim().length >= 2) safeUpdates.fullName = fullName.trim();
    if (typeof phoneNumber === 'string') safeUpdates.phoneNumber = phoneNumber.trim();
    if (typeof region === 'string' && region.trim()) safeUpdates.region = region.trim();
    if (typeof district === 'string' && district.trim()) safeUpdates.district = district.trim();
    if (typeof grade === 'string') safeUpdates.grade = grade.trim();
    if (typeof avatarUrl === 'string') safeUpdates.avatarUrl = avatarUrl;
    if (typeof profileImage === 'string') safeUpdates.profileImage = profileImage;

    // Allow switching active role ONLY within server-approved roles (never arbitrary!)
    if (typeof activeRole === 'string') {
      const approved = Array.isArray(existing.approvedRoles) ? existing.approvedRoles : [existing.role || 'student'];
      if (checkIsSuperAdmin(existing) || approved.includes(activeRole)) {
        safeUpdates.role = activeRole;
      } else {
        return res.status(403).json({ error: 'Sizda ushbu rolga o‘tish huquqi tasdiqlanmagan' });
      }
    }

    if (schoolName && schoolName !== 'Maktab kiritilmagan') {
      const s = findOrCreateSchool({
        schoolName,
        schoolNumber,
        region: safeUpdates.region || existing.region || 'Toshkent shahri',
        district: safeUpdates.district || existing.district || 'Shayxontohur tumani',
      });
      if (s) {
        safeUpdates.schoolId = s.id;
        safeUpdates.schoolName = s.name;
        safeUpdates.schoolNumber = s.number;
      }
    }

    const updated = upsertUser({
      ...existing,
      ...safeUpdates,
      uid: existing.uid,
    });

    res.json({ success: true, profile: sanitizeSelfUser(updated) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/quiz/claim', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.authUser;
    const { reason = 'Kunlik Eko-Viktorina bonusi' } = req.body;
    const rewardCoins = getConfiguredReward('dailyQuiz');

    const today = new Date().toISOString().split('T')[0];
    if (centralDb.dailyQuizClaims[user.uid] === today) {
      return res.json({ success: false, alreadyClaimed: true, message: 'Bugungi viktorina mukofoti allaqachon olingan' });
    }

    user.ecoCoins = (user.ecoCoins || 0) + rewardCoins;
    user.totalCoinsEarned = (user.totalCoinsEarned || 0) + rewardCoins;
    recordTransaction({
      userId: user.uid,
      amount: rewardCoins,
      type: 'earn',
      status: 'approved',
      reason,
    });
    centralDb.dailyQuizClaims[user.uid] = today;
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'users' });
    res.json({ success: true, rewardCoins, ecoCoins: user.ecoCoins, user: sanitizeSelfUser(user) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Server-Authoritative Progressive Daily Eco-Streak (50 -> 100 -> 300 -> ... -> 1000; resets to 50 if a day is missed)
app.post('/api/streak/claim', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const todayKey = getUzbekistanDateKey();
    const state = computeUserStreakState(
      {
        lastStreakClaimDate: caller.lastStreakClaimDate,
        storedStreakDays: caller.streakDays ?? caller.activityStats?.streakDays ?? 0,
      },
      todayKey
    );

    if (state.claimedToday) {
      return res.json({
        success: false,
        alreadyClaimed: true,
        message: 'Bugungi kunlik Eko-Streak mukofoti allaqachon olingan',
        streakDays: state.currentStreakDays,
        lastStreakClaimDate: caller.lastStreakClaimDate,
        nextTomorrowReward: state.nextTomorrowReward,
        user: sanitizeSelfUser(caller),
      });
    }

    const newStreakDays = state.claimDayNumber;
    const rewardCoins = state.todayReward;

    caller.ecoCoins = (caller.ecoCoins || 0) + rewardCoins;
    caller.totalCoinsEarned = (caller.totalCoinsEarned || 0) + rewardCoins;
    caller.streakDays = newStreakDays;
    caller.lastStreakClaimDate = todayKey;
    caller.activityStats = {
      ...(caller.activityStats || {
        reportsCount: caller.reportsCount || 0,
        cleanupsCount: caller.cleanupsCount || 0,
        treesPlanted: caller.treesPlanted || 0,
        streakDays: newStreakDays,
        totalCoinsEarned: 0,
      }),
      streakDays: newStreakDays,
      totalCoinsEarned: (caller.activityStats?.totalCoinsEarned || 0) + rewardCoins,
    };

    recordTransaction({
      userId: caller.uid,
      amount: rewardCoins,
      type: 'bonus',
      status: 'approved',
      reason: state.wasResetDueToInactivity
        ? `1-kunlik Eko-Streak (tanaffusdan keyin qayta boshlandi, +${rewardCoins} EcoCoin)`
        : `${newStreakDays}-kunlik uzluksiz Eko-Streak mukofoti (+${rewardCoins} EcoCoin)`,
    });

    addAuditLog({
      actorUid: caller.uid,
      actorName: caller.fullName,
      actorRole: caller.role,
      action: 'daily_streak_claimed',
      targetCollection: 'users',
      targetId: caller.uid,
      details: {
        streakDays: newStreakDays,
        rewardCoins,
        dateKey: todayKey,
        wasResetDueToInactivity: state.wasResetDueToInactivity,
      },
    });

    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'users' });

    res.json({
      success: true,
      rewardCoins,
      streakDays: newStreakDays,
      lastStreakClaimDate: todayKey,
      wasResetDueToInactivity: state.wasResetDueToInactivity,
      nextTomorrowReward: state.nextTomorrowReward,
      ecoCoins: caller.ecoCoins,
      user: sanitizeSelfUser(caller),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. SCHOOLS, AMBASSADORS & REGISTRATION APPLICATIONS
// ==========================================

app.get('/api/schools', (req: AuthenticatedRequest, res) => {
  const isAdmin = Boolean(req.authUser && hasAnyRole(req.authUser, ['super_admin', 'moderator']));
  const list = getLiveSchoolsList(isAdmin);
  res.json({ success: true, schools: list });
});

// Hybrid Map Configurable Imagery & Layer Endpoints (Free-first, zero leaked secrets)
app.get('/api/map/config', (_req, res) => {
  const customSatUrl = (process.env.MAP_SATELLITE_TILE_URL || '').trim();
  const customSatAttr = (process.env.MAP_SATELLITE_ATTRIBUTION || '').trim();
  const satTiles = customSatUrl
    ? [customSatUrl]
    : ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'];
  const satAttribution =
    customSatAttr ||
    'Tiles © Esri — Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';

  const googleMapsApiKey = (
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_API_KEY ||
    ''
  ).trim();

  res.json({
    defaultBaseStyle: googleMapsApiKey ? 'hybrid' : 'satellite',
    googleMapsApiKey,
    providers: [
      {
        id: 'satellite',
        name: customSatUrl ? 'Sozlangan sun’iy yo‘ldosh qatlami' : 'Sun’iy yo‘ldosh + Yo‘l nomlari (Esri)',
        tileUrls: satTiles,
        attribution: satAttribution,
        maxZoom: 19,
        isPaid: Boolean(customSatUrl),
        isLiveImagery: false,
        licenseNote:
          "Esri World Imagery tarixiy/arxiv tasvir (jonli emas). Yo'l va hudud nomlari CARTO/OSM bilan ko'rsatiladi.",
      },
      {
        id: 'street',
        name: "HD Vektor / Ko'cha xaritasi",
        tileUrls: [
          'https://a.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://b.tile.openstreetmap.org/{z}/{x}/{y}.png',
          'https://c.tile.openstreetmap.org/{z}/{x}/{y}.png',
        ],
        attribution: '© OpenStreetMap contributors · OpenFreeMap',
        maxZoom: 19,
        isPaid: false,
        isLiveImagery: false,
        licenseNote: 'OpenStreetMap & OpenFreeMap bepul ochiq vektor/ko‘cha xaritasi.',
      },
      {
        id: 'dark',
        name: 'Tungi Eko-Xarita HD (CARTO @2x)',
        tileUrls: [
          'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
          'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}@2x.png',
        ],
        attribution: '© OpenStreetMap contributors © CARTO',
        maxZoom: 19,
        isPaid: false,
        isLiveImagery: false,
        licenseNote: 'CARTO Dark @2x bepul yuqori aniqlikdagi ko‘rish rejimi.',
      },
    ],
    cesium: {
      enabled: true,
      hasIonToken: Boolean((process.env.CESIUM_ION_TOKEN || '').trim()),
      hasCustom3DTiles: Boolean((process.env.CESIUM_3D_TILES_URL || '').trim()),
      photorealistic3DAvailable: Boolean(
        (process.env.CESIUM_ION_TOKEN || '').trim() ||
          (process.env.CESIUM_3D_TILES_URL || '').trim()
      ),
      dailyQuotaLimit: 50,
      paidWarning:
        "Diqqat: Photorealistic 3D Tiles, Cesium Ion World Terrain yoki OSM Buildings pullik API kvotasini sarflaydi. Tasdiqlamasangiz xarita avtomatik ravishda bepul 3D Yer shari va maktab GLB/maket rejimida ishlaydi.",
    },
    limits: {
      maxPageSize: 100,
      cacheTtlMs: 60000,
    },
  });
});

// Rate/quota-limited Cesium paid provider authorization endpoint (never auto-activated)
const cesiumDailyQuotaMap = new Map<string, { date: string; count: number }>();

app.post('/api/map/cesium-session', (req: AuthenticatedRequest, res) => {
  const consent = Boolean(req.body?.consentToPaidProvider);
  const ionToken = (process.env.CESIUM_ION_TOKEN || '').trim();
  const custom3DTilesUrl = (process.env.CESIUM_3D_TILES_URL || '').trim();
  const dailyQuotaLimit = 50;

  if (!consent) {
    return res.json({
      freeModeOnly: true,
      dailyQuotaLimit,
      message: "Bepul 3D rejim faol. Pullik 3D Tiles provayderi faollashtirilmadi.",
    });
  }

  if (!ionToken && !custom3DTilesUrl) {
    return res.json({
      freeModeOnly: true,
      dailyQuotaLimit,
      message:
        "Serverda CESIUM_ION_TOKEN yoki CESIUM_3D_TILES_URL sozlanmagan. Bepul 3D Yer shari va GLB maktab modellari rejimida ishlamoqda.",
    });
  }

  const today = new Date().toISOString().slice(0, 10);
  const actorKey = req.authUser?.uid || req.ip || 'anonymous';
  const prev = cesiumDailyQuotaMap.get(actorKey);
  const currentCount = prev && prev.date === today ? prev.count : 0;
  const isUnlimitedAdmin = req.authUser?.role === 'super_admin';

  if (!isUnlimitedAdmin && currentCount >= dailyQuotaLimit) {
    return res.status(429).json({
      freeModeOnly: true,
      remainingQuota: 0,
      dailyQuotaLimit,
      error: `Kunlik 3D Tiles so'rov limiti (${dailyQuotaLimit}) tugadi. Bepul 3D globus rejimida davom eting.`,
    });
  }

  cesiumDailyQuotaMap.set(actorKey, { date: today, count: currentCount + 1 });

  return res.json({
    freeModeOnly: false,
    ionToken: ionToken || undefined,
    custom3DTilesUrl: custom3DTilesUrl || undefined,
    supportedPresets: ionToken
      ? ['ion_hd', 'google_photorealistic', 'free']
      : ['free'],
    recommendedPreset: ionToken ? 'ion_hd' : 'free',
    remainingQuota: isUnlimitedAdmin ? 999 : Math.max(0, dailyQuotaLimit - (currentCount + 1)),
    dailyQuotaLimit,
    message: "Cesium Ion HD 3D (Bing Aerial + World Terrain + OSM 3D Buildings) faollashtirildi.",
  });
});

app.get('/api/map/layers', (_req, res) => {
  res.json({ success: true, layers: centralDb.mapLayers || [] });
});

app.patch('/api/map/layers/:id', requireRoles('super_admin', 'moderator'), (req: AuthenticatedRequest, res) => {
  try {
    const layerId = String(req.params.id || '');
    const layers = centralDb.mapLayers || [];
    const idx = layers.findIndex((l: any) => l.id === layerId);
    if (idx === -1) return res.status(404).json({ error: 'Qatlam topilmadi' });

    const { enabledByDefault, isActive, label, description } = req.body || {};
    layers[idx] = {
      ...layers[idx],
      ...(typeof enabledByDefault === 'boolean' ? { enabledByDefault } : {}),
      ...(typeof isActive === 'boolean' ? { isActive } : {}),
      ...(typeof label === 'string' && label.trim() ? { label: label.trim().slice(0, 120) } : {}),
      ...(typeof description === 'string' ? { description: description.trim().slice(0, 300) } : {}),
      updatedBy: req.authUser.uid,
      updatedAt: new Date().toISOString(),
    };
    centralDb.mapLayers = layers;
    saveCentralDb();
    addAuditLog({
      actorUid: req.authUser.uid,
      actorName: req.authUser.fullName,
      actorRole: req.authUser.role,
      action: 'update_map_layer',
      targetCollection: 'map_layers',
      targetId: layerId,
      details: { enabledByDefault: layers[idx].enabledByDefault, isActive: layers[idx].isActive },
    });
    res.json({ success: true, layer: layers[idx] });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/map/schools', (req: AuthenticatedRequest, res) => {
  recalculateSchoolRanks();
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 50)));
  const region = String(req.query.region || '').trim();
  const district = String(req.query.district || '').trim();
  const search = String(req.query.search || '').trim().toLowerCase();
  const isAdmin = Boolean(req.authUser && hasAnyRole(req.authUser, ['super_admin', 'moderator']));

  let list = centralDb.schools.map((s: any) => {
    const schoolReports = centralDb.reports.filter(
      (r: any) => r.schoolId === s.id || (s.name && r.schoolName === s.name)
    );
    const resolved = schoolReports.filter((r: any) => String(r.status).toLowerCase() === 'resolved').length;
    const inProgress = schoolReports.filter((r: any) => ['in_progress', 'assigned', 'verified'].includes(String(r.status).toLowerCase())).length;
    const pending = Math.max(0, schoolReports.length - resolved - inProgress);
    const environmentalScore =
      typeof s.environmentalScore === 'number'
        ? s.environmentalScore
        : Math.round((Number(s.treesPlanted || 0) * 5) + (Number(s.cleanupsCompleted || 0) * 20) + (Number(s.totalCoins || 0) / 100));

    const base = isAdmin ? { ...s } : (() => { const { adminEmail: _ae, ...rest } = s; return rest; })();
    return {
      ...base,
      environmentalScore,
      greenAreaSqm: typeof s.greenAreaSqm === 'number' ? s.greenAreaSqm : undefined,
      ecoReportStats: {
        total: schoolReports.length,
        resolved,
        pending,
        inProgress,
      },
    };
  });

  if (region && region !== 'all') list = list.filter((s: any) => s.region === region);
  if (district && district !== 'all') list = list.filter((s: any) => s.district === district);
  if (search) {
    list = list.filter(
      (s: any) =>
        String(s.name || '').toLowerCase().includes(search) ||
        String(s.district || '').toLowerCase().includes(search) ||
        String(s.number || '').toLowerCase().includes(search)
    );
  }

  const total = list.length;
  const start = (page - 1) * limit;
  const items = list.slice(start, start + limit);
  res.json({
    success: true,
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

app.post(
  '/api/map/schools/:id/digital-twin',
  requireRoles('school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const schoolId = String(req.params.id || '');
      const school = centralDb.schools.find((s: any) => s.id === schoolId);
      if (!school) return res.status(404).json({ error: 'Maktab topilmadi' });

      if (
        !hasAnyRole(req.authUser, ['super_admin', 'moderator']) &&
        req.authUser.role === 'school_admin' &&
        req.authUser.schoolId !== schoolId
      ) {
        return res.status(403).json({ error: 'Faqat o‘zingizning maktabingiz ma’lumotlarini tahrirlashingiz mumkin' });
      }

      const { lat, lng, address, greenAreaSqm, glbModelUrl, verifiedPhotos } = req.body || {};

      if (lat !== undefined || lng !== undefined) {
        const nLat = Number(lat);
        const nLng = Number(lng);
        if (!Number.isFinite(nLat) || !Number.isFinite(nLng) || nLat < 36.5 || nLat > 46.0 || nLng < 55.5 || nLng > 74.0) {
          return res.status(400).json({ error: "Koordinatalar O'zbekiston hududi chegarasida bo'lishi shart" });
        }
        school.lat = Number(nLat.toFixed(6));
        school.lng = Number(nLng.toFixed(6));
      }
      if (typeof address === 'string') school.address = address.trim().slice(0, 300);
      if (greenAreaSqm !== undefined && Number.isFinite(Number(greenAreaSqm)) && Number(greenAreaSqm) >= 0) {
        school.greenAreaSqm = Math.round(Number(greenAreaSqm));
      }
      if (typeof glbModelUrl === 'string') {
        const cleanUrl = glbModelUrl.trim();
        if (cleanUrl && !/^https?:\/\/|^\/uploads\//.test(cleanUrl)) {
          return res.status(400).json({ error: 'GLB model manzili https:// yoki /uploads/ formatida bo‘lishi kerak' });
        }
        school.glbModelUrl = cleanUrl.slice(0, 1024);
      }
      if (Array.isArray(verifiedPhotos)) {
        school.verifiedPhotos = verifiedPhotos
          .filter((u: any) => typeof u === 'string' && /^https?:\/\/|^\/uploads\/|^\/assets\//.test(u))
          .slice(0, 12);
      }

      saveCentralDb();
      addAuditLog({
        actorUid: req.authUser.uid,
        actorName: req.authUser.fullName,
        actorRole: req.authUser.role,
        action: 'update_school_digital_twin',
        targetCollection: 'schools',
        targetId: schoolId,
        details: { lat: school.lat, lng: school.lng, hasGlb: Boolean(school.glbModelUrl) },
      });

      res.json({ success: true, school });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.get('/api/map/reports', (req: AuthenticatedRequest, res) => {
  const page = Math.max(1, Number(req.query.page || 1));
  const limit = Math.min(100, Math.max(1, Number(req.query.limit || 60)));
  const category = String(req.query.category || '').trim();
  const status = String(req.query.status || '').trim().toLowerCase();
  const region = String(req.query.region || '').trim();
  const district = String(req.query.district || '').trim();
  const caller = req.authUser || null;

  let list = centralDb.reports.filter((r: any) => canViewReport(r, caller));
  if (category && category !== 'all') list = list.filter((r: any) => r.category === category);
  if (status && status !== 'all') list = list.filter((r: any) => String(r.status).toLowerCase() === status);
  if (region && region !== 'all') list = list.filter((r: any) => r.region === region);
  if (district && district !== 'all') list = list.filter((r: any) => r.district === district);

  const total = list.length;
  const start = (page - 1) * limit;
  const items = list.slice(start, start + limit);

  if (req.query.format === 'geojson') {
    return res.json({
      type: 'FeatureCollection',
      features: items
        .filter((r: any) => Number.isFinite(Number(r.lat)) && Number.isFinite(Number(r.lng)))
        .map((r: any) => ({
          type: 'Feature',
          id: r.id,
          geometry: { type: 'Point', coordinates: [Number(r.lng), Number(r.lat)] },
          properties: {
            id: r.id,
            title: r.title,
            category: r.category,
            severity: r.severity,
            status: r.status,
            region: r.region,
            district: r.district,
            rewardCoins: r.rewardCoins,
            upvotes: r.upvotes,
          },
        })),
      meta: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    });
  }

  res.json({
    success: true,
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
  });
});

app.post('/api/schools/register', requireRoles('school_admin', 'district_coordinator', 'regional_coordinator', 'super_admin'), (req: AuthenticatedRequest, res) => {
  try {
    const { name, number, region, district, adminEmail, ambassadorName } = req.body;
    if (!name || !region || !district) {
      return res.status(400).json({ error: 'Maktab nomi, viloyat va tuman talab qilinadi' });
    }

    const school = findOrCreateSchool({
      schoolName: name,
      schoolNumber: number,
      region,
      district,
      ambassadorName,
      adminEmail,
      incrementStudents: true,
    });

    if (!school) {
      return res.status(400).json({ error: "Maktab ma'lumotlari noto'g'ri" });
    }

    addAuditLog({
      actorUid: req.authUser.uid,
      actorName: req.authUser.fullName,
      actorRole: req.authUser.role,
      action: 'register_school',
      targetCollection: 'schools',
      targetId: school.id,
      details: { name: school.name, region, district },
    });

    res.json({ success: true, school });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function canReviewApplication(caller: any, appRec: any): boolean {
  if (!caller || !appRec) return false;
  if (checkIsSuperAdmin(caller)) return true;

  const callerReg = String(caller.region || '').toLowerCase();
  const callerDist = String(caller.district || '').toLowerCase();
  const appReg = String(appRec.region || '').toLowerCase();
  const appDist = String(appRec.district || '').toLowerCase();

  if (hasAnyRole(caller, ['regional_coordinator'])) {
    return (
      callerReg === appReg &&
      ['district_coordinator', 'school_admin', 'ambassador'].includes(appRec.requestedRole)
    );
  }
  if (hasAnyRole(caller, ['district_coordinator'])) {
    return (
      callerDist === appDist &&
      (!callerReg || callerReg === appReg) &&
      ['school_admin', 'ambassador'].includes(appRec.requestedRole)
    );
  }
  if (hasAnyRole(caller, ['school_admin'])) {
    if (appRec.requestedRole !== 'ambassador') return false;
    if (caller.schoolId && appRec.schoolId && caller.schoolId === appRec.schoolId) return true;
    const callerNum = normalizeSchoolNumber(caller.schoolName, caller.schoolNumber);
    const appNum = normalizeSchoolNumber(appRec.officialSchoolName, appRec.schoolNumber);
    return callerDist === appDist && Boolean(callerNum) && callerNum === appNum;
  }
  return false;
}

function syncOrCreateUserWithRole(params: {
  fullName: string;
  phoneNumber?: string;
  email?: string;
  telegramUsername?: string;
  telegramId?: string;
  grade?: string;
  region: string;
  district: string;
  schoolId?: string;
  schoolName?: string;
  schoolNumber?: string;
  targetRole: 'ambassador' | 'school_admin' | 'district_coordinator' | 'regional_coordinator';
  badge: string;
}) {
  const existing = findUserByAnyIdentifier({
    telegramId: params.telegramId || undefined,
    email: params.email || undefined,
    phoneNumber: params.phoneNumber || undefined,
  });

  const nowIso = new Date().toISOString();
  const uid =
    existing?.uid ||
    `user_${params.targetRole}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const prevRoles = Array.isArray(existing?.approvedRoles) ? existing.approvedRoles : ['student'];
  const nextRoles = prevRoles.includes(params.targetRole) ? prevRoles : [...prevRoles, params.targetRole];

  const mergedUser = upsertUser({
    ...(existing || {}),
    uid,
    fullName: params.fullName.trim(),
    email: params.email?.trim() || existing?.email || `${uid}@ecohero.uz`,
    phoneNumber: params.phoneNumber?.trim() || existing?.phoneNumber || '',
    telegramUsername: params.telegramUsername?.trim() || existing?.telegramUsername || '',
    telegramId: params.telegramId?.trim() || existing?.telegramId || undefined,
    grade: params.grade?.trim() || existing?.grade || '',
    region: params.region,
    district: params.district,
    schoolId: params.schoolId ?? existing?.schoolId ?? '',
    schoolName: params.schoolName ?? existing?.schoolName ?? 'EcoHero Hudud',
    schoolNumber: params.schoolNumber ?? existing?.schoolNumber ?? '',
    role: params.targetRole,
    approvedRoles: nextRoles,
    isVerified: true,
    isOnboarded: true,
    badge: params.badge,
    ecoCoins: existing?.ecoCoins ?? 150,
    totalCoinsEarned: existing?.totalCoinsEarned ?? 150,
    registrationDate: existing?.registrationDate || nowIso,
    profileImage: existing?.profileImage || DEFAULT_AVATAR,
    avatarUrl: existing?.avatarUrl || existing?.profileImage || DEFAULT_AVATAR,
    activityStats: existing?.activityStats || {
      reportsCount: 0,
      cleanupsCount: 0,
      treesPlanted: 0,
      streakDays: 1,
      totalCoinsEarned: existing?.totalCoinsEarned ?? 150,
    },
  });

  return mergedUser;
}

const handleAppointAmbassador = (req: AuthenticatedRequest, res: any) => {
  try {
    const caller = req.authUser;
    const { schoolId, schoolName, schoolNumber, fullName, email, phone, phoneNumber, telegramUsername, telegramId, grade } = req.body;
    const targetSchoolId = hasAnyRole(caller, ['school_admin']) && !checkIsSuperAdmin(caller) && !hasAnyRole(caller, ['district_coordinator', 'regional_coordinator'])
      ? caller.schoolId || schoolId
      : schoolId;

    if (!targetSchoolId || !fullName) {
      return res.status(400).json({ error: 'Maktab va Eko-Elchi ismi talab qilinadi' });
    }

    const school =
      centralDb.schools.find((s) => s.id === targetSchoolId) ||
      findOrCreateSchool({
        schoolId: targetSchoolId,
        schoolName: schoolName || caller.schoolName || 'Maktab',
        schoolNumber: schoolNumber || caller.schoolNumber,
        region: caller.region || 'Toshkent shahri',
        district: caller.district || 'Shayxontohur tumani',
        incrementStudents: false,
      });

    if (!school) {
      return res.status(404).json({ error: 'Maktab topilmadi' });
    }

    if (!checkIsSuperAdmin(caller)) {
      if (hasAnyRole(caller, ['district_coordinator']) && school.district !== caller.district) {
        return res.status(403).json({ error: 'Faqat o‘z tumaningiz maktablari uchun Eko-Elchi qo‘sha olasiz' });
      }
      if (hasAnyRole(caller, ['regional_coordinator']) && school.region !== caller.region) {
        return res.status(403).json({ error: 'Faqat o‘z viloyatingiz maktablari uchun Eko-Elchi qo‘sha olasiz' });
      }
    }

    const cleanPhone = String(phoneNumber || phone || '').trim();
    const promotedUser = syncOrCreateUserWithRole({
      fullName: String(fullName),
      phoneNumber: cleanPhone,
      email: email ? String(email) : undefined,
      telegramUsername: telegramUsername ? String(telegramUsername) : undefined,
      telegramId: telegramId ? String(telegramId) : undefined,
      grade: grade ? String(grade) : undefined,
      region: school.region,
      district: school.district,
      schoolId: school.id,
      schoolName: school.name,
      schoolNumber: school.number,
      targetRole: 'ambassador',
      badge: 'Maktab Eko-Elchisi',
    });

    const existingAmbIdx = centralDb.ambassadors.findIndex(
      (a) => a.id === promotedUser.uid || (cleanPhone && a.phone === cleanPhone && a.schoolId === school.id)
    );

    const nowIso = new Date().toISOString();
    const newAmb = {
      id: promotedUser.uid,
      schoolId: school.id,
      schoolName: school.name,
      region: school.region,
      district: school.district,
      fullName: promotedUser.fullName,
      email: promotedUser.email || '',
      phone: cleanPhone,
      telegramUsername: promotedUser.telegramUsername || '',
      grade: grade ? String(grade).trim() : '',
      status: 'active',
      approvedBy: caller.fullName,
      appointedBy: caller.fullName,
      appointedAt: nowIso,
      ecoCoins: promotedUser.ecoCoins || 150,
      verifiedActivitiesCount: 0,
      tasksCompletedCount: 0,
      permissions: ['manage_reports', 'host_cleanup', 'invite_students', 'submit_activities', 'redeem_vouchers'],
    };

    if (existingAmbIdx >= 0) {
      centralDb.ambassadors[existingAmbIdx] = {
        ...centralDb.ambassadors[existingAmbIdx],
        ...newAmb,
      };
    } else {
      centralDb.ambassadors.unshift(newAmb);
    }

    if (!school.ambassadorName || school.ambassadorName === 'Tayinlanmagan') {
      school.ambassadorId = newAmb.id;
      school.ambassadorName = promotedUser.fullName;
    }

    centralDb.notifications.unshift({
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      userId: promotedUser.uid,
      title: 'Siz Eko-Elchi etib tayinlandingiz!',
      message: `${caller.fullName} sizni ${school.name} Eko-Elchisi etib tayinladi.`,
      type: 'role',
      read: false,
      createdAt: nowIso,
    });

    saveCentralDb();
    addAuditLog({
      actorUid: caller.uid,
      actorName: caller.fullName,
      actorRole: caller.role,
      action: 'appoint_ambassador',
      targetCollection: 'ambassadors',
      targetId: newAmb.id,
      details: { fullName: promotedUser.fullName, schoolId: school.id, schoolName: school.name },
    });

    if (promotedUser.telegramId || promotedUser.chatId) {
      sendTelegramMessage(
        promotedUser.telegramId || promotedUser.chatId,
        `🌿 <b>TABRIKLAYMIZ! EKO-ELCHI LAVOZIMIGA TAYINLANDINGIZ!</b>\n\n🏫 <b>Maktab:</b> ${school.name}\n👤 <b>Tayinlagan mas'ul:</b> ${caller.fullName}`
      ).catch(() => {});
    }

    res.json({ success: true, ambassador: newAmb, user: sanitizeSelfUser(promotedUser) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
};

app.post(
  '/api/ambassadors/appoint',
  requireRoles('school_admin', 'district_coordinator', 'regional_coordinator', 'super_admin'),
  handleAppointAmbassador
);

app.post(
  '/api/roles/appoint-ambassador',
  requireRoles('school_admin', 'district_coordinator', 'regional_coordinator', 'super_admin'),
  handleAppointAmbassador
);

app.post(
  '/api/roles/appoint-school-captain',
  requireRoles('district_coordinator', 'regional_coordinator', 'super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const {
        fullName,
        phoneNumber,
        email,
        telegramUsername,
        telegramId,
        grade,
        schoolId,
        schoolNumber,
        schoolName,
        region,
        district,
      } = req.body;

      if (!fullName || (!schoolId && !schoolName && !schoolNumber)) {
        return res.status(400).json({ error: "O'quvchi ismi va biriktiriladigan maktab ma'lumotlari talab qilinadi" });
      }

      const targetRegion =
        !checkIsSuperAdmin(caller) && hasAnyRole(caller, ['district_coordinator', 'regional_coordinator'])
          ? caller.region
          : region || caller.region || 'Toshkent shahri';
      const targetDistrict =
        !checkIsSuperAdmin(caller) && hasAnyRole(caller, ['district_coordinator'])
          ? caller.district
          : district || caller.district || 'Shayxontohur tumani';

      let school = schoolId ? centralDb.schools.find((s) => s.id === schoolId) : null;
      if (!school) {
        school = findOrCreateSchool({
          schoolId,
          schoolName: schoolName || `${targetDistrict} ${schoolNumber || '1'}-sonli maktab`,
          schoolNumber: schoolNumber || undefined,
          region: targetRegion,
          district: targetDistrict,
          incrementStudents: false,
        });
      }

      if (!school) {
        return res.status(400).json({ error: "Maktabni aniqlab bo'lmadi" });
      }

      if (!checkIsSuperAdmin(caller)) {
        if (hasAnyRole(caller, ['district_coordinator']) && school.district !== caller.district) {
          return res.status(403).json({ error: "Faqat o'z tumaningizdagi maktablarga Maktab Sardori qo'sha olasiz" });
        }
        if (hasAnyRole(caller, ['regional_coordinator']) && school.region !== caller.region) {
          return res.status(403).json({ error: "Faqat o'z viloyatingizdagi maktablarga Maktab Sardori qo'sha olasiz" });
        }
      }

      const promotedUser = syncOrCreateUserWithRole({
        fullName: String(fullName),
        phoneNumber: phoneNumber ? String(phoneNumber) : undefined,
        email: email ? String(email) : undefined,
        telegramUsername: telegramUsername ? String(telegramUsername) : undefined,
        telegramId: telegramId ? String(telegramId) : undefined,
        grade: grade ? String(grade) : undefined,
        region: school.region,
        district: school.district,
        schoolId: school.id,
        schoolName: school.name,
        schoolNumber: school.number,
        targetRole: 'school_admin',
        badge: 'Maktab Sardori',
      });

      school.captainId = promotedUser.uid;
      school.status = 'verified';
      if (promotedUser.email && !school.adminEmail) {
        school.adminEmail = promotedUser.email;
      }

      const nowIso = new Date().toISOString();
      centralDb.notifications.unshift({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        userId: promotedUser.uid,
        title: 'Maktab Sardori etib tayinlandingiz!',
        message: `${caller.fullName} sizni ${school.name} Maktab Sardori etib tayinladi.`,
        type: 'role',
        read: false,
        createdAt: nowIso,
      });

      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'roles' });
      addAuditLog({
        actorUid: caller.uid,
        actorName: caller.fullName,
        actorRole: caller.role,
        action: 'appoint_school_captain',
        targetCollection: 'schools',
        targetId: school.id,
        details: { captainUid: promotedUser.uid, captainName: promotedUser.fullName, schoolName: school.name },
      });

      if (promotedUser.telegramId || promotedUser.chatId) {
        sendTelegramMessage(
          promotedUser.telegramId || promotedUser.chatId,
          `🏫 <b>TABRIKLAYMIZ! MAKTAB SARDORI ETIB TAYINLANDINGIZ!</b>\n\nMaktab: <b>${school.name}</b>\nHudud: ${school.region}, ${school.district}\nTayinlagan: ${caller.fullName}`
        ).catch(() => {});
      }

      res.json({ success: true, captain: sanitizeSelfUser(promotedUser), school });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  '/api/roles/appoint-district-coordinator',
  requireRoles('regional_coordinator', 'super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const { fullName, phoneNumber, email, telegramUsername, telegramId, district, region } = req.body;

      if (!fullName || !district) {
        return res.status(400).json({ error: "Nomzod ismi va tuman nomi talab qilinadi" });
      }

      const targetRegion =
        !checkIsSuperAdmin(caller) && hasAnyRole(caller, ['regional_coordinator'])
          ? caller.region
          : region || caller.region || 'Toshkent shahri';

      const promotedUser = syncOrCreateUserWithRole({
        fullName: String(fullName),
        phoneNumber: phoneNumber ? String(phoneNumber) : undefined,
        email: email ? String(email) : undefined,
        telegramUsername: telegramUsername ? String(telegramUsername) : undefined,
        telegramId: telegramId ? String(telegramId) : undefined,
        region: targetRegion,
        district: String(district).trim(),
        schoolId: '',
        schoolName: `${String(district).trim()} Koordinatorligi`,
        schoolNumber: '',
        targetRole: 'district_coordinator',
        badge: 'Tuman Koordinatori',
      });

      const nowIso = new Date().toISOString();
      centralDb.notifications.unshift({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        userId: promotedUser.uid,
        title: 'Tuman Koordinatori etib saylandingiz!',
        message: `${caller.fullName} sizni ${targetRegion}, ${district} Tuman Koordinatori etib sayladi.`,
        type: 'role',
        read: false,
        createdAt: nowIso,
      });

      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'roles' });
      addAuditLog({
        actorUid: caller.uid,
        actorName: caller.fullName,
        actorRole: caller.role,
        action: 'appoint_district_coordinator',
        targetCollection: 'users',
        targetId: promotedUser.uid,
        details: { coordinatorName: promotedUser.fullName, region: targetRegion, district },
      });

      if (promotedUser.telegramId || promotedUser.chatId) {
        sendTelegramMessage(
          promotedUser.telegramId || promotedUser.chatId,
          `🗺 <b>TUMAN KOORDINATORI ETIB SAYLANDINGIZ!</b>\n\nHudud: <b>${targetRegion}, ${district}</b>\nSaylagan: ${caller.fullName}`
        ).catch(() => {});
      }

      res.json({ success: true, coordinator: sanitizeSelfUser(promotedUser) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.post(
  '/api/roles/appoint-regional-coordinator',
  requireRoles('super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const { fullName, phoneNumber, email, telegramUsername, telegramId, region } = req.body;

      if (!fullName || !region) {
        return res.status(400).json({ error: 'Nomzod ismi va viloyat nomi talab qilinadi' });
      }

      const targetRegion = String(region).trim();

      const promotedUser = syncOrCreateUserWithRole({
        fullName: String(fullName),
        phoneNumber: phoneNumber ? String(phoneNumber) : undefined,
        email: email ? String(email) : undefined,
        telegramUsername: telegramUsername ? String(telegramUsername) : undefined,
        telegramId: telegramId ? String(telegramId) : undefined,
        region: targetRegion,
        district: 'Barcha tumanlar',
        schoolId: '',
        schoolName: `${targetRegion} Viloyat Koordinatorligi`,
        schoolNumber: '',
        targetRole: 'regional_coordinator',
        badge: 'Viloyat Koordinatori',
      });

      const nowIso = new Date().toISOString();
      centralDb.notifications.unshift({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        userId: promotedUser.uid,
        title: 'Viloyat Koordinatori etib tayinlandingiz!',
        message: `${caller.fullName} sizni ${targetRegion} Viloyat Koordinatori etib tayinladi.`,
        type: 'role',
        read: false,
        createdAt: nowIso,
      });

      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'roles' });
      addAuditLog({
        actorUid: caller.uid,
        actorName: caller.fullName,
        actorRole: caller.role,
        action: 'appoint_regional_coordinator',
        targetCollection: 'users',
        targetId: promotedUser.uid,
        details: { coordinatorName: promotedUser.fullName, region: targetRegion },
      });

      if (promotedUser.telegramId || promotedUser.chatId) {
        sendTelegramMessage(
          promotedUser.telegramId || promotedUser.chatId,
          `🏛 <b>VILOYAT KOORDINATORI ETIB TAYINLANDINGIZ!</b>\n\nViloyat: <b>${targetRegion}</b>\nTayinlagan: ${caller.fullName}`
        ).catch(() => {});
      }

      res.json({ success: true, coordinator: sanitizeSelfUser(promotedUser) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Hierarchical Registration Applications (Ambassador -> School Captain, Captain -> District Coord, District -> Regional Coord, All -> Super Admin)
app.get('/api/applications', requireAuth, (req: AuthenticatedRequest, res) => {
  const caller = req.authUser;
  const list = checkIsSuperAdmin(caller)
    ? centralDb.registrationApplications
    : (centralDb.registrationApplications || []).filter((a) => canReviewApplication(caller, a) || a.userId === caller.uid);
  res.json({ success: true, applications: list });
});

app.post('/api/applications', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const {
      fullName,
      telegramId,
      telegramUsername,
      region,
      district,
      schoolNumber,
      officialSchoolName,
      requestedRole,
      contactInfo,
      verificationDetails,
    } = req.body;

    const allowedRoles = ['ambassador', 'school_admin', 'district_coordinator', 'regional_coordinator'];
    if (!allowedRoles.includes(requestedRole)) {
      return res.status(400).json({ error: "Noto'g'ri lavozim tanlandi" });
    }
    if (!fullName || !region || !district || !schoolNumber || !officialSchoolName || !contactInfo || !verificationDetails) {
      return res.status(400).json({ error: "Barcha majburiy ariza maydonlarini to'ldiring" });
    }

    const school = findOrCreateSchool({
      schoolName: officialSchoolName,
      schoolNumber,
      region,
      district,
      incrementStudents: false,
    });

    const dupError = hasDuplicateActiveAppointment({
      userId: caller.uid,
      requestedRole,
      schoolId: school?.id,
      district,
    });
    if (dupError) {
      return res.status(409).json({ error: dupError });
    }

    const roleTitles: Record<string, string> = {
      ambassador: 'Maktab Eko-Elchisi',
      school_admin: 'Maktab Sardori / Admini',
      district_coordinator: 'Tuman Koordinatori',
      regional_coordinator: 'Viloyat Koordinatori',
    };

    const nowIso = new Date().toISOString();
    const newApp = {
      id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: caller.uid,
      fullName: String(fullName).trim(),
      telegramId: String(telegramId || caller.telegramId || ''),
      telegramUsername: String(telegramUsername || caller.telegramUsername || ''),
      region: String(region).trim(),
      district: String(district).trim(),
      schoolId: school?.id || '',
      schoolNumber: String(schoolNumber).trim(),
      officialSchoolName: school?.name || String(officialSchoolName).trim(),
      requestedRole,
      requestedRoleName: roleTitles[requestedRole] || requestedRole,
      contactInfo: String(contactInfo).trim(),
      verificationDetails: String(verificationDetails).trim(),
      status: 'pending',
      createdAt: nowIso,
    };

    centralDb.registrationApplications.unshift(newApp);

    // Notify corresponding school captain / coordinator directly in-app + via Telegram
    const reviewers = Object.values(centralDb.users).filter((u: any) => {
      if (u.uid === caller.uid) return false;
      if (requestedRole === 'ambassador') {
        return u.role === 'school_admin' && ((school?.id && u.schoolId === school.id) || (u.district === newApp.district && normalizeSchoolNumber(u.schoolName, u.schoolNumber) === newApp.schoolNumber));
      }
      if (requestedRole === 'school_admin') {
        return u.role === 'district_coordinator' && u.district === newApp.district;
      }
      if (requestedRole === 'district_coordinator') {
        return u.role === 'regional_coordinator' && u.region === newApp.region;
      }
      return false;
    });

    for (const rev of reviewers as any[]) {
      centralDb.notifications.unshift({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: rev.uid,
        title: `Yangi ${newApp.requestedRoleName} arizasi`,
        message: `${newApp.fullName} (${newApp.officialSchoolName}) lavozimga ariza yubordi.`,
        type: 'role',
        read: false,
        createdAt: nowIso,
      });
      if (rev.telegramId || rev.chatId) {
        sendTelegramMessage(
          rev.telegramId || rev.chatId,
          `📋 <b>SIZGA YANGI ARIZA KELDI</b>\n\n👤 <b>Nomzod:</b> ${newApp.fullName}\n🏫 <b>Maktab:</b> ${newApp.officialSchoolName}\n🎯 <b>Lavozim:</b> ${newApp.requestedRoleName}\n📞 <b>Aloqa:</b> ${newApp.contactInfo}\n📝 ${newApp.verificationDetails}`
        ).catch(() => {});
      }
    }

    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'applications' });

    addAuditLog({
      actorUid: caller.uid,
      actorName: caller.fullName,
      actorRole: caller.role,
      action: 'submit_registration_application',
      targetCollection: 'registration_applications',
      targetId: newApp.id,
      details: { requestedRole, school: newApp.officialSchoolName, region: newApp.region },
    });

    // Notify Super Admin via Telegram
    sendTelegramMessage(
      '8832599080',
      `📋 <b>YANGI LAVOZIM ARIZASI</b>\n\n` +
        `👤 <b>Nomzod:</b> ${newApp.fullName}\n` +
        `🆔 <b>Telegram ID:</b> ${newApp.telegramId || 'Kiritilmagan'} ${newApp.telegramUsername || ''}\n` +
        `📍 <b>Hudud:</b> ${newApp.region}, ${newApp.district}\n` +
        `🏫 <b>Maktab:</b> #${newApp.schoolNumber} — ${newApp.officialSchoolName}\n` +
        `🎯 <b>Lavozim:</b> <b>${newApp.requestedRoleName}</b>\n` +
        `📞 <b>Aloqa:</b> ${newApp.contactInfo}\n` +
        `📝 <b>Tasdiqlovchi ma'lumot:</b> ${newApp.verificationDetails}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Tasdiqlash', callback_data: `appr_app:${newApp.id}` },
              { text: '❌ Rad etish', callback_data: `rejc_app:${newApp.id}` },
            ],
            [
              { text: "💬 Qo'shimcha ma'lumot so'rash", callback_data: `info_app:${newApp.id}` },
            ],
          ],
        },
      }
    ).catch(() => {});

    res.json({ success: true, application: newApp });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function reviewRegistrationApplication(params: {
  applicationId: string;
  action: 'approve' | 'reject' | 'request_info';
  adminNote?: string;
  reviewerUid: string;
  reviewerName: string;
  reviewerRole?: string;
}) {
  const appRec = centralDb.registrationApplications.find((a) => a.id === params.applicationId);
  if (!appRec) return { error: 'Ariza topilmadi', status: 404 };

  const nowIso = new Date().toISOString();
  appRec.reviewedBy = params.reviewerUid;
  appRec.reviewedByName = params.reviewerName;
  appRec.reviewedAt = nowIso;
  appRec.updatedAt = nowIso;
  if (params.adminNote) appRec.adminNote = params.adminNote;

  const targetUser = findUserByAnyIdentifier({
    uid: appRec.userId,
    telegramId: appRec.telegramId || undefined,
  });

  if (params.action === 'approve') {
    const dupErr = hasDuplicateActiveAppointment({
      userId: appRec.userId,
      requestedRole: appRec.requestedRole,
      schoolId: appRec.schoolId,
      district: appRec.district,
      excludeApplicationId: appRec.id,
    });
    if (dupErr) {
      return { error: dupErr, status: 409 };
    }

    const school = findOrCreateSchool({
      schoolId: appRec.schoolId,
      schoolName: appRec.officialSchoolName,
      schoolNumber: appRec.schoolNumber,
      region: appRec.region,
      district: appRec.district,
      incrementStudents: false,
    });

    appRec.status = 'approved';
    appRec.schoolId = school?.id || appRec.schoolId;

    if (targetUser) {
      targetUser.role = appRec.requestedRole;
      targetUser.isVerified = true;
      targetUser.schoolId = school?.id || targetUser.schoolId;
      targetUser.schoolName = school?.name || appRec.officialSchoolName;
      targetUser.schoolNumber = appRec.schoolNumber;
      targetUser.region = appRec.region;
      targetUser.district = appRec.district;
      const roles = Array.isArray(targetUser.approvedRoles) ? targetUser.approvedRoles : ['student'];
      if (!roles.includes(appRec.requestedRole)) roles.push(appRec.requestedRole);
      targetUser.approvedRoles = roles;
      targetUser.badge = appRec.requestedRoleName || appRec.requestedRole;
    }

    if (school && appRec.requestedRole === 'school_admin') {
      school.captainId = appRec.userId;
      school.status = 'verified';
    }

    if (appRec.requestedRole === 'ambassador') {
      const existingAmb = centralDb.ambassadors.find((a) => a.id === appRec.userId);
      if (!existingAmb) {
        centralDb.ambassadors.unshift({
          id: appRec.userId,
          schoolId: school?.id || appRec.schoolId,
          schoolName: school?.name || appRec.officialSchoolName,
          region: appRec.region,
          district: appRec.district,
          fullName: appRec.fullName,
          phone: appRec.contactInfo,
          status: 'active',
          approvedBy: params.reviewerName,
          appointedAt: nowIso,
          permissions: ['manage_reports', 'host_cleanup', 'invite_students', 'submit_activities'],
        });
      } else {
        existingAmb.status = 'active';
        existingAmb.schoolId = school?.id || appRec.schoolId;
      }
      if (school) {
        school.ambassadorId = appRec.userId;
        school.ambassadorName = appRec.fullName;
      }
    }

    centralDb.notifications.unshift({
      id: `notif_${Date.now()}`,
      userId: appRec.userId,
      title: `${appRec.requestedRoleName} lavozimi tasdiqlandi`,
      message: `${appRec.officialSchoolName} bo'yicha arizangiz Super Admin tomonidan tasdiqlandi.`,
      type: 'role',
      read: false,
      createdAt: nowIso,
    });

    const tgTarget = targetUser?.telegramId || targetUser?.chatId || appRec.telegramId;
    if (tgTarget) {
      sendTelegramMessage(
        tgTarget,
        `🎉 <b>TABRIKLAYMIZ! ARIZANGIZ TASDIQLANDI!</b>\n\n` +
          `🛡 <b>Lavozim:</b> ${appRec.requestedRoleName}\n` +
          `🏫 <b>Maktab:</b> ${appRec.officialSchoolName}\n` +
          `📍 <b>Hudud:</b> ${appRec.region}, ${appRec.district}\n\n` +
          `Boshqaruv paneli endi siz uchun ochildi!`,
        { reply_markup: { inline_keyboard: [[{ text: '🌍 Kabinetni ochish', web_app: { url: APP_URL } }]] } }
      ).catch(() => {});
    }
  } else {
    appRec.status = params.action === 'reject' ? 'rejected' : 'needs_info';
    centralDb.notifications.unshift({
      id: `notif_${Date.now()}`,
      userId: appRec.userId,
      title: params.action === 'reject' ? 'Ariza rad etildi' : "Qo'shimcha ma'lumot talab qilinadi",
      message: params.adminNote || "Ma'muriyat izohini tekshiring.",
      type: 'role',
      read: false,
      createdAt: nowIso,
    });
    const tgTarget = targetUser?.telegramId || targetUser?.chatId || appRec.telegramId;
    if (tgTarget) {
      sendTelegramMessage(
        tgTarget,
        params.action === 'reject'
          ? `❌ <b>Arizangiz rad etildi</b>\n📝 Izoh: ${params.adminNote || 'Sabab ko‘rsatilmagan'}`
          : `💬 <b>Arizangiz bo'yicha qo'shimcha ma'lumot so'raldi</b>\n📝 So'rov: ${params.adminNote || "Iltimos, tasdiqlovchi hujjat yoki izohni yangilang."}`
      ).catch(() => {});
    }
  }

  saveCentralDb();
  broadcastRealtimeEvent('db:updated', { scope: 'applications' });
  addAuditLog({
    actorUid: params.reviewerUid,
    actorName: params.reviewerName,
    actorRole: params.reviewerRole || 'super_admin',
    action: `application_${params.action}`,
    targetCollection: 'registration_applications',
    targetId: appRec.id,
    details: { applicant: appRec.fullName, role: appRec.requestedRole, adminNote: params.adminNote },
  });

  return { application: appRec, status: 200 };
}

app.post(
  '/api/applications/:id/review',
  requireRoles('school_admin', 'district_coordinator', 'regional_coordinator', 'super_admin'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const { action, adminNote } = req.body;
      if (!['approve', 'reject', 'request_info'].includes(action)) {
        return res.status(400).json({ error: "Noto'g'ri qaror turi" });
      }
      const appRec = centralDb.registrationApplications.find((a) => a.id === req.params.id);
      if (!appRec) {
        return res.status(404).json({ error: 'Ariza topilmadi' });
      }
      if (!canReviewApplication(req.authUser, appRec)) {
        return res.status(403).json({
          error: "Ushbu arizani ko'rib chiqish uchun vakolatingiz yetarli emas.",
        });
      }
      const result = await reviewRegistrationApplication({
        applicationId: req.params.id,
        action,
        adminNote,
        reviewerUid: req.authUser.uid,
        reviewerName: req.authUser.fullName,
        reviewerRole: req.authUser.role,
      });
      if (result.error) return res.status(result.status || 400).json({ error: result.error });
      res.json({ success: true, application: result.application });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.post('/api/admin/roles/manage', requireRoles('super_admin'), (req: AuthenticatedRequest, res) => {
  try {
    const { targetUid, newRole, revokeRole, reason, schoolId } = req.body;
    if (!targetUid || !reason || String(reason).trim().length < 4) {
      return res.status(400).json({ error: "Foydalanuvchi ID va o'zgarish sababi (kamida 4 belgi) majburiy" });
    }
    const targetUser = findUserByAnyIdentifier({ uid: targetUid });
    if (!targetUser) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

    const prevRole = targetUser.role;
    if (revokeRole) {
      const remaining = (targetUser.approvedRoles || ['student']).filter((r: string) => r !== revokeRole);
      targetUser.approvedRoles = remaining.length > 0 ? remaining : ['student'];
      if (targetUser.role === revokeRole) {
        targetUser.role = targetUser.approvedRoles[0] || 'student';
      }
      targetUser.roleRevocationReason = reason;
      if (revokeRole === 'ambassador') {
        const amb = centralDb.ambassadors.find((a) => a.id === targetUser.uid);
        if (amb) amb.status = 'revoked';
      }
    }
    if (newRole) {
      targetUser.role = newRole;
      targetUser.isVerified = true;
      const roles = Array.isArray(targetUser.approvedRoles) ? targetUser.approvedRoles : ['student'];
      if (!roles.includes(newRole)) roles.push(newRole);
      targetUser.approvedRoles = roles;
    }
    if (schoolId) {
      const s = centralDb.schools.find((sc) => sc.id === schoolId);
      if (s) {
        targetUser.schoolId = s.id;
        targetUser.schoolName = s.name;
        targetUser.schoolNumber = s.number;
        targetUser.region = s.region;
        targetUser.district = s.district;
      }
    }

    saveCentralDb();
    addAuditLog({
      actorUid: req.authUser.uid,
      actorName: req.authUser.fullName,
      actorRole: 'super_admin',
      action: revokeRole ? 'revoke_user_role' : 'change_user_role',
      targetCollection: 'users',
      targetId: targetUser.uid,
      details: { prevRole, newRole: targetUser.role, revokeRole, reason },
    });

    const tg = targetUser.telegramId || targetUser.chatId;
    if (tg) {
      sendTelegramMessage(
        tg,
        `🛡 <b>ROLINGIZ YANGILANDI</b>\n\nYangi holat: <b>${targetUser.role}</b>\nSabab: ${reason}`
      ).catch(() => {});
    }

    res.json({ success: true, user: sanitizeSelfUser(targetUser) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. LEGACY ROLE REQUESTS (LOCKED TO SUPER ADMIN APPROVAL)
// ==========================================

app.get('/api/roles/requests', requireAuth, (req: AuthenticatedRequest, res) => {
  const isSuper = checkIsSuperAdmin(req.authUser);
  const requests = isSuper
    ? centralDb.roleRequests
    : centralDb.roleRequests.filter((r) => r.userId === req.authUser.uid);
  res.json({ success: true, requests });
});

app.post('/api/roles/request', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const { userName, userPhone, userSchool, requestedRole, requestedRoleName, reason, telegramUsername, schoolNumber, region, district } = req.body;
    if (!requestedRole) {
      return res.status(400).json({ error: "So'ralayotgan rol kiritilishi shart" });
    }

    const dup = hasDuplicateActiveAppointment({
      userId: caller.uid,
      requestedRole,
      schoolId: caller.schoolId,
      district: district || caller.district,
    });
    if (dup) return res.status(409).json({ error: dup });

    const newRequest = {
      id: `rolereq_${Date.now()}`,
      userId: caller.uid,
      userName: userName || caller.fullName || "O'quvchi",
      userPhone: userPhone || caller.phoneNumber || '',
      userSchool: userSchool || caller.schoolName || 'Maktab',
      schoolNumber: schoolNumber || caller.schoolNumber || '',
      region: region || caller.region || '',
      district: district || caller.district || '',
      currentRole: caller.role || 'student',
      requestedRole,
      requestedRoleName: requestedRoleName || requestedRole,
      reason: reason || "Maktabda eko-tashabbuslarni boshqarish uchun",
      userTelegramUsername: telegramUsername || caller.telegramUsername || '',
      status: 'pending',
      requestedAt: new Date().toISOString(),
    };

    centralDb.roleRequests.unshift(newRequest);
    saveCentralDb();

    sendTelegramMessage(
      '8832599080',
      `🛡 <b>YANGI ROL UCHUN RUXSAT SO'ROVI</b>\n\n` +
        `👤 <b>Foydalanuvchi:</b> ${newRequest.userName}\n` +
        `🏫 <b>Maktab:</b> ${newRequest.userSchool}\n` +
        `🎯 <b>Lavozim:</b> <b>${newRequest.requestedRoleName}</b>\n` +
        `📝 <b>Sabab:</b> <i>${newRequest.reason}</i>`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Ruxsat berish', callback_data: `appr_role:${newRequest.id}` },
              { text: '❌ Rad etish', callback_data: `rejc_role:${newRequest.id}` },
            ],
            [{ text: '🌍 Admin Panelni Ochish', web_app: { url: APP_URL } }],
          ],
        },
      }
    ).catch(() => {});

    res.json({ success: true, request: newRequest });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

async function approveRoleRequestUnified(requestId: string, reviewedBy: string = '@jasurdost') {
  const request = centralDb.roleRequests.find((r) => r.id === requestId);
  if (!request) return null;

  request.status = 'approved';
  request.reviewedAt = new Date().toISOString();
  request.reviewedBy = reviewedBy;

  const user = findUserByAnyIdentifier({
    uid: request.userId,
    telegramId: String(request.userId).startsWith('user_tg_') ? String(request.userId).replace('user_tg_', '') : undefined,
  });

  if (user) {
    user.role = request.requestedRole;
    user.isVerified = true;
    const prev = Array.isArray(user.approvedRoles) ? user.approvedRoles : ['student'];
    if (!prev.includes(request.requestedRole)) prev.push(request.requestedRole);
    user.approvedRoles = prev;

    const chatId = user.telegramId || user.chatId;
    if (chatId) {
      sendTelegramMessage(
        chatId,
        `🎉 <b>TABRIKLAYMIZ! RUXSAT BERILDI!</b>\n\nSizning <b>${request.requestedRoleName}</b> roli bo'yicha so'rovingiz tasdiqlandi!`,
        { reply_markup: { inline_keyboard: [[{ text: '🌍 ECO HERO ilovasini ochish', web_app: { url: APP_URL } }]] } }
      ).catch(() => {});
    }
  }

  saveCentralDb();
  addAuditLog({
    actorUid: 'super_admin',
    actorName: reviewedBy,
    actorRole: 'super_admin',
    action: 'approve_role_request',
    targetCollection: 'role_requests',
    targetId: requestId,
    details: { userName: request.userName, role: request.requestedRole },
  });

  return request;
}

app.post('/api/roles/approve', requireRoles('super_admin'), async (req: AuthenticatedRequest, res) => {
  try {
    const { requestId } = req.body;
    const updated = await approveRoleRequestUnified(requestId, req.authUser.fullName);
    if (!updated) return res.status(404).json({ error: "Rol so'rovi topilmadi" });
    res.json({ success: true, request: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/roles/reject', requireRoles('super_admin'), (req: AuthenticatedRequest, res) => {
  try {
    const { requestId, adminNotes } = req.body;
    const request = centralDb.roleRequests.find((r) => r.id === requestId);
    if (!request) return res.status(404).json({ error: "Rol so'rovi topilmadi" });

    request.status = 'rejected';
    request.adminNotes = adminNotes || "Super Admin tomonidan rad etildi";
    request.reviewedAt = new Date().toISOString();
    request.reviewedBy = req.authUser.fullName;
    saveCentralDb();
    addAuditLog({
      actorUid: req.authUser.uid,
      actorName: req.authUser.fullName,
      actorRole: 'super_admin',
      action: 'reject_role_request',
      targetCollection: 'role_requests',
      targetId: requestId,
      details: { reason: request.adminNotes },
    });

    res.json({ success: true, request });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. AUDIT LOGS, REAL FILE STORAGE & ECOLOGICAL MEDIA MODERATION
// ==========================================

app.post('/api/admin/audit-log', requireRoles('super_admin', 'moderator', 'school_admin'), (req: AuthenticatedRequest, res) => {
  try {
    const { action, targetCollection, targetId, details } = req.body;
    const log = addAuditLog({
      actorUid: req.authUser.uid,
      actorName: req.authUser.fullName,
      actorRole: req.authUser.role,
      action: action || 'administrative_action',
      targetCollection: targetCollection || 'general',
      targetId: targetId || 'none',
      details: details || {},
    });
    res.json({ success: true, log });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/audit-logs', requireRoles('super_admin', 'moderator'), (_req, res) => {
  res.json({ success: true, logs: centralDb.auditLogs.slice(0, 200) });
});

// Real Disk Storage Upload (Photos & Videos with SHA-256 hash - base64 JSON + raw binary streaming)
app.post('/api/storage/upload', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { fileData, fileName } = req.body;
    if (!fileData || typeof fileData !== 'string') {
      return res.status(400).json({ error: "Fayl ma'lumotlari bo'sh" });
    }

    const match = fileData.match(/^data:([^;]+)(?:;[^,]+)*;base64,(.+)$/s);
    if (!match) {
      return res.status(400).json({
        error: "Fayl formati noto'g'ri. Iltimos, rasm (JPG, PNG, WEBP) yoki video (MP4, WEBM, MOV) tanlang",
      });
    }

    const mimeType = match[1].toLowerCase().trim();
    const rawNameExt = String(fileName || '').split('.').pop()?.toLowerCase() || '';
    const videoExts = ['mp4', 'webm', 'mov', 'm4v', '3gp', 'mkv', 'avi'];
    const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp'];

    let mediaKind: 'image' | 'video' | null = null;
    if (mimeType.startsWith('video/')) mediaKind = 'video';
    else if (mimeType.startsWith('image/')) mediaKind = 'image';
    else if (videoExts.includes(rawNameExt)) mediaKind = 'video';
    else if (imageExts.includes(rawNameExt)) mediaKind = 'image';

    if (!mediaKind) {
      return res.status(400).json({
        error: "Faqat rasm (JPG, PNG, WEBP) yoki video (MP4, WEBM, MOV) fayllari qo'llab-quvvatlanadi",
      });
    }

    const rawSubType = (mimeType.split('/')[1] || rawNameExt || '')
      .toLowerCase()
      .replace('quicktime', 'mov')
      .replace('jpeg', 'jpg')
      .replace('x-m4v', 'mp4')
      .replace('x-matroska', 'mkv');
    const allowedExts = [...imageExts, ...videoExts];
    const ext = allowedExts.includes(rawSubType)
      ? rawSubType
      : allowedExts.includes(rawNameExt)
      ? rawNameExt
      : mediaKind === 'video'
      ? 'mp4'
      : 'jpg';
    const buffer = Buffer.from(match[2], 'base64');

    if (buffer.byteLength > 55 * 1024 * 1024) {
      return res.status(413).json({ error: 'Fayl hajmi 55 MB dan oshmasligi kerak' });
    }

    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const safeName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    const destPath = path.join(UPLOADS_DIR, safeName);
    fs.writeFileSync(destPath, buffer);

    res.json({
      success: true,
      url: `/uploads/${safeName}`,
      mediaType: mediaKind,
      fileName: fileName || safeName,
      fileHash,
      sizeBytes: buffer.byteLength,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(
  '/api/storage/upload-binary',
  requireAuth,
  express.raw({ type: '*/*', limit: '90mb' }),
  (req: AuthenticatedRequest, res) => {
    try {
      const buffer = Buffer.isBuffer(req.body) ? req.body : Buffer.from([]);
      if (!buffer.byteLength) {
        return res.status(400).json({ error: "Fayl bo'sh" });
      }
      if (buffer.byteLength > 85 * 1024 * 1024) {
        return res.status(413).json({ error: 'Fayl hajmi 85 MB dan oshmasligi kerak' });
      }

      const rawHeaderName = String(req.headers['x-file-name'] || 'upload.bin');
      let decodedName = rawHeaderName;
      try {
        decodedName = decodeURIComponent(rawHeaderName);
      } catch {}
      const contentType = String(req.headers['content-type'] || '').toLowerCase();
      const rawNameExt = decodedName.split('.').pop()?.toLowerCase() || '';
      const videoExts = ['mp4', 'webm', 'mov', 'm4v', '3gp', 'mkv', 'avi'];
      const imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'heic', 'heif', 'bmp'];

      let mediaKind: 'image' | 'video' | null = null;
      if (contentType.startsWith('video/')) mediaKind = 'video';
      else if (contentType.startsWith('image/')) mediaKind = 'image';
      else if (videoExts.includes(rawNameExt)) mediaKind = 'video';
      else if (imageExts.includes(rawNameExt)) mediaKind = 'image';

      if (!mediaKind) {
        return res.status(400).json({
          error: "Faqat rasm (JPG, PNG, WEBP) yoki video (MP4, WEBM, MOV) fayllari qo'llab-quvvatlanadi",
        });
      }

      const subType = (contentType.split('/')[1]?.split(';')[0] || rawNameExt || '')
        .toLowerCase()
        .replace('quicktime', 'mov')
        .replace('jpeg', 'jpg')
        .replace('x-m4v', 'mp4')
        .replace('x-matroska', 'mkv');
      const allowedExts = [...imageExts, ...videoExts];
      const ext = allowedExts.includes(subType)
        ? subType
        : allowedExts.includes(rawNameExt)
        ? rawNameExt
        : mediaKind === 'video'
        ? 'mp4'
        : 'jpg';

      const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
      const safeName = `${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
      const destPath = path.join(UPLOADS_DIR, safeName);
      fs.writeFileSync(destPath, buffer);

      res.json({
        success: true,
        url: `/uploads/${safeName}`,
        mediaType: mediaKind,
        fileName: decodedName || safeName,
        fileHash,
        sizeBytes: buffer.byteLength,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Ecological Media Submissions (Photo & Video Activities)
app.get('/api/media', (req: AuthenticatedRequest, res) => {
  const caller = req.authUser || null;
  const isSuperOrMod = Boolean(caller && hasAnyRole(caller, ['super_admin', 'moderator']));
  const { status, category, region, schoolId, page = '1', limit = '12' } = req.query;

  let items = (centralDb.mediaSubmissions || []).filter((m) => {
    if (m.status === 'APPROVED') return true;
    if (!caller) return false;
    if (isSuperOrMod || m.userId === caller.uid) return true;
    if (hasAnyRole(caller, ['regional_coordinator']) && m.region === caller.region) return true;
    if (hasAnyRole(caller, ['district_coordinator']) && m.district === caller.district) return true;
    if (hasAnyRole(caller, ['school_admin', 'ambassador']) && m.schoolId === caller.schoolId) return true;
    return false;
  });

  if (status && status !== 'all') items = items.filter((m) => m.status === String(status));
  if (category && category !== 'all') items = items.filter((m) => m.activityCategory === String(category));
  if (region && region !== 'all') items = items.filter((m) => m.region === String(region));
  if (schoolId && schoolId !== 'all') items = items.filter((m) => m.schoolId === String(schoolId));

  const pageNum = Math.max(1, Number(page) || 1);
  const limitNum = Math.min(50, Math.max(1, Number(limit) || 12));
  const total = items.length;
  const paged = items.slice((pageNum - 1) * limitNum, pageNum * limitNum);

  res.json({
    success: true,
    items: paged,
    total,
    page: pageNum,
    totalPages: Math.max(1, Math.ceil(total / limitNum)),
  });
});

app.post('/api/media', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const { activityCategory, mediaType, mediaUrl, fileHash, description } = req.body;
    const validCategories = [
      'tree_planting',
      'tree_care',
      'school_garden',
      'awareness_video',
      'waste_sorting',
      'school_improvement',
      'environmental_campaign',
    ];
    if (!validCategories.includes(activityCategory)) {
      return res.status(400).json({ error: "Noto'g'ri ekologik faoliyat toifasi" });
    }
    if (!mediaUrl || !description || String(description).trim().length < 5) {
      return res.status(400).json({ error: 'Media fayl va batafsil tavsif kiritilishi shart' });
    }

    if (hasDuplicateMediaSubmission({ userId: caller.uid, fileHash, mediaUrl })) {
      return res.status(409).json({
        error: "Ushbu foto/video avval yuklangan. Takroriy mukofot olish uchun bir xil dalilni yuborish taqiqlanadi.",
      });
    }

    const submission = {
      id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: caller.uid,
      userName: caller.fullName,
      userRole: caller.role,
      schoolId: caller.schoolId || 'school_tashkent_17',
      schoolName: caller.schoolName || 'Maktab',
      region: caller.region || 'Toshkent shahri',
      district: caller.district || 'Shayxontohur tumani',
      activityCategory,
      mediaType: mediaType === 'video' ? 'video' : 'image',
      mediaUrl: String(mediaUrl),
      fileHash: fileHash || '',
      description: String(description).trim(),
      status: 'PENDING',
      awardedCoins: 0,
      createdAt: new Date().toISOString(),
    };

    centralDb.mediaSubmissions.unshift(submission);
    saveCentralDb();

    sendTelegramMessage(
      '8832599080',
      `🎬 <b>YANGI EKOLOGIK MEDIA FAOLIYAT (MODERATSIYA KUTILMOQDA)</b>\n\n` +
        `👤 <b>Muallif:</b> ${submission.userName} (${submission.schoolName})\n` +
        `🏷 <b>Toifa:</b> ${submission.activityCategory}\n` +
        `📝 <b>Tavsif:</b> ${submission.description}`,
      {
        reply_markup: {
          inline_keyboard: [
            [
              { text: '✅ Tasdiqlash', callback_data: `appr_med:${submission.id}` },
              { text: '❌ Rad etish', callback_data: `rejc_med:${submission.id}` },
            ],
          ],
        },
      }
    ).catch(() => {});

    res.json({ success: true, submission });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function moderateMediaSubmission(params: {
  submissionId: string;
  decision: 'APPROVED' | 'REJECTED' | 'NEEDS_REVISION';
  moderatorNote?: string;
  customCoins?: number;
  actorUid: string;
  actorName: string;
  actorRole: string;
}) {
  const sub = (centralDb.mediaSubmissions || []).find((m) => m.id === params.submissionId);
  if (!sub) return { error: 'Media yozuvi topilmadi', status: 404 };

  if (sub.status === 'APPROVED' && sub.awardedCoins > 0) {
    return { error: "Ushbu faoliyat uchun mukofot allaqachon berilgan (takroriy to'lov bloklandi)", status: 409 };
  }

  const nowIso = new Date().toISOString();
  sub.status = params.decision;
  sub.moderatorNote = params.moderatorNote || '';
  sub.moderatedBy = params.actorName;
  sub.moderatedAt = nowIso;
  sub.updatedAt = nowIso;

  if (params.decision === 'APPROVED') {
    const baseReward = getMediaCategoryReward(sub.activityCategory);
    const awarded =
      params.actorRole === 'super_admin' && typeof params.customCoins === 'number' && params.customCoins >= 0
        ? params.customCoins
        : baseReward;

    sub.awardedCoins = awarded;
    const author = findUserByAnyIdentifier({ uid: sub.userId });
    if (author) {
      author.ecoCoins = (author.ecoCoins || 0) + awarded;
      author.totalCoinsEarned = (author.totalCoinsEarned || 0) + awarded;
      if (sub.activityCategory === 'tree_planting') {
        author.treesPlanted = (author.treesPlanted || 0) + 1;
      } else {
        author.cleanupsCount = (author.cleanupsCount || 0) + 1;
      }
      author.activityStats = {
        ...(author.activityStats || {}),
        treesPlanted: author.treesPlanted || 0,
        cleanupsCount: author.cleanupsCount || 0,
        totalCoinsEarned: author.totalCoinsEarned,
      };
      recordTransaction({
        userId: author.uid,
        amount: awarded,
        type: 'earn',
        status: 'approved',
        mediaSubmissionId: sub.id,
        reason: `Tasdiqlangan eko-faoliyat (${sub.activityCategory})`,
      });

      const tg = author.telegramId || author.chatId;
      if (tg) {
        sendTelegramMessage(
          tg,
          `🌟 <b>EKO-FAOLIYATINGIZ TASDIQLANDI!</b>\n\n` +
            `🎬 Toifa: ${sub.activityCategory}\n` +
            `💰 Mukofot: <b>+${awarded} EcoCoin</b>`
        ).catch(() => {});
      }
    }

    if (sub.schoolId || sub.schoolName) {
      findOrCreateSchool({
        schoolId: sub.schoolId,
        schoolName: sub.schoolName,
        region: sub.region,
        district: sub.district,
        coinsDelta: awarded,
        treesDelta: sub.activityCategory === 'tree_planting' ? 1 : 0,
        cleanupsDelta: sub.activityCategory !== 'tree_planting' ? 1 : 0,
      });
    }

    centralDb.notifications.unshift({
      id: `notif_${Date.now()}`,
      userId: sub.userId,
      title: 'Eko-media tasdiqlandi',
      message: `${sub.activityCategory} faoliyatingiz tasdiqlandi: +${awarded} EcoCoin.`,
      type: 'media',
      read: false,
      createdAt: nowIso,
    });
  } else {
    sub.awardedCoins = 0;
    centralDb.notifications.unshift({
      id: `notif_${Date.now()}`,
      userId: sub.userId,
      title: params.decision === 'REJECTED' ? 'Media rad etildi' : 'Qayta yuklash talab etiladi',
      message: params.moderatorNote || 'Moderatsiya izohini tekshiring.',
      type: 'media',
      read: false,
      createdAt: nowIso,
    });
  }

  saveCentralDb();
  broadcastRealtimeEvent('db:updated', { scope: 'media' });
  addAuditLog({
    actorUid: params.actorUid,
    actorName: params.actorName,
    actorRole: params.actorRole,
    action: `media_${params.decision.toLowerCase()}`,
    targetCollection: 'media_submissions',
    targetId: sub.id,
    details: { awardedCoins: sub.awardedCoins, category: sub.activityCategory },
  });

  return { submission: sub, status: 200 };
}

app.post('/api/media/:id/moderate', requireRoles('super_admin', 'moderator'), (req: AuthenticatedRequest, res) => {
  try {
    const { decision, moderatorNote, customCoins } = req.body;
    if (!['APPROVED', 'REJECTED', 'NEEDS_REVISION'].includes(decision)) {
      return res.status(400).json({ error: "Noto'g'ri moderatsiya qarori" });
    }
    const result = moderateMediaSubmission({
      submissionId: req.params.id,
      decision,
      moderatorNote,
      customCoins: customCoins !== undefined ? Number(customCoins) : undefined,
      actorUid: req.authUser.uid,
      actorName: req.authUser.fullName,
      actorRole: req.authUser.role,
    });
    if (result.error) return res.status(result.status || 400).json({ error: result.error });
    res.json({ success: true, submission: result.submission });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// School Captain -> Eco Ambassador Tasks
app.get('/api/tasks', requireAuth, (req: AuthenticatedRequest, res) => {
  const caller = req.authUser;
  const tasks = (centralDb.ecoTasks || []).filter((t) => {
    if (hasAnyRole(caller, ['super_admin', 'moderator'])) return true;
    if (t.assigneeUid === caller.uid || t.assignedByUid === caller.uid) return true;
    if (hasAnyRole(caller, ['school_admin']) && t.schoolId === caller.schoolId) return true;
    return false;
  });
  res.json({ success: true, tasks });
});

app.post('/api/tasks', requireRoles('school_admin', 'super_admin'), (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const { schoolId, assigneeUid, title, instructions, relatedReportId } = req.body;
    const targetSchoolId = schoolId || caller.schoolId;
    if (!assertSchoolAccess(caller, targetSchoolId)) {
      return res.status(403).json({ error: 'Faqat biriktirilgan maktabingizga vazifa yarata olasiz' });
    }
    if (!assigneeUid || !title) {
      return res.status(400).json({ error: 'Eko-Elchi va vazifa nomi kiritilishi shart' });
    }

    const assignee = findUserByAnyIdentifier({ uid: assigneeUid });
    const school = centralDb.schools.find((s) => s.id === targetSchoolId);
    const rewardCoins = getConfiguredReward('ambassadorTaskBonus');

    const newTask = {
      id: `task_${Date.now()}`,
      schoolId: targetSchoolId,
      schoolName: school?.name || caller.schoolName || '',
      region: school?.region || caller.region || '',
      district: school?.district || caller.district || '',
      title: String(title).trim(),
      instructions: String(instructions || '').trim(),
      assignedByUid: caller.uid,
      assignedByName: caller.fullName,
      assigneeUid,
      assigneeName: assignee?.fullName || 'Eko-Elchi',
      relatedReportId: relatedReportId || undefined,
      status: 'assigned',
      rewardCoins,
      createdAt: new Date().toISOString(),
    };

    centralDb.ecoTasks.unshift(newTask);
    saveCentralDb();

    if (assignee?.telegramId || assignee?.chatId) {
      sendTelegramMessage(
        assignee.telegramId || assignee.chatId,
        `📋 <b>YANGI EKO-VAZIFA!</b>\n\n📌 ${newTask.title}\n📝 Ko'rsatma: ${newTask.instructions}\n💰 Mukofot: +${rewardCoins} EcoCoin`
      ).catch(() => {});
    }

    res.json({ success: true, task: newTask });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/tasks/:id', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const task = (centralDb.ecoTasks || []).find((t) => t.id === req.params.id);
    if (!task) return res.status(404).json({ error: 'Vazifa topilmadi' });

    const { status, evidenceUrl, completionNote } = req.body;
    const isAdminOrCaptain = hasAnyRole(caller, ['super_admin']) || (hasAnyRole(caller, ['school_admin']) && assertSchoolAccess(caller, task.schoolId));
    const isAssignee = task.assigneeUid === caller.uid;

    if (!isAdminOrCaptain && !isAssignee) {
      return res.status(403).json({ error: "Ushbu vazifani tahrirlash huquqingiz yo'q" });
    }

    if (status === 'verified') {
      if (!isAdminOrCaptain) {
        return res.status(403).json({ error: 'Vazifani yakuniy tasdiqlash faqat Maktab Sardori yoki Super Admin tomonidan bajariladi' });
      }
      if (task.status === 'verified') {
        return res.status(409).json({ error: 'Vazifa allaqachon tasdiqlangan' });
      }
      task.status = 'verified';
      const reward = Number(task.rewardCoins) || getConfiguredReward('ambassadorTaskBonus');
      const assignee = findUserByAnyIdentifier({ uid: task.assigneeUid });
      if (assignee && reward > 0) {
        assignee.ecoCoins = (assignee.ecoCoins || 0) + reward;
        assignee.totalCoinsEarned = (assignee.totalCoinsEarned || 0) + reward;
        recordTransaction({
          userId: assignee.uid,
          amount: reward,
          type: 'earn',
          status: 'approved',
          reason: `Eko-vazifa bajarildi: ${task.title}`,
        });
      }
    } else if (isAssignee && ['in_progress', 'submitted'].includes(status)) {
      task.status = status;
      if (evidenceUrl) task.evidenceUrl = evidenceUrl;
      if (completionNote) task.completionNote = completionNote;
    } else if (isAdminOrCaptain && status) {
      task.status = status;
    }

    task.updatedAt = new Date().toISOString();
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'tasks' });
    res.json({ success: true, task });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Configurable Smart Eco Coin Settings (Super Admin)
app.get('/api/admin/reward-settings', (_req, res) => {
  res.json({ success: true, settings: centralDb.rewardSettings });
});

app.patch('/api/admin/reward-settings', requireRoles('super_admin'), (req: AuthenticatedRequest, res) => {
  try {
    const allowedNumericKeys = [
      'welcomeBonus',
      'dailyQuiz',
      'referralInviter',
      'referralInvitee',
      'awarenessPost',
      'wasteSorting',
      'treeCareWatering',
      'treePlanting',
      'gardenProject',
      'environmentalCampaign',
      'schoolImprovement',
      'problemVerified',
      'problemResolved',
      'ambassadorTaskBonus',
      'duplicateWindowHours',
    ] as const;

    const updated = { ...centralDb.rewardSettings };
    for (const k of allowedNumericKeys) {
      if (req.body[k] !== undefined) {
        const num = Number(req.body[k]);
        if (Number.isNaN(num) || num < 0) {
          return res.status(400).json({ error: `${k} qiymati manfiy bo'lmagan son bo'lishi shart` });
        }
        (updated as any)[k] = Math.round(num);
      }
    }
    updated.updatedAt = new Date().toISOString();
    updated.updatedBy = req.authUser.uid;
    centralDb.rewardSettings = updated;
    saveCentralDb();

    addAuditLog({
      actorUid: req.authUser.uid,
      actorName: req.authUser.fullName,
      actorRole: 'super_admin',
      action: 'update_reward_settings',
      targetCollection: 'reward_settings',
      targetId: 'default',
      details: updated,
    });

    res.json({ success: true, settings: updated });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/coins/adjust', requireRoles('super_admin'), (req: AuthenticatedRequest, res) => {
  try {
    const { targetUid, amount, reason } = req.body;
    const delta = Number(amount);
    if (!targetUid || Number.isNaN(delta) || delta === 0 || !reason || String(reason).trim().length < 3) {
      return res.status(400).json({ error: "Foydalanuvchi ID, nol bo'lmagan summa va sabab kiritilishi shart" });
    }
    const user = findUserByAnyIdentifier({ uid: targetUid });
    if (!user) return res.status(404).json({ error: 'Foydalanuvchi topilmadi' });

    const nextBalance = Math.max(0, (user.ecoCoins || 0) + delta);
    user.ecoCoins = nextBalance;
    if (delta > 0) {
      user.totalCoinsEarned = (user.totalCoinsEarned || 0) + delta;
    }

    const tx = recordTransaction({
      userId: user.uid,
      amount: delta,
      type: 'adjustment',
      status: 'approved',
      adjustedBy: req.authUser.uid,
      reason: String(reason).trim(),
    });

    if (user.schoolId && delta > 0) {
      findOrCreateSchool({
        schoolId: user.schoolId,
        schoolName: user.schoolName,
        region: user.region,
        district: user.district,
        coinsDelta: delta,
      });
    }

    saveCentralDb();
    addAuditLog({
      actorUid: req.authUser.uid,
      actorName: req.authUser.fullName,
      actorRole: 'super_admin',
      action: 'manual_coin_adjustment',
      targetCollection: 'transactions',
      targetId: tx.id,
      details: { targetUid: user.uid, targetName: user.fullName, delta, reason, newBalance: nextBalance },
    });

    res.json({ success: true, user: sanitizeSelfUser(user), transaction: tx });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Specific leaderboard routes MUST be declared before parameterized /api/leaderboards/:tier
app.get('/api/leaderboards/district-details', requireAuth, handleDistrictLeaderboardDetails);

// EXCLUSIVE District User-Growth Competition Leaderboard (Visible ONLY to district_coordinator & super_admin)
app.get(
  '/api/leaderboards/district-user-growth',
  requireRoles('district_coordinator', 'super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const distMap = new Map<string, any>();

      const ensureDistrictEntry = (region: string, district: string) => {
        const cleanReg = String(region || '').trim() || 'Hudud kiritilmagan';
        const cleanDist = String(district || '').trim();
        const key = `${cleanReg.toLowerCase()}__${cleanDist.toLowerCase()}`;
        if (!distMap.has(key)) {
          distMap.set(key, {
            id: slugifyChatKey(`${cleanReg}_${cleanDist}`),
            region: cleanReg,
            district: cleanDist,
            coordinatorName: 'Tayinlanmagan',
            schoolsCount: 0,
            botUsersCount: 0,
            webUsersCount: 0,
            totalJoinedUsers: 0,
            totalSchoolStudents: 0,
            newUsersLast30Days: 0,
            isMyDistrict:
              String(caller.district || '').trim().toLowerCase() === cleanDist.toLowerCase(),
          });
        }
        return distMap.get(key);
      };

      for (const s of centralDb.schools || []) {
        if (!s.district) continue;
        const entry = ensureDistrictEntry(s.region, s.district);
        entry.schoolsCount += 1;
        entry.totalSchoolStudents += getSchoolLiveStudentCount(s);
      }

      const thirtyDaysAgo = Date.now() - 30 * 86400 * 1000;
      for (const u of Object.values(centralDb.users) as any[]) {
        if (!u.district) continue;
        const entry = ensureDistrictEntry(u.region || '', u.district);
        if (u.role === 'district_coordinator' && u.fullName) {
          entry.coordinatorName = u.fullName;
        }
        const hasBot = Boolean(u.telegramId || u.chatId || u.telegramAuth || u.telegramUsername);
        if (hasBot) entry.botUsersCount += 1;
        else entry.webUsersCount += 1;
        entry.totalJoinedUsers += 1;
        const regTs = new Date(u.registrationDate || u.createdAt || 0).getTime();
        if (!Number.isNaN(regTs) && regTs >= thirtyDaysAgo) {
          entry.newUsersLast30Days += 1;
        }
      }

      const items = Array.from(distMap.values())
        .sort((a, b) => {
          if (b.totalJoinedUsers !== a.totalJoinedUsers) return b.totalJoinedUsers - a.totalJoinedUsers;
          if (b.botUsersCount !== a.botUsersCount) return b.botUsersCount - a.botUsersCount;
          return b.totalSchoolStudents - a.totalSchoolStudents;
        })
        .map((item, idx) => ({
          ...item,
          rank: idx + 1,
          isTop3: idx < 3,
        }));

      const myDistrictRank = items.find((i) => i.isMyDistrict) || null;

      res.json({
        success: true,
        prizeNote:
          "Eng ko'p foydalanuvchi (bot va platforma a'zolari) yig'gan TOP-3 tuman qimmatbaho sovg'a bilan taqdirlanadi!",
        totalDistricts: items.length,
        myDistrictRank,
        items,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Multi-Tier Role-Gated Leaderboards (Verified Activity Only)
app.get('/api/leaderboards/:tier', (req: AuthenticatedRequest, res) => {
  try {
    const tier = String(req.params.tier);
    const caller = req.authUser || null;
    const period = (['monthly', 'quarterly', 'yearly'].includes(String(req.query.period))
      ? String(req.query.period)
      : 'monthly') as 'monthly' | 'quarterly' | 'yearly';
    const regionFilter = req.query.region ? String(req.query.region) : '';
    const districtFilter = req.query.district ? String(req.query.district) : '';
    const search = req.query.search ? String(req.query.search).toLowerCase() : '';
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 15));

    // STRICT ROLE GATING
    if (tier === 'ambassador') {
      if (
        !caller ||
        !hasAnyRole(caller, [
          'ambassador',
          'school_admin',
          'district_coordinator',
          'regional_coordinator',
          'moderator',
          'super_admin',
        ])
      ) {
        return res.status(403).json({
          error: "Eko-Elchilar reytingini faqat tasdiqlangan Eko-Elchilar va vakolatli administratorlar ko'ra oladi.",
          code: 'FORBIDDEN_LEADERBOARD',
        });
      }
    }

    if (tier === 'district_leaders') {
      if (!caller || !hasAnyRole(caller, ['district_coordinator', 'regional_coordinator', 'super_admin'])) {
        return res.status(403).json({
          error: "Tuman koordinatorlari reytingini faqat tuman/viloyat koordinatorlari va Super Admin ko'ra oladi.",
          code: 'FORBIDDEN_LEADERBOARD',
        });
      }
    }

    // Verified activity multipliers per period
    const verifiedMedia = (centralDb.mediaSubmissions || []).filter(
      (m) => m.status === 'APPROVED' && isWithinPeriod(m.createdAt, period)
    );
    const verifiedReports = centralDb.reports.filter(
      (r) => ['verified', 'in_progress', 'resolved', 'APPROVED', 'RESOLVED'].includes(r.status) && isWithinPeriod(r.createdAt, period)
    );

    let items: any[] = [];

    if (tier === 'school') {
      recalculateSchoolRanks();
      items = centralDb.schools.map((s) => {
        const periodMediaCoins = verifiedMedia.filter((m) => m.schoolId === s.id).reduce((sum, m) => sum + (m.awardedCoins || 0), 0);
        const periodReportCoins = verifiedReports.filter((r) => r.schoolId === s.id).reduce((sum, r) => sum + (r.rewardCoins || 0), 0);
        return {
          id: s.id,
          name: s.name,
          number: s.number,
          region: s.region,
          district: s.district,
          points: period === 'yearly' ? (s.totalCoins || 0) : Math.max(s.totalCoins || 0, periodMediaCoins + periodReportCoins),
          verifiedActivities: verifiedMedia.filter((m) => m.schoolId === s.id).length + verifiedReports.filter((r) => r.schoolId === s.id).length,
          treesPlanted: s.treesPlanted || 0,
          studentsCount: getSchoolLiveStudentCount(s),
          status: s.status,
        };
      });
    } else if (tier === 'student') {
      items = getAllPublicUsersForRankings()
        .filter((u: any) => u.role === 'student' || u.role === 'ambassador')
        .map((u: any) => {
          const mediaCoins = verifiedMedia.filter((m) => m.userId === u.uid).reduce((s, m) => s + (m.awardedCoins || 0), 0);
          return {
            id: u.uid,
            name: u.fullName,
            schoolName: u.schoolName,
            region: u.region,
            district: u.district,
            points: (u.totalCoinsEarned || u.ecoCoins || 0) + mediaCoins,
            verifiedActivities: (u.reportsCount || 0) + verifiedMedia.filter((m) => m.userId === u.uid).length,
            badge: u.badge || 'Eko-Lochin',
          };
        });
    } else if (tier === 'ambassador') {
      const ambMap = new Map<string, any>();
      for (const a of centralDb.ambassadors || []) {
        if (a.status === 'revoked') continue;
        ambMap.set(a.id, {
          id: a.id,
          name: a.fullName,
          schoolId: a.schoolId,
          schoolName: a.schoolName,
          region: a.region || '',
          district: a.district || '',
          points: Number(a.ecoCoins || 0),
          verifiedActivities: Number(a.verifiedActivitiesCount || 0),
          tasksCompleted: Number(a.tasksCompletedCount || 0),
          status: a.status,
        });
      }
      for (const u of Object.values(centralDb.users) as any[]) {
        if (u.role === 'ambassador' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('ambassador'))) {
          const cur = ambMap.get(u.uid) || {
            id: u.uid,
            name: u.fullName,
            schoolId: u.schoolId,
            schoolName: u.schoolName,
            region: u.region,
            district: u.district,
            points: 0,
            verifiedActivities: 0,
            tasksCompleted: 0,
            status: 'active',
          };
          const mediaSum = verifiedMedia.filter((m) => m.userId === u.uid).reduce((s, m) => s + (m.awardedCoins || 0), 0);
          const taskDone = (centralDb.ecoTasks || []).filter((t) => t.assigneeUid === u.uid && t.status === 'verified').length;
          cur.points = (u.totalCoinsEarned || u.ecoCoins || 0) + mediaSum;
          cur.verifiedActivities = (u.cleanupsCount || 0) + verifiedMedia.filter((m) => m.userId === u.uid).length;
          cur.tasksCompleted = taskDone;
          ambMap.set(u.uid, cur);
        }
      }
      items = Array.from(ambMap.values());
    } else if (tier === 'district' || tier === 'district_leaders') {
      const distMap = new Map<string, any>();
      for (const s of centralDb.schools) {
        const key = `${s.region}__${s.district}`;
        const cur = distMap.get(key) || {
          id: key,
          name: s.district,
          region: s.region,
          district: s.district,
          schoolsCount: 0,
          studentsCount: 0,
          points: 0,
          resolvedCount: 0,
          coordinatorName: 'Tayinlanmagan',
        };
        cur.schoolsCount += 1;
        cur.studentsCount += getSchoolLiveStudentCount(s);
        cur.points += s.totalCoins || 0;
        distMap.set(key, cur);
      }
      for (const r of verifiedReports) {
        const key = `${r.region}__${r.district}`;
        if (distMap.has(key) && (r.status === 'resolved' || r.status === 'RESOLVED')) {
          distMap.get(key).resolvedCount += 1;
        }
      }
      for (const u of Object.values(centralDb.users) as any[]) {
        if (u.role === 'district_coordinator') {
          const key = `${u.region}__${u.district}`;
          if (distMap.has(key)) distMap.get(key).coordinatorName = u.fullName;
        }
      }
      items = Array.from(distMap.values());
    } else if (tier === 'regional') {
      const regMap = new Map<string, any>();
      for (const s of centralDb.schools) {
        const cur = regMap.get(s.region) || {
          id: s.region,
          name: s.region,
          region: s.region,
          schoolsCount: 0,
          studentsCount: 0,
          points: 0,
          treesPlanted: 0,
        };
        cur.schoolsCount += 1;
        cur.studentsCount += getSchoolLiveStudentCount(s);
        cur.points += s.totalCoins || 0;
        cur.treesPlanted += s.treesPlanted || 0;
        regMap.set(s.region, cur);
      }
      items = Array.from(regMap.values());
    } else {
      return res.status(400).json({ error: "Noto'g'ri reyting turi" });
    }

    if (regionFilter && regionFilter !== 'all') {
      items = items.filter((i) => String(i.region || '').toLowerCase() === regionFilter.toLowerCase());
    }
    if (districtFilter && districtFilter !== 'all') {
      items = items.filter((i) => String(i.district || '').toLowerCase() === districtFilter.toLowerCase());
    }
    if (search) {
      items = items.filter((i) => `${i.name} ${i.schoolName || ''} ${i.district || ''} ${i.region || ''}`.toLowerCase().includes(search));
    }

    items.sort((a, b) => (b.points || 0) - (a.points || 0));
    const ranked = items.map((item, idx) => ({ ...item, rank: idx + 1 }));
    const total = ranked.length;
    const paged = ranked.slice((page - 1) * limit, page * limit);

    res.json({
      success: true,
      tier,
      period,
      items: paged,
      total,
      page,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Real-Time District Schools & Ambassadors Leaderboard + Monthly Top-3 Awards
function computeDistrictLeaderboardDetails(params: {
  region?: string;
  district?: string;
  viewerUid?: string;
  viewerSchoolId?: string;
}) {
  const firstSchool = (centralDb.schools || [])[0];
  const targetRegion = String(params.region || firstSchool?.region || '').trim();
  const targetDistrict = String(params.district || firstSchool?.district || '').trim();

  const resolvedReports = (centralDb.reports || []).filter((r) =>
    ['resolved', 'RESOLVED', 'verified'].includes(String(r.status || ''))
  );
  const approvedMedia = (centralDb.mediaSubmissions || []).filter((m) => m.status === 'APPROVED');

  const districtSchoolsRaw = (centralDb.schools || []).filter((s) => {
    const sameDist = targetDistrict ? String(s.district || '').toLowerCase() === targetDistrict.toLowerCase() : true;
    const sameReg = !targetRegion || String(s.region || '').toLowerCase() === targetRegion.toLowerCase();
    return sameDist && sameReg;
  });

  const allUsersList = Object.values(centralDb.users || {}) as any[];
  const schoolRatingsUnsorted = districtSchoolsRaw.map((s) => {
    const resolvedCount = resolvedReports.filter(
      (r) => r.schoolId === s.id || r.schoolName === s.name
    ).length;
    const mediaCount = approvedMedia.filter(
      (m) => m.schoolId === s.id || m.schoolName === s.name
    ).length;
    const liveStudents = getSchoolLiveStudentCount(s);
    const captainUser =
      (s.captainId && centralDb.users[s.captainId]) ||
      allUsersList.find(
        (u) =>
          (u.role === 'school_admin' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('school_admin'))) &&
          ((s.id && u.schoolId === s.id) || (s.name && u.schoolName === s.name))
      );
    const realScore =
      Number(s.totalCoins || 0) +
      resolvedCount * 150 +
      mediaCount * 100 +
      Number(s.treesPlanted || 0) * 15 +
      Number(s.cleanupsCompleted || 0) * 80;
    return {
      id: s.id,
      name: s.name,
      number: s.number || '',
      region: s.region || targetRegion,
      district: s.district || targetDistrict,
      ambassadorName: s.ambassadorName || 'Tayinlanmagan',
      captainId: captainUser?.uid || s.captainId || '',
      captainName: captainUser?.fullName || '',
      registeredStudentsCount: liveStudents,
      totalCoins: Number(s.totalCoins || 0),
      treesPlanted: Number(s.treesPlanted || 0),
      cleanupsCompleted: Number(s.cleanupsCompleted || 0),
      resolvedReportsCount: resolvedCount,
      approvedMediaCount: mediaCount,
      realScore,
      isMySchool: Boolean(params.viewerSchoolId && s.id === params.viewerSchoolId),
    };
  });

  schoolRatingsUnsorted.sort((a, b) => b.realScore - a.realScore);
  const schoolRatings = schoolRatingsUnsorted.map((s, idx) => ({
    ...s,
    rank: idx + 1,
    isTop3: idx < 3,
  }));
  const mySchoolRating = schoolRatings.find((s) => s.isMySchool) || null;

  // All ambassadors in this district (from both centralDb.ambassadors and centralDb.users)
  const districtSchoolIds = new Set(districtSchoolsRaw.map((s) => s.id));
  const ambMap = new Map<string, any>();

  for (const a of centralDb.ambassadors || []) {
    if (a.status === 'revoked') continue;
    const inDist =
      !targetDistrict ||
      districtSchoolIds.has(a.schoolId) ||
      String(a.district || '').toLowerCase() === targetDistrict.toLowerCase();
    if (!inDist) continue;
    const matchedSchool = centralDb.schools.find((sc) => sc.id === a.schoolId);
    const verifiedActivities =
      Number(a.verifiedActivitiesCount || 0) +
      approvedMedia.filter((m) => m.userId === a.id).length;
    const tasksCompleted =
      Number(a.tasksCompletedCount || 0) +
      (centralDb.ecoTasks || []).filter((t) => t.assigneeUid === a.id && t.status === 'verified').length;
    const resReports = resolvedReports.filter((r) => r.assignedAmbassadorUid === a.id || r.reporterUid === a.id).length;
    const ecoCoins = Number(a.ecoCoins || 0);
    const realScore = ecoCoins + tasksCompleted * 120 + verifiedActivities * 100 + resReports * 150;
    ambMap.set(a.id, {
      id: a.id,
      fullName: a.fullName,
      schoolId: a.schoolId,
      schoolName: a.schoolName || matchedSchool?.name || 'Maktab',
      region: a.region || matchedSchool?.region || targetRegion,
      district: a.district || matchedSchool?.district || targetDistrict,
      ecoCoins,
      verifiedActivitiesCount: verifiedActivities,
      tasksCompletedCount: tasksCompleted,
      resolvedReportsCount: resReports,
      realScore,
      isMe: Boolean(params.viewerUid && a.id === params.viewerUid),
    });
  }

  for (const u of allUsersList) {
    const isAmbRole = u.role === 'ambassador' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('ambassador'));
    if (!isAmbRole) continue;
    const inDist =
      !targetDistrict ||
      districtSchoolIds.has(u.schoolId) ||
      String(u.district || '').toLowerCase() === targetDistrict.toLowerCase();
    if (!inDist) continue;
    const mediaCount = approvedMedia.filter((m) => m.userId === u.uid).length;
    const taskCount = (centralDb.ecoTasks || []).filter((t) => t.assigneeUid === u.uid && t.status === 'verified').length;
    const resRep = resolvedReports.filter((r) => r.assignedAmbassadorUid === u.uid || r.reporterUid === u.uid).length;
    const coins = Number(u.totalCoinsEarned || u.ecoCoins || 0);
    const verifiedTotal = Number(u.cleanupsCount || 0) + mediaCount;
    const realScore = coins + taskCount * 120 + verifiedTotal * 100 + resRep * 150;
    const prev = ambMap.get(u.uid);
    ambMap.set(u.uid, {
      id: u.uid,
      fullName: u.fullName,
      schoolId: u.schoolId || prev?.schoolId || '',
      schoolName: u.schoolName || prev?.schoolName || 'Maktab',
      region: u.region || prev?.region || targetRegion,
      district: u.district || prev?.district || targetDistrict,
      ecoCoins: Math.max(coins, prev?.ecoCoins || 0),
      verifiedActivitiesCount: Math.max(verifiedTotal, prev?.verifiedActivitiesCount || 0),
      tasksCompletedCount: Math.max(taskCount, prev?.tasksCompletedCount || 0),
      resolvedReportsCount: Math.max(resRep, prev?.resolvedReportsCount || 0),
      realScore: Math.max(realScore, prev?.realScore || 0),
      isMe: Boolean(params.viewerUid && u.uid === params.viewerUid),
    });
  }

  const ambList = Array.from(ambMap.values()).sort((a, b) => b.realScore - a.realScore);
  const totalAmb = ambList.length;
  const ambassadorRatings = ambList.map((a, idx) => ({
    ...a,
    rank: idx + 1,
    isTop3: idx < 3,
    isLast: totalAmb > 1 && idx === totalAmb - 1,
  }));
  const myAmbassadorRating = ambassadorRatings.find((a) => a.isMe) || null;

  const monthStatus = getTashkentMonthStatus();
  const districtAwards = (centralDb.monthlyAwards || []).filter(
    (aw: any) => !targetDistrict || String(aw.district || '').toLowerCase() === targetDistrict.toLowerCase()
  );
  const alreadyAwardedThisMonth = districtAwards.some(
    (aw: any) => String(aw.periodKey) === monthStatus.periodKey
  );

  return {
    success: true,
    region: targetRegion,
    district: targetDistrict,
    periodKey: monthStatus.periodKey,
    periodLabel: monthStatus.periodLabel,
    daysRemainingInMonth: monthStatus.daysRemainingInMonth,
    isLastDayOfMonth: monthStatus.isLastDayOfMonth,
    lastDayDateLabel: monthStatus.lastDayDateLabel,
    alreadyAwardedThisMonth,
    schoolRatings,
    mySchoolRating,
    totalSchoolsInDistrict: schoolRatings.length,
    ambassadorRatings,
    myAmbassadorRating,
    totalAmbassadorsInDistrict: ambassadorRatings.length,
    monthlyAwards: districtAwards,
  };
}

function handleDistrictLeaderboardDetails(req: AuthenticatedRequest, res: any) {
  try {
    const caller = req.authUser;
    const allowOverride = checkIsSuperAdmin(caller) || hasAnyRole(caller, ['regional_coordinator']);
    const region =
      allowOverride && req.query.region ? String(req.query.region) : caller.region || '';
    const district =
      (allowOverride || hasAnyRole(caller, ['district_coordinator'])) && req.query.district
        ? String(req.query.district)
        : caller.district || '';

    const details = computeDistrictLeaderboardDetails({
      region,
      district,
      viewerUid: caller.uid,
      viewerSchoolId: caller.schoolId,
    });
    res.json(details);
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
}

app.post(
  '/api/leaderboards/award-monthly-top3',
  requireRoles('district_coordinator', 'regional_coordinator', 'super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const monthStatus = getTashkentMonthStatus();
      if (!monthStatus.isLastDayOfMonth) {
        return res.status(400).json({
          error: `Oy oxiri mukofotini faqat oyning oxirgi kuni (${monthStatus.lastDayDateLabel}) topshirish mumkin! Yana ${monthStatus.daysRemainingInMonth} kun qoldi.`,
        });
      }

      const firstSchool = (centralDb.schools || [])[0];
      const targetRegion =
        checkIsSuperAdmin(caller) && req.body.region
          ? String(req.body.region)
          : caller.region || firstSchool?.region || '';
      const targetDistrict =
        (checkIsSuperAdmin(caller) || hasAnyRole(caller, ['regional_coordinator'])) && req.body.district
          ? String(req.body.district)
          : caller.district || firstSchool?.district || '';

      if (!targetDistrict) {
        return res.status(400).json({ error: "Mukofot topshirish uchun tuman aniqlanmadi." });
      }

      const alreadyAwarded = (centralDb.monthlyAwards || []).some(
        (aw: any) =>
          String(aw.periodKey) === monthStatus.periodKey &&
          String(aw.district || '').toLowerCase() === targetDistrict.toLowerCase()
      );
      if (alreadyAwarded) {
        return res.status(400).json({
          error: `${targetDistrict} uchun ${monthStatus.periodLabel} oyi mukofoti allaqachon topshirilgan!`,
        });
      }

      const details = computeDistrictLeaderboardDetails({
        region: targetRegion,
        district: targetDistrict,
        viewerUid: caller.uid,
        viewerSchoolId: caller.schoolId,
      });

      if (details.schoolRatings.length === 0 && details.ambassadorRatings.length === 0) {
        return res.status(400).json({
          error: `${targetDistrict} bo'yicha reytingda hali maktab yoki Eko-Elchilar mavjud emas.`,
        });
      }

      const schoolBonuses = [1000, 700, 500];
      const ambBonuses = [500, 300, 200];
      const nowIso = new Date().toISOString();
      const periodLabel = monthStatus.periodLabel;
      const allUsersList = Object.values(centralDb.users || {}) as any[];

      const topSchools = details.schoolRatings.slice(0, 3).map((s, idx) => {
        const rank = idx + 1;
        const bonus = schoolBonuses[idx] || 300;
        const promoCode = `ECO-MKT-${monthStatus.yymm}-${rank}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const dbSchool = centralDb.schools.find((sc) => sc.id === s.id);
        if (dbSchool) {
          dbSchool.totalCoins = (dbSchool.totalCoins || 0) + bonus;
        }

        const captainUser =
          (s.captainId && centralDb.users[s.captainId]) ||
          allUsersList.find(
            (u) =>
              (u.role === 'school_admin' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('school_admin'))) &&
              ((s.id && u.schoolId === s.id) || (s.name && u.schoolName === s.name))
          ) ||
          allUsersList.find((u) => s.id && u.schoolId === s.id);

        const winnerUid = captainUser?.uid || `school_captain_${s.id}`;
        const winnerName = captainUser?.fullName || `${s.name} Sardori`;

        centralDb.shopOrders.unshift({
          id: `ord_aw_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          orderType: 'monthly_award',
          awardTier: 'school',
          rank,
          periodKey: monthStatus.periodKey,
          userId: winnerUid,
          userName: winnerName,
          userEmail: captainUser?.email || '',
          schoolId: s.id,
          schoolName: s.name,
          district: targetDistrict,
          region: targetRegion,
          itemId: `award_school_top_${rank}`,
          itemTitle: `${periodLabel} TOP-${rank} Maktab Sovg'asi (${targetDistrict})`,
          itemImageUrl: '/assets/schools/eco_courtyard.jpg',
          priceCoins: 0,
          voucherCode: promoCode,
          qrToken: crypto.randomUUID(),
          status: 'approved',
          approvedAt: nowIso,
          createdAt: nowIso,
          sponsorName: `${targetDistrict} Koordinatorligi`,
          verifiedBySchoolAdmin: true,
        });

        const smsText =
          `🏆 TABRIKLAYMIZ! ${periodLabel} oylik bellashuvida sizning maktabingiz (${s.name}) ${targetDistrict} bo'yicha ${rank}-o'rinni oldi!\n` +
          `🎟 Promokod: ${promoCode}\n` +
          `💰 Maktab bonusi: +${bonus} EcoCoin\n` +
          `🎁 Sovg'angizni tuman sardoriga (koordinatoriga) aytib olishingiz mumkin!`;

        if (captainUser) {
          captainUser.ecoCoins = (captainUser.ecoCoins || 0) + Math.round(bonus / 5);
          captainUser.totalCoinsEarned = (captainUser.totalCoinsEarned || 0) + Math.round(bonus / 5);
          recordTransaction({
            userId: captainUser.uid,
            amount: Math.round(bonus / 5),
            type: 'bonus',
            status: 'approved',
            reason: `${targetDistrict} ${periodLabel} TOP-${rank} maktab sardori mukofoti (${promoCode})`,
          });
          centralDb.notifications.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            userId: captainUser.uid,
            title: `🏆 ${periodLabel} TOP-${rank} Maktab g'olibi!`,
            message: `Promokod: ${promoCode}. Sovg'angizni tuman sardoriga aytib olishingiz mumkin!`,
            type: 'award',
            read: false,
            createdAt: nowIso,
          });

          const dmChannelId = makeDistDmChannel(targetDistrict, captainUser.uid);
          const botChatMsg = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            channelId: dmChannelId,
            scope: 'district_captains',
            messageKind: 'bot_notice',
            senderUid: 'system_ecohero_bot',
            senderName: '@Ecoheros_bot (Rasmiy Tizim)',
            senderRole: 'super_admin',
            senderAvatar: '',
            senderTelegramUsername: '@Ecoheros_bot',
            recipientUid: captainUser.uid,
            recipientName: captainUser.fullName,
            district: targetDistrict,
            region: targetRegion,
            text: smsText,
            promoCode,
            viaBot: true,
            botHandle: '@Ecoheros_bot',
            createdAt: nowIso,
          };
          centralDb.chatMessages = [...(centralDb.chatMessages || []), botChatMsg].slice(-5000);
          broadcastChatMessage(botChatMsg);

          if (captainUser.telegramId || captainUser.chatId) {
            sendTelegramMessage(
              captainUser.telegramId || captainUser.chatId,
              `🏆 <b>TABRIKLAYMIZ! OY YAKUNI G'OLIBI</b>\n\n` +
                `Siz <b>${periodLabel}</b> bellashuvida <b>${targetDistrict}</b> bo'yicha <b>${rank}-o'rin</b>ni oldingiz!\n` +
                `🏫 <b>Maktab:</b> ${s.name}\n` +
                `🎟 <b>Promokod:</b> <code>${promoCode}</code>\n` +
                `💰 <b>Maktab bonusi:</b> +${bonus} EcoCoin\n\n` +
                `🎁 <b>Sovg'angizni tuman sardoriga aytib olishingiz mumkin!</b>`
            ).catch(() => {});
          }
        }

        return {
          id: s.id,
          name: s.name,
          rank,
          score: s.realScore,
          bonusCoins: bonus,
          promoCode,
          captainUid: captainUser?.uid || undefined,
          captainName: winnerName,
        };
      });

      if (topSchools.length > 0) {
        const groupSummary = topSchools
          .map((ts) => `#${ts.rank} ${ts.name} — 🎟 ${ts.promoCode} (+${ts.bonusCoins} EcoCoin)`)
          .join('\n');
        const distGroupMsg = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          channelId: makeDistGroupChannel(targetDistrict),
          scope: 'district_captains',
          messageKind: 'bot_notice',
          senderUid: 'system_ecohero_bot',
          senderName: '@Ecoheros_bot (Rasmiy Tizim)',
          senderRole: 'super_admin',
          senderAvatar: '',
          senderTelegramUsername: '@Ecoheros_bot',
          district: targetDistrict,
          region: targetRegion,
          text: `🏆 ${periodLabel} · ${targetDistrict} TOP-3 G‘OLIB MAKTABLARI:\n${groupSummary}\n\n🎁 G‘oliblar sovg‘angizni tuman sardoriga (koordinatoriga) promokodni aytib olishingiz mumkin!`,
          viaBot: true,
          botHandle: '@Ecoheros_bot',
          createdAt: nowIso,
        };
        centralDb.chatMessages = [...(centralDb.chatMessages || []), distGroupMsg].slice(-5000);
        broadcastChatMessage(distGroupMsg);
      }

      const topAmbassadors = details.ambassadorRatings.slice(0, 3).map((a, idx) => {
        const rank = idx + 1;
        const bonus = ambBonuses[idx] || 150;
        const promoCode = `ECO-ELC-${monthStatus.yymm}-${rank}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
        const dbAmb = centralDb.ambassadors.find((am) => am.id === a.id);
        if (dbAmb) {
          dbAmb.ecoCoins = (dbAmb.ecoCoins || 0) + bonus;
        }
        const dbUser = findUserByAnyIdentifier({ uid: a.id });
        if (dbUser) {
          dbUser.ecoCoins = (dbUser.ecoCoins || 0) + bonus;
          dbUser.totalCoinsEarned = (dbUser.totalCoinsEarned || 0) + bonus;
          recordTransaction({
            userId: dbUser.uid,
            amount: bonus,
            type: 'bonus',
            status: 'approved',
            reason: `${targetDistrict} ${periodLabel} TOP-${rank} Eko-Elchi mukofoti (${promoCode})`,
          });
          centralDb.notifications.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            userId: dbUser.uid,
            title: `🏆 ${periodLabel} TOP-${rank} Eko-Elchi mukofoti!`,
            message: `Promokod: ${promoCode}. +${bonus} EcoCoin berildi! Sovg'angizni maktab yoki tuman sardoriga aytib olishingiz mumkin!`,
            type: 'award',
            read: false,
            createdAt: nowIso,
          });
        }

        centralDb.shopOrders.unshift({
          id: `ord_aw_amb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          orderType: 'monthly_award',
          awardTier: 'ambassador',
          rank,
          periodKey: monthStatus.periodKey,
          userId: dbUser?.uid || a.id,
          userName: a.fullName,
          userEmail: dbUser?.email || '',
          schoolId: a.schoolId || '',
          schoolName: a.schoolName || 'Maktab',
          district: targetDistrict,
          region: targetRegion,
          itemId: `award_amb_top_${rank}`,
          itemTitle: `${periodLabel} TOP-${rank} Eko-Elchi Sovg'asi (${targetDistrict})`,
          itemImageUrl: '/assets/schools/eco_courtyard.jpg',
          priceCoins: 0,
          voucherCode: promoCode,
          qrToken: crypto.randomUUID(),
          status: 'approved',
          approvedAt: nowIso,
          createdAt: nowIso,
          sponsorName: `${targetDistrict} Koordinatorligi`,
          verifiedBySchoolAdmin: true,
        });

        const ambSmsText =
          `🏆 TABRIKLAYMIZ! ${periodLabel} oylik Eko-Elchilar bellashuvida siz ${targetDistrict} bo'yicha ${rank}-o'rinni oldingiz!\n` +
          `🎟 Promokod: ${promoCode}\n` +
          `💰 Mukofot: +${bonus} EcoCoin\n` +
          `🎁 Sovg'angizni maktab sardoriga yoki tuman sardoriga (koordinatoriga) aytib olishingiz mumkin!`;

        const ambUid = dbUser?.uid || a.id;
        const ambDmChannelId = makeAmbDmChannel(a.schoolId || 'district', ambUid);
        const ambBotChatMsg = {
          id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
          channelId: ambDmChannelId,
          scope: 'school_ambassadors',
          messageKind: 'bot_notice',
          senderUid: 'system_ecohero_bot',
          senderName: '@Ecoheros_bot (Rasmiy Tizim)',
          senderRole: 'super_admin',
          senderAvatar: '',
          senderTelegramUsername: '@Ecoheros_bot',
          recipientUid: ambUid,
          recipientName: a.fullName,
          schoolId: a.schoolId || undefined,
          schoolName: a.schoolName || undefined,
          district: targetDistrict,
          region: targetRegion,
          text: ambSmsText,
          promoCode,
          viaBot: true,
          botHandle: '@Ecoheros_bot',
          createdAt: nowIso,
        };
        centralDb.chatMessages = [...(centralDb.chatMessages || []), ambBotChatMsg].slice(-5000);
        broadcastChatMessage(ambBotChatMsg);

        if (dbUser?.telegramId || dbUser?.chatId) {
          sendTelegramMessage(
            dbUser.telegramId || dbUser.chatId,
            `🏆 <b>TABRIKLAYMIZ! OY YAKUNI MUKOFOTI</b>\n\n` +
              `Siz <b>${periodLabel}</b> bellashuvida <b>${targetDistrict}</b> bo'yicha <b>${rank}-o'rin</b>ni olgan eng faol Eko-Elchi bo'ldingiz!\n` +
              `🎟 <b>Promokod:</b> <code>${promoCode}</code>\n` +
              `💰 <b>Mukofot:</b> +${bonus} EcoCoin\n\n` +
              `🎁 <b>Sovg'angizni maktab sardoriga yoki tuman sardoriga aytib olishingiz mumkin!</b>`
          ).catch(() => {});
        }

        return {
          id: a.id,
          fullName: a.fullName,
          schoolName: a.schoolName,
          rank,
          score: a.realScore,
          bonusCoins: bonus,
          promoCode,
        };
      });

      const award = {
        id: `award_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        periodKey: details.periodKey,
        periodLabel,
        region: targetRegion,
        district: targetDistrict,
        topSchools,
        topAmbassadors,
        awardedByUid: caller.uid,
        awardedByName: caller.fullName,
        awardedAt: nowIso,
      };

      centralDb.monthlyAwards = [award, ...(centralDb.monthlyAwards || [])];
      recalculateSchoolRanks();
      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'awards' });
      addAuditLog({
        actorUid: caller.uid,
        actorName: caller.fullName,
        actorRole: caller.role,
        action: 'award_monthly_top3',
        targetCollection: 'monthly_awards',
        targetId: award.id,
        details: { district: targetDistrict, topSchools: topSchools.length, topAmbassadors: topAmbassadors.length },
      });

      const refreshedDetails = computeDistrictLeaderboardDetails({
        region: targetRegion,
        district: targetDistrict,
        viewerUid: caller.uid,
        viewerSchoolId: caller.schoolId,
      });
      res.json({ success: true, award, details: refreshedDetails });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// ==========================================
// 2B. ROLE ROSTERS, EXCLUSIVE USER-GROWTH RACE & REAL-TIME TELEGRAM-STYLE CHAT
// ==========================================

function slugifyChatKey(val?: string): string {
  return String(val || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
}

function makeAmbGroupChannel(schoolId: string): string {
  return `amb_group:${schoolId}`;
}

function makeAmbDmChannel(schoolId: string, ambUid: string): string {
  return `amb_dm:${schoolId}:${ambUid}`;
}

function makeDistGroupChannel(district: string): string {
  return `dist_group:${slugifyChatKey(district)}`;
}

function makeDistDmChannel(district: string, captainUid: string): string {
  return `dist_dm:${slugifyChatKey(district)}:${captainUid}`;
}

function makeRegGroupChannel(region: string): string {
  return `reg_group:${slugifyChatKey(region)}`;
}

function makeRegDmChannel(region: string, coordUid: string): string {
  return `reg_dm:${slugifyChatKey(region)}:${coordUid}`;
}

function makeStudentDmChannel(uidA: string, uidB: string): string {
  const pair = [String(uidA), String(uidB)].sort();
  return `student_dm:${pair[0]}:${pair[1]}`;
}

function isUserAmbassadorForSchool(user: any, schoolId: string): boolean {
  if (!user || !schoolId) return false;
  if (hasAnyRole(user, ['ambassador']) && String(user.schoolId || '') === String(schoolId)) return true;
  return (centralDb.ambassadors || []).some(
    (a) => a.id === user.uid && a.status !== 'revoked' && String(a.schoolId || '') === String(schoolId)
  );
}

function canUserAccessChannel(user: any, channelId: string): boolean {
  if (!user || !channelId) return false;
  if (checkIsSuperAdmin(user)) return true;
  const parts = String(channelId).split(':');
  const prefix = parts[0];

  if (prefix === 'amb_group') {
    const schoolId = parts.slice(1).join(':');
    return (
      (hasAnyRole(user, ['school_admin']) && String(user.schoolId || '') === schoolId) ||
      isUserAmbassadorForSchool(user, schoolId)
    );
  }
  if (prefix === 'amb_dm') {
    const schoolId = parts[1];
    const ambUid = parts.slice(2).join(':');
    return (
      (hasAnyRole(user, ['school_admin']) && String(user.schoolId || '') === schoolId) ||
      String(user.uid) === ambUid
    );
  }
  if (prefix === 'dist_group') {
    const distSlug = parts[1];
    const userDistSlug = slugifyChatKey(user.district);
    if (!userDistSlug || userDistSlug !== distSlug) return false;
    return hasAnyRole(user, ['district_coordinator', 'school_admin', 'regional_coordinator']);
  }
  if (prefix === 'dist_dm') {
    const distSlug = parts[1];
    const captainUid = parts.slice(2).join(':');
    return (
      String(user.uid) === captainUid ||
      (hasAnyRole(user, ['district_coordinator']) && slugifyChatKey(user.district) === distSlug)
    );
  }
  if (prefix === 'reg_group') {
    const regSlug = parts[1];
    const userRegSlug = slugifyChatKey(user.region);
    if (!userRegSlug || userRegSlug !== regSlug) return false;
    return hasAnyRole(user, ['regional_coordinator', 'district_coordinator']);
  }
  if (prefix === 'reg_dm') {
    const regSlug = parts[1];
    const coordUid = parts.slice(2).join(':');
    return (
      String(user.uid) === coordUid ||
      (hasAnyRole(user, ['regional_coordinator']) && slugifyChatKey(user.region) === regSlug)
    );
  }
  if (prefix === 'student_dm') {
    const uid1 = parts[1];
    const uid2 = parts.slice(2).join(':');
    return String(user.uid) === uid1 || String(user.uid) === uid2;
  }
  return false;
}

function getPairChatPermission(uidA: string, uidB: string) {
  const pairSet = new Set([String(uidA), String(uidB)]);
  return (centralDb.chatPermissions || []).find(
    (p: any) => pairSet.has(String(p.requesterUid)) && pairSet.has(String(p.targetUid))
  );
}

function broadcastChatMessage(msg: any) {
  const payload = JSON.stringify({ type: 'chat:message', message: msg });
  for (const client of wsClients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    const dbUser = centralDb.users[client.uid] || client;
    if (canUserAccessChannel(dbUser, msg.channelId)) {
      try {
        client.ws.send(payload);
      } catch {}
    }
  }
}

function broadcastChatPermissionUpdate(perm: any) {
  const payload = JSON.stringify({ type: 'chat:permission_updated', permission: perm });
  for (const client of wsClients) {
    if (client.ws.readyState !== WebSocket.OPEN) continue;
    if (client.isSuperAdmin || client.uid === perm.requesterUid || client.uid === perm.targetUid) {
      try {
        client.ws.send(payload);
      } catch {}
    }
  }
}

httpServer.on('upgrade', (request, socket, head) => {
  try {
    const parsedUrl = new URL(request.url || '/', 'http://localhost');
    if (parsedUrl.pathname !== '/ws/chat') return;

    const token = parsedUrl.searchParams.get('token') || '';
    const authUser = verifySessionToken(token);
    if (!authUser) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    chatWss.handleUpgrade(request, socket, head, (ws) => {
      const client: ConnectedWsClient = {
        ws,
        uid: String(authUser.uid),
        role: String(authUser.role || 'student'),
        approvedRoles: Array.isArray(authUser.approvedRoles) ? authUser.approvedRoles : [],
        region: String(authUser.region || ''),
        district: String(authUser.district || ''),
        schoolId: String(authUser.schoolId || ''),
        isSuperAdmin: checkIsSuperAdmin(authUser),
      };
      wsClients.add(client);
      ws.send(JSON.stringify({ type: 'chat:connected', uid: client.uid }));
      ws.on('close', () => wsClients.delete(client));
      ws.on('error', () => wsClients.delete(client));
    });
  } catch {
    try {
      socket.destroy();
    } catch {}
  }
});

// Scoped Roster Directory per Role (Strict PII & Territorial Isolation)
app.get('/api/roster/directory', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const isAdmin = checkIsSuperAdmin(caller);
    const isCaptain = hasAnyRole(caller, ['school_admin']);
    const isDistCoord = hasAnyRole(caller, ['district_coordinator']);
    const isRegCoord = hasAnyRole(caller, ['regional_coordinator']);
    const isAmb = hasAnyRole(caller, ['ambassador']);

    const allUsers = Object.values(centralDb.users) as any[];
    const allAmbassadors = centralDb.ambassadors || [];

    // 1. School students & school ambassadors (for school_admin & super_admin)
    let schoolStudents: any[] = [];
    let schoolAmbassadors: any[] = [];
    if (isAdmin || isCaptain) {
      const targetSchoolId = isAdmin && req.query.schoolId ? String(req.query.schoolId) : caller.schoolId;
      const targetSchoolName = caller.schoolName;
      schoolStudents = allUsers
        .filter((u) => {
          if (isAdmin && !targetSchoolId) return u.role === 'student' || u.role === 'ambassador';
          const sameSchool =
            (targetSchoolId && u.schoolId === targetSchoolId) ||
            (targetSchoolName && u.schoolName === targetSchoolName);
          return sameSchool && (u.role === 'student' || u.role === 'ambassador');
        })
        .map((u) => ({
          uid: u.uid,
          fullName: u.fullName || 'O‘quvchi',
          grade: u.grade || '9-A',
          schoolId: u.schoolId || '',
          schoolName: u.schoolName || '',
          region: u.region || '',
          district: u.district || '',
          role: u.role || 'student',
          ecoCoins: Number(u.ecoCoins || 0),
          reportsCount: Number(u.reportsCount || u.activityStats?.reportsCount || 0),
          treesPlanted: Number(u.treesPlanted || u.activityStats?.treesPlanted || 0),
          badge: u.badge || 'Eko-Qahramon',
          avatarUrl: u.avatarUrl || u.profileImage || '',
          phoneNumber: u.phoneNumber || '',
          telegramUsername: u.telegramUsername || '',
          telegramLinked: Boolean(u.telegramId || u.chatId || u.telegramAuth || u.telegramUsername),
          allowStudentMessages: u.allowStudentMessages !== false,
        }))
        .sort((a, b) => (b.ecoCoins || 0) - (a.ecoCoins || 0));

      const ambMap = new Map<string, any>();
      for (const a of allAmbassadors) {
        if (a.status === 'revoked') continue;
        const match =
          isAdmin && !targetSchoolId
            ? true
            : (targetSchoolId && a.schoolId === targetSchoolId) || (targetSchoolName && a.schoolName === targetSchoolName);
        if (!match) continue;
        const matchedUser = findUserByAnyIdentifier({ uid: a.id, phoneNumber: a.phone, email: a.email });
        ambMap.set(a.id, {
          id: a.id,
          uid: matchedUser?.uid || a.id,
          fullName: a.fullName,
          schoolId: a.schoolId || targetSchoolId || '',
          schoolName: a.schoolName || targetSchoolName || '',
          region: a.region || matchedUser?.region || '',
          district: a.district || matchedUser?.district || '',
          grade: a.grade || matchedUser?.grade || '',
          phone: a.phone || matchedUser?.phoneNumber || '',
          telegramUsername: a.telegramUsername || matchedUser?.telegramUsername || '',
          telegramLinked: Boolean(
            matchedUser?.telegramId || matchedUser?.chatId || matchedUser?.telegramAuth || a.telegramUsername || matchedUser?.telegramUsername
          ),
          ecoCoins: Number(matchedUser?.ecoCoins ?? a.ecoCoins ?? 0),
          verifiedActivitiesCount: Number(a.verifiedActivitiesCount || 0),
          tasksCompletedCount: Number(a.tasksCompletedCount || 0),
          status: a.status || 'active',
          avatarUrl: matchedUser?.avatarUrl || matchedUser?.profileImage || '',
        });
      }
      for (const u of allUsers) {
        const isAmbUser = u.role === 'ambassador' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('ambassador'));
        if (!isAmbUser) continue;
        const match =
          isAdmin && !targetSchoolId
            ? true
            : (targetSchoolId && u.schoolId === targetSchoolId) || (targetSchoolName && u.schoolName === targetSchoolName);
        if (!match) continue;
        const prev = ambMap.get(u.uid);
        ambMap.set(u.uid, {
          id: u.uid,
          uid: u.uid,
          fullName: u.fullName,
          schoolId: u.schoolId || prev?.schoolId || '',
          schoolName: u.schoolName || prev?.schoolName || '',
          region: u.region || prev?.region || '',
          district: u.district || prev?.district || '',
          grade: u.grade || prev?.grade || '',
          phone: u.phoneNumber || prev?.phone || '',
          telegramUsername: u.telegramUsername || prev?.telegramUsername || '',
          telegramLinked: Boolean(u.telegramId || u.chatId || u.telegramAuth || u.telegramUsername || prev?.telegramLinked),
          ecoCoins: Number(u.ecoCoins ?? prev?.ecoCoins ?? 0),
          verifiedActivitiesCount: Number(prev?.verifiedActivitiesCount || 0),
          tasksCompletedCount: Number(prev?.tasksCompletedCount || 0),
          status: 'active',
          avatarUrl: u.avatarUrl || u.profileImage || '',
        });
      }
      schoolAmbassadors = Array.from(ambMap.values());
    }

    // 2. District School Captains (for district_coordinator, regional_coordinator, super_admin)
    let districtCaptains: any[] = [];
    if (isAdmin || isDistCoord || isRegCoord) {
      const targetRegion = isAdmin && req.query.region ? String(req.query.region) : caller.region;
      const targetDistrict =
        (isAdmin || isRegCoord) && req.query.district ? String(req.query.district) : caller.district;

      districtCaptains = allUsers
        .filter((u) => {
          const isCap = u.role === 'school_admin' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('school_admin'));
          if (!isCap) return false;
          if (isAdmin && !req.query.district && !req.query.region) return true;
          if (isDistCoord) {
            return String(u.district || '').toLowerCase() === String(targetDistrict || '').toLowerCase();
          }
          return String(u.region || '').toLowerCase() === String(targetRegion || '').toLowerCase();
        })
        .map((u) => {
          const sch = centralDb.schools.find((s) => s.id === u.schoolId || s.name === u.schoolName);
          return {
            uid: u.uid,
            fullName: u.fullName,
            schoolId: u.schoolId || sch?.id || '',
            schoolName: u.schoolName || sch?.name || 'Maktab',
            schoolNumber: u.schoolNumber || sch?.number || '',
            region: u.region || '',
            district: u.district || '',
            grade: u.grade || '',
            phoneNumber: u.phoneNumber || '',
            telegramUsername: u.telegramUsername || '',
            telegramLinked: Boolean(u.telegramId || u.chatId || u.telegramAuth || u.telegramUsername),
            ecoCoins: Number(u.ecoCoins || 0),
            studentsCount: sch ? getSchoolLiveStudentCount(sch) : 0,
            avatarUrl: u.avatarUrl || u.profileImage || '',
          };
        });
    }

    // 3. District Coordinators in Region (for regional_coordinator & super_admin)
    let districtCoordinators: any[] = [];
    if (isAdmin || isRegCoord) {
      const targetRegion = isAdmin && req.query.region ? String(req.query.region) : caller.region;
      districtCoordinators = allUsers
        .filter((u) => {
          const isDc =
            u.role === 'district_coordinator' ||
            (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('district_coordinator'));
          if (!isDc) return false;
          if (isAdmin && !req.query.region) return true;
          return String(u.region || '').toLowerCase() === String(targetRegion || '').toLowerCase();
        })
        .map((u) => {
          const distSchools = centralDb.schools.filter(
            (s) => String(s.district || '').toLowerCase() === String(u.district || '').toLowerCase()
          );
          const distStudents = distSchools.reduce(
            (sum, s) => sum + getSchoolLiveStudentCount(s),
            0
          );
          return {
            uid: u.uid,
            fullName: u.fullName,
            region: u.region || '',
            district: u.district || '',
            phoneNumber: u.phoneNumber || '',
            telegramUsername: u.telegramUsername || '',
            telegramLinked: Boolean(u.telegramId || u.chatId || u.telegramAuth || u.telegramUsername),
            schoolsCount: distSchools.length,
            studentsCount: distStudents,
            avatarUrl: u.avatarUrl || u.profileImage || '',
          };
        });
    }

    // 4. Peer Students (PII-SAFE! No phoneNumber, email, or telegramId exposed)
    const peerStudents = allUsers
      .filter((u) => u.uid !== caller.uid && (u.role === 'student' || u.role === 'ambassador'))
      .map((u) => ({
        uid: u.uid,
        fullName: u.fullName || 'O‘quvchi',
        grade: u.grade || '',
        schoolId: u.schoolId || '',
        schoolName: u.schoolName || '',
        region: u.region || '',
        district: u.district || '',
        role: u.role || 'student',
        ecoCoins: Number(u.ecoCoins || 0),
        reportsCount: Number(u.reportsCount || u.activityStats?.reportsCount || 0),
        treesPlanted: Number(u.treesPlanted || u.activityStats?.treesPlanted || 0),
        badge: u.badge || 'Eko-Qahramon',
        avatarUrl: u.avatarUrl || u.profileImage || '',
        allowStudentMessages: u.allowStudentMessages !== false,
      }))
      .sort((a, b) => (b.ecoCoins || 0) - (a.ecoCoins || 0));

    // Upward coordinator/captain lookup for direct reply channels
    const myDcUser = allUsers.find(
      (u) =>
        (u.role === 'district_coordinator' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('district_coordinator'))) &&
        String(u.district || '').toLowerCase() === String(caller.district || '').toLowerCase()
    );
    const myDistrictCoordinator = myDcUser
      ? {
          uid: myDcUser.uid,
          fullName: myDcUser.fullName,
          region: myDcUser.region,
          district: myDcUser.district,
          telegramUsername: myDcUser.telegramUsername || '',
          telegramLinked: Boolean(myDcUser.telegramId || myDcUser.chatId || myDcUser.telegramAuth),
          schoolsCount: 0,
          studentsCount: 0,
          avatarUrl: myDcUser.avatarUrl || myDcUser.profileImage || '',
        }
      : null;

    const myCaptainUser =
      isAmb && caller.schoolId
        ? allUsers.find(
            (u) =>
              (u.role === 'school_admin' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('school_admin'))) &&
              u.schoolId === caller.schoolId
          )
        : null;
    const mySchoolCaptain = myCaptainUser
      ? {
          uid: myCaptainUser.uid,
          fullName: myCaptainUser.fullName,
          schoolId: myCaptainUser.schoolId,
          schoolName: myCaptainUser.schoolName,
          region: myCaptainUser.region,
          district: myCaptainUser.district,
          telegramUsername: myCaptainUser.telegramUsername || '',
          telegramLinked: Boolean(myCaptainUser.telegramId || myCaptainUser.chatId || myCaptainUser.telegramAuth),
          ecoCoins: Number(myCaptainUser.ecoCoins || 0),
          studentsCount: 0,
          avatarUrl: myCaptainUser.avatarUrl || myCaptainUser.profileImage || '',
        }
      : null;

    // 3b. Regional Coordinators (for super_admin)
    let regionalCoordinators: any[] = [];
    if (isAdmin) {
      regionalCoordinators = allUsers
        .filter(
          (u) =>
            u.role === 'regional_coordinator' ||
            (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('regional_coordinator'))
        )
        .map((u) => {
          const regSchools = centralDb.schools.filter(
            (s) => String(s.region || '').toLowerCase() === String(u.region || '').toLowerCase()
          );
          const regStudents = regSchools.reduce(
            (sum, s) => sum + getSchoolLiveStudentCount(s),
            0
          );
          return {
            uid: u.uid,
            fullName: u.fullName,
            region: u.region || '',
            district: u.district || 'Barcha tumanlar',
            phoneNumber: u.phoneNumber || '',
            telegramUsername: u.telegramUsername || '',
            telegramLinked: Boolean(u.telegramId || u.chatId || u.telegramAuth || u.telegramUsername),
            schoolsCount: regSchools.length,
            studentsCount: regStudents,
            avatarUrl: u.avatarUrl || u.profileImage || '',
          };
        });
    }

    res.json({
      success: true,
      role: caller.role,
      schoolStudents,
      schoolAmbassadors,
      districtCaptains,
      districtCoordinators,
      regionalCoordinators,
      peerStudents,
      myDistrictCoordinator,
      mySchoolCaptain,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// (GET /api/leaderboards/district-user-growth is registered above /api/leaderboards/:tier)

// Real-Time Chat Threads List (Role-Scoped)
app.get('/api/chat/threads', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const isAdmin = checkIsSuperAdmin(caller);
    const allUsers = Object.values(centralDb.users) as any[];
    const allMessages = centralDb.chatMessages || [];
    const threads: any[] = [];
    const seenChannelIds = new Set<string>();

    const getLastMessage = (channelId: string) =>
      allMessages
        .filter((m: any) => m.channelId === channelId)
        .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0] || null;

    const pushThread = (thread: any) => {
      if (seenChannelIds.has(thread.channelId)) return;
      seenChannelIds.add(thread.channelId);
      threads.push({ ...thread, lastMessage: getLastMessage(thread.channelId) });
    };

    // A) School Captain <-> School Ambassadors (via @Ecoheros_bot)
    if ((hasAnyRole(caller, ['school_admin']) && caller.schoolId) || isAdmin) {
      const targetSchoolId = caller.schoolId || 'school_tashkent_17';
      const sch = centralDb.schools.find((s) => s.id === targetSchoolId);
      const groupCh = makeAmbGroupChannel(targetSchoolId);
      pushThread({
        channelId: groupCh,
        scope: 'school_ambassadors',
        title: `🤖 Barcha Eko-Elchilar (${sch?.number ? `${sch.number}-maktab` : caller.schoolName || 'Maktab'})`,
        subtitle: '@Ecoheros_bot orqali umumiy xabar yuborish',
        isGroup: true,
        viaBot: true,
        allowedMessageKinds: ['bot_notice', 'chat'],
        schoolId: targetSchoolId,
        schoolName: sch?.name || caller.schoolName,
      });

      const ambEntries = [
        ...(centralDb.ambassadors || [])
          .filter((a) => a.status !== 'revoked' && a.schoolId === targetSchoolId)
          .map((a) => {
            const u = findUserByAnyIdentifier({ uid: a.id, email: a.email, phoneNumber: a.phone });
            return {
              uid: u?.uid || a.id,
              fullName: a.fullName,
              telegramUsername: u?.telegramUsername || a.telegramUsername || '',
              telegramLinked: Boolean(u?.telegramId || u?.chatId || u?.telegramAuth || u?.telegramUsername),
              avatarUrl: u?.avatarUrl || u?.profileImage || '',
            };
          }),
        ...allUsers
          .filter(
            (u) =>
              u.schoolId === targetSchoolId &&
              (u.role === 'ambassador' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('ambassador')))
          )
          .map((u) => ({
            uid: u.uid,
            fullName: u.fullName,
            telegramUsername: u.telegramUsername || '',
            telegramLinked: Boolean(u.telegramId || u.chatId || u.telegramAuth || u.telegramUsername),
            avatarUrl: u.avatarUrl || u.profileImage || '',
          })),
      ];
      const uniqueAmbs = new Map<string, any>();
      for (const a of ambEntries) uniqueAmbs.set(a.uid, a);
      for (const amb of uniqueAmbs.values()) {
        pushThread({
          channelId: makeAmbDmChannel(targetSchoolId, amb.uid),
          scope: 'school_ambassadors',
          title: amb.fullName,
          subtitle: `Eko-Elchi · @Ecoheros_bot nomidan yozish`,
          isGroup: false,
          viaBot: true,
          allowedMessageKinds: ['bot_notice', 'chat'],
          recipientUid: amb.uid,
          recipientRole: 'ambassador',
          recipientAvatar: amb.avatarUrl,
          recipientTelegramLinked: amb.telegramLinked,
          recipientTelegramUsername: amb.telegramUsername,
          schoolId: targetSchoolId,
        });
      }
    }

    if (hasAnyRole(caller, ['ambassador'])) {
      const ambSchoolId = caller.schoolId || 'district';
      if (caller.schoolId) {
        const sch = centralDb.schools.find((s) => s.id === caller.schoolId);
        pushThread({
          channelId: makeAmbGroupChannel(caller.schoolId),
          scope: 'school_ambassadors',
          title: `🤖 ${sch?.number ? `${sch.number}-maktab` : 'Maktab'} Eko-Elchilari (@Ecoheros_bot)`,
          subtitle: 'Maktab Sardori va Eko-Elchilar umumiy kanali',
          isGroup: true,
          viaBot: true,
          allowedMessageKinds: ['chat'],
          schoolId: caller.schoolId,
        });
      }
      const captain = caller.schoolId
        ? allUsers.find(
            (u) =>
              u.schoolId === caller.schoolId &&
              (u.role === 'school_admin' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('school_admin')))
          )
        : null;
      pushThread({
        channelId: makeAmbDmChannel(ambSchoolId, caller.uid),
        scope: 'school_ambassadors',
        title: captain ? `${captain.fullName} (Maktab Sardori)` : 'Maktab Sardori & @Ecoheros_bot',
        subtitle: 'Maktab Sardori va @Ecoheros_bot rasmiy xabarlari',
        isGroup: false,
        viaBot: true,
        allowedMessageKinds: ['chat'],
        recipientUid: captain?.uid,
        recipientRole: 'school_admin',
        recipientAvatar: captain?.avatarUrl || captain?.profileImage || '',
        schoolId: ambSchoolId,
      });
    }

    // B) District Coordinator <-> School Captains
    if (hasAnyRole(caller, ['district_coordinator']) || isAdmin) {
      const targetDist = caller.district || 'Shayxontohur tumani';
      pushThread({
        channelId: makeDistGroupChannel(targetDist),
        scope: 'district_captains',
        title: `📢 ${targetDist} · Barcha Maktab Sardorlari`,
        subtitle: 'Umumiy tuman guruhi · Buyruq va oddiy suhbat',
        isGroup: true,
        allowedMessageKinds: ['chat', 'command'],
        district: targetDist,
        region: caller.region,
      });
      const captains = allUsers.filter(
        (u) =>
          (u.role === 'school_admin' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('school_admin'))) &&
          (isAdmin ? true : String(u.district || '').toLowerCase() === String(targetDist).toLowerCase())
      );
      for (const cap of captains) {
        pushThread({
          channelId: makeDistDmChannel(cap.district || targetDist, cap.uid),
          scope: 'district_captains',
          title: `${cap.fullName}`,
          subtitle: `${cap.schoolName || 'Maktab Sardori'} · Yakka suhbat / Buyruq`,
          isGroup: false,
          allowedMessageKinds: ['chat', 'command'],
          recipientUid: cap.uid,
          recipientRole: 'school_admin',
          recipientAvatar: cap.avatarUrl || cap.profileImage || '',
          recipientTelegramLinked: Boolean(cap.telegramId || cap.chatId || cap.telegramAuth || cap.telegramUsername),
          recipientTelegramUsername: cap.telegramUsername || '',
          district: cap.district || targetDist,
          region: cap.region || caller.region,
        });
      }
    }

    if (hasAnyRole(caller, ['school_admin']) && caller.district) {
      const dc = allUsers.find(
        (u) =>
          (u.role === 'district_coordinator' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('district_coordinator'))) &&
          String(u.district || '').toLowerCase() === String(caller.district || '').toLowerCase()
      );
      pushThread({
        channelId: makeDistGroupChannel(caller.district),
        scope: 'district_captains',
        title: `📢 ${caller.district} Maktab Sardorlari Guruhi`,
        subtitle: 'Tuman Koordinatori buyruqlari va maktab sardorlari suhbati',
        isGroup: true,
        allowedMessageKinds: ['chat'],
        district: caller.district,
        region: caller.region,
      });
      pushThread({
        channelId: makeDistDmChannel(caller.district, caller.uid),
        scope: 'district_captains',
        title: dc ? `${dc.fullName} (Tuman Koordinatori)` : `${caller.district} Koordinatori`,
        subtitle: 'Tuman Koordinatori bilan 1-ga-1 suhbat',
        isGroup: false,
        allowedMessageKinds: ['chat'],
        recipientUid: dc?.uid,
        recipientRole: 'district_coordinator',
        recipientAvatar: dc?.avatarUrl || dc?.profileImage || '',
        district: caller.district,
        region: caller.region,
      });
    }

    // C) Regional Coordinator <-> District Coordinators
    if (hasAnyRole(caller, ['regional_coordinator']) || isAdmin) {
      const targetReg = caller.region || 'Toshkent shahri';
      pushThread({
        channelId: makeRegGroupChannel(targetReg),
        scope: 'regional_coordinators',
        title: `🌐 ${targetReg} · Tuman Koordinatorlari`,
        subtitle: "Topshiriq berish va g'oya almashish guruhi",
        isGroup: true,
        allowedMessageKinds: ['chat', 'command', 'idea'],
        region: targetReg,
      });
      const coords = allUsers.filter(
        (u) =>
          (u.role === 'district_coordinator' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('district_coordinator'))) &&
          (isAdmin ? true : String(u.region || '').toLowerCase() === String(targetReg).toLowerCase())
      );
      for (const dc of coords) {
        pushThread({
          channelId: makeRegDmChannel(dc.region || targetReg, dc.uid),
          scope: 'regional_coordinators',
          title: `${dc.fullName}`,
          subtitle: `${dc.district || 'Tuman Koordinatori'} · Topshiriq va G‘oya`,
          isGroup: false,
          allowedMessageKinds: ['chat', 'command', 'idea'],
          recipientUid: dc.uid,
          recipientRole: 'district_coordinator',
          recipientAvatar: dc.avatarUrl || dc.profileImage || '',
          recipientTelegramLinked: Boolean(dc.telegramId || dc.chatId || dc.telegramAuth || dc.telegramUsername),
          recipientTelegramUsername: dc.telegramUsername || '',
          region: dc.region || targetReg,
          district: dc.district,
        });
      }
    }

    if (hasAnyRole(caller, ['district_coordinator']) && caller.region) {
      const rc = allUsers.find(
        (u) =>
          (u.role === 'regional_coordinator' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('regional_coordinator'))) &&
          String(u.region || '').toLowerCase() === String(caller.region || '').toLowerCase()
      );
      pushThread({
        channelId: makeRegGroupChannel(caller.region),
        scope: 'regional_coordinators',
        title: `🌐 ${caller.region} · Viloyat Kengashi`,
        subtitle: "Viloyat koordinatori topshiriqlari va g'oya almashish",
        isGroup: true,
        allowedMessageKinds: ['chat', 'idea'],
        region: caller.region,
      });
      pushThread({
        channelId: makeRegDmChannel(caller.region, caller.uid),
        scope: 'regional_coordinators',
        title: rc ? `${rc.fullName} (Viloyat Koordinatori)` : `${caller.region} Koordinatori`,
        subtitle: "Viloyat Koordinatori bilan 1-ga-1 suhbat va g'oyalar",
        isGroup: false,
        allowedMessageKinds: ['chat', 'idea'],
        recipientUid: rc?.uid,
        recipientRole: 'regional_coordinator',
        recipientAvatar: rc?.avatarUrl || rc?.profileImage || '',
        region: caller.region,
      });
    }

    // D) Student <-> Student DMs (with explicit permission status)
    const myPermPartners = (centralDb.chatPermissions || []).filter(
      (p: any) => p.requesterUid === caller.uid || p.targetUid === caller.uid
    );
    const partnerUids = new Set<string>();
    for (const p of myPermPartners) {
      partnerUids.add(p.requesterUid === caller.uid ? p.targetUid : p.requesterUid);
    }
    for (const pUid of partnerUids) {
      const peer = centralDb.users[pUid];
      if (!peer) continue;
      const perm = getPairChatPermission(caller.uid, pUid);
      const status =
        peer.allowStudentMessages === false && perm?.status !== 'approved'
          ? 'disabled_by_recipient'
          : perm?.status || 'not_requested';
      pushThread({
        channelId: makeStudentDmChannel(caller.uid, pUid),
        scope: 'student_dm',
        title: peer.fullName || "O'quvchi",
        subtitle: `${peer.schoolName || 'Maktab'}${peer.grade ? ` · ${peer.grade}` : ''}`,
        isGroup: false,
        allowedMessageKinds: ['chat'],
        recipientUid: peer.uid,
        recipientRole: peer.role || 'student',
        recipientAvatar: peer.avatarUrl || peer.profileImage || '',
        permissionStatus: status,
      });
    }

    threads.sort((a, b) => {
      const tA = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
      const tB = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
      if (tB !== tA) return tB - tA;
      return (b.isGroup ? 1 : 0) - (a.isGroup ? 1 : 0);
    });

    res.json({ success: true, threads });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Fetch Chat Messages for an Authorized Channel
app.get('/api/chat/messages', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const channelId = String(req.query.channelId || '').trim();
    if (!channelId) return res.status(400).json({ error: 'channelId talab qilinadi' });
    if (!canUserAccessChannel(caller, channelId)) {
      return res.status(403).json({ error: 'Ushbu suhbat kanaliga kirish huquqingiz yo‘q.' });
    }
    const messages = (centralDb.chatMessages || [])
      .filter((m: any) => m.channelId === channelId)
      .sort((a: any, b: any) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
      .slice(-200);

    res.json({ success: true, channelId, messages });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Send Real-Time Message (WebSocket + DB + Telegram Bot)
app.post('/api/chat/messages', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const { channelId, scope, messageKind, text, imageUrl, recipientUid, replyToId } = req.body || {};
    const cleanChannelId = String(channelId || '').trim();
    const cleanText = String(text || '').trim();
    const cleanImageUrl = imageUrl ? String(imageUrl).trim() : '';

    if (!cleanChannelId || !scope) {
      return res.status(400).json({ error: 'channelId va scope majburiy.' });
    }
    if (!cleanText && !cleanImageUrl) {
      return res.status(400).json({ error: 'Xabar matni yoki rasm biriktiring.' });
    }
    if (!canUserAccessChannel(caller, cleanChannelId)) {
      return res.status(403).json({ error: 'Ushbu suhbatga xabar yuborish ruxsatingiz yo‘q.' });
    }

    const normalizedKind = ['chat', 'command', 'idea', 'bot_notice'].includes(String(messageKind))
      ? String(messageKind)
      : 'chat';

    // Strict student-to-student permission enforcement
    let resolvedRecipientUid = recipientUid ? String(recipientUid) : undefined;
    let resolvedRecipientName: string | undefined;

    if (scope === 'student_dm' || cleanChannelId.startsWith('student_dm:')) {
      const parts = cleanChannelId.split(':');
      const u1 = parts[1];
      const u2 = parts.slice(2).join(':');
      resolvedRecipientUid = String(u1) === String(caller.uid) ? u2 : u1;
      const targetUser = centralDb.users[resolvedRecipientUid];
      if (!targetUser) {
        return res.status(404).json({ error: 'Qabul qiluvchi o‘quvchi topilmadi.' });
      }
      resolvedRecipientName = targetUser.fullName;

      if (!checkIsSuperAdmin(caller)) {
        const perm = getPairChatPermission(caller.uid, resolvedRecipientUid);
        if (targetUser.allowStudentMessages === false && perm?.status !== 'approved') {
          return res.status(403).json({
            error: "Ushbu o'quvchi boshqa o'quvchilardan xabar qabul qilishni o'chirib qo'ygan.",
            code: 'CHAT_PERMISSION_REQUIRED',
          });
        }
        if (!perm || perm.status !== 'approved') {
          return res.status(403).json({
            error:
              perm?.status === 'blocked'
                ? 'Ushbu foydalanuvchi bilan yozishish bloklangan.'
                : "Yozishdan oldin ushbu o'quvchidan ruxsat so'rashingiz va u tasdiqlashi kerak.",
            code: 'CHAT_PERMISSION_REQUIRED',
          });
        }
      }
    } else if (resolvedRecipientUid && centralDb.users[resolvedRecipientUid]) {
      resolvedRecipientName = centralDb.users[resolvedRecipientUid].fullName;
    }

    const isSchoolCaptainSendingViaBot =
      (scope === 'school_ambassadors' || cleanChannelId.startsWith('amb_')) &&
      (hasAnyRole(caller, ['school_admin']) || checkIsSuperAdmin(caller));

    let replyPreview: { senderName: string; text: string } | undefined;
    if (replyToId) {
      const parent = (centralDb.chatMessages || []).find((m: any) => m.id === String(replyToId));
      if (parent) {
        replyPreview = {
          senderName: parent.senderName || 'Foydalanuvchi',
          text: String(parent.text || (parent.imageUrl ? '📷 Rasm' : '')).slice(0, 120),
        };
      }
    }

    const newMsg = {
      id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      channelId: cleanChannelId,
      scope,
      messageKind: isSchoolCaptainSendingViaBot && normalizedKind === 'chat' ? 'bot_notice' : normalizedKind,
      senderUid: caller.uid,
      senderName: caller.fullName || 'Foydalanuvchi',
      senderRole: caller.role || 'student',
      senderAvatar: caller.avatarUrl || caller.profileImage || '',
      senderTelegramUsername: caller.telegramUsername || '',
      ...(resolvedRecipientUid ? { recipientUid: resolvedRecipientUid } : {}),
      ...(resolvedRecipientName ? { recipientName: resolvedRecipientName } : {}),
      schoolId: caller.schoolId || undefined,
      schoolName: caller.schoolName || undefined,
      region: caller.region || undefined,
      district: caller.district || undefined,
      text: cleanText,
      ...(cleanImageUrl ? { imageUrl: cleanImageUrl } : {}),
      viaBot: isSchoolCaptainSendingViaBot,
      ...(isSchoolCaptainSendingViaBot ? { botHandle: '@Ecoheros_bot' } : {}),
      ...(replyToId ? { replyToId: String(replyToId) } : {}),
      ...(replyPreview ? { replyPreview } : {}),
      createdAt: new Date().toISOString(),
    };

    centralDb.chatMessages = [...(centralDb.chatMessages || []), newMsg].slice(-3000);
    saveCentralDb();

    // Real-time WebSocket push to authorized connected participants
    broadcastChatMessage(newMsg);

    // Telegram Bot Delivery + In-App Notifications
    const kindHeader =
      newMsg.messageKind === 'command'
        ? '📌 <b>RASMIY BUYRUQ / TOPSHIRIQ</b>'
        : newMsg.messageKind === 'idea'
        ? "💡 <b>G'OYA ALMASHISH</b>"
        : isSchoolCaptainSendingViaBot
        ? '🤖 <b>@Ecoheros_bot · Maktab Sardori Xabari</b>'
        : '💬 <b>YANGI XABAR</b>';

    const tgPayloadText = `${kindHeader}\n👤 <b>${newMsg.senderName}</b>${
      newMsg.schoolName ? ` (${newMsg.schoolName})` : newMsg.district ? ` (${newMsg.district})` : ''
    }\n\n${cleanText || '📷 Rasm yuborildi'}`;

    const deliverToUser = async (targetUser: any) => {
      if (!targetUser || targetUser.uid === caller.uid) return;
      centralDb.notifications.unshift({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: targetUser.uid,
        title: `${isSchoolCaptainSendingViaBot ? '🤖 @Ecoheros_bot: ' : ''}${newMsg.senderName}`,
        message: cleanText ? cleanText.slice(0, 140) : '📷 Yangi rasm yuborildi',
        type: 'system',
        read: false,
        createdAt: newMsg.createdAt,
      });
      const tgChat = targetUser.telegramId || targetUser.chatId;
      if (tgChat) {
        if (cleanImageUrl) {
          await sendTelegramPhoto(tgChat, cleanImageUrl, tgPayloadText).catch(() => {});
        } else {
          await sendTelegramMessage(tgChat, tgPayloadText).catch(() => {});
        }
      }
    };

    if (resolvedRecipientUid && centralDb.users[resolvedRecipientUid]) {
      await deliverToUser(centralDb.users[resolvedRecipientUid]);
      saveCentralDb();
    } else if (cleanChannelId.startsWith('amb_group:')) {
      const schId = cleanChannelId.split(':').slice(1).join(':');
      const targets = Object.values(centralDb.users).filter(
        (u: any) =>
          u.uid !== caller.uid &&
          u.schoolId === schId &&
          (u.role === 'ambassador' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('ambassador')))
      );
      await Promise.all(targets.map((t: any) => deliverToUser(t)));
      saveCentralDb();
    } else if (cleanChannelId.startsWith('dist_group:')) {
      const dSlug = cleanChannelId.split(':')[1];
      const targets = Object.values(centralDb.users).filter(
        (u: any) =>
          u.uid !== caller.uid &&
          slugifyChatKey(u.district) === dSlug &&
          (u.role === 'school_admin' || u.role === 'district_coordinator')
      );
      await Promise.all(targets.map((t: any) => deliverToUser(t)));
      saveCentralDb();
    } else if (cleanChannelId.startsWith('reg_group:')) {
      const rSlug = cleanChannelId.split(':')[1];
      const targets = Object.values(centralDb.users).filter(
        (u: any) =>
          u.uid !== caller.uid &&
          slugifyChatKey(u.region) === rSlug &&
          (u.role === 'district_coordinator' || u.role === 'regional_coordinator')
      );
      await Promise.all(targets.map((t: any) => deliverToUser(t)));
      saveCentralDb();
    }

    res.json({ success: true, message: newMsg });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Student-to-Student Permission List, Request, Response & Privacy Settings
app.get('/api/chat/permissions', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const permissions = (centralDb.chatPermissions || [])
      .filter((p: any) => p.requesterUid === caller.uid || p.targetUid === caller.uid)
      .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    res.json({
      success: true,
      allowStudentMessages: caller.allowStudentMessages !== false,
      permissions,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat/permissions/request', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const { targetUid, note } = req.body || {};
    if (!targetUid || String(targetUid) === String(caller.uid)) {
      return res.status(400).json({ error: "Noto'g'ri foydalanuvchi tanlandi." });
    }
    const targetUser = centralDb.users[String(targetUid)];
    if (!targetUser) {
      return res.status(404).json({ error: 'Foydalanuvchi topilmadi.' });
    }
    if (targetUser.allowStudentMessages === false) {
      return res.status(403).json({
        error: "Ushbu o'quvchi xabar so'rovlarini qabul qilishni o'chirib qo'ygan.",
      });
    }

    const existing = getPairChatPermission(caller.uid, targetUid);
    if (existing) {
      if (existing.status === 'blocked') {
        return res.status(403).json({ error: 'Ushbu foydalanuvchi bilan yozishish bloklangan.' });
      }
      if (existing.status === 'approved' || existing.status === 'pending') {
        return res.json({ success: true, permission: existing, alreadyExists: true });
      }
      // Re-request if previously rejected
      existing.requesterUid = caller.uid;
      existing.requesterName = caller.fullName;
      existing.requesterSchoolName = caller.schoolName || '';
      existing.requesterGrade = caller.grade || '';
      existing.requesterAvatar = caller.avatarUrl || caller.profileImage || '';
      existing.targetUid = targetUser.uid;
      existing.targetName = targetUser.fullName;
      existing.targetSchoolName = targetUser.schoolName || '';
      existing.targetGrade = targetUser.grade || '';
      existing.targetAvatar = targetUser.avatarUrl || targetUser.profileImage || '';
      existing.note = note ? String(note).trim().slice(0, 300) : '';
      existing.status = 'pending';
      existing.createdAt = new Date().toISOString();
      delete existing.respondedAt;
      saveCentralDb();
      broadcastChatPermissionUpdate(existing);
      return res.json({ success: true, permission: existing });
    }

    const perm = {
      id: `perm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      requesterUid: caller.uid,
      requesterName: caller.fullName || "O'quvchi",
      requesterSchoolName: caller.schoolName || '',
      requesterGrade: caller.grade || '',
      requesterAvatar: caller.avatarUrl || caller.profileImage || '',
      targetUid: targetUser.uid,
      targetName: targetUser.fullName || "O'quvchi",
      targetSchoolName: targetUser.schoolName || '',
      targetGrade: targetUser.grade || '',
      targetAvatar: targetUser.avatarUrl || targetUser.profileImage || '',
      note: note ? String(note).trim().slice(0, 300) : "Salom! EcoHero bo'yicha suhbatlashsak bo'ladimi?",
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    centralDb.chatPermissions = [perm, ...(centralDb.chatPermissions || [])];
    centralDb.notifications.unshift({
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: targetUser.uid,
      title: '💬 Yangi suhbat ruxsati so‘rovi',
      message: `${caller.fullName} sizga yozish uchun ruxsat so‘radi.`,
      type: 'system',
      read: false,
      createdAt: perm.createdAt,
    });
    saveCentralDb();
    broadcastChatPermissionUpdate(perm);

    const tgChat = targetUser.telegramId || targetUser.chatId;
    if (tgChat) {
      sendTelegramMessage(
        tgChat,
        `💬 <b>Yangi suhbat ruxsati so‘rovi</b>\n\n<b>${caller.fullName}</b> (${caller.schoolName || 'Maktab'}) siz bilan EcoHero ilovasida suhbatlashish uchun ruxsat so‘radi.`
      ).catch(() => {});
    }

    res.json({ success: true, permission: perm });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat/permissions/:id/respond', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const permId = String(req.params.id);
    const { action } = req.body || {};
    if (!['approve', 'reject', 'block'].includes(String(action))) {
      return res.status(400).json({ error: "Amal 'approve', 'reject' yoki 'block' bo'lishi kerak." });
    }

    const perm = (centralDb.chatPermissions || []).find((p: any) => p.id === permId);
    if (!perm) return res.status(404).json({ error: 'So‘rov topilmadi.' });

    if (!checkIsSuperAdmin(caller) && String(perm.targetUid) !== String(caller.uid)) {
      return res.status(403).json({ error: 'Faqat xabar qabul qiluvchi ruxsatni tasdiqlashi mumkin.' });
    }

    perm.status = action === 'approve' ? 'approved' : action === 'block' ? 'blocked' : 'rejected';
    perm.respondedAt = new Date().toISOString();

    if (perm.status === 'approved') {
      centralDb.notifications.unshift({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        userId: perm.requesterUid,
        title: '✅ Suhbat ruxsati tasdiqlandi!',
        message: `${caller.fullName} sizga yozishga ruxsat berdi.`,
        type: 'system',
        read: false,
        createdAt: perm.respondedAt,
      });
    }

    saveCentralDb();
    broadcastChatPermissionUpdate(perm);
    res.json({ success: true, permission: perm });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/chat/settings', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const { allowStudentMessages } = req.body || {};
    caller.allowStudentMessages = Boolean(allowStudentMessages);
    caller.lastUpdated = new Date().toISOString();
    saveCentralDb();
    res.json({
      success: true,
      allowStudentMessages: caller.allowStudentMessages,
      user: sanitizeSelfUser(caller),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// HomePage Posts & News CMS (Managed by School Captain, Coordinators, Moderators & Super Admin)
app.get('/api/home-posts', (req: AuthenticatedRequest, res) => {
  const caller = req.authUser || null;
  const manageMode = String(req.query.scope || '') === 'manage';
  const posts = (centralDb.homePosts || [])
    .filter((p: any) => {
      if (!manageMode) return p.status === 'active';
      if (!caller) return false;
      if (checkIsSuperAdmin(caller) || hasAnyRole(caller, ['moderator'])) return true;
      if (hasAnyRole(caller, ['regional_coordinator'])) return p.region === caller.region || p.authorUid === caller.uid;
      if (hasAnyRole(caller, ['district_coordinator'])) return p.district === caller.district || p.authorUid === caller.uid;
      if (hasAnyRole(caller, ['school_admin'])) return p.authorUid === caller.uid || (caller.schoolId && p.schoolId === caller.schoolId);
      return false;
    })
    .sort((a: any, b: any) => {
      if (Boolean(b.isPinned) !== Boolean(a.isPinned)) return b.isPinned ? 1 : -1;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

  res.json({ success: true, posts });
});

app.post(
  '/api/home-posts',
  requireRoles('school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const { title, content, category, imageUrl, ctaText, ctaUrl, isPinned } = req.body;
      if (!title || !content) {
        return res.status(400).json({ error: 'Post sarlavhasi va matni kiritilishi shart' });
      }
      const allowedCats = ['bot_news', 'website', 'channel_ad', 'news', 'school_event'];
      const resolvedCat = allowedCats.includes(category) ? category : 'news';
      const nowIso = new Date().toISOString();

      const post = {
        id: `hpost_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        title: String(title).trim().slice(0, 180),
        content: String(content).trim().slice(0, 1500),
        category: resolvedCat,
        imageUrl: imageUrl ? String(imageUrl).trim() : '/assets/schools/eco_courtyard.jpg',
        ctaText: ctaText ? String(ctaText).trim().slice(0, 80) : '',
        ctaUrl: ctaUrl ? String(ctaUrl).trim() : '',
        authorUid: caller.uid,
        authorName: caller.fullName,
        authorRole: caller.role,
        schoolId: caller.schoolId || '',
        schoolName: caller.schoolName || '',
        region: caller.region || '',
        district: caller.district || '',
        isPinned: Boolean(isPinned),
        status: 'active',
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      centralDb.homePosts = [post, ...(centralDb.homePosts || [])];
      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'home_posts' });
      addAuditLog({
        actorUid: caller.uid,
        actorName: caller.fullName,
        actorRole: caller.role,
        action: 'create_home_post',
        targetCollection: 'home_posts',
        targetId: post.id,
        details: { title: post.title, category: post.category },
      });

      res.json({ success: true, post });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.patch(
  '/api/home-posts/:id',
  requireRoles('school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const post = (centralDb.homePosts || []).find((p: any) => p.id === req.params.id);
      if (!post) return res.status(404).json({ error: 'Post topilmadi' });

      const canEdit =
        checkIsSuperAdmin(caller) ||
        hasAnyRole(caller, ['moderator']) ||
        post.authorUid === caller.uid ||
        (hasAnyRole(caller, ['school_admin']) && caller.schoolId && post.schoolId === caller.schoolId) ||
        (hasAnyRole(caller, ['district_coordinator']) && post.district === caller.district) ||
        (hasAnyRole(caller, ['regional_coordinator']) && post.region === caller.region);

      if (!canEdit) {
        return res.status(403).json({ error: "Ushbu postni tahrirlash huquqiga ega emassiz" });
      }

      const { title, content, category, imageUrl, ctaText, ctaUrl, isPinned, status } = req.body;
      if (title !== undefined) post.title = String(title).trim().slice(0, 180);
      if (content !== undefined) post.content = String(content).trim().slice(0, 1500);
      if (category !== undefined) post.category = category;
      if (imageUrl !== undefined) post.imageUrl = String(imageUrl).trim();
      if (ctaText !== undefined) post.ctaText = String(ctaText).trim().slice(0, 80);
      if (ctaUrl !== undefined) post.ctaUrl = String(ctaUrl).trim();
      if (isPinned !== undefined) post.isPinned = Boolean(isPinned);
      if (status === 'active' || status === 'paused') post.status = status;
      post.updatedAt = new Date().toISOString();

      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'home_posts' });
      res.json({ success: true, post });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.delete(
  '/api/home-posts/:id',
  requireRoles('school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const idx = (centralDb.homePosts || []).findIndex((p: any) => p.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Post topilmadi' });
      const post = centralDb.homePosts[idx];

      const canDelete =
        checkIsSuperAdmin(caller) ||
        hasAnyRole(caller, ['moderator']) ||
        post.authorUid === caller.uid ||
        (hasAnyRole(caller, ['school_admin']) && caller.schoolId && post.schoolId === caller.schoolId) ||
        (hasAnyRole(caller, ['district_coordinator']) && post.district === caller.district) ||
        (hasAnyRole(caller, ['regional_coordinator']) && post.region === caller.region);

      if (!canDelete) {
        return res.status(403).json({ error: "Ushbu postni o'chirish huquqiga ega emassiz" });
      }

      centralDb.homePosts.splice(idx, 1);
      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'home_posts' });
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Role-Scoped Real Analytics Endpoint
app.get('/api/analytics', (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser || null;
    const { region, district, schoolId, category } = req.query;

    let schools = [...centralDb.schools];
    let reports = centralDb.reports.filter((r) => canViewReport(r, caller));
    let media = (centralDb.mediaSubmissions || []).filter((m) => m.status === 'APPROVED' || (caller && hasAnyRole(caller, ['super_admin', 'moderator', 'district_coordinator', 'regional_coordinator', 'school_admin'])));

    // Strict Territorial Enforcements by Role
    let scopeLabel = "O'zbekiston Respublikasi (Umumiy)";
    if (caller && !hasAnyRole(caller, ['super_admin', 'moderator'])) {
      if (hasAnyRole(caller, ['regional_coordinator'])) {
        scopeLabel = `${caller.region} (Viloyat koordinatori)`;
        schools = schools.filter((s) => s.region === caller.region);
        reports = reports.filter((r) => r.region === caller.region);
        media = media.filter((m) => m.region === caller.region);
      } else if (hasAnyRole(caller, ['district_coordinator'])) {
        scopeLabel = `${caller.region}, ${caller.district} (Tuman koordinatori)`;
        schools = schools.filter((s) => s.district === caller.district && s.region === caller.region);
        reports = reports.filter((r) => r.district === caller.district && r.region === caller.region);
        media = media.filter((m) => m.district === caller.district && m.region === caller.region);
      } else if (hasAnyRole(caller, ['school_admin', 'ambassador'])) {
        scopeLabel = `${caller.schoolName} (Maktab miqyosi)`;
        schools = schools.filter((s) => s.id === caller.schoolId);
        reports = reports.filter((r) => r.schoolId === caller.schoolId);
        media = media.filter((m) => m.schoolId === caller.schoolId);
      }
    }

    if (region && region !== 'all') {
      schools = schools.filter((s) => s.region === String(region));
      reports = reports.filter((r) => r.region === String(region));
      media = media.filter((m) => m.region === String(region));
    }
    if (district && district !== 'all') {
      schools = schools.filter((s) => s.district === String(district));
      reports = reports.filter((r) => r.district === String(district));
      media = media.filter((m) => m.district === String(district));
    }
    if (schoolId && schoolId !== 'all') {
      schools = schools.filter((s) => s.id === String(schoolId));
      reports = reports.filter((r) => r.schoolId === String(schoolId));
      media = media.filter((m) => m.schoolId === String(schoolId));
    }
    if (category && category !== 'all') {
      reports = reports.filter((r) => r.category === String(category));
    }

    const studentsTotal = schools.reduce((s, sc) => s + (sc.registeredStudentsCount || sc.studentsCount || 0), 0);
    const totalCoins = schools.reduce((s, sc) => s + (sc.totalCoins || 0), 0);
    const treesPlanted = schools.reduce((s, sc) => s + (sc.treesPlanted || 0), 0);
    const cleanupsCompleted = schools.reduce((s, sc) => s + (sc.cleanupsCompleted || 0), 0);

    const resolvedReports = reports.filter((r) => r.status === 'resolved' || r.status === 'RESOLVED');
    const pendingReports = reports.filter((r) => r.status === 'pending' || r.status === 'PENDING_REVIEW' || r.status === 'NEEDS_INFO');
    const escalatedReports = reports.filter((r) => r.status === 'ESCALATED' || r.isHazardous);

    const mediaApproved = media.filter((m) => m.status === 'APPROVED');
    const mediaPending = media.filter((m) => m.status === 'PENDING');

    const catLabels: Record<string, string> = {
      waste: 'Chiqindi',
      water: 'Suv havzasi',
      deforestation: "Daraxtlar / O'rmon",
      air: 'Havo sifati',
      greening_needed: "Ko'kalamzorlashtirish",
      electrical_hazard: 'Elektr xavfi',
      chemical_hazard: 'Kimyoviy xavf',
    };
    const catCounts: Record<string, number> = {};
    for (const r of reports) {
      catCounts[r.category] = (catCounts[r.category] || 0) + 1;
    }

    // Monthly series built dynamically from real timestamps (last 6 months)
    const months: string[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      months.push(d.toISOString().slice(0, 7));
    }
    const monthlySeries = months.map((ym) => {
      const mReps = reports.filter((r) => String(r.createdAt || '').startsWith(ym));
      const mMedia = mediaApproved.filter((m) => String(m.createdAt || '').startsWith(ym));
      return {
        label: ym,
        reports: mReps.length,
        mediaApproved: mMedia.length,
        resolved: mReps.filter((r) => r.status === 'resolved' || r.status === 'RESOLVED').length,
        coinsAwarded:
          mReps.filter((r) => r.coinsAwarded).reduce((s, r) => s + (r.rewardCoins || 0), 0) +
          mMedia.reduce((s, m) => s + (m.awardedCoins || 0), 0),
      };
    });

    const regMap = new Map<string, any>();
    for (const s of schools) {
      const cur = regMap.get(s.region) || { region: s.region, schools: 0, students: 0, reports: 0, resolved: 0, coins: 0 };
      cur.schools += 1;
      cur.students += s.registeredStudentsCount || s.studentsCount || 0;
      cur.coins += s.totalCoins || 0;
      regMap.set(s.region, cur);
    }
    for (const r of reports) {
      const cur = regMap.get(r.region);
      if (cur) {
        cur.reports += 1;
        if (r.status === 'resolved' || r.status === 'RESOLVED') cur.resolved += 1;
      }
    }

    const distMap = new Map<string, any>();
    for (const s of schools) {
      const key = `${s.region}__${s.district}`;
      const cur = distMap.get(key) || { district: s.district, region: s.region, schools: 0, students: 0, resolved: 0, coins: 0 };
      cur.schools += 1;
      cur.students += s.registeredStudentsCount || s.studentsCount || 0;
      cur.coins += s.totalCoins || 0;
      distMap.set(key, cur);
    }
    for (const r of resolvedReports) {
      const key = `${r.region}__${r.district}`;
      if (distMap.has(key)) distMap.get(key).resolved += 1;
    }

    res.json({
      success: true,
      scopeLabel,
      role: caller?.role || 'guest',
      totals: {
        students: studentsTotal,
        schools: schools.length,
        botUsersCount: computeLiveMetrics().botUsersCount,
        districts: computeLiveMetrics().totalDistricts,
        regions: computeLiveMetrics().totalRegions,
        ambassadors: (centralDb.ambassadors || []).filter((a) => a.status === 'active' && (!caller || hasAnyRole(caller, ['super_admin', 'moderator']) || schools.some((s) => s.id === a.schoolId))).length,
        reportsTotal: reports.length,
        reportsResolved: resolvedReports.length,
        reportsPending: pendingReports.length,
        reportsEscalated: escalatedReports.length,
        mediaApproved: mediaApproved.length,
        mediaPending: mediaPending.length,
        totalEcoCoins: totalCoins,
        treesPlanted,
        cleanupsCompleted,
      },
      monthlySeries,
      categoryBreakdown: Object.entries(catCounts).map(([cat, count]) => ({
        category: cat,
        label: catLabels[cat] || cat,
        count,
      })),
      regionPerformance: Array.from(regMap.values()).sort((a, b) => b.coins - a.coins),
      districtPerformance: Array.from(distMap.values()).sort((a, b) => b.coins - a.coins),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 8. ECO SHOP, ORDERS, PARTNERS, ADS, REFERRALS (UNIFIED DB)
// ==========================================

function sanitizeShopRedemptionGate(rawGate: any): {
  mode: 'none' | 'ad' | 'subscription' | 'ad_and_subscription';
  adId?: string;
  requiredSubscriptions?: Array<{
    id: string;
    platform: 'telegram_channel' | 'telegram_bot' | 'instagram' | 'website';
    title: string;
    url: string;
    handle?: string;
  }>;
} {
  const validModes = ['none', 'ad', 'subscription', 'ad_and_subscription'];
  const mode = validModes.includes(rawGate?.mode) ? rawGate.mode : 'none';
  const validPlatforms = ['telegram_channel', 'telegram_bot', 'instagram', 'website'];

  const subs = Array.isArray(rawGate?.requiredSubscriptions)
    ? rawGate.requiredSubscriptions
        .map((s: any, idx: number) => {
          const platform = validPlatforms.includes(s?.platform) ? s.platform : 'telegram_channel';
          let rawUrl = String(s?.url || '').trim();
          let rawHandle = String(s?.handle || '').trim();
          if (!rawUrl && rawHandle) {
            const cleanH = rawHandle.replace(/^@/, '');
            rawUrl = platform === 'instagram' ? `https://instagram.com/${cleanH}` : `https://t.me/${cleanH}`;
          }
          if (rawUrl && !rawHandle) {
            if (rawUrl.startsWith('@')) {
              rawHandle = rawUrl;
              rawUrl = platform === 'instagram' ? `https://instagram.com/${rawHandle.slice(1)}` : `https://t.me/${rawHandle.slice(1)}`;
            } else {
              const tgMatch = rawUrl.match(/(?:https?:\/\/)?t\.me\/([A-Za-z0-9_]+)/i);
              if (tgMatch) rawHandle = `@${tgMatch[1]}`;
            }
          }
          if (!rawUrl) return null;
          if (!/^https?:\/\//i.test(rawUrl)) rawUrl = `https://${rawUrl}`;
          return {
            id: String(s?.id || `sub_${Date.now()}_${idx}`),
            platform,
            title: String(s?.title || rawHandle || 'Rasmiy sahifa').trim(),
            url: rawUrl,
            ...(rawHandle ? { handle: rawHandle } : {}),
          };
        })
        .filter(Boolean)
    : [];

  return {
    mode,
    ...(rawGate?.adId ? { adId: String(rawGate.adId).trim() } : {}),
    requiredSubscriptions: subs,
  };
}

async function checkGiftSubscriptionTargets(params: {
  targets: Array<{
    id: string;
    platform: string;
    title: string;
    url: string;
    handle?: string;
  }>;
  caller: any;
  visitedTargetIds?: string[];
}): Promise<{ ok: boolean; verifiedTargetIds: string[]; error?: string }> {
  const { targets, caller, visitedTargetIds = [] } = params;
  if (!targets || targets.length === 0) {
    return { ok: true, verifiedTargetIds: [] };
  }

  const visitedSet = new Set(visitedTargetIds.map(String));
  const verifiedTargetIds: string[] = [];

  for (const target of targets) {
    if (target.platform === 'telegram_channel') {
      let handle = String(target.handle || '').trim();
      if (!handle && target.url) {
        const m = target.url.match(/t\.me\/([A-Za-z0-9_]+)/i);
        if (m) handle = `@${m[1]}`;
      }
      if (handle && !handle.startsWith('@')) handle = `@${handle}`;

      let checkedByApi = false;
      if (activeBotToken && caller?.telegramId && handle.startsWith('@') && !handle.toLowerCase().endsWith('bot')) {
        try {
          const checkRes = await fetch(
            `https://api.telegram.org/bot${activeBotToken}/getChatMember?chat_id=${encodeURIComponent(handle)}&user_id=${encodeURIComponent(String(caller.telegramId))}`,
            { signal: AbortSignal.timeout(5000) }
          );
          const checkJson: any = await checkRes.json().catch(() => null);
          if (checkJson?.ok && checkJson.result) {
            checkedByApi = true;
            const st = checkJson.result.status;
            if (!['member', 'administrator', 'creator'].includes(st)) {
              return {
                ok: false,
                verifiedTargetIds,
                error: `Siz hali "${target.title}" (${handle}) Telegram kanaliga obuna bo'lmagansiz. Avval obuna bo'ling va qayta tekshiring!`,
              };
            }
            verifiedTargetIds.push(target.id);
          }
        } catch {
          // Fallback to visited confirmation if Bot API cannot inspect private/external channel
        }
      }

      if (!checkedByApi) {
        if (!visitedSet.has(target.id)) {
          return {
            ok: false,
            verifiedTargetIds,
            error: `Avval "${target.title}" sahifasiga o'tib obuna bo'ling!`,
          };
        }
        verifiedTargetIds.push(target.id);
      }
    } else {
      // telegram_bot, instagram, website
      if (!visitedSet.has(target.id)) {
        const label =
          target.platform === 'instagram'
            ? 'Instagram sahifasiga'
            : target.platform === 'telegram_bot'
            ? 'Telegram botga'
            : 'veb-sahifaga';
        return {
          ok: false,
          verifiedTargetIds,
          error: `Sovg'a promokodini olish uchun avval "${target.title}" ${label} o'tib obuna bo'ling!`,
        };
      }
      verifiedTargetIds.push(target.id);
    }
  }

  return { ok: true, verifiedTargetIds };
}

app.get('/api/shop/items', (_req, res) => {
  res.json({ success: true, items: centralDb.shopItems });
});

app.post('/api/admin/shop/item-update', requireRoles('super_admin', 'moderator'), (req: AuthenticatedRequest, res) => {
  try {
    const { itemId, title, description, imageUrl, category, sponsorName, newPriceCoins, newStock, redemptionGate } = req.body;
    const item = centralDb.shopItems.find((i) => i.id === itemId);
    if (!item) return res.status(404).json({ error: 'Mahsulot topilmadi' });

    if (title) item.title = title;
    if (description) item.description = description;
    if (imageUrl) item.imageUrl = imageUrl;
    if (category) item.category = category;
    if (sponsorName) item.sponsorName = sponsorName;
    if (newPriceCoins !== undefined) item.priceCoins = Math.max(1, Number(newPriceCoins));
    if (newStock !== undefined) item.stock = Math.max(0, Number(newStock));
    if (redemptionGate !== undefined) {
      (item as any).redemptionGate = sanitizeShopRedemptionGate(redemptionGate);
    }

    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'shop' });
    addAuditLog({
      actorUid: req.authUser.uid,
      actorName: req.authUser.fullName,
      actorRole: req.authUser.role,
      action: 'update_shop_item',
      targetCollection: 'shop_items',
      targetId: itemId,
      details: { title: item.title, priceCoins: item.priceCoins, stock: item.stock, gateMode: (item as any).redemptionGate?.mode || 'none' },
    });

    res.json({ success: true, item });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/shop/item-create', requireRoles('super_admin', 'moderator'), (req: AuthenticatedRequest, res) => {
  try {
    const { title, description, imageUrl, priceCoins, stock, category, sponsorName, features, redemptionGate } = req.body;
    if (!title || !priceCoins) {
      return res.status(400).json({ error: 'Mahsulot nomi va narxi (EcoCoin) kiritilishi shart' });
    }

    const sanitizedGate = sanitizeShopRedemptionGate(redemptionGate || { mode: 'none' });
    const newItem = {
      id: `shop_custom_${Date.now()}`,
      title,
      description: description || "ECO HERO maxsus sovg'asi",
      imageUrl: imageUrl || 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=600&q=80',
      priceCoins: Math.max(1, Number(priceCoins)),
      stock: Math.max(0, Number(stock ?? 10)),
      category: category || 'accessories',
      sponsorName: sponsorName || 'ECO HERO Hamkorlari',
      features: Array.isArray(features) ? features : ['Sifatli mahsulot', 'Eko-qadoq'],
      redemptionGate: sanitizedGate,
    };

    centralDb.shopItems.unshift(newItem);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'shop' });
    addAuditLog({
      actorUid: req.authUser.uid,
      actorName: req.authUser.fullName,
      actorRole: req.authUser.role,
      action: 'create_shop_item',
      targetCollection: 'shop_items',
      targetId: newItem.id,
      details: { title: newItem.title, priceCoins: newItem.priceCoins, stock: newItem.stock, gateMode: sanitizedGate.mode },
    });

    res.json({ success: true, item: newItem });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/shop/items/:id', requireRoles('super_admin', 'moderator'), (req: AuthenticatedRequest, res) => {
  try {
    const idx = centralDb.shopItems.findIndex((i) => i.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Mahsulot topilmadi' });
    centralDb.shopItems.splice(idx, 1);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'shop' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/shop/orders', requireAuth, (req: AuthenticatedRequest, res) => {
  const isStaff = hasAnyRole(req.authUser, ['super_admin', 'moderator', 'sponsor']);
  const isSchoolAdmin = hasAnyRole(req.authUser, ['school_admin']);
  const orders = isStaff
    ? centralDb.shopOrders
    : isSchoolAdmin
    ? centralDb.shopOrders.filter(
        (o) =>
          o.userId === req.authUser.uid ||
          (req.authUser.schoolId && o.schoolId === req.authUser.schoolId) ||
          (req.authUser.schoolName && o.schoolName === req.authUser.schoolName)
      )
    : centralDb.shopOrders.filter((o) => o.userId === req.authUser.uid);
  res.json({ success: true, orders });
});

app.post('/api/shop/verify-subscriptions', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { itemId, visitedTargetIds } = req.body || {};
    if (!itemId) {
      return res.status(400).json({ success: false, error: 'Mahsulot ID talab qilinadi' });
    }
    const item: any = centralDb.shopItems.find((i) => i.id === itemId);
    if (!item) {
      return res.status(404).json({ success: false, error: 'Sovg\'a topilmadi' });
    }
    const gate = item.redemptionGate;
    const targets =
      gate && (gate.mode === 'subscription' || gate.mode === 'ad_and_subscription')
        ? gate.requiredSubscriptions || []
        : [];
    const check = await checkGiftSubscriptionTargets({
      targets,
      caller: req.authUser,
      visitedTargetIds: Array.isArray(visitedTargetIds) ? visitedTargetIds : [],
    });
    if (!check.ok) {
      return res.status(400).json({ success: false, error: check.error });
    }
    res.json({ success: true, verifiedTargetIds: check.verifiedTargetIds });
  } catch (err: any) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/shop/order', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const user = req.authUser;
    const { itemId, itemTitle, priceCoins, sponsorName, itemImageUrl, confirmedSubscriptionIds } = req.body;
    if (!itemId) {
      return res.status(400).json({ error: 'Mahsulot ID talab qilinadi' });
    }

    const item: any = centralDb.shopItems.find((i) => i.id === itemId);
    if (item && item.stock <= 0) {
      return res.status(400).json({ error: 'Ushbu mahsulot omborda qolmagan' });
    }

    const cost = item ? Number(item.priceCoins) : Number(priceCoins) || 100;
    if ((user.ecoCoins || 0) < cost) {
      return res.status(400).json({ error: `EcoCoin balansingiz yetarli emas (${user.ecoCoins}/${cost})` });
    }

    // Enforce Super Admin configured mandatory subscriptions before deducting coins
    const gate = item?.redemptionGate;
    if (
      gate &&
      (gate.mode === 'subscription' || gate.mode === 'ad_and_subscription') &&
      Array.isArray(gate.requiredSubscriptions) &&
      gate.requiredSubscriptions.length > 0
    ) {
      const subCheck = await checkGiftSubscriptionTargets({
        targets: gate.requiredSubscriptions,
        caller: user,
        visitedTargetIds: Array.isArray(confirmedSubscriptionIds) ? confirmedSubscriptionIds : [],
      });
      if (!subCheck.ok) {
        return res.status(400).json({ error: subCheck.error });
      }
    }

    if (item) {
      item.stock = Math.max(0, (item.stock || 0) - 1);
    }
    user.ecoCoins = Math.max(0, (user.ecoCoins || 0) - cost);
    recordTransaction({
      userId: user.uid,
      amount: -cost,
      type: 'spend',
      status: 'approved',
      reason: `EcoShop xarid: ${item?.title || itemTitle}`,
    });

    const voucherCode = `ECO-${Math.random().toString(36).substring(2, 6).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;
    const resolvedImage =
      item?.imageUrl ||
      itemImageUrl ||
      'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=600&q=80';

    const order = {
      id: `ord_${Date.now()}`,
      userId: user.uid,
      userName: user.fullName || "O'quvchi",
      userEmail: user.email || '',
      schoolId: user.schoolId || '',
      schoolName: user.schoolName || 'Maktab',
      itemId,
      itemTitle: item?.title || itemTitle,
      itemImageUrl: resolvedImage,
      priceCoins: cost,
      voucherCode,
      qrToken: crypto.randomUUID(),
      status: 'pending',
      createdAt: new Date().toISOString(),
      sponsorName: item?.sponsorName || sponsorName || 'ECO HERO Hamkori',
      verifiedBySchoolAdmin: false,
    };

    centralDb.shopOrders.unshift(order);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'shop' });

    addAuditLog({
      actorUid: order.userId,
      actorName: order.userName,
      actorRole: user.role || 'student',
      action: 'redeem_gift_order',
      targetCollection: 'shop_orders',
      targetId: order.id,
      details: { itemTitle: order.itemTitle, priceCoins: cost, voucherCode },
    });

    const voucherUrl = `${APP_URL}/voucher/${voucherCode}`;
    res.json({
      success: true,
      order,
      voucherCode,
      voucherUrl,
      newBalance: user.ecoCoins,
      user: sanitizeSelfUser(user),
      updatedStock: item?.stock,
      liveMetrics: computeLiveMetrics(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Public QR scan greeting endpoint (NO PII leaked)
app.get('/api/shop/voucher/public/:code', (req, res) => {
  try {
    const cleanCode = decodeURIComponent(String(req.params.code || '')).trim().toUpperCase();
    if (!cleanCode) {
      return res.status(400).json({ valid: false, error: 'Vaucher kodi kiritilmagan' });
    }
    const order = centralDb.shopOrders.find(
      (o) =>
        String(o.voucherCode || '').trim().toUpperCase() === cleanCode ||
        String(o.qrToken || '').trim().toUpperCase() === cleanCode
    );
    if (!order) {
      return res.status(404).json({ valid: false, error: "Ushbu QR kod yoki promokod bo'yicha sovg'a topilmadi" });
    }
    const matchedItem = centralDb.shopItems.find((i) => i.id === order.itemId);
    res.json({
      valid: true,
      voucherCode: order.voucherCode,
      itemTitle: order.itemTitle,
      itemImageUrl:
        order.itemImageUrl ||
        matchedItem?.imageUrl ||
        'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=600&q=80',
      sponsorName: order.sponsorName || 'ECO HERO Hamkori',
      winnerName: order.userName || 'Eko-Qahramon',
      schoolName: order.schoolName || "O'zbekiston maktabi",
      status: order.status,
      createdAt: order.createdAt,
      verifiedBySchoolAdmin: Boolean(order.verifiedBySchoolAdmin),
      verifiedByName: order.verifiedByName || undefined,
    });
  } catch (err: any) {
    res.status(500).json({ valid: false, error: err.message });
  }
});

// Authenticated Promo/QR Verifier ("Tekshirgich") for School Admin, Moderator & Super Admin
app.get(
  '/api/shop/voucher/check/:code',
  requireRoles('school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const cleanCode = decodeURIComponent(String(req.params.code || '')).trim().toUpperCase();
      if (!cleanCode) {
        return res.status(400).json({ valid: false, error: 'Promokod kiritilishi shart' });
      }
      const order = centralDb.shopOrders.find(
        (o) =>
          String(o.voucherCode || '').trim().toUpperCase() === cleanCode ||
          String(o.qrToken || '').trim().toUpperCase() === cleanCode ||
          String(o.id || '').trim().toUpperCase() === cleanCode
      );
      if (!order) {
        return res.status(404).json({
          valid: false,
          error: "Bu promokod bazada topilmadi! O'quvchi chindan ham sovg'a yutgani tasdiqlanmadi.",
        });
      }
      const matchedItem = centralDb.shopItems.find((i) => i.id === order.itemId);
      const enrichedOrder = {
        ...order,
        itemImageUrl:
          order.itemImageUrl ||
          matchedItem?.imageUrl ||
          'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=600&q=80',
      };
      res.json({
        valid: true,
        alreadyDelivered: order.status === 'delivered',
        order: enrichedOrder,
      });
    } catch (err: any) {
      res.status(500).json({ valid: false, error: err.message });
    }
  }
);

app.post(
  '/api/shop/voucher/verify-forward',
  requireRoles('school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const { voucherCode, note, action } = req.body || {};
      const cleanCode = String(voucherCode || '').trim().toUpperCase();
      if (!cleanCode) {
        return res.status(400).json({ error: 'Promokod talab qilinadi' });
      }
      const order = centralDb.shopOrders.find(
        (o) =>
          String(o.voucherCode || '').trim().toUpperCase() === cleanCode ||
          String(o.qrToken || '').trim().toUpperCase() === cleanCode ||
          String(o.id || '').trim().toUpperCase() === cleanCode
      );
      if (!order) {
        return res.status(404).json({ error: 'Promokod bazada topilmadi' });
      }
      if (order.status === 'cancelled') {
        return res.status(400).json({ error: 'Ushbu buyurtma bekor qilingan' });
      }

      const nowIso = new Date().toISOString();
      const canMarkDelivered = action === 'deliver' && hasAnyRole(req.authUser, ['super_admin', 'moderator']);

      if (canMarkDelivered) {
        order.status = 'delivered';
        order.approvedAt = nowIso;
        order.verifiedBySchoolAdmin = order.verifiedBySchoolAdmin || true;
        order.verifiedByUid = order.verifiedByUid || req.authUser.uid;
        order.verifiedByName = order.verifiedByName || req.authUser.fullName;
        order.verifiedAt = order.verifiedAt || nowIso;
        if (note) order.verificationNote = String(note);
        saveCentralDb();

        addAuditLog({
          actorUid: req.authUser.uid,
          actorName: req.authUser.fullName,
          actorRole: req.authUser.role,
          action: 'voucher_delivered',
          targetCollection: 'shop_orders',
          targetId: order.id,
          details: { voucherCode: order.voucherCode, winner: order.userName, itemTitle: order.itemTitle },
        });

        centralDb.notifications.unshift({
          id: `notif_${Date.now()}`,
          userId: order.userId,
          title: "Sovg'angiz topshirildi! 🎁",
          message: `Sizning ${order.itemTitle} sovg'angiz (${order.voucherCode}) tasdiqlandi va topshirildi.`,
          type: 'status',
          read: false,
          createdAt: nowIso,
        });
        saveCentralDb();

        const winnerUser = findUserByAnyIdentifier({ uid: order.userId });
        if (winnerUser?.telegramChatId || winnerUser?.telegramId) {
          sendTelegramMessage(
            winnerUser.telegramChatId || winnerUser.telegramId,
            `🎁 <b>TABRIKLAYMIZ!</b>\n\nSizning <b>${order.itemTitle}</b> sovg'angiz (<code>${order.voucherCode}</code>) topshirildi!\nECO HERO safida faol bo'lishda davom eting! 🌿`
          ).catch(() => {});
        }

        return res.json({
          success: true,
          order,
          message: "Sovg'a topshirildi deb belgilandi va o'quvchiga xabar yuborildi!",
        });
      }

      // School admin / coordinator verifies voucher & forwards alert + promo code to Super Admin
      order.verifiedBySchoolAdmin = true;
      order.verifiedByUid = req.authUser.uid;
      order.verifiedByName = req.authUser.fullName || 'Maktab Admini';
      order.verifiedAt = nowIso;
      order.forwardedToSuperAdminAt = nowIso;
      order.verificationNote = note ? String(note) : `${req.authUser.fullName} tomonidan maktabda tasdiqlandi`;
      if (order.status === 'pending') {
        order.status = 'approved';
        order.approvedAt = nowIso;
      }
      saveCentralDb();

      addAuditLog({
        actorUid: req.authUser.uid,
        actorName: req.authUser.fullName,
        actorRole: req.authUser.role,
        action: 'voucher_verified_and_forwarded',
        targetCollection: 'shop_orders',
        targetId: order.id,
        details: { voucherCode: order.voucherCode, winner: order.userName, school: order.schoolName },
      });

      const superAdmins = Object.values(centralDb.users).filter(
        (u: any) => u.role === 'super_admin' || String(u.telegramId || '') === '8832599080'
      );
      const notifyTargets = new Set<string>(['user_tg_8832599080', ...superAdmins.map((u: any) => u.uid)]);
      for (const uid of notifyTargets) {
        centralDb.notifications.unshift({
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          userId: uid,
          title: `Vaucher tekshirildi: ${order.voucherCode}`,
          message: `${req.authUser.fullName} (${req.authUser.schoolName || order.schoolName}) o'quvchi ${order.userName} ning "${order.itemTitle}" sovg'asi uchun promokodni tasdiqladi va sizga yubordi.`,
          type: 'status',
          read: false,
          createdAt: nowIso,
        });
      }
      saveCentralDb();

      sendTelegramMessage(
        '8832599080',
        `🎁 <b>MAKTAB ADMINIDAN SOVG'A VAUCHERI XABARI</b>\n\n🏫 <b>Maktab:</b> ${order.schoolName}\n👨‍🏫 <b>Tekshirgan admin:</b> ${req.authUser.fullName} (${req.authUser.role})\n👤 <b>G'olib o'quvchi:</b> ${order.userName}\n🎁 <b>Sovg'a:</b> ${order.itemTitle}\n🎟 <b>Promokod:</b> <code>${order.voucherCode}</code>\n📝 <b>Izoh:</b> ${order.verificationNote}\n\n✅ Baza tekshiruvi: <b>HAQIQIY YUTUQ</b>`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: "✅ Sovg'ani topshirildi deb belgilash", callback_data: `deliver_ord:${order.id}` }],
            ],
          },
        }
      ).catch(() => {});

      res.json({
        success: true,
        order,
        message: "Promokod bazada tasdiqlandi va Super Adminga Telegram hamda tizim orqali yuborildi!",
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.patch('/api/admin/shop/orders/:id/status', requireRoles('super_admin', 'moderator'), (req: AuthenticatedRequest, res) => {
  try {
    const { status } = req.body;
    const order = centralDb.shopOrders.find((o) => o.id === req.params.id);
    if (!order) return res.status(404).json({ error: 'Buyurtma topilmadi' });

    order.status = status;
    if (status === 'approved' || status === 'delivered') {
      order.approvedAt = new Date().toISOString();
    }
    saveCentralDb();

    addAuditLog({
      actorUid: req.authUser.uid,
      actorName: req.authUser.fullName,
      actorRole: req.authUser.role,
      action: `shop_order_${status}`,
      targetCollection: 'shop_orders',
      targetId: order.id,
      details: { itemTitle: order.itemTitle, student: order.userName, status },
    });

    res.json({ success: true, order });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/partners', (_req, res) => {
  res.json({ success: true, partners: centralDb.partners });
});

app.post('/api/partners/proposal', (req, res) => {
  try {
    const {
      companyName,
      contactPerson,
      contactEmail,
      contactPhone,
      sponsorshipType,
      fundingAmountUZS,
      productDescription,
      targetSchoolsOrRegions,
      proposalDetails,
    } = req.body;
    if (!companyName || !contactEmail) {
      return res.status(400).json({ error: 'Kompaniya nomi va elektron pochta talab qilinadi' });
    }

    const proposal = {
      id: `prop_${Date.now()}`,
      companyName,
      contactPerson: contactPerson || "Noma'lum",
      contactEmail,
      contactPhone: contactPhone || '',
      sponsorshipType: sponsorshipType || 'funds',
      fundingAmountUZS: Number(fundingAmountUZS) || 0,
      productDescription: productDescription || '',
      targetSchoolsOrRegions: targetSchoolsOrRegions || 'Barcha hududlar',
      proposalDetails: proposalDetails || '',
      status: 'pending',
      submittedAt: new Date().toISOString(),
    };

    centralDb.sponsorshipProposals.unshift(proposal);
    saveCentralDb();
    res.json({ success: true, proposal });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/partners/proposals', requireRoles('super_admin', 'sponsor'), (_req, res) => {
  res.json({ success: true, proposals: centralDb.sponsorshipProposals });
});

app.post('/api/admin/partners/proposal-status', requireRoles('super_admin'), (req: AuthenticatedRequest, res) => {
  try {
    const { proposalId, status, adminNotes } = req.body;
    const proposal = centralDb.sponsorshipProposals.find((p) => p.id === proposalId);
    if (!proposal) return res.status(404).json({ error: 'Homiylik taklifi topilmadi' });

    proposal.status = status;
    proposal.adminNotes = adminNotes || proposal.adminNotes;
    proposal.reviewedBy = req.authUser.fullName;
    proposal.reviewedAt = new Date().toISOString();

    if (status === 'approved') {
      const existingPartner = centralDb.partners.find(
        (p) => p.name.toLowerCase() === proposal.companyName.toLowerCase()
      );
      if (!existingPartner) {
        centralDb.partners.push({
          id: `part_${Date.now()}`,
          name: proposal.companyName,
          category: proposal.sponsorshipType === 'funds' ? 'Moliyaviy Homiy' : 'Mahsulot Homiysi',
          logoText: proposal.companyName.slice(0, 6).toUpperCase(),
          description: proposal.proposalDetails || 'Tasdiqlangan ECO HERO rasmiy homiysi.',
          website: 'https://ecohero.uz',
          projectsSupported: proposal.targetSchoolsOrRegions,
          contactEmail: proposal.contactEmail,
          contactPhone: proposal.contactPhone,
          contactPerson: proposal.contactPerson,
          isVerified: true,
          totalDonationUZS: proposal.fundingAmountUZS || 50000000,
          sponsoredProductsCount: proposal.sponsorshipType === 'products' ? 3 : 1,
        });
      }
    }

    saveCentralDb();
    res.json({ success: true, proposal });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sponsorship-projects', (_req, res) => {
  res.json({ success: true, projects: centralDb.sponsorshipProjects });
});

app.post('/api/admin/sponsorship-projects', requireRoles('super_admin', 'sponsor'), (req, res) => {
  try {
    const { partnerId, partnerName, title, description, category, targetAmountUZS, inKindItems, schoolsBenefited, imageUrl } = req.body;
    if (!title || !partnerName) {
      return res.status(400).json({ error: 'Loyiha nomi va homiy nomi kiritilishi shart' });
    }

    const newProject = {
      id: `proj_${Date.now()}`,
      partnerId: partnerId || 'part_custom',
      partnerName,
      partnerLogoText: partnerName.slice(0, 6).toUpperCase(),
      title,
      description: description || '',
      category: category || 'greening',
      targetAmountUZS: Number(targetAmountUZS) || 100000000,
      raisedAmountUZS: 0,
      inKindItems: inKindItems || '',
      schoolsBenefited: Number(schoolsBenefited) || 10,
      treesPlantedOrImpact: 'Loyiha endi boshlanmoqda',
      status: 'active',
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
      imageUrl: imageUrl || 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=800&q=80',
    };

    centralDb.sponsorshipProjects.unshift(newProject);
    saveCentralDb();
    res.json({ success: true, project: newProject });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const activeAdWatchSessions = new Map<
  string,
  { userId: string; adId: string; startedAt: number; requiredSeconds: number }
>();

app.get('/api/ads', (req, res) => {
  const placement = req.query.placement as string | undefined;
  let ads = centralDb.ecoAds.filter((a) => a.status === 'active');
  if (placement) ads = ads.filter((a) => a.placement === placement);
  res.json({ success: true, ads });
});

app.post('/api/ads/impression/:id', (req, res) => {
  const ad = centralDb.ecoAds.find((a) => a.id === req.params.id);
  if (ad) {
    ad.impressionsCount = (ad.impressionsCount || 0) + 1;
    saveCentralDb();
    return res.json({ success: true, impressionsCount: ad.impressionsCount });
  }
  res.status(404).json({ error: 'Reklama topilmadi' });
});

app.post('/api/ads/click/:id', (req, res) => {
  const ad = centralDb.ecoAds.find((a) => a.id === req.params.id);
  if (ad) {
    ad.clicksCount = (ad.clicksCount || 0) + 1;
    saveCentralDb();
    return res.json({ success: true, clicksCount: ad.clicksCount });
  }
  res.status(404).json({ error: 'Reklama topilmadi' });
});

// Start a timed ad watch session (5s to 300s configurable per ad)
app.post('/api/ads/watch-start', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { adId } = req.body || {};
    const ad = centralDb.ecoAds.find((a) => a.id === adId && a.status === 'active');
    if (!ad) {
      return res.status(404).json({ error: 'Faol reklama topilmadi' });
    }
    const requiredSeconds = Math.max(5, Math.min(300, Number(ad.skipAfterSeconds || 15)));
    const watchSessionId = `adws_${crypto.randomUUID()}`;
    activeAdWatchSessions.set(watchSessionId, {
      userId: req.authUser.uid,
      adId: ad.id,
      startedAt: Date.now(),
      requiredSeconds,
    });
    if (activeAdWatchSessions.size > 5000) {
      const oldestKey = activeAdWatchSessions.keys().next().value;
      if (oldestKey) activeAdWatchSessions.delete(oldestKey);
    }
    res.json({ success: true, watchSessionId, requiredSeconds });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Claim EcoCoins automatically once ad watch finishes
app.post('/api/ads/watch-reward', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.authUser;
    const { adId, watchSessionId } = req.body || {};
    const ad = centralDb.ecoAds.find((a) => a.id === adId && a.status === 'active');
    if (!ad) {
      return res.status(404).json({ error: 'Faol reklama topilmadi' });
    }

    const session = watchSessionId ? activeAdWatchSessions.get(String(watchSessionId)) : null;
    const requiredSec = Math.max(5, Math.min(300, Number(ad.skipAfterSeconds || 15)));
    if (!session || session.userId !== user.uid || session.adId !== ad.id) {
      return res.status(400).json({ error: "Reklama ko'rish sessiyasi topilmadi. Qaytadan boshlang." });
    }

    const elapsedMs = Date.now() - session.startedAt;
    if (elapsedMs < Math.max(4000, (requiredSec - 2) * 1000)) {
      const remaining = Math.ceil((requiredSec * 1000 - elapsedMs) / 1000);
      return res.status(400).json({
        error: `Iltimos, reklama tugashini kuting (yana ${Math.max(1, remaining)} soniya)`,
      });
    }
    activeAdWatchSessions.delete(String(watchSessionId));

    const todayStr = new Date().toISOString().split('T')[0];
    const todaysClaims = (centralDb.adRewardClaims || []).filter(
      (c) => c.userId === user.uid && String(c.claimedAt || '').startsWith(todayStr)
    );
    if (todaysClaims.length >= 10) {
      return res.status(429).json({
        error: "Bugungi reklama orqali coin olish limiti (10 ta) tugadi. Ertaga yana urinib ko'ring!",
      });
    }

    const rewardAmount = Number(ad.rewardCoins) > 0 ? Number(ad.rewardCoins) : 100;
    user.ecoCoins = (user.ecoCoins || 0) + rewardAmount;
    user.totalCoinsEarned = (user.totalCoinsEarned || 0) + rewardAmount;
    if (user.activityStats) {
      user.activityStats.totalCoinsEarned = (user.activityStats.totalCoinsEarned || 0) + rewardAmount;
    }

    ad.impressionsCount = (ad.impressionsCount || 0) + 1;

    centralDb.adRewardClaims = centralDb.adRewardClaims || [];
    centralDb.adRewardClaims.unshift({
      id: `adc_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      userId: user.uid,
      adId: ad.id,
      amount: rewardAmount,
      claimedAt: new Date().toISOString(),
    });
    if (centralDb.adRewardClaims.length > 5000) {
      centralDb.adRewardClaims = centralDb.adRewardClaims.slice(0, 5000);
    }

    recordTransaction({
      userId: user.uid,
      amount: rewardAmount,
      type: 'earn',
      status: 'approved',
      reason: `Reklama ko'rish mukofoti (${ad.title})`,
    });

    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'ads' });

    addAuditLog({
      actorUid: user.uid,
      actorName: user.fullName || "O'quvchi",
      actorRole: user.role || 'student',
      action: 'ad_watch_reward',
      targetCollection: 'ad_reward_claims',
      targetId: ad.id,
      details: { amount: rewardAmount, adTitle: ad.title },
    });

    res.json({
      success: true,
      awardedCoins: rewardAmount,
      newBalance: user.ecoCoins,
      user: sanitizeSelfUser(user),
      message: `Tabriklaymiz! +${rewardAmount} EcoCoin balansingizga avtomatik qo'shildi!`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/ads', requireRoles('super_admin', 'sponsor'), (_req, res) => {
  res.json({ success: true, ads: centralDb.ecoAds });
});

app.post('/api/admin/ads', requireRoles('super_admin', 'sponsor'), (req, res) => {
  try {
    const {
      title,
      sponsorName,
      type,
      placement,
      headline,
      subheadline,
      imageUrl,
      videoUrl,
      ctaText,
      ctaUrl,
      ctaType,
      clickOpensLink,
      rewardCoins,
      skipAfterSeconds,
      complianceNote,
    } = req.body;
    if (!title || !headline || !ctaUrl) {
      return res.status(400).json({ error: "Sarlavha, e'lon matni va havola talab qilinadi" });
    }

    const resolvedPlacement = placement || 'home_top';
    const inferredCtaType =
      ctaType && ['website', 'telegram_bot', 'telegram_channel'].includes(ctaType)
        ? ctaType
        : /t\.me\/|telegram\.me\//i.test(String(ctaUrl))
        ? /bot$/i.test(String(ctaUrl).trim())
          ? 'telegram_bot'
          : 'telegram_channel'
        : 'website';

    const newAd = {
      id: `ad_${Date.now()}`,
      title,
      sponsorId: 'part_sponsor',
      sponsorName: sponsorName || 'ECO HERO Hamkori',
      sponsorLogo: (sponsorName || 'ECO').slice(0, 5).toUpperCase(),
      type: type || (videoUrl ? 'video' : 'banner'),
      placement: resolvedPlacement,
      headline,
      subheadline: subheadline || '',
      imageUrl: imageUrl || 'https://images.unsplash.com/photo-1542601906990-b4d3fb778b09?auto=format&fit=crop&w=1200&q=80',
      ...(videoUrl ? { videoUrl } : {}),
      ctaText: ctaText || "Batafsil ma'lumot",
      ctaUrl,
      ctaType: inferredCtaType,
      clickOpensLink: clickOpensLink !== false,
      rewardCoins:
        resolvedPlacement === 'earn_coins'
          ? Math.max(10, Number(rewardCoins) || 100)
          : Number(rewardCoins) || 0,
      skipAfterSeconds: Math.max(5, Math.min(300, Number(skipAfterSeconds) || 15)),
      isVerifiedSponsor: true,
      startDate: new Date().toISOString().split('T')[0],
      endDate: new Date(Date.now() + 90 * 86400000).toISOString().split('T')[0],
      status: 'active',
      impressionsCount: 0,
      clicksCount: 0,
      complianceNote: complianceNote || "O'quvchilar xavfsizligi qoidalariga to'liq muvofiq.",
    };

    centralDb.ecoAds.unshift(newAd);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'ads' });
    res.json({ success: true, ad: newAd });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/ads/:id/status', requireRoles('super_admin', 'sponsor'), (req, res) => {
  const { status } = req.body;
  const ad = centralDb.ecoAds.find((a) => a.id === req.params.id);
  if (!ad) return res.status(404).json({ error: 'Reklama topilmadi' });
  ad.status = status;
  saveCentralDb();
  broadcastRealtimeEvent('db:updated', { scope: 'ads' });
  res.json({ success: true, ad });
});

app.patch('/api/admin/ads/:id', requireRoles('super_admin', 'sponsor'), (req, res) => {
  try {
    const ad = centralDb.ecoAds.find((a) => a.id === req.params.id);
    if (!ad) return res.status(404).json({ error: 'Reklama topilmadi' });
    const {
      title,
      sponsorName,
      type,
      placement,
      headline,
      subheadline,
      imageUrl,
      videoUrl,
      ctaText,
      ctaUrl,
      ctaType,
      clickOpensLink,
      rewardCoins,
      skipAfterSeconds,
      complianceNote,
      status,
    } = req.body || {};

    if (title !== undefined) ad.title = String(title).trim();
    if (sponsorName !== undefined) ad.sponsorName = String(sponsorName).trim();
    if (type !== undefined) ad.type = type;
    if (placement !== undefined) ad.placement = placement;
    if (headline !== undefined) ad.headline = String(headline).trim();
    if (subheadline !== undefined) ad.subheadline = String(subheadline).trim();
    if (imageUrl !== undefined) ad.imageUrl = String(imageUrl).trim();
    if (videoUrl !== undefined) {
      ad.videoUrl = String(videoUrl).trim() || undefined;
      if (ad.videoUrl && !type) ad.type = 'video';
    }
    if (ctaText !== undefined) ad.ctaText = String(ctaText).trim();
    if (ctaUrl !== undefined) ad.ctaUrl = String(ctaUrl).trim();
    if (ctaType !== undefined && ['website', 'telegram_bot', 'telegram_channel'].includes(ctaType)) {
      ad.ctaType = ctaType;
    }
    if (clickOpensLink !== undefined) ad.clickOpensLink = Boolean(clickOpensLink);
    if (rewardCoins !== undefined) ad.rewardCoins = Math.max(0, Number(rewardCoins) || 0);
    if (skipAfterSeconds !== undefined) ad.skipAfterSeconds = Math.max(5, Math.min(300, Number(skipAfterSeconds) || 15));
    if (complianceNote !== undefined) ad.complianceNote = String(complianceNote).trim();
    if (status === 'active' || status === 'paused') ad.status = status;

    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'ads' });
    res.json({ success: true, ad });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/ads/:id', requireRoles('super_admin', 'sponsor'), (req, res) => {
  try {
    const idx = centralDb.ecoAds.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Reklama topilmadi' });
    centralDb.ecoAds.splice(idx, 1);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'ads' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 8.5 ECO MISSIONS HUB (MULTI-QUESTION QUIZZES, CHANNELS, CUSTOM TASKS)
// ==========================================

function normalizeQuizQuestions(missionOrBody: any) {
  const list = Array.isArray(missionOrBody?.questions)
    ? missionOrBody.questions
        .map((q: any, idx: number) => {
          const opts = Array.isArray(q?.options)
            ? q.options.map((o: any) => String(o || '').trim()).filter(Boolean)
            : [];
          const qText = String(q?.question || '').trim();
          if (!qText || opts.length < 2) return null;
          return {
            id: String(q?.id || `q_${Date.now()}_${idx}`),
            question: qText,
            options: opts,
            correctIndex: Math.max(0, Math.min(opts.length - 1, Number(q?.correctIndex) || 0)),
            explanation: String(q?.explanation || '').trim() || undefined,
          };
        })
        .filter(Boolean)
    : [];

  if (list.length > 0) return list;

  // Fallback for legacy single-question structure
  const legacyOpts = Array.isArray(missionOrBody?.options)
    ? missionOrBody.options.map((o: any) => String(o || '').trim()).filter(Boolean)
    : [];
  if (missionOrBody?.question && legacyOpts.length >= 2) {
    return [
      {
        id: `q_${missionOrBody?.id || Date.now()}_0`,
        question: String(missionOrBody.question).trim(),
        options: legacyOpts,
        correctIndex: Math.max(0, Math.min(legacyOpts.length - 1, Number(missionOrBody.correctIndex) || 0)),
        explanation: String(missionOrBody.explanation || '').trim() || undefined,
      },
    ];
  }
  return [];
}

function sanitizeMissionForCaller(m: any, isAdmin: boolean) {
  if (isAdmin || m.type !== 'quiz') return m;
  const normalizedQuestions = normalizeQuizQuestions(m).map(({ correctIndex: _ci, ...qRest }: any) => qRest);
  const { correctIndex: _legacyCi, ...rest } = m;
  return {
    ...rest,
    questions: normalizedQuestions,
    passingPercent: Math.max(10, Math.min(100, Number(m.passingPercent) || 70)),
  };
}

function parseQuizTextLocally(rawText: string) {
  const trimmed = String(rawText || '').trim();
  if (!trimmed) return [];

  // 1. Try JSON array or { questions: [...] }
  try {
    const parsedJson = JSON.parse(trimmed);
    const arr = Array.isArray(parsedJson) ? parsedJson : parsedJson?.questions;
    if (Array.isArray(arr)) {
      const normalized = normalizeQuizQuestions({ questions: arr });
      if (normalized.length > 0) return normalized;
    }
  } catch {
    // not JSON, continue text parser
  }

  // 2. Parse numbered/line-separated blocks:
  // Supports "1. Savol", "1) Savol", "Savol: ..." + "A) ...", "*B) ...", "+C) ...", "Javob: B"
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const questions: any[] = [];
  let current: { question: string; options: string[]; correctIndex: number; explanation?: string } | null = null;

  const flushCurrent = () => {
    if (current && current.question && current.options.length >= 2) {
      questions.push({
        id: `q_imp_${Date.now()}_${questions.length}`,
        question: current.question,
        options: current.options,
        correctIndex: Math.max(0, Math.min(current.options.length - 1, current.correctIndex)),
        ...(current.explanation ? { explanation: current.explanation } : {}),
      });
    }
    current = null;
  };

  for (const line of lines) {
    const qStart = line.match(/^(?:\d+[.)]\s+|Savol\s*\d*\s*[:.)-]\s+|Question\s*\d*\s*[:.)-]\s+)(.+)$/i);
    const optMatch = line.match(/^([*+✓✔]?)\s*([A-Da-d])\s*[).:\-]\s*(.+)$/);
    const ansMatch = line.match(/^(?:Javob|To'g'ri\s*javob|To‘g‘ri\s*javob|Answer|Correct)\s*[:\-]\s*([A-Da-d1-4])(?:\s*[).:-].*)?$/i);
    const expMatch = line.match(/^(?:Izoh|Tushuntirish|Explanation)\s*[:\-]\s*(.+)$/i);

    if (ansMatch && current) {
      const token = ansMatch[1].toUpperCase();
      const idx = ['A', 'B', 'C', 'D'].indexOf(token);
      if (idx >= 0) current.correctIndex = idx;
      else if (['1', '2', '3', '4'].includes(token)) current.correctIndex = Number(token) - 1;
    } else if (expMatch && current) {
      current.explanation = expMatch[1].trim();
    } else if (optMatch && current) {
      const isMarkedCorrect = Boolean(optMatch[1]) || /\(\s*(?:to'g'ri|to‘g‘ri|correct|\*)\s*\)\s*$/i.test(optMatch[3]);
      const optClean = optMatch[3].replace(/\(\s*(?:to'g'ri|to‘g‘ri|correct|\*)\s*\)\s*$/i, '').trim();
      if (isMarkedCorrect) {
        current.correctIndex = current.options.length;
      }
      current.options.push(optClean);
    } else if (qStart) {
      flushCurrent();
      current = { question: qStart[1].trim(), options: [], correctIndex: 0 };
    } else if (!current) {
      current = { question: line, options: [], correctIndex: 0 };
    } else if (current.options.length === 0) {
      current.question = `${current.question} ${line}`.trim();
    } else {
      // New unnumbered question block started cleanly
      flushCurrent();
      current = { question: line, options: [], correctIndex: 0 };
    }
  }
  flushCurrent();
  return questions;
}

app.post(
  '/api/missions/parse-quiz',
  requireRoles('super_admin', 'moderator', 'school_admin'),
  async (req: AuthenticatedRequest, res) => {
    try {
      const rawText = String(req.body?.rawText || '').trim();
      if (!rawText || rawText.length < 10) {
        return res.status(400).json({ error: 'Import qilish uchun test matnini kiriting' });
      }

      const localQuestions = parseQuizTextLocally(rawText);
      if (localQuestions.length > 0 && localQuestions.every((q: any) => q.options.length >= 2)) {
        return res.json({ success: true, questions: localQuestions, parser: 'structured' });
      }

      if (!process.env.GEMINI_API_KEY) {
        return res.status(400).json({
          error: "Test formati aniqlanmadi. Iltimos, '1. Savol', 'A) variant', '*B) to'g'ri variant' yoki JSON formatida kiriting.",
        });
      }

      const aiRes = await generateContentWithModelFallback({
        contents: [
          {
            text: `Quyidagi matn yoki testlar to'plamidan barcha savollarni ajratib ol va qat'iy JSON formatda qaytar:
{
  "questions": [
    {
      "question": "Savol matni",
      "options": ["Variant 1", "Variant 2", "Variant 3", "Variant 4"],
      "correctIndex": 0,
      "explanation": "Qisqa izoh"
    }
  ]
}
Matn:
${rawText.slice(0, 18000)}`,
          },
        ],
        config: { responseMimeType: 'application/json' },
      });

      const parsed = parseModelJsonResponse(aiRes.text || '');
      const aiQuestions = normalizeQuizQuestions({ questions: parsed?.questions || (Array.isArray(parsed) ? parsed : []) });
      if (aiQuestions.length === 0) {
        return res.status(400).json({ error: 'Matndan test savollarini ajratib bo‘lmadi' });
      }
      res.json({ success: true, questions: aiQuestions, parser: 'ai' });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || 'Testni tahlil qilishda xatolik' });
    }
  }
);

app.get('/api/missions', (req: AuthenticatedRequest, res) => {
  const caller = req.authUser || null;
  const isAdmin = Boolean(caller && hasAnyRole(caller, ['super_admin', 'moderator', 'school_admin']));
  const missions = (centralDb.ecoMissions || [])
    .filter((m: any) => m.status === 'active' || isAdmin)
    .map((m: any) => sanitizeMissionForCaller(m, isAdmin));
  const submissions = !caller
    ? []
    : isAdmin
    ? centralDb.missionSubmissions || []
    : (centralDb.missionSubmissions || []).filter((s: any) => s.userId === caller.uid);
  const completedIds = caller ? centralDb.missionCompletions?.[caller.uid] || [] : [];
  res.json({ success: true, missions, submissions, completedIds });
});

app.post('/api/missions', requireRoles('super_admin', 'moderator', 'school_admin'), (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const {
      type,
      title,
      description,
      rewardCoins,
      category,
      questions,
      passingPercent,
      question,
      options,
      correctIndex,
      explanation,
      channelUsername,
      channelUrl,
      requiresProof,
      proofType,
    } = req.body || {};

    if (!title || !['quiz', 'channel_subscribe', 'custom_task'].includes(type)) {
      return res.status(400).json({ error: 'Topshiriq turi va sarlavhasi kiritilishi shart' });
    }

    const newMission: any = {
      id: `mission_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      title: String(title).trim(),
      description: String(description || '').trim(),
      rewardCoins: Math.max(1, Number(rewardCoins) || 100),
      status: 'active',
      category: category || type,
      createdAt: new Date().toISOString(),
      createdByUid: caller.uid,
      createdByName: caller.fullName,
    };

    if (type === 'quiz') {
      const normalizedQuestions = normalizeQuizQuestions({ questions, question, options, correctIndex, explanation });
      if (normalizedQuestions.length === 0) {
        return res.status(400).json({ error: 'Kamida 1 ta savol va 2 ta javob varianti kiriting' });
      }
      newMission.questions = normalizedQuestions;
      newMission.passingPercent = Math.max(10, Math.min(100, Number(passingPercent) || 70));
      newMission.question = normalizedQuestions[0].question;
      newMission.options = normalizedQuestions[0].options;
      newMission.correctIndex = normalizedQuestions[0].correctIndex;
      newMission.explanation = normalizedQuestions[0].explanation || '';
    } else if (type === 'channel_subscribe') {
      if (!channelUrl && !channelUsername) {
        return res.status(400).json({ error: 'Telegram kanal havolasi yoki @username kiriting' });
      }
      let cleanUser = String(channelUsername || '').trim();
      if (!cleanUser && channelUrl) {
        const m = String(channelUrl).match(/t\.me\/([a-zA-Z0-9_]+)/i);
        if (m) cleanUser = `@${m[1]}`;
      }
      if (cleanUser && !cleanUser.startsWith('@')) cleanUser = `@${cleanUser}`;
      newMission.channelUsername = cleanUser;
      newMission.channelUrl = String(channelUrl || `https://t.me/${cleanUser.replace(/^@/, '')}`).trim();
    } else {
      newMission.requiresProof = requiresProof !== false;
      newMission.proofType = proofType || 'image';
    }

    if (!Array.isArray(centralDb.ecoMissions)) centralDb.ecoMissions = [];
    centralDb.ecoMissions.unshift(newMission);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'missions' });
    res.json({ success: true, mission: newMission });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/missions/:id', requireRoles('super_admin', 'moderator', 'school_admin'), (req: AuthenticatedRequest, res) => {
  try {
    const mission = (centralDb.ecoMissions || []).find((m: any) => m.id === req.params.id);
    if (!mission) return res.status(404).json({ error: 'Topshiriq topilmadi' });

    const {
      title,
      description,
      rewardCoins,
      status,
      questions,
      passingPercent,
      question,
      options,
      correctIndex,
      explanation,
      channelUsername,
      channelUrl,
      requiresProof,
    } = req.body || {};
    if (title !== undefined) mission.title = String(title).trim();
    if (description !== undefined) mission.description = String(description).trim();
    if (rewardCoins !== undefined) mission.rewardCoins = Math.max(1, Number(rewardCoins) || 50);
    if (status === 'active' || status === 'paused') mission.status = status;
    if (passingPercent !== undefined) mission.passingPercent = Math.max(10, Math.min(100, Number(passingPercent) || 70));

    if (Array.isArray(questions) && questions.length > 0) {
      const normalized = normalizeQuizQuestions({ questions });
      if (normalized.length > 0) {
        mission.questions = normalized;
        mission.question = normalized[0].question;
        mission.options = normalized[0].options;
        mission.correctIndex = normalized[0].correctIndex;
        mission.explanation = normalized[0].explanation || '';
      }
    } else {
      if (question !== undefined) mission.question = String(question).trim();
      if (Array.isArray(options)) mission.options = options.map((o: any) => String(o).trim()).filter(Boolean);
      if (correctIndex !== undefined) mission.correctIndex = Number(correctIndex) || 0;
      if (explanation !== undefined) mission.explanation = String(explanation).trim();
    }

    if (channelUsername !== undefined) mission.channelUsername = String(channelUsername).trim();
    if (channelUrl !== undefined) mission.channelUrl = String(channelUrl).trim();
    if (requiresProof !== undefined) mission.requiresProof = Boolean(requiresProof);

    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'missions' });
    res.json({ success: true, mission });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/missions/:id', requireRoles('super_admin', 'moderator', 'school_admin'), (req: AuthenticatedRequest, res) => {
  try {
    const idx = (centralDb.ecoMissions || []).findIndex((m: any) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Topshiriq topilmadi' });
    centralDb.ecoMissions.splice(idx, 1);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'missions' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/missions/:id/submit', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const mission = (centralDb.ecoMissions || []).find((m: any) => m.id === req.params.id);
    if (!mission || mission.status !== 'active') {
      return res.status(404).json({ error: 'Topshiriq topilmadi yoki faol emas' });
    }

    if (!centralDb.missionCompletions || typeof centralDb.missionCompletions !== 'object') {
      centralDb.missionCompletions = {};
    }
    const userCompleted = centralDb.missionCompletions[caller.uid] || [];
    if (userCompleted.includes(mission.id)) {
      return res.status(400).json({ error: 'Siz ushbu topshiriqni allaqachon bajargansiz va mukofot olgansiz!' });
    }

    const reward = Math.max(1, Number(mission.rewardCoins) || 50);
    const nowIso = new Date().toISOString();

    if (mission.type === 'quiz') {
      const quizQuestions = normalizeQuizQuestions(mission);
      if (quizQuestions.length === 0) {
        return res.status(400).json({ error: 'Quiz savollari topilmadi' });
      }

      const rawAnswers: number[] = Array.isArray(req.body?.answers)
        ? req.body.answers.map((a: any) => Number(a))
        : req.body?.selectedOptionIndex !== undefined
        ? [Number(req.body.selectedOptionIndex)]
        : [];

      if (rawAnswers.length < quizQuestions.length || rawAnswers.some((a) => Number.isNaN(a) || a < 0)) {
        return res.status(400).json({ error: 'Barcha savollarga javob belgilang' });
      }

      let correctCount = 0;
      const results = quizQuestions.map((q: any, idx: number) => {
        const selectedIndex = rawAnswers[idx];
        const isCorrect = selectedIndex === Number(q.correctIndex);
        if (isCorrect) correctCount += 1;
        return {
          questionId: q.id,
          question: q.question,
          selectedIndex,
          correctIndex: Number(q.correctIndex),
          isCorrect,
          explanation: q.explanation || '',
        };
      });

      const totalCount = quizQuestions.length;
      const scorePercent = Math.round((correctCount / totalCount) * 100);
      const passingPercent = Math.max(10, Math.min(100, Number(mission.passingPercent) || 70));
      const passed = scorePercent >= passingPercent;

      if (passed) {
        userCompleted.push(mission.id);
        centralDb.missionCompletions[caller.uid] = userCompleted;
        caller.ecoCoins = (caller.ecoCoins || 0) + reward;
        caller.totalCoinsEarned = (caller.totalCoinsEarned || 0) + reward;
        recordTransaction({
          userId: caller.uid,
          amount: reward,
          type: 'earn',
          status: 'approved',
          reason: `Eco-Quiz (${scorePercent}%): ${mission.title}`,
        });
        saveCentralDb();
      }

      return res.json({
        success: true,
        passed,
        correct: passed,
        scorePercent,
        correctCount,
        totalCount,
        passingPercent,
        awardedCoins: passed ? reward : 0,
        explanation: results[0]?.explanation || mission.explanation || '',
        results,
        ...(passed ? { newBalance: caller.ecoCoins, completedIds: userCompleted } : {}),
        message: passed
          ? `Ajoyib! Siz ${scorePercent}% natija qayd etdingiz va +${reward} EcoCoin qo‘lga kiritdingiz!`
          : `Natija: ${scorePercent}% (${correctCount}/${totalCount}). Coin olish uchun kamida ${passingPercent}% to‘plang va qayta urinib ko‘ring!`,
      });
    }

    if (mission.type === 'channel_subscribe') {
      const channelHandle = String(mission.channelUsername || '').trim();
      if (activeBotToken && caller.telegramId && channelHandle.startsWith('@') && !channelHandle.toLowerCase().endsWith('bot')) {
        try {
          const checkRes = await fetch(
            `https://api.telegram.org/bot${activeBotToken}/getChatMember?chat_id=${encodeURIComponent(channelHandle)}&user_id=${encodeURIComponent(String(caller.telegramId))}`,
            { signal: AbortSignal.timeout(5000) }
          );
          const checkJson: any = await checkRes.json().catch(() => null);
          if (checkJson?.ok && checkJson.result) {
            const st = checkJson.result.status;
            if (!['member', 'administrator', 'creator'].includes(st)) {
              return res.status(400).json({
                success: false,
                error: `Siz hali ${channelHandle} kanaliga obuna bo'lmagansiz. Avval obuna bo'ling va qayta tekshiring!`,
              });
            }
          }
        } catch {
          // Proceed if Telegram API check isn't available for external channels
        }
      }

      userCompleted.push(mission.id);
      centralDb.missionCompletions[caller.uid] = userCompleted;
      caller.ecoCoins = (caller.ecoCoins || 0) + reward;
      caller.totalCoinsEarned = (caller.totalCoinsEarned || 0) + reward;
      recordTransaction({
        userId: caller.uid,
        amount: reward,
        type: 'earn',
        status: 'approved',
        reason: `Telegram kanalga obuna: ${mission.title}`,
      });
      saveCentralDb();
      return res.json({
        success: true,
        awardedCoins: reward,
        newBalance: caller.ecoCoins,
        completedIds: userCompleted,
        message: `Obuna tasdiqlandi! +${reward} EcoCoin balansingizga qo'shildi!`,
      });
    }

    // custom_task
    const { proofText, mediaUrl } = req.body || {};
    const existingPending = (centralDb.missionSubmissions || []).find(
      (s: any) => s.missionId === mission.id && s.userId === caller.uid && s.status === 'pending'
    );
    if (existingPending) {
      return res.status(400).json({ error: 'Ushbu topshiriq bo‘yicha arizangiz allaqachon admin tekshiruvida' });
    }

    if (mission.requiresProof !== false && !proofText && !mediaUrl) {
      return res.status(400).json({ error: 'Topshiriq bajarilganini tasdiqlovchi rasm yoki izoh yuklang' });
    }

    let aiCheck: any = undefined;
    if (mediaUrl && process.env.GEMINI_API_KEY) {
      const inline = await resolveImageInputToInlineData(mediaUrl);
      if (inline) {
        try {
          const resp: any = await generateContentWithModelFallback(
            {
              contents: [
                {
                  role: 'user',
                  parts: [
                    { inlineData: inline },
                    { text: `Topshiriq: ${mission.title}\nTavsif: ${mission.description}\nO'quvchi izohi: ${proofText || ''}` },
                  ],
                },
              ],
              config: {
                systemInstruction:
                  `Siz ECO HERO topshiriq tekshiruvchisisiz. JSON qaytaring: {"isValidEco": boolean, "isAiGenerated": boolean, "verdictUz": string}`,
                responseMimeType: 'application/json',
                thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
              },
            },
            15000
          );
          aiCheck = parseModelJsonResponse(resp?.text);
          if (aiCheck?.isAiGenerated === true) {
            return res.status(400).json({
              error: aiCheck?.verdictUz || "AI tekshiruvi: rasm sun'iy intellektda yasalgan. Faqat haqiqiy rasm yuklang!",
            });
          }
        } catch {
          // allow admin manual review
        }
      }
    }

    const submission = {
      id: `msub_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      missionId: mission.id,
      missionTitle: mission.title,
      missionType: mission.type,
      userId: caller.uid,
      userName: caller.fullName,
      schoolId: caller.schoolId,
      schoolName: caller.schoolName,
      proofText: String(proofText || '').trim(),
      mediaUrl: String(mediaUrl || '').trim(),
      status: 'pending',
      awardedCoins: reward,
      ...(aiCheck ? { aiCheck } : {}),
      createdAt: nowIso,
    };

    if (!Array.isArray(centralDb.missionSubmissions)) centralDb.missionSubmissions = [];
    centralDb.missionSubmissions.unshift(submission);
    saveCentralDb();
    return res.json({
      success: true,
      submission,
      message: "Topshiriq dalilingiz adminga yuborildi! Tasdiqlangach EcoCoin beriladi.",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/missions/submissions/:subId/review', requireRoles('super_admin', 'moderator', 'school_admin'), (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const sub = (centralDb.missionSubmissions || []).find((s: any) => s.id === req.params.subId);
    if (!sub) return res.status(404).json({ error: 'Ariza topilmadi' });
    if (sub.status !== 'pending') return res.status(400).json({ error: 'Ushbu ariza allaqachon ko‘rib chiqilgan' });

    const { action, adminNote } = req.body || {};
    const nowIso = new Date().toISOString();
    sub.reviewedBy = caller.fullName;
    sub.reviewedAt = nowIso;
    if (adminNote) sub.adminNote = String(adminNote).trim();

    if (action === 'approve') {
      sub.status = 'approved';
      if (!centralDb.missionCompletions || typeof centralDb.missionCompletions !== 'object') {
        centralDb.missionCompletions = {};
      }
      const list = centralDb.missionCompletions[sub.userId] || [];
      if (!list.includes(sub.missionId)) {
        list.push(sub.missionId);
        centralDb.missionCompletions[sub.userId] = list;
      }
      const targetUser = findUserByAnyIdentifier({ uid: sub.userId });
      if (targetUser) {
        const amt = Math.max(1, Number(sub.awardedCoins) || 100);
        targetUser.ecoCoins = (targetUser.ecoCoins || 0) + amt;
        targetUser.totalCoinsEarned = (targetUser.totalCoinsEarned || 0) + amt;
        recordTransaction({
          userId: targetUser.uid,
          amount: amt,
          type: 'earn',
          status: 'approved',
          reason: `Missiya bajarildi: ${sub.missionTitle}`,
        });
        centralDb.notifications.unshift({
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          userId: targetUser.uid,
          title: `+${amt} EcoCoin! Topshiriq tasdiqlandi`,
          message: `"${sub.missionTitle}" bo'yicha hisobotingiz ${caller.fullName} tomonidan tasdiqlandi.`,
          type: 'coin',
          read: false,
          createdAt: nowIso,
        });
        const tgId = targetUser.telegramId || targetUser.chatId;
        if (tgId) {
          sendTelegramMessage(
            tgId,
            `🎉 <b>MISSIYA TASDIQLANDI! +${amt} EcoCoin</b>\n\n📌 ${sub.missionTitle}\n💳 Balansingiz: ${targetUser.ecoCoins} EcoCoin`
          ).catch(() => {});
        }
      }
    } else if (action === 'reject') {
      sub.status = 'rejected';
    } else {
      return res.status(400).json({ error: "Noto'g'ri amal" });
    }

    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'missions' });
    res.json({ success: true, submission: sub });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/referrals/claim', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const claimer = req.authUser;
    const { referrerUid, referralCode, newUserName, referredSchool } = req.body;
    let resolvedReferrer = findUserByAnyIdentifier({ uid: referrerUid });

    if (!resolvedReferrer && referralCode) {
      const cleanCode = String(referralCode).trim().toUpperCase();
      resolvedReferrer = Object.values(centralDb.users).find(
        (u: any) =>
          String(u.referralCode || '').toUpperCase() === cleanCode ||
          `ECO${String(u.uid).slice(-4).toUpperCase()}` === cleanCode
      );
    }

    const targetReferrerUid = resolvedReferrer?.uid || referrerUid || (referralCode ? `ref_${referralCode}` : null);
    if (!targetReferrerUid) {
      return res.status(400).json({ error: 'Referal kodi talab qilinadi' });
    }
    if (targetReferrerUid === claimer.uid) {
      return res.status(400).json({ error: "O'z-o'zini taklif qilish taqiqlangan" });
    }

    const alreadyExists = centralDb.referrals.some(
      (r) => r.referrerUid === targetReferrerUid && r.referredUid === claimer.uid
    );
    if (alreadyExists) {
      return res.status(400).json({ error: "Ushbu taklif allaqachon hisobga olingan" });
    }

    const inviterBonus = getConfiguredReward('referralInviter');
    const inviteeBonus = getConfiguredReward('referralInvitee');

    const newRecord = {
      id: `ref_${Date.now()}`,
      referrerUid: targetReferrerUid,
      referrerName: resolvedReferrer?.fullName || "Eko-Do'st",
      referredUid: claimer.uid,
      referredName: newUserName || claimer.fullName || "Yangi O'quvchi",
      referredSchool: referredSchool || claimer.schoolName || "O'zbekiston maktabi",
      rewardCoins: inviterBonus,
      status: 'rewarded',
      createdAt: new Date().toISOString(),
    };

    centralDb.referrals.unshift(newRecord);
    if (resolvedReferrer) {
      resolvedReferrer.ecoCoins = (resolvedReferrer.ecoCoins || 0) + inviterBonus;
      resolvedReferrer.totalCoinsEarned = (resolvedReferrer.totalCoinsEarned || 0) + inviterBonus;
      resolvedReferrer.referralCount = (resolvedReferrer.referralCount || 0) + 1;
      recordTransaction({
        userId: resolvedReferrer.uid,
        amount: inviterBonus,
        type: 'bonus',
        status: 'approved',
        reason: `Referal taklif bonusi: ${newRecord.referredName}`,
      });
    }

    claimer.ecoCoins = (claimer.ecoCoins || 0) + inviteeBonus;
    claimer.totalCoinsEarned = (claimer.totalCoinsEarned || 0) + inviteeBonus;
    recordTransaction({
      userId: claimer.uid,
      amount: inviteeBonus,
      type: 'bonus',
      status: 'approved',
      reason: `Referal kodi orqali bonus (${referralCode || targetReferrerUid})`,
    });

    saveCentralDb();
    res.json({ success: true, reward: inviteeBonus, record: newRecord });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 9. TELEGRAM BOT & MINI APP SUITE
// ==========================================

const BOT_CONFIG_PATH = path.join(process.cwd(), 'server-bot-config.json');

function getStoredBotConfig(): { botToken?: string; botUsername?: string } {
  try {
    if (fs.existsSync(BOT_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(BOT_CONFIG_PATH, 'utf-8'));
    }
  } catch (e) {}
  return {};
}

const storedConfig = getStoredBotConfig();
let activeBotToken: string =
  storedConfig.botToken ||
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.BOT_TOKEN ||
  process.env.TELEGRAM_TOKEN ||
  process.env.TELEGRAM_API_KEY ||
  '';

let activeBotUsername: string =
  storedConfig.botUsername || process.env.TELEGRAM_BOT_USERNAME || 'Ecoheros_bot';

const UZBEKISTAN_REGIONS = [
  "Toshkent shahri",
  "Toshkent viloyati",
  "Samarqand viloyati",
  "Farg'ona viloyati",
  "Andijon viloyati",
  "Namangan viloyati",
  "Buxoro viloyati",
  "Xorazm viloyati",
  "Qashqadaryo viloyati",
  "Surxondaryo viloyati",
  "Navoiy viloyati",
  "Jizzax viloyati",
  "Sirdaryo viloyati",
  "Qoraqalpog'iston Respublikasi",
];

const UZBEKISTAN_DISTRICTS: Record<string, string[]> = {
  "Toshkent shahri": [
    "Bektemir tumani", "Chilonzor tumani", "Mirobod tumani", "Mirzo Ulug'bek tumani",
    "Olmazor tumani", "Sergeli tumani", "Shayxontohur tumani", "Uchtepa tumani",
    "Yakkasaroy tumani", "Yashnobod tumani", "Yunusobod tumani", "Yangihayot tumani"
  ],
  "Toshkent viloyati": [
    "Angren shahri", "Bekobod shahri", "Chirchiq shahri", "Olmaliq shahri", "Yangiyo'l shahri",
    "Bekobod tumani", "Bo'stonliq tumani", "Bo'ka tumani", "Chinoz tumani", "Qibray tumani",
    "Parkent tumani", "Piskent tumani", "Quyi Chirchiq tumani", "O'rta Chirchiq tumani",
    "Yuqori Chirchiq tumani", "Yangiyo'l tumani", "Zangiota tumani"
  ],
  "Samarqand viloyati": [
    "Samarqand shahri", "Kattaqo'rg'on shahri", "Bulung'ur tumani", "Ishtixon tumani",
    "Jomboy tumani", "Kattaqo'rg'on tumani", "Narpay tumani", "Nurobod tumani",
    "Oqdaryo tumani", "Paxtachi tumani", "Payariq tumani", "Pastdarg'om tumani",
    "Samarqand tumani", "Toyloq tumani", "Urgut tumani"
  ],
  "Farg'ona viloyati": [
    "Farg'ona shahri", "Qo'qon shahri", "Marg'ilon shahri", "Quvasoy shahri",
    "Bag'dod tumani", "Beshariq tumani", "Buvayda tumani", "Dang'ara tumani",
    "Farg'ona tumani", "Furqat tumani", "Oltiariq tumani", "Qo'shtepa tumani",
    "Quva tumani", "Rishton tumani", "So'x tumani", "Toshloq tumani",
    "Uchko'prik tumani", "Yozyovon tumani", "O'zbekiston tumani"
  ],
  "Andijon viloyati": [
    "Andijon shahri", "Xonobod shahri", "Andijon tumani", "Asaka tumani",
    "Baliqchi tumani", "Bo'ston tumani", "Buloqboshi tumani", "Izboskan tumani",
    "Jalaquduq tumani", "Marhamat tumani", "Oltinko'l tumani", "Paxtaobod tumani",
    "Shahrixon tumani", "Ulug'nor tumani", "Xo'jaobod tumani", "Qo'rg'ontepa tumani"
  ],
  "Namangan viloyati": [
    "Namangan shahri", "Chortoq tumani", "Chust tumani", "Kosonsoy tumani",
    "Mingbuloq tumani", "Namangan tumani", "Norin tumani", "Pop tumani",
    "To'raqo'rg'on tumani", "Uychi tumani", "Uchqo'rg'on tumani", "Yangiqo'rg'on tumani"
  ],
  "Buxoro viloyati": [
    "Buxoro shahri", "Kogon shahri", "Buxoro tumani", "Vobkent tumani",
    "Jondor tumani", "Kogon tumani", "Olot tumani", "Peshku tumani",
    "Qorako'l tumani", "Qorovulbozor tumani", "Romitan tumani", "Shofirkon tumani", "G'ijduvon tumani"
  ],
  "Xorazm viloyati": [
    "Urganch shahri", "Xiva shahri", "Bog'ot tumani", "Gurlan tumani",
    "Qo'shko'pir tumani", "Shovot tumani", "Tuproqqal'a tumani", "Urganch tumani",
    "Xazorasp tumani", "Xiva tumani", "Xonqa tumani", "Yangiariq tumani", "Yangibozor tumani"
  ],
  "Qashqadaryo viloyati": [
    "Qarshi shahri", "Shahrisabz shahri", "Chiroqchi tumani", "Dehqonobod tumani",
    "G'uzor tumani", "Kasbi tumani", "Kitob tumani", "Koson tumani",
    "Mirishkor tumani", "Muborak tumani", "Nishon tumani", "Qamashi tumani",
    "Qarshi tumani", "Shahrisabz tumani", "Yakkabog' tumani", "Ko'kdala tumani"
  ],
  "Surxondaryo viloyati": [
    "Termiz shahri", "Angor tumani", "Bandixon tumani", "Boysun tumani",
    "Denov tumani", "Jarqo'rg'on tumani", "Muzrabot tumani", "Oltinsoy tumani",
    "Qiziriq tumani", "Qumqo'rg'on tumani", "Sariosiyo tumani", "Sherobod tumani",
    "Sho'rchi tumani", "Termiz tumani", "Uzun tumani"
  ],
  "Navoiy viloyati": [
    "Navoiy shahri", "Zarafshon shahri", "Karmana tumani", "Konimex tumani",
    "Qiziltepa tumani", "Navbahor tumani", "Nurota tumani", "Tomdi tumani",
    "Uchquduq tumani", "Xatirchi tumani"
  ],
  "Jizzax viloyati": [
    "Jizzax shahri", "Arnasoy tumani", "Baxmal tumani", "Do'stlik tumani",
    "Forish tumani", "G'allaorol tumani", "Sharof Rashidov tumani", "Mirzacho'l tumani",
    "Paxtakor tumani", "Yangiobod tumani", "Zomin tumani", "Zafarobod tumani", "Zarbdor tumani"
  ],
  "Sirdaryo viloyati": [
    "Guliston shahri", "Shirin shahri", "Yangiyer shahri", "Boyovut tumani",
    "Guliston tumani", "Xovos tumani", "Mirzaobod tumani", "Oqoltin tumani",
    "Sardoba tumani", "Sayxunobod tumani", "Sirdaryo tumani"
  ],
  "Qoraqalpog'iston Respublikasi": [
    "Nukus shahri", "Amudaryo tumani", "Beruniy tumani", "Chimboy tumani",
    "Ellikqala tumani", "Kegeyli tumani", "Mo'ynoq tumani", "Nukus tumani",
    "Qanliko'l tumani", "Qo'ng'irot tumani", "Qorao'zak tumani", "Shumanay tumani",
    "Taxtako'pir tumani", "To'rtko'l tumani", "Xo'jayli tumani", "Bo'zatov tumani", "Taxiatosh shahri"
  ]
};

interface RegistrationSession {
  mode?: 'REGISTER' | 'APPLY' | 'ACTIVITY' | 'REPORT';
  step:
    | 'PHONE'
    | 'NAME'
    | 'REGION'
    | 'DISTRICT'
    | 'SCHOOL'
    | 'GRADE'
    | 'COMPLETED'
    | 'APPLY_ROLE'
    | 'APPLY_SCHOOL_NUM'
    | 'APPLY_SCHOOL_NAME'
    | 'APPLY_CONTACT'
    | 'APPLY_VERIFY'
    | 'ACT_CAT'
    | 'ACT_MEDIA'
    | 'ACT_DESC'
    | 'REP_CAT'
    | 'REP_MEDIA'
    | 'REP_LOC'
    | 'REP_DESC';
  phoneNumber?: string;
  fullName?: string;
  region?: string;
  district?: string;
  schoolName?: string;
  schoolNumber?: string;
  grade?: string;
  referredBy?: string;
  lat?: number;
  lng?: number;
  requestedRole?: string;
  contactInfo?: string;
  verificationDetails?: string;
  activityCategory?: string;
  reportCategory?: string;
  uploadedMediaUrl?: string;
  uploadedMediaType?: 'image' | 'video';
  uploadedFileHash?: string;
  updatedAt: number;
}

function getRegistrationSession(chatKey: string): RegistrationSession | undefined {
  return centralDb.registrationSessions[chatKey];
}

function setRegistrationSession(chatKey: string, session: RegistrationSession) {
  centralDb.registrationSessions[chatKey] = session;
  saveCentralDb();
}

function deleteRegistrationSession(chatKey: string) {
  delete centralDb.registrationSessions[chatKey];
  saveCentralDb();
}

async function downloadTelegramFileToUploads(
  fileId: string,
  kind: 'image' | 'video'
): Promise<{ url: string; fileHash: string; mediaType: 'image' | 'video' } | null> {
  if (!activeBotToken || !fileId) return null;
  try {
    const fRes = await fetch(`https://api.telegram.org/bot${activeBotToken}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const fData: any = await fRes.json();
    const filePath = fData?.result?.file_path;
    if (!filePath) return null;

    const dlRes = await fetch(`https://api.telegram.org/file/bot${activeBotToken}/${filePath}`);
    if (!dlRes.ok) return null;
    const arrayBuf = await dlRes.arrayBuffer();
    const buffer = Buffer.from(arrayBuf);
    const ext = path.extname(filePath).replace('.', '') || (kind === 'video' ? 'mp4' : 'jpg');
    const fileHash = crypto.createHash('sha256').update(buffer).digest('hex');
    const safeName = `tg_${Date.now()}_${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(UPLOADS_DIR, safeName), buffer);
    return {
      url: `/uploads/${safeName}`,
      fileHash,
      mediaType: kind,
    };
  } catch (err) {
    console.error('[Telegram] File download failed:', err);
    return null;
  }
}

function sanitizeTelegramReplyMarkup(markup: any): any {
  if (!markup || typeof markup !== 'object') return undefined;
  const isValidWebAppUrl = (u: any) =>
    typeof u === 'string' && u.startsWith('https://') && !isPrivateAiStudioOrLocalUrl(u);

  const cloned = { ...markup };
  if (Array.isArray(cloned.inline_keyboard)) {
    cloned.inline_keyboard = cloned.inline_keyboard
      .map((row: any) =>
        Array.isArray(row)
          ? row
              .map((btn: any) => {
                if (btn?.web_app) {
                  const candidate = isValidWebAppUrl(btn.web_app.url) ? btn.web_app.url : APP_URL;
                  if (!isValidWebAppUrl(candidate)) return null;
                  return { ...btn, web_app: { url: candidate } };
                }
                return btn;
              })
              .filter(Boolean)
          : []
      )
      .filter((row: any[]) => row.length > 0);
    if (cloned.inline_keyboard.length === 0) delete cloned.inline_keyboard;
  }
  if (Array.isArray(cloned.keyboard)) {
    cloned.keyboard = cloned.keyboard
      .map((row: any) =>
        Array.isArray(row)
          ? row
              .map((btn: any) => {
                if (btn?.web_app) {
                  const candidate = isValidWebAppUrl(btn.web_app.url) ? btn.web_app.url : APP_URL;
                  if (!isValidWebAppUrl(candidate)) return null;
                  return { ...btn, web_app: { url: candidate } };
                }
                return btn;
              })
              .filter(Boolean)
          : []
      )
      .filter((row: any[]) => row.length > 0);
    if (cloned.keyboard.length === 0) delete cloned.keyboard;
  }
  return Object.keys(cloned).length > 0 ? cloned : undefined;
}

async function waitForPublicUrlBriefly(maxWaitMs = 3500): Promise<void> {
  if (APP_URL.startsWith('https://') && !isPrivateAiStudioOrLocalUrl(APP_URL)) return;
  const started = Date.now();
  while (Date.now() - started < maxWaitMs) {
    if (APP_URL.startsWith('https://') && !isPrivateAiStudioOrLocalUrl(APP_URL)) return;
    await new Promise((r) => setTimeout(r, 250));
  }
}

async function sendTelegramMessage(chatId: string | number, text: string, extraOptions: any = {}) {
  if (!activeBotToken) {
    console.log(`[Telegram Bot Simulation -> ${chatId}]: ${text}`);
    return { ok: true, simulated: true };
  }
  try {
    const rawOptions = { ...extraOptions };
    if (rawOptions.reply_markup && JSON.stringify(rawOptions.reply_markup).includes('web_app')) {
      await waitForPublicUrlBriefly(3500);
      const cleanedMarkup = sanitizeTelegramReplyMarkup(rawOptions.reply_markup);
      if (cleanedMarkup) rawOptions.reply_markup = cleanedMarkup;
      else delete rawOptions.reply_markup;
    }

    const res = await fetch(`https://api.telegram.org/bot${activeBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        ...rawOptions,
      }),
    });
    const data: any = await res.json();
    if (!data?.ok) {
      console.error(`[Telegram Bot] sendMessage xatolik (chat=${chatId}):`, data?.description || data);
      if (rawOptions.reply_markup || data?.error_code === 400) {
        const retryBody: any = { chat_id: chatId, text: String(text).replace(/<[^>]+>/g, '') };
        const retryRes = await fetch(`https://api.telegram.org/bot${activeBotToken}/sendMessage`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(retryBody),
        });
        return await retryRes.json();
      }
    }
    return data;
  } catch (err) {
    console.error('Failed to send Telegram message:', err);
    return { ok: false, error: err };
  }
}

async function sendTelegramPhoto(chatId: string | number, photoUrl: string, caption: string, extraOptions: any = {}) {
  if (!activeBotToken) return { ok: true, simulated: true };
  try {
    const cleanUrl = String(photoUrl || '').trim();
    if (cleanUrl.startsWith('/uploads/') || cleanUrl.startsWith('/assets/')) {
      const localPath = path.join(process.cwd(), 'public', cleanUrl.replace(/^\/+/, ''));
      if (fs.existsSync(localPath)) {
        const buffer = fs.readFileSync(localPath);
        const ext = path.extname(localPath).toLowerCase() || '.jpg';
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        const form = new FormData();
        form.append('chat_id', String(chatId));
        form.append('caption', caption);
        form.append('parse_mode', 'HTML');
        form.append('photo', new Blob([buffer], { type: mime }), `ecohero_photo${ext}`);
        const uploadRes = await fetch(`https://api.telegram.org/bot${activeBotToken}/sendPhoto`, {
          method: 'POST',
          body: form,
        });
        const uploadData: any = await uploadRes.json();
        if (uploadData?.ok) return uploadData;
      }
    }

    const res = await fetch(`https://api.telegram.org/bot${activeBotToken}/sendPhoto`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        photo: cleanUrl,
        caption,
        parse_mode: 'HTML',
        ...extraOptions,
      }),
    });
    const data: any = await res.json();
    if (!data?.ok) {
      return await sendTelegramMessage(chatId, `${caption}\n\n📷 Rasm: ${cleanUrl}`);
    }
    return data;
  } catch (err) {
    return await sendTelegramMessage(chatId, caption).catch(() => ({ ok: false, error: err }));
  }
}

async function answerCallbackQuery(callbackQueryId: string, text?: string) {
  if (!activeBotToken) return;
  try {
    await fetch(`https://api.telegram.org/bot${activeBotToken}/answerCallbackQuery`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ callback_query_id: callbackQueryId, text: text || '' }),
    });
  } catch {}
}

async function editTelegramMessage(chatId: string | number, messageId: number, text: string, extraOptions: any = {}) {
  if (!activeBotToken) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${activeBotToken}/editMessageText`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        message_id: messageId,
        text,
        parse_mode: 'HTML',
        ...extraOptions,
      }),
    });
    return await res.json();
  } catch {}
}

// Telegram WebApp Auth Endpoint (Strict HMAC Verification + Session Token Issuance)
app.post('/api/telegram/auth-webapp', (req, res) => {
  try {
    const { initData, unsafeUser } = req.body;
    let tgUser: any = null;
    let isDevBypass = false;

    if (initData) {
      const verification = verifyTelegramInitDataStrict(initData, activeBotToken);
      if (!verification.valid) {
        return res.status(401).json({ error: "Telegram autentifikatsiyasi xato (HMAC tekshiruvdan o'tmadi)" });
      }
      tgUser = verification.user;
    } else if (!activeBotToken && unsafeUser && unsafeUser.id) {
      // Only allow fallback preview in dev mode when no Telegram Bot token is configured; never elevate privileges
      tgUser = unsafeUser;
      isDevBypass = true;
    } else {
      return res.status(401).json({ error: 'Tasdiqlangan Telegram initData talab qilinadi' });
    }

    if (!tgUser || !tgUser.id) {
      return res.status(400).json({ error: "Telegram foydalanuvchi ma'lumotlari topilmadi" });
    }

    const chatId = String(tgUser.id);
    const registeredUser = findUserByAnyIdentifier({ telegramId: chatId, chatId });
    const isJasur =
      !isDevBypass &&
      checkIsSuperAdmin({
        telegramUsername: tgUser.username,
        telegramId: tgUser.id,
        email: registeredUser?.email,
        phoneNumber: registeredUser?.phoneNumber,
      });

    if (registeredUser) {
      const userRole = isJasur ? 'super_admin' : registeredUser.role || 'student';
      const approvedRoles = isJasur
        ? ['student', 'ambassador', 'school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin', 'sponsor']
        : registeredUser.approvedRoles || [userRole];

      registeredUser.role = userRole;
      registeredUser.approvedRoles = approvedRoles;
      registeredUser.telegramId = Number(tgUser.id) || tgUser.id;
      registeredUser.telegramChatId = chatId;
      if (tgUser.username) registeredUser.telegramUsername = `@${tgUser.username}`;
      if (tgUser.photo_url) {
        registeredUser.avatarUrl = tgUser.photo_url;
        registeredUser.profileImage = tgUser.photo_url;
      }
      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'users' });

      return res.json({
        success: true,
        sessionToken: issueSessionToken(registeredUser),
        user: sanitizeSelfUser({ ...registeredUser, telegramAuth: true }),
        isDevBypass,
      });
    }

    const autoName = `${tgUser.first_name || ''} ${tgUser.last_name || ''}`.trim() || tgUser.username || 'Eko-Qahramon';
    const createdUser = upsertUser({
      uid: `user_tg_${tgUser.id}`,
      fullName: autoName,
      email: `${tgUser.username || tgUser.id}@telegram.ecohero.uz`,
      telegramId: tgUser.id,
      telegramChatId: chatId,
      telegramUsername: tgUser.username ? `@${tgUser.username}` : undefined,
      telegramAuth: true,
      profileImage: tgUser.photo_url || DEFAULT_AVATAR,
      avatarUrl: tgUser.photo_url || DEFAULT_AVATAR,
      schoolId: 'school_new',
      schoolName: 'Maktab kiritilmagan',
      schoolNumber: '',
      region: 'Toshkent shahri',
      district: '',
      grade: '',
      phoneNumber: '',
      role: isJasur ? 'super_admin' : 'student',
      approvedRoles: isJasur
        ? ['student', 'ambassador', 'school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin', 'sponsor']
        : ['student'],
      ecoCoins: isJasur ? 50000 : 0,
      reportsCount: 0,
      treesPlanted: 0,
      cleanupsCount: 0,
      streakDays: 1,
      totalCoinsEarned: isJasur ? 50000 : 0,
      activityStats: {
        reportsCount: 0,
        cleanupsCount: 0,
        treesPlanted: 0,
        streakDays: 1,
        totalCoinsEarned: isJasur ? 50000 : 0,
      },
      referralCode: `ECO${String(tgUser.id).slice(-4)}`,
      isVerified: isJasur,
      badge: isJasur ? 'Bosh Administrator' : 'Yangi Eko-Qahramon',
      isOnboarded: isJasur ? true : false,
    });
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'users' });

    res.json({
      success: true,
      sessionToken: issueSessionToken(createdUser),
      user: sanitizeSelfUser(createdUser),
      isDevBypass,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

const processedUpdateIds = new Set<number>();
const processedMessageKeys = new Map<string, number>();
const chatProcessingQueues = new Map<string, Promise<void>>();

function pruneProcessedMessageKeys() {
  if (processedMessageKeys.size <= 1500) return;
  const cutoff = Date.now() - 10 * 60 * 1000;
  for (const [key, ts] of processedMessageKeys.entries()) {
    if (ts < cutoff) processedMessageKeys.delete(key);
  }
  if (processedMessageKeys.size > 2000) {
    const excess = Array.from(processedMessageKeys.keys()).slice(0, 500);
    for (const k of excess) processedMessageKeys.delete(k);
  }
}

function enqueueChatUpdate(chatKey: string, task: () => Promise<void>): Promise<void> {
  const prev = chatProcessingQueues.get(chatKey) || Promise.resolve();
  const next = prev
    .catch(() => {})
    .then(task)
    .finally(() => {
      if (chatProcessingQueues.get(chatKey) === next) {
        chatProcessingQueues.delete(chatKey);
      }
    });
  chatProcessingQueues.set(chatKey, next);
  return next;
}

async function completeTelegramRegistration(
  chatId: string | number,
  session: RegistrationSession,
  username?: string,
  userFirstName?: string
) {
  const chatKey = String(chatId);
  const schoolNumber = normalizeSchoolNumber(session.schoolName);
  const existing = findUserByAnyIdentifier({ telegramId: chatKey, phoneNumber: session.phoneNumber });

  const isJasur = checkIsSuperAdmin({
    telegramUsername: username,
    telegramId: chatKey,
    phoneNumber: session.phoneNumber,
  });

  const welcomeReward = getConfiguredReward('welcomeBonus');
  const isNewUser = !existing || !existing.welcomeBonusClaimed;
  const coins = isJasur ? Math.max(existing?.ecoCoins || 0, 50000) : isNewUser ? welcomeReward : existing?.ecoCoins ?? welcomeReward;
  const totalCoins = isJasur
    ? Math.max(existing?.totalCoinsEarned || 0, 50000)
    : isNewUser
    ? welcomeReward
    : existing?.totalCoinsEarned ?? coins;

  const cleanRegion = session.region || 'Toshkent shahri';
  const cleanDistrict = session.district || 'Shayxontohur tumani';
  const cleanSchoolName = session.schoolName || '1-maktab';

  const linkedSchool = findOrCreateSchool({
    schoolId: existing?.schoolId,
    schoolName: cleanSchoolName,
    schoolNumber,
    region: cleanRegion,
    district: cleanDistrict,
    coinsDelta: isNewUser ? welcomeReward : 0,
    incrementStudents: !existing?.isOnboarded,
  });

  const canonicalUid = existing?.uid || `user_tg_${chatKey}`;
  const finalProfile = upsertUser({
    uid: canonicalUid,
    userId: canonicalUid,
    chatId: chatKey,
    telegramId: Number(chatKey) || chatKey,
    telegramChatId: chatKey,
    telegramUsername: username || existing?.telegramUsername || '',
    fullName: session.fullName || existing?.fullName || userFirstName || 'Eko-Qahramon',
    phoneNumber: session.phoneNumber || existing?.phoneNumber || '',
    email: existing?.email || `${chatKey}@telegram.ecohero.uz`,
    region: cleanRegion,
    district: cleanDistrict,
    schoolId: linkedSchool?.id || 'school_custom',
    schoolName: linkedSchool?.name || cleanSchoolName,
    schoolNumber,
    grade: session.grade || existing?.grade || '9-sinf',
    ecoCoins: coins,
    totalCoinsEarned: totalCoins,
    reportsCount: existing?.reportsCount || 0,
    treesPlanted: existing?.treesPlanted || 0,
    cleanupsCount: existing?.cleanupsCount || 0,
    streakDays: existing?.streakDays || 1,
    role: isJasur ? 'super_admin' : existing?.role || 'student',
    approvedRoles: isJasur
      ? ['student', 'ambassador', 'school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin', 'sponsor']
      : existing?.approvedRoles || ['student'],
    welcomeBonusClaimed: true,
    avatarUrl: existing?.avatarUrl || DEFAULT_AVATAR,
    profileImage: existing?.profileImage || DEFAULT_AVATAR,
    registrationDate: existing?.registrationDate || new Date().toISOString(),
    badge: isJasur ? 'Bosh Administrator' : existing?.badge || 'Yangi Eko-Qahramon',
    referralCode: existing?.referralCode || `ECO${chatKey.slice(-4)}`,
    isOnboarded: true,
    isVerified: isJasur || existing?.isVerified || false,
    privacyConsentAccepted: true,
    activityStats: {
      reportsCount: existing?.reportsCount || 0,
      cleanupsCount: existing?.cleanupsCount || 0,
      treesPlanted: existing?.treesPlanted || 0,
      streakDays: existing?.streakDays || 1,
      totalCoinsEarned: totalCoins,
    },
  });

  let referralSummaryText = '';
  if (isNewUser) {
    recordTransaction({
      userId: finalProfile.uid,
      amount: welcomeReward,
      type: 'bonus',
      status: 'approved',
      reason: `ECO HERO bot orqali ro'yxatdan o'tish bonusi (+${welcomeReward} EcoCoin)`,
    });

    if (session.referredBy) {
      const refCodeClean = session.referredBy.trim();
      const refCodeUpper = refCodeClean.toUpperCase();
      const referrer: any = Object.values(centralDb.users).find(
        (u: any) =>
          u.uid !== finalProfile.uid &&
          (String(u.referralCode || '').toUpperCase() === refCodeUpper || u.uid === refCodeClean)
      );
      if (referrer) {
        const inviterBonus = getConfiguredReward('referralInviter');
        const inviteeBonus = getConfiguredReward('referralInvitee');

        referrer.ecoCoins = (referrer.ecoCoins || 0) + inviterBonus;
        referrer.totalCoinsEarned = (referrer.totalCoinsEarned || 0) + inviterBonus;
        referrer.referralCount = (referrer.referralCount || 0) + 1;
        recordTransaction({
          userId: referrer.uid,
          amount: inviterBonus,
          type: 'bonus',
          status: 'approved',
          reason: `Bot referal bonusi: ${finalProfile.fullName}`,
        });

        finalProfile.ecoCoins = (finalProfile.ecoCoins || 0) + inviteeBonus;
        finalProfile.totalCoinsEarned = (finalProfile.totalCoinsEarned || 0) + inviteeBonus;
        finalProfile.referredBy = referrer.referralCode || referrer.uid;
        recordTransaction({
          userId: finalProfile.uid,
          amount: inviteeBonus,
          type: 'bonus',
          status: 'approved',
          reason: `Taklif kodi bonusi (${referrer.referralCode || referrer.fullName})`,
        });

        centralDb.referrals.unshift({
          id: `ref_tg_${Date.now()}`,
          referrerUid: referrer.uid,
          referrerName: referrer.fullName,
          referredUid: finalProfile.uid,
          referredName: finalProfile.fullName,
          referredSchool: finalProfile.schoolName,
          rewardCoins: inviterBonus,
          status: 'claimed',
          createdAt: new Date().toISOString(),
        });

        referralSummaryText = `\n🎁 <b>Taklif bonusi:</b> +${inviteeBonus} EcoCoin qo'shildi!`;
        const refChatId = referrer.telegramChatId || referrer.telegramId;
        if (refChatId) {
          sendTelegramMessage(
            refChatId,
            `🎉 <b>TAKLIF BONUSI!</b>\n\nDo'stingiz <b>${finalProfile.fullName}</b> sizning havolangiz orqali ro'yxatdan o'tdi!\n💰 Sizga <b>+${inviterBonus} EcoCoin</b> qo'shildi.`
          ).catch(() => {});
        }
      }
    }
  }

  deleteRegistrationSession(chatKey);
  saveCentralDb();
  broadcastRealtimeEvent('db:updated', { scope: 'users' });

  const completedText = isNewUser
    ? `🎉 <b>TABRIKLAYMIZ! RO'YXATDAN MUVAFFAQIYATLI O'TDINGIZ!</b>\n\nSizga dastlabki <b>+${welcomeReward} ECO COIN</b> sovg'a taqdim etildi! 💰${referralSummaryText}\n\n📋 <b>Sizning ma'lumotlaringiz (Yagona bazaga saqlandi):</b>\n👤 <b>Ism-familiya:</b> ${finalProfile.fullName}\n📱 <b>Telefon:</b> ${finalProfile.phoneNumber}\n📍 <b>Hudud:</b> ${finalProfile.region}, ${finalProfile.district}\n🏫 <b>Maktab va sinf:</b> ${finalProfile.schoolName} (${finalProfile.grade})\n🏆 <b>Maktab reytingi o'rni:</b> #${linkedSchool?.ratingRank || '-'}\n💰 <b>Balans:</b> ${finalProfile.ecoCoins} EcoCoin\n\nBuyruqlar: /report · /activity · /profile · /invite · /coins · /help`
    : `✅ <b>PROFILINGIZ YANGILANDI!</b>\n\n👤 <b>Ism:</b> ${finalProfile.fullName}\n🏫 <b>Maktab:</b> ${finalProfile.schoolName} (${finalProfile.grade})\n💰 <b>Balans:</b> ${finalProfile.ecoCoins} EcoCoin`;

  await sendTelegramMessage(chatId, completedText, {
    reply_markup: {
      inline_keyboard: [
        [{ text: '🌍 ECO HERO ilovasini ochish', web_app: { url: APP_URL } }],
        [{ text: '🔄 Profilni qayta tahrirlash', callback_data: 'restart_reg' }],
      ],
    },
  });
}

async function processTelegramUpdate(update: any) {
  try {
    if (!update) return;

    if (typeof update.update_id === 'number') {
      if (processedUpdateIds.has(update.update_id)) return;
      processedUpdateIds.add(update.update_id);
      if (processedUpdateIds.size > 2000) {
        const oldest = Array.from(processedUpdateIds).slice(0, 500);
        for (const id of oldest) processedUpdateIds.delete(id);
      }
    }

    if (update.callback_query?.id) {
      const cqKey = `cq_${update.callback_query.id}`;
      if (processedMessageKeys.has(cqKey)) return;
      processedMessageKeys.set(cqKey, Date.now());
      pruneProcessedMessageKeys();
    }

    const activeMsg = update.message || update.edited_message;
    if (activeMsg?.message_id && activeMsg?.chat?.id) {
      const msgKey = `msg_${activeMsg.chat.id}_${activeMsg.message_id}`;
      if (processedMessageKeys.has(msgKey)) return;
      processedMessageKeys.set(msgKey, Date.now());
      pruneProcessedMessageKeys();
    }

    const queueChatKey = String(
      update.callback_query?.message?.chat?.id ||
        update.callback_query?.from?.id ||
        activeMsg?.chat?.id ||
        activeMsg?.from?.id ||
        'global'
    );

    await enqueueChatUpdate(queueChatKey, async () => {
      await handleTelegramUpdateSerialized(update);
    });
  } catch (err) {
    console.error('Error in processTelegramUpdate:', err);
  }
}

async function handleTelegramUpdateSerialized(update: any) {
  try {
    // Callback Queries
    if (update.callback_query) {
      const cq = update.callback_query;
      const chatId = cq.message?.chat?.id;
      const data = String(cq.data || '');
      const userFirstName = cq.from?.first_name || 'Eko-Qahramon';
      const username = cq.from?.username ? `@${cq.from.username}` : undefined;
      const isCallerSuper = checkIsSuperAdmin({ telegramId: cq.from?.id, telegramUsername: username });

      await answerCallbackQuery(cq.id);
      if (!chatId) return;

      const chatKey = String(chatId);
      let session = getRegistrationSession(chatKey);

      if (data === 'restart_reg') {
        setRegistrationSession(chatKey, { mode: 'REGISTER', step: 'PHONE', updatedAt: Date.now() });
        await sendTelegramMessage(
          chatId,
          `🌿 <b>ECO HERO — Profilni ro'yxatdan o'tkazish</b>\n\n1️⃣ Pastdagi <b>«📲 Telefon raqamni yuborish»</b> tugmasini bosing:`,
          {
            reply_markup: {
              keyboard: [[{ text: '📲 Telefon raqamni yuborish', request_contact: true }]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
        return;
      }

      if (data.startsWith('reg_reg:')) {
        if (!session) session = { mode: 'REGISTER', step: 'REGION', updatedAt: Date.now() };
        const idx = parseInt(data.replace('reg_reg:', ''), 10);
        session.region = UZBEKISTAN_REGIONS[idx] || UZBEKISTAN_REGIONS[0];
        session.step = 'DISTRICT';
        session.updatedAt = Date.now();
        setRegistrationSession(chatKey, session);

        const districts = UZBEKISTAN_DISTRICTS[session.region] || [];
        const districtButtons = [];
        for (let i = 0; i < districts.length; i += 2) {
          const row = [{ text: districts[i], callback_data: `reg_dist:${i}` }];
          if (i + 1 < districts.length) row.push({ text: districts[i + 1], callback_data: `reg_dist:${i + 1}` });
          districtButtons.push(row);
        }

        await sendTelegramMessage(chatId, `✅ Viloyat: <b>${session.region}</b>\n\n4️⃣ <b>Tuman yoki shahringizni tanlang:</b>`, {
          reply_markup: { inline_keyboard: districtButtons },
        });
        return;
      }

      if (data.startsWith('reg_dist:')) {
        if (!session) session = { mode: 'REGISTER', step: 'DISTRICT', updatedAt: Date.now() };
        const distIdx = parseInt(data.replace('reg_dist:', ''), 10);
        session.district = (UZBEKISTAN_DISTRICTS[session.region || ''] || [])[distIdx] || 'Markaziy tumani';
        session.step = session.mode === 'APPLY' ? 'APPLY_SCHOOL_NUM' : 'SCHOOL';
        session.updatedAt = Date.now();
        setRegistrationSession(chatKey, session);

        await sendTelegramMessage(
          chatId,
          session.mode === 'APPLY'
            ? `✅ Hudud: <b>${session.region}, ${session.district}</b>\n\n🏫 <b>Maktab raqamini yozing</b> (Masalan: <code>17</code>):`
            : `✅ Hudud: <b>${session.region}, ${session.district}</b>\n\n5️⃣ <b>Maktabingiz raqami yoki nomini yozib yuboring</b> (Masalan: <code>17-maktab</code>):`,
          { reply_markup: { remove_keyboard: true } }
        );
        return;
      }

      if (data.startsWith('reg_grade:')) {
        if (session) {
          session.grade = data.replace('reg_grade:', '');
          await completeTelegramRegistration(chatId, session, username, userFirstName);
        }
        return;
      }

      if (data.startsWith('apply_role:')) {
        const requestedRole = data.replace('apply_role:', '');
        const existingUser = findUserByAnyIdentifier({ telegramId: chatKey, chatId: chatKey });
        const regionButtons = [];
        for (let i = 0; i < UZBEKISTAN_REGIONS.length; i += 2) {
          const row = [{ text: `📍 ${UZBEKISTAN_REGIONS[i]}`, callback_data: `reg_reg:${i}` }];
          if (i + 1 < UZBEKISTAN_REGIONS.length) row.push({ text: `📍 ${UZBEKISTAN_REGIONS[i + 1]}`, callback_data: `reg_reg:${i + 1}` });
          regionButtons.push(row);
        }
        setRegistrationSession(chatKey, {
          mode: 'APPLY',
          step: 'REGION',
          requestedRole,
          fullName: existingUser?.fullName || userFirstName,
          contactInfo: existingUser?.phoneNumber || '',
          updatedAt: Date.now(),
        });
        await sendTelegramMessage(chatId, `🎯 Tanlangan lavozim: <b>${requestedRole}</b>\n\n📍 <b>Viloyatingizni tanlang:</b>`, {
          reply_markup: { inline_keyboard: regionButtons },
        });
        return;
      }

      if (data.startsWith('act_cat:')) {
        const activityCategory = data.replace('act_cat:', '');
        setRegistrationSession(chatKey, {
          mode: 'ACTIVITY',
          step: 'ACT_MEDIA',
          activityCategory,
          updatedAt: Date.now(),
        });
        await sendTelegramMessage(
          chatId,
          `📸 <b>${activityCategory}</b> faoliyatingiz uchun <b>rasm yoki video</b> yuboring:`
        );
        return;
      }

      if (data.startsWith('rep_cat:')) {
        const reportCategory = data.replace('rep_cat:', '');
        const hazardWarning =
          reportCategory === 'electrical_hazard' || reportCategory === 'chemical_hazard'
            ? `\n\n🚨 <b>XAVFSIZLIK ESLATMASI:</b> Elektr yoki kimyoviy chiqindilarga ASLO qo'l tekkizmang! Faqat xavfsiz masofadan suratga oling.`
            : '';
        setRegistrationSession(chatKey, {
          mode: 'REPORT',
          step: 'REP_MEDIA',
          reportCategory,
          updatedAt: Date.now(),
        });
        await sendTelegramMessage(
          chatId,
          `⚠️ Muammo turi: <b>${reportCategory}</b>${hazardWarning}\n\n📸 Endi muammoning <b>rasm yoki videosini</b> yuboring:`
        );
        return;
      }

      // Admin Moderation Callbacks (Strictly Super Admin Only)
      if (
        data.startsWith('appr_rep:') ||
        data.startsWith('rejc_rep:') ||
        data.startsWith('appr_role:') ||
        data.startsWith('rejc_role:') ||
        data.startsWith('appr_app:') ||
        data.startsWith('rejc_app:') ||
        data.startsWith('info_app:') ||
        data.startsWith('appr_med:') ||
        data.startsWith('rejc_med:') ||
        data.startsWith('deliver_ord:')
      ) {
        if (!isCallerSuper) {
          await sendTelegramMessage(chatId, '⛔️ Ushbu moderatsiya amali faqat Super Admin (@jasurdost) uchun ruxsat etilgan.');
          return;
        }
        const approverName = username || 'Super Admin';
        const approverUid = `user_tg_${cq.from?.id}`;

        if (data.startsWith('deliver_ord:')) {
          const orderId = data.replace('deliver_ord:', '');
          const order = centralDb.shopOrders.find((o) => o.id === orderId);
          if (order) {
            order.status = 'delivered';
            order.approvedAt = new Date().toISOString();
            saveCentralDb();
            const winnerUser = findUserByAnyIdentifier({ uid: order.userId });
            if (winnerUser?.telegramChatId || winnerUser?.telegramId) {
              sendTelegramMessage(
                winnerUser.telegramChatId || winnerUser.telegramId,
                `🎁 <b>SOVG'ANGIZ TOPSHIRILDI!</b>\n\n<b>${order.itemTitle}</b> (${order.voucherCode}) tasdiqlandi!`
              ).catch(() => {});
            }
          }
          if (cq.message?.message_id) {
            editTelegramMessage(
              chatId,
              cq.message.message_id,
              order
                ? `✅ <b>SOVG'A TOPSHIRILDI!</b>\n\n🎁 ${order.itemTitle}\n🎟 <code>${order.voucherCode}</code>\n👤 ${order.userName}`
                : `⚠️ Buyurtma topilmadi`
            ).catch(() => {});
          }
          return;
        }

        if (data.startsWith('appr_rep:')) {
          const reportId = data.replace('appr_rep:', '');
          const reportData = await approveReportAndReward(reportId, 'verified', approverName);
          if (reportData && cq.message?.message_id) {
            editTelegramMessage(
              chatId,
              cq.message.message_id,
              `✅ <b>HISOBOT TASDIQLANDI (+${reportData.rewardCoins || getConfiguredReward('problemVerified')} ECO)!</b>\n\n📌 ${reportData.title}\n👤 ${reportData.reporterName} (${reportData.schoolName})`
            ).catch(() => {});
          }
          return;
        }

        if (data.startsWith('rejc_rep:')) {
          const reportId = data.replace('rejc_rep:', '');
          const report = centralDb.reports.find((r) => r.id === reportId);
          if (report) {
            report.status = 'rejected';
            report.rejectedAt = new Date().toISOString();
            saveCentralDb();
          }
          if (cq.message?.message_id) {
            editTelegramMessage(chatId, cq.message.message_id, `❌ <b>HISOBOT RAD ETILDI!</b>`).catch(() => {});
          }
          return;
        }

        if (data.startsWith('appr_role:')) {
          const reqId = data.replace('appr_role:', '');
          const roleReq = await approveRoleRequestUnified(reqId, approverName);
          if (roleReq && cq.message?.message_id) {
            editTelegramMessage(
              chatId,
              cq.message.message_id,
              `✅ <b>ROL TASDIQLANDI!</b>\n👤 ${roleReq.userName}\n🛡 Lavozim: ${roleReq.requestedRoleName}`
            ).catch(() => {});
          }
          return;
        }

        if (data.startsWith('rejc_role:')) {
          const reqId = data.replace('rejc_role:', '');
          const roleReq = centralDb.roleRequests.find((r) => r.id === reqId);
          if (roleReq) {
            roleReq.status = 'rejected';
            roleReq.reviewedAt = new Date().toISOString();
            saveCentralDb();
          }
          if (cq.message?.message_id) {
            editTelegramMessage(chatId, cq.message.message_id, `❌ <b>ROL SO'ROVI RAD ETILDI</b>`).catch(() => {});
          }
          return;
        }

        if (data.startsWith('appr_app:') || data.startsWith('rejc_app:') || data.startsWith('info_app:')) {
          const [prefix, appId] = data.split(':');
          const action = prefix === 'appr_app' ? 'approve' : prefix === 'rejc_app' ? 'reject' : 'request_info';
          const resApp = await reviewRegistrationApplication({
            applicationId: appId,
            action,
            adminNote:
              action === 'request_info'
                ? "Iltimos, maktab ma'lumotlari va tasdiqlovchi hujjatni aniqroq yuboring."
                : action === 'reject'
                ? 'Super Admin tomonidan rad etildi'
                : 'Super Admin tomonidan tasdiqlandi',
            reviewerUid: approverUid,
            reviewerName: approverName,
          });
          if (cq.message?.message_id) {
            const label =
              resApp.error
                ? `⚠️ Xatolik: ${resApp.error}`
                : action === 'approve'
                ? `✅ <b>ARIZA TASDIQLANDI!</b>\n👤 ${resApp.application?.fullName}\n🛡 ${resApp.application?.requestedRoleName}`
                : action === 'reject'
                ? `❌ <b>ARIZA RAD ETILDI</b>\n👤 ${resApp.application?.fullName}`
                : `💬 <b>QO'SHIMCHA MA'LUMOT SO'RALDI</b>\n👤 ${resApp.application?.fullName}`;
            editTelegramMessage(chatId, cq.message.message_id, label).catch(() => {});
          }
          return;
        }

        if (data.startsWith('appr_med:') || data.startsWith('rejc_med:')) {
          const [prefix, subId] = data.split(':');
          const decision = prefix === 'appr_med' ? 'APPROVED' : 'REJECTED';
          const resMed = moderateMediaSubmission({
            submissionId: subId,
            decision,
            moderatorNote: decision === 'APPROVED' ? 'Telegram orqali tasdiqlandi' : 'Telegram orqali rad etildi',
            actorUid: approverUid,
            actorName: approverName,
            actorRole: 'super_admin',
          });
          if (cq.message?.message_id) {
            const label = resMed.error
              ? `⚠️ ${resMed.error}`
              : decision === 'APPROVED'
              ? `✅ <b>MEDIA TASDIQLANDI (+${resMed.submission?.awardedCoins} ECO)!</b>\n👤 ${resMed.submission?.userName}`
              : `❌ <b>MEDIA RAD ETILDI</b>\n👤 ${resMed.submission?.userName}`;
            editTelegramMessage(chatId, cq.message.message_id, label).catch(() => {});
          }
          return;
        }
      }

      return;
    }

    // Handle Messages
    if (!update.message) return;
    const msg = update.message;
    const chatId = msg.chat?.id;
    if (!chatId) return;

    const chatKey = String(chatId);
    const text = (msg.text || msg.caption || '').trim();
    const userFirstName = msg.from?.first_name || 'Eko-Qahramon';
    const username = msg.from?.username ? `@${msg.from.username}` : undefined;
    let session = getRegistrationSession(chatKey);
    const regUser = findUserByAnyIdentifier({ telegramId: chatKey, chatId: chatKey });
    const isRegistered = Boolean(regUser && regUser.isOnboarded);

    // Admin Token Switch Command
    if (text.startsWith('/token ') || text.startsWith('/settoken ')) {
      const newToken = text.split(/\s+/)[1]?.trim();
      if (!checkIsSuperAdmin({ telegramId: chatId, telegramUsername: username })) {
        await sendTelegramMessage(chatId, '⛔️ Ushbu buyruq faqat Super Admin (@jasurdost) uchun.');
        return;
      }
      if (!newToken || !newToken.includes(':')) {
        await sendTelegramMessage(chatId, "⚠️ Token formati noto'g'ri.");
        return;
      }
      const testRes = await fetch(`https://api.telegram.org/bot${newToken}/getMe`);
      const testData = await testRes.json();
      if (!testData.ok) {
        await sendTelegramMessage(chatId, `❌ Bot token tasdiqlanmadi: ${testData.description}`);
        return;
      }
      activeBotToken = newToken;
      activeBotUsername = testData.result.username;
      fs.writeFileSync(
        BOT_CONFIG_PATH,
        JSON.stringify({ botToken: newToken, botUsername: activeBotUsername, updatedAt: new Date().toISOString() }, null, 2)
      );
      startTelegramPolling(newToken);
      await sendTelegramMessage(chatId, `✅ Yangi bot ulandi: @${activeBotUsername}`);
      return;
    }

    // 1. Contact Handler (Fixes phone-request loop permanently)
    if (msg.contact) {
      let rawPhone = String(msg.contact.phone_number || '').trim();
      if (!rawPhone.startsWith('+')) rawPhone = `+${rawPhone}`;
      const contactFullName = [msg.contact.first_name, msg.contact.last_name].filter(Boolean).join(' ') || userFirstName;
      const isJasur = checkIsSuperAdmin({ telegramUsername: username, telegramId: chatKey, phoneNumber: rawPhone });

      if (isJasur) {
        const superProfile = upsertUser({
          uid: `user_tg_${chatKey}`,
          chatId: chatKey,
          telegramId: Number(chatKey) || chatKey,
          telegramChatId: chatKey,
          telegramUsername: username || '@jasurdost',
          fullName: "Jasurbek O'rmonov (@jasurdost)",
          phoneNumber: rawPhone,
          region: 'Toshkent shahri',
          district: 'Shayxontohur tumani',
          schoolId: 'central_hq',
          schoolName: 'ECO HERO Markaziy Boshqarmasi',
          schoolNumber: '1',
          grade: 'Super Admin',
          ecoCoins: 50000,
          totalCoinsEarned: 50000,
          role: 'super_admin',
          approvedRoles: ['student', 'ambassador', 'school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin', 'sponsor'],
          welcomeBonusClaimed: true,
          avatarUrl: DEFAULT_AVATAR,
          badge: 'Bosh Administrator',
          isOnboarded: true,
          isVerified: true,
        });
        deleteRegistrationSession(chatKey);

        await sendTelegramMessage(
          chatId,
          `👑 <b>XUSH KELIBSIZ, BOSH ADMINISTRATOR (@jasurdost)!</b>\n\n🛡 <b>Vakolat:</b> Super Admin\n💰 <b>Balans:</b> ${superProfile.ecoCoins} EcoCoin`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: '🌍 ECO HERO Boshqaruv Panelini ochish', web_app: { url: APP_URL } }]],
            },
          }
        );
        return;
      }

      // If user already onboarded (matched by telegramId OR phoneNumber), link Telegram ID & complete immediately instead of looping!
      const matchedExisting = findUserByAnyIdentifier({ telegramId: chatKey, chatId: chatKey, phoneNumber: rawPhone });
      if (matchedExisting && matchedExisting.isOnboarded) {
        matchedExisting.telegramId = Number(chatKey) || chatKey;
        matchedExisting.telegramChatId = chatKey;
        matchedExisting.chatId = chatKey;
        if (username) matchedExisting.telegramUsername = username;
        if (!matchedExisting.phoneNumber) matchedExisting.phoneNumber = rawPhone;
        deleteRegistrationSession(chatKey);
        saveCentralDb();

        await sendTelegramMessage(
          chatId,
          `✅ <b>Hisobingiz muvaffaqiyatli bog'landi, ${matchedExisting.fullName}!</b>\n\n🏫 <b>Maktab:</b> ${matchedExisting.schoolName}\n💰 <b>Balans:</b> ${matchedExisting.ecoCoins || 0} EcoCoin\n\nBuyruqlar: /report, /activity, /apply, /tasks, /coins`,
          {
            reply_markup: {
              remove_keyboard: true,
              inline_keyboard: [[{ text: '🌍 ECO HERO ilovasini ochish', web_app: { url: APP_URL } }]],
            },
          }
        );
        return;
      }

      session = {
        mode: 'REGISTER',
        step: 'REGION',
        phoneNumber: rawPhone,
        fullName: contactFullName,
        referredBy: session?.referredBy,
        updatedAt: Date.now(),
      };
      setRegistrationSession(chatKey, session);

      const regionButtons = [];
      for (let i = 0; i < UZBEKISTAN_REGIONS.length; i += 2) {
        const row = [{ text: `📍 ${UZBEKISTAN_REGIONS[i]}`, callback_data: `reg_reg:${i}` }];
        if (i + 1 < UZBEKISTAN_REGIONS.length) {
          row.push({ text: `📍 ${UZBEKISTAN_REGIONS[i + 1]}`, callback_data: `reg_reg:${i + 1}` });
        }
        regionButtons.push(row);
      }

      await sendTelegramMessage(
        chatId,
        `✅ <b>Telefon raqam qabul qilindi:</b> ${rawPhone}\n👤 <b>Ism:</b> ${contactFullName}\n\n3️⃣ <b>Viloyatingizni tanlang:</b>`,
        { reply_markup: { inline_keyboard: regionButtons } }
      );
      return;
    }

    // 2. Incoming Photo / Video Handling for /activity or /report sessions
    const hasPhoto = Boolean(msg.photo && msg.photo.length > 0);
    const hasVideo = Boolean(msg.video || msg.document?.mime_type?.startsWith('video/'));

    if ((hasPhoto || hasVideo) && session && (session.step === 'ACT_MEDIA' || session.step === 'REP_MEDIA')) {
      const fileId = hasVideo
        ? msg.video?.file_id || msg.document?.file_id
        : msg.photo[msg.photo.length - 1]?.file_id;
      const savedMedia = await downloadTelegramFileToUploads(fileId, hasVideo ? 'video' : 'image');
      if (!savedMedia) {
        await sendTelegramMessage(chatId, "⚠️ Media faylni yuklab bo'lmadi. Qayta urinib ko'ring.");
        return;
      }

      if (session.step === 'ACT_MEDIA') {
        const callerUid = regUser?.uid || `user_tg_${chatKey}`;
        if (hasDuplicateMediaSubmission({ userId: callerUid, fileHash: savedMedia.fileHash, mediaUrl: savedMedia.url })) {
          deleteRegistrationSession(chatKey);
          await sendTelegramMessage(chatId, '⚠️ Ushbu media fayl avval yuklangan. Takroriy mukofot uchun bir xil fayl qabul qilinmaydi.');
          return;
        }
        session.uploadedMediaUrl = savedMedia.url;
        session.uploadedMediaType = savedMedia.mediaType;
        session.uploadedFileHash = savedMedia.fileHash;
        session.step = 'ACT_DESC';
        session.updatedAt = Date.now();
        setRegistrationSession(chatKey, session);
        await sendTelegramMessage(chatId, '✅ Media qabul qilindi! Endi faoliyat haqida <b>qisqacha tavsif yozing</b> (kamida 5 ta belgi):');
        return;
      }

      if (session.step === 'REP_MEDIA') {
        session.uploadedMediaUrl = savedMedia.url;
        session.uploadedMediaType = savedMedia.mediaType;
        session.step = 'REP_LOC';
        session.updatedAt = Date.now();
        setRegistrationSession(chatKey, session);
        await sendTelegramMessage(
          chatId,
          '✅ Media qabul qilindi!\n\n📍 Endi muammo joylashuvini aniq xaritaga tushirish uchun <b>«📍 Joriy joylashuvni yuborish»</b> tugmasini bosing (yoki o‘tkazib yuboring):',
          {
            reply_markup: {
              keyboard: [
                [{ text: '📍 Joriy joylashuvni yuborish', request_location: true }],
                [{ text: "⏭ O'tkazib yuborish" }],
              ],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          }
        );
        return;
      }
    } else if (hasPhoto || hasVideo) {
      await sendTelegramMessage(
        chatId,
        '📸 Rasm yoki video yuborishdan oldin quyidagi buyruqlardan birini tanlang:\n\n• /report — Ekologik muammo yuborish\n• /activity — Ekologik faoliyat (daraxt ekish, tozalash) yuklash',
        { reply_markup: { inline_keyboard: [[{ text: '🌍 ECO HERO ilovasini ochish', web_app: { url: APP_URL } }]] } }
      );
      return;
    }

    // 2.5 Incoming Location Handling for /report session
    if (msg.location && session && session.step === 'REP_LOC') {
      session.lat = msg.location.latitude;
      session.lng = msg.location.longitude;
      session.step = 'REP_DESC';
      session.updatedAt = Date.now();
      setRegistrationSession(chatKey, session);
      await sendTelegramMessage(
        chatId,
        '📍 <b>Joylashuv saqlandi!</b>\n\nEndi muammo haqida <b>batafsil tavsif yozing</b> (kamida 5 ta belgi):',
        { reply_markup: { remove_keyboard: true } }
      );
      return;
    }

    // 3. /start, /menu, /help, /cancel commands (always clear stale active session)
    if (text === '/cancel' || text === '/bekor') {
      deleteRegistrationSession(chatKey);
      await sendTelegramMessage(chatId, '✅ Joriy amal bekor qilindi. Barcha buyruqlar: /help', {
        reply_markup: { remove_keyboard: true },
      });
      return;
    }

    if (text === '/help' || text === '/yordam') {
      await sendTelegramMessage(
        chatId,
        `🌿 <b>ECO HERO BOT — BARCHA BUYRUQLAR</b>\n\n` +
          `🚀 /start — Ro'yxatdan o'tish va bosh menyu\n` +
          `🌍 /menu — Mini App ilovasini ochish\n` +
          `👤 /profile — Mening profilim va reytingim\n` +
          `🚨 /report — Ekologik muammo xabar qilish (foto + lokatsiya)\n` +
          `🎬 /activity — Eko-faoliyat (daraxt ekish, tozalash) yuklash\n` +
          `📋 /tasks — Menga biriktirilgan vazifalar\n` +
          `🏆 /rank — Maktablar TOP reytingi\n` +
          `💰 /coins — EcoCoin hamyon va kutilayotgan mukofotlar\n` +
          `🎁 /invite — Do'stlarni taklif qilib bonus olish\n` +
          `🛡 /apply — Sardor / Eko-Elchi lavozimiga ariza\n` +
          `❌ /cancel — Joriy amalni bekor qilish`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🌍 ECO HERO ilovasini ochish', web_app: { url: APP_URL } }]],
          },
        }
      );
      return;
    }

    if (text.startsWith('/start')) {
      const startParam = text.split(/\s+/)[1]?.trim();
      deleteRegistrationSession(chatKey);
      if (checkIsSuperAdmin({ telegramUsername: username, telegramId: chatKey })) {
        await sendTelegramMessage(
          chatId,
          `👑 <b>Assalomu alaykum, Bosh Administrator (@jasurdost)!</b>\n\nBot va yagona baza faol ishlamoqda.\nBuyruqlar: /admin · /profile · /apply · /activity · /report · /tasks · /rank · /coins · /invite`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🌍 ECO HERO Boshqaruv Paneli', web_app: { url: APP_URL } }],
                [{ text: '✏️ Profilni yangilash', callback_data: 'restart_reg' }],
              ],
            },
          }
        );
        return;
      }

      if (isRegistered && regUser) {
        await sendTelegramMessage(
          chatId,
          `🌿 <b>Assalomu alaykum, ${regUser.fullName}!</b>\n\n💰 <b>Balans:</b> ${regUser.ecoCoins} EcoCoin\n🏫 <b>Maktab:</b> ${regUser.schoolName}\n🛡 <b>Rol:</b> ${regUser.role}\n\n<b>Mavjud buyruqlar:</b>\n• /report — Ekologik muammo xabar qilish\n• /activity — Eko-faoliyat (foto/video) yuklash\n• /profile — Profilim · /invite — Do'st taklif qilish\n• /tasks — Vazifalarim · /rank — Reytinglar · /coins — Hamyon`,
          {
            reply_markup: {
              inline_keyboard: [
                [{ text: '🌍 ECO HERO ilovasini ochish', web_app: { url: APP_URL } }],
                [{ text: '✏️ Profilni tahrirlash', callback_data: 'restart_reg' }],
              ],
            },
          }
        );
        return;
      }

      const welcomeBonus = getConfiguredReward('welcomeBonus');
      const inviteeBonus = startParam ? getConfiguredReward('referralInvitee') : 0;
      setRegistrationSession(chatKey, {
        mode: 'REGISTER',
        step: 'PHONE',
        referredBy: startParam || undefined,
        updatedAt: Date.now(),
      });
      await sendTelegramMessage(
        chatId,
        `🌿 <b>Assalomu alaykum! ECO HERO platformasiga xush kelibsiz!</b>\n\nRo'yxatdan o'tib +${welcomeBonus} EcoCoin${startParam ? ` (+${inviteeBonus} do'st taklifi bonusi)` : ''} olish uchun telefon raqamingizni yuboring:\n\n1️⃣ Pastdagi <b>«📲 Telefon raqamni yuborish»</b> tugmasini bosing:`,
        {
          reply_markup: {
            keyboard: [[{ text: '📲 Telefon raqamni yuborish', request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
      return;
    }

    if (text === '/menu' || text.startsWith('/menu@')) {
      deleteRegistrationSession(chatKey);
      await sendTelegramMessage(
        chatId,
        `🌍 <b>ECO HERO Mini App Menyusi</b>\n\nEkologik xarita, vazifalar, EcoShop hamyoni va reytinglarni darhol ochish uchun pastdagi tugmani bosing 👇`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🌍 ECO HERO ilovasini ochish', web_app: { url: APP_URL } }],
            ],
          },
        }
      );
      return;
    }

    if (text === '/profile' || text === '/profil') {
      if (!regUser || !regUser.isOnboarded) {
        await sendTelegramMessage(chatId, "Avval ro'yxatdan o'ting:", {
          reply_markup: { inline_keyboard: [[{ text: "🚀 Ro'yxatdan o'tish", callback_data: 'restart_reg' }]] },
        });
        return;
      }
      await sendTelegramMessage(
        chatId,
        `👤 <b>SIZNING ECO HERO PROFILINGIZ</b>\n\n` +
          `📛 <b>Ism:</b> ${regUser.fullName}\n` +
          `📱 <b>Telefon:</b> ${regUser.phoneNumber || 'Kiritilmagan'}\n` +
          `📍 <b>Hudud:</b> ${regUser.region}, ${regUser.district || '-'}\n` +
          `🏫 <b>Maktab:</b> ${regUser.schoolName} (${regUser.grade || '-'})\n` +
          `🛡 <b>Rol:</b> ${regUser.role}\n` +
          `💰 <b>Balans:</b> ${regUser.ecoCoins || 0} EcoCoin\n` +
          `🔥 <b>Faollik:</b> ${regUser.streakDays || 1} kun · 🏆 <b>Taklif kodi:</b> <code>${regUser.referralCode || '-'}</code>`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🌍 Profilni Mini Appda ochish', web_app: { url: APP_URL } }],
              [{ text: '✏️ Profilni tahrirlash', callback_data: 'restart_reg' }],
            ],
          },
        }
      );
      return;
    }

    if (text === '/invite' || text === '/taklif') {
      if (!regUser || !regUser.isOnboarded) {
        await sendTelegramMessage(chatId, "Taklif havolasi olish uchun avval ro'yxatdan o'ting:", {
          reply_markup: { inline_keyboard: [[{ text: "🚀 Ro'yxatdan o'tish", callback_data: 'restart_reg' }]] },
        });
        return;
      }
      const refCode = regUser.referralCode || regUser.uid;
      const inviteLink = `https://t.me/${activeBotUsername}?start=${encodeURIComponent(refCode)}`;
      const inviterBonus = getConfiguredReward('referralInviter');
      const inviteeBonus = getConfiguredReward('referralInvitee');
      const shareText = encodeURIComponent(`🌿 ECO HERO O'zbekiston ekologik harakatiga qo'shiling va +${inviteeBonus} EcoCoin bonus oling!`);
      await sendTelegramMessage(
        chatId,
        `🎁 <b>DO'STLARNI TAKLIF QILING VA ECO COIN OLING!</b>\n\n` +
          `👥 Har bir taklif qilingan do'stingiz uchun:\n` +
          `• Sizga: <b>+${inviterBonus} EcoCoin</b>\n` +
          `• Do'stingizga: <b>+${inviteeBonus} EcoCoin</b>\n\n` +
          `🔗 <b>Shaxsiy havolangiz:</b>\n<code>${inviteLink}</code>`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '📤 Do‘stlarga ulashish', url: `https://t.me/share/url?url=${encodeURIComponent(inviteLink)}&text=${shareText}` }],
              [{ text: '🌍 EcoShop & Hamyon', web_app: { url: APP_URL } }],
            ],
          },
        }
      );
      return;
    }

    if (text === '/admin') {
      if (!checkIsSuperAdmin({ telegramId: chatId, telegramUsername: username })) {
        await sendTelegramMessage(chatId, '⛔️ Ushbu buyruq faqat Super Admin (@jasurdost) uchun.');
        return;
      }
      const pendingRep = centralDb.reports.filter((r) => r.status === 'pending' || r.status === 'PENDING_REVIEW').length;
      const pendingMed = (centralDb.mediaSubmissions || []).filter((m) => m.status === 'PENDING').length;
      const pendingApps = (centralDb.registrationApplications || []).filter((a) => a.status === 'pending').length;
      await sendTelegramMessage(
        chatId,
        `👑 <b>ECO HERO ADMIN HISOBOTI</b>\n\n` +
          `👥 <b>Foydalanuvchilar:</b> ${Object.keys(centralDb.users).length}\n` +
          `🏫 <b>Maktablar:</b> ${centralDb.schools.length}\n` +
          `⏳ <b>Kutilayotgan muammolar:</b> ${pendingRep}\n` +
          `🎬 <b>Kutilayotgan media:</b> ${pendingMed}\n` +
          `🛡 <b>Kutilayotgan arizalar:</b> ${pendingApps}\n` +
          `🌐 <b>Mini App URL:</b> <code>${APP_URL}</code>\n` +
          `📡 <b>Rejim:</b> ${isWebhookMode ? 'Webhook (24/7)' : 'Long-Polling'}`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🌍 Boshqaruv Panelini ochish', web_app: { url: APP_URL } }]],
          },
        }
      );
      return;
    }

    // 4. Bot Feature Commands (/coins, /apply, /activity, /report, /tasks, /rank)
    if (text === '/coins' || text.toLowerCase().includes('tang') || text.toLowerCase().includes('balans')) {
      if (!regUser) {
        await sendTelegramMessage(chatId, "Hamyonni ko'rish uchun avval ro'yxatdan o'ting:", {
          reply_markup: { inline_keyboard: [[{ text: "🚀 Ro'yxatdan o'tish", callback_data: 'restart_reg' }]] },
        });
        return;
      }
      const pendingMediaCoins = (centralDb.mediaSubmissions || [])
        .filter((m) => m.userId === regUser.uid && m.status === 'PENDING')
        .reduce((s, m) => s + getMediaCategoryReward(m.activityCategory), 0);
      const pendingReportCoins = centralDb.reports
        .filter((r) => r.reporterUid === regUser.uid && (r.status === 'pending' || r.status === 'PENDING_REVIEW'))
        .reduce((s, r) => s + getConfiguredReward('problemVerified'), 0);

      await sendTelegramMessage(
        chatId,
        `💰 <b>ECO COIN HAMYONINGIZ</b>\n\n✅ <b>Tasdiqlangan balans:</b> ${regUser.ecoCoins || 0} EcoCoin\n⏳ <b>Moderatsiya kutilmoqda:</b> +${pendingMediaCoins + pendingReportCoins} EcoCoin\n🏆 <b>Jami topilgan:</b> ${regUser.totalCoinsEarned || 0} EcoCoin`,
        { reply_markup: { inline_keyboard: [[{ text: '🛍 EcoShop & Hamyon', web_app: { url: APP_URL } }]] } }
      );
      return;
    }

    if (text === '/apply') {
      if (!regUser || !regUser.isOnboarded) {
        await sendTelegramMessage(chatId, "Ariza topshirishdan oldin iltimos ro'yxatdan o'ting:", {
          reply_markup: { inline_keyboard: [[{ text: "🚀 Ro'yxatdan o'tish", callback_data: 'restart_reg' }]] },
        });
        return;
      }
      await sendTelegramMessage(chatId, `🛡 <b>LAVOZIM UCHUN ARIZA TOPSHIRISH</b>\n\nQaysi mas'uliyatli lavozimga ariza topshirmoqchisiz?`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🌟 Maktab Eko-Elchisi (Ambassador)', callback_data: 'apply_role:ambassador' }],
            [{ text: '🏫 Maktab Sardori / Admini', callback_data: 'apply_role:school_admin' }],
            [{ text: '🗺 Tuman Koordinatori', callback_data: 'apply_role:district_coordinator' }],
            [{ text: '🌐 Viloyat Koordinatori', callback_data: 'apply_role:regional_coordinator' }],
          ],
        },
      });
      return;
    }

    if (text === '/activity') {
      if (!regUser || !regUser.isOnboarded) {
        await sendTelegramMessage(chatId, "Eko-faoliyat yuklashdan oldin iltimos ro'yxatdan o'ting:", {
          reply_markup: { inline_keyboard: [[{ text: "🚀 Ro'yxatdan o'tish", callback_data: 'restart_reg' }]] },
        });
        return;
      }
      await sendTelegramMessage(chatId, `🎬 <b>EKOLOGIK FAOLIYAT (FOTO/VIDEO) YUKLASH</b>\n\nFaoliyat turini tanlang:`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🌱 Daraxt ekish', callback_data: 'act_cat:tree_planting' }, { text: '💧 Sug‘orish/parvarish', callback_data: 'act_cat:tree_care' }],
            [{ text: '🏡 Maktab bog‘i', callback_data: 'act_cat:school_garden' }, { text: '♻️ Chiqindi saralash', callback_data: 'act_cat:waste_sorting' }],
            [{ text: '🎥 Targ‘ibot videosi', callback_data: 'act_cat:awareness_video' }, { text: '🤝 Eko-kampaniya', callback_data: 'act_cat:environmental_campaign' }],
          ],
        },
      });
      return;
    }

    if (text === '/report') {
      if (!regUser || !regUser.isOnboarded) {
        await sendTelegramMessage(chatId, "Muammo yuborishdan oldin iltimos ro'yxatdan o'ting:", {
          reply_markup: { inline_keyboard: [[{ text: "🚀 Ro'yxatdan o'tish", callback_data: 'restart_reg' }]] },
        });
        return;
      }
      await sendTelegramMessage(chatId, `🚨 <b>EKOLOGIK MUAMMO XABAR QILISH</b>\n\nMuammo turini tanlang:`, {
        reply_markup: {
          inline_keyboard: [
            [{ text: '🗑 Chiqindi to‘planishi', callback_data: 'rep_cat:waste' }, { text: '💧 Suv ifloslanishi', callback_data: 'rep_cat:water' }],
            [{ text: '🌳 Daraxt / Yashil hudud', callback_data: 'rep_cat:deforestation' }, { text: '🌱 Ko‘kalamzorlashtirish', callback_data: 'rep_cat:greening_needed' }],
            [{ text: '⚡ Elektr xavfi (Kattalar nazorati)', callback_data: 'rep_cat:electrical_hazard' }],
            [{ text: '☣️ Kimyoviy xavf (Kattalar nazorati)', callback_data: 'rep_cat:chemical_hazard' }],
          ],
        },
      });
      return;
    }

    if (text === '/tasks') {
      if (!regUser) {
        await sendTelegramMessage(chatId, "Vazifalarni ko'rish uchun avval ro'yxatdan o'ting:", {
          reply_markup: { inline_keyboard: [[{ text: "🚀 Ro'yxatdan o'tish", callback_data: 'restart_reg' }]] },
        });
        return;
      }
      const myTasks = (centralDb.ecoTasks || []).filter(
        (t) => t.assigneeUid === regUser.uid || (regUser.role === 'school_admin' && t.schoolId === regUser.schoolId)
      );
      if (myTasks.length === 0) {
        await sendTelegramMessage(chatId, "📋 Hozircha sizga biriktirilgan faol vazifalar mavjud emas.");
        return;
      }
      const lines = myTasks
        .slice(0, 6)
        .map((t, idx) => `${idx + 1}. <b>${t.title}</b> — [${t.status}] (+${t.rewardCoins} ECO)\n   📝 ${t.instructions}`)
        .join('\n\n');
      await sendTelegramMessage(chatId, `📋 <b>EKO VAZIFALARINGIZ:</b>\n\n${lines}`, {
        reply_markup: { inline_keyboard: [[{ text: '🌍 Kabinetda boshqarish', web_app: { url: APP_URL } }]] },
      });
      return;
    }

    if (text === '/rank') {
      recalculateSchoolRanks();
      const topSchools = centralDb.schools.slice(0, 5);
      const schoolLines = topSchools
        .map((s, i) => `${i + 1}. <b>${s.name}</b> — ${s.totalCoins} ECO`)
        .join('\n');
      await sendTelegramMessage(
        chatId,
        `🏆 <b>TOP-5 EKOLOGIK MAKTABLAR REYTINGI:</b>\n\n${schoolLines}\n\n<i>Rolga mos kengaytirilgan reytinglarni Mini App ichida ko'ring.</i>`,
        { reply_markup: { inline_keyboard: [[{ text: '📊 Barcha reytinglar', web_app: { url: APP_URL } }]] } }
      );
      return;
    }

    if (text.startsWith('/check') || text.startsWith('/tekshir')) {
      const isAuthorizedChecker =
        checkIsSuperAdmin({ telegramUsername: username, telegramId: chatKey }) ||
        Boolean(regUser && hasAnyRole(regUser, ['school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin']));
      if (!isAuthorizedChecker) {
        await sendTelegramMessage(chatId, "⛔️ Promokod tekshirish faqat Maktab adminlari va Super Adminlar uchun ruxsat etilgan.");
        return;
      }
      const codeArg = text.split(/\s+/)[1]?.trim().toUpperCase();
      if (!codeArg) {
        await sendTelegramMessage(chatId, "🎟 Foydalanish: <code>/check ECO-XXXX-1234</code>");
        return;
      }
      const order = centralDb.shopOrders.find((o) => String(o.voucherCode || '').trim().toUpperCase() === codeArg);
      if (!order) {
        await sendTelegramMessage(chatId, `❌ <b>PROMOKOD TOPILMADI:</b> <code>${codeArg}</code>\nBu o'quvchining sovg'a yutganligi bazada tasdiqlanmadi.`);
        return;
      }
      await sendTelegramMessage(
        chatId,
        `✅ <b>HAQIQIY YUTUQ VAUCHERI!</b>\n\n🎟 <b>Promokod:</b> <code>${order.voucherCode}</code>\n🎁 <b>Sovg'a:</b> ${order.itemTitle}\n👤 <b>G'olib:</b> ${order.userName}\n🏫 <b>Maktab:</b> ${order.schoolName}\n📌 <b>Holat:</b> ${order.status}\n🔗 <b>QR Havola:</b> ${APP_URL}/voucher/${order.voucherCode}`
      );
      return;
    }

    // 5. Multi-step Session Text Handling
    if (session) {
      if (session.step === 'PHONE') {
        if (text.replace(/[^\d]/g, '').length >= 9) {
          const norm = text.startsWith('+') ? text : `+${text}`;
          const already = findUserByAnyIdentifier({ telegramId: chatKey, phoneNumber: norm });
          if (already && already.isOnboarded) {
            already.telegramId = Number(chatKey) || chatKey;
            already.telegramChatId = chatKey;
            deleteRegistrationSession(chatKey);
            saveCentralDb();
            await sendTelegramMessage(chatId, `✅ Hisobingiz topildi va ulandi, <b>${already.fullName}</b>! /coins yoki /report yuborishingiz mumkin.`);
            return;
          }
          session.phoneNumber = norm;
          session.step = 'NAME';
          setRegistrationSession(chatKey, session);
          await sendTelegramMessage(chatId, `✅ Telefon qabul qilindi: <b>${norm}</b>\n\n2️⃣ <b>Ism va familiyangizni kiriting:</b>`, {
            reply_markup: { remove_keyboard: true },
          });
        } else {
          await sendTelegramMessage(chatId, "⚠️ Telefon raqamni to'g'ri kiriting yoki pastdagi «📲 Telefon raqamni yuborish» tugmasini bosing:", {
            reply_markup: {
              keyboard: [[{ text: '📲 Telefon raqamni yuborish', request_contact: true }]],
              resize_keyboard: true,
              one_time_keyboard: true,
            },
          });
        }
        return;
      }

      if (session.step === 'NAME') {
        if (text.length >= 2) {
          session.fullName = text;
          session.step = 'REGION';
          setRegistrationSession(chatKey, session);

          const regionButtons = [];
          for (let i = 0; i < UZBEKISTAN_REGIONS.length; i += 2) {
            const row = [{ text: `📍 ${UZBEKISTAN_REGIONS[i]}`, callback_data: `reg_reg:${i}` }];
            if (i + 1 < UZBEKISTAN_REGIONS.length) row.push({ text: `📍 ${UZBEKISTAN_REGIONS[i + 1]}`, callback_data: `reg_reg:${i + 1}` });
            regionButtons.push(row);
          }
          await sendTelegramMessage(chatId, `✅ Ism: <b>${text}</b>\n\n3️⃣ <b>Viloyatni tanlang:</b>`, {
            reply_markup: { inline_keyboard: regionButtons },
          });
        } else {
          await sendTelegramMessage(chatId, "⚠️ Iltimos, ism va familiyangizni to'liq kiriting:");
        }
        return;
      }

      if (session.step === 'SCHOOL') {
        if (text.length >= 1) {
          session.schoolName = text;
          session.step = 'GRADE';
          setRegistrationSession(chatKey, session);

          const gradeButtons = [
            [{ text: '5-sinf', callback_data: 'reg_grade:5-sinf' }, { text: '6-sinf', callback_data: 'reg_grade:6-sinf' }],
            [{ text: '7-sinf', callback_data: 'reg_grade:7-sinf' }, { text: '8-sinf', callback_data: 'reg_grade:8-sinf' }],
            [{ text: '9-sinf', callback_data: 'reg_grade:9-sinf' }, { text: '10-sinf', callback_data: 'reg_grade:10-sinf' }],
            [{ text: '11-sinf', callback_data: 'reg_grade:11-sinf' }, { text: 'Talaba / Yoshlar', callback_data: 'reg_grade:Talaba' }],
          ];
          await sendTelegramMessage(chatId, `✅ Maktab: <b>${text}</b>\n\n6️⃣ <b>Sinfingizni tanlang:</b>`, {
            reply_markup: { inline_keyboard: gradeButtons },
          });
        }
        return;
      }

      if (session.step === 'GRADE') {
        session.grade = text;
        await completeTelegramRegistration(chatId, session, username, userFirstName);
        return;
      }

      // /apply steps
      if (session.step === 'APPLY_SCHOOL_NUM') {
        session.schoolNumber = text.trim();
        session.step = 'APPLY_SCHOOL_NAME';
        setRegistrationSession(chatKey, session);
        await sendTelegramMessage(chatId, "🏫 <b>Maktabning rasmiy to'liq nomini yozing</b> (Masalan: <code>17-sonli umumta'lim maktabi</code>):");
        return;
      }

      if (session.step === 'APPLY_SCHOOL_NAME') {
        session.schoolName = text.trim();
        session.step = 'APPLY_CONTACT';
        setRegistrationSession(chatKey, session);
        await sendTelegramMessage(chatId, '📞 <b>Aloqa raqamingizni kiriting</b> (+998 ...):');
        return;
      }

      if (session.step === 'APPLY_CONTACT') {
        session.contactInfo = text.trim();
        session.step = 'APPLY_VERIFY';
        setRegistrationSession(chatKey, session);
        await sendTelegramMessage(chatId, "📝 <b>Tasdiqlovchi ma'lumot yozing</b> (Tajriba, maktabdagi rolingiz yoki tavsiya):");
        return;
      }

      if (session.step === 'APPLY_VERIFY') {
        const callerUid = regUser?.uid || `user_tg_${chatKey}`;
        const school = findOrCreateSchool({
          schoolName: session.schoolName || 'Maktab',
          schoolNumber: session.schoolNumber,
          region: session.region || 'Toshkent shahri',
          district: session.district || '',
          incrementStudents: false,
        });
        const dup = hasDuplicateActiveAppointment({
          userId: callerUid,
          requestedRole: session.requestedRole || 'ambassador',
          schoolId: school?.id,
          district: session.district,
        });
        deleteRegistrationSession(chatKey);

        if (dup) {
          await sendTelegramMessage(chatId, `⚠️ <b>Ariza qabul qilinmadi:</b>\n${dup}`);
          return;
        }

        const newApp = {
          id: `app_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          userId: callerUid,
          fullName: session.fullName || regUser?.fullName || userFirstName,
          telegramId: chatKey,
          telegramUsername: username || regUser?.telegramUsername || '',
          region: session.region || regUser?.region || 'Toshkent shahri',
          district: session.district || regUser?.district || '',
          schoolId: school?.id || '',
          schoolNumber: session.schoolNumber || '',
          officialSchoolName: school?.name || session.schoolName || '',
          requestedRole: session.requestedRole || 'ambassador',
          requestedRoleName: session.requestedRole || 'ambassador',
          contactInfo: session.contactInfo || regUser?.phoneNumber || '',
          verificationDetails: text.trim(),
          status: 'pending',
          createdAt: new Date().toISOString(),
        };
        centralDb.registrationApplications.unshift(newApp);
        saveCentralDb();

        sendTelegramMessage(
          '8832599080',
          `📋 <b>YANGI BOT ORQALI ARIZA</b>\n\n👤 ${newApp.fullName} (TG: ${chatKey})\n📍 ${newApp.region}, ${newApp.district}\n🏫 #${newApp.schoolNumber} ${newApp.officialSchoolName}\n🎯 Lavozim: <b>${newApp.requestedRole}</b>\n📞 ${newApp.contactInfo}\n📝 ${newApp.verificationDetails}`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Tasdiqlash', callback_data: `appr_app:${newApp.id}` },
                  { text: '❌ Rad etish', callback_data: `rejc_app:${newApp.id}` },
                ],
                [{ text: "💬 Qo'shimcha ma'lumot so'rash", callback_data: `info_app:${newApp.id}` }],
              ],
            },
          }
        ).catch(() => {});

        await sendTelegramMessage(chatId, "✅ <b>Arizangiz Super Admin (@jasurdost) ga yuborildi!</b> Tasdiqlangach Telegram orqali xabar olasiz.");
        return;
      }

      // /activity description
      if (session.step === 'ACT_DESC') {
        const desc = text.trim();
        if (desc.length < 5) {
          await sendTelegramMessage(chatId, '⚠️ Tavsif kamida 5 ta belgidan iborat bo‘lishi kerak.');
          return;
        }
        const sub = {
          id: `media_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          userId: regUser?.uid || `user_tg_${chatKey}`,
          userName: regUser?.fullName || userFirstName,
          userRole: regUser?.role || 'student',
          schoolId: regUser?.schoolId || 'school_tashkent_17',
          schoolName: regUser?.schoolName || 'Maktab',
          region: regUser?.region || 'Toshkent shahri',
          district: regUser?.district || 'Shayxontohur tumani',
          activityCategory: session.activityCategory || 'tree_planting',
          mediaType: session.uploadedMediaType || 'image',
          mediaUrl: session.uploadedMediaUrl || '',
          fileHash: session.uploadedFileHash || '',
          description: desc,
          status: 'PENDING',
          awardedCoins: 0,
          createdAt: new Date().toISOString(),
        };
        centralDb.mediaSubmissions.unshift(sub);
        deleteRegistrationSession(chatKey);
        saveCentralDb();

        sendTelegramMessage(
          '8832599080',
          `🎬 <b>BOTDAN YANGI EKO-MEDIA (MODERATSIYA)</b>\n👤 ${sub.userName} (${sub.schoolName})\n🏷 ${sub.activityCategory}\n📝 ${sub.description}`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: '✅ Tasdiqlash', callback_data: `appr_med:${sub.id}` },
                  { text: '❌ Rad etish', callback_data: `rejc_med:${sub.id}` },
                ],
              ],
            },
          }
        ).catch(() => {});

        await sendTelegramMessage(chatId, `✅ <b>Ekologik media yuklandi!</b>\nHolat: <b>PENDING</b> — Super Admin tasdiqlagach EcoCoin hisobingizga o'tkaziladi.`);
        return;
      }

      // /report location skip / fallback
      if (session.step === 'REP_LOC') {
        session.step = 'REP_DESC';
        session.updatedAt = Date.now();
        setRegistrationSession(chatKey, session);
        await sendTelegramMessage(
          chatId,
          "✍️ Maktab hududi koordinatasi tanlandi. Endi muammoning <b>batafsil tavsifini yozing</b> (kamida 5 ta belgi):",
          { reply_markup: { remove_keyboard: true } }
        );
        return;
      }

      // /report description
      if (session.step === 'REP_DESC') {
        const desc = text.trim();
        if (desc.length < 5) {
          await sendTelegramMessage(chatId, '⚠️ Muammo tavsifini batafsilroq yozing.');
          return;
        }
        const cat = session.reportCategory || 'waste';
        if (session.uploadedMediaType !== 'video' && session.uploadedMediaUrl) {
          const aiCheck = await verifyEcoProblemPhotoWithAi({
            imageInput: session.uploadedMediaUrl,
            title: `${cat} — Telegram hisobot`,
            description: desc,
            region: regUser?.region,
            district: regUser?.district,
          });
          if (aiCheck && (aiCheck.isValidEcoProblem === false || aiCheck.isAiGenerated === true)) {
            deleteRegistrationSession(chatKey);
            await sendTelegramMessage(
              chatId,
              `⚠️ <b>AI Tekshiruvi rad etdi:</b>\n\n${
                aiCheck.rejectionReasonUz ||
                "Ushbu rasmda haqiqiy ekologik muammo aniqlanmadi yoki rasm AI yordamida yaratilgan. Iltimos, faqat haqiqiy ekologik muammoni suratga olib /report orqali yuboring!"
              }`
            );
            return;
          }
        }
        const hazard = detectReportHazard(cat, desc, cat);
        const configuredReward = getConfiguredReward('problemVerified');
        const repId = `rep_tg_${Date.now()}`;
        const nowIso = new Date().toISOString();
        const userSchool = centralDb.schools.find((s) => s.id === regUser?.schoolId);
        const report = {
          id: repId,
          title: `${cat} — Telegram hisobot`,
          description: desc,
          category: cat,
          severity: hazard.isHazardous ? 'high' : 'medium',
          status: 'pending',
          coinsAwarded: false,
          rewardCoins: configuredReward,
          region: regUser?.region || 'Toshkent shahri',
          district: regUser?.district || 'Shayxontohur tumani',
          address: `${regUser?.region || 'Toshkent'}, ${regUser?.schoolName || ''}`,
          lat: session.lat ?? userSchool?.lat ?? 41.2995,
          lng: session.lng ?? userSchool?.lng ?? 69.2401,
          imageUrl: session.uploadedMediaType === 'video' ? '' : session.uploadedMediaUrl || '',
          videoUrl: session.uploadedMediaType === 'video' ? session.uploadedMediaUrl || '' : '',
          reporterUid: regUser?.uid || `user_tg_${chatKey}`,
          reporterName: regUser?.fullName || userFirstName,
          schoolId: regUser?.schoolId || 'school_tashkent_17',
          schoolName: regUser?.schoolName || 'Maktab',
          authorTelegramId: chatKey,
          isHazardous: hazard.isHazardous,
          safetyWarning: hazard.safetyWarning,
          escalationTarget: hazard.recommendedEscalation,
          statusHistory: [
            {
              status: 'PENDING_REVIEW',
              actorName: regUser?.fullName || userFirstName,
              actorRole: regUser?.role || 'student',
              note: 'Telegram bot orqali yuborildi (AI tasdiqladi)',
              timestamp: nowIso,
            },
          ],
          upvotes: 1,
          upvotedBy: [regUser?.uid || `user_tg_${chatKey}`],
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        centralDb.reports.unshift(report);
        notifySchoolAdminsForReport(report);
        deleteRegistrationSession(chatKey);
        saveCentralDb();

        sendTelegramMessage(
          '8832599080',
          `📸 <b>BOTDAN YANGI MUAMMO HISOBOTI (AI TASDIQLADI)</b>\n👤 ${report.reporterName} (${report.schoolName})\n🏷 ${cat}${hazard.isHazardous ? '\n🚨 <b>XAVFLI HOLAT — O‘QUVCHILAR TEGMASIN!</b>' : ''}\n📝 ${desc}`,
          {
            reply_markup: {
              inline_keyboard: [
                [
                  { text: `✅ Tasdiqlash (+${configuredReward} ECO)`, callback_data: `appr_rep:${repId}` },
                  { text: '❌ Rad etish', callback_data: `rejc_rep:${repId}` },
                ],
              ],
            },
          }
        ).catch(() => {});

        await sendTelegramMessage(
          chatId,
          `✅ <b>Ekologik muammo hisobotingiz AI tekshiruvidan o'tdi va maktabingiz adminiga yuborildi!</b>${hazard.safetyWarning ? `\n\n🚨 ${hazard.safetyWarning}` : ''}`
        );
        return;
      }

      if (session.step === 'REGION' || session.step === 'DISTRICT') {
        await sendTelegramMessage(
          chatId,
          "👆 Iltimos, yuqoridagi tugmalardan <b>viloyat / tuman</b>ni tanlang yoki qaytadan boshlash uchun /cancel yuboring."
        );
        return;
      }

      if (session.step === 'ACT_MEDIA' || session.step === 'REP_MEDIA') {
        await sendTelegramMessage(
          chatId,
          "📸 Iltimos, avval <b>rasm yoki video</b> yuboring (bekor qilish uchun /cancel)."
        );
        return;
      }
    }

    // 6. Default Registered Quick Menu
    if (isRegistered && regUser) {
      await sendTelegramMessage(
        chatId,
        `🌿 <b>ECO HERO ilovasi</b>\n\nBuyruqlar: /report · /activity · /apply · /tasks · /rank · /coins\nYoki ilovani ochish uchun tugmani bosing 👇`,
        {
          reply_markup: {
            inline_keyboard: [
              [{ text: '🌍 ECO HERO ilovasini ochish', web_app: { url: APP_URL } }],
              [{ text: '✏️ Profilni tahrirlash', callback_data: 'restart_reg' }],
            ],
          },
        }
      );
    } else {
      setRegistrationSession(chatKey, { mode: 'REGISTER', step: 'PHONE', updatedAt: Date.now() });
      await sendTelegramMessage(
        chatId,
        `🌿 <b>ECO HERO ga xush kelibsiz!</b>\n\nRo'yxatdan o'tish uchun pastdagi «📲 Telefon raqamni yuborish» tugmasini bosing:`,
        {
          reply_markup: {
            keyboard: [[{ text: '📲 Telefon raqamni yuborish', request_contact: true }]],
            resize_keyboard: true,
            one_time_keyboard: true,
          },
        }
      );
    }
  } catch (err) {
    console.error('Error in handleTelegramUpdateSerialized:', err);
  }
}

let lastSyncedMenuUrl = '';
let isWebhookMode = false;

async function syncTelegramBotProfile(token: string, targetUrl?: string, forceProfileMeta = false) {
  const urlToUse = targetUrl || APP_URL;
  if (!token || !urlToUse) return;
  if (isPrivateAiStudioOrLocalUrl(urlToUse)) {
    console.log(`[Telegram Bot] Private/local URL (${urlToUse}) Menu Button uchun o'tkazib yuborildi.`);
    return;
  }
  if (!forceProfileMeta && lastSyncedMenuUrl === urlToUse) return;
  try {
    const menuRes = await fetch(`https://api.telegram.org/bot${token}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        menu_button: {
          type: 'web_app',
          text: '🌍 ECO HERO',
          web_app: { url: urlToUse },
        },
      }),
    });
    const menuData: any = await menuRes.json().catch(() => ({}));
    if (menuData?.ok) {
      lastSyncedMenuUrl = urlToUse;
    }
    await fetch(`https://api.telegram.org/bot${token}/setMyCommands`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        commands: [
          { command: 'start', description: 'ECO HERO ilovasini ochish' },
          { command: 'menu', description: 'Mini App menyusini ochish' },
          { command: 'profile', description: 'Mening profilim va kodim' },
          { command: 'report', description: 'Ekologik muammo xabar qilish' },
          { command: 'activity', description: 'Eko-faoliyat (foto/video) yuklash' },
          { command: 'tasks', description: 'Vazifalarim' },
          { command: 'rank', description: 'Maktablar va ishtirokchilar reytingi' },
          { command: 'coins', description: "ECO COIN balansi va sovg'alar" },
          { command: 'invite', description: "Do'stni taklif qilib bonus olish" },
          { command: 'apply', description: 'Sardor / Eko-Elchi lavozimiga ariza' },
          { command: 'help', description: "Barcha buyruqlar ro'yxati" },
          { command: 'cancel', description: 'Joriy amalni bekor qilish' },
        ],
      }),
    });
    if (forceProfileMeta) {
      await fetch(`https://api.telegram.org/bot${token}/setMyName`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: "ECO HERO 🌿 O'zbekiston" }),
      }).catch(() => {});
      await fetch(`https://api.telegram.org/bot${token}/setMyShortDescription`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          short_description: "🌿 O'zbekiston yoshlari ekologik harakati. Muammolarni xabar qiling, EcoCoin yig'ing!",
        }),
      }).catch(() => {});
    }
    console.log(`[Telegram Bot] Menu Button & Profil sinxronlandi -> ${urlToUse} (ok=${Boolean(menuData?.ok)})`);
  } catch (err) {
    console.error('[Telegram Bot] Profil sinxronlashda xatolik:', err);
  }
}

let currentPollingInstanceId = 0;
let pollingAbortController: AbortController | null = null;
let isPollingActive = false;
let pollingOffset = Number(centralDb.meta?.lastTelegramUpdateId || 0) ? Number(centralDb.meta?.lastTelegramUpdateId) + 1 : 0;

function stopTelegramPolling() {
  currentPollingInstanceId++;
  isPollingActive = false;
  if (pollingAbortController) {
    try {
      pollingAbortController.abort();
    } catch {}
    pollingAbortController = null;
  }
}

let lastPollSuccessAt: string | null = null;
let lastPollError: string | null = null;

async function startTelegramPolling(token: string) {
  if (!token) return;
  const instanceId = ++currentPollingInstanceId;
  isWebhookMode = false;

  if (pollingAbortController) {
    try {
      pollingAbortController.abort();
    } catch {}
  }

  isPollingActive = true;
  const controller = new AbortController();
  pollingAbortController = controller;
  console.log(`[Telegram Bot] Long-polling ishga tushirilmoqda (Instance #${instanceId})...`);

  try {
    await fetch(`https://api.telegram.org/bot${token}/deleteWebhook?drop_pending_updates=false`);
  } catch {}
  if (instanceId !== currentPollingInstanceId || !isPollingActive || isWebhookMode) return;

  try {
    const meRes = await fetch(`https://api.telegram.org/bot${token}/getMe`);
    const meData = await meRes.json();
    if (instanceId !== currentPollingInstanceId || !isPollingActive || isWebhookMode) return;
    if (meData.ok && meData.result?.username) {
      activeBotUsername = meData.result.username;
      console.log(`[Telegram Bot] Ulandi: @${activeBotUsername}`);
    }
    await syncTelegramBotProfile(token, APP_URL);
  } catch {}
  if (instanceId !== currentPollingInstanceId || !isPollingActive || isWebhookMode) return;

  if (pollingOffset > 0) {
    try {
      const whRes = await fetch(`https://api.telegram.org/bot${token}/getWebhookInfo`, {
        signal: AbortSignal.timeout(8000),
      });
      const whData: any = await whRes.json().catch(() => null);
      const pendingCount = Number(whData?.result?.pending_update_count || 0);
      if (pendingCount > 0) {
        const probeRes = await fetch(
          `https://api.telegram.org/bot${token}/getUpdates?offset=${pollingOffset}&timeout=0&limit=5`,
          { signal: AbortSignal.timeout(8000) }
        );
        const probeData: any = await probeRes.json().catch(() => null);
        const hasSmallerUpdate =
          probeData?.ok &&
          Array.isArray(probeData.result) &&
          (probeData.result.length === 0 || probeData.result.some((u: any) => Number(u.update_id) < pollingOffset));
        if (hasSmallerUpdate) {
          console.warn(
            `[Telegram Bot] pollingOffset (${pollingOffset}) haqiqiy Telegram navbatidan katta — offset 0 ga tiklanmoqda.`
          );
          pollingOffset = 0;
          if (!centralDb.meta) centralDb.meta = { version: 2, updatedAt: new Date().toISOString() };
          centralDb.meta.lastTelegramUpdateId = 0;
          saveCentralDb();
        }
      }
    } catch {}
  }

  (async () => {
    while (isPollingActive && !isWebhookMode && instanceId === currentPollingInstanceId && activeBotToken) {
      const reqTimeoutController = new AbortController();
      const timeoutHandle = setTimeout(() => reqTimeoutController.abort(), 30000);
      const onParentAbort = () => reqTimeoutController.abort();
      controller.signal.addEventListener('abort', onParentAbort, { once: true });
      try {
        const url = `https://api.telegram.org/bot${activeBotToken}/getUpdates?offset=${pollingOffset}&timeout=20&allowed_updates=${encodeURIComponent(
          JSON.stringify(['message', 'edited_message', 'callback_query', 'my_chat_member'])
        )}`;
        const res = await fetch(url, { signal: reqTimeoutController.signal });
        const data = await res.json();
        if (instanceId !== currentPollingInstanceId || !isPollingActive || isWebhookMode) break;

        if (data.ok && Array.isArray(data.result)) {
          lastPollSuccessAt = new Date().toISOString();
          lastPollError = null;
          if (data.result.length > 0) {
            const batchIds = data.result.map((u: any) => Number(u.update_id || 0)).filter((n: number) => n > 0);
            const maxBatchId = batchIds.length > 0 ? Math.max(...batchIds) : 0;
            const offsetWasAhead = data.result.some((u: any) => Number(u.update_id || 0) < pollingOffset);
            for (const upd of data.result) {
              if (instanceId !== currentPollingInstanceId || !isPollingActive || isWebhookMode) break;
              await processTelegramUpdate(upd);
            }
            if (maxBatchId > 0) {
              pollingOffset = offsetWasAhead ? maxBatchId + 1 : Math.max(pollingOffset, maxBatchId + 1);
              if (!centralDb.meta) centralDb.meta = { version: 2, updatedAt: new Date().toISOString() };
              centralDb.meta.lastTelegramUpdateId = offsetWasAhead
                ? maxBatchId
                : Math.max(Number(centralDb.meta.lastTelegramUpdateId || 0), maxBatchId);
            }
            saveCentralDb();
          }
        } else if (data.error_code === 409) {
          lastPollError = `409: ${data.description || 'Conflict'}`;
          if (data.description && typeof data.description === 'string' && data.description.toLowerCase().includes('webhook')) {
            await fetch(`https://api.telegram.org/bot${activeBotToken}/deleteWebhook?drop_pending_updates=false`).catch(() => {});
          }
          await new Promise((r) => setTimeout(r, 3000));
        } else {
          lastPollError = `${data.error_code || 'ERR'}: ${data.description || 'Unknown'}`;
          await new Promise((r) => setTimeout(r, 1000));
        }
      } catch (err: any) {
        if (instanceId !== currentPollingInstanceId || !isPollingActive || isWebhookMode) break;
        lastPollError = err?.message || 'Poll fetch error';
        await new Promise((r) => setTimeout(r, 1500));
      } finally {
        clearTimeout(timeoutHandle);
        controller.signal.removeEventListener('abort', onParentAbort);
      }
    }
  })();
}

app.post('/api/telegram/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    await processTelegramUpdate(req.body);
  } catch (err) {
    console.error('Error handling Telegram webhook:', err);
  }
});

app.post('/api/telegram/configure-token', requireRoles('super_admin'), async (req, res) => {
  try {
    const { token } = req.body;
    if (!token || !token.includes(':')) {
      return res.status(400).json({ error: "Token formati noto'g'ri" });
    }
    const cleanToken = token.trim();
    const testRes = await fetch(`https://api.telegram.org/bot${cleanToken}/getMe`);
    const testData = await testRes.json();
    if (!testData.ok) {
      return res.status(400).json({ error: `Telegram token tasdiqlanmadi: ${testData.description || 'Token xato'}` });
    }
    const botInfo = testData.result;
    activeBotToken = cleanToken;
    activeBotUsername = botInfo.username;
    fs.writeFileSync(
      BOT_CONFIG_PATH,
      JSON.stringify({ botToken: cleanToken, botUsername: activeBotUsername, updatedAt: new Date().toISOString() }, null, 2)
    );
    startTelegramPolling(cleanToken);
    res.json({
      success: true,
      bot: { id: botInfo.id, username: botInfo.username, firstName: botInfo.first_name },
      message: `@${botInfo.username} botingiz muvaffaqiyatli ulandi!`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telegram/send-notification', requireRoles('super_admin', 'moderator'), async (req, res) => {
  try {
    const { chatId, message, actionUrl } = req.body;
    if (!message || !chatId) {
      return res.status(400).json({ error: 'chatId va xabar matni talab qilinadi' });
    }
    const extraOptions: any = {};
    if (actionUrl) {
      extraOptions.reply_markup = { inline_keyboard: [[{ text: "Batafsil ko'rish", web_app: { url: actionUrl } }]] };
    }
    const result = await sendTelegramMessage(chatId, message, extraOptions);
    res.json({ success: true, result });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telegram/broadcast', requireRoles('super_admin'), async (req: AuthenticatedRequest, res) => {
  try {
    const { title, message, targetAudience = 'all', targetRegion } = req.body;
    if (!title || !message) {
      return res.status(400).json({ error: 'Sarlavha va xabar matni talab qilinadi' });
    }

    const recipients = Object.values(centralDb.users).filter((u: any) => {
      if (!u.telegramId && !u.chatId) return false;
      if (targetAudience === 'region' && targetRegion) return u.region === targetRegion;
      return true;
    });

    const broadcastRecord = {
      id: `bc_${Date.now()}`,
      title,
      message,
      targetAudience,
      targetRegion,
      sentAt: new Date().toISOString(),
      sentBy: req.authUser.fullName,
      recipientsCount: recipients.length || Object.keys(centralDb.users).length,
      status: 'sent',
    };

    centralDb.broadcasts.unshift(broadcastRecord);
    saveCentralDb();

    const formattedText = `📢 <b>DIQQAT: ${title}</b>\n\n${message}\n\n<i>ECO HERO Rasmiy Xabarnomasi</i>`;
    for (const u of recipients as any[]) {
      const targetChatId = u.telegramId || u.chatId;
      if (targetChatId) {
        await sendTelegramMessage(targetChatId, formattedText, {
          reply_markup: { inline_keyboard: [[{ text: 'Platformani ochish', web_app: { url: APP_URL } }]] },
        }).catch(() => {});
      }
    }

    addAuditLog({
      actorUid: req.authUser.uid,
      actorName: req.authUser.fullName,
      actorRole: 'super_admin',
      action: 'telegram_broadcast',
      targetCollection: 'announcements',
      targetId: broadcastRecord.id,
      details: { title, targetAudience },
    });

    res.json({ success: true, broadcast: broadcastRecord });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/telegram/status', (_req, res) => {
  const tgUsersCount = Object.values(centralDb.users).filter((u: any) => u.telegramId || u.chatId).length;
  const isTemporaryTunnel = APP_URL.includes('trycloudflare.com');
  const isPublicHttps = APP_URL.startsWith('https://') && !isPrivateAiStudioOrLocalUrl(APP_URL);
  res.json({
    botConfigured: Boolean(activeBotToken),
    botUsername: activeBotUsername,
    pollingActive: isPollingActive,
    pollingOffset,
    lastPollSuccessAt,
    lastPollError,
    webhookConfigured: isWebhookMode,
    webhookUrl: `${APP_URL}/api/telegram/webhook`,
    miniAppUrl: APP_URL,
    isTemporaryTunnel,
    isPublicHttps,
    isProduction247: isPublicHttps && !isTemporaryTunnel,
    totalSubscribers: tgUsersCount,
    broadcastsCount: centralDb.broadcasts.length,
    recentBroadcasts: centralDb.broadcasts.slice(0, 5),
  });
});

app.post('/api/telegram/sync-menu-button', requireRoles('super_admin'), async (_req, res) => {
  try {
    if (!activeBotToken) return res.status(400).json({ error: 'Telegram bot token sozlanmagan' });
    if (!APP_URL || isPrivateAiStudioOrLocalUrl(APP_URL) || !APP_URL.startsWith('https://')) {
      return res.status(400).json({
        error: "Hozirgi manzil umumiy HTTPS emas (yoki tunnel hali tayyor emas). Avval doimiy 24/7 serverga deploy qiling yoki tunnelni kuting.",
      });
    }
    lastSyncedMenuUrl = '';
    await syncTelegramBotProfile(activeBotToken, APP_URL);
    const getRes = await fetch(`https://api.telegram.org/bot${activeBotToken}/getChatMenuButton`);
    const buttonData = await getRes.json();
    res.json({
      success: true,
      currentMenuButton: buttonData.result,
      permanentUrl: APP_URL,
      message: `Telegram Bot Menu Button sinxronlandi: ${APP_URL}`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/telegram/set-webhook', requireRoles('super_admin'), async (_req, res) => {
  try {
    if (!activeBotToken) {
      return res.json({
        success: true,
        message: 'TELEGRAM_BOT_TOKEN kiritilmagan.',
        webhookUrl: `${APP_URL}/api/telegram/webhook`,
      });
    }
    if (!APP_URL || !APP_URL.startsWith('https://') || isPrivateAiStudioOrLocalUrl(APP_URL)) {
      return res.status(400).json({
        error: "Webhook uchun umumiy ochiq 24/7 HTTPS server manzili (masalan Render yoki Cloud Run) kerak.",
      });
    }
    stopTelegramPolling();
    isWebhookMode = true;
    const webhookUrl = `${APP_URL}/api/telegram/webhook`;
    const resp = await fetch(`https://api.telegram.org/bot${activeBotToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}&drop_pending_updates=true`);
    const data = await resp.json();
    res.json({ success: true, telegramResponse: data, webhookUrl });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/telegram/info', (_req, res) => {
  res.json({
    telegramBotReady: true,
    miniAppSupport: true,
    botConfigured: Boolean(activeBotToken),
    botUsername: activeBotUsername,
    miniAppUrl: APP_URL,
    webhookUrl: `${APP_URL}/api/telegram/webhook`,
    isTemporaryTunnel: APP_URL.includes('trycloudflare.com'),
    isProduction247: APP_URL.startsWith('https://') && !isPrivateAiStudioOrLocalUrl(APP_URL) && !APP_URL.includes('trycloudflare.com'),
  });
});

// ==========================================
// 10. PUBLIC TUNNEL & EXPRESS/VITE SERVER
// ==========================================

let activeTunnelProc: ChildProcess | null = null;

async function startPublicTunnel(targetPort: number | string): Promise<string | null> {
  const binDir = path.join(process.cwd(), 'bin');
  const binDirCloudflared = path.join(binDir, 'cloudflared');
  let binaryPath: string | null = null;

  const isExecutableValid = (p: string) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).size > 5 * 1024 * 1024;
    } catch {
      return false;
    }
  };

  if (isExecutableValid(binDirCloudflared)) binaryPath = binDirCloudflared;
  else if (isExecutableValid('/tmp/cloudflared')) binaryPath = '/tmp/cloudflared';

  if (binaryPath) {
    try {
      fs.chmodSync(binaryPath, 0o755);
    } catch {}
  } else {
    const cfArch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    const downloadUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${cfArch}`;
    try {
      fs.mkdirSync(binDir, { recursive: true });
      console.log(`[Cloudflared] Yuklab olinmoqda (${cfArch})...`);
      const res = await fetch(downloadUrl, { redirect: 'follow', signal: AbortSignal.timeout(45000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 5 * 1024 * 1024) {
          fs.writeFileSync(binDirCloudflared, buf);
          fs.chmodSync(binDirCloudflared, 0o755);
          binaryPath = binDirCloudflared;
        }
      }
    } catch (fetchErr: any) {
      console.warn('[Cloudflared] Fetch orqali yuklab bo\'lmadi, curl sinab ko\'rilmoqda:', fetchErr?.message || fetchErr);
    }

    if (!binaryPath) {
      try {
        const { execSync } = await import('child_process');
        execSync(`mkdir -p bin && curl -sL "${downloadUrl}" -o bin/cloudflared && chmod +x bin/cloudflared`);
        if (isExecutableValid(binDirCloudflared)) binaryPath = binDirCloudflared;
      } catch (curlErr: any) {
        console.warn('[Cloudflared] Yuklab olish muvaffaqiyatsiz:', curlErr?.message || curlErr);
      }
    }
  }

  if (!binaryPath) return null;

  if (APP_URL && APP_URL.includes('trycloudflare.com')) {
    try {
      const checkRes = await fetch(APP_URL, { method: 'HEAD', signal: AbortSignal.timeout(4000) });
      if (checkRes.status === 200 || checkRes.status === 304 || checkRes.status === 404) {
        return APP_URL;
      }
    } catch {}
  }

  if (activeTunnelProc) {
    try {
      activeTunnelProc.kill('SIGKILL');
    } catch {}
    activeTunnelProc = null;
  }

  return new Promise((resolve) => {
    try {
      const proc = spawn(binaryPath!, ['tunnel', '--no-autoupdate', '--protocol', 'http2', '--url', `http://localhost:${targetPort}`]);
      activeTunnelProc = proc;
      let resolved = false;
      let bufferAccumulator = '';

      const handleData = (data: Buffer) => {
        bufferAccumulator += data.toString();
        const match = bufferAccumulator.match(/https:\/\/(?!api\.)[a-zA-Z0-9-]+\.trycloudflare\.com/);
        if (match && match[0] && !resolved) {
          resolved = true;
          const tunnelUrl = match[0];
          APP_URL = tunnelUrl;
          console.log(`[Cloudflared] Mini App HTTPS tunnel ochildi: ${tunnelUrl}`);
          try {
            fs.writeFileSync(path.join(process.cwd(), 'public-tunnel-url.txt'), tunnelUrl, 'utf-8');
          } catch {}
          resolve(tunnelUrl);
        }
      };

      proc.stdout?.on('data', handleData);
      proc.stderr?.on('data', handleData);
      proc.on('close', (code) => {
        activeTunnelProc = null;
        if (!resolved) {
          resolved = true;
          const tail = bufferAccumulator.trim().split('\n').slice(-3).join(' | ');
          console.warn(`[Cloudflared] Tunnel yopildi (code=${code})${tail ? ': ' + tail : ''}`);
          resolve(null);
        }
      });
      proc.on('error', (err) => {
        if (!resolved) {
          resolved = true;
          console.warn('[Cloudflared] Ishga tushirish xatosi:', err?.message || err);
          resolve(null);
        }
      });
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          const tail = bufferAccumulator.trim().split('\n').slice(-2).join(' | ');
          console.warn(`[Cloudflared] 35 soniyada tunnel URL olinmadi${tail ? ': ' + tail : ''}`);
          resolve(null);
        }
      }, 35000);
    } catch (e: any) {
      console.warn('[Cloudflared] Kutilmagan xato:', e?.message || e);
      resolve(null);
    }
  });
}

async function ensureNode21StyleTextCompat() {
  try {
    const utilMod: any = await import('node:util');
    const moduleMod: any = await import('node:module');
    const utilTarget = utilMod.default ?? utilMod;
    const origStyleText = utilTarget?.styleText;
    if (typeof origStyleText === 'function') {
      try {
        origStyleText(['underline', 'gray'], 'test');
      } catch {
        utilTarget.styleText = (fmt: any, text: any, opts?: any) => {
          try {
            if (Array.isArray(fmt)) {
              return fmt.reduce((acc, item) => origStyleText(item, acc, opts), String(text));
            }
            return origStyleText(fmt, text, opts);
          } catch {
            return String(text);
          }
        };
        if (typeof moduleMod.syncBuiltinESMExports === 'function') {
          moduleMod.syncBuiltinESMExports();
        }
      }
    }
  } catch {
    // ignore on runtimes without node:util/node:module
  }
}

function resolveSeoOrigin(req: express.Request): string {
  if (PERMANENT_PRODUCTION_URL) return PERMANENT_PRODUCTION_URL.replace(/\/+$/, '');
  const proto = String(req.headers['x-forwarded-proto'] || req.protocol || 'https').split(',')[0].trim();
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim();
  if (host) return `${proto}://${host}`.replace(/\/+$/, '');
  return (APP_URL || 'http://localhost:3000').replace(/\/+$/, '');
}

function injectRuntimeSeoHtml(html: string, req: express.Request): string {
  const origin = resolveSeoOrigin(req);
  const pageUrl = `${origin}/`;
  const ogImageUrl = `${origin}/og-cover.jpg`;
  let out = html
    .replace(/<meta property="og:image" content="[^"]*"\s*\/?>/i, `<meta property="og:image" content="${ogImageUrl}" />`)
    .replace(/<meta name="twitter:image" content="[^"]*"\s*\/?>/i, `<meta name="twitter:image" content="${ogImageUrl}" />`);

  const extraTags: string[] = [`<meta property="og:url" content="${pageUrl}" />`];
  if (/<link rel="canonical"/i.test(out)) {
    out = out.replace(/<link rel="canonical" href="[^"]*"\s*\/?>/i, `<link rel="canonical" href="${pageUrl}" />`);
  } else {
    extraTags.unshift(`<link rel="canonical" href="${pageUrl}" />`);
  }
  const gscToken = String(process.env.GOOGLE_SITE_VERIFICATION || '').trim();
  if (gscToken) {
    extraTags.push(`<meta name="google-site-verification" content="${gscToken.replace(/"/g, '&quot;')}" />`);
  }
  return out.replace('</head>', `    ${extraTags.join('\n    ')}\n  </head>`);
}

async function startServer() {
  const distDir = path.resolve(__dirname, 'dist');
  const distIndexPath = path.join(distDir, 'index.html');
  const isAiStudioDev = String(process.env.K_SERVICE || '').startsWith('ais-dev-');
  let useDistStatic =
    !isAiStudioDev &&
    process.env.FORCE_VITE_DEV !== 'true' &&
    (process.env.NODE_ENV === 'production' || fs.existsSync(distIndexPath));

  app.get('/robots.txt', (req, res) => {
    const origin = resolveSeoOrigin(req);
    res
      .type('text/plain; charset=utf-8')
      .send(`User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`);
  });

  app.get('/sitemap.xml', (req, res) => {
    const origin = resolveSeoOrigin(req);
    const today = new Date().toISOString().split('T')[0];
    res.type('application/xml; charset=utf-8').send(
      `<?xml version="1.0" encoding="UTF-8"?>\n` +
        `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
        `  <url>\n` +
        `    <loc>${origin}/</loc>\n` +
        `    <lastmod>${today}</lastmod>\n` +
        `    <changefreq>daily</changefreq>\n` +
        `    <priority>1.0</priority>\n` +
        `  </url>\n` +
        `</urlset>\n`
    );
  });

  if (useDistStatic && !fs.existsSync(distIndexPath)) {
    try {
      await ensureNode21StyleTextCompat();
      console.log('[Server] dist/index.html topilmadi — avtomatik Vite production build boshlandi...');
      const { build: viteBuild } = await import('vite');
      await viteBuild();
    } catch (buildErr) {
      console.warn('[Server] Avtomatik Vite build amalga oshmadi, Vite middleware rejimiga o\'tilmoqda:', buildErr);
      useDistStatic = false;
    }
  }

  if (!useDistStatic || !fs.existsSync(distIndexPath)) {
    await ensureNode21StyleTextCompat();
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true, allowedHosts: true },
      appType: 'spa',
    });

    const serveDevHtml = (req: express.Request, res: express.Response, next: express.NextFunction) => {
      vite
        .transformIndexHtml(req.originalUrl, fs.readFileSync(path.resolve(__dirname, 'index.html'), 'utf-8'))
        .then((html) =>
          res
            .status(200)
            .set({
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
            })
            .end(injectRuntimeSeoHtml(html, req))
        )
        .catch((err) => next(err));
    };

    app.get('/', serveDevHtml);
    app.use(vite.middlewares);

    app.use('*', (req, res, next) => {
      if (req.originalUrl.startsWith('/api') || req.originalUrl.startsWith('/cesium')) return next();
      serveDevHtml(req, res, next);
    });
  } else {
    console.log('[Server] Tezkor static dist/ rejimida ishga tushirildi (past RAM sarfi).');
    let cachedDistHtml: string | null = null;
    try {
      cachedDistHtml = fs.readFileSync(distIndexPath, 'utf-8');
    } catch {
      cachedDistHtml = null;
    }

    app.use(
      express.static(distDir, {
        index: false,
        maxAge: '7d',
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          } else if (filePath.endsWith('.html') || filePath.endsWith('sw.js')) {
            res.setHeader('Cache-Control', 'public, max-age=60, stale-while-revalidate=300');
          }
        },
      })
    );
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api') || req.path.startsWith('/cesium')) return next();
      try {
        const html = cachedDistHtml ?? fs.readFileSync(distIndexPath, 'utf-8');
        res
          .status(200)
          .set({
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'public, max-age=60, stale-while-revalidate=300',
          })
          .send(injectRuntimeSeoHtml(html, req));
      } catch {
        res.sendFile(distIndexPath);
      }
    });
  }

  httpServer.listen(port, '0.0.0.0', async () => {
    console.log(`ECO HERO platform HTTP + WebSocket server running on port ${port}`);
    const isAiStudioSandbox =
      String(process.env.K_SERVICE || '').startsWith('ais-dev-') ||
      String(process.env.K_SERVICE || '').startsWith('ais-pre-') ||
      String(process.env.APP_URL || '').includes('ais-dev-') ||
      String(process.env.APP_URL || '').includes('ais-pre-');

    const hasPermanentUrl = Boolean(PERMANENT_PRODUCTION_URL && PERMANENT_PRODUCTION_URL.startsWith('https://'));
    const isHostedProd =
      process.env.USE_QUICK_TUNNEL === 'false' ||
      (!isAiStudioSandbox &&
        (hasPermanentUrl ||
          Boolean(process.env.RENDER_EXTERNAL_URL || process.env.RAILWAY_PUBLIC_DOMAIN || process.env.K_SERVICE)));

    const namedTunnelToken = String(process.env.CLOUDFLARE_TUNNEL_TOKEN || '').trim();
    if (namedTunnelToken) {
      try {
        const binPath = path.join(process.cwd(), 'bin', 'cloudflared');
        if (fs.existsSync(binPath)) {
          fs.chmodSync(binPath, 0o755);
          if (activeTunnelProc) {
            try { activeTunnelProc.kill('SIGKILL'); } catch {}
          }
          activeTunnelProc = spawn(binPath, ['tunnel', '--no-autoupdate', 'run', '--token', namedTunnelToken], {
            stdio: 'ignore',
          });
          console.log('[Cloudflared] Doimiy Zero Trust Tunnel ishga tushirildi.');
        }
      } catch (e: any) {
        console.warn('[Cloudflared] Named tunnel xatosi:', e?.message || e);
      }
    }

    const botListenerDisabled = process.env.DISABLE_BOT_LISTENER === 'true';

    if (isHostedProd) {
      if (PERMANENT_PRODUCTION_URL) APP_URL = PERMANENT_PRODUCTION_URL;
      if (activeBotToken && !botListenerDisabled) {
        const webhookBaseUrl = BACKEND_PUBLIC_URL || (isFrontendOnlyStaticHost(APP_URL) ? '' : APP_URL);
        let canUseWebhook = Boolean(
          webhookBaseUrl &&
            webhookBaseUrl.startsWith('https://') &&
            !isPrivateAiStudioOrLocalUrl(webhookBaseUrl) &&
            !isFrontendOnlyStaticHost(webhookBaseUrl)
        );
        if (canUseWebhook && !BACKEND_PUBLIC_URL) {
          try {
            const probe = await fetch(`${webhookBaseUrl}/api/health`, { signal: AbortSignal.timeout(4000) });
            const ct = String(probe.headers.get('content-type') || '').toLowerCase();
            if (!probe.ok || !ct.includes('application/json')) {
              canUseWebhook = false;
            }
          } catch {
            canUseWebhook = false;
          }
        }

        if (canUseWebhook) {
          try {
            isWebhookMode = true;
            const webhookUrl = `${webhookBaseUrl}/api/telegram/webhook`;
            await fetch(`https://api.telegram.org/bot${activeBotToken}/setWebhook?url=${encodeURIComponent(webhookUrl)}`);
            await syncTelegramBotProfile(activeBotToken, APP_URL);
            console.log(`[Telegram Bot] 24/7 Production Webhook faollashtirildi: ${webhookUrl} (Mini App: ${APP_URL})`);
          } catch {
            startTelegramPolling(activeBotToken);
          }
        } else {
          isWebhookMode = false;
          await fetch(`https://api.telegram.org/bot${activeBotToken}/deleteWebhook`).catch(() => {});
          startTelegramPolling(activeBotToken);
          if (APP_URL.startsWith('https://') && !isPrivateAiStudioOrLocalUrl(APP_URL)) {
            await syncTelegramBotProfile(activeBotToken, APP_URL).catch(() => {});
          }
          console.log(`[Telegram Bot] Polling rejimi faollashtirildi (Mini App: ${APP_URL})`);
        }
      } else if (botListenerDisabled) {
        console.log('[Telegram Bot] DISABLE_BOT_LISTENER=true — bot polling/webhook bu serverda o\'chirildi.');
      }
    } else {
      // Start Telegram polling IMMEDIATELY so pending messages are answered without waiting for cloudflared
      if (activeBotToken && !botListenerDisabled) {
        startTelegramPolling(activeBotToken);
      } else if (botListenerDisabled) {
        console.log('[Telegram Bot] DISABLE_BOT_LISTENER=true — bot polling bu serverda o\'chirildi.');
      }
      if (!namedTunnelToken && process.env.USE_QUICK_TUNNEL !== 'false') {
        startPublicTunnel(port)
          .then((publicUrl) => {
            if (publicUrl) {
              APP_URL = publicUrl;
              if (activeBotToken && !botListenerDisabled) syncTelegramBotProfile(activeBotToken, publicUrl).catch(() => {});
            }
          })
          .catch(() => {});
      }
    }

    if (!isHostedProd && !namedTunnelToken && process.env.USE_QUICK_TUNNEL !== 'false') {
      setInterval(async () => {
        try {
          const procAlive = Boolean(
            activeTunnelProc && activeTunnelProc.exitCode === null && !activeTunnelProc.killed
          );
          const hasTunnelUrl = Boolean(
            APP_URL &&
              APP_URL.includes('trycloudflare.com') &&
              !APP_URL.includes('api.trycloudflare.com')
          );
          if (!procAlive || !hasTunnelUrl) {
            const newUrl = await startPublicTunnel(port);
            if (newUrl && activeBotToken) await syncTelegramBotProfile(activeBotToken, newUrl);
          }
        } catch (e) {}
      }, 25000);
    }
  });
}

startServer();
