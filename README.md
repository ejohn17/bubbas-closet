# Bubbas Closet — Pre-launch Landing Page (Phase 0)

The pre-launch landing page and email waitlist for the tiered subscription
clothing-rental service. Built with **Next.js 16 (App Router) + TypeScript +
Tailwind CSS v4**, hosted on **Firebase App Hosting**, with the waitlist stored
in **Cloud Firestore** — everything in one Firebase project. Built on Next.js
intentionally so it carries forward into the full app.

See the project wiki (`../wiki`) for the full build plan: `build-plan.md`,
`tech-stack.md`, and `landing-page-waitlist.md`.

## Local development

```bash
npm install
cp .env.example .env.local   # optional; the form works without any env vars
npm run dev                  # http://localhost:3000
```

With no environment variables set, signups are written to `.data/waitlist.json`
so you can develop with zero external setup.

## Configuration

All brand copy, tiers, and steps live in [`src/lib/config.ts`](src/lib/config.ts).
Environment variables are documented in [`.env.example`](.env.example):

| Variable | Purpose |
| --- | --- |
| `GOOGLE_APPLICATION_CREDENTIALS` | Local only: path to a Firebase service account JSON (enables Firestore in dev). |
| `FIREBASE_SERVICE_ACCOUNT` | Local only: service account JSON as a string (alternative to the path above). |
| `FIREBASE_PROJECT_ID` | Firebase project id (local dev). |
| `WAITLIST_COLLECTION` | Firestore collection name, defaults to `waitlist`. |
| `RESEND_API_KEY` | Optional. Enables a confirmation email via Resend. |
| `WAITLIST_FROM_EMAIL` | Optional. From address for the confirmation email. |
| `NEXT_PUBLIC_SITE_URL` | Public site URL. |

On **Firebase App Hosting**, Firestore is accessed with the backend's own
service account (Application Default Credentials), so no keys are needed in
production.

## Waitlist flow

- `POST /api/waitlist` validates the email, checks the consent box and a bot
  honeypot, stores the record (Firestore or local file), and optionally sends a
  confirmation email.
- The normalized email is used as the Firestore document id, so duplicates are
  detected and returned as success ("you're already on the list").

## Email

- **Confirmation** ("you're on the list") is transactional and sent from this
  app via Resend (optional).
- **Launch/marketing** email is handled later by Shopify Email/Messaging after
  importing the waitlist into Shopify customers. Shopify cannot send the
  transactional confirmation from this external page, which is why Resend is
  used here. See `../wiki/landing-page-waitlist.md`.

## Deployment (Firebase App Hosting + GitHub)

Automatic deployments are handled by Firebase App Hosting's GitHub integration:

1. Push this repo to GitHub (see below).
2. In the Firebase console, create an **App Hosting** backend and connect it to
   the GitHub repo (or run `firebase init apphosting`).
   - Set the app root to this folder (`landing`) if the repo contains more than
     the app.
   - App Hosting auto-detects Next.js and builds it.
3. Every push to the connected branch (e.g. `main`) triggers a rollout;
   pull requests can get preview backends.
4. Runtime config lives in [`apphosting.yaml`](apphosting.yaml). Firestore needs
   no secrets; to enable the confirmation email, add the Resend secret:
   `firebase apphosting:secrets:set RESEND_API_KEY` and uncomment the `env`
   block in `apphosting.yaml`.

### Firestore setup

1. Enable Firestore in the Firebase project (Native mode).
2. Deploy the security rules (locks the collection to server-only access):
   `firebase deploy --only firestore:rules`
   (config in [`firebase.json`](firebase.json) / [`firestore.rules`](firestore.rules)).

### Custom domain

Add the domain to the App Hosting backend, then add the records it provides in
your Shopify DNS panel. The store is not live yet, so the domain (or a
subdomain) can point here now and be repointed to Shopify at full launch.

### Push to GitHub

```bash
git add -A
git commit -m "Firebase App Hosting + Firestore; rebrand to Bubbas Closet"
# create a repo in the GitHub UI, then:
git remote add origin git@github.com:<you>/bubbas-closet-landing.git
git push -u origin main
```

## CI

[`.github/workflows/ci.yml`](.github/workflows/ci.yml) runs lint, type-check,
and a production build on every push and pull request.

## Scripts

- `npm run dev` — start the dev server
- `npm run build` — production build
- `npm run start` — serve the production build
- `npm run lint` — ESLint
- `npm run typecheck` — TypeScript, no emit
