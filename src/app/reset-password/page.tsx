import type { Metadata } from "next";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ResetPasswordForm } from "@/components/ResetPasswordForm";
import { BRAND } from "@/lib/config";

export const metadata: Metadata = {
  title: `Reset your password — ${BRAND.name}`,
};

export default function ResetPasswordPage() {
  return (
    <>
      <SiteHeader />
      <main className="mx-auto w-full max-w-md flex-1 px-6 pb-24 pt-8">
        <h1 className="text-3xl font-semibold tracking-tight">
          Reset your password
        </h1>
        <p className="mt-2 mb-8 text-stone">
          Enter the email you signed up with and we&apos;ll send you a link.
        </p>
        <ResetPasswordForm />
      </main>
      <SiteFooter />
    </>
  );
}
