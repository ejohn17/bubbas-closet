"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "firebase/auth";
import { clientAuth, isAuthConfigured } from "@/lib/firebase-client";

/** Clears the session cookie first, then the client SDK's local state. */
export function SignOutButton({ className }: { className?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    setPending(true);
    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      if (isAuthConfigured()) {
        await signOut(clientAuth()).catch(() => {});
      }
      router.replace("/");
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className={className ?? "text-sm text-stone transition hover:text-ink"}
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
