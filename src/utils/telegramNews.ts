export const ECOHERO_NEWS_CHANNEL_USERNAME = '@EcoHerouz';
export const ECOHERO_NEWS_CHANNEL_HANDLE = 'EcoHerouz';
export const ECOHERO_NEWS_CHANNEL_URL = 'https://t.me/EcoHerouz';

export interface ParsedTelegramNewsPost {
  postId: string;
  postUrl: string;
}

const GENERIC_CHANNEL_RE = /^(?:@?ecoherouz|(?:https?:\/\/)?(?:t\.me|telegram\.me)\/ecoherouz\/?(?:\?.*)?)$/i;
const DIRECT_CHANNEL_POST_RE =
  /^(?:https?:\/\/)?(?:t\.me|telegram\.me)\/ecoherouz\/(\d{1,12})(?:[/?#].*)?$/i;
const TG_RESOLVE_POST_RE =
  /^tg:\/\/resolve\?domain=ecoherouz&post=(\d{1,12})(?:&.*)?$/i;
const PURE_POST_ID_RE = /^#?(\d{1,12})$/;

/**
 * Checks whether a string refers only to the generic @EcoHerouz channel without a specific POST_ID.
 */
export function isGenericEcoHerouzChannelUrl(raw?: string | number | null): boolean {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return false;
  return GENERIC_CHANNEL_RE.test(trimmed);
}

/**
 * Parses either a numeric Telegram Post ID (e.g. "123") or a full @EcoHerouz post URL
 * (e.g. "https://t.me/EcoHerouz/123") and returns the canonical post ID + URL.
 * Rejects generic channel URLs without a POST_ID.
 */
export function parseEcoHerouzTelegramPost(
  raw?: string | number | null
): ParsedTelegramNewsPost | null {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) return null;

  const idMatch = trimmed.match(PURE_POST_ID_RE);
  if (idMatch?.[1]) {
    const numericId = Number(idMatch[1]);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) return null;
    const postId = String(numericId);
    return {
      postId,
      postUrl: `${ECOHERO_NEWS_CHANNEL_URL}/${postId}`,
    };
  }

  const urlMatch = trimmed.match(DIRECT_CHANNEL_POST_RE) || trimmed.match(TG_RESOLVE_POST_RE);
  if (urlMatch?.[1]) {
    const numericId = Number(urlMatch[1]);
    if (!Number.isSafeInteger(numericId) || numericId <= 0) return null;
    const postId = String(numericId);
    return {
      postId,
      postUrl: `${ECOHERO_NEWS_CHANNEL_URL}/${postId}`,
    };
  }

  return null;
}

/**
 * Validates optional admin input for a news item's Telegram post reference.
 */
export function validateEcoHerouzPostInput(raw?: string | number | null): {
  valid: boolean;
  normalized: ParsedTelegramNewsPost | null;
  error?: string;
} {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed) {
    return { valid: true, normalized: null };
  }

  const parsed = parseEcoHerouzTelegramPost(trimmed);
  if (parsed) {
    return { valid: true, normalized: parsed };
  }

  if (isGenericEcoHerouzChannelUrl(trimmed)) {
    return {
      valid: false,
      normalized: null,
      error: `Umumiy kanal havolasi emas, aniq post ID yoki post havolasini kiriting (masalan: 123 yoki ${ECOHERO_NEWS_CHANNEL_URL}/123).`,
    };
  }

  return {
    valid: false,
    normalized: null,
    error: `Noto'g'ri format. Post ID (masalan: 123) yoki ${ECOHERO_NEWS_CHANNEL_URL}/POST_ID havolasini kiriting.`,
  };
}

/**
 * Resolves the canonical direct Telegram post URL (https://t.me/EcoHerouz/POST_ID)
 * for a news post object, returning null if none is configured.
 */
export function resolveNewsTelegramPostUrl(post?: {
  telegramPostUrl?: string | null;
  telegramPostId?: string | number | null;
  ctaUrl?: string | null;
} | null): string | null {
  if (!post) return null;
  const fromUrl = parseEcoHerouzTelegramPost(post.telegramPostUrl);
  if (fromUrl) return fromUrl.postUrl;

  const fromId = parseEcoHerouzTelegramPost(post.telegramPostId);
  if (fromId) return fromId.postUrl;

  const fromLegacyCta = parseEcoHerouzTelegramPost(post.ctaUrl);
  if (fromLegacyCta) return fromLegacyCta.postUrl;

  return null;
}
