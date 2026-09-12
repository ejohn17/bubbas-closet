import { cookies } from "next/headers";
import { requireAuthAdmin } from "@/lib/firebase-admin";
import { upsertUserFromAuth } from "@/lib/db/users";
import { fail, ok, readJson, toErrorResponse } from "@/lib/api";
import { SESSION_COOKIE, SESSION_MAX_AGE_MS } from "@/lib/session";

/**
 * Exchanges a Firebase ID token (from browser sign-in) for an httpOnly session
 * cookie, and creates the member's Firestore profile on first sign-in.
 */
export async function POST(request: Request) {
  try {
    const body = await readJson<{ idToken: string }>(request);
    const idToken = body.idToken;
    if (!idToken) {
      return fail("missing_token", "Missing ID token.", 400);
    }

    const auth = requireAuthAdmin();
    const decoded = await auth.verifyIdToken(idToken);

    const profile = await upsertUserFromAuth({
      uid: decoded.uid,
      email: decoded.email ?? null,
      name: (decoded.name as string | undefined) ?? null,
    });

    const sessionCookie = await auth.createSessionCookie(idToken, {
      expiresIn: SESSION_MAX_AGE_MS,
    });

    (await cookies()).set({
      name: SESSION_COOKIE,
      value: sessionCookie,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: SESSION_MAX_AGE_MS / 1000,
    });

    return ok({ isAdmin: profile.isAdmin === true });
  } catch (err) {
    return toErrorResponse(err);
  }
}

/** Sign out. */
export async function DELETE() {
  (await cookies()).delete(SESSION_COOKIE);
  return ok();
}
