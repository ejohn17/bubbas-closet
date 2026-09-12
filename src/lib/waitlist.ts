import { promises as fs } from "node:fs";
import path from "node:path";
import { FieldValue } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebase-admin";

/**
 * Waitlist storage.
 *
 * Primary: Cloud Firestore (via firebase-admin), keeping everything in the
 * Firebase project alongside App Hosting. Configured automatically on Firebase
 * App Hosting; locally via GOOGLE_APPLICATION_CREDENTIALS or
 * FIREBASE_SERVICE_ACCOUNT (see firebase-admin.ts).
 *
 * Dev fallback: when Firebase is not configured, records are appended to
 * .data/waitlist.json so the form works locally with zero setup.
 */

export type WaitlistInput = {
  email: string;
  source?: string;
  consent: boolean;
};

export type WaitlistResult =
  | { status: "added" }
  | { status: "duplicate" }
  | { status: "error"; message: string };

const COLLECTION = process.env.WAITLIST_COLLECTION ?? "waitlist";

export async function addToWaitlist(
  input: WaitlistInput,
): Promise<WaitlistResult> {
  const db = getDb();
  if (db) return addViaFirestore(input);
  return addViaLocalFile(input);
}

async function addViaFirestore(input: WaitlistInput): Promise<WaitlistResult> {
  try {
    const db = getDb();
    if (!db) return addViaLocalFile(input);

    // Use the normalized email as the document id so signups are deduped.
    const ref = db.collection(COLLECTION).doc(input.email);
    await ref.create({
      email: input.email,
      source: input.source ?? "landing",
      consent: input.consent,
      createdAt: FieldValue.serverTimestamp(),
    });
    return { status: "added" };
  } catch (err: unknown) {
    // Firestore throws ALREADY_EXISTS (gRPC code 6) when the doc already exists.
    const code = (err as { code?: number }).code;
    const message = err instanceof Error ? err.message : String(err);
    if (code === 6 || /already exists/i.test(message)) {
      return { status: "duplicate" };
    }
    return { status: "error", message };
  }
}

export async function markMailchimpSynced(email: string): Promise<void> {
  const db = getDb();
  if (!db) return;
  try {
    await db
      .collection(COLLECTION)
      .doc(email)
      .set({ mailchimpSyncedAt: Date.now() }, { merge: true });
  } catch {
    // Sync bookkeeping is best-effort.
  }
}

export type WaitlistEntry = {
  email: string;
  source?: string;
  createdAt: number | null;
  mailchimpSyncedAt: number | null;
};

/** Admin view of stored signups, newest first. */
export async function listWaitlist(): Promise<WaitlistEntry[]> {
  const db = getDb();
  if (!db) return [];

  const snap = await db.collection(COLLECTION).get();
  return snap.docs
    .map((doc) => {
      const data = doc.data() as {
        email?: string;
        source?: string;
        createdAt?: { toMillis?: () => number } | number;
        mailchimpSyncedAt?: number;
      };
      const created = data.createdAt;
      return {
        email: data.email ?? doc.id,
        source: data.source,
        createdAt:
          typeof created === "number"
            ? created
            : (created?.toMillis?.() ?? null),
        mailchimpSyncedAt: data.mailchimpSyncedAt ?? null,
      };
    })
    .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
}

async function addViaLocalFile(input: WaitlistInput): Promise<WaitlistResult> {
  try {
    const dir = path.join(process.cwd(), ".data");
    const file = path.join(dir, "waitlist.json");
    await fs.mkdir(dir, { recursive: true });

    let entries: WaitlistInput[] = [];
    try {
      entries = JSON.parse(await fs.readFile(file, "utf8"));
    } catch {
      entries = [];
    }

    if (entries.some((e) => e.email === input.email)) {
      return { status: "duplicate" };
    }

    entries.push({ ...input, source: input.source ?? "landing" });
    await fs.writeFile(file, JSON.stringify(entries, null, 2), "utf8");
    return { status: "added" };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown storage error",
    };
  }
}
