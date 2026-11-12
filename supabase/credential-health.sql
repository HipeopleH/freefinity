-- Run once in the Supabase SQL Editor to enable credential health indicators.
alter table public.provider_credentials
  add column if not exists health_status text not null default 'unchecked',
  add column if not exists health_checked_at timestamptz,
  add column if not exists health_message text not null default '';

alter table public.provider_credentials
  drop constraint if exists provider_credentials_health_status_check;

alter table public.provider_credentials
  add constraint provider_credentials_health_status_check
  check (health_status in ('unchecked','active','invalid','expired','insufficient_credits','unknown'));
