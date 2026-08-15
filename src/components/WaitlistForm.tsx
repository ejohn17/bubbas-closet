"use client";

import { useState } from "react";

type Status = "idle" | "submitting" | "success" | "duplicate" | "error";

export function WaitlistForm({ source = "landing" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(true);
  const [company, setCompany] = useState(""); // honeypot
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);

  const submitting = status === "submitting";
  const done = status === "success" || status === "duplicate";

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setStatus("submitting");
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, consent, company, source }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setStatus("error");
        setError(body.error ?? "Something went wrong. Please try again.");
        return;
      }
      setStatus(body.status === "duplicate" ? "duplicate" : "success");
    } catch {
      setStatus("error");
      setError("Network error. Please try again.");
    }
  }

  if (done) {
    return (
      <div className="rounded-2xl border border-line bg-card p-6 text-center">
        <p className="text-lg font-medium text-ink">
          {status === "duplicate"
            ? "You're already on the list."
            : "You're on the list."}
        </p>
        <p className="mt-1 text-sm text-stone">
          We&apos;ll email you the moment memberships open.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="w-full">
      {/* Honeypot field, hidden from humans */}
      <div className="absolute left-[-9999px]" aria-hidden="true">
        <label>
          Company
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </label>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@email.com"
          aria-label="Email address"
          className="w-full flex-1 rounded-full border border-line bg-card px-5 py-3 text-ink outline-none placeholder:text-stone/70 focus:border-accent focus:ring-2 focus:ring-accent/30"
        />
        <button
          type="submit"
          disabled={submitting}
          className="rounded-full bg-ink px-6 py-3 font-medium text-cream transition hover:bg-accent-dark disabled:opacity-60"
        >
          {submitting ? "Joining…" : "Join the waitlist"}
        </button>
      </div>

      <label className="mt-3 flex items-start gap-2 text-sm text-stone">
        <input
          type="checkbox"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
          className="mt-0.5 h-4 w-4 rounded border-line accent-accent"
        />
        <span>Email me launch updates. No spam, unsubscribe anytime.</span>
      </label>

      {status === "error" && error ? (
        <p className="mt-2 text-sm text-red-700">{error}</p>
      ) : null}
    </form>
  );
}
