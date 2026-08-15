# Tarra — Pre-launch Landing Page (Phase 0)

The pre-launch landing page and email waitlist for the tiered subscription
clothing-rental service. Built with **Next.js 16 (App Router) + TypeScript +
Tailwind CSS v4**, deployed on **Vercel**, with the waitlist stored in
**Supabase Postgres**. Built on Next.js intentionally so it carries forward into
the full app.

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
| `SUPABASE_URL` | Supabase project URL (enables Postgres storage). |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-side key for inserts. Never expose to the browser. |
| `WAITLIST_TABLE` | Table name, defaults to `waitlist`. |
| `RESEND_API_KEY` | Optional. Enables a confirmation email via Resend. |
| `WAITLIST_FROM_EMAIL` | Optional. From address for the confirmation email. |
| `NEXT_PUBLIC_SITE_URL` | Public site URL. |

## Database setup (Supabase)

1. Create a Supabase project.
2. Run [`supabase/schema.sql`](supabase/schema.sql) in the SQL editor to create
   the `waitlist` table (unique email, RLS on).
3. Copy the project URL and the **service role** key into your env vars.

## Waitlist flow

- `POST /api/waitlist` validates the email, checks the consent box and a bot
  honeypot, stores the record (Supabase or local file), and optionally sends a
  confirmation email.
- Duplicates are treated as success ("you're already on the list").

## Email

- **Confirmation** ("you're on the list") is transactional and sent from this
  app via Resend (optional).
- **Launch/marketing** email is handled later by Shopify Email/Messaging after
  importing the waitlist into Shopify customers. Shopify cannot send the
  transactional confirmation from this external page, which is why Resend is
  used here. See `../wiki/landing-page-waitlist.md`.

## Deployment (Vercel + GitHub)

Automatic deployments are handled by Vercel's native Git integration:

1. Push this repo to GitHub (see below).
2. In Vercel, **Add New Project** and import the GitHub repo.
   - Root directory: this folder (`landing`) if the repo contains more than the app.
   - Framework preset: Next.js (auto-detected).
3. Add the environment variables from `.env.example` in Vercel.
4. Every push to `main` deploys to production; every pull request gets a preview
   deployment automatically.

Point the Shopify-managed domain at Vercel per Vercel's domain instructions
(add the domain in Vercel, then add the provided records in Shopify DNS). The
store is not live yet, so the domain (or a subdomain) can point here now and be
repointed to Shopify at full launch.

### Push to GitHub

```bash
git add -A
git commit -m "Phase 0 landing page"
gh repo create tarra-landing --private --source=. --push   # or create a repo in the GitHub UI and:
# git remote add origin git@github.com:<you>/tarra-landing.git
# git push -u origin main
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
