import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/AuthForm";
import { PreviewCarousel } from "@/components/PreviewCarousel";
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
      <main className="mx-auto w-full max-w-6xl flex-1 px-6 pb-24 pt-8">
        <div className="grid items-start gap-10 lg:grid-cols-2 lg:gap-16">
          <div className="mx-auto w-full max-w-md lg:mx-0">
            <h1 className="text-3xl font-semibold tracking-tight">
              Create your account
            </h1>
            <p className="mt-2 mb-8 text-stone">
              One account for your membership, your box, and your returns.
            </p>
            <AuthForm mode="signup" next={destination} />
          </div>
          <div className="mx-auto w-full max-w-md lg:sticky lg:top-8 lg:mx-0 lg:max-w-none">
            <p className="mb-4 text-sm font-medium text-stone">
              A peek at the closet
            </p>
            <PreviewCarousel variant="signup" />
          </div>
        </div>
      </main>
    </>
  );
}
