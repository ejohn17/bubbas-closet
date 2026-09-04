import type { ReactNode } from "react";
import Link from "next/link";
import { requireAdmin } from "@/lib/session";
import { BRAND } from "@/lib/config";
import { AdminNav } from "@/components/admin/AdminNav";
import { SignOutButton } from "@/components/SignOutButton";

export const metadata = { title: `Admin — ${BRAND.name}` };

// Everything here is per-request and reads live Firestore data.
export const dynamic = "force-dynamic";

/**
 * Admin gate. Access is granted by `isAdmin: true` on the user's Firestore
 * document, checked here and again in every /api/admin route.
 */
export default async function AdminLayout({
  children,
}: {
  children: ReactNode;
}) {
  const user = await requireAdmin();

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-line bg-card/70">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-4 px-6 py-5">
          <div className="flex items-center gap-6">
            <Link href="/admin" className="text-lg font-semibold tracking-tight">
              {BRAND.name}{" "}
              <span className="font-normal text-stone">Admin</span>
            </Link>
            <AdminNav />
          </div>

          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-stone sm:inline">{user.email}</span>
            <Link href="/portal" className="text-stone transition hover:text-ink">
              Member view
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-7xl flex-1 px-6 py-10">{children}</main>
    </div>
  );
}
