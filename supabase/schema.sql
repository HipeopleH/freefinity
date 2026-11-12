-- Freefinity database schema
-- Run this in Supabase SQL Editor. API routes use the server-only service role
-- after authenticating the user; provider secrets are encrypted before insert.

create extension if not exists pgcrypto;

create table if not exists public.provider_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  label text not null default '',
  key_ciphertext text not null,
  key_iv text not null,
  key_tag text not null,
  created_at timestamptz not null default now()
);

-- Credential health metadata (also available as a standalone migration).
alter table public.provider_credentials
  add column if not exists health_status text not null default 'unchecked',
  add column if not exists health_checked_at timestamptz,
  add column if not exists health_message text not null default '';

alter table public.provider_credentials
  drop constraint if exists provider_credentials_health_status_check;

alter table public.provider_credentials
  add constraint provider_credentials_health_status_check
  check (health_status in ('unchecked','active','invalid','expired','insufficient_credits','unknown'));

create index if not exists provider_credentials_user_id_idx
  on public.provider_credentials(user_id);

create table if not exists public.gateway_keys (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null default 'Default key',
  key_hash text not null unique,
  key_prefix text not null,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists gateway_keys_user_id_idx
  on public.gateway_keys(user_id);

alter table public.provider_credentials enable row level security;
alter table public.gateway_keys enable row level security;

-- No client-side policies are intentionally created. The browser must never
-- access encrypted secrets or gateway-key hashes directly. Server routes use
-- SUPABASE_SERVICE_ROLE_KEY only after verifying the user's session.