const RUNTIME_API_STORAGE_KEY = 'ecohero_api_base_url';

function normalizeBaseUrl(raw?: string | null): string {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return `${parsed.origin}${parsed.pathname.replace(/\/+$/, '')}`;
    }
  } catch {
    return '';
  }
  return '';
}

function readQueryOverride(): string {
  if (typeof window === 'undefined') return '';
  try {
    const params = new URLSearchParams(window.location.search);
    const paramVal = params.get('api');
    if (paramVal === 'reset' || paramVal === 'clear') {
      localStorage.removeItem(RUNTIME_API_STORAGE_KEY);
      return '';
    }
    if (paramVal) {
      const normalized = normalizeBaseUrl(paramVal);
      if (normalized) {
        localStorage.setItem(RUNTIME_API_STORAGE_KEY, normalized);
        return normalized;
      }
    }
  } catch {
    // ignore URL / storage errors
  }
  return '';
}

export function getApiBaseUrl(): string {
  if (typeof window !== 'undefined') {
    const winOverride = normalizeBaseUrl((window as any).__ECOHERO_API_URL__);
    if (winOverride) return winOverride;

    const queryOverride = readQueryOverride();
    if (queryOverride) return queryOverride;

    try {
      const stored = normalizeBaseUrl(localStorage.getItem(RUNTIME_API_STORAGE_KEY));
      if (stored) return stored;
    } catch {
      // ignore storage errors
    }
  }

  return normalizeBaseUrl(import.meta.env.VITE_API_BASE_URL);
}

export function setRuntimeApiBaseUrl(url: string | null): string {
  const normalized = normalizeBaseUrl(url);
  if (typeof window !== 'undefined') {
    try {
      if (normalized) {
        localStorage.setItem(RUNTIME_API_STORAGE_KEY, normalized);
      } else {
        localStorage.removeItem(RUNTIME_API_STORAGE_KEY);
      }
    } catch {
      // ignore
    }
  }
  return normalized;
}

export function hasExternalApiBaseUrl(): boolean {
  return Boolean(getApiBaseUrl());
}

export function apiUrl(pathOrUrl: string): string {
  if (!pathOrUrl) return pathOrUrl;
  if (/^https?:\/\//i.test(pathOrUrl)) {
    return pathOrUrl;
  }
  const normalizedPath = pathOrUrl.startsWith('/') ? pathOrUrl : `/${pathOrUrl}`;
  const base = getApiBaseUrl();
  return base ? `${base}${normalizedPath}` : normalizedPath;
}

export function resolveMediaUrl(pathOrUrl?: string): string {
  if (!pathOrUrl) return '';
  if (/^(https?:|data:|blob:)/i.test(pathOrUrl)) return pathOrUrl;
  if (pathOrUrl.startsWith('/uploads/')) return apiUrl(pathOrUrl);
  return pathOrUrl;
}

export function normalizeAdTargetUrl(rawUrl?: string): string {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('@')) {
    return `https://t.me/${trimmed.slice(1)}`;
  }
  if (/^t\.me\//i.test(trimmed)) {
    return `https://${trimmed}`;
  }
  if (/^(https?:\/\/|tg:\/\/)/i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

export function openAdTargetUrl(rawUrl?: string): void {
  const url = normalizeAdTargetUrl(rawUrl);
  if (!url || typeof window === 'undefined') return;
  try {
    const tg = (window as any).Telegram?.WebApp;
    const isTelegramLink = /^https?:\/\/(t\.me|telegram\.me)\//i.test(url) || /^tg:\/\//i.test(url);
    if (tg) {
      if (isTelegramLink && typeof tg.openTelegramLink === 'function') {
        tg.openTelegramLink(url);
        return;
      }
      if (typeof tg.openLink === 'function') {
        tg.openLink(url);
        return;
      }
    }
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.target = '_blank';
    anchor.rel = 'noopener noreferrer';
    document.body.appendChild(anchor);
    anchor.click();
    document.body.removeChild(anchor);
  } catch {
    window.location.href = url;
  }
}

export function wsUrl(path: string): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const base = getApiBaseUrl();
  if (base) {
    try {
      const u = new URL(base);
      const wsProto = u.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${wsProto}//${u.host}${normalizedPath}`;
    } catch {
      // fall through
    }
  }
  if (typeof window === 'undefined') return normalizedPath;
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}${normalizedPath}`;
}

export const STATIC_HOSTING_API_ERROR_MESSAGE =
  "Backend API serveri ulanmagan (statik hosting HTML sahifa qaytardi). Eskiz hostingida AI, Xarita, Ro'yxatdan o'tish va Baza ishlashi uchun backend serverni ishga tushirib VITE_API_BASE_URL orqali ulang.";

export function isHtmlContentType(res: Response): boolean {
  const ct = (res.headers.get('content-type') || '').toLowerCase();
  return ct.includes('text/html') || ct.includes('application/xhtml');
}

export async function parseApiJson<T = any>(res: Response): Promise<T> {
  if (isHtmlContentType(res)) {
    throw new Error(STATIC_HOSTING_API_ERROR_MESSAGE);
  }
  const raw = await res.text();
  const trimmed = raw.trim();
  if (!trimmed) {
    return {} as T;
  }
  if (/^<!doctype\s+html|^<html[\s>]/i.test(trimmed)) {
    throw new Error(STATIC_HOSTING_API_ERROR_MESSAGE);
  }
  try {
    return JSON.parse(trimmed) as T;
  } catch {
    throw new Error(`Serverdan noto'g'ri javob formati keldi (${res.status}).`);
  }
}
