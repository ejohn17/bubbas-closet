"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
  type UserCredential,
} from "firebase/auth";
import {
  authErrorMessage,
  clientAuth,
  googleProvider,
  isAuthConfigured,
} from "@/lib/firebase-client";

type Mode = "login" | "signup";

/**
 * Email/password + Google sign-in. On success the ID token is exchanged for an
 * httpOnly session cookie before navigating, so the destination page can gate
 * server-side on the very first render.
 */
export function AuthForm({ mode, next }: { mode: Mode; next: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"email" | "google" | null>(null);

  const configured = isAuthConfigured();

  async function startSession(credential: UserCredential) {
    const idToken = await credential.user.getIdToken(true);
    const res = await fetch("/api/auth/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      throw new Error(body?.message ?? "Could not start your session.");
    }
    router.replace(next);
    router.refresh();
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setPending("email");

    try {
      const auth = clientAuth();
      const credential =
        mode === "signup"
          ? await createUserWithEmailAndPassword(auth, email.trim(), password)
          : await signInWithEmailAndPassword(auth, email.trim(), password);

      if (mode === "signup" && name.trim()) {
        await updateProfile(credential.user, { displayName: name.trim() });
      }
      await startSession(credential);
    } catch (err) {
      setError(
        err instanceof Error && err.message.startsWith("Could not")
          ? err.message
          : authErrorMessage(err),
      );
      setPending(null);
    }
  }

  async function onGoogle() {
    setError(null);
    setPending("google");
    try {
      const credential = await signInWithPopup(clientAuth(), googleProvider());
      await startSession(credential);
    } catch (err) {
      setError(authErrorMessage(err));
      setPending(null);
    }
  }

  if (!configured) {
    return (
      <div className="card p-6 text-sm text-stone">
        <p className="font-medium text-ink">
          Sign-in isn&apos;t configured yet
        </p>
        <p className="mt-2">
          Add the <code>NEXT_PUBLIC_FIREBASE_*</code> values from your Firebase
          web app config to the environment, then enable Email/Password and
          Google sign-in in the Firebase console.
        </p>
      </div>
    );
  }

  return (
    <div className="card p-6 sm:p-8">
      <form onSubmit={onSubmit} className="flex flex-col gap-4">
        {mode === "signup" ? (
          <div>
            <label className="label" htmlFor="name">
              Name
            </label>
            <input
              id="name"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              placeholder="Your name"
            />
          </div>
        ) : null}

        <div>
          <label className="label" htmlFor="email">
            Email
          </label>
          <input
            id="email"
            type="email"
            required
            className="input"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <div className="flex items-baseline justify-between">
            <label className="label" htmlFor="password">
              Password
            </label>
            {mode === "login" ? (
              <Link
                href="/reset-password"
                className="mb-1.5 text-xs text-stone transition hover:text-ink"
              >
                Forgot your password?
              </Link>
            ) : null}
          </div>
          <input
            id="password"
            type="password"
            required
            minLength={6}
            className="input"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete={
              mode === "signup" ? "new-password" : "current-password"
            }
            placeholder={
              mode === "signup" ? "At least 6 characters" : "••••••••"
            }
          />
        </div>

        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {mode === "signup" ? (
          <p className="text-xs leading-relaxed text-stone">
            By creating an account you agree to our{" "}
            <Link href="/terms" className="link text-ink">
              rental terms
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="link text-ink">
              privacy policy
            </Link>
            .
          </p>
        ) : null}

        <button
          type="submit"
          className="btn-primary"
          disabled={pending !== null}
        >
          {pending === "email"
            ? "One moment…"
            : mode === "signup"
              ? "Create account"
              : "Sign in"}
        </button>
      </form>

      <div className="my-5 flex items-center gap-3 text-xs uppercase tracking-wider text-stone">
        <span className="h-px flex-1 bg-line" />
        or
        <span className="h-px flex-1 bg-line" />
      </div>

      <button
        type="button"
        onClick={onGoogle}
        className="btn-outline w-full"
        disabled={pending !== null}
      >
        {pending === "google" ? "One moment…" : "Continue with Google"}
      </button>

      <p className="mt-6 text-center text-sm text-stone">
        {mode === "signup" ? (
          <>
            Already a member?{" "}
            <Link
              className="link text-ink"
              href={`/login?next=${encodeURIComponent(next)}`}
            >
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link
              className="link text-ink"
              href={`/signup?next=${encodeURIComponent(next)}`}
            >
              Create an account
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
