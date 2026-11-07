"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { RULES } from "@/lib/rules";

/** Where a member reports their box is on its way back, unlocking the next one. */
export function ReturnTrackingForm({ pickId }: { pickId: string }) {
  const router = useRouter();
  const [trackingNumber, setTrackingNumber] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const inputId = `return-tracking-${pickId}`;

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      const res = await fetch(`/api/portal/picks/${pickId}/return`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackingNumber }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.ok) {
        setError(body?.message ?? "Could not save your tracking number.");
        return;
      }

      router.refresh();
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="mt-4 border-t border-line pt-4">
      <label className="label" htmlFor={inputId}>
        Sent it back? Add your return tracking number
      </label>
      <p className="mb-2 text-sm text-stone">
        It&apos;s on your return label. Adding it unlocks your next box from day{" "}
        {RULES.rentalDays} of your cycle.
      </p>
      <div className="flex flex-wrap gap-3">
        <input
          id={inputId}
          className="input min-w-0 flex-1 basis-56"
          value={trackingNumber}
          onChange={(event) => setTrackingNumber(event.target.value)}
          autoComplete="off"
          required
        />
        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Saving…" : "Save tracking"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}
