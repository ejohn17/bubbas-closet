"use client";

import { getApp, getApps, initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  type Auth,
  browserSessionPersistence,
  setPersistence,
} from "firebase/auth";

/**
 * Browser-side Firebase Auth.
 *
 * The client SDK only handles sign-in; the resulting ID token is immediately
 * exchanged for an httpOnly session cookie (see /api/auth/session) so every
 * server route can verify the user with firebase-admin. Auth state is kept in
 * session storage only, since the cookie is the source of truth.
 */

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export function isAuthConfigured(): boolean {
  return Boolean(config.apiKey && config.authDomain && config.projectId);
}

function clientApp(): FirebaseApp {
  if (getApps().length) return getApp();
  return initializeApp(config);
}

export function clientAuth(): Auth {
  const auth = getAuth(clientApp());
  void setPersistence(auth, browserSessionPersistence).catch(() => {
    // Non-fatal: sign-in still works, it just won't survive a reload before
    // the session cookie is set.
  });
  return auth;
}

export function googleProvider(): GoogleAuthProvider {
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return provider;
}

/** Turns Firebase error codes into copy we can show a member. */
export function authErrorMessage(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code)
      : "";

  switch (code) {
    case "auth/invalid-email":
      return "That email address doesn't look right.";
    case "auth/missing-password":
      return "Please enter your password.";
    case "auth/weak-password":
      return "Passwords need to be at least 6 characters.";
    case "auth/email-already-in-use":
      return "An account already exists with that email. Try signing in.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Email or password is incorrect.";
    case "auth/too-many-requests":
      return "Too many attempts. Please wait a moment and try again.";
    case "auth/popup-closed-by-user":
    case "auth/cancelled-popup-request":
      return "Sign-in was cancelled.";
    case "auth/operation-not-allowed":
      return "That sign-in method isn't enabled for this project yet.";
    default:
      return "Something went wrong signing you in. Please try again.";
  }
}
