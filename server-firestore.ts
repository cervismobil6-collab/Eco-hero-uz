import fs from 'fs';
import path from 'path';
import { parseEcoHerouzTelegramPost } from './src/utils/telegramNews';

interface FirebaseAppletConfig {
  projectId: string;
  apiKey: string;
  firestoreDatabaseId?: string;
}

let cachedConfig: FirebaseAppletConfig | null = null;
let loggedMissingConfig = false;

function getFirebaseConfig(): FirebaseAppletConfig | null {
  if (cachedConfig) return cachedConfig;
  const envProjectId = String(process.env.FIREBASE_PROJECT_ID || '').trim();
  const envApiKey = String(process.env.FIREBASE_API_KEY || '').trim();
  const envDatabaseId = String(process.env.FIREBASE_DATABASE_ID || '').trim();

  if (envProjectId && envApiKey) {
    cachedConfig = {
      projectId: envProjectId,
      apiKey: envApiKey,
      firestoreDatabaseId: envDatabaseId || '(default)',
    };
    return cachedConfig;
  }

  try {
    const cfgPath = path.join(process.cwd(), 'firebase-applet-config.json');
    if (fs.existsSync(cfgPath)) {
      const raw = JSON.parse(fs.readFileSync(cfgPath, 'utf-8'));
      const projectId = envProjectId || String(raw?.projectId || '').trim();
      const apiKey = envApiKey || String(raw?.apiKey || '').trim();
      const firestoreDatabaseId = envDatabaseId || String(raw?.firestoreDatabaseId || '').trim() || '(default)';
      if (projectId && apiKey) {
        cachedConfig = { projectId, apiKey, firestoreDatabaseId };
        return cachedConfig;
      }
    }
  } catch (err: any) {
    if (!loggedMissingConfig) {
      loggedMissingConfig = true;
      console.error('[Firestore ENV ERROR] Failed to read firebase-applet-config.json:', err?.message || err);
    }
  }

  if (!loggedMissingConfig) {
    loggedMissingConfig = true;
    console.error(
      '[Firestore ENV ERROR] Firebase config missing: neither FIREBASE_PROJECT_ID + FIREBASE_API_KEY env vars nor valid firebase-applet-config.json was found. Cloud catalog sync is disabled.'
    );
  }
  return null;
}

function getFirestoreBaseUrl(): string | null {
  const cfg = getFirebaseConfig();
  if (!cfg) return null;
  const dbId = cfg.firestoreDatabaseId || '(default)';
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(cfg.projectId)}/databases/${encodeURIComponent(dbId)}/documents`;
}

function isValidDocId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);
}

function stripUndefinedDeep(value: any): any {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) {
    return value.map(stripUndefinedDeep).filter((v) => v !== undefined);
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = stripUndefinedDeep(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  return value;
}

function toFirestoreValue(val: any): any {
  if (val === null) return { nullValue: null };
  if (typeof val === 'boolean') return { booleanValue: val };
  if (typeof val === 'number') {
    if (!Number.isFinite(val)) return { doubleValue: 0 };
    return Number.isInteger(val) ? { integerValue: String(val) } : { doubleValue: val };
  }
  if (typeof val === 'string') return { stringValue: val };
  if (Array.isArray(val)) {
    return {
      arrayValue: {
        values: val.filter((v) => v !== undefined).map((v) => toFirestoreValue(v)),
      },
    };
  }
  if (typeof val === 'object') {
    return {
      mapValue: {
        fields: toFirestoreFields(val),
      },
    };
  }
  return { stringValue: String(val) };
}

function toFirestoreFields(obj: Record<string, any>): Record<string, any> {
  const fields: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    fields[k] = toFirestoreValue(v);
  }
  return fields;
}

function fromFirestoreValue(val: any): any {
  if (!val || typeof val !== 'object') return undefined;
  if ('stringValue' in val) return String(val.stringValue);
  if ('integerValue' in val) return Number(val.integerValue);
  if ('doubleValue' in val) return Number(val.doubleValue);
  if ('booleanValue' in val) return Boolean(val.booleanValue);
  if ('timestampValue' in val) return String(val.timestampValue);
  if ('nullValue' in val) return null;
  if ('arrayValue' in val) {
    const arr = Array.isArray(val.arrayValue?.values) ? val.arrayValue.values : [];
    return arr.map((item: any) => fromFirestoreValue(item));
  }
  if ('mapValue' in val) {
    const fields = val.mapValue?.fields || {};
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(fields)) {
      const parsed = fromFirestoreValue(v);
      if (parsed !== undefined) out[k] = parsed;
    }
    return out;
  }
  return undefined;
}

function fromFirestoreDoc(doc: any): Record<string, any> | null {
  if (!doc?.fields) return null;
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(doc.fields)) {
    const parsed = fromFirestoreValue(v);
    if (parsed !== undefined) out[k] = parsed;
  }
  if (!out.id && typeof doc.name === 'string') {
    const parts = doc.name.split('/');
    out.id = parts[parts.length - 1];
  }
  return out;
}

const ALLOWED_CATALOG_FIELDS: Record<string, string[]> = {
  eco_missions: [
    'id', 'type', 'title', 'description', 'rewardCoins', 'status', 'category',
    'questions', 'passingPercent', 'question', 'options', 'correctIndex',
    'explanation', 'channelUsername', 'channelUrl', 'requiresProof', 'proofType',
    'createdByUid', 'createdByName', 'createdAt', 'updatedAt',
  ],
  shopItems: [
    'id', 'title', 'description', 'priceCoins', 'category', 'stock',
    'imageUrl', 'sponsorName', 'features', 'redemptionGate', 'updatedAt',
  ],
  eco_ads: [
    'id', 'title', 'sponsorId', 'sponsorName', 'sponsorLogo', 'type', 'placement',
    'headline', 'subheadline', 'imageUrl', 'videoUrl', 'ctaText', 'ctaUrl',
    'ctaType', 'clickOpensLink', 'rewardCoins', 'skipAfterSeconds',
    'isVerifiedSponsor', 'startDate', 'endDate', 'status',
    'impressionsCount', 'clicksCount', 'complianceNote', 'createdAt', 'updatedAt',
  ],
  home_posts: [
    'id', 'title', 'content', 'category', 'imageUrl', 'videoUrl', 'ctaText', 'ctaUrl',
    'telegramPostId', 'telegramPostUrl',
    'authorUid', 'authorName', 'authorRole', 'schoolId', 'schoolName',
    'region', 'district', 'isPinned', 'status', 'createdAt', 'updatedAt',
  ],
  reward_settings: [
    'id', 'welcomeBonus', 'dailyQuiz', 'referralInviter', 'referralInvitee',
    'awarenessPost', 'wasteSorting', 'treeCareWatering', 'treePlanting',
    'gardenProject', 'environmentalCampaign', 'schoolImprovement',
    'problemVerified', 'problemResolved', 'ambassadorTaskBonus',
    'duplicateWindowHours', 'updatedAt', 'updatedBy',
  ],
  catalog_tombstones: ['id', 'collectionName', 'targetId', 'deletedByUid', 'deletedAt'],
};

function sanitizeCatalogRecord(collectionName: string, record: Record<string, any>): Record<string, any> | null {
  const allowed = ALLOWED_CATALOG_FIELDS[collectionName];
  if (!allowed || !record || typeof record !== 'object') return null;

  const out: Record<string, any> = {};
  for (const key of allowed) {
    if (record[key] !== undefined) {
      out[key] = stripUndefinedDeep(record[key]);
    }
  }
  if (!out.id || !isValidDocId(String(out.id))) return null;

  if (typeof out.title === 'string') out.title = out.title.slice(0, 200);
  if (typeof out.description === 'string') out.description = out.description.slice(0, 2000);
  if (typeof out.content === 'string') out.content = out.content.slice(0, 2000);
  if (typeof out.headline === 'string') out.headline = out.headline.slice(0, 300);
  if (typeof out.subheadline === 'string') out.subheadline = out.subheadline.slice(0, 500);
  if (typeof out.imageUrl === 'string') out.imageUrl = out.imageUrl.slice(0, 1024);
  if (typeof out.videoUrl === 'string') out.videoUrl = out.videoUrl.slice(0, 1024);
  if (typeof out.ctaUrl === 'string') out.ctaUrl = out.ctaUrl.slice(0, 1024);
  if (typeof out.channelUrl === 'string') out.channelUrl = out.channelUrl.slice(0, 1024);
  if (typeof out.channelUsername === 'string') out.channelUsername = out.channelUsername.slice(0, 120);

  if (collectionName === 'home_posts') {
    const parsedTg =
      parseEcoHerouzTelegramPost(out.telegramPostUrl) ||
      parseEcoHerouzTelegramPost(out.telegramPostId);
    if (parsedTg) {
      out.telegramPostId = parsedTg.postId;
      out.telegramPostUrl = parsedTg.postUrl;
    } else {
      delete out.telegramPostId;
      delete out.telegramPostUrl;
    }
    if (typeof out.videoUrl === 'string' && !out.videoUrl.trim()) {
      delete out.videoUrl;
    }
  }
  if (collectionName === 'eco_missions' && !out.updatedAt) {
    out.updatedAt = new Date().toISOString();
  }
  if ((collectionName === 'shopItems' || collectionName === 'eco_ads') && !out.updatedAt) {
    out.updatedAt = new Date().toISOString();
  }

  return out;
}

async function runFirestoreQuery(
  collectionId: string,
  whereFilter: { fieldPath: string; op: string; value: any }
): Promise<Record<string, any>[]> {
  const cfg = getFirebaseConfig();
  const baseUrl = getFirestoreBaseUrl();
  if (!cfg || !baseUrl) return [];

  try {
    const resp = await fetch(`${baseUrl}:runQuery?key=${encodeURIComponent(cfg.apiKey)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: AbortSignal.timeout(5000),
      body: JSON.stringify({
        structuredQuery: {
          from: [{ collectionId }],
          where: {
            fieldFilter: {
              field: { fieldPath: whereFilter.fieldPath },
              op: whereFilter.op,
              value: toFirestoreValue(whereFilter.value),
            },
          },
          limit: 500,
        },
      }),
    });

    if (!resp.ok) return [];
    const rows: any = await resp.json();
    if (!Array.isArray(rows)) return [];
    const docs: Record<string, any>[] = [];
    for (const row of rows) {
      if (row?.document) {
        const parsed = fromFirestoreDoc(row.document);
        if (parsed) docs.push(parsed);
      }
    }
    return docs;
  } catch {
    return [];
  }
}

async function getSingleFirestoreDoc(collectionId: string, docId: string): Promise<Record<string, any> | null> {
  const cfg = getFirebaseConfig();
  const baseUrl = getFirestoreBaseUrl();
  if (!cfg || !baseUrl || !isValidDocId(docId)) return null;

  try {
    const resp = await fetch(
      `${baseUrl}/${encodeURIComponent(collectionId)}/${encodeURIComponent(docId)}?key=${encodeURIComponent(cfg.apiKey)}`,
      { signal: AbortSignal.timeout(5000) }
    );
    if (!resp.ok) return null;
    const raw = await resp.json();
    return fromFirestoreDoc(raw);
  } catch {
    return null;
  }
}

export async function fetchAllCatalogFromFirestoreRest(): Promise<{
  missions: any[];
  shopItems: any[];
  ecoAds: any[];
  homePosts: any[];
  rewardSettings: Record<string, any> | null;
  tombstones: { id: string; collectionName: string; targetId: string; deletedAt: string }[];
} | null> {
  const cfg = getFirebaseConfig();
  if (!cfg) return null;

  const [missions, shopItems, ecoAds, homePosts, rewardSettings, rawTombstones] = await Promise.all([
    runFirestoreQuery('eco_missions', { fieldPath: 'status', op: 'IN', value: ['active', 'paused'] }),
    runFirestoreQuery('shopItems', { fieldPath: 'stock', op: 'GREATER_THAN_OR_EQUAL', value: 0 }),
    runFirestoreQuery('eco_ads', { fieldPath: 'status', op: 'IN', value: ['active', 'paused'] }),
    runFirestoreQuery('home_posts', { fieldPath: 'status', op: 'IN', value: ['active', 'paused'] }),
    getSingleFirestoreDoc('reward_settings', 'default'),
    runFirestoreQuery('catalog_tombstones', {
      fieldPath: 'collectionName',
      op: 'IN',
      value: ['eco_missions', 'shopItems', 'eco_ads', 'home_posts'],
    }),
  ]);

  const tombstones = rawTombstones
    .filter((t) => t?.targetId && t?.collectionName)
    .map((t) => ({
      id: String(t.id),
      collectionName: String(t.collectionName),
      targetId: String(t.targetId),
      deletedAt: String(t.deletedAt || ''),
    }));

  return { missions, shopItems, ecoAds, homePosts, rewardSettings, tombstones };
}

export async function upsertCatalogDocToFirestoreRest(
  collectionName: string,
  docId: string,
  record: Record<string, any>,
  firebaseIdToken?: string | null
): Promise<boolean> {
  const cfg = getFirebaseConfig();
  const baseUrl = getFirestoreBaseUrl();
  if (!cfg || !baseUrl || !firebaseIdToken || !isValidDocId(docId)) return false;

  const sanitized = sanitizeCatalogRecord(collectionName, { ...record, id: docId });
  if (!sanitized) return false;

  try {
    const resp = await fetch(
      `${baseUrl}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}?key=${encodeURIComponent(cfg.apiKey)}`,
      {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${firebaseIdToken}`,
        },
        signal: AbortSignal.timeout(5000),
        body: JSON.stringify({ fields: toFirestoreFields(sanitized) }),
      }
    );

    if (resp.ok && collectionName !== 'reward_settings' && collectionName !== 'catalog_tombstones') {
      const tombId = `${collectionName}__${docId}`;
      if (isValidDocId(tombId)) {
        fetch(
          `${baseUrl}/catalog_tombstones/${encodeURIComponent(tombId)}?key=${encodeURIComponent(cfg.apiKey)}`,
          {
            method: 'DELETE',
            headers: { Authorization: `Bearer ${firebaseIdToken}` },
            signal: AbortSignal.timeout(4000),
          }
        ).catch(() => {});
      }
    }
    return resp.ok;
  } catch {
    return false;
  }
}

export async function deleteCatalogDocFromFirestoreRest(
  collectionName: string,
  docId: string,
  deletedByUid: string,
  firebaseIdToken?: string | null
): Promise<boolean> {
  const cfg = getFirebaseConfig();
  const baseUrl = getFirestoreBaseUrl();
  if (!cfg || !baseUrl || !firebaseIdToken || !isValidDocId(docId)) return false;

  try {
    const tombId = `${collectionName}__${docId}`;
    const delResp = await fetch(
      `${baseUrl}/${encodeURIComponent(collectionName)}/${encodeURIComponent(docId)}?key=${encodeURIComponent(cfg.apiKey)}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${firebaseIdToken}` },
        signal: AbortSignal.timeout(5000),
      }
    );

    if (isValidDocId(tombId)) {
      const tombDoc = sanitizeCatalogRecord('catalog_tombstones', {
        id: tombId,
        collectionName,
        targetId: docId,
        deletedByUid: String(deletedByUid || '').slice(0, 128),
        deletedAt: new Date().toISOString(),
      });
      if (tombDoc) {
        await fetch(
          `${baseUrl}/catalog_tombstones/${encodeURIComponent(tombId)}?key=${encodeURIComponent(cfg.apiKey)}`,
          {
            method: 'PATCH',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${firebaseIdToken}`,
            },
            signal: AbortSignal.timeout(5000),
            body: JSON.stringify({ fields: toFirestoreFields(tombDoc) }),
          }
        ).catch(() => {});
      }
    }

    return delResp.ok || delResp.status === 404;
  } catch {
    return false;
  }
}

function recordTimeMs(rec: any): number {
  const raw = rec?.updatedAt || rec?.createdAt || '';
  if (!raw) return 0;
  const ts = Date.parse(String(raw));
  return Number.isNaN(ts) ? 0 : ts;
}

export const RETIRED_CATALOG_IDS = new Set<string>(['ad_01']);

export function mergeCatalogListWithFirestore(
  localList: any[],
  remoteList: any[],
  tombstones: { collectionName: string; targetId: string; deletedAt: string }[],
  collectionName: string,
  deletedIdsSet: Set<string>
): { merged: any[]; changed: boolean } {
  const tombstoneByTarget = new Map<string, number>();
  for (const t of tombstones) {
    if (t.collectionName === collectionName && t.targetId) {
      const ts = Date.parse(t.deletedAt || '') || 0;
      const prev = tombstoneByTarget.get(t.targetId) || 0;
      if (ts >= prev) tombstoneByTarget.set(t.targetId, ts);
    }
  }

  let changed = false;
  const byId = new Map<string, any>();
  const orderedIds: string[] = [];

  for (const item of Array.isArray(localList) ? localList : []) {
    const id = String(item?.id || '');
    if (!id) continue;
    if (RETIRED_CATALOG_IDS.has(id) || deletedIdsSet.has(id)) {
      deletedIdsSet.add(id);
      changed = true;
      continue;
    }
    const tombTs = tombstoneByTarget.get(id);
    if (tombTs !== undefined && recordTimeMs(item) <= tombTs) {
      deletedIdsSet.add(id);
      changed = true;
      continue;
    }
    byId.set(id, item);
    orderedIds.push(id);
  }

  for (const remote of Array.isArray(remoteList) ? remoteList : []) {
    const id = String(remote?.id || '');
    if (!id) continue;
    if (RETIRED_CATALOG_IDS.has(id) || deletedIdsSet.has(id)) continue;
    const remoteTs = recordTimeMs(remote);
    const tombTs = tombstoneByTarget.get(id);
    if (tombTs !== undefined && remoteTs <= tombTs) continue;

    const existing = byId.get(id);
    if (!existing) {
      byId.set(id, remote);
      orderedIds.unshift(id);
      changed = true;
    } else {
      const existingTs = recordTimeMs(existing);
      if (remoteTs > existingTs || (remoteTs === existingTs && JSON.stringify(remote) !== JSON.stringify(existing))) {
        if (remoteTs >= existingTs && remote.updatedAt) {
          byId.set(id, { ...existing, ...remote });
          changed = true;
        }
      }
    }
  }

  return {
    merged: orderedIds.map((id) => byId.get(id)).filter(Boolean),
    changed,
  };
}

export async function fetchSchoolsFromFirestoreRest(): Promise<Record<string, any>[]> {
  const cfg = getFirebaseConfig();
  if (!cfg) return [];
  return runFirestoreQuery('schools', {
    fieldPath: 'status',
    op: 'IN',
    value: ['active', 'verified'],
  });
}

export async function fetchLiveMetricsFromFirestoreRest(): Promise<Record<string, any> | null> {
  const cfg = getFirebaseConfig();
  if (!cfg) return null;
  return getSingleFirestoreDoc('live_metrics', 'global');
}

