import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import type { Request, Response, NextFunction } from 'express';
import {
  centralDb,
  findUserByAnyIdentifier,
  resolveCanonicalUid,
  syncUserStatsConsistency,
} from './server-db';

dotenv.config({ override: true });

// Read Firebase web API key for server-side ID token verification
let FIREBASE_WEB_API_KEY = String(process.env.FIREBASE_API_KEY || '').trim();
try {
  const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (!FIREBASE_WEB_API_KEY && fs.existsSync(cfgPath)) {
    const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
    FIREBASE_WEB_API_KEY = String(cfg.apiKey || '').trim();
  }
} catch (err: any) {
  console.error('[Security ENV ERROR] Could not parse firebase-applet-config.json:', err?.message || err);
}
if (!FIREBASE_WEB_API_KEY) {
  console.error(
    '[Security ENV WARNING] FIREBASE_API_KEY is missing (and not found in firebase-applet-config.json). Firebase ID token verification will fail until FIREBASE_API_KEY is set.'
  );
}

function getSuperAdminEmails(): Set<string> {
  return new Set(
    String(process.env.SUPER_ADMIN_EMAILS || '')
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean)
  );
}

function getSuperAdminTelegramIds(): Set<string> {
  return new Set(
    String(process.env.SUPER_ADMIN_TELEGRAM_IDS || '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean)
  );
}

export function getSuperAdminTelegramIdList(): string[] {
  return Array.from(getSuperAdminTelegramIds());
}

export function isSuperAdminEmail(email?: string | null): boolean {
  const clean = String(email || '').trim().toLowerCase();
  return Boolean(clean && getSuperAdminEmails().has(clean));
}

export function isSuperAdminTelegramId(telegramId?: string | number | null): boolean {
  const clean = String(telegramId ?? '').trim();
  return Boolean(clean && getSuperAdminTelegramIds().has(clean));
}

function resolveSessionSecret(): string {
  const envSecret = String(process.env.SESSION_SECRET || '').trim();
  if (envSecret.length >= 32) {
    return envSecret;
  }
  if (process.env.NODE_ENV === 'production') {
    const message =
      '[Security ENV ERROR] Missing or invalid SESSION_SECRET! In production (NODE_ENV=production), SESSION_SECRET must be set and at least 32 characters long (e.g., `openssl rand -hex 32`). Set SESSION_SECRET in Railway Variables and redeploy.';
    console.error('\n====================================================================');
    console.error(message);
    console.error('====================================================================\n');
    throw new Error(message);
  }
  console.warn(
    '[Security ENV WARNING] SESSION_SECRET is not set or shorter than 32 chars — generated an ephemeral development secret (sessions will reset on restart).'
  );
  return crypto.randomBytes(32).toString('hex');
}

const SESSION_SECRET = resolveSessionSecret();

export interface AuthenticatedRequest extends Request {
  authUser?: any;
}

/**
 * Super Admin tekshiruvi FAQAT tasdiqlangan manbalarga tayanadi:
 * 1) Server bazasidagi autentifikatsiyadan o'tgan foydalanuvchi roli (`role === 'super_admin'`),
 * 2) Emaili tasdiqlangan Firebase ID token (`verifiedEmail === true`),
 * 3) HMAC yoki Telegram Bot API orqali tasdiqlangan Telegram ID (`verifiedTelegram === true`).
 * Request body'dagi email/telefon/username bo'yicha hech qachon ruxsat berilmaydi.
 */
export function checkIsSuperAdmin(userData?: {
  role?: string;
  approvedRoles?: string[];
  telegramId?: string | number;
  chatId?: string | number;
  email?: string;
  verifiedEmail?: boolean;
  verifiedTelegram?: boolean;
} | null): boolean {
  if (!userData) return false;
  if (userData.role === 'super_admin') return true;
  if (Array.isArray(userData.approvedRoles) && userData.approvedRoles.includes('super_admin')) return true;

  if (userData.verifiedEmail === true && isSuperAdminEmail(userData.email)) {
    return true;
  }

  if (userData.verifiedTelegram === true && isSuperAdminTelegramId(userData.telegramId ?? userData.chatId)) {
    return true;
  }

  return false;
}

export function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = crypto.randomBytes(16).toString('hex');
    crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
      if (err) return reject(err);
      resolve(`scrypt:${salt}:${derivedKey.toString('hex')}`);
    });
  });
}

export function verifyPassword(
  password: string,
  storedHash?: string | null
): Promise<{ valid: boolean; needsRehash: boolean }> {
  return new Promise((resolve) => {
    if (!password || !storedHash || typeof storedHash !== 'string') {
      return resolve({ valid: false, needsRehash: false });
    }

    if (storedHash.startsWith('scrypt:')) {
      const parts = storedHash.split(':');
      if (parts.length !== 3) {
        return resolve({ valid: false, needsRehash: false });
      }
      const [, salt, expectedHex] = parts;
      if (!salt || !expectedHex) {
        return resolve({ valid: false, needsRehash: false });
      }
      crypto.scrypt(password, salt, 64, { N: 16384, r: 8, p: 1 }, (err, derivedKey) => {
        if (err) return resolve({ valid: false, needsRehash: false });
        try {
          const expectedBuf = Buffer.from(expectedHex, 'hex');
          if (derivedKey.length !== expectedBuf.length) {
            return resolve({ valid: false, needsRehash: false });
          }
          const valid = crypto.timingSafeEqual(derivedKey, expectedBuf);
          return resolve({ valid, needsRehash: false });
        } catch {
          return resolve({ valid: false, needsRehash: false });
        }
      });
      return;
    }

    // Legacy SHA-256 hash verification with timingSafeEqual & transparent migration flag
    try {
      const legacyHex = crypto.createHash('sha256').update(String(password)).digest('hex');
      const a = Buffer.from(legacyHex, 'hex');
      const b = Buffer.from(storedHash.trim(), 'hex');
      if (a.length !== b.length || a.length === 0) {
        return resolve({ valid: false, needsRehash: false });
      }
      const valid = crypto.timingSafeEqual(a, b);
      return resolve({ valid, needsRehash: valid });
    } catch {
      return resolve({ valid: false, needsRehash: false });
    }
  });
}

export function issueSessionToken(user: { uid: string; role?: string }): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const now = Math.floor(Date.now() / 1000);
  const payload = Buffer.from(
    JSON.stringify({
      sub: String(user.uid),
      role: user.role || 'student',
      iat: now,
      exp: now + 60 * 60 * 24 * 14, // 14 days
    })
  ).toString('base64url');
  const signature = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function verifySessionToken(token?: string | null): any | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.trim().split('.');
  if (parts.length !== 3) return null;
  const [header, payload, signature] = parts;
  const expected = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(`${header}.${payload}`)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const decoded = JSON.parse(Buffer.from(payload, 'base64url').toString('utf-8'));
    if (!decoded?.sub || !decoded?.exp || Date.now() / 1000 > decoded.exp) {
      return null;
    }
    const canonicalSub = resolveCanonicalUid(decoded.sub);
    const dbUser =
      centralDb.users[canonicalSub] ||
      centralDb.users[decoded.sub] ||
      findUserByAnyIdentifier({ uid: decoded.sub });
    return dbUser || null;
  } catch {
    return null;
  }
}

export async function verifyFirebaseIdToken(idToken: string): Promise<{
  uid: string;
  email?: string;
  emailVerified?: boolean;
  displayName?: string;
  photoUrl?: string;
} | null> {
  if (!idToken || !FIREBASE_WEB_API_KEY) return null;
  try {
    const resp = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${encodeURIComponent(FIREBASE_WEB_API_KEY)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken }),
      }
    );
    if (!resp.ok) return null;
    const data: any = await resp.json();
    const user = data?.users?.[0];
    if (!user?.localId) return null;
    return {
      uid: String(user.localId),
      email: user.email ? String(user.email).toLowerCase() : undefined,
      emailVerified: Boolean(user.emailVerified),
      displayName: user.displayName,
      photoUrl: user.photoUrl,
    };
  } catch {
    return null;
  }
}

export function verifyTelegramInitData(initData: string, botToken?: string): {
  valid: boolean;
  user?: any;
  authDate?: number;
} {
  if (!initData || !botToken) return { valid: false };
  try {
    const urlParams = new URLSearchParams(initData);
    const hash = urlParams.get('hash');
    if (!hash) return { valid: false };

    const authDate = Number(urlParams.get('auth_date') || 0);
    // Reject initData older than 24 hours
    if (!authDate || Math.abs(Date.now() / 1000 - authDate) > 86400) {
      return { valid: false };
    }

    urlParams.delete('hash');
    const dataCheckString = Array.from(urlParams.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');

    const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest();
    const calculatedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex');

    const a = Buffer.from(calculatedHash, 'hex');
    const b = Buffer.from(hash, 'hex');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return { valid: false };
    }

    const userStr = urlParams.get('user');
    const user = userStr ? JSON.parse(userStr) : null;
    return { valid: true, user, authDate };
  } catch {
    return { valid: false };
  }
}

export function attachAuthUser(req: AuthenticatedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  if (token) {
    const user = verifySessionToken(token);
    if (user) {
      req.authUser = user;
    }
  }
  next();
}

export function requireAuth(req: AuthenticatedRequest, res: Response, next: NextFunction) {
  if (!req.authUser) {
    return res.status(401).json({
      error: "Avtorizatsiya talab qilinadi. Iltimos, qayta tizimga kiring.",
      code: 'UNAUTHORIZED',
    });
  }
  next();
}

export function hasAnyRole(user: any, allowedRoles: string[]): boolean {
  if (!user) return false;
  if (checkIsSuperAdmin(user)) return true;
  if (allowedRoles.includes(user.role)) return true;
  if (Array.isArray(user.approvedRoles)) {
    return user.approvedRoles.some((r: string) => allowedRoles.includes(r));
  }
  return false;
}

export function requireRoles(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return res.status(401).json({ error: 'Avtorizatsiya talab qilinadi', code: 'UNAUTHORIZED' });
    }
    if (!hasAnyRole(req.authUser, roles)) {
      return res.status(403).json({
        error: "Sizda ushbu bo'lim yoki amal uchun ruxsat mavjud emas.",
        code: 'FORBIDDEN',
      });
    }
    next();
  };
}

export function assertSchoolAccess(user: any, schoolId?: string): boolean {
  if (!user) return false;
  if (checkIsSuperAdmin(user) || hasAnyRole(user, ['moderator'])) return true;
  if (!schoolId) return false;
  return String(user.schoolId || '') === String(schoolId);
}

export function assertDistrictAccess(user: any, region?: string, district?: string): boolean {
  if (!user) return false;
  if (checkIsSuperAdmin(user) || hasAnyRole(user, ['moderator'])) return true;
  if (hasAnyRole(user, ['regional_coordinator'])) {
    return String(user.region || '').toLowerCase() === String(region || '').toLowerCase();
  }
  if (hasAnyRole(user, ['district_coordinator'])) {
    return (
      String(user.region || '').toLowerCase() === String(region || '').toLowerCase() &&
      String(user.district || '').toLowerCase() === String(district || '').toLowerCase()
    );
  }
  return false;
}

export function assertRegionAccess(user: any, region?: string): boolean {
  if (!user) return false;
  if (checkIsSuperAdmin(user) || hasAnyRole(user, ['moderator'])) return true;
  if (hasAnyRole(user, ['regional_coordinator'])) {
    return String(user.region || '').toLowerCase() === String(region || '').toLowerCase();
  }
  return false;
}

// Strict PII Redaction for public vs self/admin contexts
export function sanitizeSelfUser(u: any) {
  if (!u) return null;
  const { passwordHash: _ph, ...safe } = u;
  return syncUserStatsConsistency({ ...safe });
}

export function sanitizePublicUser(u: any) {
  if (!u) return null;
  return {
    uid: u.uid,
    fullName: u.fullName || 'Eko-Qahramon',
    schoolId: u.schoolId || '',
    schoolName: u.schoolName || '',
    schoolNumber: u.schoolNumber || '',
    region: u.region || '',
    district: u.district || '',
    role: u.role || 'student',
    ecoCoins: u.ecoCoins || 0,
    totalCoinsEarned: u.totalCoinsEarned || u.activityStats?.totalCoinsEarned || u.ecoCoins || 0,
    reportsCount: u.reportsCount || u.activityStats?.reportsCount || 0,
    treesPlanted: u.treesPlanted || u.activityStats?.treesPlanted || 0,
    cleanupsCount: u.cleanupsCount || u.activityStats?.cleanupsCount || 0,
    badge: u.badge || 'Yangi Eko-Qahramon',
    avatarUrl: u.avatarUrl || u.profileImage || '',
    isVerified: Boolean(u.isVerified),
  };
}

export function sanitizePublicAmbassador(a: any, viewer: any) {
  const canSeeContact = Boolean(
    viewer &&
      (checkIsSuperAdmin(viewer) ||
        hasAnyRole(viewer, ['moderator', 'regional_coordinator', 'district_coordinator']) ||
        (hasAnyRole(viewer, ['school_admin', 'ambassador']) && viewer.schoolId === a.schoolId))
  );
  return {
    id: a.id,
    schoolId: a.schoolId,
    schoolName: a.schoolName,
    region: a.region || '',
    district: a.district || '',
    fullName: a.fullName,
    status: a.status,
    appointedAt: a.appointedAt,
    permissions: a.permissions || [],
    verifiedActivitiesCount: a.verifiedActivitiesCount || 0,
    tasksCompletedCount: a.tasksCompletedCount || 0,
    ecoCoins: a.ecoCoins || 0,
    ...(canSeeContact ? { email: a.email, phone: a.phone } : {}),
  };
}

export function canViewReport(report: any, viewer: any): boolean {
  const publicStatuses = [
    'verified',
    'in_progress',
    'resolved',
    'APPROVED',
    'ASSIGNED',
    'IN_PROGRESS',
    'ESCALATED',
    'RESOLVED',
  ];
  if (publicStatuses.includes(report.status)) return true;
  if (!viewer) return false;
  if (checkIsSuperAdmin(viewer) || hasAnyRole(viewer, ['moderator'])) return true;
  if (report.reporterUid === viewer.uid) return true;
  if (hasAnyRole(viewer, ['regional_coordinator']) && report.region === viewer.region) return true;
  if (hasAnyRole(viewer, ['district_coordinator']) && report.district === viewer.district) return true;
  if (hasAnyRole(viewer, ['school_admin', 'ambassador']) && report.schoolId && report.schoolId === viewer.schoolId) {
    return true;
  }
  return false;
}
