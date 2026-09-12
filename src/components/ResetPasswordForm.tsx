"use client";

import { useState } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import {
  authErrorMessage,
  clientAuth,
  isAuthConfigured,
} from "@/lib/firebase-client";

/**
 * Password reset. Firebase sends the email and hosts the reset page, so there's
 * no server code involved.
 *
 * A missing account produces the same confirmation as a real one — otherwise
 * this form would tell anyone whether a given address is a member.
 */
export function ResetPasswordForm() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isAuthConfigured()) {
    return (
      <div className="card p-6 text-sm text-stone">
        <p className="font-medium text-ink">
          Sign-in isn&apos;t configured yet
        </p>
        <p className="mt-2">
          Add the <code>NEXT_PUBLIC_FIREBASE_*</code> values to the environment
          to enable password resets.
        </p>
      </div>
    );
  }

  if (sent) {
    return (
      <div className="card p-6 sm:p-8">
        <p className="font-medium">Check your inbox</p>
        <p className="mt-2 text-sm text-stone">
          If an account exists for {email}, we&apos;ve sent a link to reset your
          password. It expires in an hour. Remember to check your spam folder.
        </p>
        <Link href="/login" className="btn-primary mt-6">
          Back to sign in
        </Link>
      </div>
    );
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending(true);

    try {
      await sendPasswordResetEmail(clientAuth(), email.trim());
      setSent(true);
    } catch (err) {
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: unknown }).code)
          : "";

      // Don't leak whether the address has an account.
      if (code === "auth/user-not-found" || code === "auth/invalid-email") {
        setSent(true);
        return;
      }
      setError(authErrorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="card p-6 sm:p-8">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        <div>
          <label className="label" htmlFor="reset-email">
            Email
          </label>
          <input
            id="reset-email"
            type="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}

        <button type="submit" className="btn-primary" disabled={pending}>
          {pending ? "Sending…" : "Send reset link"}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-stone">
        <Link className="link text-ink" href="/login">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
