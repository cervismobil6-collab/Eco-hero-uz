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
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import QRCode from 'qrcode';
import { computeUserStreakState, getUzbekistanDateKey } from './src/utils/streak';
import { calculateLevelFromXp } from './src/utils/level';
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
  getDistrictLiveParticipantCount,
  computeLiveMetrics,
  getCurrentWeekWindow,
  createDefaultWeeklyChallenge,
  SchoolStudentRatingConfig,
  DistrictStudentRatingConfig,
  removeDeletedId,
  getPersistentDataDir,
  mergeUserAccounts,
  resolveCanonicalUid,
  phoneMatchKey,
  syncUserStatsConsistency,
  isSyntheticEmail,
  reconcileSchoolsAndStudents,
  mergeDatabaseSnapshotNonDestructive,
  exportCompactBackupSnapshot,
  getDetectedBotUsersReport,
} from './server-db';
import {
  fetchAllCatalogFromFirestoreRest,
  upsertCatalogDocToFirestoreRest,
  deleteCatalogDocFromFirestoreRest,
  mergeCatalogListWithFirestore,
  fetchSchoolsFromFirestoreRest,
} from './server-firestore';
import {
  attachAuthUser,
  requireAuth,
  requireRoles,
  hasAnyRole,
  checkIsSuperAdmin,
  isSuperAdminTelegramId,
  getSuperAdminTelegramIdList,
  hashPassword,
  verifyPassword,
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

const PERSISTENT_DATA_DIR = getPersistentDataDir();
const HAS_EXTERNAL_DATA_DIR = Boolean(
  String(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || '').trim()
);
const LEGACY_PUBLIC_UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
const UPLOADS_DIR = HAS_EXTERNAL_DATA_DIR
  ? path.join(PERSISTENT_DATA_DIR, 'uploads')
  : LEGACY_PUBLIC_UPLOADS_DIR;
try {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
  if (UPLOADS_DIR !== LEGACY_PUBLIC_UPLOADS_DIR && fs.existsSync(LEGACY_PUBLIC_UPLOADS_DIR)) {
    for (const entry of fs.readdirSync(LEGACY_PUBLIC_UPLOADS_DIR, { withFileTypes: true })) {
      if (!entry.isFile()) continue;
      const src = path.join(LEGACY_PUBLIC_UPLOADS_DIR, entry.name);
      const dst = path.join(UPLOADS_DIR, entry.name);
      if (!fs.existsSync(dst)) {
        try {
          fs.copyFileSync(src, dst);
        } catch {}
      }
    }
  }
  console.log(`[Storage] Uploads directory active: ${UPLOADS_DIR}`);
} catch (dirErr: any) {
  console.error(`[Storage] Failed to initialize uploads directory (${UPLOADS_DIR}):`, dirErr?.message || dirErr);
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
app.set('trust proxy', 1);
const httpServer = http.createServer(app);
const port = Number(process.env.PORT || process.env.SERVER_PORT) || 3000;

interface ConnectedWsClient {
  ws: WebSocket;
  uid: string;
  role: string;
  approvedRoles: string[];
  region: string;
  district: string;
  schoolId: string;
  isSuperAdmin: boolean;
  isPublicReadOnly?: boolean;
}

const chatWss = new WebSocketServer({ noServer: true });
const wsClients = new Set<ConnectedWsClient>();

app.use(
  helmet({
    xFrameOptions: false,
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: [
          "'self'",
          "'unsafe-inline'",
          "'unsafe-eval'",
          'https://maps.googleapis.com',
          'https://*.googleapis.com',
          'https://telegram.org',
          'https://apis.google.com',
          'https://www.gstatic.com',
          'https://cesium.com',
          'https://*.cesium.com',
          'blob:',
        ],
        workerSrc: ["'self'", 'blob:', 'data:'],
        styleSrc: [
          "'self'",
          "'unsafe-inline'",
          'https://fonts.googleapis.com',
          'https://unpkg.com',
          'https://cesium.com',
          'https://*.cesium.com',
        ],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
        fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
        connectSrc: ["'self'", 'https:', 'wss:', 'ws:', 'blob:', 'data:'],
        frameSrc: [
          "'self'",
          'https://*.firebaseapp.com',
          'https://accounts.google.com',
          'https://oauth.telegram.org',
          'https://telegram.org',
        ],
        frameAncestors: [
          "'self'",
          'https://*.telegram.org',
          'https://telegram.org',
          'https://aistudio.google.com',
          'https://studio.google.com',
          'https://*.google.com',
          'https://*.usercontent.goog',
          'https://*.googleusercontent.com',
        ],
        mediaSrc: ["'self'", 'data:', 'blob:', 'https:', 'http:'],
        objectSrc: ["'none'"],
        baseUri: ["'self'"],
        upgradeInsecureRequests: null,
      },
    },
  })
);

app.use(
  compression({
    threshold: 512,
    filter: (req, res) => {
      const accept = String(req.headers.accept || '');
      if (
        accept.includes('text/event-stream') ||
        req.path.includes('/stream') ||
        req.path.startsWith('/uploads/')
      ) {
        return false;
      }
      return compression.filter(req, res);
    },
  })
);

const standardJsonParser = express.json({ limit: '2mb' });
const largeMediaJsonParser = express.json({ limit: '75mb' });
const LARGE_MEDIA_JSON_PATHS = new Set([
  '/api/storage/upload',
  '/api/reports/submit',
  '/api/media',
  '/api/ai/analyze-problem',
  '/api/ai/eco-assistant',
  '/api/ai/eco-assistant/stream',
]);

app.use((req, res, next) => {
  if (req.path === '/api/storage/upload-binary') {
    return next();
  }
  const isLargeMediaRoute =
    LARGE_MEDIA_JSON_PATHS.has(req.path) ||
    /^\/api\/reports\/[^/]+\/(workflow|ambassador-resolve)$/.test(req.path) ||
    /^\/api\/missions\/[^/]+\/submit$/.test(req.path);
  return (isLargeMediaRoute ? largeMediaJsonParser : standardJsonParser)(req, res, next);
});
app.use('/uploads', express.static(UPLOADS_DIR, { maxAge: '7d', acceptRanges: true }));
if (UPLOADS_DIR !== LEGACY_PUBLIC_UPLOADS_DIR) {
  app.use('/uploads', express.static(LEGACY_PUBLIC_UPLOADS_DIR, { maxAge: '7d', acceptRanges: true }));
}
app.use(
  '/cesium',
  express.static(path.resolve(__dirname, 'node_modules/cesium/Build/Cesium'), {
    maxAge: '7d',
  })
);
app.get('/.well-known/assetlinks.json', (_req, res) => {
  const assetLinksPath = path.join(process.cwd(), 'public', '.well-known', 'assetlinks.json');
  const distAssetLinksPath = path.resolve(__dirname, 'dist', '.well-known', 'assetlinks.json');
  const targetPath = fs.existsSync(assetLinksPath)
    ? assetLinksPath
    : fs.existsSync(distAssetLinksPath)
    ? distAssetLinksPath
    : null;
  if (!targetPath) {
    return res.status(404).type('application/json').send('[]');
  }
  res.setHeader('Cache-Control', 'public, max-age=300');
  return res.status(200).type('application/json').send(fs.readFileSync(targetPath, 'utf-8'));
});
app.use(
  '/.well-known',
  express.static(path.join(process.cwd(), 'public', '.well-known'), {
    dotfiles: 'allow',
    index: false,
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
  if (origin) {
    if (isAllowedCorsOrigin(origin)) {
      res.header('Access-Control-Allow-Origin', origin);
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Vary', 'Origin');
    } else {
      res.header('Vary', 'Origin');
      if (req.method === 'OPTIONS') {
        return res.sendStatus(403);
      }
    }
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

const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  validate: false,
  message: {
    error: "Juda ko'p kirish urinishi. 15 daqiqadan so'ng qayta urinib ko'ring.",
    code: 'RATE_LIMITED',
  },
});

const aiRateLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  validate: false,
  keyGenerator: (req: AuthenticatedRequest) =>
    req.authUser?.uid ? `u:${req.authUser.uid}` : `ip:${req.ip || 'unknown'}`,
  message: {
    error: "AI so'rovlari limiti tugadi. 1 daqiqa kuting.",
    code: 'RATE_LIMITED',
  },
});

const apiGeneralLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  validate: false,
  skip: (req) => req.path === '/health' || req.path === '/telegram/webhook',
  message: {
    error: "So'rovlar soni juda ko'p. Biroz kuting.",
    code: 'RATE_LIMITED',
  },
});

app.use('/api/auth/session', authRateLimiter);
app.use('/api/auth/register-user', authRateLimiter);
app.use('/api/auth/login-user', authRateLimiter);
app.use('/api/auth/telegram-magic-login', authRateLimiter);
app.use('/api/telegram/auth-webapp', authRateLimiter);
app.use('/api/ai', aiRateLimiter);
app.use('/api', apiGeneralLimiter);

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
  const enrichedPayload =
    type === 'db:updated' && payload.liveMetrics === undefined
      ? { ...payload, liveMetrics: computeLiveMetrics() }
      : payload;
  const frame = JSON.stringify({ type, ...enrichedPayload, ts: new Date().toISOString() });
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
  const monthEndTashkentMs = Date.UTC(year, monthIndex + 1, 1, 0, 0, 0);
  const remainingMs = Math.max(0, monthEndTashkentMs - tashkentMs);
  const daysRemainingInMonth = Math.floor(remainingMs / (24 * 3600 * 1000));
  const hoursRemaining = Math.floor((remainingMs % (24 * 3600 * 1000)) / (3600 * 1000));
  const minutesRemaining = Math.floor((remainingMs % (3600 * 1000)) / (60 * 1000));
  const secondsRemaining = Math.floor((remainingMs % (60 * 1000)) / 1000);
  const endsAt = new Date(monthEndTashkentMs - 5 * 3600 * 1000).toISOString();
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
    hoursRemaining,
    minutesRemaining,
    secondsRemaining,
    endsAt,
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

app.get('/api/metrics/live', (_req, res) => {
  try {
    reconcileSchoolsAndStudents(false);
    res.json({
      success: true,
      liveMetrics: computeLiveMetrics(),
      serverNow: new Date().toISOString(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/bot-users', requireRoles('super_admin'), (_req: AuthenticatedRequest, res) => {
  try {
    reconcileSchoolsAndStudents(true);
    const report = getDetectedBotUsersReport();
    res.json({
      success: true,
      ...report,
      liveMetrics: computeLiveMetrics(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/admin/cloud-backup/export', requireRoles('super_admin'), (_req: AuthenticatedRequest, res) => {
  try {
    const snapshot = exportCompactBackupSnapshot();
    res.json({ success: true, snapshot });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/admin/cloud-backup/restore', requireRoles('super_admin'), (req: AuthenticatedRequest, res) => {
  try {
    const rawSnapshot = req.body?.snapshot || req.body;
    const result = mergeDatabaseSnapshotNonDestructive(rawSnapshot);
    if (result.changed) {
      broadcastRealtimeEvent('db:updated', { scope: 'cloud_restore' });
    }
    res.json({
      success: true,
      ...result,
      liveMetrics: computeLiveMetrics(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
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

    const visibleDailyMissions = (centralDb.dailyMissions || []).filter(
      (m: any) => m.status === 'active' || isSuperAdmin
    );
    const visibleDailyMissionSubmissions = !caller
      ? []
      : isSuperAdmin || isModerator
      ? centralDb.dailyMissionSubmissions || []
      : isCaptain
      ? (centralDb.dailyMissionSubmissions || []).filter(
          (s: any) =>
            s.userId === caller.uid ||
            (caller.schoolId && s.schoolId === caller.schoolId) ||
            (caller.schoolName && s.schoolName === caller.schoolName)
        )
      : (centralDb.dailyMissionSubmissions || []).filter((s: any) => s.userId === caller.uid);
    const callerCompletedDailyMissions = caller ? centralDb.dailyMissionCompletions?.[caller.uid] || [] : [];

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
      adWatchState: caller ? buildUserAdWatchState(caller.uid) : null,
      referrals: !caller ? [] : isSuperAdmin ? centralDb.referrals : centralDb.referrals.filter((r) => r.referrerUid === caller.uid),
      broadcasts: isSuperAdmin || isModerator ? centralDb.broadcasts : [],
      auditLogs: isSuperAdmin || isModerator ? centralDb.auditLogs.slice(0, 100) : [],
      notifications: userNotifications,
      homePosts: (centralDb.homePosts || [])
        .filter((p) => {
          if (p.status === 'active') return true;
          return Boolean(caller && isSuperAdmin);
        })
        .sort((a: any, b: any) => {
          if (Boolean(b.isPinned) !== Boolean(a.isPinned)) return b.isPinned ? 1 : -1;
          return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
        }),
      monthlyAwards: centralDb.monthlyAwards || [],
      serverNow: new Date().toISOString(),
      serverDateKey: getUzbekistanDateKey(),
      liveMetrics: computeLiveMetrics(),
      ecoMissions: visibleMissions,
      missionSubmissions: visibleMissionSubmissions,
      missionCompletions: callerCompletedMissions,
      dailyMissions: visibleDailyMissions,
      dailyMissionSubmissions: visibleDailyMissionSubmissions,
      dailyMissionCompletions: callerCompletedDailyMissions,
      weeklyChallenge: buildWeeklyChallengeSummary(caller),
      schoolTeamMission: buildSchoolTeamMissionSummary(caller),
      championshipMeta: buildChampionshipEligibility(caller),
      studentsLeaderboard: sanitizePublicUsersList()
        .sort((a: any, b: any) => (b.totalCoinsEarned || b.ecoCoins || 0) - (a.totalCoinsEarned || a.ecoCoins || 0))
        .slice(0, 50),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

function recordDeletedId(id: string) {
  if (!id) return;
  if (!Array.isArray(centralDb.deletedIds)) centralDb.deletedIds = [];
  if (!centralDb.deletedIds.includes(id)) {
    centralDb.deletedIds.push(id);
  }
}

function getFirebaseTokenFromReq(req: express.Request): string | null {
  const tok = String(req.headers['x-firebase-id-token'] || '').trim();
  return tok && tok.length > 20 ? tok : null;
}

async function hydrateCatalogFromFirestoreOnBoot(): Promise<void> {
  try {
    const [remote, remoteSchools] = await Promise.all([
      fetchAllCatalogFromFirestoreRest(),
      centralDb.schools.length === 0 ? fetchSchoolsFromFirestoreRest() : Promise.resolve([]),
    ]);

    let anyChanged = false;

    if (Array.isArray(remoteSchools) && remoteSchools.length > 0) {
      for (const rs of remoteSchools) {
        if (!rs?.name) continue;
        findOrCreateSchool({
          schoolId: rs.id,
          schoolName: rs.name,
          schoolNumber: rs.number,
          region: rs.region || 'Toshkent shahri',
          district: rs.district || 'Markaziy tumani',
          ambassadorName: rs.ambassadorName,
        });
        anyChanged = true;
      }
    }

    if (remote) {
      const deletedSet = new Set<string>(
        Array.isArray(centralDb.deletedIds) ? centralDb.deletedIds.map(String) : []
      );

      if (remote.missions.length > 0 || remote.tombstones.some((t) => t.collectionName === 'eco_missions')) {
        const mRes = mergeCatalogListWithFirestore(
          centralDb.ecoMissions || [],
          remote.missions,
          remote.tombstones,
          'eco_missions',
          deletedSet
        );
        if (mRes.changed) {
          centralDb.ecoMissions = mRes.merged;
          anyChanged = true;
        }
      }

      if (remote.shopItems.length > 0 || remote.tombstones.some((t) => t.collectionName === 'shopItems')) {
        const sRes = mergeCatalogListWithFirestore(
          centralDb.shopItems || [],
          remote.shopItems,
          remote.tombstones,
          'shopItems',
          deletedSet
        );
        if (sRes.changed) {
          centralDb.shopItems = sRes.merged;
          anyChanged = true;
        }
      }

      if (remote.ecoAds.length > 0 || remote.tombstones.some((t) => t.collectionName === 'eco_ads')) {
        const aRes = mergeCatalogListWithFirestore(
          centralDb.ecoAds || [],
          remote.ecoAds,
          remote.tombstones,
          'eco_ads',
          deletedSet
        );
        if (aRes.changed) {
          centralDb.ecoAds = aRes.merged;
          anyChanged = true;
        }
      }

      if (remote.homePosts.length > 0 || remote.tombstones.some((t) => t.collectionName === 'home_posts')) {
        const hRes = mergeCatalogListWithFirestore(
          centralDb.homePosts || [],
          remote.homePosts,
          remote.tombstones,
          'home_posts',
          deletedSet
        );
        if (hRes.changed) {
          centralDb.homePosts = hRes.merged;
          anyChanged = true;
        }
      }

      if (remote.rewardSettings && remote.rewardSettings.updatedAt) {
        const remoteTs = Date.parse(String(remote.rewardSettings.updatedAt)) || 0;
        const localTs = Date.parse(String(centralDb.rewardSettings?.updatedAt || '')) || 0;
        if (remoteTs > localTs) {
          const { id: _ignoreId, ...rest } = remote.rewardSettings;
          centralDb.rewardSettings = {
            ...centralDb.rewardSettings,
            ...rest,
          };
          anyChanged = true;
        }
      }

      const nextDeleted = Array.from(deletedSet);
      if (nextDeleted.length !== (centralDb.deletedIds || []).length) {
        centralDb.deletedIds = nextDeleted;
        anyChanged = true;
      }
    }

    if (reconcileSchoolsAndStudents(false)) {
      anyChanged = true;
    }

    if (anyChanged) {
      recalculateSchoolRanks();
      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'catalog' });
      console.log('[FirestoreBootSync] Katalog va maktablar Firestore bilan sinxronlandi.');
    }
  } catch (err: any) {
    console.warn('[FirestoreBootSync] Katalog sinxronizatsiyasi o\'tkazib yuborildi:', err?.message || err);
  }
}

function recordBotStarter(
  chatId: string | number,
  username?: string,
  firstName?: string,
  deferSave = false,
  refMeta?: { firstTimeRefEligible?: boolean; firstTimeRefCode?: string }
) {
  const key = String(chatId || '').trim();
  if (!key) return { isNew: false };
  if (!centralDb.botStarters || typeof centralDb.botStarters !== 'object') {
    centralDb.botStarters = {};
  }
  const nowIso = new Date().toISOString();
  const prev = centralDb.botStarters[key];
  const isNew = !prev;
  centralDb.botStarters[key] = {
    chatId: key,
    username: username || prev?.username || '',
    firstName: firstName || prev?.firstName || '',
    startedAt: prev?.startedAt || nowIso,
    lastSeenAt: nowIso,
    ...(refMeta?.firstTimeRefEligible !== undefined
      ? { firstTimeRefEligible: refMeta.firstTimeRefEligible }
      : prev?.firstTimeRefEligible !== undefined
      ? { firstTimeRefEligible: prev.firstTimeRefEligible }
      : {}),
    ...(refMeta?.firstTimeRefCode
      ? { firstTimeRefCode: refMeta.firstTimeRefCode }
      : prev?.firstTimeRefCode
      ? { firstTimeRefCode: prev.firstTimeRefCode }
      : {}),
  };
  if (!deferSave) {
    saveCentralDb();
    if (isNew) {
      broadcastRealtimeEvent('db:updated', { scope: 'metrics' });
    }
  }
  return { isNew };
}

function isUserFullyRegistered(u: any): boolean {
  if (!u || typeof u !== 'object') return false;
  if (checkIsSuperAdmin(u)) return true;
  const hasName = String(u.fullName || '').trim().length >= 2;
  const hasPhone = phoneMatchKey(u.phoneNumber).length >= 9;
  const cleanSchool = String(u.schoolName || '').trim();
  const hasSchool = Boolean(cleanSchool && cleanSchool !== 'Maktab kiritilmagan');
  return Boolean((u.isOnboarded || (hasName && hasPhone && hasSchool)) && hasName && hasPhone && hasSchool);
}

function ensureCurrentWeeklyChallenge() {
  const win = getCurrentWeekWindow();
  if (!centralDb.weeklyChallenge || centralDb.weeklyChallenge.weekKey !== win.weekKey) {
    centralDb.weeklyChallenge = createDefaultWeeklyChallenge();
    saveCentralDb();
  }
  return { challenge: centralDb.weeklyChallenge, win };
}

function computeWeeklyActionsForUser(uid: string, weekKey: string): number {
  const weekStartMs = new Date(`${weekKey}T00:00:00+05:00`).getTime();
  let count = 0;
  for (const tx of centralDb.transactions || []) {
    if (tx.userId === uid && (tx.type === 'earn' || tx.type === 'bonus') && tx.status !== 'rejected') {
      const ts = new Date(tx.createdAt || 0).getTime();
      if (!Number.isNaN(ts) && ts >= weekStartMs) count += 1;
    }
  }
  for (const rep of centralDb.reports || []) {
    if (rep.reporterUid === uid) {
      const ts = new Date(rep.createdAt || 0).getTime();
      if (!Number.isNaN(ts) && ts >= weekStartMs) count += 1;
    }
  }
  for (const med of centralDb.mediaSubmissions || []) {
    if (med.userId === uid) {
      const ts = new Date(med.createdAt || 0).getTime();
      if (!Number.isNaN(ts) && ts >= weekStartMs) count += 1;
    }
  }
  return count;
}

function buildWeeklyChallengeSummary(caller: any | null) {
  const { challenge, win } = ensureCurrentWeeklyChallenge();
  const participantsMap = challenge.participants || {};
  const participantsCount = Object.keys(participantsMap).length;
  const entry = caller ? participantsMap[caller.uid] : null;
  const liveProgress = caller ? computeWeeklyActionsForUser(caller.uid, win.weekKey) : 0;
  if (entry && liveProgress > (entry.progress || 0)) {
    entry.progress = liveProgress;
  }
  const progress = entry ? Math.max(entry.progress || 0, liveProgress) : liveProgress;
  const targetActions = Number(challenge.targetActions) || 3;
  return {
    weekKey: win.weekKey,
    title: challenge.title,
    description: challenge.description,
    targetActions,
    rewardCoins: Number(challenge.rewardCoins) || 250,
    endIso: win.endIso,
    serverNow: new Date().toISOString(),
    daysRemaining: win.daysRemaining,
    hoursRemaining: win.hoursRemaining,
    minutesRemaining: win.minutesRemaining,
    secondsRemaining: win.secondsRemaining,
    participantsCount,
    joined: Boolean(entry),
    progress,
    completed: progress >= targetActions,
    claimed: Boolean(entry?.claimed),
  };
}

function buildSchoolTeamMissionSummary(caller: any | null) {
  recalculateSchoolRanks();
  const school =
    (caller?.schoolId && centralDb.schools.find((s) => s.id === caller.schoolId)) ||
    (caller?.schoolName && centralDb.schools.find((s) => s.name === caller.schoolName)) ||
    centralDb.schools[0] ||
    null;

  if (!school) {
    return {
      schoolId: '',
      schoolName: "Maktab biriktirilmagan",
      membersCount: 0,
      currentXp: 0,
      targetXp: 5000,
      rewardCoins: 300,
      schoolRank: null,
      progressPct: 0,
    };
  }
  const membersCount = getSchoolLiveStudentCount(school);
  const currentXp = Number(school.totalCoins || 0) * 4;
  const targetXp = Math.max(5000, Math.ceil((currentXp + 1500) / 5000) * 5000);
  const progressPct = Math.min(100, Math.round((currentXp / targetXp) * 100));
  return {
    schoolId: school.id,
    schoolName: school.name,
    region: school.region,
    district: school.district,
    membersCount,
    currentXp,
    targetXp,
    rewardCoins: 300,
    schoolRank: school.ratingRank || null,
    progressPct,
  };
}

function getTashkentQuarterStatus(nowDate = new Date()) {
  const tashkentMs = nowDate.getTime() + 5 * 3600 * 1000;
  const tDate = new Date(tashkentMs);
  const year = tDate.getUTCFullYear();
  const monthIndex = tDate.getUTCMonth();
  const quarterEndMonthIndex = Math.floor(monthIndex / 3) * 3 + 2; // 2, 5, 8, 11
  const quarterEndUtc = Date.UTC(year, quarterEndMonthIndex + 1, 1, 0, 0, 0);
  const remainingMs = Math.max(0, quarterEndUtc - tashkentMs);
  const daysRemaining = Math.floor(remainingMs / (24 * 3600 * 1000));
  const hoursRemaining = Math.floor((remainingMs % (24 * 3600 * 1000)) / (3600 * 1000));
  const minutesRemaining = Math.floor((remainingMs % (3600 * 1000)) / (60 * 1000));
  const secondsRemaining = Math.floor((remainingMs % (60 * 1000)) / 1000);
  const endsAt = new Date(quarterEndUtc - 5 * 3600 * 1000).toISOString();
  const quarterNumber = Math.floor(monthIndex / 3) + 1;
  return {
    quarterKey: `${year}-Q${quarterNumber}`,
    daysRemaining,
    hoursRemaining,
    minutesRemaining,
    secondsRemaining,
    endsAt,
  };
}

function buildChampionshipEligibility(caller: any | null) {
  const nowDate = new Date();
  const serverNow = nowDate.toISOString();
  const monthStatus = getTashkentMonthStatus(nowDate);
  const quarterStatus = getTashkentQuarterStatus(nowDate);

  const isPrivileged = Boolean(
    caller && hasAnyRole(caller, ['super_admin', 'moderator', 'regional_coordinator', 'district_coordinator'])
  );

  let callerDistrictRank: number | null = null;
  let callerSchoolDistrictRank: number | null = null;
  let isQualifiedTop3 = false;

  if (caller && caller.district) {
    const distDetails = computeDistrictLeaderboardDetails({
      region: caller.region,
      district: caller.district,
      viewerUid: caller.uid,
      viewerSchoolId: caller.schoolId,
    });
    callerSchoolDistrictRank = distDetails.mySchoolRating?.rank ?? null;

    // Also check individual student ranking in caller's district
    const distStudents = buildDistrictStudentRatingPayload({
      region: caller.region,
      district: caller.district,
      viewerUid: caller.uid,
    });
    callerDistrictRank = distStudents.myEntry?.rank ?? null;

    const awardedTop3District = (centralDb.studentMonthlyAwards || []).some(
      (aw: any) =>
        aw.scope === 'district' &&
        Array.isArray(aw.winners) &&
        aw.winners.some((w: any) => w.uid === caller.uid && Number(w.rank) <= 3)
    );
    const awardedSchoolTop3 = (centralDb.monthlyAwards || []).some(
      (aw: any) =>
        Array.isArray(aw.topSchools) &&
        aw.topSchools.some((sc: any) => sc.id === caller.schoolId && Number(sc.rank) <= 3)
    );

    isQualifiedTop3 = Boolean(
      (callerDistrictRank && callerDistrictRank <= 3) ||
        (callerSchoolDistrictRank && callerSchoolDistrictRank <= 3) ||
        awardedTop3District ||
        awardedSchoolTop3
    );
  }

  const regionalUnlocked = isPrivileged || isQualifiedTop3;
  return {
    districtUnlocked: true,
    regionalUnlocked,
    nationalUnlocked: true,
    isPrivileged,
    isQualifiedTop3,
    callerDistrictRank,
    callerSchoolDistrictRank,
    reasonUz: regionalUnlocked
      ? isPrivileged
        ? "Moderator/Administrator ruxsati bilan viloyat bosqichi ochiq."
        : "Tabriklaymiz! Tuman bosqichida TOP-3 o'rin olganingiz uchun Viloyat bosqichi siz uchun ochiq!"
      : "Viloyat bosqichi faqat Tuman bosqichida 1, 2 yoki 3-o'rin olgan g'olib o'quvchilar va TOP-3 maktablar uchun ochiladi.",
    stageSchedule: {
      district: {
        cycleLabel: '1 oyda 1 marta',
        periodKey: monthStatus.periodKey,
        endsAt: monthStatus.endsAt,
        serverNow,
        daysRemaining: monthStatus.daysRemainingInMonth,
        hoursRemaining: monthStatus.hoursRemaining,
        minutesRemaining: monthStatus.minutesRemaining,
        secondsRemaining: monthStatus.secondsRemaining,
      },
      regional: {
        cycleLabel: '3 oyda 1 marta',
        periodKey: quarterStatus.quarterKey,
        endsAt: quarterStatus.endsAt,
        serverNow,
        daysRemaining: quarterStatus.daysRemaining,
        hoursRemaining: quarterStatus.hoursRemaining,
        minutesRemaining: quarterStatus.minutesRemaining,
        secondsRemaining: quarterStatus.secondsRemaining,
      },
      national: {
        cycleLabel: '3 oyda 1 marta',
        periodKey: quarterStatus.quarterKey,
        endsAt: quarterStatus.endsAt,
        serverNow,
        daysRemaining: quarterStatus.daysRemaining,
        hoursRemaining: quarterStatus.hoursRemaining,
        minutesRemaining: quarterStatus.minutesRemaining,
        secondsRemaining: quarterStatus.secondsRemaining,
      },
    },
  };
}

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

let hydrogenBackoffUntil = 0;

function markPrimaryModelUnhealthy(statusCode: number) {
  if (statusCode === 503 || statusCode === 504 || statusCode === 429 || statusCode === 404 || statusCode >= 500) {
    hydrogenBackoffUntil = Date.now() + 5 * 60 * 1000;
  }
}

function shouldUseLiteDirectly(): boolean {
  return Date.now() < hydrogenBackoffUntil;
}

function shouldFallbackToLiteModel(error: any): boolean {
  const formatted = formatGeminiError(error);
  // Only skip fallback on hard client/auth errors (bad request schema or invalid/forbidden API key)
  if (formatted.statusCode === 400 || formatted.statusCode === 403) {
    return false;
  }
  return true;
}

function stripThinkingConfig(config?: Record<string, any>): Record<string, any> | undefined {
  if (!config) return undefined;
  const copy = { ...config };
  if ('thinkingConfig' in copy) {
    delete copy.thinkingConfig;
  }
  return copy;
}

async function generateContentWithModelFallback(
  params: { contents: any; config?: Record<string, any> },
  timeoutMs = 28000,
  primaryTimeoutMs?: number
): Promise<any> {
  const client = getGeminiClient();
  if (shouldUseLiteDirectly()) {
    return await withAiTimeout(
      client.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: params.contents,
        config: stripThinkingConfig(params.config),
      }),
      timeoutMs
    );
  }
  const firstBudgetMs = Math.min(timeoutMs, primaryTimeoutMs ?? 6000);
  try {
    return await withAiTimeout(
      client.models.generateContent({
        model: 'gemini-4-hydrogen',
        contents: params.contents,
        config: params.config,
      }),
      firstBudgetMs
    );
  } catch (err: any) {
    if (!shouldFallbackToLiteModel(err)) throw err;
    const formatted = formatGeminiError(err);
    markPrimaryModelUnhealthy(formatted.statusCode);
    console.warn(`[Gemini Fallback] generateContent -> gemini-3.1-flash-lite (${formatted.statusCode}):`, formatted.message);
    return await withAiTimeout(
      client.models.generateContent({
        model: 'gemini-3.1-flash-lite',
        contents: params.contents,
        config: stripThinkingConfig(params.config),
      }),
      timeoutMs
    );
  }
}

async function openGeminiStreamWithFirstChunkGuard(
  client: GoogleGenAI,
  model: string,
  contents: any,
  config: Record<string, any> | undefined,
  firstChunkTimeoutMs: number,
  chunkIdleTimeoutMs = 30000
): Promise<AsyncIterable<any>> {
  const stream = await withAiTimeout(
    client.models.generateContentStream({
      model,
      contents,
      config,
    }),
    firstChunkTimeoutMs
  );
  const iterator = stream[Symbol.asyncIterator]();
  const firstStep = await withAiTimeout(iterator.next(), firstChunkTimeoutMs);

  async function* guardedStream(): AsyncGenerator<any> {
    if (!firstStep.done && firstStep.value !== undefined) {
      yield firstStep.value;
    }
    if (firstStep.done) return;

    while (true) {
      const nextStep = await withAiTimeout(iterator.next(), chunkIdleTimeoutMs);
      if (nextStep.done) break;
      if (nextStep.value !== undefined) {
        yield nextStep.value;
      }
    }
  }

  return guardedStream();
}

async function generateContentStreamWithModelFallback(
  params: { contents: any; config?: Record<string, any> },
  timeoutMs = 32000,
  primaryTimeoutMs = 4500
): Promise<AsyncIterable<any>> {
  const client = getGeminiClient();
  if (shouldUseLiteDirectly()) {
    return await openGeminiStreamWithFirstChunkGuard(
      client,
      'gemini-3.1-flash-lite',
      params.contents,
      stripThinkingConfig(params.config),
      timeoutMs,
      timeoutMs
    );
  }
  const firstBudgetMs = Math.min(timeoutMs, primaryTimeoutMs);
  try {
    return await openGeminiStreamWithFirstChunkGuard(
      client,
      'gemini-4-hydrogen',
      params.contents,
      params.config,
      firstBudgetMs,
      timeoutMs
    );
  } catch (err: any) {
    if (!shouldFallbackToLiteModel(err)) throw err;
    const formatted = formatGeminiError(err);
    markPrimaryModelUnhealthy(formatted.statusCode);
    console.warn(`[Gemini Stream Fallback] -> gemini-3.1-flash-lite (${formatted.statusCode}):`, formatted.message);
    return await openGeminiStreamWithFirstChunkGuard(
      client,
      'gemini-3.1-flash-lite',
      params.contents,
      stripThinkingConfig(params.config),
      timeoutMs,
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

app.post('/api/ai/analyze-problem', requireAuth, async (req: AuthenticatedRequest, res) => {
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

app.post('/api/ai/tree-plan', requireAuth, async (req: AuthenticatedRequest, res) => {
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

app.post('/api/ai/moderate-report', requireAuth, async (req: AuthenticatedRequest, res) => {
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

  const systemInstruction = `Siz «EcoHero AI» — ChatGPT darajasidagi kuchli, zukko, samimiy va universal sun'iy intellekt yordamchisisiz.

ASOSIY TAMOYILLAR:
1. HAR QANDAY MAVZUDA PROFESSIONAL JAVOB: Matematika, fizika, kimyo, biologiya, dasturlash (Python, JS/TS, C++, HTML/CSS va h.k.), ingliz/rus/o'zbek tillari, tarix, biznes, matn yozish, tarjima, g'oyalar generatsiyasi, maktab darslari, oddiy kundalik suhbat YOKI ekologiya — foydalanuvchi nima so'rasa, to'g'ridan-to'g'ri, aniq, chuqur va mantiqli javob bering.
2. EKOLOGIYAGA MAJBURLAMANG: Agar savol dasturlash, matematika, til o'rganish yoki shunchaki suhbat haqida bo'lsa, mavzuni sun'iy ravishda ekologiyaga burmang. Ekologiya, "Yashil Makon", daraxt ekish, chiqindilarni qayta ishlash yoki EcoHero haqida so'ralganda esa O'zbekiston sharoitiga mos amaliy ekspert tavsiyalari bering.
3. TABIIY CHATGPT USLUBI:
   - Qisqa salomlashuv ("Salom", "Hi", "Qalaysan") yuborilsa, xuddi jonli suhbatdoshdek samimiy, qisqa va ochiq javob bering hamda qanday yordam kerakligini so'rang.
   - Murakkab savollarni mantiqiy bo'limlarga ajrating: Markdown sarlavhalar, qalin urg'u (**...**), raqamli/nuqtali ro'yxatlar, jadvallar va til nomi ko'rsatilgan kod bloklaridan o'rinli foydalaning.
   - Foydalanuvchi qaysi tilda yozsa (o'zbek lotin, o'zbek kirill, rus yoki ingliz), o'sha tilda ravon javob bering. Standart til: o'zbekcha (lotin).
   - Suhbat davomida avvalgi xabarlar kontekstini aniq eslab qoling va har safar salomlashishni takrorlamang.
4. FAYL VA RASMLAR TAHLILI: Rasm, PDF, Word (.docx), jadval (CSV) yoki kod fayllari biriktirilganda undagi matn, formula, jadval va xatolarni batafsil o'qib, aniq xulosa hamda yechim taqdim eting.
${userSchool || userRegion ? `\nFoydalanuvchi profili (faqat kerak bo'lganda foydalaning): Ismi ${userName}${userSchool ? `, ${userSchool}` : ''}${userRegion ? `, ${userRegion}` : ''}.` : ''}`;

  const contents: any[] = [];
  if (Array.isArray(chatHistory)) {
    for (const item of chatHistory.slice(-16)) {
      if (!item || item.isError) continue;
      if (item.text || (Array.isArray(item.attachments) && item.attachments.length > 0)) {
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
    hasHeavyAttachment,
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

  const { systemInstruction, contents, thinkingLevel, hasHeavyAttachment } = await buildEcoHeroAiPayload(
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
    30000,
    hasHeavyAttachment ? 8000 : 4500
  );
  const replyText = response?.text?.trim();
  if (replyText) return replyText;
  throw new Error("AI bo'sh javob qaytardi.");
}

app.post('/api/ai/eco-assistant', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { message, chatHistory, attachments } = req.body || {};
    const hasMessage = Boolean(String(message || '').trim());
    const hasAttachments = Array.isArray(attachments) && attachments.length > 0;
    if (!hasMessage && !hasAttachments) {
      return res.status(400).json({ error: 'Xabar matni yoki fayl kiritilishi shart' });
    }

    const caller = req.authUser;
    const userProfile = {
      fullName: caller?.fullName || 'Foydalanuvchi',
      schoolName: caller?.schoolName || '',
      region: caller?.region || '',
      role: caller?.role || 'student',
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

app.post('/api/ai/eco-assistant/stream', requireAuth, async (req: AuthenticatedRequest, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();
  res.write(': connected\n\n');

  let closed = false;
  const heartbeat = setInterval(() => {
    if (closed || res.writableEnded) return;
    try {
      res.write(': ping\n\n');
    } catch {
      closed = true;
    }
  }, 3500);

  res.on('close', () => {
    clearInterval(heartbeat);
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
    const { message, chatHistory, attachments } = req.body || {};
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

    const caller = req.authUser;
    const userProfile = {
      fullName: caller?.fullName || 'Foydalanuvchi',
      schoolName: caller?.schoolName || '',
      region: caller?.region || '',
      role: caller?.role || 'student',
    };

    const { systemInstruction, contents, thinkingLevel, hasHeavyAttachment } = await buildEcoHeroAiPayload(
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
      35000,
      hasHeavyAttachment ? 8000 : 4500
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

    if (!fullText.trim() && !closed && !res.writableEnded) {
      const client = getGeminiClient();
      const fallbackResp = await withAiTimeout(
        client.models.generateContent({
          model: 'gemini-3.1-flash-lite',
          contents,
          config: { systemInstruction },
        }),
        20000
      );
      const fallbackText = fallbackResp?.text?.trim() || '';
      if (fallbackText) {
        fullText = fallbackText;
        sendEvent({ delta: fallbackText });
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
  } finally {
    clearInterval(heartbeat);
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
    const rel = trimmed.replace(/^\/+/, '');
    const candidates = trimmed.startsWith('/uploads/')
      ? [
          path.resolve(UPLOADS_DIR, path.basename(rel)),
          path.resolve(process.cwd(), 'public', rel),
        ]
      : [path.resolve(process.cwd(), 'public', rel)];
    const localPath = candidates.find((p) => {
      const withinUploads = p.startsWith(path.resolve(UPLOADS_DIR) + path.sep);
      const withinPublic = p.startsWith(path.resolve(process.cwd(), 'public') + path.sep);
      return (withinUploads || withinPublic) && fs.existsSync(p);
    });
    if (localPath) {
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

app.post('/api/reports/submit', requireAuth, async (req: AuthenticatedRequest, res) => {
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
      schoolId,
      authorSchool,
      schoolName,
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

    const userRec = req.authUser;
    const uid = String(userRec.uid);
    const rName = userRec?.fullName || "O'quvchi";
    const sName = userRec?.schoolName || authorSchool || schoolName || 'Maktab';
    const resolvedSchool = findOrCreateSchool({
      schoolId: userRec?.schoolId || schoolId,
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
    const initialImage = String(imageUrl || imageBase64 || '').trim();
    const initialVideo = String(videoUrl || '').trim();
    const reportData: any = {
      id: reportId,
      clientReportId: targetReportId || reportId,
      title: title || 'Ekologik Muammo',
      description: description || '',
      category: finalCategory,
      severity: hazardCheck.isHazardous ? 'high' : aiAnalysisResult?.severityLevel || severity || 'medium',
      status: 'PENDING_REVIEW',
      coinsAwarded: false,
      rewardsIssued: false,
      ambassadorResolutionRewarded: false,
      rewardCoins: configuredReward,
      region: region || userRec?.region || 'Toshkent shahri',
      district: district || userRec?.district || 'Yunusobod tumani',
      address: address || `${region || 'Toshkent'}, ${district || ''}`,
      lat: Number(lat) || 41.2995,
      lng: Number(lng) || 69.2401,
      imageUrl: initialImage,
      beforeImageUrl: initialImage,
      videoUrl: initialVideo,
      beforeVideoUrl: initialVideo,
      reporterUid: uid,
      reporterName: rName,
      authorUid: uid,
      authorName: rName,
      schoolId: resolvedSchool?.id || userRec?.schoolId || schoolId || '',
      schoolName: resolvedSchool?.name || sName,
      schoolNumber: resolvedSchool?.number || userRec?.schoolNumber || '',
      authorTelegramId: userRec?.telegramId || null,
      isHazardous: hazardCheck.isHazardous,
      ...(hazardCheck.safetyWarning ? { safetyWarning: hazardCheck.safetyWarning } : {}),
      ...(hazardCheck.recommendedEscalation ? { escalationTarget: hazardCheck.recommendedEscalation } : {}),
      statusHistory: [
        {
          status: 'PENDING_REVIEW',
          actorName: rName,
          actorRole: userRec?.role || 'student',
          note: hazardCheck.isHazardous ? "Xavfli holat sifatida belgilandi — kattalar/tashkilot eskalatsiyasi tavsiya etiladi" : "O'quvchi tomonidan yuborildi (Admin tekshiruvida)",
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

    notifySuperAdminsTelegram(
      caption,
      { reply_markup: { inline_keyboard: inlineKeyboard } },
      reportData.imageUrl && String(reportData.imageUrl).startsWith('http') ? reportData.imageUrl : undefined
    ).catch(() => {});

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
      student.ecoXP = Math.max(Number(student.ecoXP || 0), Number(student.totalCoinsEarned || 0) * 4) + reward * 4;
      syncUserStatsConsistency(student);
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
        syncUserStatsConsistency(ambUser);
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
        'PENDING_REVIEW', 'APPROVED', 'NEEDS_INFO', 'ASSIGNED', 'IN_PROGRESS', 'FINAL_REVIEW', 'REUPLOAD_REQUIRED', 'ESCALATED', 'RESOLVED', 'REJECTED',
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

// School Admin Initial Review, Eco-Elchi Assignment, and Final Before/After Verification
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

      // Legacy direct student resolution (with strict atomic anti-duplicate guard)
      if (action === 'confirm_student_resolved') {
        const hasPriorFinalTx = (centralDb.transactions || []).some(
          (t: any) => t.reportId === report.id && t.rewardStage === 'final_resolution'
        );
        if (report.status === 'resolved' || report.status === 'RESOLVED' || report.rewardsIssued || hasPriorFinalTx) {
          return res.status(400).json({ error: 'Hisobot allaqachon tasdiqlangan va mukofot berilgan' });
        }
        const reward = 100;
        report.rewardsIssued = true;
        report.coinsAwarded = true;
        report.resolutionRewardAwarded = true;
        report.rewardCoins = reward;
        report.studentRewardedCoins = reward;
        report.status = 'RESOLVED';
        report.resolvedAt = nowIso;
        report.resolvedBy = caller.fullName;
        report.finalReviewedBy = caller.fullName;
        report.finalReviewedByUid = caller.uid;
        report.finalReviewedAt = nowIso;
        report.finalReviewNote = note || "Maktab administratori o'quvchi bajarganini tasdiqladi";
        report.resolvedImageUrl = report.resolvedImageUrl || report.imageUrl;
        report.updatedAt = nowIso;
        report.statusHistory.push({
          status: 'RESOLVED',
          actorName: caller.fullName,
          actorRole: caller.role,
          note: report.finalReviewNote,
          timestamp: nowIso,
        });

        const student = findUserByAnyIdentifier({
          uid: report.reporterUid || report.authorUid,
          telegramId: report.authorTelegramId,
        });
        if (student) {
          student.ecoCoins = (student.ecoCoins || 0) + reward;
          student.totalCoinsEarned = (student.totalCoinsEarned || 0) + reward;
          student.ecoXP = Number(student.ecoXP || 0) + reward * 4;
          student.reportsCount = (student.reportsCount || 0) + 1;
          student.cleanupsCount = (student.cleanupsCount || 0) + 1;
          syncUserStatsConsistency(student);
          const tx = recordTransaction({
            userId: student.uid,
            amount: reward,
            type: 'earn',
            status: 'approved',
            reportId: report.id,
            rewardStage: 'final_resolution',
            reason: `Maktab administratori ekologik ishingizni tasdiqladi: ${report.title}`,
          });
          report.studentRewardTxId = tx.id;
          centralDb.notifications.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            userId: student.uid,
            title: `+${reward} EcoCoin! Ekologik ishingiz tasdiqlandi`,
            message: `${caller.fullName} "${report.title}" bo'yicha ishingizni tasdiqladi.`,
            type: 'coin',
            read: false,
            createdAt: nowIso,
          });
          const tgId = student.telegramId || student.chatId || report.authorTelegramId;
          if (tgId) {
            sendTelegramMessage(
              tgId,
              `🎉 <b>MAKTAB ADMINISTRATORI ISHINGIZNI TASDIQLADI!</b>\n\n` +
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
        return res.json({ success: true, report, message: "O'quvchi bajargan ish tasdiqlandi va +100 EcoCoin berildi!" });
      }

      // School Admin Rejects report (Initial or Final Verification) -> NO coins
      if (action === 'reject' || action === 'final_reject') {
        if (String(report.status || '').toUpperCase() === 'RESOLVED' || report.rewardsIssued) {
          return res.status(400).json({ error: 'Allaqachon hal qilingan va mukofotlangan hisobotni rad etib bo‘lmaydi' });
        }
        const reasonNote = String(note || '').trim() || 'Maktab administratori tomonidan rad etildi';
        report.status = 'REJECTED';
        report.moderatorNote = reasonNote;
        report.finalReviewNote = reasonNote;
        report.finalReviewedBy = caller.fullName;
        report.finalReviewedByUid = caller.uid;
        report.finalReviewedAt = nowIso;
        report.updatedAt = nowIso;
        report.statusHistory.push({
          status: 'REJECTED',
          actorName: caller.fullName,
          actorRole: caller.role,
          note: reasonNote,
          timestamp: nowIso,
        });

        const student = findUserByAnyIdentifier({ uid: report.reporterUid || report.authorUid });
        if (student) {
          centralDb.notifications.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            userId: student.uid,
            title: `Murojaat rad etildi: ${report.title}`,
            message: `${caller.fullName}: ${reasonNote}`,
            type: 'status',
            read: false,
            createdAt: nowIso,
          });
        }
        if (report.assignedAmbassadorUid && report.assignedAmbassadorUid !== student?.uid) {
          centralDb.notifications.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            userId: report.assignedAmbassadorUid,
            title: `Natija rad etildi: ${report.title}`,
            message: `${caller.fullName}: ${reasonNote}`,
            type: 'status',
            read: false,
            createdAt: nowIso,
          });
        }

        saveCentralDb();
        broadcastRealtimeEvent('db:updated', { scope: 'reports' });
        addAuditLog({
          actorUid: caller.uid,
          actorName: caller.fullName,
          actorRole: caller.role,
          action: action === 'final_reject' ? 'school_final_reject' : 'school_initial_reject',
          targetCollection: 'reports',
          targetId: report.id,
          details: { note: reasonNote },
        });
        return res.json({ success: true, report, message: 'Hisobot rad etildi.' });
      }

      // School Admin requests AFTER photo re-upload -> preserves BEFORE photo & history, NO coins
      if (action === 'final_request_reupload') {
        if (String(report.status || '').toUpperCase() === 'RESOLVED' || report.rewardsIssued) {
          return res.status(400).json({ error: 'Allaqachon yakuniy tasdiqlangan hisobot uchun qayta rasm so‘rab bo‘lmaydi' });
        }
        if (!report.afterImageUrl && !report.afterVideoUrl && !report.resolvedImageUrl) {
          return res.status(400).json({ error: 'Hali keyingi dalil yuklanmagan' });
        }
        const reqNote =
          String(note || '').trim() ||
          "Iltimos, muammo hal qilingan joyning aniqroq keyingi rasm yoki videosini qayta yuklang.";
        report.status = 'REUPLOAD_REQUIRED';
        report.finalReviewNote = reqNote;
        report.finalReviewedBy = caller.fullName;
        report.finalReviewedByUid = caller.uid;
        report.finalReviewedAt = nowIso;
        report.reuploadRequestCount = Number(report.reuploadRequestCount || 0) + 1;
        report.updatedAt = nowIso;
        report.statusHistory.push({
          status: 'REUPLOAD_REQUIRED',
          actorName: caller.fullName,
          actorRole: caller.role,
          note: reqNote,
          timestamp: nowIso,
        });

        for (const task of centralDb.ecoTasks || []) {
          if (task.relatedReportId === report.id) {
            task.status = 'needs_revision';
            task.completionNote = reqNote;
            task.updatedAt = nowIso;
          }
        }

        const ambUser = report.assignedAmbassadorUid
          ? findUserByAnyIdentifier({ uid: report.assignedAmbassadorUid })
          : null;
        if (ambUser) {
          centralDb.notifications.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            userId: ambUser.uid,
            title: `Qayta rasm yuklash so'raldi: ${report.title}`,
            message: `${caller.fullName}: ${reqNote}`,
            type: 'task',
            read: false,
            createdAt: nowIso,
          });
          const ambTg = ambUser.telegramId || ambUser.chatId;
          if (ambTg) {
            sendTelegramMessage(
              ambTg,
              `🔄 <b>QAYTA RASM YUKLASH SO'RALDI</b>\n\n` +
                `📌 <b>Muammo:</b> ${report.title}\n` +
                `🏫 <b>Maktab administratori:</b> ${caller.fullName}\n` +
                `💬 <b>Izoh:</b> ${reqNote}\n\n` +
                `Iltimos, hal qilingandan keyingi yangi rasm/videoni Eco-Elchi kabinetidan qayta yuklang.`,
              { reply_markup: { inline_keyboard: [[{ text: '📸 Qayta rasm yuklash', web_app: { url: APP_URL } }]] } }
            ).catch(() => {});
          }
        }

        saveCentralDb();
        broadcastRealtimeEvent('db:updated', { scope: 'reports' });
        addAuditLog({
          actorUid: caller.uid,
          actorName: caller.fullName,
          actorRole: caller.role,
          action: 'school_request_reupload',
          targetCollection: 'reports',
          targetId: report.id,
          details: { note: reqNote, reuploadRequestCount: report.reuploadRequestCount },
        });
        return res.json({ success: true, report, message: "Eco-Elchidan qayta keyingi rasm yuklash so'raldi." });
      }

      // School Admin approves Initial Report & assigns to school Eco-Elchi
      if (action === 'assign_ambassador') {
        if (report.isHazardous) {
          return res.status(400).json({ error: 'Xavfli muammolarni Eco-Elchiga biriktirish taqiqlanadi — eskalatsiya qiling!' });
        }
        if (String(report.status || '').toUpperCase() === 'RESOLVED' || report.rewardsIssued) {
          return res.status(400).json({ error: 'Ushbu muammo allaqachon hal qilingan' });
        }

        let targetAmb = assignedAmbassadorUid ? findUserByAnyIdentifier({ uid: assignedAmbassadorUid }) : null;
        if (targetAmb && !assertSchoolAccess(targetAmb, report.schoolId) && !hasAnyRole(caller, ['super_admin', 'moderator'])) {
          targetAmb = null;
        }
        if (!targetAmb) {
          targetAmb = Object.values(centralDb.users || {}).find(
            (u: any) =>
              u &&
              (u.role === 'ambassador' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('ambassador'))) &&
              ((report.schoolId && u.schoolId === report.schoolId) ||
                (report.schoolName && u.schoolName === report.schoolName))
          );
        }
        const ambUid = targetAmb?.uid || assignedAmbassadorUid || '';
        const ambName = targetAmb?.fullName || 'Maktab Eko-Elchisi';
        if (!ambUid) {
          return res.status(400).json({ error: 'Maktabda faol Eko-Elchi topilmadi. Avval Eco-Elchi tayinlang.' });
        }

        // Guarantee immutable BEFORE backup exists
        if (!report.beforeImageUrl && report.imageUrl) report.beforeImageUrl = report.imageUrl;
        if (!report.beforeVideoUrl && report.videoUrl) report.beforeVideoUrl = report.videoUrl;

        report.assignedAmbassadorUid = ambUid;
        report.assignedAmbassadorName = ambName;
        report.assignedAt = nowIso;
        report.captainInstructions =
          String(note || '').trim() ||
          "Maktab administratori tasdiqladi. Muammoni hal qiling va keyingi (AFTER) foto/video dalilni yuklang!";
        report.status = 'ASSIGNED';
        report.updatedAt = nowIso;
        report.statusHistory.push({
          status: 'ASSIGNED',
          actorName: caller.fullName,
          actorRole: caller.role,
          note: `Tasdiqlandi va Eco-Elchiga biriktirildi: ${ambName}`,
          timestamp: nowIso,
        });

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
        } else {
          existingTask.assigneeUid = ambUid;
          existingTask.assigneeName = ambName;
          existingTask.instructions = report.captainInstructions;
          existingTask.updatedAt = nowIso;
        }

        centralDb.notifications.unshift({
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          userId: ambUid,
          title: `Yangi muammo biriktirildi: ${report.title}`,
          message: `O'quvchi ${report.reporterName} xabar bergan muammo sizga biriktirildi. Hal qilgach keyingi rasm yuklang (+200 EcoCoin).`,
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
              `📍 <b>Manzil:</b> ${report.address || `${report.region}, ${report.district}`}\n` +
              `📋 <b>Vazifa:</b> Muammoni hal qilib, Eco-Elchi kabinetida KEYINGI (AFTER) rasm/video yuklang.\n` +
              `💰 <b>Yakuniy tasdiqlangach mukofot:</b> Sizga +200 EcoCoin, o'quvchiga +100 EcoCoin!`,
            { reply_markup: { inline_keyboard: [[{ text: '📸 Kabinetda ochish', web_app: { url: APP_URL } }]] } }
          ).catch(() => {});
        }

        const student = findUserByAnyIdentifier({ uid: report.reporterUid || report.authorUid });
        if (student) {
          centralDb.notifications.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            userId: student.uid,
            title: `Murojaatingiz Eco-Elchiga biriktirildi`,
            message: `${ambName} "${report.title}" muammosini hal qilish uchun biriktirildi. Yakuniy tasdiqlangach +100 EcoCoin beriladi!`,
            type: 'status',
            read: false,
            createdAt: nowIso,
          });
        }

        saveCentralDb();
        broadcastRealtimeEvent('db:updated', { scope: 'reports' });
        addAuditLog({
          actorUid: caller.uid,
          actorName: caller.fullName,
          actorRole: caller.role,
          action: 'school_assign_ambassador',
          targetCollection: 'reports',
          targetId: report.id,
          details: { assignedAmbassadorUid: ambUid, assignedAmbassadorName: ambName },
        });
        return res.json({ success: true, report, message: `Muammo tasdiqlandi va Eco-Elchi (${ambName}) ga biriktirildi!` });
      }

      // School Admin FINAL VERIFICATION (Tasdiqlash) -> Marks RESOLVED & Atomically pays +100 Student / +200 Eco-Elchi
      if (action === 'final_approve') {
        const hasPriorFinalTx = (centralDb.transactions || []).some(
          (t: any) => t.reportId === report.id && t.rewardStage === 'final_resolution'
        );
        if (
          String(report.status || '').toUpperCase() === 'RESOLVED' ||
          report.rewardsIssued ||
          report.ambassadorResolutionRewarded ||
          hasPriorFinalTx
        ) {
          return res.status(400).json({ error: 'Ushbu muammo allaqachon yakuniy tasdiqlangan va EcoCoin mukofotlari berilgan!' });
        }
        if (report.isHazardous) {
          return res.status(400).json({ error: "Xavfli muammolarni o'quvchi/Eco-Elchi mukofoti bilan yopish mumkin emas" });
        }
        const afterEvidence = report.afterImageUrl || report.afterVideoUrl || report.resolvedImageUrl;
        if (!afterEvidence) {
          return res.status(400).json({ error: 'Yakuniy tasdiqlash uchun Eco-Elchi tomonidan yuklangan KEYINGI (AFTER) rasm yoki video mavjud bo‘lishi shart!' });
        }

        // Atomic idempotency locks BEFORE crediting balances
        report.rewardsIssued = true;
        report.ambassadorResolutionRewarded = true;
        report.coinsAwarded = true;
        report.resolutionRewardAwarded = true;

        const cleanFinalNote =
          String(note || '').trim() ||
          "Maktab administratori avvalgi va keyingi dalillarni solishtirib muammoni hal qilingan deb tasdiqladi.";

        report.status = 'RESOLVED';
        report.resolvedAt = nowIso;
        report.resolvedBy = caller.fullName;
        report.finalReviewedBy = caller.fullName;
        report.finalReviewedByUid = caller.uid;
        report.finalReviewedAt = nowIso;
        report.finalReviewNote = cleanFinalNote;
        report.updatedAt = nowIso;
        report.statusHistory.push({
          status: 'RESOLVED',
          actorName: caller.fullName,
          actorRole: caller.role,
          note: cleanFinalNote,
          timestamp: nowIso,
        });

        for (const task of centralDb.ecoTasks || []) {
          if (task.relatedReportId === report.id) {
            task.status = 'verified';
            task.evidenceUrl = afterEvidence;
            task.completionNote = report.resolutionDescription || report.completionNote || cleanFinalNote;
            task.updatedAt = nowIso;
          }
        }

        // Fixed server-authoritative rewards (ignore any req.body amounts)
        const ambassadorReward = 200;
        const studentReward = 100;
        const ambassadorXpGain = 800;
        const studentXpGain = 400;

        const ambassadorUser =
          (report.assignedAmbassadorUid && findUserByAnyIdentifier({ uid: report.assignedAmbassadorUid })) ||
          null;
        const studentUser = findUserByAnyIdentifier({
          uid: report.reporterUid || report.authorUid,
          telegramId: report.authorTelegramId,
        });

        let paidAmb = 0;
        let paidStu = 0;

        if (ambassadorUser) {
          ambassadorUser.ecoCoins = (ambassadorUser.ecoCoins || 0) + ambassadorReward;
          ambassadorUser.totalCoinsEarned = (ambassadorUser.totalCoinsEarned || 0) + ambassadorReward;
          ambassadorUser.ecoXP = Number(ambassadorUser.ecoXP || 0) + ambassadorXpGain;
          ambassadorUser.cleanupsCount = (ambassadorUser.cleanupsCount || 0) + 1;
          syncUserStatsConsistency(ambassadorUser);
          const ambTx = recordTransaction({
            userId: ambassadorUser.uid,
            amount: ambassadorReward,
            type: 'earn',
            status: 'approved',
            reportId: report.id,
            rewardStage: 'final_resolution',
            reason: `Muammo hal qilindi (Maktab administratori yakuniy tasdiqladi): ${report.title}`,
          });
          report.ambassadorRewardTxId = ambTx.id;
          report.ambassadorRewardedCoins = ambassadorReward;
          paidAmb = ambassadorReward;

          // Sync ambassador roster record
          const ambRecord = (centralDb.ambassadors || []).find((a: any) => a.id === ambassadorUser.uid);
          if (ambRecord) {
            ambRecord.verifiedActivitiesCount = Number(ambRecord.verifiedActivitiesCount || 0) + 1;
            ambRecord.ecoCoins = ambassadorUser.ecoCoins;
          }

          centralDb.notifications.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            userId: ambassadorUser.uid,
            title: `+${ambassadorReward} EcoCoin! Muammo yakuniy tasdiqlandi`,
            message: `${caller.fullName} "${report.title}" bo'yicha keyingi dalilingizni tasdiqladi (+${ambassadorReward} EcoCoin, +${ambassadorXpGain} XP).`,
            type: 'coin',
            read: false,
            createdAt: nowIso,
          });
          const ambTg = ambassadorUser.telegramId || ambassadorUser.chatId;
          if (ambTg) {
            sendTelegramMessage(
              ambTg,
              `🎉 <b>YAKUNIY TASDIQLANDI! +${ambassadorReward} EcoCoin</b>\n\n` +
                `📌 <b>Muammo:</b> ${report.title}\n` +
                `🏫 <b>Tasdiqlagan admin:</b> ${caller.fullName}\n` +
                `⭐ <b>Tajriba:</b> +${ambassadorXpGain} XP\n` +
                `💳 <b>Balansingiz:</b> ${ambassadorUser.ecoCoins} EcoCoin`,
              { reply_markup: { inline_keyboard: [[{ text: '🌍 ECO HERO Kabinet', web_app: { url: APP_URL } }]] } }
            ).catch(() => {});
          }
        }

        if (studentUser && studentUser.uid !== ambassadorUser?.uid) {
          studentUser.ecoCoins = (studentUser.ecoCoins || 0) + studentReward;
          studentUser.totalCoinsEarned = (studentUser.totalCoinsEarned || 0) + studentReward;
          studentUser.ecoXP = Number(studentUser.ecoXP || 0) + studentXpGain;
          studentUser.reportsCount = (studentUser.reportsCount || 0) + 1;
          syncUserStatsConsistency(studentUser);
          const stuTx = recordTransaction({
            userId: studentUser.uid,
            amount: studentReward,
            type: 'earn',
            status: 'approved',
            reportId: report.id,
            rewardStage: 'final_resolution',
            reason: `Siz xabar bergan muammo hal qilindi va tasdiqlandi: ${report.title}`,
          });
          report.studentRewardTxId = stuTx.id;
          report.studentRewardedCoins = studentReward;
          paidStu = studentReward;

          centralDb.notifications.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            userId: studentUser.uid,
            title: `+${studentReward} EcoCoin! Xabaringiz hal qilindi`,
            message: `${report.assignedAmbassadorName || 'Eco-Elchi'} "${report.title}" muammosini hal qildi va ${caller.fullName} tasdiqladi (+${studentReward} EcoCoin).`,
            type: 'coin',
            read: false,
            createdAt: nowIso,
          });
          const stuTg = studentUser.telegramId || studentUser.chatId || report.authorTelegramId;
          if (stuTg) {
            sendTelegramMessage(
              stuTg,
              `🎉 <b>SIZ XABAR BERGAN MUAMMO HAL QILINDI! +${studentReward} EcoCoin</b>\n\n` +
                `📌 <b>Muammo:</b> ${report.title}\n` +
                `🛡 <b>Eco-Elchi:</b> ${report.assignedAmbassadorName || 'Maktab Eco-Elchisi'}\n` +
                `🏫 <b>Tasdiqladi:</b> ${caller.fullName}\n` +
                `💳 <b>Balansingiz:</b> ${studentUser.ecoCoins} EcoCoin`,
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
            coinsDelta: paidAmb + paidStu,
            cleanupsDelta: 1,
          });
        }

        saveCentralDb();
        broadcastRealtimeEvent('db:updated', { scope: 'reports' });
        addAuditLog({
          actorUid: caller.uid,
          actorName: caller.fullName,
          actorRole: caller.role,
          action: 'school_final_approve_report',
          targetCollection: 'reports',
          targetId: report.id,
          details: { ambassadorReward: paidAmb, studentReward: paidStu },
        });

        return res.json({
          success: true,
          report,
          ambassadorReward: paidAmb,
          studentReward: paidStu,
          message: `Muammo yakuniy tasdiqlandi!${paidAmb > 0 ? ` Eco-Elchiga +${paidAmb} EcoCoin` : ''}${paidStu > 0 ? `, O'quvchiga +${paidStu} EcoCoin` : ''} berildi!`,
        });
      }

      return res.status(400).json({ error: "Noto'g'ri school-action amali" });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// Eco-Elchi In-Progress & AFTER Evidence Submission -> Sends to School Admin Final Verification (BEFORE photo strictly immutable)
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
      if (
        caller.role === 'ambassador' &&
        report.assignedAmbassadorUid &&
        report.assignedAmbassadorUid !== caller.uid
      ) {
        return res.status(403).json({ error: 'Ushbu muammo boshqa Eco-Elchiga biriktirilgan' });
      }
      if (report.isHazardous) {
        return res.status(400).json({ error: "Xavfli muammolarni o'quvchilar bajarishi taqiqlanadi!" });
      }
      if (
        report.rewardsIssued ||
        report.ambassadorResolutionRewarded ||
        ['resolved', 'RESOLVED', 'rejected', 'REJECTED'].includes(String(report.status || ''))
      ) {
        return res.status(400).json({ error: 'Ushbu muammo allaqachon yopilgan' });
      }

      const { action, afterImageUrl, afterVideoUrl, note } = req.body || {};
      const nowIso = new Date().toISOString();
      if (!Array.isArray(report.statusHistory)) report.statusHistory = [];

      // Action 1: Mark as IN_PROGRESS (Jarayonda)
      if (action === 'start_progress') {
        report.status = 'IN_PROGRESS';
        report.updatedAt = nowIso;
        if (!report.assignedAmbassadorUid) {
          report.assignedAmbassadorUid = caller.uid;
          report.assignedAmbassadorName = caller.fullName;
        }
        report.statusHistory.push({
          status: 'IN_PROGRESS',
          actorName: caller.fullName,
          actorRole: caller.role,
          note: String(note || '').trim() || "Eco-Elchi muammoni hal qilishni boshladi",
          timestamp: nowIso,
        });
        for (const task of centralDb.ecoTasks || []) {
          if (task.relatedReportId === report.id && task.status === 'assigned') {
            task.status = 'in_progress';
            task.updatedAt = nowIso;
          }
        }
        saveCentralDb();
        broadcastRealtimeEvent('db:updated', { scope: 'reports' });
        return res.json({ success: true, report, message: "Holat 'Jarayonda' ga o'zgartirildi!" });
      }

      // Action 2: Submit AFTER evidence for School Admin Final Verification (DO NOT overwrite BEFORE photo, DO NOT award coins yet!)
      const immutableBefore = String(report.beforeImageUrl || report.imageUrl || '').trim();
      const finalAfterImg = String(afterImageUrl || '').trim();
      const finalAfterVid = String(afterVideoUrl || '').trim();
      const finalAfter = finalAfterImg || finalAfterVid;
      if (!finalAfter) {
        return res.status(400).json({ error: 'Muammo hal qilingandan keyingi (AFTER) foto yoki video yuklash majburiy!' });
      }
      const cleanNote = String(note || '').trim();
      if (cleanNote.length < 3) {
        return res.status(400).json({ error: "Muammo qanday hal qilingani haqida qisqacha tavsif yozing" });
      }

      // Strictly lock immutable student BEFORE media
      if (!report.beforeImageUrl && immutableBefore) {
        report.beforeImageUrl = immutableBefore;
      }
      if (!report.beforeVideoUrl && report.videoUrl) {
        report.beforeVideoUrl = report.videoUrl;
      }

      let aiVerdict: any = {
        isAiGenerated: false,
        beforeShowsProblem: true,
        afterShowsResolved: true,
        sameLocationConsistent: true,
        isValidEcoResolution: true,
        confidence: 88,
        verdictUz: "Keyingi dalil yuklandi — maktab administratorining yakuniy tekshiruviga yuborildi.",
      };

      if (process.env.GEMINI_API_KEY && immutableBefore && finalAfterImg) {
        try {
          const beforeInline = await resolveImageInputToInlineData(immutableBefore);
          const afterInline = await resolveImageInputToInlineData(finalAfterImg);
          if (beforeInline && afterInline) {
            const response: any = await generateContentWithModelFallback(
              {
                contents: [
                  {
                    role: 'user',
                    parts: [
                      { text: "1-RASM (O'quvchining AVVALGI rasmi):" },
                      { inlineData: beforeInline },
                      { text: '2-RASM (Eco-Elchining KEYINGI rasmi):' },
                      { inlineData: afterInline },
                      {
                        text: `Muammo: ${report.title}\nTavsif: ${report.description}\nHal qilish tavsifi: ${cleanNote}\nRasm AI (sun'iy intellekt) yordamida soxtalashtirilmagan haqiqiy foto ekanini va muammo holatini tekshiring.`,
                      },
                    ],
                  },
                ],
                config: {
                  systemInstruction:
                    `Siz ECO HERO AI auditorisiz. JSON qaytaring: {"isAiGenerated": boolean, "beforeShowsProblem": boolean, "afterShowsResolved": boolean, "sameLocationConsistent": boolean, "isValidEcoResolution": boolean, "confidence": number, "verdictUz": string}. Agar rasm aniq sun'iy intellektda yasalgan fake bo'lsa "isAiGenerated": true yozing.`,
                  responseMimeType: 'application/json',
                  thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
                },
              },
              22000
            );
            aiVerdict = parseModelJsonResponse(response?.text) || aiVerdict;
          }
        } catch (aiErr: any) {
          console.warn('Before/After AI advisory check skipped:', aiErr?.message || aiErr);
        }
      }

      if (aiVerdict?.isAiGenerated === true) {
        return res.status(400).json({
          success: false,
          aiCheck: aiVerdict,
          error:
            aiVerdict?.verdictUz ||
            "AI tekshiruvi: yuklangan rasm sun'iy intellektda yaratilganga o'xshaydi. Faqat joyida olingan haqiqiy rasm yuklang!",
        });
      }

      if (finalAfterImg) report.afterImageUrl = finalAfterImg;
      if (finalAfterVid) report.afterVideoUrl = finalAfterVid;
      report.resolvedImageUrl = finalAfterImg || finalAfterVid;
      report.progressEvidenceUrl = finalAfterImg || finalAfterVid;
      report.resolutionDescription = cleanNote;
      report.completionNote = cleanNote;
      report.submittedForFinalReviewAt = nowIso;
      if (!report.assignedAmbassadorUid) {
        report.assignedAmbassadorUid = caller.uid;
        report.assignedAmbassadorName = caller.fullName;
      }
      report.status = 'FINAL_REVIEW';
      report.updatedAt = nowIso;
      report.aiAuthenticityCheck = {
        isAiGenerated: false,
        isVerifiedResolved: Boolean(aiVerdict?.isValidEcoResolution ?? true),
        confidence: Number(aiVerdict?.confidence || 88),
        verdictUz: String(aiVerdict?.verdictUz || "Maktab administratorining yakuniy tekshiruviga yuborildi."),
        checkedAt: nowIso,
      };
      report.statusHistory.push({
        status: 'FINAL_REVIEW',
        actorName: caller.fullName,
        actorRole: caller.role,
        note: `Yakuniy tekshiruvga yuborildi: ${cleanNote}`,
        timestamp: nowIso,
      });

      for (const task of centralDb.ecoTasks || []) {
        if (task.relatedReportId === report.id) {
          task.status = 'submitted';
          task.evidenceUrl = finalAfter;
          task.completionNote = cleanNote;
          task.updatedAt = nowIso;
        }
      }

      // Notify School Admins for Final Verification
      const schoolAdmins = Object.values(centralDb.users || {}).filter(
        (u: any) =>
          u &&
          u.role === 'school_admin' &&
          ((report.schoolId && u.schoolId === report.schoolId) ||
            (report.schoolName && u.schoolName === report.schoolName))
      );
      for (const admin of schoolAdmins) {
        centralDb.notifications.unshift({
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          userId: admin.uid,
          title: `Yakuniy tekshiruv kutilmoqda: ${report.title}`,
          message: `${caller.fullName} (Eco-Elchi) Avval/Keyin dalilini yubordi. Tasdiqlasangiz +100 / +200 EcoCoin beriladi.`,
          type: 'status',
          read: false,
          createdAt: nowIso,
        });
        const adminTg = admin.telegramId || admin.chatId;
        if (adminTg) {
          sendTelegramMessage(
            adminTg,
            `🔍 <b>YAKUNIY TEKSHIRUV KUTILMOQDA (AVVAL / KEYIN)</b>\n\n` +
              `📌 <b>Muammo:</b> ${report.title}\n` +
              `👤 <b>O'quvchi:</b> ${report.reporterName}\n` +
              `🛡 <b>Eco-Elchi:</b> ${caller.fullName}\n` +
              `📝 <b>Hal qilish izohi:</b> ${cleanNote}\n\n` +
              `Maktab administratori kabinetida Avval va Keyin rasmlarni solishtirib Tasdiqlash, Rad etish yoki Qayta rasm so'rash tugmasini bosing.`,
            { reply_markup: { inline_keyboard: [[{ text: '🔍 Yakuniy Tekshiruv', web_app: { url: APP_URL } }]] } }
          ).catch(() => {});
        }
      }

      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'reports' });
      addAuditLog({
        actorUid: caller.uid,
        actorName: caller.fullName,
        actorRole: caller.role,
        action: 'report_submitted_final_review',
        targetCollection: 'reports',
        targetId: report.id,
        details: { afterEvidence: finalAfter, note: cleanNote },
      });

      res.json({
        success: true,
        report,
        message: "Keyingi dalil yuborildi! Hisobot Maktab administratorining yakuniy tekshiruviga o'tkazildi.",
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
    // BEFORE original photo from student is immutable once created
    if (imageUrl !== undefined && !report.beforeImageUrl && !report.imageUrl) {
      const cleanImg = String(imageUrl).trim();
      report.imageUrl = cleanImg;
      report.beforeImageUrl = cleanImg;
    }
    if (resolvedImageUrl !== undefined) {
      report.resolvedImageUrl = String(resolvedImageUrl).trim();
      report.afterImageUrl = String(resolvedImageUrl).trim();
    }
    if (address !== undefined) report.address = String(address).trim();
    report.updatedAt = new Date().toISOString();

    saveCentralDb();
    broadcastRealtimeEvent('db:updated', {
      scope: 'reports',
      action: 'updated',
      reportId: report.id,
    });
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/reports/:id', requireRoles('super_admin', 'moderator'), (req: AuthenticatedRequest, res) => {
  try {
    const idx = centralDb.reports.findIndex((r) => r.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Hisobot topilmadi' });
    const [removed] = centralDb.reports.splice(idx, 1);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', {
      scope: 'reports',
      action: 'deleted',
      reportId: removed?.id || req.params.id,
    });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/reports/:id/upvote', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const report = centralDb.reports.find((r) => r.id === req.params.id);
    if (!report) return res.status(404).json({ error: 'Hisobot topilmadi' });
    if (!Array.isArray(report.upvotedBy)) report.upvotedBy = [];

    const uid = String(req.authUser.uid);
    if (report.upvotedBy.includes(uid)) {
      report.upvotedBy = report.upvotedBy.filter((x: string) => x !== uid);
      report.upvotes = Math.max(0, (report.upvotes || 1) - 1);
    } else {
      report.upvotedBy.push(uid);
      report.upvotes = (report.upvotes || 0) + 1;
    }
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', {
      scope: 'reports',
      action: 'upvoted',
      reportId: report.id,
    });
    res.json({ success: true, report });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. AUTH, SESSION ISSUANCE, REGISTRATION & ONBOARDING
// ==========================================

// Exchange strictly verified Firebase ID Token for a server-signed HMAC sessionToken
app.post('/api/auth/session', async (req, res) => {
  try {
    const { idToken: rawIdToken, firebaseIdToken, email, fullName } = req.body || {};
    const idToken = rawIdToken || firebaseIdToken;
    if (!idToken || typeof idToken !== 'string') {
      return res.status(401).json({
        error: "Sessiya yaratish uchun tasdiqlangan Firebase ID token talab qilinadi",
      });
    }

    const verifiedFb = await verifyFirebaseIdToken(String(idToken));
    if (!verifiedFb) {
      return res.status(401).json({
        error: "Firebase ID token tasdiqlanmadi yoki muddati o'tgan",
      });
    }

    let user = findUserByAnyIdentifier({ uid: verifiedFb.uid, email: verifiedFb.email });
    const isVerifiedSuper = Boolean(
      verifiedFb.emailVerified && checkIsSuperAdmin({ email: verifiedFb.email, verifiedEmail: true })
    );

    if (user) {
      // Link Firebase UID as an alias/linkedUid if user was matched via email on an existing Telegram/Web account
      if (user.uid !== verifiedFb.uid) {
        const fbUidDuplicate = centralDb.users[verifiedFb.uid];
        if (fbUidDuplicate && fbUidDuplicate.uid !== user.uid && verifiedFb.emailVerified) {
          user = mergeUserAccounts(user.uid, fbUidDuplicate.uid) || user;
        } else {
          if (!centralDb.uidAliases) centralDb.uidAliases = {};
          centralDb.uidAliases[verifiedFb.uid] = user.uid;
          const linked = new Set<string>(Array.isArray(user.linkedUids) ? user.linkedUids : [user.uid]);
          linked.add(verifiedFb.uid);
          user.linkedUids = Array.from(linked);
          saveCentralDb();
        }
      }

      // If Super Admin also has a Telegram Super Admin record under another UID, unify them automatically
      if (isVerifiedSuper) {
        const otherSuperAccounts = (Object.values(centralDb.users) as any[]).filter(
          (u) => u && u.uid !== user.uid && (u.role === 'super_admin' || isSuperAdminTelegramId(u.telegramId))
        );
        for (const other of otherSuperAccounts) {
          user = mergeUserAccounts(user.uid, other.uid) || user;
        }
        if (user.role !== 'super_admin') {
          user = upsertUser({
            ...user,
            role: 'super_admin',
            approvedRoles: [
              'student',
              'ambassador',
              'school_admin',
              'district_coordinator',
              'regional_coordinator',
              'moderator',
              'super_admin',
              'sponsor',
            ],
            isVerified: true,
            isOnboarded: true,
          });
        }
        saveCentralDb();
      }
    } else {
      // If Super Admin signs in for the first time via Google while Telegram Super Admin already exists, link into that canonical account
      const existingTgSuper = isVerifiedSuper
        ? (Object.values(centralDb.users) as any[]).find(
            (u) => u && (u.role === 'super_admin' || isSuperAdminTelegramId(u.telegramId))
          )
        : null;
      if (existingTgSuper) {
        user = upsertUser({
          ...existingTgSuper,
          email: verifiedFb.email || existingTgSuper.email,
          fullName: existingTgSuper.fullName || verifiedFb.displayName || fullName || 'Super Admin',
          avatarUrl: existingTgSuper.avatarUrl || verifiedFb.photoUrl || DEFAULT_AVATAR,
          linkedUids: Array.from(new Set([...(existingTgSuper.linkedUids || [existingTgSuper.uid]), verifiedFb.uid])),
          role: 'super_admin',
          approvedRoles: [
            'student',
            'ambassador',
            'school_admin',
            'district_coordinator',
            'regional_coordinator',
            'moderator',
            'super_admin',
            'sponsor',
          ],
          isVerified: true,
          isOnboarded: true,
        });
        if (!centralDb.uidAliases) centralDb.uidAliases = {};
        centralDb.uidAliases[verifiedFb.uid] = user.uid;
        saveCentralDb();
      } else {
        const welcomeBonus = getConfiguredReward('welcomeBonus');
        user = upsertUser({
          uid: verifiedFb.uid,
          fullName: verifiedFb.displayName || fullName || 'Eko-Qahramon',
          email: verifiedFb.email || email || '',
          avatarUrl: verifiedFb.photoUrl || DEFAULT_AVATAR,
          profileImage: verifiedFb.photoUrl || DEFAULT_AVATAR,
          role: isVerifiedSuper ? 'super_admin' : 'student',
          approvedRoles: isVerifiedSuper
            ? ['student', 'ambassador', 'school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin', 'sponsor']
            : ['student'],
          ecoCoins: welcomeBonus,
          totalCoinsEarned: welcomeBonus,
          isVerified: isVerifiedSuper,
          isOnboarded: isVerifiedSuper,
          welcomeBonusClaimed: true,
          region: isVerifiedSuper ? 'Toshkent shahri' : '',
          district: isVerifiedSuper ? 'Shayxontohur tumani' : '',
          schoolId: 'school_new',
          schoolName: 'Maktab kiritilmagan',
          schoolNumber: '',
          registrationDate: new Date().toISOString(),
          activityStats: { reportsCount: 0, cleanupsCount: 0, treesPlanted: 0, streakDays: 1, totalCoinsEarned: welcomeBonus },
        });
        reconcileSchoolsAndStudents(false);
        saveCentralDb();
      }
    }

    const sessionToken = issueSessionToken(user);
    res.json({ success: true, sessionToken, user: sanitizeSelfUser(user) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Generate 1-time 15-minute code to link current Web/PWA session with Telegram Bot & Mini App
app.post('/api/auth/telegram-link-token', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const canonicalUid = resolveCanonicalUid(caller.uid) || caller.uid;
    if (!centralDb.telegramLinkTokens) centralDb.telegramLinkTokens = {};

    const nowMs = Date.now();
    for (const [k, v] of Object.entries(centralDb.telegramLinkTokens)) {
      if (!v?.expiresAt || Date.parse(v.expiresAt) < nowMs) {
        delete centralDb.telegramLinkTokens[k];
      }
    }

    const code = crypto.randomBytes(5).toString('hex').toUpperCase();
    const createdAt = new Date(nowMs).toISOString();
    const expiresAt = new Date(nowMs + 15 * 60 * 1000).toISOString();
    centralDb.telegramLinkTokens[code] = {
      code,
      uid: canonicalUid,
      createdAt,
      expiresAt,
    };
    saveCentralDb();

    const cleanBot = String(activeBotUsername || 'Ecoheros_bot').replace(/^@/, '');
    res.json({
      success: true,
      code,
      botUsername: cleanBot,
      deepLink: `https://t.me/${cleanBot}?start=link_${code}`,
      expiresAt,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Exchange 1-time /web magic token or 6-character code generated in Telegram Bot into Web/PWA session
app.post('/api/auth/telegram-magic-login', (req, res) => {
  try {
    const { token, code } = req.body || {};
    const rawInput = String(token || code || '').trim();
    if (!rawInput) {
      return res.status(400).json({ error: 'Telegram kirish kodi yoki havolasi talab qilinadi' });
    }
    if (!centralDb.telegramLoginTokens) centralDb.telegramLoginTokens = {};

    const nowMs = Date.now();
    for (const [k, v] of Object.entries(centralDb.telegramLoginTokens)) {
      if (!v?.expiresAt || Date.parse(v.expiresAt) < nowMs) {
        delete centralDb.telegramLoginTokens[k];
      }
    }

    const upperInput = rawInput.toUpperCase();
    const matchedEntry = Object.entries(centralDb.telegramLoginTokens).find(
      ([k, v]) => k === rawInput || v.token === rawInput || String(v.code || '').toUpperCase() === upperInput
    );

    if (!matchedEntry) {
      return res.status(401).json({
        error: "Kirish kodi noto'g'ri yoki muddati tugagan. Telegram botda /web buyrug'ini qayta yuboring.",
      });
    }

    const [entryKey, entry] = matchedEntry;
    delete centralDb.telegramLoginTokens[entryKey];

    const targetUser =
      findUserByAnyIdentifier({ uid: entry.uid, telegramId: entry.telegramId }) ||
      centralDb.users[resolveCanonicalUid(entry.uid)];
    if (!targetUser) {
      saveCentralDb();
      return res.status(404).json({ error: 'Ushbu Telegram hisobi topilmadi' });
    }

    syncUserStatsConsistency(targetUser);
    saveCentralDb();

    const sessionToken = issueSessionToken(targetUser);
    res.json({
      success: true,
      sessionToken,
      user: sanitizeSelfUser(targetUser),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/register-user', async (req, res) => {
  try {
    const { email, password, fullName, phoneNumber, schoolName, schoolNumber, region, district, grade } = req.body || {};

    if (!email || !fullName) {
      return res.status(400).json({ error: "Email va to'liq ism talab qilinadi" });
    }
    const cleanPassword = String(password || '');
    if (cleanPassword.length < 6) {
      return res.status(400).json({ error: "Parol kamida 6 ta belgidan iborat bo'lishi shart" });
    }

    const existing = findUserByAnyIdentifier({ email, phoneNumber });
    if (existing) {
      return res.status(409).json({ error: "Ushbu email yoki telefon raqam bilan foydalanuvchi allaqachon ro'yxatdan o'tgan" });
    }

    const passwordHash = await hashPassword(cleanPassword);
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

    const uid = `user_${crypto.randomUUID()}`;
    const userProfile = upsertUser({
      uid,
      fullName: String(fullName).trim(),
      email: String(email).trim().toLowerCase(),
      passwordHash,
      phoneNumber: phoneNumber || '',
      role: 'student',
      approvedRoles: ['student'],
      schoolId: linkedSchool?.id || 'school_custom',
      schoolName: linkedSchool?.name || cleanSchoolName,
      schoolNumber: normalizeSchoolNumber(cleanSchoolName, schoolNumber),
      region: cleanRegion,
      district: cleanDistrict,
      grade: grade || '9-sinf',
      ecoCoins: welcomeBonus,
      totalCoinsEarned: welcomeBonus,
      reportsCount: 0,
      cleanupsCount: 0,
      treesPlanted: 0,
      streakDays: 1,
      badge: 'Yangi Eko-Qahramon',
      referralCode: `ECO${uid.replace(/[^a-zA-Z0-9]/g, '').slice(-4).toUpperCase()}`,
      isVerified: false,
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
        totalCoinsEarned: welcomeBonus,
      },
    });

    recordTransaction({
      userId: userProfile.uid,
      amount: welcomeBonus,
      type: 'bonus',
      status: 'approved',
      reason: `ECO HERO ro'yxatdan o'tish tabrik bonusi (+${welcomeBonus} EcoCoin)`,
    });
    reconcileSchoolsAndStudents(false);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'users' });

    addAuditLog({
      actorUid: userProfile.uid,
      actorName: userProfile.fullName,
      actorRole: userProfile.role,
      action: 'user_registered',
      targetCollection: 'users',
      targetId: userProfile.uid,
      details: { email: userProfile.email, schoolName: userProfile.schoolName, region: cleanRegion },
    });

    const sessionToken = issueSessionToken(userProfile);
    const refreshedSchool = centralDb.schools.find((s) => s.id === userProfile.schoolId) || linkedSchool;
    res.json({
      success: true,
      sessionToken,
      user: sanitizeSelfUser(userProfile),
      school: refreshedSchool,
      liveMetrics: computeLiveMetrics(),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/auth/login-user', async (req, res) => {
  try {
    const { email, identifier, phoneNumber, password } = req.body || {};
    const rawId = String(email || identifier || phoneNumber || '').trim();
    if (!rawId) {
      return res.status(400).json({ error: 'Email yoki telefon raqami kiritilishi shart' });
    }
    const rawPassword = String(password || '');
    if (!rawPassword) {
      return res.status(400).json({ error: 'Parol kiritilishi shart' });
    }

    const user = findUserByAnyIdentifier({
      email: rawId.includes('@') ? rawId : undefined,
      phoneNumber: !rawId.includes('@') ? rawId : undefined,
    });
    if (!user) {
      return res.status(404).json({ error: "Hisob topilmadi. Iltimos avval ro'yxatdan o'ting." });
    }
    if (!user.passwordHash) {
      return res.status(401).json({
        error: "Ushbu hisobda parol o'rnatilmagan. Google yoki Telegram orqali kiring.",
      });
    }

    const { valid, needsRehash } = await verifyPassword(rawPassword, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: "Parol noto'g'ri kiritildi" });
    }

    if (needsRehash) {
      user.passwordHash = await hashPassword(rawPassword);
      saveCentralDb();
    }

    const sessionToken = issueSessionToken(user);
    res.json({ success: true, sessionToken, user: sanitizeSelfUser(user) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/onboarding', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const { fullName, phoneNumber, region, district, schoolName, grade } = req.body || {};
    const cleanFullName = String(fullName || '').trim();
    const cleanPhone = String(phoneNumber || '').trim();
    const phoneDigits = cleanPhone.replace(/\D/g, '');
    if (!cleanFullName || phoneDigits.length < 9) {
      return res.status(400).json({ error: "Ism-familiya va to'g'ri telefon raqami kiritilishi shart" });
    }

    let existing = centralDb.users[caller.uid] || caller;
    let canonicalUid = String(existing.uid);

    // Check if another account already holds this exact phone number
    const phoneOwner = findUserByAnyIdentifier({ phoneNumber: cleanPhone });
    if (phoneOwner && phoneOwner.uid !== canonicalUid) {
      const sameVerifiedTelegram =
        existing.telegramId &&
        phoneOwner.telegramId &&
        String(existing.telegramId) === String(phoneOwner.telegramId);
      if (sameVerifiedTelegram) {
        existing = mergeUserAccounts(phoneOwner.uid, canonicalUid) || phoneOwner;
        canonicalUid = String(existing.uid);
      } else if (phoneOwner.isOnboarded) {
        return res.status(409).json({
          error:
            "Ushbu telefon raqami bilan hisob allaqachon mavjud. Yagona hisobingizga kirish uchun Telegram botda /web buyrug'ini yuboring yoki profilingizdan Telegram Bot bilan bog'lang.",
          code: 'PHONE_ALREADY_EXISTS',
        });
      }
    }

    const callerTelegramId = existing.telegramId || null;
    const callerTelegramUsername = existing.telegramUsername || '';
    const callerEmail = existing.email || '';

    const cleanRegion = String(region || existing?.region || 'Toshkent shahri').trim();
    const cleanDistrict = String(district || existing?.district || 'Shayxontohur tumani').trim();
    const cleanSchoolName = String(schoolName || existing?.schoolName || '1-maktab').trim();
    const schoolNumber = normalizeSchoolNumber(cleanSchoolName);

    const welcomeBonus = getConfiguredReward('welcomeBonus');
    const isFirstWelcomeBonus = !existing?.welcomeBonusClaimed;
    const baseCoins = existing?.ecoCoins || 0;
    const newCoins = isFirstWelcomeBonus ? Math.max(baseCoins, 0) + welcomeBonus : baseCoins;
    const totalEarned = isFirstWelcomeBonus ? (existing?.totalCoinsEarned || 0) + welcomeBonus : (existing?.totalCoinsEarned || newCoins);

    const isSameSchool = existing?.schoolName === cleanSchoolName && existing?.region === cleanRegion && existing?.district === cleanDistrict;
    const linkedSchool = findOrCreateSchool({
      schoolId: isSameSchool ? existing?.schoolId : undefined,
      schoolName: cleanSchoolName,
      schoolNumber,
      region: cleanRegion,
      district: cleanDistrict,
      coinsDelta: isFirstWelcomeBonus ? welcomeBonus : 0,
      incrementStudents: !existing?.isOnboarded || !existing?.schoolId,
    });

    const profile = upsertUser({
      uid: canonicalUid,
      userId: canonicalUid,
      chatId: callerTelegramId ? String(callerTelegramId) : existing?.chatId,
      telegramId: callerTelegramId,
      telegramUsername: callerTelegramUsername,
      email: callerEmail || (callerTelegramId ? `${callerTelegramId}@telegram.ecohero.uz` : `${canonicalUid}@ecohero.uz`),
      fullName: cleanFullName,
      phoneNumber: cleanPhone,
      region: cleanRegion,
      district: cleanDistrict,
      schoolId: linkedSchool?.id || existing?.schoolId || 'school_custom',
      schoolName: linkedSchool?.name || cleanSchoolName,
      schoolNumber,
      grade: grade || '9-sinf',
      ecoCoins: newCoins,
      totalCoinsEarned: totalEarned,
      reportsCount: existing?.reportsCount || 0,
      treesPlanted: existing?.treesPlanted || 0,
      cleanupsCount: existing?.cleanupsCount || 0,
      streakDays: existing?.streakDays || 1,
      role: existing?.role || 'student',
      approvedRoles: existing?.approvedRoles || ['student'],
      badge: existing?.badge || 'Yangi Eko-Qahramon',
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
        totalCoinsEarned: totalEarned,
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

    if (callerTelegramId && centralDb.registrationSessions[String(callerTelegramId)]) {
      delete centralDb.registrationSessions[String(callerTelegramId)];
    }
    if (callerTelegramId && centralDb.botStarters?.[String(callerTelegramId)]) {
      centralDb.botStarters[String(callerTelegramId)].firstTimeRefEligible = false;
    }
    reconcileSchoolsAndStudents(false);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'users' });

    const sessionToken = issueSessionToken(profile);
    const sanitized = sanitizeSelfUser(profile);
    const refreshedSchool = centralDb.schools.find((s) => s.id === profile.schoolId) || linkedSchool;
    res.json({
      success: true,
      sessionToken,
      profile: sanitized,
      user: sanitized,
      school: refreshedSchool,
      liveMetrics: computeLiveMetrics(),
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
      allowStudentMessages,
      notificationsEnabled,
      preferredLanguage,
    } = req.body;

    const existing = centralDb.users[caller.uid] || caller;
    const safeUpdates: Record<string, any> = {};
    if (typeof fullName === 'string' && fullName.trim().length >= 2) safeUpdates.fullName = fullName.trim();
    if (typeof phoneNumber === 'string') safeUpdates.phoneNumber = phoneNumber.trim();
    if (typeof region === 'string' && region.trim()) safeUpdates.region = region.trim();
    if (typeof district === 'string' && district.trim()) safeUpdates.district = district.trim();
    if (typeof grade === 'string') safeUpdates.grade = grade.trim();
    if (typeof avatarUrl === 'string') {
      safeUpdates.avatarUrl = avatarUrl;
      safeUpdates.customAvatar = true;
    }
    if (typeof profileImage === 'string') {
      safeUpdates.profileImage = profileImage;
      safeUpdates.customAvatar = true;
    }
    if (typeof allowStudentMessages === 'boolean') safeUpdates.allowStudentMessages = allowStudentMessages;
    if (typeof notificationsEnabled === 'boolean') safeUpdates.notificationsEnabled = notificationsEnabled;
    if (typeof preferredLanguage === 'string' && ['uz', 'ru', 'en'].includes(preferredLanguage)) {
      safeUpdates.preferredLanguage = preferredLanguage;
    }

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
    reconcileSchoolsAndStudents(false);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'users' });

    res.json({ success: true, profile: sanitizeSelfUser(updated), liveMetrics: computeLiveMetrics() });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/user/change-password', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const { currentPassword, newPassword } = req.body || {};
    const nextPass = String(newPassword || '');
    if (nextPass.length < 6) {
      return res.status(400).json({ error: "Yangi parol kamida 6 ta belgidan iborat bo'lishi kerak" });
    }

    const existing = centralDb.users[caller.uid] || caller;
    if (existing.passwordHash) {
      const curPass = String(currentPassword || '');
      if (!curPass) {
        return res.status(400).json({ error: 'Joriy parolni kiriting' });
      }
      const check = await verifyPassword(curPass, existing.passwordHash);
      if (!check.valid) {
        return res.status(401).json({ error: "Joriy parol noto'g'ri kiritildi" });
      }
    }

    const newHash = await hashPassword(nextPass);
    upsertUser({
      ...existing,
      passwordHash: newHash,
      uid: existing.uid,
    });
    saveCentralDb();

    res.json({ success: true, message: 'Parol muvaffaqiyatli yangilandi' });
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

// Server-Authoritative Progressive Daily Eco-Streak Status & Claim (Asia/Tashkent)
app.get('/api/streak/status', (req: AuthenticatedRequest, res) => {
  const caller = req.authUser || null;
  const serverDateKey = getUzbekistanDateKey();
  const state = computeUserStreakState(
    {
      lastStreakClaimDate: caller?.lastStreakClaimDate || null,
      storedStreakDays: caller?.streakDays ?? caller?.activityStats?.streakDays ?? 0,
    },
    serverDateKey
  );
  res.json({
    success: true,
    serverDateKey,
    streakState: state,
  });
});

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

    syncUserStatsConsistency(caller);
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
          "Esri World Imagery tarixiy/arxiv tasvir (jonli emas). Yo'l va hudud nomlari Esri World Boundaries & Transportation bilan ko'rsatiladi.",
      },
      {
        id: 'street',
        name: 'Normal Map (OpenStreetMap)',
        tileUrls: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        isPaid: false,
        isLiveImagery: false,
        licenseNote: 'OpenStreetMap bepul ochiq ko‘cha xaritasi.',
      },
      {
        id: 'dark',
        name: 'Tungi Eko-Xarita (OpenStreetMap)',
        tileUrls: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
        attribution: '© OpenStreetMap contributors',
        maxZoom: 19,
        isPaid: false,
        isLiveImagery: false,
        licenseNote: 'OpenStreetMap tungi rejim (CSS filtr bilan).',
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
      broadcastRealtimeEvent('db:updated', {
        scope: 'schools',
        action: 'updated',
        schoolId,
      });
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
    notifySuperAdminsTelegram(
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

    notifySuperAdminsTelegram(
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

async function approveRoleRequestUnified(requestId: string, reviewedBy: string = 'Super Admin') {
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
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
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
      fs.mkdirSync(UPLOADS_DIR, { recursive: true });
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
      aiVerification: req.body?.aiVerification && typeof req.body.aiVerification === 'object' ? req.body.aiVerification : undefined,
      status: 'PENDING',
      awardedCoins: 0,
      createdAt: new Date().toISOString(),
    };

    centralDb.mediaSubmissions.unshift(submission);
    saveCentralDb();

    notifySuperAdminsTelegram(
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
      author.ecoXP = Math.max(Number(author.ecoXP || 0), Number(author.totalCoinsEarned || 0) * 4) + awarded * 4;
      syncUserStatsConsistency(author);
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
    broadcastRealtimeEvent('db:updated', { scope: 'reward_settings' });
    upsertCatalogDocToFirestoreRest('reward_settings', 'default', updated, getFirebaseTokenFromReq(req)).catch(() => {});

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
    } else if (tier === 'class' || tier === 'classes') {
      const classMap = new Map<string, any>();
      const usersList = Object.values(centralDb.users || {}) as any[];
      const schoolFilter = req.query.schoolId ? String(req.query.schoolId).trim() : '';
      for (const u of usersList) {
        if (!u || typeof u !== 'object') continue;
        const rawGrade = String(u.grade || '').trim().toUpperCase();
        if (!rawGrade) continue;
        const sId = String(u.schoolId || u.schoolName || 'unknown');
        if (schoolFilter && schoolFilter !== 'all' && sId !== schoolFilter) continue;
        const key = `${sId}__${rawGrade}`;
        const cur = classMap.get(key) || {
          id: key,
          grade: rawGrade,
          name: `${rawGrade} sinfi`,
          schoolId: u.schoolId || '',
          schoolName: u.schoolName || 'Maktab',
          region: u.region || '',
          district: u.district || '',
          studentsCount: 0,
          points: 0,
          treesPlanted: 0,
          reportsCount: 0,
          topStudentName: u.fullName || "O'quvchi",
          topStudentCoins: -1,
        };
        const uCoins = Number(u.totalCoinsEarned || u.ecoCoins || 0);
        cur.studentsCount += 1;
        cur.points += uCoins;
        cur.treesPlanted += Number(u.treesPlanted || u.activityStats?.treesPlanted || 0);
        cur.reportsCount += Number(u.reportsCount || u.activityStats?.reportsCount || 0);
        if (uCoins > cur.topStudentCoins) {
          cur.topStudentCoins = uCoins;
          cur.topStudentName = u.fullName || cur.topStudentName;
        }
        classMap.set(key, cur);
      }
      items = Array.from(classMap.values()).map((c) => ({
        ...c,
        leagueTier:
          c.points >= 3000 ? 'Olmos Liga' : c.points >= 1500 ? 'Oltin Liga' : c.points >= 500 ? 'Zumrad Liga' : 'Bronza Liga',
      }));
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

// 3-Stage Live Championship Endpoint (District 1mo / Regional 3mo Top-3 Gated / National 3mo)
app.get('/api/championship/live', (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser || null;
    const level = (['district', 'regional', 'national'].includes(String(req.query.level))
      ? String(req.query.level)
      : 'district') as 'district' | 'regional' | 'national';
    const entity = req.query.entity === 'students' ? 'students' : 'schools';
    const regionFilter = req.query.region ? String(req.query.region).trim() : '';
    const districtFilter = req.query.district ? String(req.query.district).trim() : '';

    const eligibility = buildChampionshipEligibility(caller);

    if (level === 'regional' && !eligibility.regionalUnlocked) {
      return res.json({
        success: true,
        level,
        entity,
        serverNow: new Date().toISOString(),
        locked: true,
        lockReason: eligibility.reasonUz,
        eligibility,
        schools: [],
        students: [],
        totals: {
          schoolsCount: 0,
          studentsCount: 0,
          allPlatformSchools: centralDb.schools.length,
          allPlatformUsers: Object.keys(centralDb.users || {}).length,
        },
        recentWinners: [],
      });
    }

    recalculateSchoolRanks();
    const resolvedReports = (centralDb.reports || []).filter((r: any) =>
      ['resolved', 'RESOLVED', 'verified'].includes(String(r.status || ''))
    );
    const approvedMedia = (centralDb.mediaSubmissions || []).filter((m: any) => m.status === 'APPROVED');
    const allUsers = getAllPublicUsersForRankings() as any[];

    const matchRegion = (reg?: string) =>
      !regionFilter || regionFilter === 'all' || String(reg || '').trim().toLowerCase() === regionFilter.toLowerCase();
    const matchDistrict = (dist?: string) =>
      !districtFilter || districtFilter === 'all' || String(dist || '').trim().toLowerCase() === districtFilter.toLowerCase();

    // When regional stage is open, show top-3 district qualifiers per district (or all active in region if none marked yet)
    let schoolsList = centralDb.schools.filter((s: any) => {
      if (level === 'district') return matchRegion(s.region) && matchDistrict(s.district);
      if (level === 'regional') return matchRegion(s.region);
      return true;
    });

    const enrichedSchools = schoolsList.map((s: any) => {
      const resCount = resolvedReports.filter((r: any) => r.schoolId === s.id || r.schoolName === s.name).length;
      const medCount = approvedMedia.filter((m: any) => m.schoolId === s.id || m.schoolName === s.name).length;
      const studentsCount = getSchoolLiveStudentCount(s);
      const points =
        Number(s.totalCoins || 0) +
        resCount * 150 +
        medCount * 100 +
        Number(s.treesPlanted || 0) * 15 +
        Number(s.cleanupsCompleted || 0) * 80;
      return {
        id: s.id,
        name: s.name,
        number: s.number || '',
        region: s.region || '',
        district: s.district || '',
        studentsCount,
        treesPlanted: Number(s.treesPlanted || 0),
        resolvedReports: resCount,
        approvedMedia: medCount,
        totalCoins: Number(s.totalCoins || 0),
        points,
        logoUrl: s.logoUrl || '',
        isMine: Boolean(caller?.schoolId && caller.schoolId === s.id),
      };
    });

    enrichedSchools.sort((a: any, b: any) => b.points - a.points);
    const rankedSchools = enrichedSchools.map((s: any, idx: number) => ({
      ...s,
      rank: idx + 1,
      qualified: idx < 3,
    }));

    const studentUsers = allUsers.filter((u: any) => {
      if (!u || typeof u !== 'object') return false;
      if (level === 'district') return matchRegion(u.region) && matchDistrict(u.district);
      if (level === 'regional') return matchRegion(u.region);
      return true;
    });

    const monthStatus = getTashkentMonthStatus();
    const monthlyStats = computeMonthlyStudentActivityStats(monthStatus);

    const enrichedStudents = studentUsers.map((u: any) => {
      const mStat = monthlyStats.get(u.uid);
      const totalEarned = Number(u.totalCoinsEarned || u.ecoCoins || 0);
      const monthlyScore = mStat
        ? mStat.earnedCoins + mStat.reportsCount * 50 + mStat.mediaCount * 40 + mStat.missionsCount * 30
        : 0;
      const score =
        level === 'district' && mStat
          ? Math.max(monthlyScore, totalEarned)
          : totalEarned + Number(u.reportsCount || 0) * 100 + Number(u.treesPlanted || 0) * 30;
      return {
        uid: u.uid,
        name: u.fullName || 'Eko-Qahramon',
        schoolId: u.schoolId || '',
        schoolName: u.schoolName || 'Maktab',
        grade: u.grade || '',
        region: u.region || '',
        district: u.district || '',
        avatarUrl: u.avatarUrl || u.profileImage || '',
        badge: u.badge || 'Eko-Qahramon',
        totalCoins: Number(u.ecoCoins || 0),
        points: score,
        treesPlanted: Number(u.treesPlanted || 0),
        reportsCount: Number(u.reportsCount || 0),
        isMe: Boolean(caller?.uid && caller.uid === u.uid),
      };
    });

    enrichedStudents.sort((a: any, b: any) => b.points - a.points);
    const rankedStudents = enrichedStudents.map((st: any, idx: number) => ({
      ...st,
      rank: idx + 1,
      qualified: idx < 3,
    }));

    const recentWinners = [
      ...(centralDb.studentMonthlyAwards || []).slice(0, 4).map((w: any) => ({
        id: w.id,
        title: `${w.periodLabel} · ${w.district || w.region}`,
        winners: (w.winners || []).slice(0, 3).map((x: any) => `${x.rank}. ${x.fullName}`),
        awardedAt: w.awardedAt,
      })),
      ...(centralDb.monthlyAwards || []).slice(0, 4).map((w: any) => ({
        id: w.id,
        title: `${w.periodLabel} · ${w.district} (Maktablar)`,
        winners: (w.topSchools || []).slice(0, 3).map((x: any) => `${x.rank}. ${x.name}`),
        awardedAt: w.awardedAt,
      })),
    ].slice(0, 6);

    res.json({
      success: true,
      level,
      entity,
      serverNow: new Date().toISOString(),
      locked: false,
      eligibility,
      schools: rankedSchools.slice(0, 50),
      students: rankedStudents.slice(0, 50),
      totals: {
        schoolsCount: rankedSchools.length,
        studentsCount: rankedStudents.length,
        allPlatformSchools: centralDb.schools.length,
        allPlatformUsers: Object.keys(centralDb.users || {}).length,
      },
      recentWinners,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Real-Time District Schools & Ambassadors Leaderboard (Monthly + Overall, Verified Activity Only)
function computeDistrictLeaderboardDetails(params: {
  region?: string;
  district?: string;
  viewerUid?: string;
  viewerSchoolId?: string;
  mode?: 'monthly' | 'overall';
}) {
  const rankingMode: 'monthly' | 'overall' = params.mode === 'overall' ? 'overall' : 'monthly';
  const monthStatus = getTashkentMonthStatus();
  const firstSchool = (centralDb.schools || [])[0];
  const targetRegion = String(params.region || firstSchool?.region || '').trim();
  const targetDistrict = String(params.district || firstSchool?.district || '').trim();

  // Strictly count ONLY verified/resolved reports (NEVER unapproved/pending/rejected)
  const resolvedReports = (centralDb.reports || []).filter((r) =>
    ['resolved', 'RESOLVED'].includes(String(r.status || ''))
  );
  const approvedMedia = (centralDb.mediaSubmissions || []).filter((m) => m.status === 'APPROVED');
  const verifiedTasks = (centralDb.ecoTasks || []).filter((t) => t.status === 'verified');
  const approvedEarnTx = (centralDb.transactions || []).filter(
    (t) => t.status === 'approved' && (t.type === 'earn' || t.type === 'bonus')
  );

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

  // All Eco-Elchis in this district — strictly verified activity for Monthly & Overall modes
  const districtSchoolIds = new Set(districtSchoolsRaw.map((s) => s.id));
  const ambMap = new Map<string, any>();

  const computeAmbMetrics = (uid: string, seedAmb?: any, seedUser?: any) => {
    const u = seedUser || centralDb.users?.[uid];
    const matchedSchool = centralDb.schools.find((sc) => sc.id === (u?.schoolId || seedAmb?.schoolId));
    const userResolvedReports = resolvedReports.filter(
      (r) =>
        r.assignedAmbassadorUid === uid ||
        (r.reporterUid === uid && !r.assignedAmbassadorUid && Boolean(r.rewardsIssued || r.coinsAwarded))
    );
    const monthlyResolved = userResolvedReports.filter((r) =>
      isDateInTashkentMonth(r.resolvedAt || r.finalReviewedAt || r.updatedAt || r.createdAt, monthStatus)
    );
    const userMedia = approvedMedia.filter((m) => m.userId === uid);
    const monthlyMedia = userMedia.filter((m) =>
      isDateInTashkentMonth(m.moderatedAt || m.updatedAt || m.createdAt, monthStatus)
    );
    const userTasks = verifiedTasks.filter((t) => t.assigneeUid === uid);
    const monthlyTasks = userTasks.filter((t) =>
      isDateInTashkentMonth(t.updatedAt || t.createdAt, monthStatus)
    );
    const userMonthlyTxCoins = approvedEarnTx
      .filter((t) => t.userId === uid && isDateInTashkentMonth(t.createdAt, monthStatus))
      .reduce((acc, t) => acc + Math.max(0, Number(t.amount || 0)), 0);

    const resolvedProblemsCount = userResolvedReports.length;
    const monthlyResolvedProblemsCount = monthlyResolved.length;
    const verifiedActivitiesCount = userMedia.length + resolvedProblemsCount;
    const monthlyVerifiedActivitiesCount = monthlyMedia.length + monthlyResolvedProblemsCount;
    const tasksCompletedCount = userTasks.length;
    const monthlyTasksCompletedCount = monthlyTasks.length;

    const ecoCoins = Number(u?.ecoCoins ?? seedAmb?.ecoCoins ?? 0);
    const totalCoinsEarned = Math.max(ecoCoins, Number(u?.totalCoinsEarned ?? seedAmb?.ecoCoins ?? 0));
    const ecoXP = Math.max(
      Number(u?.ecoXP || 0),
      resolvedProblemsCount * 800 + userMedia.length * 300 + tasksCompletedCount * 400
    );
    const monthlyXP =
      monthlyResolvedProblemsCount * 800 +
      monthlyMedia.length * 300 +
      monthlyTasksCompletedCount * 400 +
      Math.round(userMonthlyTxCoins * 2);

    const overallScore =
      totalCoinsEarned +
      resolvedProblemsCount * 250 +
      userMedia.length * 100 +
      tasksCompletedCount * 120;
    const monthlyScore =
      userMonthlyTxCoins +
      monthlyResolvedProblemsCount * 250 +
      monthlyMedia.length * 100 +
      monthlyTasksCompletedCount * 120;

    return {
      id: uid,
      fullName: u?.fullName || seedAmb?.fullName || 'Eco-Elchi',
      schoolId: u?.schoolId || seedAmb?.schoolId || '',
      schoolName: u?.schoolName || seedAmb?.schoolName || matchedSchool?.name || 'Maktab',
      region: u?.region || seedAmb?.region || matchedSchool?.region || targetRegion,
      district: u?.district || seedAmb?.district || matchedSchool?.district || targetDistrict,
      ecoCoins,
      ecoXP,
      monthlyXP,
      monthlyCoinsEarned: userMonthlyTxCoins,
      verifiedActivitiesCount,
      monthlyVerifiedActivitiesCount,
      tasksCompletedCount,
      monthlyTasksCompletedCount,
      resolvedReportsCount: resolvedProblemsCount,
      resolvedProblemsCount,
      monthlyResolvedProblemsCount,
      monthlyScore,
      overallScore,
      isMe: Boolean(params.viewerUid && uid === params.viewerUid),
    };
  };

  for (const a of centralDb.ambassadors || []) {
    if (a.status === 'revoked') continue;
    const inDist =
      !targetDistrict ||
      districtSchoolIds.has(a.schoolId) ||
      String(a.district || '').toLowerCase() === targetDistrict.toLowerCase();
    if (!inDist) continue;
    ambMap.set(a.id, computeAmbMetrics(a.id, a, centralDb.users?.[a.id]));
  }

  for (const u of allUsersList) {
    const isAmbRole = u.role === 'ambassador' || (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('ambassador'));
    if (!isAmbRole) continue;
    const inDist =
      !targetDistrict ||
      districtSchoolIds.has(u.schoolId) ||
      String(u.district || '').toLowerCase() === targetDistrict.toLowerCase();
    if (!inDist) continue;
    const existingAmb = (centralDb.ambassadors || []).find((a: any) => a.id === u.uid);
    if (existingAmb?.status === 'revoked') continue;
    ambMap.set(u.uid, computeAmbMetrics(u.uid, existingAmb, u));
  }

  const baseList = Array.from(ambMap.values());
  const buildRankedList = (modeKey: 'monthly' | 'overall') => {
    const sorted = [...baseList]
      .map((item) => ({
        ...item,
        realScore: modeKey === 'monthly' ? item.monthlyScore : item.overallScore,
      }))
      .sort((a, b) => {
        if (b.realScore !== a.realScore) return b.realScore - a.realScore;
        const bRes = modeKey === 'monthly' ? b.monthlyResolvedProblemsCount : b.resolvedProblemsCount;
        const aRes = modeKey === 'monthly' ? a.monthlyResolvedProblemsCount : a.resolvedProblemsCount;
        if (bRes !== aRes) return bRes - aRes;
        if (b.ecoCoins !== a.ecoCoins) return b.ecoCoins - a.ecoCoins;
        return String(a.fullName).localeCompare(String(b.fullName));
      });
    const total = sorted.length;
    return sorted.map((item, idx) => ({
      ...item,
      rank: idx + 1,
      isTop3: idx < 3,
      isLast: total > 1 && idx === total - 1,
    }));
  };

  const ambassadorRatingsMonthly = buildRankedList('monthly');
  const ambassadorRatingsOverall = buildRankedList('overall');
  const ambassadorRatings =
    rankingMode === 'overall' ? ambassadorRatingsOverall : ambassadorRatingsMonthly;
  const myAmbassadorMonthlyRating = ambassadorRatingsMonthly.find((a) => a.isMe) || null;
  const myAmbassadorOverallRating = ambassadorRatingsOverall.find((a) => a.isMe) || null;
  const myAmbassadorRating =
    rankingMode === 'overall' ? myAmbassadorOverallRating : myAmbassadorMonthlyRating;

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
    rankingMode,
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
    top10Ambassadors: ambassadorRatings.slice(0, 10),
    myAmbassadorRating,
    ambassadorRatingsMonthly,
    ambassadorRatingsOverall,
    myAmbassadorMonthlyRating,
    myAmbassadorOverallRating,
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
    const mode = req.query.mode === 'overall' ? 'overall' : 'monthly';

    const details = computeDistrictLeaderboardDetails({
      region,
      district,
      viewerUid: caller.uid,
      viewerSchoolId: caller.schoolId,
      mode,
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
// 2A. SCHOOL (50+) & DISTRICT (500+) STUDENT MONTHLY RATINGS
// ==========================================

function ensureRatingConfigsContainer() {
  if (!centralDb.ratingConfigs || typeof centralDb.ratingConfigs !== 'object') {
    centralDb.ratingConfigs = { schoolRatings: {}, districtStudentRatings: {} };
  }
  if (!centralDb.ratingConfigs.schoolRatings) {
    centralDb.ratingConfigs.schoolRatings = {};
  }
  if (!centralDb.ratingConfigs.districtStudentRatings) {
    centralDb.ratingConfigs.districtStudentRatings = {};
  }
  if (!Array.isArray(centralDb.studentMonthlyAwards)) {
    centralDb.studentMonthlyAwards = [];
  }
}

function makeDistrictRatingKey(region?: string, district?: string): string {
  const reg = String(region || '').trim().toLowerCase();
  const dist = String(district || '').trim().toLowerCase();
  return `${reg}__${dist}`;
}

function isDateInTashkentMonth(dateStr: string | undefined, monthStatus: ReturnType<typeof getTashkentMonthStatus>): boolean {
  if (!dateStr) return false;
  const ts = new Date(dateStr).getTime();
  if (Number.isNaN(ts)) return false;
  const tDate = new Date(ts + 5 * 3600 * 1000);
  return tDate.getUTCFullYear() === monthStatus.year && tDate.getUTCMonth() === monthStatus.monthIndex;
}

function getEffectiveSchoolRatingConfig(params: {
  schoolId: string;
  schoolName: string;
  region: string;
  district: string;
}): SchoolStudentRatingConfig {
  ensureRatingConfigsContainer();
  const existing = centralDb.ratingConfigs.schoolRatings[params.schoolId];
  return {
    schoolId: params.schoolId,
    schoolName: existing?.schoolName || params.schoolName || 'Maktab',
    region: existing?.region || params.region || '',
    district: existing?.district || params.district || '',
    enabled: Boolean(existing?.enabled),
    minMembersThreshold: Math.max(1, Number(existing?.minMembersThreshold ?? 50)),
    monthlyPrizeTitle:
      existing?.monthlyPrizeTitle || "Maktabning Eng Faol O'quvchisi — Qimmatbaho Sovg'a",
    bonusCoins: Math.max(0, Number(existing?.bonusCoins ?? 500)),
    activatedAt: existing?.activatedAt,
    activatedByUid: existing?.activatedByUid,
    updatedAt: existing?.updatedAt || new Date().toISOString(),
  };
}

function getEffectiveDistrictStudentRatingConfig(params: {
  region: string;
  district: string;
}): DistrictStudentRatingConfig {
  ensureRatingConfigsContainer();
  const exactKey = makeDistrictRatingKey(params.region, params.district);
  const byExact = centralDb.ratingConfigs.districtStudentRatings[exactKey];
  const byDist =
    byExact ||
    Object.values(centralDb.ratingConfigs.districtStudentRatings).find(
      (c) => String(c.district || '').trim().toLowerCase() === String(params.district || '').trim().toLowerCase()
    );
  const bonusesRaw = Array.isArray(byDist?.bonuses) ? byDist.bonuses : [1500, 1000, 700];
  return {
    key: byDist?.key || exactKey,
    region: byDist?.region || params.region || '',
    district: byDist?.district || params.district || '',
    enabled: Boolean(byDist?.enabled),
    minMembersThreshold: Math.max(1, Number(byDist?.minMembersThreshold ?? 500)),
    top1Prize: byDist?.top1Prize || "1-o'rin: Smart-soat / Planshet + Oltin Diplom",
    top2Prize: byDist?.top2Prize || "2-o'rin: Simsiz Quloqchin + Kumush Diplom",
    top3Prize: byDist?.top3Prize || "3-o'rin: Eko-Ryukzak va Kitoblar To'plami",
    bonuses: [
      Math.max(0, Number(bonusesRaw[0] ?? 1500)),
      Math.max(0, Number(bonusesRaw[1] ?? 1000)),
      Math.max(0, Number(bonusesRaw[2] ?? 700)),
    ],
    activatedAt: byDist?.activatedAt,
    activatedByUid: byDist?.activatedByUid,
    updatedAt: byDist?.updatedAt || new Date().toISOString(),
  };
}

function computeMonthlyStudentActivityStats(monthStatus: ReturnType<typeof getTashkentMonthStatus>) {
  const statsMap = new Map<
    string,
    {
      earnedCoins: number;
      mediaCount: number;
      reportsCount: number;
      missionsCount: number;
    }
  >();

  const ensure = (uid: string) => {
    let rec = statsMap.get(uid);
    if (!rec) {
      rec = { earnedCoins: 0, mediaCount: 0, reportsCount: 0, missionsCount: 0 };
      statsMap.set(uid, rec);
    }
    return rec;
  };

  for (const tx of centralDb.transactions || []) {
    if (!tx?.userId || tx.status === 'rejected') continue;
    if (tx.type !== 'earn' && tx.type !== 'bonus') continue;
    const amt = Number(tx.amount || 0);
    if (amt <= 0) continue;
    if (!isDateInTashkentMonth(tx.createdAt, monthStatus)) continue;
    ensure(String(tx.userId)).earnedCoins += amt;
  }

  for (const m of centralDb.mediaSubmissions || []) {
    if (!m?.userId || m.status !== 'APPROVED') continue;
    if (!isDateInTashkentMonth(m.createdAt, monthStatus)) continue;
    ensure(String(m.userId)).mediaCount += 1;
  }

  for (const r of centralDb.reports || []) {
    if (!r?.reporterUid) continue;
    if (!['verified', 'in_progress', 'resolved', 'APPROVED', 'RESOLVED'].includes(String(r.status || ''))) {
      continue;
    }
    if (!isDateInTashkentMonth(r.createdAt, monthStatus)) continue;
    ensure(String(r.reporterUid)).reportsCount += 1;
  }

  for (const ms of centralDb.missionSubmissions || []) {
    if (!ms?.userId || ms.status !== 'approved') continue;
    if (!isDateInTashkentMonth(ms.createdAt, monthStatus)) continue;
    ensure(String(ms.userId)).missionsCount += 1;
  }

  return statsMap;
}

function buildRankedStudentEntries(
  usersSubset: any[],
  statsMap: Map<string, { earnedCoins: number; mediaCount: number; reportsCount: number; missionsCount: number }>,
  viewerUid?: string
) {
  const ranked = usersSubset
    .filter((u) => u && typeof u === 'object' && (u.role === 'student' || u.role === 'ambassador'))
    .map((u) => {
      const st = statsMap.get(String(u.uid)) || {
        earnedCoins: 0,
        mediaCount: 0,
        reportsCount: 0,
        missionsCount: 0,
      };
      const monthlyScore =
        st.earnedCoins + st.reportsCount * 50 + st.mediaCount * 40 + st.missionsCount * 30;
      const totalCoins = Number(u.ecoCoins || 0);
      return {
        uid: String(u.uid),
        fullName: String(u.fullName || "O'quvchi"),
        grade: u.grade || '',
        schoolId: u.schoolId || '',
        schoolName: u.schoolName || '',
        region: u.region || '',
        district: u.district || '',
        badge: u.badge || 'Eko-Qahramon',
        avatarUrl: u.avatarUrl || u.profileImage || '',
        role: u.role || 'student',
        monthlyScore,
        monthlyEarnedCoins: st.earnedCoins,
        monthlyActivitiesCount: st.reportsCount + st.mediaCount + st.missionsCount,
        monthlyReportsCount: st.reportsCount,
        monthlyMediaCount: st.mediaCount,
        monthlyMissionsCount: st.missionsCount,
        totalCoins,
        totalCoinsEarned: Number(u.totalCoinsEarned || totalCoins),
        treesPlanted: Number(u.treesPlanted || u.activityStats?.treesPlanted || 0),
        isMe: Boolean(viewerUid && String(u.uid) === String(viewerUid)),
      };
    })
    .sort((a, b) => {
      if (b.monthlyScore !== a.monthlyScore) return b.monthlyScore - a.monthlyScore;
      if (b.totalCoinsEarned !== a.totalCoinsEarned) return b.totalCoinsEarned - a.totalCoinsEarned;
      if (b.totalCoins !== a.totalCoins) return b.totalCoins - a.totalCoins;
      return a.fullName.localeCompare(b.fullName);
    })
    .map(({ totalCoinsEarned: _tce, ...entry }, idx) => ({
      ...entry,
      rank: idx + 1,
    }));

  return ranked;
}

function resolveSchoolTargetForStudentRatings(params: { schoolId?: string; schoolName?: string; region?: string; district?: string }) {
  const schoolsList = centralDb.schools || [];
  let matchedSchool: any = null;
  if (params.schoolId) {
    matchedSchool = schoolsList.find((s) => s.id === params.schoolId);
  }
  if (!matchedSchool && params.schoolName) {
    const cleanName = String(params.schoolName).trim().toLowerCase();
    matchedSchool = schoolsList.find(
      (s) =>
        String(s.name || '').trim().toLowerCase() === cleanName &&
        (!params.district || String(s.district || '').trim().toLowerCase() === String(params.district).trim().toLowerCase())
    );
  }
  const schoolId =
    matchedSchool?.id ||
    params.schoolId ||
    `school_${slugifyChatKey(params.schoolName || 'unknown')}`;
  const schoolName = matchedSchool?.name || params.schoolName || 'Maktab biriktirilmagan';
  const region = matchedSchool?.region || params.region || '';
  const district = matchedSchool?.district || params.district || '';
  return { matchedSchool, schoolId, schoolName, region, district };
}

function buildSchoolStudentRatingPayload(params: {
  schoolId?: string;
  schoolName?: string;
  region?: string;
  district?: string;
  viewerUid?: string;
  includeAdminPreview?: boolean;
}) {
  const monthStatus = getTashkentMonthStatus();
  const resolved = resolveSchoolTargetForStudentRatings(params);
  const config = getEffectiveSchoolRatingConfig({
    schoolId: resolved.schoolId,
    schoolName: resolved.schoolName,
    region: resolved.region,
    district: resolved.district,
  });

  const allUsers = Object.values(centralDb.users || {}) as any[];
  const schoolUsers = allUsers.filter((u) => {
    if (!u || typeof u !== 'object') return false;
    if (resolved.matchedSchool) {
      if (u.schoolId && String(u.schoolId).trim() === String(resolved.matchedSchool.id).trim()) return true;
      const uName = String(u.schoolName || '').trim().toLowerCase();
      const sName = String(resolved.matchedSchool.name || '').trim().toLowerCase();
      if (sName && uName && uName === sName) return true;
      if (
        resolved.matchedSchool.number &&
        u.schoolNumber &&
        String(u.schoolNumber).trim() === String(resolved.matchedSchool.number).trim() &&
        resolved.matchedSchool.district &&
        String(u.district || '').trim().toLowerCase() === String(resolved.matchedSchool.district).trim().toLowerCase()
      ) {
        return true;
      }
      return false;
    }
    if (params.schoolId && u.schoolId === params.schoolId) return true;
    if (params.schoolName && String(u.schoolName || '').trim().toLowerCase() === String(params.schoolName).trim().toLowerCase()) {
      return true;
    }
    return false;
  });

  const currentMembersCount = resolved.matchedSchool
    ? getSchoolLiveStudentCount(resolved.matchedSchool)
    : schoolUsers.length;
  const canActivate = currentMembersCount >= config.minMembersThreshold;
  const isLiveActive = Boolean(config.enabled && canActivate);

  const statsMap = computeMonthlyStudentActivityStats(monthStatus);
  const ranked = buildRankedStudentEntries(schoolUsers, statsMap, params.viewerUid);

  const top10Full = ranked.slice(0, 10);
  const myEntryFull = ranked.find((e) => e.isMe) || null;
  const myRank = myEntryFull ? myEntryFull.rank : null;
  const isCallerInTop10 = Boolean(myRank && myRank <= 10);
  const pointsToTop10 =
    myEntryFull && !isCallerInTop10 && top10Full[9]
      ? Math.max(1, top10Full[9].monthlyScore - myEntryFull.monthlyScore + 1)
      : null;
  const pointsToTop1 =
    myEntryFull && myRank && myRank > 1 && top10Full[0]
      ? Math.max(1, top10Full[0].monthlyScore - myEntryFull.monthlyScore + 1)
      : null;

  const recentWinners = (centralDb.studentMonthlyAwards || []).filter(
    (aw: any) => aw.scope === 'school' && aw.schoolId === resolved.schoolId
  );
  const alreadyAwardedThisMonth = recentWinners.some(
    (aw: any) => String(aw.periodKey) === monthStatus.periodKey
  );

  return {
    scope: 'school' as const,
    schoolId: resolved.schoolId,
    schoolName: resolved.schoolName,
    region: resolved.region,
    district: resolved.district,
    enabled: config.enabled,
    minMembersThreshold: config.minMembersThreshold,
    currentMembersCount,
    canActivate,
    isLiveActive,
    periodKey: monthStatus.periodKey,
    periodLabel: monthStatus.periodLabel,
    daysRemainingInMonth: monthStatus.daysRemainingInMonth,
    isLastDayOfMonth: monthStatus.isLastDayOfMonth,
    lastDayDateLabel: monthStatus.lastDayDateLabel,
    prizes: [
      {
        rank: 1,
        title: config.monthlyPrizeTitle,
        bonusCoins: config.bonusCoins,
      },
    ],
    top10: isLiveActive ? top10Full : [],
    ...(params.includeAdminPreview ? { previewTop10: top10Full } : {}),
    totalParticipants: ranked.length,
    myRank: isLiveActive ? myRank : null,
    myEntry: isLiveActive ? myEntryFull : null,
    isCallerInTop10: isLiveActive ? isCallerInTop10 : false,
    pointsToTop10: isLiveActive ? pointsToTop10 : null,
    pointsToTop1: isLiveActive ? pointsToTop1 : null,
    alreadyAwardedThisMonth,
    recentWinners: recentWinners.slice(0, 6),
    rankedAll: ranked,
  };
}

function buildDistrictStudentRatingPayload(params: {
  region?: string;
  district?: string;
  viewerUid?: string;
  includeAdminPreview?: boolean;
}) {
  const monthStatus = getTashkentMonthStatus();
  const firstSchool = (centralDb.schools || [])[0];
  const targetRegion = String(params.region || firstSchool?.region || '').trim();
  const targetDistrict = String(params.district || firstSchool?.district || '').trim();

  const config = getEffectiveDistrictStudentRatingConfig({
    region: targetRegion,
    district: targetDistrict,
  });

  const allUsers = Object.values(centralDb.users || {}) as any[];
  const distNorm = targetDistrict.toLowerCase();
  const regNorm = targetRegion.toLowerCase();
  const districtUsers = allUsers.filter((u) => {
    if (!u || typeof u !== 'object' || !distNorm) return false;
    const uDist = String(u.district || '').trim().toLowerCase();
    const uReg = String(u.region || '').trim().toLowerCase();
    if (uDist !== distNorm) return false;
    if (regNorm && uReg && uReg !== regNorm) return false;
    return true;
  });

  const currentMembersCount = targetDistrict
    ? getDistrictLiveParticipantCount(targetRegion, targetDistrict)
    : 0;
  const canActivate = Boolean(targetDistrict && currentMembersCount >= config.minMembersThreshold);
  const isLiveActive = Boolean(config.enabled && canActivate);

  const statsMap = computeMonthlyStudentActivityStats(monthStatus);
  const ranked = buildRankedStudentEntries(districtUsers, statsMap, params.viewerUid);

  const top10Full = ranked.slice(0, 10);
  const myEntryFull = ranked.find((e) => e.isMe) || null;
  const myRank = myEntryFull ? myEntryFull.rank : null;
  const isCallerInTop10 = Boolean(myRank && myRank <= 10);
  const pointsToTop10 =
    myEntryFull && !isCallerInTop10 && top10Full[9]
      ? Math.max(1, top10Full[9].monthlyScore - myEntryFull.monthlyScore + 1)
      : null;
  const pointsToTop3 =
    myEntryFull && myRank && myRank > 3 && top10Full[2]
      ? Math.max(1, top10Full[2].monthlyScore - myEntryFull.monthlyScore + 1)
      : null;

  const recentWinners = (centralDb.studentMonthlyAwards || []).filter(
    (aw: any) =>
      aw.scope === 'district' &&
      String(aw.district || '').trim().toLowerCase() === distNorm
  );
  const alreadyAwardedThisMonth = recentWinners.some(
    (aw: any) => String(aw.periodKey) === monthStatus.periodKey
  );

  return {
    scope: 'district' as const,
    region: targetRegion,
    district: targetDistrict,
    enabled: config.enabled,
    minMembersThreshold: config.minMembersThreshold,
    currentMembersCount,
    canActivate,
    isLiveActive,
    periodKey: monthStatus.periodKey,
    periodLabel: monthStatus.periodLabel,
    daysRemainingInMonth: monthStatus.daysRemainingInMonth,
    isLastDayOfMonth: monthStatus.isLastDayOfMonth,
    lastDayDateLabel: monthStatus.lastDayDateLabel,
    prizes: [
      { rank: 1, title: config.top1Prize, bonusCoins: config.bonuses[0] },
      { rank: 2, title: config.top2Prize, bonusCoins: config.bonuses[1] },
      { rank: 3, title: config.top3Prize, bonusCoins: config.bonuses[2] },
    ],
    top10: isLiveActive ? top10Full : [],
    ...(params.includeAdminPreview ? { previewTop10: top10Full } : {}),
    totalParticipants: ranked.length,
    myRank: isLiveActive ? myRank : null,
    myEntry: isLiveActive ? myEntryFull : null,
    isCallerInTop10: isLiveActive ? isCallerInTop10 : false,
    pointsToTop10: isLiveActive ? pointsToTop10 : null,
    pointsToTop3: isLiveActive ? pointsToTop3 : null,
    alreadyAwardedThisMonth,
    recentWinners: recentWinners.slice(0, 6),
    rankedAll: ranked,
  };
}

// Student Cabinet: School & District Monthly Student Ratings (Top 10 + Own Rank Below 10)
app.get('/api/student-ratings/cabinet', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const isAdmin = checkIsSuperAdmin(caller);
    const schoolId = isAdmin && req.query.schoolId ? String(req.query.schoolId) : caller.schoolId;
    const schoolName = isAdmin && req.query.schoolName ? String(req.query.schoolName) : caller.schoolName;
    const region = isAdmin && req.query.region ? String(req.query.region) : caller.region;
    const district = isAdmin && req.query.district ? String(req.query.district) : caller.district;

    const { rankedAll: _sa, ...schoolPayload } = buildSchoolStudentRatingPayload({
      schoolId,
      schoolName,
      region,
      district,
      viewerUid: caller.uid,
    });
    const { rankedAll: _da, ...districtPayload } = buildDistrictStudentRatingPayload({
      region,
      district,
      viewerUid: caller.uid,
    });

    res.json({
      success: true,
      school: schoolPayload,
      district: districtPayload,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Management View for School Captains, District Coordinators & Super Admin (includes Top-10 preview)
app.get(
  '/api/student-ratings/manage',
  requireRoles('school_admin', 'district_coordinator', 'regional_coordinator', 'super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const isAdmin = checkIsSuperAdmin(caller);
      const isCaptain = hasAnyRole(caller, ['school_admin']);
      const isDistCoord = hasAnyRole(caller, ['district_coordinator']);
      const isRegCoord = hasAnyRole(caller, ['regional_coordinator']);

      let schoolPayload = null;
      if (isAdmin || isCaptain) {
        const targetSchoolId = isAdmin && req.query.schoolId ? String(req.query.schoolId) : caller.schoolId;
        const targetSchoolName = isAdmin && req.query.schoolName ? String(req.query.schoolName) : caller.schoolName;
        const { rankedAll: _sa, ...builtSchool } = buildSchoolStudentRatingPayload({
          schoolId: targetSchoolId,
          schoolName: targetSchoolName,
          region: caller.region,
          district: caller.district,
          viewerUid: caller.uid,
          includeAdminPreview: true,
        });
        schoolPayload = builtSchool;
      }

      let districtPayload = null;
      if (isAdmin || isDistCoord || isRegCoord) {
        const targetRegion =
          isAdmin && req.query.region ? String(req.query.region) : caller.region;
        const targetDistrict =
          (isAdmin || isRegCoord) && req.query.district ? String(req.query.district) : caller.district;
        const { rankedAll: _da, ...builtDistrict } = buildDistrictStudentRatingPayload({
          region: targetRegion,
          district: targetDistrict,
          viewerUid: caller.uid,
          includeAdminPreview: true,
        });
        districtPayload = builtDistrict;
      }

      res.json({
        success: true,
        school: schoolPayload,
        district: districtPayload,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// School Captain / Super Admin: Toggle School Student Rating (requires threshold met, default 50) & Configure Top-1 Prize
app.post(
  '/api/student-ratings/school/config',
  requireRoles('school_admin', 'super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const isAdmin = checkIsSuperAdmin(caller);
      const requestedSchoolId = isAdmin && req.body.schoolId ? String(req.body.schoolId) : caller.schoolId;
      const resolved = resolveSchoolTargetForStudentRatings({
        schoolId: requestedSchoolId,
        schoolName: isAdmin && req.body.schoolName ? String(req.body.schoolName) : caller.schoolName,
        region: caller.region,
        district: caller.district,
      });

      if (!resolved.schoolId || (!resolved.matchedSchool && !caller.schoolName)) {
        return res.status(400).json({ error: 'Maktab aniqlanmadi.' });
      }
      if (!isAdmin && caller.schoolId && resolved.schoolId !== caller.schoolId) {
        return res.status(403).json({ error: "Faqat o'z maktabingiz reytingini boshqara olasiz." });
      }

      ensureRatingConfigsContainer();
      const prev = getEffectiveSchoolRatingConfig({
        schoolId: resolved.schoolId,
        schoolName: resolved.schoolName,
        region: resolved.region,
        district: resolved.district,
      });

      const minFloor = isAdmin ? 1 : 10;
      const nextThreshold =
        req.body.minMembersThreshold !== undefined
          ? Math.max(minFloor, Math.min(5000, Math.round(Number(req.body.minMembersThreshold) || 50)))
          : prev.minMembersThreshold;

      const currentMembersCount = resolved.matchedSchool
        ? getSchoolLiveStudentCount(resolved.matchedSchool)
        : Object.values(centralDb.users || {}).filter(
            (u: any) => u && (u.schoolId === resolved.schoolId || u.schoolName === resolved.schoolName)
          ).length;

      const nextEnabled =
        typeof req.body.enabled === 'boolean' ? req.body.enabled : prev.enabled;

      if (nextEnabled && currentMembersCount < nextThreshold) {
        return res.status(400).json({
          error: `Maktab reytingini yoqish uchun kamida ${nextThreshold} ta o'quvchi qo'shilgan bo'lishi kerak (hozir: ${currentMembersCount} ta).`,
        });
      }

      const nextPrizeTitle =
        typeof req.body.monthlyPrizeTitle === 'string' && req.body.monthlyPrizeTitle.trim()
          ? req.body.monthlyPrizeTitle.trim().slice(0, 140)
          : prev.monthlyPrizeTitle;
      const nextBonusCoins =
        req.body.bonusCoins !== undefined
          ? Math.max(0, Math.min(50000, Math.round(Number(req.body.bonusCoins) || 0)))
          : prev.bonusCoins;

      const nowIso = new Date().toISOString();
      const updatedConfig: SchoolStudentRatingConfig = {
        schoolId: resolved.schoolId,
        schoolName: resolved.schoolName,
        region: resolved.region,
        district: resolved.district,
        enabled: nextEnabled,
        minMembersThreshold: nextThreshold,
        monthlyPrizeTitle: nextPrizeTitle,
        bonusCoins: nextBonusCoins,
        activatedAt: nextEnabled && !prev.enabled ? nowIso : prev.activatedAt,
        activatedByUid: nextEnabled && !prev.enabled ? caller.uid : prev.activatedByUid,
        updatedAt: nowIso,
      };

      centralDb.ratingConfigs.schoolRatings[resolved.schoolId] = updatedConfig;
      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'student_ratings', schoolId: resolved.schoolId });
      addAuditLog({
        actorUid: caller.uid,
        actorName: caller.fullName,
        actorRole: caller.role,
        action: 'update_school_student_rating_config',
        targetCollection: 'ratingConfigs',
        targetId: resolved.schoolId,
        details: { enabled: nextEnabled, minMembersThreshold: nextThreshold, currentMembersCount },
      });

      const { rankedAll: _sa, ...schoolPayload } = buildSchoolStudentRatingPayload({
        schoolId: resolved.schoolId,
        schoolName: resolved.schoolName,
        region: resolved.region,
        district: resolved.district,
        viewerUid: caller.uid,
        includeAdminPreview: true,
      });

      res.json({ success: true, config: updatedConfig, school: schoolPayload });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// District Coordinator / Super Admin: Toggle District Student Rating (requires threshold met, default 500) & Configure Top-3 Prizes
app.post(
  '/api/student-ratings/district/config',
  requireRoles('district_coordinator', 'regional_coordinator', 'super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const allowOverride = checkIsSuperAdmin(caller) || hasAnyRole(caller, ['regional_coordinator']);
      const targetRegion =
        checkIsSuperAdmin(caller) && req.body.region ? String(req.body.region).trim() : String(caller.region || '').trim();
      const targetDistrict =
        allowOverride && req.body.district ? String(req.body.district).trim() : String(caller.district || '').trim();

      if (!targetDistrict) {
        return res.status(400).json({ error: 'Tuman aniqlanmadi.' });
      }

      ensureRatingConfigsContainer();
      const prev = getEffectiveDistrictStudentRatingConfig({
        region: targetRegion,
        district: targetDistrict,
      });

      const minFloor = checkIsSuperAdmin(caller) ? 1 : 100;
      const nextThreshold =
        req.body.minMembersThreshold !== undefined
          ? Math.max(minFloor, Math.min(20000, Math.round(Number(req.body.minMembersThreshold) || 500)))
          : prev.minMembersThreshold;

      const currentMembersCount = getDistrictLiveParticipantCount(targetRegion, targetDistrict);
      const nextEnabled =
        typeof req.body.enabled === 'boolean' ? req.body.enabled : prev.enabled;

      if (nextEnabled && currentMembersCount < nextThreshold) {
        return res.status(400).json({
          error: `Tuman reytingini yoqish uchun kamida ${nextThreshold} ta ishtirokchi qatnashgan bo'lishi kerak (hozir: ${currentMembersCount} ta).`,
        });
      }

      const nextTop1 =
        typeof req.body.top1Prize === 'string' && req.body.top1Prize.trim()
          ? req.body.top1Prize.trim().slice(0, 140)
          : prev.top1Prize;
      const nextTop2 =
        typeof req.body.top2Prize === 'string' && req.body.top2Prize.trim()
          ? req.body.top2Prize.trim().slice(0, 140)
          : prev.top2Prize;
      const nextTop3 =
        typeof req.body.top3Prize === 'string' && req.body.top3Prize.trim()
          ? req.body.top3Prize.trim().slice(0, 140)
          : prev.top3Prize;

      const rawBonuses = Array.isArray(req.body.bonuses) ? req.body.bonuses : prev.bonuses;
      const nextBonuses: [number, number, number] = [
        Math.max(0, Math.min(100000, Math.round(Number(rawBonuses[0] ?? prev.bonuses[0]) || 0))),
        Math.max(0, Math.min(100000, Math.round(Number(rawBonuses[1] ?? prev.bonuses[1]) || 0))),
        Math.max(0, Math.min(100000, Math.round(Number(rawBonuses[2] ?? prev.bonuses[2]) || 0))),
      ];

      const key = makeDistrictRatingKey(targetRegion, targetDistrict);
      const nowIso = new Date().toISOString();
      const updatedConfig: DistrictStudentRatingConfig = {
        key,
        region: targetRegion,
        district: targetDistrict,
        enabled: nextEnabled,
        minMembersThreshold: nextThreshold,
        top1Prize: nextTop1,
        top2Prize: nextTop2,
        top3Prize: nextTop3,
        bonuses: nextBonuses,
        activatedAt: nextEnabled && !prev.enabled ? nowIso : prev.activatedAt,
        activatedByUid: nextEnabled && !prev.enabled ? caller.uid : prev.activatedByUid,
        updatedAt: nowIso,
      };

      centralDb.ratingConfigs.districtStudentRatings[key] = updatedConfig;
      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'student_ratings', district: targetDistrict });
      addAuditLog({
        actorUid: caller.uid,
        actorName: caller.fullName,
        actorRole: caller.role,
        action: 'update_district_student_rating_config',
        targetCollection: 'ratingConfigs',
        targetId: key,
        details: { district: targetDistrict, enabled: nextEnabled, minMembersThreshold: nextThreshold, currentMembersCount },
      });

      const { rankedAll: _da, ...districtPayload } = buildDistrictStudentRatingPayload({
        region: targetRegion,
        district: targetDistrict,
        viewerUid: caller.uid,
        includeAdminPreview: true,
      });

      res.json({ success: true, config: updatedConfig, district: districtPayload });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// School Captain / Super Admin: Award the #1 Most Active Student in the School
app.post(
  '/api/student-ratings/school/award-top1',
  requireRoles('school_admin', 'super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const isAdmin = checkIsSuperAdmin(caller);
      const requestedSchoolId = isAdmin && req.body.schoolId ? String(req.body.schoolId) : caller.schoolId;
      const built = buildSchoolStudentRatingPayload({
        schoolId: requestedSchoolId,
        schoolName: isAdmin && req.body.schoolName ? String(req.body.schoolName) : caller.schoolName,
        region: caller.region,
        district: caller.district,
        viewerUid: caller.uid,
        includeAdminPreview: true,
      });

      if (!isAdmin && caller.schoolId && built.schoolId !== caller.schoolId) {
        return res.status(403).json({ error: "Faqat o'z maktabingiz o'quvchisini taqdirlay olasiz." });
      }
      if (!built.isLiveActive) {
        return res.status(400).json({
          error: `Avval maktab reytingini yoqing (kamida ${built.minMembersThreshold} ta o'quvchi bo'lishi kerak).`,
        });
      }
      if (built.alreadyAwardedThisMonth) {
        return res.status(400).json({
          error: `${built.schoolName} uchun ${built.periodLabel} oyi g'olibi allaqachon taqdirlangan!`,
        });
      }
      const winnerEntry = built.rankedAll[0];
      if (!winnerEntry) {
        return res.status(400).json({ error: "Maktab reytingida hali o'quvchilar mavjud emas." });
      }

      const monthStatus = getTashkentMonthStatus();
      const prize = built.prizes[0];
      const bonus = Number(prize?.bonusCoins ?? 500);
      const prizeTitle = prize?.title || "Maktabning Eng Faol O'quvchisi Sovg'asi";
      const promoCode = `ECO-MKO-${monthStatus.yymm}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;
      const nowIso = new Date().toISOString();

      const winnerUser = centralDb.users[winnerEntry.uid];
      if (winnerUser) {
        winnerUser.ecoCoins = Number(winnerUser.ecoCoins || 0) + bonus;
        winnerUser.totalCoinsEarned = Number(winnerUser.totalCoinsEarned || 0) + bonus;
        if (bonus > 0) {
          recordTransaction({
            userId: winnerUser.uid,
            amount: bonus,
            type: 'bonus',
            status: 'approved',
            reason: `${built.schoolName} · ${built.periodLabel} 1-o'rin g'olibi (${promoCode})`,
          });
        }
        centralDb.notifications.unshift({
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          userId: winnerUser.uid,
          title: `🏆 ${built.periodLabel} · Maktabda 1-o'rin!`,
          message: `Tabriklaymiz! ${prizeTitle}. Promokod: ${promoCode} (+${bonus} EcoCoin). Sovg'angizni Maktab Sardoridan oling.`,
          type: 'award',
          read: false,
          createdAt: nowIso,
        });

        if (winnerUser.telegramId || winnerUser.chatId) {
          sendTelegramMessage(
            winnerUser.telegramId || winnerUser.chatId,
            `🏆 <b>TABRIKLAYMIZ! MAKTAB CHEMPIONI</b>\n\n` +
              `Siz <b>${built.periodLabel}</b> oyida <b>${built.schoolName}</b> bo'yicha eng faol <b>1-o'rin</b> o'quvchisi bo'ldingiz!\n` +
              `🎁 <b>Sovg'a:</b> ${prizeTitle}\n` +
              `🎟 <b>Promokod:</b> <code>${promoCode}</code>\n` +
              `💰 <b>Bonus:</b> +${bonus} EcoCoin\n\n` +
              `Sovg'angizni Maktab Sardoriga promokodni ko'rsatib olishingiz mumkin!`
          ).catch(() => {});
        }
      }

      centralDb.shopOrders.unshift({
        id: `ord_aw_sch_st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        orderType: 'monthly_award',
        awardTier: 'school_student',
        rank: 1,
        periodKey: built.periodKey,
        userId: winnerEntry.uid,
        userName: winnerEntry.fullName,
        userEmail: winnerUser?.email || '',
        schoolId: built.schoolId,
        schoolName: built.schoolName,
        district: built.district,
        region: built.region,
        itemId: 'award_school_student_top1',
        itemTitle: `${built.periodLabel} · ${prizeTitle}`,
        itemImageUrl: '/assets/schools/eco_courtyard.jpg',
        priceCoins: 0,
        voucherCode: promoCode,
        qrToken: crypto.randomUUID(),
        status: 'approved',
        approvedAt: nowIso,
        createdAt: nowIso,
        sponsorName: `${built.schoolName} Sardori`,
        verifiedBySchoolAdmin: true,
      });

      const award = {
        id: `st_award_sch_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        scope: 'school' as const,
        periodKey: built.periodKey,
        periodLabel: built.periodLabel,
        region: built.region,
        district: built.district,
        schoolId: built.schoolId,
        schoolName: built.schoolName,
        winners: [
          {
            uid: winnerEntry.uid,
            fullName: winnerEntry.fullName,
            schoolName: built.schoolName,
            grade: winnerEntry.grade || '',
            rank: 1,
            monthlyScore: winnerEntry.monthlyScore,
            prizeTitle,
            bonusCoins: bonus,
            promoCode,
          },
        ],
        awardedByUid: caller.uid,
        awardedByName: caller.fullName,
        awardedAt: nowIso,
      };

      ensureRatingConfigsContainer();
      centralDb.studentMonthlyAwards.unshift(award);
      recalculateSchoolRanks();
      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'student_ratings', schoolId: built.schoolId });
      addAuditLog({
        actorUid: caller.uid,
        actorName: caller.fullName,
        actorRole: caller.role,
        action: 'award_school_top1_student',
        targetCollection: 'studentMonthlyAwards',
        targetId: award.id,
        details: { schoolId: built.schoolId, winnerUid: winnerEntry.uid, promoCode, bonus },
      });

      const { rankedAll: _sa, ...refreshedSchool } = buildSchoolStudentRatingPayload({
        schoolId: built.schoolId,
        schoolName: built.schoolName,
        region: built.region,
        district: built.district,
        viewerUid: caller.uid,
        includeAdminPreview: true,
      });
      res.json({ success: true, award, school: refreshedSchool });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

// District Coordinator / Super Admin: Award Top-3 Most Active Students in the District (1-month prize cycle)
app.post(
  '/api/student-ratings/district/award-top3',
  requireRoles('district_coordinator', 'regional_coordinator', 'super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const allowOverride = checkIsSuperAdmin(caller) || hasAnyRole(caller, ['regional_coordinator']);
      const targetRegion =
        checkIsSuperAdmin(caller) && req.body.region ? String(req.body.region).trim() : String(caller.region || '').trim();
      const targetDistrict =
        allowOverride && req.body.district ? String(req.body.district).trim() : String(caller.district || '').trim();

      if (!targetDistrict) {
        return res.status(400).json({ error: 'Taqdirlash uchun tuman aniqlanmadi.' });
      }

      const built = buildDistrictStudentRatingPayload({
        region: targetRegion,
        district: targetDistrict,
        viewerUid: caller.uid,
        includeAdminPreview: true,
      });

      if (!built.isLiveActive) {
        return res.status(400).json({
          error: `Avval tuman o'quvchilar reytingini yoqing (kamida ${built.minMembersThreshold} ta ishtirokchi kerak).`,
        });
      }
      if (built.alreadyAwardedThisMonth) {
        return res.status(400).json({
          error: `${targetDistrict} uchun ${built.periodLabel} oyi TOP-3 o'quvchilar mukofoti allaqachon topshirilgan!`,
        });
      }
      if (built.rankedAll.length === 0) {
        return res.status(400).json({
          error: `${targetDistrict} reytingida hali o'quvchilar mavjud emas.`,
        });
      }

      const monthStatus = getTashkentMonthStatus();
      const nowIso = new Date().toISOString();

      const winners = built.rankedAll.slice(0, 3).map((st, idx) => {
        const rank = idx + 1;
        const prizeTier = built.prizes[idx];
        const bonus = Number(prizeTier?.bonusCoins ?? [1500, 1000, 700][idx] ?? 500);
        const prizeTitle = prizeTier?.title || `${rank}-o'rin Qimmatbaho Sovg'a`;
        const promoCode = `ECO-TMO-${monthStatus.yymm}-${rank}-${crypto.randomBytes(2).toString('hex').toUpperCase()}`;

        const u = centralDb.users[st.uid];
        if (u) {
          u.ecoCoins = Number(u.ecoCoins || 0) + bonus;
          u.totalCoinsEarned = Number(u.totalCoinsEarned || 0) + bonus;
          if (bonus > 0) {
            recordTransaction({
              userId: u.uid,
              amount: bonus,
              type: 'bonus',
              status: 'approved',
              reason: `${targetDistrict} · ${built.periodLabel} TOP-${rank} o'quvchi mukofoti (${promoCode})`,
            });
          }
          centralDb.notifications.unshift({
            id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            userId: u.uid,
            title: `🏆 ${built.periodLabel} · Tumanda ${rank}-o'rin!`,
            message: `Tabriklaymiz! ${prizeTitle}. Promokod: ${promoCode} (+${bonus} EcoCoin). Sovg'angizni tuman koordinatoridan oling.`,
            type: 'award',
            read: false,
            createdAt: nowIso,
          });

          if (u.telegramId || u.chatId) {
            sendTelegramMessage(
              u.telegramId || u.chatId,
              `🏆 <b>TABRIKLAYMIZ! TUMAN OYLIK REYTING G'OLIBI</b>\n\n` +
                `Siz <b>${built.periodLabel}</b> davomida <b>${targetDistrict}</b> bo'yicha eng faol <b>${rank}-o'rin</b> o'quvchisi bo'ldingiz!\n` +
                `🎁 <b>Sovg'a:</b> ${prizeTitle}\n` +
                `🎟 <b>Promokod:</b> <code>${promoCode}</code>\n` +
                `💰 <b>Bonus:</b> +${bonus} EcoCoin\n\n` +
                `Sovg'angizni Tuman Koordinatoriga promokodni ko'rsatib olishingiz mumkin!`
            ).catch(() => {});
          }
        }

        centralDb.shopOrders.unshift({
          id: `ord_aw_dist_st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          orderType: 'monthly_award',
          awardTier: 'district_student',
          rank,
          periodKey: built.periodKey,
          userId: st.uid,
          userName: st.fullName,
          userEmail: u?.email || '',
          schoolId: st.schoolId || '',
          schoolName: st.schoolName || '',
          district: targetDistrict,
          region: targetRegion,
          itemId: `award_district_student_top_${rank}`,
          itemTitle: `${built.periodLabel} · ${prizeTitle} (${targetDistrict})`,
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

        return {
          uid: st.uid,
          fullName: st.fullName,
          schoolName: st.schoolName || '',
          grade: st.grade || '',
          rank,
          monthlyScore: st.monthlyScore,
          prizeTitle,
          bonusCoins: bonus,
          promoCode,
        };
      });

      const award = {
        id: `st_award_dist_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        scope: 'district' as const,
        periodKey: built.periodKey,
        periodLabel: built.periodLabel,
        region: targetRegion,
        district: targetDistrict,
        winners,
        awardedByUid: caller.uid,
        awardedByName: caller.fullName,
        awardedAt: nowIso,
      };

      ensureRatingConfigsContainer();
      centralDb.studentMonthlyAwards.unshift(award);
      recalculateSchoolRanks();
      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'student_ratings', district: targetDistrict });
      addAuditLog({
        actorUid: caller.uid,
        actorName: caller.fullName,
        actorRole: caller.role,
        action: 'award_district_top3_students',
        targetCollection: 'studentMonthlyAwards',
        targetId: award.id,
        details: { district: targetDistrict, winnersCount: winners.length },
      });

      const { rankedAll: _da, ...refreshedDistrict } = buildDistrictStudentRatingPayload({
        region: targetRegion,
        district: targetDistrict,
        viewerUid: caller.uid,
        includeAdminPreview: true,
      });

      res.json({ success: true, award, district: refreshedDistrict });
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
    if (client.isPublicReadOnly || !client.uid) continue;
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
    if (client.isPublicReadOnly || !client.uid) continue;
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
    const isPublicMode = parsedUrl.searchParams.get('public') === '1';
    const authUser = token ? verifySessionToken(token) : null;

    if (!authUser && !isPublicMode) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    chatWss.handleUpgrade(request, socket, head, (ws) => {
      const client: ConnectedWsClient = authUser
        ? {
            ws,
            uid: String(authUser.uid),
            role: String(authUser.role || 'student'),
            approvedRoles: Array.isArray(authUser.approvedRoles) ? authUser.approvedRoles : [],
            region: String(authUser.region || ''),
            district: String(authUser.district || ''),
            schoolId: String(authUser.schoolId || ''),
            isSuperAdmin: checkIsSuperAdmin(authUser),
            isPublicReadOnly: false,
          }
        : {
            ws,
            uid: '',
            role: 'guest',
            approvedRoles: [],
            region: '',
            district: '',
            schoolId: '',
            isSuperAdmin: false,
            isPublicReadOnly: true,
          };
      wsClients.add(client);
      ws.send(
        JSON.stringify(
          client.isPublicReadOnly
            ? { type: 'live:connected' }
            : { type: 'chat:connected', uid: client.uid }
        )
      );
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

// HomePage Posts & News CMS (Super Admin ONLY)
app.get('/api/home-posts', (req: AuthenticatedRequest, res) => {
  const caller = req.authUser || null;
  const manageMode = String(req.query.scope || '') === 'manage';
  if (manageMode && (!caller || !checkIsSuperAdmin(caller))) {
    return res.status(403).json({ error: 'Bosh sahifa postlarini boshqarish faqat Super Admin uchun ruxsat etilgan' });
  }
  const posts = (centralDb.homePosts || [])
    .filter((p: any) => {
      if (!manageMode) return p.status === 'active';
      return Boolean(caller && checkIsSuperAdmin(caller));
    })
    .sort((a: any, b: any) => {
      if (Boolean(b.isPinned) !== Boolean(a.isPinned)) return b.isPinned ? 1 : -1;
      return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

  res.json({ success: true, posts });
});

app.post(
  '/api/home-posts',
  requireRoles('super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      if (!checkIsSuperAdmin(caller)) {
        return res.status(403).json({ error: 'Bosh sahifaga post joylash faqat Super Admin uchun ruxsat etilgan' });
      }
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
      removeDeletedId(post.id);
      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'home_posts' });
      upsertCatalogDocToFirestoreRest('home_posts', post.id, post, getFirebaseTokenFromReq(req)).catch(() => {});
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
  requireRoles('super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      if (!checkIsSuperAdmin(caller)) {
        return res.status(403).json({ error: "Ushbu postni tahrirlash huquqiga ega emassiz" });
      }
      const post = (centralDb.homePosts || []).find((p: any) => p.id === req.params.id);
      if (!post) return res.status(404).json({ error: 'Post topilmadi' });

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
      upsertCatalogDocToFirestoreRest('home_posts', post.id, post, getFirebaseTokenFromReq(req)).catch(() => {});
      res.json({ success: true, post });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.delete(
  '/api/home-posts/:id',
  requireRoles('super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      if (!checkIsSuperAdmin(caller)) {
        return res.status(403).json({ error: "Ushbu postni o'chirish huquqiga ega emassiz" });
      }
      const idx = (centralDb.homePosts || []).findIndex((p: any) => p.id === req.params.id);
      if (idx === -1) return res.status(404).json({ error: 'Post topilmadi' });

      centralDb.homePosts.splice(idx, 1);
      recordDeletedId(req.params.id);
      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'home_posts' });
      deleteCatalogDocFromFirestoreRest('home_posts', req.params.id, caller.uid, getFirebaseTokenFromReq(req)).catch(() => {});
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

app.get('/api/analytics/export', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    let schools = [...centralDb.schools];
    let reports = centralDb.reports.filter((r) => canViewReport(r, caller));
    let scans = [...(centralDb.qrEcoScans || [])];

    if (!hasAnyRole(caller, ['super_admin', 'moderator'])) {
      if (hasAnyRole(caller, ['regional_coordinator'])) {
        schools = schools.filter((s) => s.region === caller.region);
        reports = reports.filter((r) => r.region === caller.region);
        scans = scans.filter((sc) => sc.region === caller.region);
      } else if (hasAnyRole(caller, ['district_coordinator'])) {
        schools = schools.filter((s) => s.district === caller.district && s.region === caller.region);
        reports = reports.filter((r) => r.district === caller.district && r.region === caller.region);
        scans = scans.filter((sc) => sc.district === caller.district && sc.region === caller.region);
      } else if (hasAnyRole(caller, ['school_admin', 'ambassador'])) {
        schools = schools.filter((s) => s.id === caller.schoolId);
        reports = reports.filter((r) => r.schoolId === caller.schoolId);
        scans = scans.filter((sc) => sc.schoolId === caller.schoolId);
      } else {
        reports = reports.filter((r) => r.reporterUid === caller.uid);
        scans = scans.filter((sc) => sc.studentUid === caller.uid);
      }
    }

    const totalRecycledKg = scans.reduce((s, x) => s + (x.materialType === 'sapling' ? 0 : Number(x.weightKg || 0)), 0);

    res.json({
      success: true,
      generatedAt: new Date().toISOString(),
      generatedBy: caller.fullName,
      scopeLabel: hasAnyRole(caller, ['super_admin', 'moderator'])
        ? "O'zbekiston Respublikasi (To'liq hisobot)"
        : `${caller.region || ''} ${caller.district || ''} ${caller.schoolName || ''}`.trim(),
      summary: {
        schoolsCount: schools.length,
        studentsCount: schools.reduce((s, sc) => s + getSchoolLiveStudentCount(sc), 0),
        treesPlanted: schools.reduce((s, sc) => s + Number(sc.treesPlanted || 0), 0),
        reportsTotal: reports.length,
        reportsResolved: reports.filter((r) => r.status === 'resolved' || r.status === 'RESOLVED').length,
        recycledWasteKg: Number(totalRecycledKg.toFixed(1)),
        totalEcoCoins: schools.reduce((s, sc) => s + Number(sc.totalCoins || 0), 0),
      },
      schools: schools.map((s) => ({
        name: s.name,
        region: s.region,
        district: s.district,
        studentsCount: getSchoolLiveStudentCount(s),
        treesPlanted: s.treesPlanted || 0,
        cleanupsCompleted: s.cleanupsCompleted || 0,
        totalCoins: s.totalCoins || 0,
        ratingRank: s.ratingRank || 0,
      })),
      reports: reports.slice(0, 250).map((r) => ({
        id: r.id,
        title: r.title,
        category: r.category,
        status: r.status,
        region: r.region,
        district: r.district,
        schoolName: r.schoolName,
        reporterName: r.reporterName,
        rewardCoins: r.rewardCoins || 0,
        createdAt: r.createdAt,
      })),
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

function resolveTelegramChannelHandle(rawHandle?: string, rawUrl?: string): string {
  const cleanHandle = String(rawHandle || '').trim();
  if (cleanHandle) {
    if (/^-?\d+$/.test(cleanHandle)) return cleanHandle;
    const urlMatch = cleanHandle.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]+)/i);
    if (urlMatch && !urlMatch[1].startsWith('+')) {
      return `@${urlMatch[1]}`;
    }
    return cleanHandle.startsWith('@') ? cleanHandle : `@${cleanHandle}`;
  }
  const cleanUrl = String(rawUrl || '').trim();
  if (cleanUrl) {
    const m = cleanUrl.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]+)/i);
    if (m && m[1] && !m[1].startsWith('+') && m[1].toLowerCase() !== 'joinchat') {
      return `@${m[1]}`;
    }
  }
  return '';
}

async function verifyTelegramChannelMembership(params: {
  channelHandle?: string;
  channelUrl?: string;
  userTelegramId?: string | number | null;
  title?: string;
}): Promise<{ ok: boolean; statusCode: number; chatHandle?: string; memberStatus?: string; error?: string }> {
  const chatHandle = resolveTelegramChannelHandle(params.channelHandle, params.channelUrl);
  const label = params.title ? `"${params.title}" (${chatHandle || params.channelUrl || 'Telegram kanal'})` : (chatHandle || 'Telegram kanal');

  if (!chatHandle) {
    return {
      ok: false,
      statusCode: 400,
      error: `Kanal @username manzili noto'g'ri yoki ko'rsatilmagan. Admin ommaviy @kanal_nomi manzilini kiritishi kerak.`,
    };
  }

  if (chatHandle.toLowerCase().endsWith('bot') && !/^-?\d+$/.test(chatHandle)) {
    return {
      ok: false,
      statusCode: 400,
      error: `${chatHandle} — bu kanal emas, Telegram bot manzili. Obunani tekshirish uchun haqiqiy kanal @username manzilini kiriting.`,
    };
  }

  if (!activeBotToken) {
    return {
      ok: false,
      statusCode: 503,
      error: `Telegram bot tokeni serverda ulanmaganligi sababli ${label} obunasini tekshirib bo'lmadi.`,
    };
  }

  const tgUserId = String(params.userTelegramId || '').trim();
  if (!tgUserId) {
    return {
      ok: false,
      statusCode: 400,
      error: `Obunangizni haqiqiy tekshirish uchun ilovani Telegram bot orqali oching (sizning hisobingizga Telegram ID ulanmagan).`,
    };
  }

  try {
    const checkRes = await fetch(
      `https://api.telegram.org/bot${activeBotToken}/getChatMember?chat_id=${encodeURIComponent(chatHandle)}&user_id=${encodeURIComponent(tgUserId)}`,
      { signal: AbortSignal.timeout(6500) }
    );
    const checkJson: any = await checkRes.json().catch(() => null);

    if (!checkJson?.ok || !checkJson?.result) {
      const desc = String(checkJson?.description || '').toLowerCase();
      if (
        desc.includes('member list is inaccessible') ||
        desc.includes('administrator rights') ||
        desc.includes('not enough rights') ||
        desc.includes('chat_admin_required')
      ) {
        return {
          ok: false,
          statusCode: 400,
          error: `Bot ${chatHandle} kanaliga admin qilinmagan! Admin botni kanalga admin sifatida qo'shishi kerak, shundagina obuna haqiqiy tekshiriladi.`,
        };
      }
      if (desc.includes('chat not found') || desc.includes('chat_id')) {
        return {
          ok: false,
          statusCode: 400,
          error: `${chatHandle} Telegram kanali topilmadi. Admin kanal manzilini to'g'ri kiritganini tekshirsin.`,
        };
      }
      if (desc.includes('user not found') || desc.includes('participant_id_invalid')) {
        return {
          ok: false,
          statusCode: 400,
          error: `Siz hali ${chatHandle} kanaliga obuna bo'lmagansiz! Avval «Kanalga o'tish» tugmasini bosib kanalga qo'shiling va qayta tekshiring.`,
        };
      }
      return {
        ok: false,
        statusCode: 400,
        error: `${label} obunasini tasdiqlab bo'lmadi (${checkJson?.description || 'Telegram API xatosi'}). Avval kanalga obuna bo'lib, qayta urinib ko'ring.`,
      };
    }

    const st = String(checkJson.result.status || '');
    const isSubscribed =
      st === 'member' ||
      st === 'administrator' ||
      st === 'creator' ||
      (st === 'restricted' && checkJson.result.is_member === true);

    if (!isSubscribed) {
      return {
        ok: false,
        statusCode: 400,
        error: `Siz hali ${chatHandle} kanaliga obuna bo'lmagansiz! Avval «Kanalga o'tish» tugmasini bosib kanalga a'zo bo'ling, so'ng qayta tekshiring.`,
      };
    }

    return { ok: true, statusCode: 200, chatHandle, memberStatus: st };
  } catch (err: any) {
    console.warn('[Telegram getChatMember error]', chatHandle, err?.message || err);
    return {
      ok: false,
      statusCode: 502,
      error: `Telegram serveri bilan bog'lanishda xatolik yuz berdi. Birozdan so'ng qayta tekshirib ko'ring.`,
    };
  }
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
      const verifyRes = await verifyTelegramChannelMembership({
        channelHandle: target.handle,
        channelUrl: target.url,
        userTelegramId: caller?.telegramId,
        title: target.title,
      });
      if (!verifyRes.ok) {
        return {
          ok: false,
          verifiedTargetIds,
          error: verifyRes.error,
        };
      }
      verifiedTargetIds.push(target.id);
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
    (item as any).updatedAt = new Date().toISOString();

    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'shop' });
    upsertCatalogDocToFirestoreRest('shopItems', item.id, item, getFirebaseTokenFromReq(req)).catch(() => {});
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
    const nowIso = new Date().toISOString();
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
      updatedAt: nowIso,
    };

    centralDb.shopItems.unshift(newItem);
    removeDeletedId(newItem.id);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'shop' });
    upsertCatalogDocToFirestoreRest('shopItems', newItem.id, newItem, getFirebaseTokenFromReq(req)).catch(() => {});
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
    recordDeletedId(req.params.id);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'shop' });
    deleteCatalogDocFromFirestoreRest('shopItems', req.params.id, req.authUser.uid, getFirebaseTokenFromReq(req)).catch(() => {});
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
        (u: any) => u.role === 'super_admin' || isSuperAdminTelegramId(u.telegramId)
      );
      const notifyTargets = new Set<string>([
        ...getSuperAdminTelegramIdList().map((id) => `user_tg_${id}`),
        ...superAdmins.map((u: any) => u.uid),
      ]);
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

      notifySuperAdminsTelegram(
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

const AD_REWARD_COOLDOWN_HOURS = 5;
const AD_REWARD_COOLDOWN_MS = AD_REWARD_COOLDOWN_HOURS * 60 * 60 * 1000;

function formatAdCooldownUz(remainingSeconds: number): string {
  const sec = Math.max(1, Math.ceil(remainingSeconds));
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0 && m > 0) return `${h} soat ${m} daqiqa`;
  if (h > 0) return `${h} soat`;
  if (m > 0) return `${m} daqiqa`;
  return `${s} soniya`;
}

function buildUserAdWatchState(userId: string) {
  const nowMs = Date.now();
  const userClaims = (centralDb.adRewardClaims || [])
    .filter((c) => c.userId === userId && c.claimedAt)
    .map((c) => ({ ...c, ts: Date.parse(String(c.claimedAt)) || 0 }))
    .filter((c) => c.ts > 0)
    .sort((a, b) => b.ts - a.ts);

  const perAdLastClaimedAt: Record<string, string> = {};
  for (const c of userClaims) {
    if (c.adId && !perAdLastClaimedAt[c.adId]) {
      perAdLastClaimedAt[c.adId] = c.claimedAt;
    }
  }

  const latest = userClaims[0] || null;
  const elapsedMs = latest ? nowMs - latest.ts : Infinity;
  const remainingMs = latest && elapsedMs < AD_REWARD_COOLDOWN_MS ? AD_REWARD_COOLDOWN_MS - elapsedMs : 0;
  const remainingSeconds = remainingMs > 0 ? Math.ceil(remainingMs / 1000) : 0;
  const nextAvailableAt =
    remainingMs > 0 && latest ? new Date(latest.ts + AD_REWARD_COOLDOWN_MS).toISOString() : null;

  return {
    cooldownHours: AD_REWARD_COOLDOWN_HOURS,
    lastWatchedAdId: latest?.adId || null,
    lastClaimedAt: latest?.claimedAt || null,
    nextAvailableAt,
    remainingSeconds,
    perAdLastClaimedAt,
  };
}

app.get('/api/ads', (req, res) => {
  const placement = req.query.placement as string | undefined;
  let ads = centralDb.ecoAds.filter((a) => a.status === 'active');
  if (placement) ads = ads.filter((a) => a.placement === placement);
  res.json({ success: true, ads });
});

app.get('/api/ads/watch-status', requireAuth, (req: AuthenticatedRequest, res) => {
  res.json({
    success: true,
    adWatchState: buildUserAdWatchState(req.authUser.uid),
  });
});

const recentAdImpressions = new Map<string, number>();
const recentAdClicks = new Map<string, number>();

function checkAndMarkAdEvent(store: Map<string, number>, key: string, windowMs: number): boolean {
  const now = Date.now();
  const prev = store.get(key);
  if (prev && now - prev < windowMs) {
    return false;
  }
  store.set(key, now);
  if (store.size > 5000) {
    const cutoff = now - windowMs;
    for (const [k, ts] of store.entries()) {
      if (ts < cutoff) store.delete(k);
    }
  }
  return true;
}

app.post('/api/ads/impression/:id', (req: AuthenticatedRequest, res) => {
  const ad = centralDb.ecoAds.find((a) => a.id === req.params.id);
  if (!ad) return res.status(404).json({ error: 'Reklama topilmadi' });

  const actorKey = `${req.authUser?.uid || req.ip || 'anon'}:${ad.id}`;
  if (checkAndMarkAdEvent(recentAdImpressions, actorKey, 5 * 60 * 1000)) {
    ad.impressionsCount = (ad.impressionsCount || 0) + 1;
    saveCentralDb();
    return res.json({ success: true, impressionsCount: ad.impressionsCount });
  }
  return res.json({ success: true, deduplicated: true, impressionsCount: ad.impressionsCount || 0 });
});

app.post('/api/ads/click/:id', (req: AuthenticatedRequest, res) => {
  const ad = centralDb.ecoAds.find((a) => a.id === req.params.id);
  if (!ad) return res.status(404).json({ error: 'Reklama topilmadi' });

  const actorKey = `${req.authUser?.uid || req.ip || 'anon'}:${ad.id}`;
  if (checkAndMarkAdEvent(recentAdClicks, actorKey, 60 * 1000)) {
    ad.clicksCount = (ad.clicksCount || 0) + 1;
    saveCentralDb();
    return res.json({ success: true, clicksCount: ad.clicksCount });
  }
  return res.json({ success: true, deduplicated: true, clicksCount: ad.clicksCount || 0 });
});

// Start a timed ad watch session (5s to 300s configurable per ad, 5-hour cooldown enforced)
app.post('/api/ads/watch-start', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const { adId } = req.body || {};
    const ad = centralDb.ecoAds.find((a) => a.id === adId && a.status === 'active');
    if (!ad) {
      return res.status(404).json({ error: 'Faol reklama topilmadi' });
    }

    const watchState = buildUserAdWatchState(req.authUser.uid);
    if (watchState.remainingSeconds > 0) {
      return res.status(429).json({
        error: `Har 5 soatda 1 ta reklama ko'rib EcoCoin olish mumkin. Keyingi reklama ${formatAdCooldownUz(watchState.remainingSeconds)} dan so'ng ochiladi.`,
        cooldownActive: true,
        remainingSeconds: watchState.remainingSeconds,
        nextAvailableAt: watchState.nextAvailableAt,
        adWatchState: watchState,
      });
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
    res.json({ success: true, watchSessionId, requiredSeconds, adWatchState: watchState });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Claim EcoCoins automatically once ad watch finishes (strict 5-hour anti-farming lock)
app.post('/api/ads/watch-reward', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const user = req.authUser;
    const { adId, watchSessionId } = req.body || {};
    const ad = centralDb.ecoAds.find((a) => a.id === adId && a.status === 'active');
    if (!ad) {
      return res.status(404).json({ error: 'Faol reklama topilmadi' });
    }

    const watchState = buildUserAdWatchState(user.uid);
    if (watchState.remainingSeconds > 0) {
      return res.status(429).json({
        error: `Har 5 soatda faqat 1 marta reklama ko'rib coin olish mumkin. Qolgan vaqt: ${formatAdCooldownUz(watchState.remainingSeconds)}.`,
        cooldownActive: true,
        remainingSeconds: watchState.remainingSeconds,
        nextAvailableAt: watchState.nextAvailableAt,
        adWatchState: watchState,
      });
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

    // Invalidate all open watch sessions for this user so concurrent tabs cannot double-claim
    for (const [k, s] of activeAdWatchSessions.entries()) {
      if (s.userId === user.uid) {
        activeAdWatchSessions.delete(k);
      }
    }

    const todayStr = new Date().toISOString().split('T')[0];
    const todaysClaims = (centralDb.adRewardClaims || []).filter(
      (c) => c.userId === user.uid && String(c.claimedAt || '').startsWith(todayStr)
    );
    if (todaysClaims.length >= 10) {
      return res.status(429).json({
        error: "Bugungi reklama orqali coin olish limiti tugadi. Ertaga yana urinib ko'ring!",
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

    const nextWatchState = buildUserAdWatchState(user.uid);
    res.json({
      success: true,
      awardedCoins: rewardAmount,
      newBalance: user.ecoCoins,
      user: sanitizeSelfUser(user),
      adWatchState: nextWatchState,
      message: `Tabriklaymiz! +${rewardAmount} EcoCoin balansingizga qo'shildi! Keyingi reklama 5 soatdan so'ng ochiladi.`,
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
      sponsorLogo,
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

    const cleanSponsorLogo =
      typeof sponsorLogo === 'string' && sponsorLogo.trim()
        ? sponsorLogo.trim().slice(0, 1024)
        : (sponsorName || 'ECO').slice(0, 5).toUpperCase();

    const nowIso = new Date().toISOString();
    const newAd = {
      id: `ad_${Date.now()}`,
      title,
      sponsorId: 'part_sponsor',
      sponsorName: sponsorName || 'ECO HERO Hamkori',
      sponsorLogo: cleanSponsorLogo,
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
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    centralDb.ecoAds.unshift(newAd);
    removeDeletedId(newAd.id);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'ads' });
    upsertCatalogDocToFirestoreRest('eco_ads', newAd.id, newAd, getFirebaseTokenFromReq(req)).catch(() => {});
    res.json({ success: true, ad: newAd });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.patch('/api/admin/ads/:id/status', requireRoles('super_admin', 'sponsor'), (req: AuthenticatedRequest, res) => {
  const { status } = req.body;
  const ad = centralDb.ecoAds.find((a) => a.id === req.params.id);
  if (!ad) return res.status(404).json({ error: 'Reklama topilmadi' });
  ad.status = status;
  (ad as any).updatedAt = new Date().toISOString();
  saveCentralDb();
  broadcastRealtimeEvent('db:updated', { scope: 'ads' });
  upsertCatalogDocToFirestoreRest('eco_ads', ad.id, ad, getFirebaseTokenFromReq(req)).catch(() => {});
  res.json({ success: true, ad });
});

app.patch('/api/admin/ads/:id', requireRoles('super_admin', 'sponsor'), (req: AuthenticatedRequest, res) => {
  try {
    const ad = centralDb.ecoAds.find((a) => a.id === req.params.id);
    if (!ad) return res.status(404).json({ error: 'Reklama topilmadi' });
    const {
      title,
      sponsorName,
      sponsorLogo,
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
    if (sponsorLogo !== undefined) ad.sponsorLogo = String(sponsorLogo).trim().slice(0, 1024);
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
    (ad as any).updatedAt = new Date().toISOString();

    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'ads' });
    upsertCatalogDocToFirestoreRest('eco_ads', ad.id, ad, getFirebaseTokenFromReq(req)).catch(() => {});
    res.json({ success: true, ad });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/admin/ads/:id', requireRoles('super_admin', 'sponsor'), (req: AuthenticatedRequest, res) => {
  try {
    const idx = centralDb.ecoAds.findIndex((a) => a.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Reklama topilmadi' });
    centralDb.ecoAds.splice(idx, 1);
    recordDeletedId(req.params.id);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'ads' });
    deleteCatalogDocFromFirestoreRest('eco_ads', req.params.id, req.authUser?.uid || '', getFirebaseTokenFromReq(req)).catch(() => {});
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 8.5 ECO MISSIONS HUB (MULTI-QUESTION QUIZZES, CHANNELS, CUSTOM TASKS)
// ==========================================

function stripQuizOptionMarker(opt: any): string {
  return String(opt || '')
    .trim()
    .replace(/^\s*[*+✓]+\s*/, '')
    .trim();
}

function shuffleQuizArray<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function normalizeQuizQuestions(missionOrBody: any) {
  const list = Array.isArray(missionOrBody?.questions)
    ? missionOrBody.questions
        .map((q: any, idx: number) => {
          const rawOpts = Array.isArray(q?.options) ? q.options : [];
          let detectedCorrect = Number(q?.correctIndex);
          const opts = rawOpts
            .map((o: any, oIdx: number) => {
              const s = String(o || '').trim();
              if (/^\s*[*+]/.test(s) && Number.isNaN(detectedCorrect)) {
                detectedCorrect = oIdx;
              }
              return stripQuizOptionMarker(s);
            })
            .filter(Boolean);
          const qText = String(q?.question || '').trim();
          if (!qText || opts.length < 2) return null;
          const safeCorrect = Number.isNaN(detectedCorrect) ? 0 : detectedCorrect;
          return {
            id: String(q?.id || `q_${Date.now()}_${idx}`),
            question: qText,
            options: opts,
            correctIndex: Math.max(0, Math.min(opts.length - 1, safeCorrect)),
            explanation: String(q?.explanation || '').trim() || undefined,
            ...(q?.imageUrl ? { imageUrl: String(q.imageUrl).trim() } : {}),
          };
        })
        .filter(Boolean)
    : [];

  if (list.length > 0) return list;

  // Fallback for legacy single-question structure
  const legacyRaw = Array.isArray(missionOrBody?.options) ? missionOrBody.options : [];
  const legacyOpts = legacyRaw.map((o: any) => stripQuizOptionMarker(o)).filter(Boolean);
  if (missionOrBody?.question && legacyOpts.length >= 2) {
    return [
      {
        id: `q_${missionOrBody?.id || Date.now()}_0`,
        question: String(missionOrBody.question).trim(),
        options: legacyOpts,
        correctIndex: Math.max(0, Math.min(legacyOpts.length - 1, Number(missionOrBody.correctIndex) || 0)),
        explanation: String(missionOrBody.explanation || '').trim() || undefined,
        ...(missionOrBody?.imageUrl ? { imageUrl: String(missionOrBody.imageUrl).trim() } : {}),
      },
    ];
  }
  return [];
}

function sanitizeMissionForCaller(m: any, _isAdmin: boolean) {
  if (m.type !== 'quiz') return m;
  const normalizedQuestions = normalizeQuizQuestions(m);
  const {
    correctIndex: _legacyCi,
    explanation: _legacyExp,
    question: _legacyQ,
    options: _legacyOpts,
    questions: _allQs,
    ...rest
  } = m;
  // NEVER expose correctIndex, '*' markers, or question bank answers to the browser
  return {
    ...rest,
    questions: [],
    questionCount: normalizedQuestions.length,
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
      imageUrl,
      durationLabel,
    } = req.body || {};

    if (!title || !['quiz', 'channel_subscribe', 'custom_task'].includes(type)) {
      return res.status(400).json({ error: 'Topshiriq turi va sarlavhasi kiritilishi shart' });
    }

    const nowIso = new Date().toISOString();
    const newMission: any = {
      id: `mission_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      type,
      title: String(title).trim(),
      description: String(description || '').trim(),
      rewardCoins: Math.max(1, Number(rewardCoins) || 100),
      status: 'active',
      category: category || type,
      ...(imageUrl ? { imageUrl: String(imageUrl).trim() } : {}),
      ...(durationLabel ? { durationLabel: String(durationLabel).trim() } : {}),
      createdAt: nowIso,
      updatedAt: nowIso,
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
    removeDeletedId(newMission.id);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'missions' });
    upsertCatalogDocToFirestoreRest('eco_missions', newMission.id, newMission, getFirebaseTokenFromReq(req)).catch(() => {});
    res.json({ success: true, mission: sanitizeMissionForCaller(newMission, false) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/missions/:id/admin-detail', requireRoles('super_admin', 'moderator', 'school_admin'), (req: AuthenticatedRequest, res) => {
  const mission = (centralDb.ecoMissions || []).find((m: any) => m.id === req.params.id);
  if (!mission) return res.status(404).json({ error: 'Topshiriq topilmadi' });
  res.json({ success: true, mission });
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
      category,
      imageUrl,
      durationLabel,
    } = req.body || {};
    if (title !== undefined) mission.title = String(title).trim();
    if (description !== undefined) mission.description = String(description).trim();
    if (rewardCoins !== undefined) mission.rewardCoins = Math.max(1, Number(rewardCoins) || 50);
    if (status === 'active' || status === 'paused') mission.status = status;
    if (category !== undefined) mission.category = String(category).trim() || mission.type;
    if (imageUrl !== undefined) mission.imageUrl = String(imageUrl).trim();
    if (durationLabel !== undefined) mission.durationLabel = String(durationLabel).trim();
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

    if (channelUsername !== undefined) {
      let cleanUser = String(channelUsername).trim();
      const urlMatch = cleanUser.match(/(?:https?:\/\/)?(?:t\.me|telegram\.me)\/([A-Za-z0-9_]+)/i);
      if (urlMatch && !urlMatch[1].startsWith('+')) {
        cleanUser = `@${urlMatch[1]}`;
      } else if (cleanUser && !cleanUser.startsWith('@') && !/^-?\d+$/.test(cleanUser)) {
        cleanUser = `@${cleanUser}`;
      }
      mission.channelUsername = cleanUser;
      if (channelUrl === undefined && cleanUser.startsWith('@')) {
        mission.channelUrl = `https://t.me/${cleanUser.slice(1)}`;
      }
    }
    if (channelUrl !== undefined) {
      const trimmedUrl = String(channelUrl).trim();
      mission.channelUrl = trimmedUrl
        ? /^https?:\/\//i.test(trimmedUrl)
          ? trimmedUrl
          : trimmedUrl.startsWith('@')
          ? `https://t.me/${trimmedUrl.slice(1)}`
          : `https://${trimmedUrl}`
        : mission.channelUsername?.startsWith('@')
        ? `https://t.me/${mission.channelUsername.slice(1)}`
        : '';
    }
    if (requiresProof !== undefined) mission.requiresProof = Boolean(requiresProof);
    mission.updatedAt = new Date().toISOString();

    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'missions' });
    upsertCatalogDocToFirestoreRest('eco_missions', mission.id, mission, getFirebaseTokenFromReq(req)).catch(() => {});
    res.json({ success: true, mission: sanitizeMissionForCaller(mission, false) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/missions/:id', requireRoles('super_admin', 'moderator', 'school_admin'), (req: AuthenticatedRequest, res) => {
  try {
    const idx = (centralDb.ecoMissions || []).findIndex((m: any) => m.id === req.params.id);
    if (idx === -1) return res.status(404).json({ error: 'Topshiriq topilmadi' });
    centralDb.ecoMissions.splice(idx, 1);
    recordDeletedId(req.params.id);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'missions' });
    deleteCatalogDocFromFirestoreRest('eco_missions', req.params.id, req.authUser.uid, getFirebaseTokenFromReq(req)).catch(() => {});
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/missions/weekly/join', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const { challenge, win } = ensureCurrentWeeklyChallenge();
    if (!challenge.participants) challenge.participants = {};
    if (!challenge.participants[caller.uid]) {
      const progress = computeWeeklyActionsForUser(caller.uid, win.weekKey);
      challenge.participants[caller.uid] = {
        uid: caller.uid,
        fullName: caller.fullName || "O'quvchi",
        schoolId: caller.schoolId || '',
        progress,
        joinedAt: new Date().toISOString(),
        claimed: false,
      };
      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'missions' });
    }
    res.json({ success: true, weeklyChallenge: buildWeeklyChallengeSummary(caller) });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/missions/weekly/claim', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const { challenge, win } = ensureCurrentWeeklyChallenge();
    const entry = challenge.participants?.[caller.uid];
    if (!entry) {
      return res.status(400).json({ error: "Avval haftalik chellenjga qo'shiling!" });
    }
    if (entry.claimed) {
      return res.status(409).json({ error: 'Ushbu haftalik bonus allaqachon olingan!' });
    }
    const progress = Math.max(entry.progress || 0, computeWeeklyActionsForUser(caller.uid, win.weekKey));
    const target = Number(challenge.targetActions) || 3;
    if (progress < target) {
      return res.status(400).json({ error: `Bonus uchun kamida ${target} ta eko-harakat bajaring (${progress}/${target}).` });
    }
    entry.claimed = true;
    entry.progress = progress;
    const reward = Math.max(10, Number(challenge.rewardCoins) || 250);
    caller.ecoCoins = (caller.ecoCoins || 0) + reward;
    caller.totalCoinsEarned = (caller.totalCoinsEarned || 0) + reward;
    recordTransaction({
      userId: caller.uid,
      amount: reward,
      type: 'bonus',
      status: 'approved',
      reason: `Haftalik Yashil Chellenj bonusi (${win.weekKey})`,
    });
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'missions' });
    res.json({
      success: true,
      awardedCoins: reward,
      newBalance: caller.ecoCoins,
      weeklyChallenge: buildWeeklyChallengeSummary(caller),
      message: `Tabriklaymiz! Haftalik chellenj yakunlandi: +${reward} EcoCoin qo'shildi!`,
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// Proctored Quiz Anti-Cheat Session Endpoints (One question at a time, server timer, option/question shuffle, speed check, daily limit)
const QUIZ_TIME_LIMIT_SECONDS = 20;
const QUIZ_SUSPICIOUS_FAST_MS = 2000;
const QUIZ_MAX_DAILY_ATTEMPTS = 3;
const QUIZ_PROCTOR_NOTICE_UZ =
  "Bu testni sunʼiy intellekt yordamida yechish taqiqlangan. Shubhali urinishlar uchun mukofot berilmaydi.";

app.post('/api/missions/:id/quiz/start', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const mission = (centralDb.ecoMissions || []).find((m: any) => m.id === req.params.id);
    if (!mission || mission.status !== 'active' || mission.type !== 'quiz') {
      return res.status(404).json({ error: 'Test topilmadi yoki faol emas' });
    }

    const allQuestions = normalizeQuizQuestions(mission);
    if (allQuestions.length === 0) {
      return res.status(400).json({ error: 'Test savollari topilmadi' });
    }

    const today = getUzbekistanDateKey();
    if (!centralDb.quizDailyAttempts || typeof centralDb.quizDailyAttempts !== 'object') {
      centralDb.quizDailyAttempts = {};
    }
    const attemptKey = `${caller.uid}::${mission.id}`;
    const userAttemptDates = centralDb.quizDailyAttempts[attemptKey] || {};
    const usedToday = Number(userAttemptDates[today] || 0);

    if (usedToday >= QUIZ_MAX_DAILY_ATTEMPTS) {
      return res.status(429).json({
        success: false,
        limitReached: true,
        attemptsUsedToday: usedToday,
        maxAttemptsPerDay: QUIZ_MAX_DAILY_ATTEMPTS,
        error: `Bugungi urinishlar limiti tugadi (kuniga maksimal ${QUIZ_MAX_DAILY_ATTEMPTS} ta urinish). Ertaga qaytadan urinib ko‘ring!`,
      });
    }

    // Select random subset if question bank > 10, otherwise shuffle question order
    const shuffledPool = shuffleQuizArray(allQuestions);
    const maxQuestionsPerAttempt = Math.min(shuffledPool.length, 10);
    const chosenQuestions = (shuffledPool.length > 10 ? shuffledPool.slice(0, maxQuestionsPerAttempt) : shuffledPool).map(
      (q: any) => {
        const indexedOptions: { text: string; isCorrect: boolean }[] = q.options.map((text: string, origIdx: number) => ({
          text: stripQuizOptionMarker(text),
          isCorrect: origIdx === Number(q.correctIndex),
        }));
        const shuffledOptions = shuffleQuizArray(indexedOptions) as { text: string; isCorrect: boolean }[];
        const shuffledCorrectIndex = Math.max(
          0,
          shuffledOptions.findIndex((o: { text: string; isCorrect: boolean }) => o.isCorrect)
        );
        return {
          id: q.id,
          question: q.question,
          imageUrl: q.imageUrl || undefined,
          options: shuffledOptions.map((o: { text: string; isCorrect: boolean }) => o.text),
          shuffledCorrectIndex,
          explanation: q.explanation || '',
        };
      }
    );

    if (!centralDb.quizSessions || typeof centralDb.quizSessions !== 'object') {
      centralDb.quizSessions = {};
    }
    // Prune stale sessions older than 24h to keep DB small
    const cutoffMs = Date.now() - 24 * 3600 * 1000;
    for (const [sid, sess] of Object.entries(centralDb.quizSessions)) {
      if (new Date((sess as any)?.createdAt || 0).getTime() < cutoffMs) {
        delete centralDb.quizSessions[sid];
      }
    }

    const nextAttemptsUsed = usedToday + 1;
    centralDb.quizDailyAttempts[attemptKey] = { [today]: nextAttemptsUsed };

    const nowMs = Date.now();
    const nowIso = new Date(nowMs).toISOString();
    const sessionId = `qses_${nowMs}_${Math.random().toString(36).slice(2, 8)}`;

    centralDb.quizSessions[sessionId] = {
      id: sessionId,
      userId: caller.uid,
      missionId: mission.id,
      dateKey: today,
      questions: chosenQuestions,
      currentIndex: 0,
      questionStartedAtMs: nowMs,
      answers: [],
      tabViolations: 0,
      suspiciousFastCount: 0,
      isSuspicious: false,
      cancelled: false,
      finished: false,
      createdAt: nowIso,
    };

    saveCentralDb();

    const firstQ = chosenQuestions[0];
    const alreadyRewarded = Array.isArray(centralDb.missionCompletions?.[caller.uid])
      ? centralDb.missionCompletions[caller.uid].includes(mission.id)
      : false;

    return res.json({
      success: true,
      sessionId,
      totalQuestions: chosenQuestions.length,
      currentIndex: 0,
      timeLimitSeconds: QUIZ_TIME_LIMIT_SECONDS,
      questionStartedAt: nowIso,
      attemptsUsedToday: nextAttemptsUsed,
      maxAttemptsPerDay: QUIZ_MAX_DAILY_ATTEMPTS,
      alreadyRewarded,
      noticeUz: QUIZ_PROCTOR_NOTICE_UZ,
      question: {
        id: firstQ.id,
        question: firstQ.question,
        options: firstQ.options,
        ...(firstQ.imageUrl ? { imageUrl: firstQ.imageUrl } : {}),
      },
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Test sessiyasini boshlashda xatolik' });
  }
});

app.post('/api/missions/:id/quiz/violation', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const { sessionId, reason } = req.body || {};
    const session = centralDb.quizSessions?.[String(sessionId || '')];
    if (!session || session.userId !== caller.uid || session.missionId !== req.params.id) {
      return res.status(404).json({ error: 'Test sessiyasi topilmadi' });
    }
    if (session.finished || session.cancelled) {
      return res.json({
        success: true,
        cancelled: Boolean(session.cancelled),
        warningCount: Number(session.tabViolations || 0),
        message: session.cancelReason || 'Test yakunlangan.',
      });
    }

    session.tabViolations = Number(session.tabViolations || 0) + 1;
    const count = session.tabViolations;
    if (count >= 2) {
      session.cancelled = true;
      session.finished = true;
      session.isSuspicious = true;
      session.cancelReason =
        "Test paytida ilova yoki oyna ikki marta almashtirilgani sababli urinish bekor qilindi.";
      addAuditLog({
        actorUid: caller.uid,
        actorName: caller.fullName,
        actorRole: caller.role,
        action: 'quiz_attempt_cancelled_tab_switch',
        targetCollection: 'eco_missions',
        targetId: req.params.id,
        details: { sessionId, reason: reason || 'visibilitychange', tabViolations: count },
      });
      saveCentralDb();
      return res.json({
        success: true,
        cancelled: true,
        warningCount: count,
        noticeUz: QUIZ_PROCTOR_NOTICE_UZ,
        message: session.cancelReason,
      });
    }

    saveCentralDb();
    return res.json({
      success: true,
      cancelled: false,
      warningCount: count,
      message:
        "Diqqat! Test paytida boshqa oynaga o‘tish taqiqlangan. Yana bir marta takrorlansa urinish avtomatik bekor qilinadi!",
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Xatolik' });
  }
});

app.post('/api/missions/:id/quiz/answer', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const mission = (centralDb.ecoMissions || []).find((m: any) => m.id === req.params.id);
    if (!mission || mission.status !== 'active' || mission.type !== 'quiz') {
      return res.status(404).json({ error: 'Test topilmadi yoki faol emas' });
    }

    const { sessionId, questionIndex, selectedIndex, timedOut } = req.body || {};
    const session = centralDb.quizSessions?.[String(sessionId || '')];
    if (!session || session.userId !== caller.uid || session.missionId !== mission.id) {
      return res.status(404).json({ error: 'Faol test sessiyasi topilmadi' });
    }
    if (session.cancelled) {
      return res.status(400).json({ error: session.cancelReason || 'Urinish bekor qilingan' });
    }
    if (session.finished) {
      return res.status(400).json({ error: 'Ushbu test sessiyasi allaqachon yakunlangan' });
    }

    const curIdx = Number(session.currentIndex || 0);
    if (Number(questionIndex) !== curIdx) {
      return res.status(409).json({ error: 'Savol tartibi mos kelmadi. Iltimos sahifani yangilang.' });
    }

    const qObj = session.questions[curIdx];
    if (!qObj) {
      return res.status(400).json({ error: 'Savol topilmadi' });
    }

    const nowMs = Date.now();
    const elapsedMs = Math.max(0, nowMs - Number(session.questionStartedAtMs || nowMs));
    const isTimedOut = Boolean(timedOut) || elapsedMs > (QUIZ_TIME_LIMIT_SECONDS * 1000 + 1500);
    const parsedSelected = selectedIndex === null || selectedIndex === undefined ? -1 : Number(selectedIndex);
    const isValidSelection =
      !isTimedOut && !Number.isNaN(parsedSelected) && parsedSelected >= 0 && parsedSelected < qObj.options.length;
    const isSuspiciousFast = !isTimedOut && isValidSelection && elapsedMs < QUIZ_SUSPICIOUS_FAST_MS;

    if (isSuspiciousFast) {
      session.suspiciousFastCount = Number(session.suspiciousFastCount || 0) + 1;
      session.isSuspicious = true;
    }

    const isCorrect = !isTimedOut && isValidSelection && parsedSelected === Number(qObj.shuffledCorrectIndex);

    session.answers.push({
      questionId: qObj.id,
      question: qObj.question,
      selectedIndex: isValidSelection ? parsedSelected : -1,
      correctIndex: Number(qObj.shuffledCorrectIndex),
      isCorrect,
      timedOut: isTimedOut,
      suspiciousFast: isSuspiciousFast,
      elapsedMs,
      explanation: qObj.explanation || '',
    });

    // Advance to next single question if not finished
    if (curIdx + 1 < session.questions.length) {
      session.currentIndex = curIdx + 1;
      session.questionStartedAtMs = nowMs;
      saveCentralDb();
      const nextQ = session.questions[session.currentIndex];
      return res.json({
        success: true,
        finished: false,
        currentIndex: session.currentIndex,
        totalQuestions: session.questions.length,
        timeLimitSeconds: QUIZ_TIME_LIMIT_SECONDS,
        questionStartedAt: new Date(nowMs).toISOString(),
        lastQuestionTimedOut: isTimedOut,
        lastQuestionSuspiciousFast: isSuspiciousFast,
        question: {
          id: nextQ.id,
          question: nextQ.question,
          options: nextQ.options,
          ...(nextQ.imageUrl ? { imageUrl: nextQ.imageUrl } : {}),
        },
      });
    }

    // Complete quiz attempt and grade strictly on server
    session.finished = true;
    session.finishedAt = new Date(nowMs).toISOString();

    const totalCount = session.questions.length;
    const correctCount = session.answers.filter((a: any) => a.isCorrect).length;
    const scorePercent = totalCount > 0 ? Math.round((correctCount / totalCount) * 100) : 0;
    const passingPercent = Math.max(10, Math.min(100, Number(mission.passingPercent) || 70));
    const passed = !session.cancelled && scorePercent >= passingPercent;
    const isSuspicious = Boolean(session.isSuspicious || Number(session.suspiciousFastCount || 0) > 0);

    if (!centralDb.missionCompletions || typeof centralDb.missionCompletions !== 'object') {
      centralDb.missionCompletions = {};
    }
    const userCompleted = centralDb.missionCompletions[caller.uid] || [];
    const alreadyRewarded = userCompleted.includes(mission.id);
    const rewardCoins = Math.max(1, Number(mission.rewardCoins) || 50);
    const rewardXp = rewardCoins * 4;

    let awardedCoins = 0;
    let awardedXp = 0;

    if (passed && !isSuspicious && !alreadyRewarded) {
      userCompleted.push(mission.id);
      centralDb.missionCompletions[caller.uid] = userCompleted;
      caller.ecoCoins = (caller.ecoCoins || 0) + rewardCoins;
      caller.totalCoinsEarned = (caller.totalCoinsEarned || 0) + rewardCoins;
      caller.ecoXP = Number(caller.ecoXP || 0) + rewardXp;
      syncUserStatsConsistency(caller);
      recordTransaction({
        userId: caller.uid,
        amount: rewardCoins,
        type: 'earn',
        status: 'approved',
        reason: `Eco-Quiz (${scorePercent}%): ${mission.title}`,
      });
      awardedCoins = rewardCoins;
      awardedXp = rewardXp;
    }

    if (isSuspicious) {
      addAuditLog({
        actorUid: caller.uid,
        actorName: caller.fullName,
        actorRole: caller.role,
        action: 'quiz_attempt_flagged_suspicious',
        targetCollection: 'eco_missions',
        targetId: mission.id,
        details: {
          sessionId,
          scorePercent,
          suspiciousFastCount: session.suspiciousFastCount || 0,
          tabViolations: session.tabViolations || 0,
        },
      });
    }

    saveCentralDb();
    if (awardedCoins > 0) {
      broadcastRealtimeEvent('db:updated', { scope: 'missions' });
    }

    const suspiciousReason = isSuspicious
      ? "Bir yoki bir nechta savolga 2 soniyadan tez javob berilgani sababli urinish shubhali deb topildi — XP va EcoCoin berilmaydi."
      : undefined;

    let resultMessage = '';
    if (isSuspicious) {
      resultMessage = `Shubhali urinish aniqlandi (${scorePercent}%): 2 soniyadan tez javob berilgani uchun XP va EcoCoin berilmadi.`;
    } else if (passed && awardedCoins > 0) {
      resultMessage = `Ajoyib! Siz ${scorePercent}% natija qayd etdingiz: +${awardedCoins} EcoCoin va +${awardedXp} XP berildi!`;
    } else if (passed && alreadyRewarded) {
      resultMessage = `Natija: ${scorePercent}% (${correctCount}/${totalCount}). Ushbu test uchun mukofot birinchi muvaffaqiyatli urinishda berilgan.`;
    } else {
      resultMessage = `Natija: ${scorePercent}% (${correctCount}/${totalCount}). O‘tish uchun kamida ${passingPercent}% to‘plang.`;
    }

    return res.json({
      success: true,
      finished: true,
      passed,
      scorePercent,
      correctCount,
      totalCount,
      passingPercent,
      awardedCoins,
      awardedXp,
      isSuspicious,
      suspiciousReason,
      alreadyRewarded,
      noticeUz: QUIZ_PROCTOR_NOTICE_UZ,
      results: session.answers.map((a: any) => ({
        questionId: a.questionId,
        question: a.question,
        selectedIndex: a.selectedIndex,
        correctIndex: a.correctIndex,
        isCorrect: a.isCorrect,
        timedOut: a.timedOut,
        explanation: a.explanation,
      })),
      ...(awardedCoins > 0 ? { newBalance: caller.ecoCoins, completedIds: userCompleted } : {}),
      message: resultMessage,
    });
  } catch (err: any) {
    return res.status(500).json({ error: err?.message || 'Javobni tekshirishda xatolik' });
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
      return res.status(400).json({
        error: "Testlar nazorat ostida bittadan savol rejimida (/quiz/start va /quiz/answer) topshiriladi.",
      });
    }

    if (mission.type === 'channel_subscribe') {
      const verifyRes = await verifyTelegramChannelMembership({
        channelHandle: mission.channelUsername,
        channelUrl: mission.channelUrl,
        userTelegramId: caller.telegramId,
        title: mission.title,
      });

      if (!verifyRes.ok) {
        return res.status(verifyRes.statusCode || 400).json({
          success: false,
          verified: false,
          error: verifyRes.error,
        });
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
        verified: true,
        awardedCoins: reward,
        newBalance: caller.ecoCoins,
        completedIds: userCompleted,
        message: `Obuna haqiqiy tasdiqlandi! +${reward} EcoCoin balansingizga qo'shildi!`,
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

    // Strict first-time bot/platform join validation
    const alreadyClaimedAnyReferral =
      Boolean(claimer.referredBy) ||
      centralDb.referrals.some((r) => r.referredUid === claimer.uid);
    if (alreadyClaimedAnyReferral) {
      return res.status(400).json({ error: "Ushbu taklif allaqachon hisobga olingan" });
    }

    const tgKey = String(claimer.telegramId || claimer.chatId || '').trim();
    const starterRecord = tgKey ? centralDb.botStarters?.[tgKey] : null;
    const isVeteranBotUser = Boolean(
      (starterRecord && starterRecord.firstTimeRefEligible === false) ||
        (claimer.isOnboarded && claimer.welcomeBonusClaimed)
    );
    if (isVeteranBotUser) {
      return res.status(400).json({
        error: "Referal bonusi faqat botga birinchi marta qo'shilayotgan do'stlar uchun beriladi!",
      });
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
    claimer.referredBy = resolvedReferrer?.referralCode || targetReferrerUid;
    if (starterRecord) {
      starterRecord.firstTimeRefEligible = false;
    }
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
// 8.5 BUGUNGI MISSIYALAR (DAILY MISSIONS) WORKFLOW
// ==========================================
app.get('/api/daily-missions', (req: AuthenticatedRequest, res) => {
  const caller = req.authUser || null;
  const isSuper = Boolean(caller && checkIsSuperAdmin(caller));
  const items = (centralDb.dailyMissions || []).filter((m: any) => m.status === 'active' || isSuper);
  const completedIds = caller ? centralDb.dailyMissionCompletions?.[caller.uid] || [] : [];
  const submissions = !caller
    ? []
    : isSuper || hasAnyRole(caller, ['moderator'])
    ? centralDb.dailyMissionSubmissions || []
    : hasAnyRole(caller, ['school_admin'])
    ? (centralDb.dailyMissionSubmissions || []).filter(
        (s: any) =>
          s.userId === caller.uid ||
          (caller.schoolId && s.schoolId === caller.schoolId) ||
          (caller.schoolName && s.schoolName === caller.schoolName)
      )
    : (centralDb.dailyMissionSubmissions || []).filter((s: any) => s.userId === caller.uid);
  res.json({ success: true, missions: items, completedIds, submissions });
});

app.post('/api/daily-missions', requireRoles('super_admin'), async (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const { title, description, rewardCoins } = req.body || {};
    const cleanTitle = String(title || '').trim();
    const cleanDesc = String(description || '').trim();
    const reward = Math.max(5, Math.min(5000, Number(rewardCoins) || 50));
    if (!cleanTitle) {
      return res.status(400).json({ error: 'Missiya sarlavhasini kiriting' });
    }

    const nowIso = new Date().toISOString();
    const created = {
      id: `dmission_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: cleanTitle,
      description: cleanDesc || "Topshiriqni bajarib rasmga oling va Maktab Sardori tekshiruviga yuboring.",
      rewardCoins: reward,
      status: 'active',
      createdAt: nowIso,
      createdByName: caller.fullName || 'Super Admin',
    };

    if (!Array.isArray(centralDb.dailyMissions)) centralDb.dailyMissions = [];
    centralDb.dailyMissions.unshift(created);

    // Notify registered students in-app and via Telegram chat
    const allUsers = Object.values(centralDb.users || {}) as any[];
    const tgTargets = new Set<string>();
    for (const u of allUsers) {
      if (!u || !u.uid) continue;
      if (u.notificationsEnabled === false) continue;
      if (u.isOnboarded && (u.role === 'student' || !u.role || u.uid === caller.uid)) {
        centralDb.notifications.unshift({
          id: `notif_dm_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          userId: u.uid,
          title: '🆕 Yangi Bugungi Missiya!',
          message: `"${created.title}" (+${created.rewardCoins} EcoCoin). Kabinetdan rasm yuklab topshiring!`,
          type: 'mission',
          read: false,
          createdAt: nowIso,
        });
      }
      const chatTarget = String(u.telegramChatId || u.telegramId || u.chatId || '').trim();
      if (chatTarget && (u.isOnboarded || centralDb.botStarters?.[chatTarget])) {
        tgTargets.add(chatTarget);
      }
    }
    for (const starter of Object.values(centralDb.botStarters || {}) as any[]) {
      const cId = String(starter?.chatId || '').trim();
      if (cId) tgTargets.add(cId);
    }

    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'daily_missions' });

    const escapeTgHtml = (v: unknown) =>
      String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const tgMsg =
      `🆕 <b>YANGI BUGUNGI MISSIYA QO'SHILDI!</b>\n\n` +
      `🎯 <b>Vazifa:</b> ${escapeTgHtml(created.title)}\n` +
      `📝 ${escapeTgHtml(created.description)}\n` +
      `💰 <b>Mukofot:</b> +${created.rewardCoins} EcoCoin\n\n` +
      `📸 O'quvchi kabinetiga kirib, vazifani bajarganingizni rasm qilib yuboring!`;
    const replyMarkup = {
      inline_keyboard: [[{ text: '🎯 Bugungi Missiyalarni Ochish', web_app: { url: `${APP_URL}?tab=admin&openDailyMissions=1` } }]],
    };

    // Fire Telegram broadcasts asynchronously in small batches
    Promise.allSettled(
      Array.from(tgTargets)
        .slice(0, 500)
        .map((cId) => sendTelegramMessage(cId, tgMsg, { reply_markup: replyMarkup }))
    ).catch(() => {});

    res.json({ success: true, mission: created, notifiedCount: tgTargets.size });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/daily-missions/:id', requireRoles('super_admin'), (req: AuthenticatedRequest, res) => {
  try {
    const id = String(req.params.id || '').trim();
    const list = centralDb.dailyMissions || [];
    const idx = list.findIndex((m: any) => m.id === id);
    if (idx === -1) {
      return res.status(404).json({ error: 'Kunlik missiya topilmadi' });
    }
    list.splice(idx, 1);
    recordDeletedId(id);
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'daily_missions' });
    res.json({ success: true, id });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/daily-missions/clear', requireRoles('super_admin'), (_req: AuthenticatedRequest, res) => {
  try {
    const list = centralDb.dailyMissions || [];
    for (const m of list) {
      if (m?.id) recordDeletedId(String(m.id));
    }
    centralDb.dailyMissions = [];
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'daily_missions' });
    res.json({ success: true });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/daily-missions/:id/submit', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    if (!isUserFullyRegistered(caller)) {
      return res.status(403).json({
        code: 'REGISTRATION_REQUIRED',
        error: "Bugungi missiyani topshirish uchun avval to'liq ro'yxatdan o'tishingiz shart (ism, telefon va maktab).",
      });
    }

    const mission = (centralDb.dailyMissions || []).find((m: any) => m.id === req.params.id);
    if (!mission || mission.status !== 'active') {
      return res.status(404).json({ error: 'Kunlik missiya topilmadi yoki faol emas' });
    }

    if (!centralDb.dailyMissionCompletions || typeof centralDb.dailyMissionCompletions !== 'object') {
      centralDb.dailyMissionCompletions = {};
    }
    const completed = centralDb.dailyMissionCompletions[caller.uid] || [];
    if (completed.includes(mission.id)) {
      return res.status(400).json({ error: 'Siz ushbu kunlik missiyani allaqachon bajargansiz!' });
    }

    if (!Array.isArray(centralDb.dailyMissionSubmissions)) centralDb.dailyMissionSubmissions = [];
    const existingPending = centralDb.dailyMissionSubmissions.find(
      (s: any) => s.missionId === mission.id && s.userId === caller.uid && s.status === 'pending'
    );
    if (existingPending) {
      return res.status(400).json({ error: "Ushbu missiya bo'yicha rasmingiz Maktab Sardori tekshiruvida!" });
    }

    const { photoUrl, comment } = req.body || {};
    const cleanPhotoUrl = String(photoUrl || '').trim();
    if (!cleanPhotoUrl || !/^(\/uploads\/|https?:\/\/|data:image\/)/i.test(cleanPhotoUrl)) {
      return res.status(400).json({ error: "Missiyani bajarganingizni tasdiqlovchi to'g'ri rasm yuklang!" });
    }

    const nowIso = new Date().toISOString();
    const submission = {
      id: `dsub_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      missionId: mission.id,
      missionTitle: mission.title,
      userId: caller.uid,
      userName: caller.fullName || 'O‘quvchi',
      userGrade: caller.grade || '',
      schoolId: caller.schoolId || '',
      schoolName: caller.schoolName || '',
      photoUrl: cleanPhotoUrl,
      comment: String(comment || '').trim(),
      status: 'pending',
      awardedCoins: Math.max(5, Number(mission.rewardCoins) || 50),
      createdAt: nowIso,
    };

    centralDb.dailyMissionSubmissions.unshift(submission);

    // Find Maktab Sardori (school_admin) for this school, fallback to Super Admin if none linked
    const allUsers = Object.values(centralDb.users || {}) as any[];
    const schoolCaptains = allUsers.filter((u: any) => {
      if (!u || u.uid === caller.uid) return false;
      const isCaptainRole =
        u.role === 'school_admin' ||
        (Array.isArray(u.approvedRoles) && u.approvedRoles.includes('school_admin'));
      if (!isCaptainRole) return false;
      const sameSchoolId = caller.schoolId && u.schoolId && u.schoolId === caller.schoolId;
      const sameSchoolName =
        caller.schoolName &&
        u.schoolName &&
        String(u.schoolName).trim().toLowerCase() === String(caller.schoolName).trim().toLowerCase();
      return Boolean(sameSchoolId || sameSchoolName);
    });

    const escapeTgHtml = (v: unknown) =>
      String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const reviewDeepLink = `${APP_URL}?tab=admin&adminTab=school_dashboard&verifyDaily=${encodeURIComponent(submission.id)}`;
    const sardorText =
      `📋 <b>O'QUVCHI BUGUNGI MISSIYANI BAJARDI!</b>\n\n` +
      `👤 <b>O'quvchi:</b> ${escapeTgHtml(submission.userName)}${submission.userGrade ? ` (${escapeTgHtml(submission.userGrade)})` : ''}\n` +
      `🏫 <b>Maktab:</b> ${escapeTgHtml(submission.schoolName)}\n` +
      `🎯 <b>Missiya:</b> ${escapeTgHtml(submission.missionTitle)}\n` +
      (submission.comment ? `💬 <b>Izoh:</b> ${escapeTgHtml(submission.comment)}\n` : '') +
      `💰 <b>Tasdiqlansa mukofot:</b> +${submission.awardedCoins} EcoCoin\n\n` +
      `👇 Rasmini ko'rib tasdiqlash uchun pastdagi <b>Tekshirish</b> tugmasini bosing:`;
    const sardorMarkup = {
      reply_markup: {
        inline_keyboard: [[{ text: '🔍 Tekshirish', web_app: { url: reviewDeepLink } }]],
      },
    };

    const notifiedCaptainTgIds = new Set<string>();
    for (const cap of schoolCaptains) {
      centralDb.notifications.unshift({
        id: `notif_cap_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        userId: cap.uid,
        title: `📸 ${submission.userName} missiyani bajardi`,
        message: `"${submission.missionTitle}" — Tekshirish va tasdiqlash kutilmoqda.`,
        type: 'mission',
        read: false,
        createdAt: nowIso,
      });
      const tgChat = String(cap.telegramChatId || cap.telegramId || cap.chatId || '').trim();
      if (tgChat) notifiedCaptainTgIds.add(tgChat);
    }

    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'daily_missions' });

    if (notifiedCaptainTgIds.size > 0) {
      await Promise.allSettled(
        Array.from(notifiedCaptainTgIds).map((cId) =>
          sendTelegramPhoto(cId, submission.photoUrl, sardorText, sardorMarkup)
        )
      );
    } else {
      // Fallback: notify Super Admins so submissions never go unnoticed if school lacks an assigned Telegram captain
      await notifySuperAdminsTelegram(sardorText, sardorMarkup, submission.photoUrl);
    }

    res.json({
      success: true,
      submission,
      message: "Rasmingiz Maktab Sardoriga yuborildi! Tekshiruvdan so'ng EcoCoin hisobingizga tushadi.",
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/daily-missions/submissions/:subId/review', requireRoles('school_admin', 'super_admin', 'moderator'), async (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const isPrivileged = checkIsSuperAdmin(caller) || hasAnyRole(caller, ['moderator']);
    const sub = (centralDb.dailyMissionSubmissions || []).find((s: any) => s.id === req.params.subId);
    if (!sub) return res.status(404).json({ error: 'Topshiriq hisoboti topilmadi' });
    if (sub.status !== 'pending') return res.status(400).json({ error: "Ushbu hisobot allaqachon ko'rib chiqilgan" });

    if (!isPrivileged) {
      const sameSchool =
        (caller.schoolId && sub.schoolId === caller.schoolId) ||
        (caller.schoolName &&
          sub.schoolName &&
          String(caller.schoolName).trim().toLowerCase() === String(sub.schoolName).trim().toLowerCase());
      if (!sameSchool) {
        return res.status(403).json({ error: "Faqat o'z maktabingiz o'quvchilarining missiyasini tekshirishingiz mumkin" });
      }
    }

    const { action, adminNote } = req.body || {};
    const nowIso = new Date().toISOString();
    sub.reviewedBy = caller.fullName || 'Maktab Sardori';
    sub.reviewedAt = nowIso;
    if (adminNote) sub.adminNote = String(adminNote).trim();

    const targetUser = findUserByAnyIdentifier({ uid: sub.userId });

    if (action === 'approve') {
      sub.status = 'approved';
      if (!centralDb.dailyMissionCompletions || typeof centralDb.dailyMissionCompletions !== 'object') {
        centralDb.dailyMissionCompletions = {};
      }
      const list = centralDb.dailyMissionCompletions[sub.userId] || [];
      if (!list.includes(sub.missionId)) {
        list.push(sub.missionId);
        centralDb.dailyMissionCompletions[sub.userId] = list;
      }

      if (targetUser) {
        const amt = Math.max(5, Number(sub.awardedCoins) || 50);
        const xpEarned = Math.max(30, amt * 2);
        targetUser.ecoCoins = (targetUser.ecoCoins || 0) + amt;
        targetUser.totalCoinsEarned = (targetUser.totalCoinsEarned || 0) + amt;
        targetUser.ecoXP = (targetUser.ecoXP || 0) + xpEarned;
        syncUserStatsConsistency(targetUser);
        upsertUser(targetUser);

        if (targetUser.schoolId) {
          const sch = centralDb.schools.find((s: any) => s.id === targetUser.schoolId);
          if (sch) {
            sch.totalCoins = (sch.totalCoins || 0) + amt;
          }
        }

        recordTransaction({
          userId: targetUser.uid,
          amount: amt,
          type: 'earn',
          status: 'approved',
          reason: `Bugungi missiya tasdiqlandi: ${sub.missionTitle}`,
        });

        centralDb.notifications.unshift({
          id: `notif_dapp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          userId: targetUser.uid,
          title: `✅ +${amt} EcoCoin! Bugungi missiya tasdiqlandi`,
          message: `"${sub.missionTitle}" missiyangiz ${sub.reviewedBy} tomonidan tasdiqlandi!`,
          type: 'coin',
          read: false,
          createdAt: nowIso,
        });

        const escapeTgHtml = (v: unknown) =>
          String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const studentChatId = String(targetUser.telegramChatId || targetUser.telegramId || targetUser.chatId || '').trim();
        if (studentChatId) {
          await sendTelegramMessage(
            studentChatId,
            `✅ <b>BUGUNGI MISSIYANGIZ TASDIQLANDI!</b>\n\n` +
              `🎯 <b>Missiya:</b> ${escapeTgHtml(sub.missionTitle)}\n` +
              `🛡 <b>Tasdiqladi:</b> ${escapeTgHtml(sub.reviewedBy)}\n` +
              `💰 <b>Mukofot:</b> +${amt} EcoCoin · ⚡ +${xpEarned} XP\n` +
              `💳 <b>Joriy balansingiz:</b> ${targetUser.ecoCoins} EcoCoin`,
            {
              reply_markup: {
                inline_keyboard: [[{ text: "👤 O'quvchi Kabinetini Ochish", web_app: { url: `${APP_URL}?tab=admin` } }]],
              },
            }
          ).catch(() => {});
        }
      }
    } else if (action === 'reject') {
      sub.status = 'rejected';
      if (targetUser) {
        centralDb.notifications.unshift({
          id: `notif_drej_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          userId: targetUser.uid,
          title: '❌ Bugungi missiya rad etildi',
          message: `"${sub.missionTitle}" rad etildi.${sub.adminNote ? ` Sabab: ${sub.adminNote}` : ' Qayta aniqroq rasm yuboring.'}`,
          type: 'system',
          read: false,
          createdAt: nowIso,
        });
        const escapeTgHtml = (v: unknown) =>
          String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const studentChatId = String(targetUser.telegramChatId || targetUser.telegramId || targetUser.chatId || '').trim();
        if (studentChatId) {
          await sendTelegramMessage(
            studentChatId,
            `❌ <b>BUGUNGI MISSIYA RAD ETILDI</b>\n\n` +
              `🎯 <b>Missiya:</b> ${escapeTgHtml(sub.missionTitle)}\n` +
              (sub.adminNote ? `📝 <b>Sabab:</b> ${escapeTgHtml(sub.adminNote)}\n` : '') +
              `📸 Iltimos, vazifani to'g'ri bajarib qaytadan aniq rasm yuboring.`,
            {
              reply_markup: {
                inline_keyboard: [[{ text: '📸 Qayta yuborish', web_app: { url: `${APP_URL}?tab=admin&openDailyMissions=1` } }]],
              },
            }
          ).catch(() => {});
        }
      }
    } else {
      return res.status(400).json({ error: "Noto'g'ri amal" });
    }

    recalculateSchoolRanks();
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'daily_missions' });
    res.json({ success: true, submission: sub });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 9. TELEGRAM BOT & MINI APP SUITE
// ==========================================

let activeBotToken: string =
  process.env.TELEGRAM_BOT_TOKEN ||
  process.env.BOT_TOKEN ||
  process.env.TELEGRAM_TOKEN ||
  process.env.TELEGRAM_API_KEY ||
  '';

let activeBotUsername: string =
  process.env.TELEGRAM_BOT_USERNAME || 'Ecoheros_bot';

const TELEGRAM_WEBHOOK_SECRET = String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim();

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
  phoneVerified?: boolean;
  fullName?: string;
  region?: string;
  district?: string;
  schoolName?: string;
  schoolNumber?: string;
  grade?: string;
  referredBy?: string;
  firstTimeRefEligible?: boolean;
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
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
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
      const rel = cleanUrl.replace(/^\/+/, '');
      const candidates = cleanUrl.startsWith('/uploads/')
        ? [
            path.resolve(UPLOADS_DIR, path.basename(rel)),
            path.resolve(process.cwd(), 'public', rel),
          ]
        : [path.resolve(process.cwd(), 'public', rel)];
      const localPath = candidates.find((p) => {
        const withinUploads = p.startsWith(path.resolve(UPLOADS_DIR) + path.sep);
        const withinPublic = p.startsWith(path.resolve(process.cwd(), 'public') + path.sep);
        return (withinUploads || withinPublic) && fs.existsSync(p);
      });
      if (localPath) {
        const buffer = fs.readFileSync(localPath);
        const ext = path.extname(localPath).toLowerCase() || '.jpg';
        const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
        const form = new FormData();
        form.append('chat_id', String(chatId));
        form.append('caption', caption);
        form.append('parse_mode', 'HTML');
        if (extraOptions?.reply_markup) {
          form.append('reply_markup', JSON.stringify(extraOptions.reply_markup));
        }
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

function getSuperAdminTelegramTargets(): string[] {
  const targets = new Set<string>(getSuperAdminTelegramIdList());
  for (const u of Object.values(centralDb.users) as any[]) {
    if (u?.role === 'super_admin') {
      const tg = String(u.telegramChatId || u.telegramId || '').trim();
      if (tg) targets.add(tg);
    }
  }
  return Array.from(targets);
}

async function notifySuperAdminsTelegram(text: string, extraOptions: any = {}, photoUrl?: string) {
  const targets = getSuperAdminTelegramTargets();
  if (targets.length === 0) return;
  await Promise.all(
    targets.map((chatId) =>
      photoUrl
        ? sendTelegramPhoto(chatId, photoUrl, text, extraOptions).catch(() => {})
        : sendTelegramMessage(chatId, text, extraOptions).catch(() => {})
    )
  );
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
    const tgUsernameTag = tgUser.username ? `@${tgUser.username}` : undefined;
    const tgDisplayName = [tgUser.first_name, tgUser.last_name].filter(Boolean).join(' ').trim() || undefined;
    const wasSeenBeforeWebApp = Boolean(
      centralDb.botStarters?.[chatId] || findUserByAnyIdentifier({ telegramId: chatId, chatId })
    );
    recordBotStarter(chatId, tgUsernameTag, tgDisplayName, true, {
      firstTimeRefEligible: !wasSeenBeforeWebApp,
    });

    const isVerifiedSuper =
      !isDevBypass &&
      checkIsSuperAdmin({
        telegramId: tgUser.id,
        verifiedTelegram: true,
      });

    let registeredUser = findUserByAnyIdentifier({ telegramId: chatId, chatId });
    if (!registeredUser && isVerifiedSuper) {
      registeredUser = (Object.values(centralDb.users) as any[]).find(
        (u) => u && (u.role === 'super_admin' || isSuperAdminTelegramId(u.telegramId))
      );
    }

    if (registeredUser) {
      if (isVerifiedSuper) {
        const otherSupers = (Object.values(centralDb.users) as any[]).filter(
          (u) => u && u.uid !== registeredUser.uid && (u.role === 'super_admin' || isSuperAdminTelegramId(u.telegramId))
        );
        for (const other of otherSupers) {
          registeredUser = mergeUserAccounts(registeredUser.uid, other.uid) || registeredUser;
        }
      }

      const userRole = isVerifiedSuper ? 'super_admin' : registeredUser.role || 'student';
      const approvedRoles = isVerifiedSuper
        ? ['student', 'ambassador', 'school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin', 'sponsor']
        : registeredUser.approvedRoles || [userRole];

      registeredUser.role = userRole;
      registeredUser.approvedRoles = approvedRoles;
      registeredUser.telegramId = Number(tgUser.id) || tgUser.id;
      registeredUser.telegramChatId = chatId;
      registeredUser.chatId = chatId;
      if (tgUser.username) registeredUser.telegramUsername = `@${tgUser.username}`;
      if (tgUser.photo_url && !registeredUser.customAvatar && !String(registeredUser.avatarUrl || '').startsWith('/uploads/')) {
        registeredUser.avatarUrl = tgUser.photo_url;
        registeredUser.profileImage = tgUser.photo_url;
      }
      if (!registeredUser.isOnboarded && isUserFullyRegistered(registeredUser)) {
        registeredUser.isOnboarded = true;
      }
      if (!registeredUser.email || isSyntheticEmail(registeredUser.email)) {
        registeredUser.email = registeredUser.email || `${tgUser.username || tgUser.id}@telegram.ecohero.uz`;
      }
      syncUserStatsConsistency(registeredUser);
      upsertUser(registeredUser);
      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'users' });

      return res.json({
        success: true,
        sessionToken: issueSessionToken(registeredUser),
        user: sanitizeSelfUser({ ...registeredUser, telegramAuth: true }),
        isDevBypass,
      });
    }

    const autoName = tgDisplayName || tgUser.username || 'Eko-Qahramon';
    const createdUser = upsertUser({
      uid: `user_tg_${tgUser.id}`,
      fullName: autoName,
      email: `${tgUser.username || tgUser.id}@telegram.ecohero.uz`,
      telegramId: tgUser.id,
      telegramChatId: chatId,
      chatId,
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
      role: isVerifiedSuper ? 'super_admin' : 'student',
      approvedRoles: isVerifiedSuper
        ? ['student', 'ambassador', 'school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin', 'sponsor']
        : ['student'],
      ecoCoins: 0,
      ecoXP: 0,
      level: 1,
      reportsCount: 0,
      treesPlanted: 0,
      cleanupsCount: 0,
      streakDays: 1,
      totalCoinsEarned: 0,
      activityStats: {
        reportsCount: 0,
        cleanupsCount: 0,
        treesPlanted: 0,
        streakDays: 1,
        totalCoinsEarned: 0,
      },
      referralCode: `ECO${String(tgUser.id).slice(-4)}`,
      isVerified: isVerifiedSuper,
      badge: isVerifiedSuper ? 'Bosh Administrator' : 'Yangi Eko-Qahramon',
      isOnboarded: isVerifiedSuper ? true : false,
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
  let existing = session.phoneVerified
    ? findUserByAnyIdentifier({ telegramId: chatKey, chatId: chatKey, phoneNumber: session.phoneNumber })
    : findUserByAnyIdentifier({ telegramId: chatKey, chatId: chatKey });

  const tgShellUid = `user_tg_${chatKey}`;
  if (existing && existing.uid !== tgShellUid && centralDb.users[tgShellUid]) {
    existing = mergeUserAccounts(existing.uid, tgShellUid) || existing;
  }

  const isVerifiedSuper = checkIsSuperAdmin({
    telegramId: chatKey,
    verifiedTelegram: true,
  });

  const welcomeReward = getConfiguredReward('welcomeBonus');
  const isNewUser = !existing || !existing.welcomeBonusClaimed;
  const coins = isNewUser ? Number(existing?.ecoCoins || 0) + welcomeReward : existing?.ecoCoins ?? welcomeReward;
  const totalCoins = isNewUser
    ? Math.max(Number(existing?.totalCoinsEarned || 0) + welcomeReward, coins)
    : existing?.totalCoinsEarned ?? coins;

  const cleanRegion = session.region || 'Toshkent shahri';
  const cleanDistrict = session.district || 'Shayxontohur tumani';
  const cleanSchoolName = session.schoolName || '1-maktab';

  const isSameSchool = existing?.schoolName === cleanSchoolName && existing?.region === cleanRegion && existing?.district === cleanDistrict;
  const linkedSchool = findOrCreateSchool({
    schoolId: isSameSchool ? existing?.schoolId : undefined,
    schoolName: cleanSchoolName,
    schoolNumber,
    region: cleanRegion,
    district: cleanDistrict,
    coinsDelta: isNewUser ? welcomeReward : 0,
    incrementStudents: !existing?.isOnboarded || !existing?.schoolId,
  });

  const canonicalUid = existing?.uid || tgShellUid;
  const finalProfile = upsertUser({
    uid: canonicalUid,
    userId: canonicalUid,
    chatId: chatKey,
    telegramId: Number(chatKey) || chatKey,
    telegramChatId: chatKey,
    telegramUsername: username || existing?.telegramUsername || '',
    fullName: session.fullName || existing?.fullName || userFirstName || 'Eko-Qahramon',
    phoneNumber: session.phoneNumber || existing?.phoneNumber || '',
    email: existing?.email && !isSyntheticEmail(existing.email) ? existing.email : existing?.email || `${chatKey}@telegram.ecohero.uz`,
    region: cleanRegion,
    district: cleanDistrict,
    schoolId: linkedSchool?.id || 'school_custom',
    schoolName: linkedSchool?.name || cleanSchoolName,
    schoolNumber,
    grade: session.grade || existing?.grade || '9-sinf',
    ecoCoins: coins,
    totalCoinsEarned: totalCoins,
    ecoXP: existing?.ecoXP,
    reportsCount: existing?.reportsCount || 0,
    treesPlanted: existing?.treesPlanted || 0,
    cleanupsCount: existing?.cleanupsCount || 0,
    streakDays: existing?.streakDays || 1,
    role: isVerifiedSuper ? 'super_admin' : existing?.role || 'student',
    approvedRoles: isVerifiedSuper
      ? ['student', 'ambassador', 'school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin', 'sponsor']
      : existing?.approvedRoles || ['student'],
    welcomeBonusClaimed: true,
    avatarUrl: existing?.avatarUrl || DEFAULT_AVATAR,
    profileImage: existing?.profileImage || DEFAULT_AVATAR,
    registrationDate: existing?.registrationDate || new Date().toISOString(),
    badge: isVerifiedSuper ? 'Bosh Administrator' : existing?.badge || 'Yangi Eko-Qahramon',
    referralCode: existing?.referralCode || `ECO${chatKey.slice(-4)}`,
    isOnboarded: true,
    isVerified: isVerifiedSuper || existing?.isVerified || false,
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

    if (
      session.referredBy &&
      session.firstTimeRefEligible === true &&
      !centralDb.referrals.some((r) => r.referredUid === finalProfile.uid)
    ) {
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
            `🎉 <b>TAKLIF BONUSI!</b>\n\nDo'stingiz <b>${finalProfile.fullName}</b> birinchi marta botga qo'shilib sizning havolangiz orqali ro'yxatdan o'tdi!\n💰 Sizga <b>+${inviterBonus} EcoCoin</b> qo'shildi.`
          ).catch(() => {});
        }
      }
    }
  }

  if (centralDb.botStarters?.[chatKey]) {
    centralDb.botStarters[chatKey].firstTimeRefEligible = false;
  }

  syncUserStatsConsistency(finalProfile);
  upsertUser(finalProfile);
  reconcileSchoolsAndStudents(false);
  deleteRegistrationSession(chatKey);
  saveCentralDb();
  broadcastRealtimeEvent('db:updated', { scope: 'users' });

  const completedText = isNewUser
    ? `🎉 <b>TABRIKLAYMIZ! RO'YXATDAN MUVAFFAQIYATLI O'TDINGIZ!</b>\n\nSizga dastlabki <b>+${welcomeReward} ECO COIN</b> sovg'a taqdim etildi! 💰${referralSummaryText}\n\n📋 <b>Sizning ma'lumotlaringiz (Yagona bazaga saqlandi):</b>\n👤 <b>Ism-familiya:</b> ${finalProfile.fullName}\n📱 <b>Telefon:</b> ${finalProfile.phoneNumber}\n📍 <b>Hudud:</b> ${finalProfile.region}, ${finalProfile.district}\n🏫 <b>Maktab va sinf:</b> ${finalProfile.schoolName} (${finalProfile.grade})\n🏆 <b>Maktab reytingi o'rni:</b> #${linkedSchool?.ratingRank || '-'}\n💰 <b>Balans:</b> ${finalProfile.ecoCoins} EcoCoin\n\nBuyruqlar: /report · /activity · /profile · /web · /sync · /invite · /coins · /help`
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

function createTelegramWebLoginLink(userObj: any): { token: string; code: string; loginUrl: string } {
  if (!centralDb.telegramLoginTokens) centralDb.telegramLoginTokens = {};
  const nowMs = Date.now();
  for (const [k, v] of Object.entries(centralDb.telegramLoginTokens)) {
    if (!v?.expiresAt || Date.parse(v.expiresAt) < nowMs) {
      delete centralDb.telegramLoginTokens[k];
    }
  }
  const canonicalUid = resolveCanonicalUid(userObj.uid) || userObj.uid;
  const token = crypto.randomBytes(16).toString('hex');
  const code = crypto.randomBytes(3).toString('hex').toUpperCase();
  const createdAt = new Date(nowMs).toISOString();
  const expiresAt = new Date(nowMs + 10 * 60 * 1000).toISOString();
  centralDb.telegramLoginTokens[token] = {
    token,
    code,
    uid: canonicalUid,
    telegramId: userObj.telegramId || userObj.chatId || '',
    createdAt,
    expiresAt,
  };
  saveCentralDb();
  const baseUrl = String(APP_URL || '').replace(/\/+$/, '');
  return {
    token,
    code,
    loginUrl: `${baseUrl}/?tg_login=${encodeURIComponent(token)}`,
  };
}

function consumeTelegramLinkCode(
  rawCode: string,
  chatKey: string,
  username?: string,
  userFirstName?: string
): { ok: boolean; user?: any; error?: string } {
  if (!centralDb.telegramLinkTokens) centralDb.telegramLinkTokens = {};
  const nowMs = Date.now();
  for (const [k, v] of Object.entries(centralDb.telegramLinkTokens)) {
    if (!v?.expiresAt || Date.parse(v.expiresAt) < nowMs) {
      delete centralDb.telegramLinkTokens[k];
    }
  }
  const normalizedCode = String(rawCode || '').trim().toUpperCase();
  const entry = centralDb.telegramLinkTokens[normalizedCode];
  if (!entry) {
    return {
      ok: false,
      error: "Bog'lash kodi noto'g'ri yoki muddati tugagan. Veb-ilova / PWA Profilingizdan yangi kod oling.",
    };
  }

  const targetUser = findUserByAnyIdentifier({ uid: entry.uid }) || centralDb.users[resolveCanonicalUid(entry.uid)];
  if (!targetUser) {
    delete centralDb.telegramLinkTokens[normalizedCode];
    saveCentralDb();
    return { ok: false, error: 'Ushbu veb-hisob topilmadi.' };
  }

  if (targetUser.telegramId && String(targetUser.telegramId) !== chatKey) {
    return {
      ok: false,
      error: "Ushbu veb-hisob allaqachon boshqa Telegram akkauntiga bog'langan.",
    };
  }

  delete centralDb.telegramLinkTokens[normalizedCode];
  const existingTgUser = findUserByAnyIdentifier({ telegramId: chatKey, chatId: chatKey });
  let unified = targetUser;
  if (existingTgUser && existingTgUser.uid !== targetUser.uid) {
    unified = mergeUserAccounts(targetUser.uid, existingTgUser.uid) || targetUser;
  }

  unified = upsertUser({
    ...unified,
    telegramId: Number(chatKey) || chatKey,
    telegramChatId: chatKey,
    chatId: chatKey,
    telegramUsername: username || unified.telegramUsername || '',
    fullName: unified.fullName || userFirstName || 'Eko-Qahramon',
  });
  saveCentralDb();
  broadcastRealtimeEvent('db:updated', { scope: 'users' });
  return { ok: true, user: unified };
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
      const cqCaller = findUserByAnyIdentifier({ telegramId: String(cq.from?.id || '') });
      const isCallerSuper =
        checkIsSuperAdmin({ telegramId: cq.from?.id, verifiedTelegram: true }) ||
        Boolean(cqCaller && checkIsSuperAdmin(cqCaller));

      await answerCallbackQuery(cq.id);
      if (!chatId) return;

      const chatKey = String(chatId);
      recordBotStarter(chatKey, username, userFirstName);
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
        const regIdx = Math.max(0, parseInt(data.replace('reg_reg:', ''), 10) || 0);
        const resolvedReg = UZBEKISTAN_REGIONS[regIdx] || UZBEKISTAN_REGIONS[0];
        session.region = resolvedReg;
        session.step = 'DISTRICT';
        session.updatedAt = Date.now();
        setRegistrationSession(chatKey, session);

        const districts = UZBEKISTAN_DISTRICTS[resolvedReg] || [];
        const districtButtons = [];
        for (let i = 0; i < districts.length; i += 2) {
          const row = [{ text: districts[i], callback_data: `reg_dist:${regIdx}:${i}` }];
          if (i + 1 < districts.length) row.push({ text: districts[i + 1], callback_data: `reg_dist:${regIdx}:${i + 1}` });
          districtButtons.push(row);
        }

        await sendTelegramMessage(chatId, `✅ Viloyat: <b>${resolvedReg}</b>\n\n4️⃣ <b>Tuman yoki shahringizni tanlang:</b>`, {
          reply_markup: { inline_keyboard: districtButtons },
        });
        return;
      }

      if (data.startsWith('reg_dist:')) {
        const existingTgUser = findUserByAnyIdentifier({ telegramId: chatKey, chatId: chatKey });
        const rawDist = data.replace('reg_dist:', '');
        const parts = rawDist.split(':');
        const hasComposite = parts.length >= 2;
        const regIdx = hasComposite ? parseInt(parts[0], 10) : -1;
        const distIdx = hasComposite ? parseInt(parts[1], 10) : parseInt(parts[0], 10);

        const resolvedRegion =
          (regIdx >= 0 && UZBEKISTAN_REGIONS[regIdx]) ||
          session?.region ||
          existingTgUser?.region ||
          UZBEKISTAN_REGIONS[0];
        const distList = UZBEKISTAN_DISTRICTS[resolvedRegion] || [];
        const resolvedDistrict =
          (!Number.isNaN(distIdx) && distList[distIdx]) || distList[0] || 'Markaziy tumani';

        if (!session) {
          session = {
            mode: 'REGISTER',
            step: 'SCHOOL',
            phoneNumber: existingTgUser?.phoneNumber || '',
            fullName: existingTgUser?.fullName || userFirstName,
            updatedAt: Date.now(),
          };
        }
        session.region = resolvedRegion;
        session.district = resolvedDistrict;
        session.step = session.mode === 'APPLY' ? 'APPLY_SCHOOL_NUM' : 'SCHOOL';
        session.updatedAt = Date.now();
        setRegistrationSession(chatKey, session);

        await sendTelegramMessage(
          chatId,
          session.mode === 'APPLY'
            ? `✅ Hudud: <b>${resolvedRegion}, ${resolvedDistrict}</b>\n\n🏫 <b>Maktab raqamini yozing</b> (Masalan: <code>17</code>):`
            : `✅ Hudud: <b>${resolvedRegion}, ${resolvedDistrict}</b>\n\n5️⃣ <b>Maktabingiz raqami yoki nomini yozib yuboring</b> (Masalan: <code>17-maktab</code>):`,
          { reply_markup: { remove_keyboard: true } }
        );
        return;
      }

      if (data.startsWith('reg_grade:')) {
        const chosenGrade = data.replace('reg_grade:', '');
        if (!session) {
          const existingTgUser = findUserByAnyIdentifier({ telegramId: chatKey, chatId: chatKey });
          session = {
            mode: 'REGISTER',
            step: 'GRADE',
            phoneNumber: existingTgUser?.phoneNumber || '',
            fullName: existingTgUser?.fullName || userFirstName,
            region: existingTgUser?.region || UZBEKISTAN_REGIONS[0],
            district: existingTgUser?.district || 'Markaziy tumani',
            schoolName: existingTgUser?.schoolName || '1-maktab',
            updatedAt: Date.now(),
          };
        }
        session.grade = chosenGrade;
        await completeTelegramRegistration(chatId, session, username, userFirstName);
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
          await sendTelegramMessage(chatId, '⛔️ Ushbu moderatsiya amali faqat Super Admin uchun ruxsat etilgan.');
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

    // Handle my_chat_member (bot started / blocked / unblocked)
    if (update.my_chat_member) {
      const mcm = update.my_chat_member;
      const mChatId = mcm.chat?.id || mcm.from?.id;
      if (mChatId) {
        const mUsername = mcm.from?.username ? `@${mcm.from.username}` : undefined;
        const mFirstName = [mcm.from?.first_name, mcm.from?.last_name].filter(Boolean).join(' ') || undefined;
        recordBotStarter(String(mChatId), mUsername, mFirstName);
      }
      return;
    }

    // Handle Messages & Edited Messages
    const msg = update.message || update.edited_message;
    if (!msg) return;
    const chatId = msg.chat?.id;
    if (!chatId) return;

    const chatKey = String(chatId);
    const text = (msg.text || msg.caption || '').trim();
    const userFirstName = msg.from?.first_name || 'Eko-Qahramon';
    const username = msg.from?.username ? `@${msg.from.username}` : undefined;
    const priorBotStarter = centralDb.botStarters?.[chatKey];
    const regUser = findUserByAnyIdentifier({ telegramId: chatKey, chatId: chatKey });
    const wasAlreadySeenInBot = Boolean(priorBotStarter || regUser?.isOnboarded);
    if (regUser && !regUser.isOnboarded && isUserFullyRegistered(regUser)) {
      regUser.isOnboarded = true;
      upsertUser(regUser);
      saveCentralDb();
    }
    const startParamPre = text.startsWith('/start') ? text.split(/\s+/)[1]?.trim() : undefined;
    const isFreshBotJoin = !wasAlreadySeenInBot;
    recordBotStarter(chatKey, username, userFirstName, false, {
      firstTimeRefEligible:
        isFreshBotJoin && Boolean(startParamPre && !startParamPre.startsWith('link_'))
          ? true
          : priorBotStarter
          ? Boolean(priorBotStarter.firstTimeRefEligible && !regUser?.isOnboarded)
          : false,
      firstTimeRefCode:
        isFreshBotJoin && startParamPre && !startParamPre.startsWith('link_') ? startParamPre : undefined,
    });
    let session = getRegistrationSession(chatKey);
    const isRegistered = Boolean(regUser && (regUser.isOnboarded || isUserFullyRegistered(regUser)));
    const isBotSuperAdmin =
      checkIsSuperAdmin({ telegramId: chatId, verifiedTelegram: true }) ||
      Boolean(regUser && checkIsSuperAdmin(regUser));

    // Super Admin JSON Backup Restore via Telegram Document upload
    if (
      msg.document &&
      isBotSuperAdmin &&
      (msg.document.mime_type === 'application/json' ||
        String(msg.document.file_name || '').toLowerCase().endsWith('.json'))
    ) {
      try {
        if (!activeBotToken) return;
        const gfRes = await fetch(
          `https://api.telegram.org/bot${activeBotToken}/getFile?file_id=${encodeURIComponent(msg.document.file_id)}`
        );
        const gfData: any = await gfRes.json().catch(() => null);
        const filePath = gfData?.result?.file_path;
        if (!filePath) {
          await sendTelegramMessage(chatId, "❌ Zaxira faylini Telegramdan yuklab bo'lmadi.");
          return;
        }
        const dlRes = await fetch(`https://api.telegram.org/file/bot${activeBotToken}/${filePath}`);
        const rawJsonText = await dlRes.text();
        const parsedBackup = JSON.parse(rawJsonText);
        const mergedRes = mergeDatabaseSnapshotNonDestructive(parsedBackup);
        reconcileSchoolsAndStudents(true);
        const liveNow = computeLiveMetrics();
        if (mergedRes.changed) {
          broadcastRealtimeEvent('db:updated', { scope: 'cloud_restore' });
        }
        await sendTelegramMessage(
          chatId,
          `✅ <b>ZAXIRA BAZADAN TIKLANDI!</b>\n\n` +
            `👥 Tiklangan foydalanuvchilar: +${mergedRes.restoredUsers}\n` +
            `🏫 Tiklangan maktablar: +${mergedRes.restoredSchools}\n` +
            `🤖 Tiklangan bot obunachilari: +${mergedRes.restoredStarters}\n\n` +
            `📊 <b>Joriy jonli holat:</b>\n` +
            `• Maktablar: ${liveNow.totalSchools}\n` +
            `• O'quvchilar: ${liveNow.totalUsers}\n` +
            `• Bot foydalanuvchilari: ${liveNow.botUsersCount}`,
          {
            reply_markup: {
              inline_keyboard: [[{ text: '🌍 Ilovada tekshirish', web_app: { url: APP_URL } }]],
            },
          }
        );
      } catch (err: any) {
        await sendTelegramMessage(chatId, `⚠️ JSON zaxira faylini o'qishda xatolik: ${err?.message || 'Noto‘g‘ri JSON'}`);
      }
      return;
    }

    // Admin Token Switch Command (in-memory only; use TELEGRAM_BOT_TOKEN env for persistence)
    if (text.startsWith('/token ') || text.startsWith('/settoken ')) {
      const newToken = text.split(/\s+/)[1]?.trim();
      if (!isBotSuperAdmin) {
        await sendTelegramMessage(chatId, '⛔️ Ushbu buyruq faqat Super Admin uchun.');
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
      startTelegramPolling(newToken);
      await sendTelegramMessage(
        chatId,
        `✅ Yangi bot ulandi (joriy jarayon uchun): @${activeBotUsername}\nℹ️ Doimiy saqlash uchun TELEGRAM_BOT_TOKEN env o'zgaruvchisini yangilang.`
      );
      return;
    }

    // 1. Contact Handler (Verified by Telegram phone ownership check)
    if (msg.contact) {
      if (msg.contact.user_id && String(msg.contact.user_id) !== chatKey) {
        await sendTelegramMessage(
          chatId,
          "⚠️ Iltimos, faqat o'zingizning shaxsiy Telegram kontaktingizni yuboring (boshqa foydalanuvchi kontaktini ulash mumkin emas)."
        );
        return;
      }

      let rawPhone = String(msg.contact.phone_number || '').trim();
      if (!rawPhone.startsWith('+')) rawPhone = `+${rawPhone}`;
      const contactFullName = [msg.contact.first_name, msg.contact.last_name].filter(Boolean).join(' ') || userFirstName;
      const isVerifiedSuper = checkIsSuperAdmin({ telegramId: chatKey, verifiedTelegram: true });

      if (isVerifiedSuper) {
        let existingSuper =
          findUserByAnyIdentifier({ telegramId: chatKey, chatId: chatKey, phoneNumber: rawPhone }) ||
          (Object.values(centralDb.users) as any[]).find(
            (u) => u && (u.role === 'super_admin' || isSuperAdminTelegramId(u.telegramId))
          );
        if (existingSuper && regUser && existingSuper.uid !== regUser.uid) {
          existingSuper = mergeUserAccounts(existingSuper.uid, regUser.uid) || existingSuper;
        }
        const superProfile = upsertUser({
          ...(existingSuper || {}),
          uid: existingSuper?.uid || `user_tg_${chatKey}`,
          chatId: chatKey,
          telegramId: Number(chatKey) || chatKey,
          telegramChatId: chatKey,
          telegramUsername: username || existingSuper?.telegramUsername || '',
          fullName: existingSuper?.fullName || contactFullName,
          phoneNumber: existingSuper?.phoneNumber || rawPhone,
          region: existingSuper?.region || 'Toshkent shahri',
          district: existingSuper?.district || 'Shayxontohur tumani',
          schoolId: existingSuper?.schoolId || 'central_hq',
          schoolName: existingSuper?.schoolName || 'ECO HERO Markaziy Boshqarmasi',
          schoolNumber: existingSuper?.schoolNumber || '1',
          grade: existingSuper?.grade || 'Super Admin',
          role: 'super_admin',
          approvedRoles: ['student', 'ambassador', 'school_admin', 'district_coordinator', 'regional_coordinator', 'moderator', 'super_admin', 'sponsor'],
          welcomeBonusClaimed: true,
          avatarUrl: existingSuper?.avatarUrl || DEFAULT_AVATAR,
          badge: 'Bosh Administrator',
          isOnboarded: true,
          isVerified: true,
        });
        deleteRegistrationSession(chatKey);
        saveCentralDb();
        broadcastRealtimeEvent('db:updated', { scope: 'users' });

        await sendTelegramMessage(
          chatId,
          `👑 <b>XUSH KELIBSIZ, BOSH ADMINISTRATOR!</b>\n\n🛡 <b>Vakolat:</b> Super Admin\n💰 <b>Balans:</b> ${superProfile.ecoCoins || 0} EcoCoin`,
          {
            reply_markup: {
              remove_keyboard: true,
              inline_keyboard: [[{ text: '🌍 ECO HERO Boshqaruv Panelini ochish', web_app: { url: APP_URL } }]],
            },
          }
        );
        return;
      }

      // If user already onboarded (matched by telegramId OR verified phoneNumber), merge & link into canonical account!
      let matchedExisting = findUserByAnyIdentifier({ telegramId: chatKey, chatId: chatKey, phoneNumber: rawPhone });
      if (matchedExisting && matchedExisting.isOnboarded) {
        if (regUser && regUser.uid !== matchedExisting.uid) {
          matchedExisting = mergeUserAccounts(matchedExisting.uid, regUser.uid) || matchedExisting;
        }
        matchedExisting = upsertUser({
          ...matchedExisting,
          telegramId: Number(chatKey) || chatKey,
          telegramChatId: chatKey,
          chatId: chatKey,
          telegramUsername: username || matchedExisting.telegramUsername || '',
          phoneNumber: matchedExisting.phoneNumber || rawPhone,
        });
        deleteRegistrationSession(chatKey);
        saveCentralDb();
        broadcastRealtimeEvent('db:updated', { scope: 'users' });

        await sendTelegramMessage(
          chatId,
          `✅ <b>Hisobingiz muvaffaqiyatli bog'landi (Yagona Xotira), ${matchedExisting.fullName}!</b>\n\n🏫 <b>Maktab:</b> ${matchedExisting.schoolName}\n💰 <b>Balans:</b> ${matchedExisting.ecoCoins || 0} EcoCoin · ⚡ <b>XP:</b> ${matchedExisting.ecoXP || 0}\n\nBuyruqlar: /report, /activity, /web, /sync, /tasks, /coins`,
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
        phoneVerified: true,
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
          `🌐 /web — Veb-ilova / PWA ga bir martalik kirish havolasi\n` +
          `🔗 /link KOD — Veb-profilni Telegram bot bilan bog'lash\n` +
          `🔄 /sync — Yagona xotiradagi balans va natijani ko'rish\n` +
          `👤 /profile — Mening profilim va reytingim\n` +
          `🚨 /report — Ekologik muammo xabar qilish (foto + lokatsiya)\n` +
          `🎬 /activity — Eko-faoliyat (daraxt ekish, tozalash) yuklash\n` +
          `📋 /tasks — Menga biriktirilgan vazifalar\n` +
          `🏆 /rank — Maktablar TOP reytingi\n` +
          `📊 /stats — Jonli statistika (maktab va o'quvchilar soni)\n` +
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

    if (text.startsWith('/link')) {
      const codeArg = text.split(/\s+/)[1]?.trim();
      if (!codeArg) {
        await sendTelegramMessage(
          chatId,
          `🔗 <b>Veb / PWA hisobini bog'lash:</b>\n\n1. Veb-ilova yoki PWA Profilingizga kiring\n2. «Telegram Bot bilan bog'lash» tugmasini bosing\n3. Olingan kodni <code>/link KOD</code> ko'rinishida yuboring.`
        );
        return;
      }
      const resLink = consumeTelegramLinkCode(codeArg, chatKey, username, userFirstName);
      if (!resLink.ok || !resLink.user) {
        await sendTelegramMessage(chatId, `⚠️ ${resLink.error || "Bog'lash amalga oshmadi."}`);
        return;
      }
      deleteRegistrationSession(chatKey);
      await sendTelegramMessage(
        chatId,
        `✅ <b>YAGONA XOTIRA ULANGAN!</b>\n\n👤 <b>Profil:</b> ${resLink.user.fullName}\n💰 <b>Balans:</b> ${resLink.user.ecoCoins || 0} EcoCoin · ⚡ <b>XP:</b> ${resLink.user.ecoXP || 0}\n🏫 <b>Maktab:</b> ${resLink.user.schoolName || '-'}\n\nEndi Telegram Bot, Mini App va Veb / PWA ilovasida natijalaringiz 100% bir xil saqlanadi!`,
        {
          reply_markup: {
            remove_keyboard: true,
            inline_keyboard: [[{ text: '🌍 ECO HERO ilovasini ochish', web_app: { url: APP_URL } }]],
          },
        }
      );
      return;
    }

    if (text === '/web' || text === '/login' || text.startsWith('/web@')) {
      if (!regUser || !regUser.isOnboarded) {
        await sendTelegramMessage(chatId, "🌐 Veb-ilova / PWA ga kirish uchun avval botda ro'yxatdan o'ting:", {
          reply_markup: { inline_keyboard: [[{ text: "🚀 Ro'yxatdan o'tish", callback_data: 'restart_reg' }]] },
        });
        return;
      }
      const magic = createTelegramWebLoginLink(regUser);
      const isPublicHttps = /^https:\/\//i.test(magic.loginUrl) && !isPrivateAiStudioOrLocalUrl(magic.loginUrl);
      const inlineRows: any[] = [];
      if (isPublicHttps) {
        inlineRows.push([{ text: '🌐 Veb / PWA ilovada ochish', url: magic.loginUrl }]);
      }
      inlineRows.push([{ text: '📱 Mini Appda ochish', web_app: { url: APP_URL } }]);
      await sendTelegramMessage(
        chatId,
        `🌐 <b>VEB-ILOVA VA PWA GA KIRISH (10 DAQIQA)</b>\n\n👤 <b>Hisob:</b> ${regUser.fullName}\n💰 <b>Balans:</b> ${regUser.ecoCoins || 0} EcoCoin\n\n🔑 <b>Bir martalik kirish kodi:</b> <code>${magic.code}</code>\n${isPublicHttps ? `\n🔗 Yoki tayyor havola orqali kiring:\n${magic.loginUrl}` : "\n📱 Brauzer yoki PWA ilovada «Kirish» → «Telegram Bot kodi bilan kirish» bo'limiga yuqoridagi kodni kiriting."}`,
        {
          reply_markup: { inline_keyboard: inlineRows },
        }
      );
      return;
    }

    if (text === '/sync' || text === '/sinxron') {
      if (!regUser) {
        await sendTelegramMessage(chatId, "🔄 Sinxronlash uchun avval ro'yxatdan o'ting yoki veb-profilingizdan <code>/link KOD</code> yuboring.", {
          reply_markup: { inline_keyboard: [[{ text: "🚀 Ro'yxatdan o'tish", callback_data: 'restart_reg' }]] },
        });
        return;
      }
      syncUserStatsConsistency(regUser);
      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'users' });
      await sendTelegramMessage(
        chatId,
        `🔄 <b>YAGONA XOTIRA SINXRONLANDI!</b>\n\n👤 <b>Foydalanuvchi:</b> ${regUser.fullName}\n💰 <b>Balans:</b> ${regUser.ecoCoins || 0} EcoCoin\n⚡ <b>Tajriba:</b> ${regUser.ecoXP || 0} XP (Daraja ${regUser.level || 1})\n🔥 <b>Kunlik streak:</b> ${regUser.streakDays || 1} kun\n🏫 <b>Maktab:</b> ${regUser.schoolName || '-'}\n\nUshbu natijalar Bot, Mini App va Veb / PWA ilovasida bir vaqtning o'zida amal qiladi.`,
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

      if (startParam && startParam.startsWith('link_')) {
        const linkCode = startParam.slice(5).trim();
        const resLink = consumeTelegramLinkCode(linkCode, chatKey, username, userFirstName);
        if (!resLink.ok || !resLink.user) {
          await sendTelegramMessage(chatId, `⚠️ ${resLink.error || "Bog'lash amalga oshmadi."}`);
          return;
        }
        await sendTelegramMessage(
          chatId,
          `✅ <b>YAGONA XOTIRA ULANGAN!</b>\n\n👤 <b>Profil:</b> ${resLink.user.fullName}\n💰 <b>Balans:</b> ${resLink.user.ecoCoins || 0} EcoCoin · ⚡ <b>XP:</b> ${resLink.user.ecoXP || 0}\n🏫 <b>Maktab:</b> ${resLink.user.schoolName || '-'}\n\nEndi Telegram Bot, Mini App va Veb / PWA ilovasida natijalaringiz 100% bir xil!`,
          {
            reply_markup: {
              remove_keyboard: true,
              inline_keyboard: [[{ text: '🌍 ECO HERO ilovasini ochish', web_app: { url: APP_URL } }]],
            },
          }
        );
        return;
      }

      if (checkIsSuperAdmin({ telegramId: chatKey, verifiedTelegram: true }) || Boolean(regUser && checkIsSuperAdmin(regUser))) {
        await sendTelegramMessage(
          chatId,
          `👑 <b>Assalomu alaykum, Bosh Administrator!</b>\n\nBot, Mini App va Veb/PWA yagona xotirada faol ishlamoqda.\nBuyruqlar: /admin · /profile · /web · /sync · /apply · /activity · /report · /tasks · /rank · /coins · /invite`,
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
        const refRejectedNotice =
          startParam && !startParam.startsWith('link_')
            ? `\n\nℹ️ <i>Siz botga avvaldan qo'shilganingiz sababli referal bonusi faqat botga birinchi marta kirayotgan do'stlarga beriladi.</i>`
            : '';
        await sendTelegramMessage(
          chatId,
          `🌿 <b>Assalomu alaykum, ${regUser.fullName}!</b>\n\n💰 <b>Balans:</b> ${regUser.ecoCoins} EcoCoin · ⚡ <b>${regUser.ecoXP || 0} XP</b>\n🏫 <b>Maktab:</b> ${regUser.schoolName}\n🛡 <b>Rol:</b> ${regUser.role}${refRejectedNotice}\n\n<b>Mavjud buyruqlar:</b>\n• /report — Ekologik muammo xabar qilish\n• /activity — Eko-faoliyat (foto/video) yuklash\n• /web — Veb / PWA ga kirish kodi · /sync — Sinxronlash\n• /profile — Profilim · /invite — Do'st taklif qilish\n• /tasks — Vazifalarim · /rank — Reytinglar · /coins — Hamyon`,
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

      const starterState = centralDb.botStarters?.[chatKey];
      const canApplyReferral = Boolean(
        startParam &&
          starterState?.firstTimeRefEligible === true &&
          (!starterState.firstTimeRefCode || starterState.firstTimeRefCode === startParam)
      );
      const welcomeBonus = getConfiguredReward('welcomeBonus');
      const inviteeBonus = canApplyReferral ? getConfiguredReward('referralInvitee') : 0;
      setRegistrationSession(chatKey, {
        mode: 'REGISTER',
        step: 'PHONE',
        referredBy: canApplyReferral ? startParam : undefined,
        firstTimeRefEligible: canApplyReferral,
        updatedAt: Date.now(),
      });
      await sendTelegramMessage(
        chatId,
        `🌿 <b>Assalomu alaykum! ECO HERO platformasiga xush kelibsiz!</b>\n\nRo'yxatdan o'tib +${welcomeBonus} EcoCoin${canApplyReferral ? ` (+${inviteeBonus} birinchi qo'shilish bonusi)` : ''} olish uchun telefon raqamingizni yuboring:\n\n1️⃣ Pastdagi <b>«📲 Telefon raqamni yuborish»</b> tugmasini bosing:`,
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

    if (text === '/stats' || text === '/jonli' || text.startsWith('/stats@')) {
      reconcileSchoolsAndStudents(false);
      const metrics = computeLiveMetrics();
      const topLiveSchools = getLiveSchoolsList(true).slice(0, 5);
      const schoolLines =
        topLiveSchools.length > 0
          ? topLiveSchools
              .map(
                (s, i) =>
                  `${i + 1}. <b>${s.name}</b> — ${s.registeredStudentsCount || s.studentsCount || 0} o'quvchi · ${s.totalCoins || 0} ECO`
              )
              .join('\n')
          : "Hozircha maktablar ro'yxatdan o'tmagan.";
      await sendTelegramMessage(
        chatId,
        `📊 <b>ECO HERO JONLI STATISTIKA (ULTRA REJIM)</b>\n\n` +
          `🏫 <b>Ro'yxatdan o'tgan maktablar:</b> ${metrics.totalSchools}\n` +
          `👥 <b>Ro'yxatdagi o'quvchilar:</b> ${metrics.totalUsers}\n` +
          `🤖 <b>Bot foydalanuvchilari:</b> ${metrics.botUsersCount}\n` +
          `🗺 <b>Tumanlar / Viloyatlar:</b> ${metrics.totalDistricts} / ${metrics.totalRegions}\n` +
          `✅ <b>Hal qilingan muammolar:</b> ${metrics.resolvedReports}\n` +
          `🌱 <b>Ekilgan daraxtlar:</b> ${metrics.treesPlanted}\n\n` +
          `🏆 <b>TOP-5 FAOL MAKTAB:</b>\n${schoolLines}`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '📱 Jonli ilovani ochish', web_app: { url: APP_URL } }]],
          },
        }
      );
      return;
    }

    if (text === '/botusers' || text === '/foydalanuvchilar' || text.startsWith('/botusers@')) {
      if (!isBotSuperAdmin) {
        await sendTelegramMessage(chatId, '⛔️ Ushbu buyruq faqat Super Admin uchun.');
        return;
      }
      reconcileSchoolsAndStudents(true);
      const report = getDetectedBotUsersReport();
      const { users: detectedUsers, summary } = report;
      const topLines = detectedUsers
        .slice(0, 20)
        .map((u, idx) => {
          const uname = u.username ? ` (${u.username})` : '';
          const schoolLabel = u.schoolName && u.schoolName !== 'Maktab kiritilmagan' ? ` · ${u.schoolName}` : '';
          return `${idx + 1}. <b>${u.fullName}</b>${uname}\n    🆔 <code>${u.telegramId || u.uid}</code>${schoolLabel} · ${u.ecoCoins} ECO`;
        })
        .join('\n');
      const diskWarn = !summary.persistentVolumeActive
        ? `\n\n⚠️ <b>MUHIM OGOHLANTIRISH (Railway Volume yo'q!):</b>\nServerda <code>DATA_DIR</code> / Volume ulanmagan (<code>${summary.dataDir}</code>). Har safar Railway qayta yuklanganda eski lokal JSON o'chib ketadi. Telegram API o'chib ketgan eski tarixni qayta bermaydi.\n💡 Doimiy saqlash uchun Railway'da <code>/data</code> Volume + <code>DATA_DIR=/data</code> ulang va muntazam /backup olib turing (yoki .json zaxirani shu chatga tashlang).`
        : `\n\n✅ <b>Doimiy Disk (Volume) faol:</b> <code>${summary.dataDir}</code> (${summary.snapshotsCount} snapshot)`;
      await sendTelegramMessage(
        chatId,
        `🤖 <b>BOTDAN JAMI FOYDALANGANLAR HISOBOTI</b>\n\n` +
          `🤖 <b>Bot / Mini App foydalanuvchilari:</b> ${summary.botUsersCount}\n` +
          `👥 <b>Bazadagi jami hisoblar:</b> ${summary.registeredUsersCount} (To'liq: ${summary.onboardedUsersCount})\n` +
          `🏫 <b>Yagona maktablar:</b> ${summary.totalSchools}\n\n` +
          `📋 <b>Oxirgi aniqlanganlar (Top 20):</b>\n${topLines || "Hozircha ma'lumot yo'q."}` +
          diskWarn +
          `\n\n💾 /backup — Hozirgi bazani .json fayl qilib yuklab olish (tiklash uchun .json faylni shu chatga yuboring)`,
        {
          reply_markup: {
            inline_keyboard: [[{ text: '🌍 Admin Panelda ko‘rish', web_app: { url: APP_URL } }]],
          },
        }
      );
      return;
    }

    if (text === '/backup' || text === '/zaxira' || text.startsWith('/backup@')) {
      if (!isBotSuperAdmin) {
        await sendTelegramMessage(chatId, '⛔️ Ushbu buyruq faqat Super Admin uchun.');
        return;
      }
      try {
        reconcileSchoolsAndStudents(true);
        const snapshot = exportCompactBackupSnapshot();
        const jsonStr = JSON.stringify(snapshot, null, 2);
        const dateTag = new Date().toISOString().slice(0, 10);
        const form = new FormData();
        form.append('chat_id', String(chatId));
        form.append(
          'caption',
          `💾 ECO HERO Ultra Zaxira (${dateTag})\n👥 O'quvchilar: ${snapshot.totalUsers} · 🤖 Bot: ${snapshot.botUsersCount} · 🏫 Maktablar: ${snapshot.totalSchools}\n\nTiklash uchun shu .json faylni botga qayta yuboring.`
        );
        form.append('document', new Blob([jsonStr], { type: 'application/json' }), `ecohero-backup-${dateTag}.json`);
        const docRes = await fetch(`https://api.telegram.org/bot${activeBotToken}/sendDocument`, {
          method: 'POST',
          body: form,
        });
        const docData: any = await docRes.json().catch(() => null);
        if (!docData?.ok) {
          await sendTelegramMessage(chatId, `⚠️ Fayl yuborilmadi: ${docData?.description || 'Xatolik'}`);
        }
      } catch (err: any) {
        await sendTelegramMessage(chatId, `⚠️ Zaxira yaratishda xatolik: ${err?.message || 'Noma‘lum xato'}`);
      }
      return;
    }

    if (text === '/admin') {
      if (!checkIsSuperAdmin({ telegramId: chatId, verifiedTelegram: true }) && !(regUser && checkIsSuperAdmin(regUser))) {
        await sendTelegramMessage(chatId, '⛔️ Ushbu buyruq faqat Super Admin uchun.');
        return;
      }
      reconcileSchoolsAndStudents(false);
      const live = computeLiveMetrics();
      const pendingRep = centralDb.reports.filter((r) => r.status === 'pending' || r.status === 'PENDING_REVIEW').length;
      const pendingMed = (centralDb.mediaSubmissions || []).filter((m) => m.status === 'PENDING').length;
      const pendingApps = (centralDb.registrationApplications || []).filter((a) => a.status === 'pending').length;
      await sendTelegramMessage(
        chatId,
        `👑 <b>ECO HERO ADMIN HISOBOTI</b>\n\n` +
          `👥 <b>Ro'yxatdagi o'quvchilar:</b> ${live.totalUsers} (Bot: ${live.botUsersCount})\n` +
          `🏫 <b>Yagona maktablar:</b> ${live.totalSchools}\n` +
          `✅ <b>Hal qilingan / Daraxtlar:</b> ${live.resolvedReports} / ${live.treesPlanted}\n` +
          `⏳ <b>Kutilayotgan muammolar:</b> ${pendingRep}\n` +
          `🎬 <b>Kutilayotgan media:</b> ${pendingMed}\n` +
          `🛡 <b>Kutilayotgan arizalar:</b> ${pendingApps}\n` +
          `🌐 <b>Mini App URL:</b> <code>${APP_URL}</code>\n` +
          `📡 <b>Rejim:</b> ${isWebhookMode ? 'Webhook (24/7)' : 'Long-Polling'}\n\n` +
          `🛠 <b>Super Admin:</b> /botusers · /backup · /stats`,
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
      reconcileSchoolsAndStudents(false);
      recalculateSchoolRanks();
      const metrics = computeLiveMetrics();
      const topSchools = getLiveSchoolsList(true).slice(0, 5);
      const schoolLines = topSchools
        .map(
          (s, i) =>
            `${i + 1}. <b>${s.name}</b> — ${s.registeredStudentsCount || s.studentsCount || 0} o'quvchi · ${s.totalCoins || 0} ECO`
        )
        .join('\n');
      await sendTelegramMessage(
        chatId,
        `🏆 <b>TOP-5 EKOLOGIK MAKTABLAR REYTINGI:</b>\n\n${schoolLines || "Hozircha maktablar yo'q"}\n\n📊 <b>Jami:</b> ${metrics.totalSchools} maktab · ${metrics.totalUsers} o'quvchi`,
        { reply_markup: { inline_keyboard: [[{ text: '📊 Barcha reytinglar', web_app: { url: APP_URL } }]] } }
      );
      return;
    }

    if (text.startsWith('/check') || text.startsWith('/tekshir')) {
      const isAuthorizedChecker =
        checkIsSuperAdmin({ telegramId: chatKey, verifiedTelegram: true }) ||
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
          const alreadyByPhone = findUserByAnyIdentifier({ phoneNumber: norm });
          if (alreadyByPhone && alreadyByPhone.isOnboarded && String(alreadyByPhone.telegramId || '') !== chatKey) {
            await sendTelegramMessage(
              chatId,
              `🔐 Ushbu telefon raqami avval ro'yxatdan o'tgan hisobga biriktirilgan.\n\nXavfsiz ulash uchun pastdagi <b>«📲 Telefon raqamni yuborish»</b> tugmasini bosing yoki veb-profilingizdan <code>/link KOD</code> oling:`,
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
          const alreadySelf = findUserByAnyIdentifier({ telegramId: chatKey, chatId: chatKey });
          if (alreadySelf && alreadySelf.isOnboarded) {
            deleteRegistrationSession(chatKey);
            saveCentralDb();
            await sendTelegramMessage(chatId, `✅ Hisobingiz faol, <b>${alreadySelf.fullName}</b>! /coins yoki /report yuborishingiz mumkin.`, {
              reply_markup: { remove_keyboard: true },
            });
            return;
          }
          session.phoneNumber = norm;
          session.phoneVerified = false;
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
        broadcastRealtimeEvent('db:updated', { scope: 'applications' });

        notifySuperAdminsTelegram(
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

        await sendTelegramMessage(chatId, "✅ <b>Arizangiz Super Admin ga yuborildi!</b> Tasdiqlangach Telegram orqali xabar olasiz.");
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
        broadcastRealtimeEvent('db:updated', { scope: 'media' });

        notifySuperAdminsTelegram(
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
        broadcastRealtimeEvent('db:updated', { scope: 'reports' });

        notifySuperAdminsTelegram(
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
        if (session.step === 'DISTRICT' && session.region) {
          const distCandidates = UZBEKISTAN_DISTRICTS[session.region] || [];
          const matchedDist = distCandidates.find((d) =>
            d.toLowerCase().includes(text.toLowerCase()) || text.toLowerCase().includes(d.toLowerCase())
          );
          if (matchedDist) {
            session.district = matchedDist;
            session.step = session.mode === 'APPLY' ? 'APPLY_SCHOOL_NUM' : 'SCHOOL';
            session.updatedAt = Date.now();
            setRegistrationSession(chatKey, session);
            await sendTelegramMessage(
              chatId,
              session.mode === 'APPLY'
                ? `✅ Hudud: <b>${session.region}, ${matchedDist}</b>\n\n🏫 <b>Maktab raqamini yozing</b> (Masalan: <code>17</code>):`
                : `✅ Hudud: <b>${session.region}, ${matchedDist}</b>\n\n5️⃣ <b>Maktabingiz raqami yoki nomini yozib yuboring</b> (Masalan: <code>17-maktab</code>):`,
              { reply_markup: { remove_keyboard: true } }
            );
            return;
          }
          // If district was already stored on session (e.g. from earlier tap) and user typed a school name
          if (session.district && /\d|maktab|litsey|kollej/i.test(text)) {
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
            return;
          }
        }
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
          { command: 'web', description: 'Veb / PWA ilovasiga kirish havolasi' },
          { command: 'link', description: 'Veb-hisobni Telegramga ulash' },
          { command: 'sync', description: 'Yagona xotira natijalarini sinxronlash' },
          { command: 'profile', description: 'Mening profilim va kodim' },
          { command: 'report', description: 'Ekologik muammo xabar qilish' },
          { command: 'activity', description: 'Eko-faoliyat (foto/video) yuklash' },
          { command: 'tasks', description: 'Vazifalarim' },
          { command: 'rank', description: 'Maktablar va ishtirokchilar reytingi' },
          { command: 'stats', description: 'Jonli statistika (maktab va o‘quvchilar)' },
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
  if (!TELEGRAM_WEBHOOK_SECRET) {
    return res.sendStatus(403);
  }
  const providedSecret = String(req.headers['x-telegram-bot-api-secret-token'] || '');
  const expectedBuf = Buffer.from(TELEGRAM_WEBHOOK_SECRET);
  const providedBuf = Buffer.from(providedSecret);
  if (
    expectedBuf.length === 0 ||
    providedBuf.length !== expectedBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, providedBuf)
  ) {
    return res.sendStatus(403);
  }

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
    startTelegramPolling(cleanToken);
    res.json({
      success: true,
      bot: { id: botInfo.id, username: botInfo.username, firstName: botInfo.first_name },
      message: `@${botInfo.username} botingiz ulandi (xotirada). Doimiy saqlash uchun server muhitida TELEGRAM_BOT_TOKEN ni sozlang.`,
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
  reconcileSchoolsAndStudents(false);
  const live = computeLiveMetrics();
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
    totalSubscribers: live.botUsersCount,
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
    if (!TELEGRAM_WEBHOOK_SECRET) {
      return res.status(400).json({
        error: "TELEGRAM_WEBHOOK_SECRET muhit o'zgaruvchisi sozlanmagan. Webhook xavfsizligi uchun uni kiriting.",
      });
    }
    stopTelegramPolling();
    isWebhookMode = true;
    const webhookUrl = `${APP_URL}/api/telegram/webhook`;
    const resp = await fetch(`https://api.telegram.org/bot${activeBotToken}/setWebhook`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url: webhookUrl,
        drop_pending_updates: true,
        secret_token: TELEGRAM_WEBHOOK_SECRET,
      }),
    });
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
// 9.5 QR ECO-PUNKT, SCHOOL DUELS, CERTIFICATES, SPONSOR PORTAL & AI ANTI-CHEAT
// ==========================================

const ECOPUNKT_RATES: Record<string, { label: string; coinsPerUnit: number; unit: string }> = {
  plastic: { label: 'Plastik (PET)', coinsPerUnit: 35, unit: 'kg' },
  paper: { label: "Qog'oz / Makulatura", coinsPerUnit: 25, unit: 'kg' },
  glass: { label: 'Shisha', coinsPerUnit: 30, unit: 'kg' },
  metal: { label: 'Metall / Alyuminiy', coinsPerUnit: 45, unit: 'kg' },
  sapling: { label: "Daraxt ko'chati", coinsPerUnit: 150, unit: 'dona' },
};

function parseStudentUidFromQrPayload(raw: string): string {
  const txt = String(raw || '').trim();
  if (!txt) return '';
  if (txt.startsWith('ECO-QR:')) {
    return txt.slice('ECO-QR:'.length).trim();
  }
  if (txt.startsWith('{')) {
    try {
      const parsed = JSON.parse(txt);
      return String(parsed.uid || parsed.studentUid || '').trim();
    } catch {
      return '';
    }
  }
  return txt;
}

app.get('/api/ecopunkt/scans', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const isAdmin = hasAnyRole(caller, ['super_admin', 'moderator', 'sponsor']);
    const isRegCoord = hasAnyRole(caller, ['regional_coordinator']);
    const isDistCoord = hasAnyRole(caller, ['district_coordinator']);
    const isSchoolStaff = hasAnyRole(caller, ['school_admin', 'ambassador']);

    let scans = [...(centralDb.qrEcoScans || [])];
    if (!isAdmin) {
      if (isRegCoord) {
        scans = scans.filter((s) => s.region === caller.region || s.studentUid === caller.uid);
      } else if (isDistCoord) {
        scans = scans.filter((s) => (s.district === caller.district && s.region === caller.region) || s.studentUid === caller.uid);
      } else if (isSchoolStaff) {
        scans = scans.filter((s) => s.schoolId === caller.schoolId || s.studentUid === caller.uid || s.scannedByUid === caller.uid);
      } else {
        scans = scans.filter((s) => s.studentUid === caller.uid);
      }
    }

    const usersList = Object.values(centralDb.users || {}) as any[];
    const canScan = hasAnyRole(caller, [
      'school_admin',
      'ambassador',
      'moderator',
      'district_coordinator',
      'regional_coordinator',
      'sponsor',
      'super_admin',
    ]);
    const studentCandidates = canScan
      ? usersList
          .filter((u) => {
            if (!u?.uid) return false;
            if (isAdmin) return true;
            if (isRegCoord) return u.region === caller.region;
            if (isDistCoord) return u.district === caller.district;
            return u.schoolId === caller.schoolId || u.schoolName === caller.schoolName;
          })
          .slice(0, 80)
          .map((u) => ({
            uid: u.uid,
            fullName: u.fullName || "O'quvchi",
            grade: u.grade || '',
            schoolName: u.schoolName || '',
            ecoCoins: Number(u.ecoCoins || 0),
          }))
      : [];

    const totalKg = scans.reduce((acc, s) => acc + (s.materialType === 'sapling' ? 0 : Number(s.weightKg || 0)), 0);
    const totalCoins = scans.reduce((acc, s) => acc + Number(s.coinsAwarded || 0), 0);

    res.json({
      success: true,
      scans: scans.slice(0, 60),
      rates: ECOPUNKT_RATES,
      canScan,
      studentCandidates,
      summary: {
        totalScans: scans.length,
        totalKg: Number(totalKg.toFixed(1)),
        totalCoins,
      },
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(
  '/api/ecopunkt/scan',
  requireRoles(
    'school_admin',
    'ambassador',
    'moderator',
    'district_coordinator',
    'regional_coordinator',
    'sponsor',
    'super_admin'
  ),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const { qrPayload, studentUid, materialType, weightKg, note } = req.body || {};

      const resolvedUid = parseStudentUidFromQrPayload(qrPayload) || String(studentUid || '').trim();
      if (!resolvedUid) {
        return res.status(400).json({ error: "O'quvchi QR-ID yoki hisob ID si kiritilishi shart" });
      }
      const targetUser = centralDb.users[resolvedUid];
      if (!targetUser) {
        return res.status(404).json({ error: "Bu QR kodga mos ro'yxatdan o'tgan o'quvchi topilmadi" });
      }

      const matKey = String(materialType || '').toLowerCase();
      const rateInfo = ECOPUNKT_RATES[matKey];
      if (!rateInfo) {
        return res.status(400).json({ error: "Noto'g'ri chiqindi yoki ko'chat turi tanlandi" });
      }

      const qty = Number(weightKg);
      if (!Number.isFinite(qty) || qty <= 0 || qty > 500) {
        return res.status(400).json({ error: "Miqdor 0.1 dan 500 gacha bo'lishi kerak" });
      }

      if (
        !hasAnyRole(caller, ['super_admin', 'moderator', 'sponsor', 'regional_coordinator', 'district_coordinator']) &&
        caller.schoolId &&
        targetUser.schoolId &&
        caller.schoolId !== targetUser.schoolId
      ) {
        return res.status(403).json({
          error: "Faqat o'zingizning maktabingiz o'quvchilarining Eco-Punkt topshiruvlarini skanerlay olasiz",
        });
      }

      const oneHourAgo = Date.now() - 3600 * 1000;
      const recentForStudent = (centralDb.qrEcoScans || []).filter(
        (s) => s.studentUid === resolvedUid && new Date(s.createdAt).getTime() >= oneHourAgo
      );
      if (recentForStudent.length >= 6) {
        return res.status(429).json({
          error: "Ushbu o'quvchi uchun soatlik skaner limiti (6 ta) to'ldi. Keyinroq urinib ko'ring.",
        });
      }

      const coinsAwarded = Math.max(5, Math.min(2500, Math.round(qty * rateInfo.coinsPerUnit)));
      const xpAwarded = coinsAwarded * 2;
      const nowIso = new Date().toISOString();

      const prevCoinsTotal = Number(targetUser.totalCoinsEarned || targetUser.ecoCoins || 0);
      targetUser.ecoCoins = Number(targetUser.ecoCoins || 0) + coinsAwarded;
      targetUser.totalCoinsEarned = prevCoinsTotal + coinsAwarded;
      targetUser.ecoXP = Math.max(Number(targetUser.ecoXP || 0), prevCoinsTotal * 4) + xpAwarded;
      if (!targetUser.activityStats) {
        targetUser.activityStats = {
          reportsCount: targetUser.reportsCount || 0,
          cleanupsCount: targetUser.cleanupsCount || 0,
          treesPlanted: targetUser.treesPlanted || 0,
          streakDays: targetUser.streakDays || 0,
          totalCoinsEarned: targetUser.totalCoinsEarned,
        };
      }
      if (matKey === 'sapling') {
        const treesCount = Math.max(1, Math.round(qty));
        targetUser.treesPlanted = Number(targetUser.treesPlanted || 0) + treesCount;
        targetUser.activityStats.treesPlanted = targetUser.treesPlanted;
      } else {
        targetUser.cleanupsCount = Number(targetUser.cleanupsCount || 0) + 1;
        targetUser.activityStats.cleanupsCount = targetUser.cleanupsCount;
      }
      targetUser.activityStats.totalCoinsEarned = targetUser.totalCoinsEarned;
      syncUserStatsConsistency(targetUser);
      upsertUser(targetUser);

      if (targetUser.schoolName || targetUser.schoolId) {
        findOrCreateSchool({
          schoolId: targetUser.schoolId,
          schoolName: targetUser.schoolName || 'Maktab',
          region: targetUser.region || 'Toshkent shahri',
          district: targetUser.district || 'Markaziy tumani',
          coinsDelta: coinsAwarded,
          treesDelta: matKey === 'sapling' ? Math.max(1, Math.round(qty)) : 0,
          cleanupsDelta: matKey === 'sapling' ? 0 : 1,
        });
      }

      recordTransaction({
        userId: targetUser.uid,
        amount: coinsAwarded,
        type: 'earn',
        status: 'approved',
        reason: `Eco-Punkt QR: ${qty} ${rateInfo.unit} ${rateInfo.label}`,
      });

      const scanRecord = {
        id: `qrscan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        studentUid: targetUser.uid,
        studentName: targetUser.fullName || "O'quvchi",
        studentGrade: targetUser.grade || '',
        schoolId: targetUser.schoolId || '',
        schoolName: targetUser.schoolName || 'Maktab',
        region: targetUser.region || '',
        district: targetUser.district || '',
        materialType: matKey,
        materialLabel: rateInfo.label,
        weightKg: Number(qty.toFixed(2)),
        unit: rateInfo.unit,
        coinsAwarded,
        xpAwarded,
        scannedByUid: caller.uid,
        scannedByName: caller.fullName || 'Nazoratchi',
        scannedByRole: caller.role,
        note: String(note || '').trim().slice(0, 200),
        createdAt: nowIso,
      };

      centralDb.qrEcoScans = [scanRecord, ...(centralDb.qrEcoScans || [])];
      centralDb.notifications.unshift({
        id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
        userId: targetUser.uid,
        title: `Eco-Punkt: +${coinsAwarded} EcoCoin!`,
        message: `${qty} ${rateInfo.unit} ${rateInfo.label} topshirildi (${caller.fullName} tasdiqladi).`,
        type: 'reward',
        read: false,
        createdAt: nowIso,
      });
      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'ecopunkt_scan', studentUid: targetUser.uid, schoolId: targetUser.schoolId });

      const tgChat = targetUser.telegramId || targetUser.chatId;
      if (tgChat) {
        sendTelegramMessage(
          tgChat,
          `♻️ <b>ECO-PUNKT QR TASDIQLANDI!</b>\n\n` +
            `📦 <b>Topshirildi:</b> ${qty} ${rateInfo.unit} ${rateInfo.label}\n` +
            `🪙 <b>Mukofot:</b> +${coinsAwarded} EcoCoin (+${xpAwarded} XP)\n` +
            `👤 <b>Tasdiqladi:</b> ${caller.fullName}\n` +
            `💰 <b>Joriy balansingiz:</b> ${targetUser.ecoCoins.toLocaleString()} EcoCoin`
        ).catch(() => {});
      }

      res.json({
        success: true,
        scan: scanRecord,
        studentNewBalance: targetUser.ecoCoins,
        message: `${targetUser.fullName} hisobiga +${coinsAwarded} EcoCoin tushirildi!`,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

function getSchoolDuelMetricValue(schoolId: string, category: string, sinceIso?: string): number {
  const school = (centralDb.schools || []).find((s) => s.id === schoolId);
  const sinceMs = sinceIso ? new Date(sinceIso).getTime() : 0;
  if (category === 'waste_kg') {
    const scanSum = (centralDb.qrEcoScans || [])
      .filter((sc) => sc.schoolId === schoolId && sc.materialType !== 'sapling' && new Date(sc.createdAt).getTime() >= sinceMs)
      .reduce((acc, sc) => acc + Number(sc.weightKg || 0), 0);
    const cleanupFallback = Number(school?.cleanupsCompleted || 0) * 2;
    return Number((scanSum + cleanupFallback * 0.25).toFixed(1));
  }
  if (category === 'trees') {
    return Number(school?.treesPlanted || 0);
  }
  return Number(school?.totalCoins || 0);
}

app.get('/api/duels', (req: AuthenticatedRequest, res) => {
  try {
    const nowMs = Date.now();
    let changed = false;
    const enriched = (centralDb.schoolDuels || []).map((d: any) => {
      const aTotal = getSchoolDuelMetricValue(d.challengerSchoolId, d.category, d.startedAt);
      const bTotal = getSchoolDuelMetricValue(d.opponentSchoolId, d.category, d.startedAt);
      const scoreA = Math.max(0, Number((aTotal - Number(d.baselineA || 0)).toFixed(1)));
      const scoreB = Math.max(0, Number((bTotal - Number(d.baselineB || 0)).toFixed(1)));

      let status = d.status;
      let winnerSchoolId = d.winnerSchoolId;
      if (status === 'active' && d.endsAt && new Date(d.endsAt).getTime() <= nowMs) {
        status = 'completed';
        winnerSchoolId = scoreA >= scoreB ? d.challengerSchoolId : d.opponentSchoolId;
        d.status = status;
        d.winnerSchoolId = winnerSchoolId;
        changed = true;
      }

      const schoolA = (centralDb.schools || []).find((s) => s.id === d.challengerSchoolId);
      const schoolB = (centralDb.schools || []).find((s) => s.id === d.opponentSchoolId);
      return {
        ...d,
        status,
        winnerSchoolId,
        challengerName: schoolA?.name || d.challengerName,
        challengerRegion: schoolA?.region || d.challengerRegion,
        challengerDistrict: schoolA?.district || d.challengerDistrict,
        opponentName: schoolB?.name || d.opponentName,
        opponentRegion: schoolB?.region || d.opponentRegion,
        opponentDistrict: schoolB?.district || d.opponentDistrict,
        scoreA,
        scoreB,
        totalA: aTotal,
        totalB: bTotal,
      };
    });
    if (changed) saveCentralDb();
    res.json({ success: true, duels: enriched });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post(
  '/api/duels/challenge',
  requireRoles('school_admin', 'ambassador', 'district_coordinator', 'regional_coordinator', 'super_admin'),
  (req: AuthenticatedRequest, res) => {
    try {
      const caller = req.authUser;
      const { targetSchoolId, sourceSchoolId, category, rewardCoins } = req.body || {};
      const challengerId = hasAnyRole(caller, ['super_admin', 'regional_coordinator', 'district_coordinator']) && sourceSchoolId
        ? String(sourceSchoolId)
        : String(caller.schoolId || '');
      const opponentId = String(targetSchoolId || '').trim();

      if (!challengerId || !opponentId) {
        return res.status(400).json({ error: 'Ikkala maktab ham tanlanishi shart' });
      }
      if (challengerId === opponentId) {
        return res.status(400).json({ error: "Maktab o'ziga o'zi duel e'lon qila olmaydi" });
      }
      const schoolA = (centralDb.schools || []).find((s) => s.id === challengerId);
      const schoolB = (centralDb.schools || []).find((s) => s.id === opponentId);
      if (!schoolA || !schoolB) {
        return res.status(404).json({ error: 'Tanlangan maktab topilmadi' });
      }

      const validCategories = ['trees', 'waste_kg', 'coins'];
      const duelCat = validCategories.includes(String(category)) ? String(category) : 'coins';
      const duplicate = (centralDb.schoolDuels || []).find(
        (d: any) =>
          (d.status === 'active' || d.status === 'pending') &&
          ((d.challengerSchoolId === challengerId && d.opponentSchoolId === opponentId) ||
            (d.challengerSchoolId === opponentId && d.opponentSchoolId === challengerId))
      );
      if (duplicate) {
        return res.status(409).json({ error: "Bu ikki maktab o'rtasida faol yoki kutilayotgan duel allaqachon mavjud" });
      }

      const now = new Date();
      const endsAt = new Date(now.getTime() + 7 * 86400 * 1000).toISOString();
      const isSuperAutoStart = hasAnyRole(caller, ['super_admin']);
      const newDuel = {
        id: `duel_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        challengerSchoolId: schoolA.id,
        challengerName: schoolA.name,
        challengerRegion: schoolA.region,
        challengerDistrict: schoolA.district,
        opponentSchoolId: schoolB.id,
        opponentName: schoolB.name,
        opponentRegion: schoolB.region,
        opponentDistrict: schoolB.district,
        category: duelCat,
        rewardCoins: Math.min(2000, Math.max(150, Number(rewardCoins) || 500)),
        status: isSuperAutoStart ? 'active' : 'pending',
        baselineA: getSchoolDuelMetricValue(schoolA.id, duelCat),
        baselineB: getSchoolDuelMetricValue(schoolB.id, duelCat),
        startedAt: now.toISOString(),
        endsAt,
        createdByUid: caller.uid,
        createdByName: caller.fullName,
        createdAt: now.toISOString(),
      };

      centralDb.schoolDuels = [newDuel, ...(centralDb.schoolDuels || [])];
      saveCentralDb();
      broadcastRealtimeEvent('db:updated', { scope: 'school_duel', duelId: newDuel.id });

      const targetCaptains = (Object.values(centralDb.users || {}) as any[]).filter(
        (u) => u && u.schoolId === schoolB.id && (u.role === 'school_admin' || u.role === 'ambassador')
      );
      for (const tc of targetCaptains) {
        centralDb.notifications.unshift({
          id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
          userId: tc.uid,
          title: `⚔️ Yangi 7 kunlik Eko-Duel taklifi!`,
          message: `${schoolA.name} sizning maktabingizni bellashuvga chorladi (${duelCat}).`,
          type: 'system',
          read: false,
          createdAt: now.toISOString(),
        });
        const chatId = tc.telegramId || tc.chatId;
        if (chatId) {
          sendTelegramMessage(
            chatId,
            `⚔️ <b>MAKTABLARARO EKO-DUEL TAKLIFI!</b>\n\n` +
              `🏫 <b>Chaqiruvchi:</b> ${schoolA.name}\n` +
              `🆚 <b>Sizning maktab:</b> ${schoolB.name}\n` +
              `🏆 <b>Mukofot fondi:</b> +${newDuel.rewardCoins} EcoCoin\n\n` +
              `Chempionat bo'limiga kirib duelni qabul qiling!`
          ).catch(() => {});
        }
      }
      saveCentralDb();

      res.json({ success: true, duel: newDuel });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
);

app.post('/api/duels/:id/respond', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const duel = (centralDb.schoolDuels || []).find((d: any) => d.id === req.params.id);
    if (!duel) return res.status(404).json({ error: 'Duel topilmadi' });

    const canRespond =
      hasAnyRole(caller, ['super_admin', 'district_coordinator', 'regional_coordinator']) ||
      (hasAnyRole(caller, ['school_admin', 'ambassador']) && caller.schoolId === duel.opponentSchoolId);
    if (!canRespond) {
      return res.status(403).json({ error: 'Faqat raqib maktab sardori yoki koordinator javob bera oladi' });
    }

    const action = req.body?.action === 'decline' ? 'decline' : 'accept';
    const now = new Date();
    if (action === 'decline') {
      duel.status = 'declined';
    } else {
      duel.status = 'active';
      duel.startedAt = now.toISOString();
      duel.endsAt = new Date(now.getTime() + 7 * 86400 * 1000).toISOString();
      duel.baselineA = getSchoolDuelMetricValue(duel.challengerSchoolId, duel.category);
      duel.baselineB = getSchoolDuelMetricValue(duel.opponentSchoolId, duel.category);
    }
    saveCentralDb();
    broadcastRealtimeEvent('db:updated', { scope: 'school_duel', duelId: duel.id });
    res.json({ success: true, duel });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/certificates', requireAuth, (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const allCerts = centralDb.certificates || [];
    const certs = hasAnyRole(caller, ['super_admin', 'moderator'])
      ? allCerts
      : allCerts.filter((c: any) => c.uid === caller.uid);

    const eligibleTiers = [
      {
        tier: 'eco_starter',
        title: "Eko-Harakat Boshlang'ich Sertifikati",
        requirement: "Kamida 100 EcoCoin yoki 1 ta hisobot",
        unlocked: Number(caller.totalCoinsEarned || caller.ecoCoins || 0) >= 100 || Number(caller.reportsCount || 0) >= 1,
      },
      {
        tier: 'green_guardian',
        title: "Yashil Hudud Qo'riqchisi Sertifikati",
        requirement: "Kamida 300 EcoCoin va 3+ ko'chat/hisobot",
        unlocked:
          Number(caller.totalCoinsEarned || caller.ecoCoins || 0) >= 300 ||
          Number(caller.treesPlanted || 0) + Number(caller.reportsCount || 0) >= 3,
      },
      {
        tier: 'eco_champion',
        title: "EcoHero Milliy Chempionat Faxriy Yorlig'i",
        requirement: "Kamida 1000 EcoCoin yoki faol yetakchi",
        unlocked:
          Number(caller.totalCoinsEarned || caller.ecoCoins || 0) >= 1000 ||
          hasAnyRole(caller, ['ambassador', 'school_admin', 'super_admin']),
      },
    ];

    res.json({ success: true, certificates: certs, eligibleTiers });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/certificates/verify/:id', (req, res) => {
  const key = String(req.params.id || '').trim().toUpperCase();
  const cert = (centralDb.certificates || []).find(
    (c: any) => String(c.id).toUpperCase() === key || String(c.verificationCode).toUpperCase() === key
  );
  if (!cert) {
    return res.status(404).json({ valid: false, error: 'Sertifikat topilmadi' });
  }
  res.json({ valid: true, certificate: cert });
});

app.post('/api/certificates/issue', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const caller = req.authUser;
    const { tier = 'eco_starter', targetUid, customTitle } = req.body || {};
    const isAdmin = hasAnyRole(caller, ['super_admin', 'school_admin', 'moderator']);
    const recipient = targetUid && isAdmin && centralDb.users[String(targetUid)] ? centralDb.users[String(targetUid)] : caller;

    const tierTitleMap: Record<string, string> = {
      eco_starter: "Eko-Harakat Boshlang'ich Sertifikati",
      green_guardian: "Yashil Hudud Qo'riqchisi Sertifikati",
      eco_champion: "EcoHero Milliy Chempionat Faxriy Yorlig'i",
      ambassador_gold: "Tasdiqlangan Maktab Eko-Elchisi Sertifikati",
    };

    const existing = (centralDb.certificates || []).find(
      (c: any) => c.uid === recipient.uid && c.tier === tier
    );
    if (existing) {
      return res.json({ success: true, certificate: existing, alreadyIssued: true });
    }

    const totalEarned = Number(recipient.totalCoinsEarned || recipient.ecoCoins || 0);
    if (!isAdmin && tier === 'green_guardian' && totalEarned < 300 && (recipient.treesPlanted || 0) + (recipient.reportsCount || 0) < 3) {
      return res.status(400).json({ error: "Bu sertifikat uchun kamida 300 EcoCoin yoki 3 ta tasdiqlangan harakat kerak" });
    }
    if (!isAdmin && tier === 'eco_champion' && totalEarned < 1000 && !hasAnyRole(recipient, ['ambassador', 'school_admin'])) {
      return res.status(400).json({ error: "Chempionat sertifikati uchun kamida 1000 EcoCoin to'plang" });
    }

    const certId = `cert_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const verificationCode = `ECO-${String(recipient.uid).slice(-4).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const verifyUrl = `${APP_URL}/?cert=${encodeURIComponent(verificationCode)}`;
    const qrCodeUrl = await QRCode.toDataURL(verifyUrl, { width: 220, margin: 1 });

    const certRecord = {
      id: certId,
      uid: recipient.uid,
      entityName: recipient.fullName || "EcoHero A'zosi",
      schoolName: recipient.schoolName || "O'zbekiston Maktabi",
      region: recipient.region || "O'zbekiston",
      district: recipient.district || '',
      type: 'student',
      tier,
      category: customTitle ? String(customTitle).trim() : tierTitleMap[tier] || tierTitleMap.eco_starter,
      level: calculateLevelFromXp(Number(recipient.ecoXP || totalEarned * 4)),
      ecoCoinsSnapshot: Number(recipient.ecoCoins || 0),
      treesPlantedSnapshot: Number(recipient.treesPlanted || 0),
      periodName: new Date().toLocaleDateString('uz-UZ', { month: 'long', year: 'numeric' }),
      issuedAt: new Date().toISOString(),
      verificationCode,
      verifyUrl,
      qrCodeUrl,
    };

    centralDb.certificates = [certRecord, ...(centralDb.certificates || [])];
    saveCentralDb();

    const tgChat = recipient.telegramId || recipient.chatId;
    if (tgChat) {
      sendTelegramMessage(
        tgChat,
        `🎓 <b>RASMIY EKO-SERTIFIKAT BERILDI!</b>\n\n` +
          `🏅 <b>Nominatsiya:</b> ${certRecord.category}\n` +
          `🏫 <b>Maktab:</b> ${certRecord.schoolName}\n` +
          `🔐 <b>Tekshiruv kodi:</b> <code>${verificationCode}</code>\n\n` +
          `EcoPassport sahifangizdan yuqori sifatli PNG/PDF shaklida yuklab olishingiz mumkin!`
      ).catch(() => {});
    }

    res.json({ success: true, certificate: certRecord });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/sponsor/analytics', requireRoles('sponsor', 'super_admin', 'moderator'), (req: AuthenticatedRequest, res) => {
  try {
    const ads = centralDb.ecoAds || [];
    const totalImpressions = ads.reduce((s, a: any) => s + Number(a.impressionsCount || 0), 0);
    const totalClicks = ads.reduce((s, a: any) => s + Number(a.clicksCount || 0), 0);
    const ctrPercent = totalImpressions > 0 ? Number(((totalClicks / totalImpressions) * 100).toFixed(2)) : 0;
    const rewardClaims = centralDb.adRewardClaims || [];
    const orders = centralDb.shopOrders || [];
    const deliveredVouchers = orders.filter((o: any) => o.status === 'delivered').length;
    const activeItems = (centralDb.shopItems || []).filter((i: any) => i.status !== 'paused');

    res.json({
      success: true,
      summary: {
        activeAdsCount: ads.filter((a: any) => a.status === 'active').length,
        totalImpressions,
        totalClicks,
        ctrPercent,
        totalAdRewardClaims: rewardClaims.length,
        totalCoinsSponsoredAds: rewardClaims.reduce((s, c: any) => s + Number(c.amount || 0), 0),
        totalVouchersClaimed: orders.length,
        deliveredVouchers,
        activeShopItemsCount: activeItems.length,
        totalPartnersCount: (centralDb.partners || []).length,
      },
      adsBreakdown: ads.map((a: any) => {
        const imp = Number(a.impressionsCount || 0);
        const clk = Number(a.clicksCount || 0);
        return {
          id: a.id,
          title: a.title,
          sponsorName: a.sponsorName,
          sponsorLogo: a.sponsorLogo,
          placement: a.placement,
          status: a.status,
          impressionsCount: imp,
          clicksCount: clk,
          ctrPercent: imp > 0 ? Number(((clk / imp) * 100).toFixed(2)) : 0,
        };
      }),
      recentOrders: orders.slice(0, 12).map((o: any) => ({
        id: o.id,
        itemTitle: o.itemTitle,
        sponsorName: o.sponsorName,
        schoolName: o.schoolName,
        status: o.status,
        voucherCode: o.voucherCode,
        createdAt: o.createdAt,
      })),
    });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/ai/verify-eco-photo', requireAuth, async (req: AuthenticatedRequest, res) => {
  try {
    const { imageBase64, mimeType = 'image/jpeg', category = 'waste_sorting', description = '' } = req.body || {};
    if (!imageBase64) {
      return res.status(400).json({ success: false, error: 'Tekshirish uchun rasm yuborilishi shart' });
    }
    if (!(process.env.GEMINI_API_KEY || '').trim()) {
      return res.status(503).json({
        success: false,
        error: "GEMINI_API_KEY serverda sozlanmagan. Settings > Secrets bo'limidan kalitni ulang.",
      });
    }

    const base64Clean = String(imageBase64).replace(/^data:image\/[a-zA-Z0-9+.-]+;base64,/, '');
    const aiResponse: any = await generateContentWithModelFallback(
      {
        contents: [
          {
            role: 'user',
            parts: [
              { inlineData: { data: base64Clean, mimeType } },
              {
                text: `Toifa: ${category}\nTavsif: ${description}\nBu rasm haqiqiy jonli ekologik harakat/muammomi? Monitor/telefon ekranidan olingan rasm, AI generatsiya qilingan rasm yoki aloqasiz selfie emasmi?`,
              },
            ],
          },
        ],
        config: {
          systemInstruction:
            `Siz ECO HERO platformasining AI Anti-Cheat rasm tekshiruvchisisiz. Ekran rasmi (moiré chiziqlari, kompyuter ramkasi), AI-art yoki mavzuga aloqasiz rasmni qat'iy aniqlang. O'zbek tilida tushunarli verdictUz yozing.`,
          responseMimeType: 'application/json',
          responseSchema: {
            type: 'OBJECT',
            properties: {
              isAuthenticRealWorldPhoto: { type: 'BOOLEAN' },
              isScreenOrMonitorFake: { type: 'BOOLEAN' },
              isAiGenerated: { type: 'BOOLEAN' },
              matchesEcoCategory: { type: 'BOOLEAN' },
              confidence: { type: 'NUMBER' },
              verdictUz: { type: 'STRING' },
            },
            required: [
              'isAuthenticRealWorldPhoto',
              'isScreenOrMonitorFake',
              'isAiGenerated',
              'matchesEcoCategory',
              'confidence',
              'verdictUz',
            ],
          },
        },
      },
      20000
    );
    const parsed = parseModelJsonResponse(aiResponse?.text);
    res.json({ success: true, verification: parsed });
  } catch (err: any) {
    const formatted = formatGeminiError(err);
    res.status(formatted.statusCode || 500).json({ success: false, error: formatted.message });
  }
});

// ==========================================
// 10. PUBLIC TUNNEL & EXPRESS/VITE SERVER
// ==========================================

let activeTunnelProc: ChildProcess | null = null;

async function startPublicTunnel(targetPort: number | string): Promise<string | null> {
  const tmpCloudflared = '/tmp/cloudflared';
  let binaryPath: string | null = null;

  const isExecutableValid = (p: string) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).size > 5 * 1024 * 1024;
    } catch {
      return false;
    }
  };

  if (isExecutableValid(tmpCloudflared)) binaryPath = tmpCloudflared;

  if (binaryPath) {
    try {
      fs.chmodSync(binaryPath, 0o755);
    } catch {}
  } else {
    const cfArch = process.arch === 'arm64' ? 'arm64' : 'amd64';
    const downloadUrl = `https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-${cfArch}`;
    try {
      console.log(`[Cloudflared] Yuklab olinmoqda (${cfArch})...`);
      const res = await fetch(downloadUrl, { redirect: 'follow', signal: AbortSignal.timeout(45000) });
      if (res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        if (buf.length > 5 * 1024 * 1024) {
          await fs.promises.writeFile(tmpCloudflared, buf);
          await fs.promises.chmod(tmpCloudflared, 0o755);
          binaryPath = tmpCloudflared;
        }
      }
    } catch (fetchErr: any) {
      console.warn('[Cloudflared] Fetch orqali yuklab olish muvaffaqiyatsiz:', fetchErr?.message || fetchErr);
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
            fs.writeFileSync('/tmp/ecohero-public-tunnel-url.txt', tunnelUrl, 'utf-8');
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

function validateAndLogServerEnv() {
  const hasFirebaseFile = fs.existsSync(path.join(process.cwd(), 'firebase-applet-config.json'));
  const hasFirebaseEnv = Boolean(
    String(process.env.FIREBASE_API_KEY || '').trim() &&
      String(process.env.FIREBASE_PROJECT_ID || '').trim()
  );
  const botToken = String(
    process.env.TELEGRAM_BOT_TOKEN ||
      process.env.BOT_TOKEN ||
      process.env.TELEGRAM_TOKEN ||
      process.env.TELEGRAM_API_KEY ||
      ''
  ).trim();
  const checks: { name: string; ok: boolean; requiredInProd: boolean; detail: string }[] = [
    {
      name: 'SESSION_SECRET',
      ok: String(process.env.SESSION_SECRET || '').trim().length >= 32,
      requiredInProd: true,
      detail: '32+ character HMAC signing key for user session tokens',
    },
    {
      name: 'FIREBASE_API_KEY / firebase-applet-config.json',
      ok: hasFirebaseFile || hasFirebaseEnv || Boolean(String(process.env.FIREBASE_API_KEY || '').trim()),
      requiredInProd: false,
      detail: 'Firebase Auth token verification & Firestore REST catalog sync',
    },
    {
      name: 'TELEGRAM_BOT_TOKEN',
      ok: Boolean(botToken),
      requiredInProd: false,
      detail: 'Telegram bot polling/webhook & user notifications',
    },
    {
      name: 'TELEGRAM_WEBHOOK_SECRET',
      ok: Boolean(String(process.env.TELEGRAM_WEBHOOK_SECRET || '').trim()),
      requiredInProd: false,
      detail: 'Secret header validation for Telegram webhook (falls back to polling if missing)',
    },
    {
      name: 'GEMINI_API_KEY',
      ok: Boolean(String(process.env.GEMINI_API_KEY || '').trim()),
      requiredInProd: false,
      detail: 'Gemini AI eco-assistant, hazard analysis, and photo anti-cheat',
    },
    {
      name: 'SUPER_ADMIN_EMAILS / SUPER_ADMIN_TELEGRAM_IDS',
      ok: Boolean(
        String(process.env.SUPER_ADMIN_EMAILS || '').trim() ||
          String(process.env.SUPER_ADMIN_TELEGRAM_IDS || '').trim()
      ),
      requiredInProd: false,
      detail: 'Bootstrap Super Admin access allowlist',
    },
    {
      name: 'PUBLIC_APP_URL / RAILWAY_PUBLIC_DOMAIN',
      ok: Boolean(
        String(
          process.env.PUBLIC_APP_URL ||
            process.env.RAILWAY_PUBLIC_DOMAIN ||
            process.env.RENDER_EXTERNAL_URL ||
            ''
        ).trim()
      ),
      requiredInProd: false,
      detail: 'Public HTTPS URL used for Telegram Mini App buttons & webhooks',
    },
    {
      name: 'DATA_DIR / RAILWAY_VOLUME_MOUNT_PATH',
      ok:
        process.env.NODE_ENV !== 'production' ||
        Boolean(String(process.env.DATA_DIR || process.env.RAILWAY_VOLUME_MOUNT_PATH || '').trim()),
      requiredInProd: false,
      detail: 'Persistent disk mount (e.g. /data) so Railway container restarts keep local JSON DB alongside Firestore Cloud Vault',
    },
  ];

  const missing = checks.filter((c) => !c.ok);
  if (missing.length === 0) {
    console.log('[ENV CHECK] All environment variables and service configs look ready.');
    return;
  }

  console.warn('[ENV CHECK] Some environment variables are not configured:');
  for (const item of missing) {
    const level = item.requiredInProd && process.env.NODE_ENV === 'production' ? 'ERROR' : 'WARN';
    console.warn(`  - [${level}] Missing ${item.name}: ${item.detail}`);
  }
}

async function startServer() {
  validateAndLogServerEnv();
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
              'Cache-Control': 'no-cache, no-store, must-revalidate',
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
    app.use(
      express.static(path.join(process.cwd(), 'public'), {
        index: false,
        maxAge: '7d',
        setHeaders: (res, filePath) => {
          if (filePath.endsWith('sw.js') || filePath.endsWith('manifest.json')) {
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

  await Promise.race([
    hydrateCatalogFromFirestoreOnBoot(),
    new Promise<void>((resolve) => setTimeout(resolve, 2500)),
  ]);

  httpServer.listen(port, '0.0.0.0', async () => {
    console.log(`ECO HERO platform HTTP + WebSocket server listening on http://0.0.0.0:${port}`);
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

        if (canUseWebhook && TELEGRAM_WEBHOOK_SECRET) {
          try {
            isWebhookMode = true;
            const webhookUrl = `${webhookBaseUrl}/api/telegram/webhook`;
            await fetch(`https://api.telegram.org/bot${activeBotToken}/setWebhook`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                url: webhookUrl,
                secret_token: TELEGRAM_WEBHOOK_SECRET,
              }),
            });
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
