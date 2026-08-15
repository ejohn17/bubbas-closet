import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Waitlist storage.
 *
 * Primary: Supabase Postgres via its PostgREST endpoint (no SDK dependency).
 * Set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to enable it. This is the same
 * datastore the full app will use, so the waitlist carries forward at launch.
 *
 * Dev fallback: when Supabase is not configured, records are appended to
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

const TABLE = process.env.WAITLIST_TABLE ?? "waitlist";

function supabaseConfig() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return { url: url.replace(/\/$/, ""), key };
}

export async function addToWaitlist(
  input: WaitlistInput,
): Promise<WaitlistResult> {
  const cfg = supabaseConfig();
  if (cfg) return addViaSupabase(cfg, input);
  return addViaLocalFile(input);
}

async function addViaSupabase(
  cfg: { url: string; key: string },
  input: WaitlistInput,
): Promise<WaitlistResult> {
  try {
    const res = await fetch(`${cfg.url}/rest/v1/${TABLE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: cfg.key,
        Authorization: `Bearer ${cfg.key}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        email: input.email,
        source: input.source ?? "landing",
        consent: input.consent,
      }),
    });

    if (res.ok) return { status: "added" };

    // Unique-violation on email -> already on the list.
    if (res.status === 409) return { status: "duplicate" };

    const body = await res.text();
    if (body.includes("23505")) return { status: "duplicate" };

    return {
      status: "error",
      message: `Storage responded ${res.status}`,
    };
  } catch (err) {
    return {
      status: "error",
      message: err instanceof Error ? err.message : "Unknown storage error",
    };
  }
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
