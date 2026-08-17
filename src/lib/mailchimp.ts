import { getDb } from "@/lib/firebase-admin";
import { COL, nowMs } from "@/lib/db/base";

/**
 * Mailchimp audience sync for marketing campaigns (launch announcement,
 * newsletters). Transactional email goes through Resend instead — see
 * lib/email.ts.
 *
 * Needs MAILCHIMP_API_KEY (its `-usX` suffix is the data centre) and
 * MAILCHIMP_AUDIENCE_ID. Without both, every call here is a no-op so signups
 * still work.
 */

export function isMailchimpConfigured(): boolean {
  return Boolean(
    process.env.MAILCHIMP_API_KEY && process.env.MAILCHIMP_AUDIENCE_ID,
  );
}

function endpoint(path: string): string | null {
  const apiKey = process.env.MAILCHIMP_API_KEY;
  const dc = apiKey?.split("-")[1];
  if (!apiKey || !dc) return null;
  return `https://${dc}.api.mailchimp.com/3.0${path}`;
}

export type SyncResult =
  | { status: "subscribed" }
  | { status: "skipped" }
  | { status: "error"; message: string };

/** Adds (or updates) one email in the audience. Idempotent. */
export async function subscribeToAudience(
  email: string,
  tags: string[] = ["waitlist"],
): Promise<SyncResult> {
  if (!isMailchimpConfigured()) return { status: "skipped" };

  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID as string;
  const url = endpoint(`/lists/${audienceId}/members`);
  if (!url) return { status: "skipped" };

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${Buffer.from(
          `key:${process.env.MAILCHIMP_API_KEY}`,
        ).toString("base64")}`,
      },
      body: JSON.stringify({
        email_address: email,
        status: "subscribed",
        tags,
      }),
    });

    if (res.ok) return { status: "subscribed" };

    const body = (await res.json().catch(() => null)) as
      | { title?: string; detail?: string }
      | null;

    // An existing member isn't a failure for our purposes.
    if (res.status === 400 && /already a list member/i.test(body?.detail ?? "")) {
      return { status: "subscribed" };
    }

    return {
      status: "error",
      message: body?.detail ?? body?.title ?? `Mailchimp returned ${res.status}`,
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Mailchimp request failed",
    };
  }
}

export type BulkSyncSummary = {
  total: number;
  synced: number;
  alreadySynced: number;
  failed: number;
  configured: boolean;
};

/**
 * Pushes every stored waitlist email into the audience, skipping addresses
 * already synced. Used once before launch and safe to re-run.
 */
export async function syncWaitlistToAudience(): Promise<BulkSyncSummary> {
  const db = getDb();
  const summary: BulkSyncSummary = {
    total: 0,
    synced: 0,
    alreadySynced: 0,
    failed: 0,
    configured: isMailchimpConfigured(),
  };

  if (!db || !summary.configured) return summary;

  const snap = await db.collection(COL.waitlist).get();
  summary.total = snap.size;

  for (const doc of snap.docs) {
    const data = doc.data() as { email?: string; mailchimpSyncedAt?: number };
    const email = data.email ?? doc.id;

    if (data.mailchimpSyncedAt) {
      summary.alreadySynced += 1;
      continue;
    }

    const result = await subscribeToAudience(email);
    if (result.status === "subscribed") {
      await doc.ref.set({ mailchimpSyncedAt: nowMs() }, { merge: true });
      summary.synced += 1;
    } else if (result.status === "error") {
      summary.failed += 1;
    }
  }

  return summary;
}
