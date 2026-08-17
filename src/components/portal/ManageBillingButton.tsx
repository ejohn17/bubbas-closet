"use client";

import { useState } from "react";

/** Opens the Stripe Customer Portal for payment methods, invoices, cancelling. */
export function ManageBillingButton() {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    setError(null);
    setPending(true);
    try {
      const res = await fetch("/api/stripe/portal", { method: "POST" });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok || !body.url) {
        setError(body?.message ?? "Could not open the billing portal.");
        setPending(false);
        return;
      }
      window.location.href = body.url as string;
    } catch {
      setError("Network error. Please try again.");
      setPending(false);
    }
  }

  return (
    <div>
      <button type="button" className="btn-outline" onClick={onClick} disabled={pending}>
        {pending ? "Opening…" : "Manage billing"}
      </button>
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
