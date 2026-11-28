import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  query,
  where,
  setDoc,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { auth, db, handleFirestoreError, OperationType } from './firebase';
import { EcoAd, EcoMission, HomePost, LiveMetrics, RewardSettings, School, ShopItem } from '../types/eco';
import { parseEcoHerouzTelegramPost } from '../utils/telegramNews';

type CatalogCollectionName = 'eco_missions' | 'shopItems' | 'eco_ads' | 'home_posts';

export interface FirestoreCatalogSnapshot {
  missions: EcoMission[];
  shopItems: ShopItem[];
  ecoAds: EcoAd[];
  homePosts: HomePost[];
  rewardSettings: Partial<RewardSettings> | null;
  tombstones: { collectionName: string; targetId: string; deletedAt: string }[];
}

function isValidFirestoreDocId(id: string): boolean {
  return typeof id === 'string' && id.length > 0 && id.length <= 128 && /^[a-zA-Z0-9_\-]+$/.test(id);
}

function normalizeFirestoreValue(value: any): any {
  if (value === undefined || value === null) return undefined;
  if (value instanceof Timestamp) {
    return value.toDate().toISOString();
  }
  if (typeof value === 'object' && typeof value.toDate === 'function') {
    try {
      return value.toDate().toISOString();
    } catch {
      return String(value);
    }
  }
  if (Array.isArray(value)) {
    return value.map(normalizeFirestoreValue).filter((v) => v !== undefined);
  }
  if (typeof value === 'object') {
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(value)) {
      const cleaned = normalizeFirestoreValue(v);
      if (cleaned !== undefined) out[k] = cleaned;
    }
    return out;
  }
  return value;
}

const ALLOWED_FIELDS: Record<CatalogCollectionName | 'reward_settings' | 'catalog_tombstones', string[]> = {
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
    'id', 'title', 'content', 'category', 'imageUrl', 'ctaText', 'ctaUrl',
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

function sanitizeForFirestore(
  collectionName: CatalogCollectionName | 'reward_settings' | 'catalog_tombstones',
  raw: Record<string, any>
): Record<string, any> | null {
  if (!raw || typeof raw !== 'object') return null;
  const id = String(raw.id || '').trim();
  if (!isValidFirestoreDocId(id)) return null;

  const allowed = ALLOWED_FIELDS[collectionName];
  const out: Record<string, any> = {};
  for (const key of allowed) {
    const val = normalizeFirestoreValue(raw[key]);
    if (val !== undefined) out[key] = val;
  }

  out.id = id;
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

  if (collectionName === 'eco_missions') {
    if (Array.isArray(out.questions)) out.questions = out.questions.slice(0, 50);
    if (Array.isArray(out.options)) out.options = out.options.slice(0, 10);
    if (typeof out.rewardCoins === 'number') out.rewardCoins = Math.max(1, Math.min(100000, out.rewardCoins));
    out.updatedAt = out.updatedAt || new Date().toISOString();
  }
  if (collectionName === 'shopItems') {
    if (Array.isArray(out.features)) out.features = out.features.slice(0, 20);
    out.updatedAt = out.updatedAt || new Date().toISOString();
  }
  if (collectionName === 'eco_ads') {
    if (typeof out.skipAfterSeconds === 'number') {
      out.skipAfterSeconds = Math.max(0, Math.min(300, out.skipAfterSeconds));
    }
    out.updatedAt = out.updatedAt || new Date().toISOString();
  }
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
    out.createdAt = out.createdAt || new Date().toISOString();
    out.updatedAt = out.updatedAt || new Date().toISOString();
  }
  if (collectionName === 'reward_settings') {
    out.updatedAt = out.updatedAt || new Date().toISOString();
  }

  return out;
}

export async function fetchCatalogFromFirestore(): Promise<FirestoreCatalogSnapshot | null> {
  if (!db) return null;

  const snapshot: FirestoreCatalogSnapshot = {
    missions: [],
    shopItems: [],
    ecoAds: [],
    homePosts: [],
    rewardSettings: null,
    tombstones: [],
  };

  try {
    const [missionsSnap, shopSnap, adsSnap, postsSnap, settingsSnap, tombsSnap] = await Promise.all([
      getDocs(query(collection(db, 'eco_missions'), where('status', 'in', ['active', 'paused']))).catch((e) => {
        handleFirestoreError(e, OperationType.LIST, 'eco_missions');
        return null;
      }),
      getDocs(query(collection(db, 'shopItems'), where('stock', '>=', 0))).catch((e) => {
        handleFirestoreError(e, OperationType.LIST, 'shopItems');
        return null;
      }),
      getDocs(query(collection(db, 'eco_ads'), where('status', 'in', ['active', 'paused']))).catch((e) => {
        handleFirestoreError(e, OperationType.LIST, 'eco_ads');
        return null;
      }),
      getDocs(query(collection(db, 'home_posts'), where('status', 'in', ['active', 'paused']))).catch((e) => {
        handleFirestoreError(e, OperationType.LIST, 'home_posts');
        return null;
      }),
      getDoc(doc(db, 'reward_settings', 'default')).catch((e) => {
        handleFirestoreError(e, OperationType.GET, 'reward_settings/default');
        return null;
      }),
      getDocs(
        query(
          collection(db, 'catalog_tombstones'),
          where('collectionName', 'in', ['eco_missions', 'shopItems', 'eco_ads', 'home_posts'])
        )
      ).catch((e) => {
        handleFirestoreError(e, OperationType.LIST, 'catalog_tombstones');
        return null;
      }),
    ]);

    if (missionsSnap) {
      snapshot.missions = missionsSnap.docs.map((d) => normalizeFirestoreValue({ id: d.id, ...d.data() }) as EcoMission);
    }
    if (shopSnap) {
      snapshot.shopItems = shopSnap.docs.map((d) => normalizeFirestoreValue({ id: d.id, ...d.data() }) as ShopItem);
    }
    if (adsSnap) {
      snapshot.ecoAds = adsSnap.docs.map((d) => normalizeFirestoreValue({ id: d.id, ...d.data() }) as EcoAd);
    }
    if (postsSnap) {
      snapshot.homePosts = postsSnap.docs.map((d) => normalizeFirestoreValue({ id: d.id, ...d.data() }) as HomePost);
    }
    if (settingsSnap && settingsSnap.exists()) {
      snapshot.rewardSettings = normalizeFirestoreValue({ id: settingsSnap.id, ...settingsSnap.data() });
    }
    if (tombsSnap) {
      snapshot.tombstones = tombsSnap.docs
        .map((d) => normalizeFirestoreValue(d.data()))
        .filter((t) => t?.targetId && t?.collectionName)
        .map((t) => ({
          collectionName: String(t.collectionName),
          targetId: String(t.targetId),
          deletedAt: String(t.deletedAt || ''),
        }));
    }

    return snapshot;
  } catch (err) {
    handleFirestoreError(err, OperationType.LIST, 'catalog_snapshot');
    return null;
  }
}

export async function syncCatalogRecordToFirestore(
  collectionName: CatalogCollectionName | 'reward_settings',
  docId: string,
  record: Record<string, any>
): Promise<boolean> {
  if (!db || !auth?.currentUser) return false;
  const sanitized = sanitizeForFirestore(collectionName, { ...record, id: docId });
  if (!sanitized) return false;

  try {
    await setDoc(doc(db, collectionName, docId), sanitized);
    if (collectionName !== 'reward_settings') {
      const tombId = `${collectionName}__${docId}`;
      if (isValidFirestoreDocId(tombId)) {
        deleteDoc(doc(db, 'catalog_tombstones', tombId)).catch(() => {});
      }
    }
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `${collectionName}/${docId}`);
    return false;
  }
}

export async function deleteCatalogRecordFromFirestore(
  collectionName: CatalogCollectionName,
  docId: string
): Promise<boolean> {
  if (!db || !auth?.currentUser || !isValidFirestoreDocId(docId)) return false;

  try {
    await deleteDoc(doc(db, collectionName, docId));
    const tombId = `${collectionName}__${docId}`;
    if (isValidFirestoreDocId(tombId)) {
      const tombDoc = sanitizeForFirestore('catalog_tombstones', {
        id: tombId,
        collectionName,
        targetId: docId,
        deletedByUid: auth.currentUser.uid,
        deletedAt: new Date().toISOString(),
      });
      if (tombDoc) {
        await setDoc(doc(db, 'catalog_tombstones', tombId), tombDoc);
      }
    }
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.DELETE, `${collectionName}/${docId}`);
    return false;
  }
}

function getRecordTimestampMs(rec: any): number {
  const raw = rec?.updatedAt || rec?.createdAt || '';
  if (!raw) return 0;
  const ts = Date.parse(String(raw));
  return Number.isNaN(ts) ? 0 : ts;
}

const RETIRED_CATALOG_IDS = new Set<string>(['ad_01']);

export function mergeServerAndFirestoreCatalog<T extends { id: string }>(
  serverList: T[],
  firestoreList: T[],
  tombstones: { collectionName: string; targetId: string; deletedAt: string }[],
  collectionName: CatalogCollectionName,
  serverDeletedIds?: Iterable<string>
): T[] {
  const serverDeletedSet = new Set<string>(RETIRED_CATALOG_IDS);
  if (serverDeletedIds) {
    for (const id of serverDeletedIds) {
      if (id) serverDeletedSet.add(String(id));
    }
  }

  const tombstoneByTarget = new Map<string, number>();
  for (const t of tombstones) {
    if (t.collectionName === collectionName && t.targetId) {
      const ts = Date.parse(t.deletedAt || '') || 0;
      const prev = tombstoneByTarget.get(t.targetId) || 0;
      if (ts >= prev) tombstoneByTarget.set(t.targetId, ts);
    }
  }

  const byId = new Map<string, T>();
  const order: string[] = [];

  for (const item of Array.isArray(serverList) ? serverList : []) {
    if (!item?.id) continue;
    if (serverDeletedSet.has(item.id)) continue;
    const tombTs = tombstoneByTarget.get(item.id);
    if (tombTs !== undefined && getRecordTimestampMs(item) <= tombTs) continue;
    byId.set(item.id, item);
    order.push(item.id);
  }

  for (const remote of Array.isArray(firestoreList) ? firestoreList : []) {
    if (!remote?.id) continue;
    if (serverDeletedSet.has(remote.id)) continue;
    const remoteTs = getRecordTimestampMs(remote);
    const tombTs = tombstoneByTarget.get(remote.id);
    if (tombTs !== undefined && remoteTs <= tombTs) continue;

    const existing = byId.get(remote.id);
    if (!existing) {
      byId.set(remote.id, remote);
      order.unshift(remote.id);
    } else if (remoteTs > getRecordTimestampMs(existing)) {
      byId.set(remote.id, { ...existing, ...remote });
    }
  }

  return order.map((id) => byId.get(id)).filter((x): x is T => Boolean(x));
}

export async function syncLiveMetricsToFirestore(metrics: LiveMetrics): Promise<boolean> {
  if (!db || !auth?.currentUser || !metrics) return false;
  const payload = {
    id: 'global',
    totalSchools: Math.max(0, Math.round(Number(metrics.totalSchools || 0))),
    totalUsers: Math.max(0, Math.round(Number(metrics.totalUsers || 0))),
    botUsersCount: Math.max(0, Math.round(Number(metrics.botUsersCount || 0))),
    totalDistricts: Math.max(0, Math.round(Number(metrics.totalDistricts || 0))),
    totalRegions: Math.max(0, Math.round(Number(metrics.totalRegions || 0))),
    schoolCaptainsCount: Math.max(0, Math.round(Number(metrics.schoolCaptainsCount || 0))),
    pendingApplicationsCount: Math.max(0, Math.round(Number(metrics.pendingApplicationsCount || 0))),
    shopOrdersCount: Math.max(0, Math.round(Number(metrics.shopOrdersCount || 0))),
    resolvedReports: Math.max(0, Math.round(Number(metrics.resolvedReports || 0))),
    totalReports: Math.max(0, Math.round(Number(metrics.totalReports || 0))),
    treesPlanted: Math.max(0, Math.round(Number(metrics.treesPlanted || 0))),
    activeAmbassadors: Math.max(0, Math.round(Number(metrics.activeAmbassadors || 0))),
    updatedAt: new Date().toISOString(),
  };

  try {
    await setDoc(doc(db, 'live_metrics', 'global'), payload);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'live_metrics/global');
    return false;
  }
}

export function subscribeLiveMetricsFromFirestore(
  onUpdate: (metrics: LiveMetrics & { updatedAt?: string }) => void
): () => void {
  if (!db) return () => {};
  try {
    return onSnapshot(
      doc(db, 'live_metrics', 'global'),
      (snap) => {
        if (!snap.exists()) return;
        const data = normalizeFirestoreValue(snap.data());
        if (!data || typeof data !== 'object') return;
        if (
          typeof data.totalSchools === 'number' &&
          typeof data.totalUsers === 'number' &&
          typeof data.botUsersCount === 'number'
        ) {
          onUpdate(data as LiveMetrics & { updatedAt?: string });
        }
      },
      (err) => {
        handleFirestoreError(err, OperationType.GET, 'live_metrics/global');
      }
    );
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'live_metrics/global');
    return () => {};
  }
}

export async function saveUltraBackupToFirestore(snapshot: Record<string, any>): Promise<boolean> {
  if (!db || !auth?.currentUser || !snapshot || typeof snapshot !== 'object') return false;
  try {
    const cleanUsers = normalizeFirestoreValue(snapshot.usersMap || {}) || {};
    const userEntries = Object.entries(cleanUsers).slice(0, 5000);
    const boundedUsers = Object.fromEntries(userEntries);

    const cleanStarters = normalizeFirestoreValue(snapshot.botStartersMap || {}) || {};
    const starterEntries = Object.entries(cleanStarters).slice(0, 10000);
    const boundedStarters = Object.fromEntries(starterEntries);

    const boundedSchools = (Array.isArray(snapshot.schoolsList) ? snapshot.schoolsList : [])
      .slice(0, 5000)
      .map((s) => normalizeFirestoreValue(s))
      .filter(Boolean);

    let reportsList = (Array.isArray(snapshot.reportsList) ? snapshot.reportsList : [])
      .slice(0, 400)
      .map((r) => normalizeFirestoreValue(r))
      .filter(Boolean);

    let mediaList = (Array.isArray(snapshot.mediaList) ? snapshot.mediaList : [])
      .slice(0, 400)
      .map((m) => normalizeFirestoreValue(m))
      .filter(Boolean);

    let transactionsList = (Array.isArray(snapshot.transactionsList) ? snapshot.transactionsList : [])
      .slice(0, 1000)
      .map((t) => normalizeFirestoreValue(t))
      .filter(Boolean);

    const rawExtra = normalizeFirestoreValue(snapshot.extraCollections || {}) || {};
    const extraEntries = Object.entries(rawExtra).slice(0, 40);
    let extraCollections = Object.fromEntries(extraEntries);

    const buildPayload = () => ({
      id: 'primary_v1',
      version: Math.max(1, Math.min(100, Number(snapshot.version || 2))),
      totalUsers: Math.max(0, Math.round(Number(snapshot.totalUsers || userEntries.length || 0))),
      totalSchools: Math.max(0, Math.round(Number(snapshot.totalSchools || boundedSchools.length || 0))),
      botUsersCount: Math.max(0, Math.round(Number(snapshot.botUsersCount || starterEntries.length || 0))),
      usersMap: boundedUsers,
      schoolsList: boundedSchools,
      botStartersMap: boundedStarters,
      reportsList,
      mediaList,
      transactionsList,
      extraCollections,
      updatedByUid: auth.currentUser!.uid,
      updatedAt: serverTimestamp(),
    });

    // Keep well below Firestore 1 MiB document ceiling while preserving 100% of users, schools, and bot starters
    let payload = buildPayload();
    let approxBytes = JSON.stringify({ ...payload, updatedAt: 'iso' }).length;
    if (approxBytes > 750_000) {
      transactionsList = transactionsList.slice(0, 200);
      reportsList = reportsList.slice(0, 150);
      mediaList = mediaList.slice(0, 150);
      payload = buildPayload();
      approxBytes = JSON.stringify({ ...payload, updatedAt: 'iso' }).length;
    }
    if (approxBytes > 820_000) {
      transactionsList = [];
      reportsList = reportsList.slice(0, 50);
      mediaList = mediaList.slice(0, 50);
      extraCollections = { uidAliases: extraCollections.uidAliases || {} };
      payload = buildPayload();
    }

    await setDoc(doc(db, 'ultra_backups', 'primary_v1'), payload);
    return true;
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, 'ultra_backups/primary_v1');
    return false;
  }
}

export async function loadUltraBackupFromFirestore(): Promise<Record<string, any> | null> {
  if (!db || !auth?.currentUser) return null;
  try {
    const snap = await getDoc(doc(db, 'ultra_backups', 'primary_v1'));
    if (!snap.exists()) return null;
    return normalizeFirestoreValue({ id: snap.id, ...snap.data() }) || null;
  } catch (err) {
    handleFirestoreError(err, OperationType.GET, 'ultra_backups/primary_v1');
    return null;
  }
}

export async function syncSchoolsToFirestore(schools: School[]): Promise<number> {
  if (!db || !auth?.currentUser || !Array.isArray(schools) || schools.length === 0) return 0;
  let synced = 0;

  for (const s of schools.slice(0, 200)) {
    const id = String(s?.id || '').trim();
    if (!id || id === 'school_new' || id === 'school_custom' || id === 'central_hq' || !isValidFirestoreDocId(id)) {
      continue;
    }
    const name = String(s?.name || '').trim().slice(0, 200);
    const region = String(s?.region || 'Toshkent shahri').trim().slice(0, 100);
    const district = String(s?.district || 'Markaziy tumani').trim().slice(0, 100);
    const numStr = String(s?.number || '1').trim().slice(0, 40) || '1';
    if (name.length < 2 || region.length < 2 || district.length < 2) continue;

    const rawLat = Number(s?.lat);
    const rawLng = Number(s?.lng);
    const lat = Number.isFinite(rawLat) && rawLat >= 36 && rawLat <= 47 ? rawLat : 41.2995;
    const lng = Number.isFinite(rawLng) && rawLng >= 54 && rawLng <= 75 ? rawLng : 69.2401;

    try {
      const ref = doc(db, 'schools', id);
      const snap = await getDoc(ref);
      const createdAtValue = snap.exists() && snap.data()?.createdAt ? snap.data().createdAt : serverTimestamp();

      const payload: Record<string, any> = {
        id,
        name,
        number: numStr,
        region,
        district,
        address: String(s?.address || `${district}, ${region}`).slice(0, 300),
        lat,
        lng,
        totalCoins: Math.max(0, Math.round(Number(s?.totalCoins || 0))),
        registeredStudentsCount: Math.max(
          0,
          Math.round(Number(s?.registeredStudentsCount ?? s?.studentsCount ?? 0))
        ),
        treesPlanted: Math.max(0, Math.round(Number(s?.treesPlanted || 0))),
        cleanupsCompleted: Math.max(0, Math.round(Number(s?.cleanupsCompleted || 0))),
        ratingRank: Math.max(1, Math.round(Number(s?.ratingRank || 1))),
        status: ['active', 'pending', 'verified'].includes(String(s?.status || ''))
          ? s.status
          : 'active',
        createdAt: createdAtValue,
        updatedAt: serverTimestamp(),
      };

      if (s?.logoUrl && typeof s.logoUrl === 'string' && s.logoUrl.length <= 1024 && !s.logoUrl.startsWith('data:')) {
        payload.logoUrl = s.logoUrl;
      }
      if (s?.ambassadorName && typeof s.ambassadorName === 'string') {
        payload.ambassadorName = s.ambassadorName.slice(0, 120);
      }

      await setDoc(ref, payload);
      synced += 1;
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `schools/${id}`);
    }
  }
  return synced;
}


