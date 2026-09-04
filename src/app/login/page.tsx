import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { SiteHeader } from "@/components/SiteHeader";
import { BRAND } from "@/lib/config";
import { getSessionUser } from "@/lib/session";
import { safeNext } from "@/lib/redirects";

export const metadata: Metadata = {
  title: `Sign in — ${BRAND.name}`,
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = safeNext(next);

  const user = await getSessionUser();
  if (user) redirect(destination);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-6 pb-24 pt-8">
        <h1 className="text-3xl font-semibold tracking-tight">Welcome back</h1>
        <p className="mt-2 mb-8 text-stone">
          Sign in to build next month&apos;s box.
        </p>
        <AuthForm mode="login" next={destination} />
      </main>
    </>
  );
}
