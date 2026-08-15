-- Waitlist table for the pre-launch landing page.
-- Run this in the Supabase SQL editor (or via the Supabase CLI) before deploying.
-- This is the same database the full app will use, so the waitlist carries forward.

create table if not exists public.waitlist (
  id          bigint generated always as identity primary key,
  email       text not null,
  source      text not null default 'landing',
  consent     boolean not null default false,
  created_at  timestamptz not null default now(),
  constraint waitlist_email_unique unique (email)
);

-- The landing page writes using the service role key, which bypasses RLS.
-- Enable RLS so nothing is readable/writable via the public anon key.
alter table public.waitlist enable row level security;

-- No anon policies are defined on purpose: the anon/public key cannot read or
-- write this table. Only the server-side service role key (used by the API
-- route) can insert rows.
