import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { getAuthAdmin, isFirebaseConfigured } from "@/lib/firebase-admin";
import { getUser } from "@/lib/db/users";
import type { UserDoc } from "@/lib/types";

/**
 * Server-side session handling.
 *
 * Sign-in happens in the browser with the Firebase client SDK; the resulting ID
 * token is exchanged for a Firebase session cookie (see /api/auth/session).
 * Everything server-side — pages, route handlers, admin checks — reads that
 * httpOnly cookie, so no privileged decision depends on client state.
 */

export const SESSION_COOKIE = "bc_session";
export const SESSION_MAX_AGE_MS = 5 * 24 * 60 * 60 * 1000; // 5 days

export type SessionUser = {
  uid: string;
  email: string | null;
  name: string | null;
  isAdmin: boolean;
  profile: UserDoc | null;
};

export async function getSessionUser(): Promise<SessionUser | null> {
  if (!isFirebaseConfigured()) return null;

  const cookie = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!cookie) return null;

  const auth = getAuthAdmin();
  if (!auth) return null;

  try {
    const claims = await auth.verifySessionCookie(cookie);
    const profile = await getUser(claims.uid);
    return {
      uid: claims.uid,
      email: profile?.email ?? claims.email ?? null,
      name: profile?.name ?? (claims.name as string | undefined) ?? null,
      isAdmin: profile?.isAdmin === true,
      profile,
    };
  } catch {
    // Expired, revoked, or malformed cookie — treated as signed out.
    return null;
  }
}

export async function requireUser(next = "/portal"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  return user;
}

/** Admin access is granted by `isAdmin: true` on the user's Firestore doc. */
export async function requireAdmin(next = "/admin"): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(next)}`);
  if (!user.isAdmin) redirect("/portal?error=admin_only");
  return user;
}
