import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { SiteHeader } from "@/components/SiteHeader";
import { BRAND } from "@/lib/config";
import { getSessionUser } from "@/lib/session";
import { safeNext } from "@/lib/redirects";

export const metadata: Metadata = {
  title: `Create your account — ${BRAND.name}`,
};

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const destination = safeNext(next, "/subscribe");

  const user = await getSessionUser();
  if (user) redirect(destination);

  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-6 pb-24 pt-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          Create your account
        </h1>
        <p className="mt-2 mb-8 text-stone">
          One account for your membership, your box, and your returns.
        </p>
        <AuthForm mode="signup" next={destination} />
      </main>
    </>
  );
}
