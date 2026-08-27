import Link from "next/link";
import { connection } from "next/server";
import { BRAND } from "@/lib/config";
import { getSessionUser } from "@/lib/session";
import { SignOutButton } from "@/components/SignOutButton";

/** Marketing / auth header. The portal and admin areas use their own nav. */
export async function SiteHeader() {
  // The header depends on who's asking, so any page using it must render per
  // request. getSessionUser() alone isn't enough to signal that: it returns
  // early without reading cookies when Firebase credentials are absent, which
  // at build time would prerender a signed-out header into otherwise static
  // pages like /terms.
  await connection();

  const user = await getSessionUser();

  return (
    <header className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-6 py-6">
      <Link href="/" className="text-xl font-semibold tracking-tight">
        {BRAND.name}
      </Link>

      <nav className="flex items-center gap-4 text-sm">
        {user ? (
          <>
            {user.isAdmin ? (
              <Link href="/admin" className="text-stone transition hover:text-ink">
                Admin
              </Link>
            ) : null}
            <Link href="/portal" className="text-stone transition hover:text-ink">
              My closet
            </Link>
            <SignOutButton />
          </>
        ) : (
          <>
            <Link href="/login" className="text-stone transition hover:text-ink">
              Sign in
            </Link>
            <Link href="/subscribe" className="btn-outline btn-sm">
              Join
            </Link>
          </>
        )}
      </nav>
    </header>
  );
}
