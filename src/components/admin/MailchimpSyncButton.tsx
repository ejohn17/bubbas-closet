"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Summary = {
  total: number;
  synced: number;
  alreadySynced: number;
  failed: number;
  configured: boolean;
};

/** Pushes waitlist signups into the Mailchimp audience for the launch campaign. */
export function MailchimpSyncButton({ disabled }: { disabled?: boolean }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  async function onClick() {
    setError(null);
    setSummary(null);
    setPending(true);

    try {
      const res = await fetch("/api/admin/mailchimp/sync", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "Sync failed.");
        return;
      }
      setSummary(body.summary as Summary);
      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        className="btn-outline"
        onClick={onClick}
        disabled={pending || disabled}
      >
        {pending ? "Syncing…" : "Sync to Mailchimp"}
      </button>

      {summary ? (
        <p role="status" className="mt-3 text-sm text-stone">
          {summary.synced} newly subscribed · {summary.alreadySynced} already in
          the audience
          {summary.failed ? ` · ${summary.failed} failed` : ""}
        </p>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
