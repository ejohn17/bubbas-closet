# Bubbas Closet

Tiered subscription clothing rental: members pick a monthly plan, choose pieces
from a members-only closet up to their tier's item limit, wear them for the
month, and swap for something new.

One **Next.js 16 (App Router) + TypeScript + Tailwind v4** app on **Firebase App
Hosting**, with **Cloud Firestore** for data, **Firebase Auth** for sign-in,
**Firebase Storage** for product images, and **Stripe** for billing.

Full plan and decisions live in the project wiki (`../wiki`): `build-plan.md`,
`architecture.md`, `stripe-integration.md`, `admin-dashboard.md`,
`customer-portal.md`.

## What's built

| Surface | Routes | Notes |
| --- | --- | --- |
| Marketing + waitlist | `/`, `/subscribe` | Pre-launch waitlist; tier selection into Stripe Checkout |
| Auth | `/login`, `/signup` | Email/password + Google, exchanged for an httpOnly session cookie |
| Member portal | `/portal`, `/portal/box`, `/portal/favorites`, `/portal/orders`, `/portal/account` | Gated on an active subscription |
| Lapsed members | `/portal-paused` | Read-only outstanding items + route back to billing |
| Admin | `/admin`, `/admin/products`, `/admin/units`, `/admin/orders`, `/admin/members`, `/admin/waitlist` | Gated on `isAdmin` |
| Jobs | `/api/cron/release-holds`, `/api/cron/return-reminders` | Driven by Cloud Scheduler |

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev                  # http://localhost:3000
```

The app degrades gracefully by design: with no environment variables the
landing page and waitlist still work (signups go to `.data/waitlist.json`), the
sign-in form explains what's missing, and portal/admin pages return a
"not configured" message rather than crashing.

To work on the portal and admin you need, at minimum, a Firebase project with
Firestore + Auth enabled and either `GOOGLE_APPLICATION_CREDENTIALS` or
`FIREBASE_SERVICE_ACCOUNT` set locally, plus the `NEXT_PUBLIC_FIREBASE_*` web
config values. Stripe is needed only for signup and billing flows.

## Setup checklist

1. **Firebase project** — enable Firestore (Native mode), Authentication with
   **Email/Password** and **Google**, and Storage if you want image uploads.
2. **Firebase web config** — copy the `NEXT_PUBLIC_FIREBASE_*` values from
   Project settings → Your apps into the environment.
3. **Security rules** — `firebase deploy --only firestore:rules`. All Firestore
   access goes through server code with the Admin SDK, so the rules deny every
   client read and write.
4. **Stripe** — create three monthly recurring prices (\$50 / \$90 / \$150) and
   set `STRIPE_PRICE_ESSENTIAL`, `STRIPE_PRICE_SIGNATURE`,
   `STRIPE_PRICE_PREMIER`, plus `STRIPE_SECRET_KEY`.
5. **Stripe webhook** — point an endpoint at `/api/stripe/webhook` for
   `checkout.session.completed`, `customer.subscription.*`,
   `subscription_schedule.released`, `invoice.paid`, `invoice.payment_failed`,
   and set `STRIPE_WEBHOOK_SECRET`. Locally:
   `stripe listen --forward-to localhost:3000/api/stripe/webhook`.
6. **Make yourself an admin** — sign up in the app, then in the Firestore
   console set `isAdmin: true` on your `users/{uid}` document.
7. **Scheduled jobs** — set `CRON_SECRET` and create two Cloud Scheduler jobs
   that POST with an `x-cron-secret` header:
   `/api/cron/release-holds` every 5 minutes and `/api/cron/return-reminders`
   daily.
8. **Email** — `RESEND_API_KEY` + `WAITLIST_FROM_EMAIL` for transactional mail;
   `MAILCHIMP_API_KEY` + `MAILCHIMP_AUDIENCE_ID` for campaigns. Stripe sends
   payment receipts on its own.

Every variable is documented in [`.env.example`](.env.example); production
values are wired up in [`apphosting.yaml`](apphosting.yaml).

## How the rental cycle works

- **Serialized inventory.** A `product` is a style; a `unit` is one physical
  garment with its own status (`available`, `reserved`, `out`, `cleaning`,
  `retired`). Members browse styles, but a specific unit is what gets assigned.
- **Reserve on add.** Adding a piece runs a Firestore transaction that claims an
  available unit and creates a *hold* that expires after `HOLD_TTL_MINUTES`
  (45 by default). A member's live holds are their box, and the tier limit is
  enforced there — never in the browser.
- **Confirm the box.** Confirming converts the holds into a `pick` (the monthly
  rental order), moves the units to `out`, and emails the member. There's no
  customer checkout for a pick: the subscription already covers it. One pick per
  billing cycle, keyed off the Stripe period start.
- **Returns.** Admin receives garments from the order screen (all or some);
  they move to `cleaning`, then back to `available`. Overdue orders are flagged
  and a late fee can be charged to the member's saved card via Stripe.
- **Tier changes.** Upgrades apply immediately with proration; downgrades are
  scheduled with a Stripe subscription schedule and take effect next cycle.

## Access control

- Sign-in happens in the browser with the Firebase client SDK; the ID token is
  immediately exchanged at `POST /api/auth/session` for a Firebase **session
  cookie** (httpOnly). Every server page and route handler verifies that cookie
  with `firebase-admin`, so no gating decision depends on client state.
- `/portal/*` requires a signed-in member whose subscription status is `active`
  or `trialing`, checked in `src/app/portal/layout.tsx` and again in every
  `/api/portal/*` handler.
- `/admin/*` requires `isAdmin: true` on the user's Firestore document, checked
  in `src/app/admin/layout.tsx` and again in every `/api/admin/*` handler.

## Project layout

```
src/app/            routes: marketing, auth, /portal, /admin, /api
src/components/     UI; admin/ and portal/ subfolders
src/lib/            config, session, billing, email, format
src/lib/db/         Firestore data layer (users, subscriptions, products,
                    units, holds, picks, favorites)
```

The data layer keeps queries to a single equality filter and refines in memory,
so no composite Firestore indexes are needed at this catalogue size.

## Deployment (Firebase App Hosting + GitHub)

1. Push the repo to GitHub.
2. In the Firebase console create an **App Hosting** backend connected to the
   repo (or run `firebase init apphosting`), with the app root set to `landing`.
3. Every push to the connected branch triggers a rollout; pull requests can get
   preview backends.
4. Add secrets with `firebase apphosting:secrets:set <NAME>` and uncomment the
   matching entries in [`apphosting.yaml`](apphosting.yaml). The
   `NEXT_PUBLIC_FIREBASE_*` values must be available at **build** time.

Custom domain: add it in App Hosting, then create the DNS records at the
registrar (Squarespace) — see `../wiki/landing-page-waitlist.md`.

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint, type-check,
and a production build on every push and pull request.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript, no emit
