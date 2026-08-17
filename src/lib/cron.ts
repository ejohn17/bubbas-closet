import { DomainError } from "@/lib/db/base";
import { getSessionUser } from "@/lib/session";

/**
 * Scheduled jobs are plain routes so they can be driven by Cloud Scheduler
 * (or any cron) hitting the App Hosting URL. Callers must send
 * `x-cron-secret: $CRON_SECRET`; an admin session also works so the jobs can be
 * triggered by hand while testing.
 */
export async function assertCronAuthorized(request: Request): Promise<void> {
  const secret = process.env.CRON_SECRET;
  const provided =
    request.headers.get("x-cron-secret") ??
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    "";

  if (secret && provided && timingSafeEqual(provided, secret)) return;

  const user = await getSessionUser();
  if (user?.isAdmin) return;

  throw new DomainError(
    "unauthorized",
    "This job requires the cron secret or an admin session.",
    401,
  );
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i += 1) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}
