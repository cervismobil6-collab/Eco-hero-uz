import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signOut as fbSignOut,
  onAuthStateChanged,
  Auth,
  User as FbUser,
} from 'firebase/auth';
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  Firestore,
  collection,
  getDocs,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  addDoc,
  query,
  where,
  orderBy,
  limit,
  onSnapshot,
  getDocFromServer,
} from 'firebase/firestore';
import { getStorage, ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import {
  UserProfile,
  School,
  EcoReport,
  AuditLog,
  Notification,
  UserRole,
} from '../types/eco';

// Fallback configuration if cloud provisioning has not completed yet
import firebaseConfig from '../../firebase-applet-config.json';

let app: FirebaseApp;
let auth: Auth;
let db: Firestore;

try {
  if (!getApps().length) {
    app = initializeApp(firebaseConfig);
  } else {
    app = getApps()[0];
  }
  auth = getAuth(app);
  const dbId = (firebaseConfig as any).firestoreDatabaseId;

  // Initialize with persistent multi-tab IndexedDB cache for true offline independence
  try {
    db = initializeFirestore(app, {
      localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager(),
      }),
    }, dbId);
  } catch (cacheErr) {
    // If already initialized, get Firestore instance
    db = dbId ? getFirestore(app, dbId) : getFirestore(app);
  }
} catch (error) {
  console.warn('Firebase init error:', error);
  app = initializeApp(firebaseConfig, 'eco-hero-primary');
  auth = getAuth(app);
  const dbId = (firebaseConfig as any).firestoreDatabaseId;
  db = dbId ? getFirestore(app, dbId) : getFirestore(app);
}

export { app, auth, db };

// Mandatory Error Handling conforming to FirestoreErrorInfo
export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const currentAuth = auth?.currentUser;
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: currentAuth?.uid,
      email: currentAuth?.email,
      emailVerified: currentAuth?.emailVerified,
      isAnonymous: currentAuth?.isAnonymous,
      tenantId: currentAuth?.tenantId,
      providerInfo: currentAuth?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  return errInfo;
}

// Connection test primitive required by Firebase skill
export async function testFirestoreConnection() {
  try {
    if (db && auth?.currentUser) {
      await getDocFromServer(doc(db, 'test', 'connection'));
    }
    return true;
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.warn("Firebase client offline or using local state cache.");
    }
    return false;
  }
}

// Auth operations
export async function registerWithEmail(
  email: string,
  pass: string,
  profileData: Partial<UserProfile>
): Promise<UserProfile> {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
    const fbUser = userCredential.user;

    const newProfile: UserProfile = {
      uid: fbUser.uid,
      fullName: profileData.fullName || 'Eko Qahramon',
      email: fbUser.email || email,
      profileImage: profileData.profileImage || '/assets/eco/avatar_default.jpg',
      avatarUrl: profileData.profileImage || '/assets/eco/avatar_default.jpg',
      schoolId: profileData.schoolId || 'school_tashkent_17',
      schoolName: profileData.schoolName || 'Toshkent sh. 17-maktab',
      schoolNumber: profileData.schoolNumber || '17',
      region: profileData.region || 'Toshkent shahri',
      district: profileData.district || 'Shayxontohur tumani',
      role: profileData.role || 'student',
      ecoCoins: 0,
      registrationDate: new Date().toISOString(),
      isVerified: false,
      badge: profileData.role === 'ambassador' ? 'Eko-Elchi Nomzodi' : 'Yangi Eko-Lochin',
      telegramUsername: profileData.telegramUsername,
      reportsCount: 0,
      cleanupsCount: 0,
      treesPlanted: 0,
      streakDays: 1,
      totalCoinsEarned: 0,
      activityStats: {
        reportsCount: 0,
        cleanupsCount: 0,
        treesPlanted: 0,
        streakDays: 1,
        totalCoinsEarned: 0,
      },
    };

    // Save to Firestore users collection
    try {
      await setDoc(doc(db, 'users', fbUser.uid), newProfile);
    } catch (dbErr) {
      handleFirestoreError(dbErr, OperationType.WRITE, `users/${fbUser.uid}`);
    }

    return newProfile;
  } catch (err: any) {
    console.error('Email registration error:', err);
    throw err;
  }
}

export async function loginWithEmail(email: string, pass: string): Promise<FbUser> {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, pass);
    return userCredential.user;
  } catch (err: any) {
    console.error('Email login error:', err);
    throw err;
  }
}

export async function signInWithGoogle() {
  if (!auth) throw new Error('Firebase Auth mavjud emas');
  const provider = new GoogleAuthProvider();
  try {
    const result = await signInWithPopup(auth, provider);
    return result.user;
  } catch (err: any) {
    console.error('Google Sign In error:', err);
    throw err;
  }
}

export async function logOutFirebase() {
  if (auth) {
    await fbSignOut(auth);
  }
}

// Audit Logger
export async function recordAuditLog(
  actor: { uid: string; fullName: string; role: UserRole },
  action: string,
  targetCollection: string,
  targetId: string,
  details?: Record<string, any>
): Promise<AuditLog> {
  const log: AuditLog = {
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    actorUid: actor.uid,
    actorName: actor.fullName,
    actorRole: actor.role,
    action,
    targetCollection,
    targetId,
    details,
    timestamp: new Date().toISOString(),
  };

  try {
    if (db) {
      await setDoc(doc(db, 'audit_logs', log.id), log);
    }
  } catch (e) {
    handleFirestoreError(e, OperationType.CREATE, 'audit_logs');
  }

  return log;
}

// Upload BEFORE/AFTER photo or video to Firebase Storage when Firebase Auth session is active
export async function uploadEvidenceToFirebaseStorage(
  file: Blob | File,
  folder: 'before' | 'after' | 'reports' = 'reports',
  fileName?: string
): Promise<string | null> {
  try {
    if (!app || !auth?.currentUser) return null;
    const storage = getStorage(app);
    const safeName = (fileName || (file instanceof File ? file.name : 'evidence.jpg')).replace(/[^a-zA-Z0-9._-]/g, '_');
    const storagePath = `eco_reports/${folder}/${auth.currentUser.uid}/${Date.now()}_${safeName}`;
    const storageRef = ref(storage, storagePath);
    const snap = await uploadBytes(storageRef, file);
    return await getDownloadURL(snap.ref);
  } catch (err) {
    console.warn('Firebase Storage upload fallback to server disk:', err);
    return null;
  }
}

// Mirror report record to Firestore `reports` collection when Firebase Auth is signed in
export async function syncEcoReportToFirestore(report: EcoReport): Promise<void> {
  try {
    if (!db || !auth?.currentUser || !report?.id) return;
    const sanitized: Record<string, any> = {
      id: report.id,
      title: String(report.title || 'Ekologik muammo').slice(0, 200),
      description: String(report.description || '').slice(0, 2000),
      category: report.category,
      severity: report.severity || 'medium',
      status: report.status,
      region: String(report.region || 'Toshkent shahri').slice(0, 100),
      district: String(report.district || 'Yunusobod tumani').slice(0, 100),
      address: String(report.address || '').slice(0, 300),
      lat: Number(report.lat) || 41.2995,
      lng: Number(report.lng) || 69.2401,
      imageUrl: String(report.imageUrl || '').slice(0, 1024),
      beforeImageUrl: String(report.beforeImageUrl || report.imageUrl || '').slice(0, 1024),
      reporterUid: report.reporterUid || auth.currentUser.uid,
      reporterName: String(report.reporterName || '').slice(0, 150),
      schoolId: String(report.schoolId || '').slice(0, 128),
      schoolName: String(report.schoolName || '').slice(0, 200),
      createdAt: report.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    await setDoc(doc(db, 'reports', report.id), sanitized, { merge: true });
  } catch (err) {
    handleFirestoreError(err, OperationType.WRITE, `reports/${report?.id || 'unknown'}`);
  }
}
