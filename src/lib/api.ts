import { NextResponse } from "next/server";
import { DomainError } from "@/lib/db/base";
import { getSessionUser, type SessionUser } from "@/lib/session";

/** Shared shapes and guards for route handlers under /api. */

export function ok<T extends Record<string, unknown>>(data?: T) {
  return NextResponse.json({ ok: true, ...(data ?? {}) });
}

export function fail(code: string, message: string, status = 400) {
  return NextResponse.json({ ok: false, code, message }, { status });
}

export async function requireApiUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) {
    throw new DomainError("unauthenticated", "Please sign in first.", 401);
  }
  return user;
}

export async function requireApiAdmin(): Promise<SessionUser> {
  const user = await requireApiUser();
  if (!user.isAdmin) {
    throw new DomainError("forbidden", "Admin access required.", 403);
  }
  return user;
}

/** Maps thrown errors to a response; unknown errors become a 500. */
export function toErrorResponse(err: unknown) {
  if (err instanceof DomainError) {
    return fail(err.code, err.message, err.status);
  }
  const message = err instanceof Error ? err.message : "Unexpected error.";
  if (message.includes("not configured")) {
    return fail("not_configured", message, 503);
  }
  console.error("[api]", err);
  return fail("server_error", "Something went wrong. Please try again.", 500);
}

/** Parses a JSON body, tolerating an empty one. */
export async function readJson<T>(request: Request): Promise<Partial<T>> {
  try {
    return (await request.json()) as Partial<T>;
  } catch {
    return {};
  }
}
