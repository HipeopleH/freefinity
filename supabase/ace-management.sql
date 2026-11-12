-- Store the separate Ace Data Cloud platform-management token.
-- It is encrypted with the same server-side AES-256-GCM key as provider credentials.

create table if not exists public.ace_management_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  key_ciphertext text not null,
  key_iv text not null,
  key_tag text not null,
  updated_at timestamptz not null default now()
);

alter table public.ace_management_credentials enable row level security;
