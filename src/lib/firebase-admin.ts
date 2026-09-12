import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
  type App,
} from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage } from "firebase-admin/storage";

/**
 * Firebase Admin initialization (Firestore, Auth, Storage).
 *
 * On Firebase App Hosting / Cloud Run the runtime provides Application Default
 * Credentials automatically, so no keys are needed in production.
 *
 * Locally, set either:
 *   - GOOGLE_APPLICATION_CREDENTIALS = path to a service account JSON, or
 *   - FIREBASE_SERVICE_ACCOUNT = the service account JSON as a single string.
 *
 * If neither is present the getters return null. The waitlist form degrades to
 * a local JSON file so the landing page still works with zero setup; the
 * portal and admin areas surface a "not configured" message instead.
 */

let cachedApp: App | null = null;
let cachedDb: Firestore | null = null;
let cachedAuth: Auth | null = null;

export function isFirebaseConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.K_SERVICE || // Cloud Run / Firebase App Hosting
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT,
  );
}

function getApp(): App | null {
  if (cachedApp) return cachedApp;
  if (!isFirebaseConfigured()) return null;

  try {
    const existing = getApps();
    if (existing.length) {
      cachedApp = existing[0];
      return cachedApp;
    }

    const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (saJson) {
      const creds = JSON.parse(saJson);
      cachedApp = initializeApp({
        credential: cert(creds),
        projectId: creds.project_id,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
    } else {
      cachedApp = initializeApp({
        credential: applicationDefault(),
        projectId:
          process.env.FIREBASE_PROJECT_ID ||
          process.env.GOOGLE_CLOUD_PROJECT ||
          process.env.GCLOUD_PROJECT,
        storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
      });
    }
    return cachedApp;
  } catch {
    return null;
  }
}

export function getDb(): Firestore | null {
  if (cachedDb) return cachedDb;
  const app = getApp();
  if (!app) return null;
  try {
    cachedDb = getFirestore(app);
    return cachedDb;
  } catch {
    return null;
  }
}

/** For code paths where Firestore is mandatory (portal, admin, webhooks). */
export function requireDb(): Firestore {
  const db = getDb();
  if (!db) {
    throw new Error(
      "Firestore is not configured. Set GOOGLE_APPLICATION_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT.",
    );
  }
  return db;
}

export function getAuthAdmin(): Auth | null {
  if (cachedAuth) return cachedAuth;
  const app = getApp();
  if (!app) return null;
  try {
    cachedAuth = getAuth(app);
    return cachedAuth;
  } catch {
    return null;
  }
}

export function requireAuthAdmin(): Auth {
  const auth = getAuthAdmin();
  if (!auth) {
    throw new Error("Firebase Auth admin is not configured.");
  }
  return auth;
}

/** Storage bucket for product images; null when no bucket is configured. */
export function getBucket() {
  const app = getApp();
  const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
  if (!app || !bucketName) return null;
  try {
    return getStorage(app).bucket(bucketName);
  } catch {
    return null;
  }
}
