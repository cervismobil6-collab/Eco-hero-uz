import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface EcoOfflineDB extends DBSchema {
  pending_reports: {
    key: string;
    value: {
      id: string;
      title: string;
      description: string;
      category: string;
      severity: string;
      region: string;
      district: string;
      address: string;
      lat: number;
      lng: number;
      imageBase64?: string;
      imageUrl?: string;
      authorUid: string;
      authorName: string;
      authorSchool: string;
      authorTelegramId?: string | number | null;
      timestamp: number;
      retryCount: number;
    };
    indexes: { 'by-timestamp': number };
  };
  cached_schools: {
    key: string;
    value: any;
  };
  cached_rankings: {
    key: string;
    value: {
      id: string;
      data: any;
      updatedAt: number;
    };
  };
  pending_actions: {
    key: string;
    value: {
      id: string;
      type: 'quiz_completed' | 'challenge_completed' | 'profile_updated';
      payload: any;
      timestamp: number;
    };
  };
}

const DB_NAME = 'ecohero_offline_v2';
const DB_VERSION = 1;

let dbPromise: Promise<IDBPDatabase<EcoOfflineDB>> | null = null;

function getDb(): Promise<IDBPDatabase<EcoOfflineDB>> {
  if (!dbPromise) {
    dbPromise = openDB<EcoOfflineDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('pending_reports')) {
          const reportStore = db.createObjectStore('pending_reports', { keyPath: 'id' });
          reportStore.createIndex('by-timestamp', 'timestamp');
        }
        if (!db.objectStoreNames.contains('cached_schools')) {
          db.createObjectStore('cached_schools', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('cached_rankings')) {
          db.createObjectStore('cached_rankings', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('pending_actions')) {
          db.createObjectStore('pending_actions', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// 1. Report Queue Operations
export async function queuePendingReport(report: {
  title: string;
  description: string;
  category: string;
  severity: string;
  region: string;
  district: string;
  address: string;
  lat: number;
  lng: number;
  imageBase64?: string;
  imageUrl?: string;
  authorUid: string;
  authorName: string;
  authorSchool: string;
  authorTelegramId?: string | number | null;
}) {
  try {
    const db = await getDb();
    const id = `pending_rep_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const pendingItem = {
      ...report,
      id,
      timestamp: Date.now(),
      retryCount: 0,
    };
    await db.put('pending_reports', pendingItem);
    console.log(`[OfflineQueue] Hisobot oflayn keshlandi: ${id}`);
    return id;
  } catch (err) {
    console.error('[OfflineQueue] queuePendingReport error:', err);
    return null;
  }
}

export async function getPendingReports() {
  try {
    const db = await getDb();
    return await db.getAllFromIndex('pending_reports', 'by-timestamp');
  } catch (err) {
    console.error('[OfflineQueue] getPendingReports error:', err);
    return [];
  }
}

export async function removePendingReport(id: string) {
  try {
    const db = await getDb();
    await db.delete('pending_reports', id);
  } catch (err) {
    console.error('[OfflineQueue] removePendingReport error:', err);
  }
}

// 2. Cache Schools in IndexedDB for 0ms and offline browsing
export async function cacheSchools(schools: any[]) {
  try {
    const db = await getDb();
    const tx = db.transaction('cached_schools', 'readwrite');
    for (const school of schools) {
      await tx.store.put(school);
    }
    await tx.done;
  } catch (err) {
    console.error('[OfflineQueue] cacheSchools error:', err);
  }
}

export async function getCachedSchools() {
  try {
    const db = await getDb();
    return await db.getAll('cached_schools');
  } catch (err) {
    console.error('[OfflineQueue] getCachedSchools error:', err);
    return [];
  }
}

// 3. Cache Leaderboards & Rankings
export async function cacheRankings(key: string, data: any) {
  try {
    const db = await getDb();
    await db.put('cached_rankings', {
      id: key,
      data,
      updatedAt: Date.now(),
    });
  } catch (err) {
    console.error('[OfflineQueue] cacheRankings error:', err);
  }
}

export async function getCachedRankings(key: string) {
  try {
    const db = await getDb();
    const item = await db.get('cached_rankings', key);
    return item ? item.data : null;
  } catch (err) {
    console.error('[OfflineQueue] getCachedRankings error:', err);
    return null;
  }
}

// 4. Pending Generic Actions
export async function queuePendingAction(type: 'quiz_completed' | 'challenge_completed' | 'profile_updated', payload: any) {
  try {
    const db = await getDb();
    const id = `action_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    await db.put('pending_actions', {
      id,
      type,
      payload,
      timestamp: Date.now(),
    });
    return id;
  } catch (err) {
    console.error('[OfflineQueue] queuePendingAction error:', err);
    return null;
  }
}

export async function getPendingActions() {
  try {
    const db = await getDb();
    return await db.getAll('pending_actions');
  } catch (err) {
    console.error('[OfflineQueue] getPendingActions error:', err);
    return [];
  }
}

export async function removePendingAction(id: string) {
  try {
    const db = await getDb();
    await db.delete('pending_actions', id);
  } catch (err) {
    console.error('[OfflineQueue] removePendingAction error:', err);
  }
}
