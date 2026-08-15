import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getFirestore, type Firestore } from "firebase-admin/firestore";

/**
 * Firebase Admin (Firestore) initialization.
 *
 * On Firebase App Hosting / Cloud Run the runtime provides Application Default
 * Credentials automatically, so no keys are needed in production.
 *
 * Locally, set either:
 *   - GOOGLE_APPLICATION_CREDENTIALS = path to a service account JSON, or
 *   - FIREBASE_SERVICE_ACCOUNT = the service account JSON as a single string.
 *
 * If none of these are present, getDb() returns null and the waitlist falls
 * back to a local file so the form still works with zero setup.
 */

let cached: Firestore | null = null;

function isConfigured(): boolean {
  return Boolean(
    process.env.FIREBASE_SERVICE_ACCOUNT ||
      process.env.GOOGLE_APPLICATION_CREDENTIALS ||
      process.env.K_SERVICE || // Cloud Run / Firebase App Hosting
      process.env.GOOGLE_CLOUD_PROJECT ||
      process.env.GCLOUD_PROJECT,
  );
}

export function getDb(): Firestore | null {
  if (cached) return cached;
  if (!isConfigured()) return null;

  try {
    if (!getApps().length) {
      const saJson = process.env.FIREBASE_SERVICE_ACCOUNT;
      if (saJson) {
        const creds = JSON.parse(saJson);
        initializeApp({
          credential: cert(creds),
          projectId: creds.project_id,
        });
      } else {
        initializeApp({
          credential: applicationDefault(),
          projectId:
            process.env.FIREBASE_PROJECT_ID ||
            process.env.GOOGLE_CLOUD_PROJECT ||
            process.env.GCLOUD_PROJECT,
        });
      }
    }
    cached = getFirestore();
    return cached;
  } catch {
    return null;
  }
}
