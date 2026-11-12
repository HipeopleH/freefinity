-- Freefinity API usage tracking.
-- This records usage against the Freefinity gateway account/key, never against
-- an individual upstream provider credential.

create table if not exists public.gateway_usage_daily (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  gateway_key_id uuid not null references public.gateway_keys(id) on delete cascade,
  model text not null,
  usage_date date not null default (now() at time zone 'utc')::date,
  request_count bigint not null default 0,
  prompt_tokens bigint not null default 0,
  completion_tokens bigint not null default 0,
  updated_at timestamptz not null default now(),
  unique (user_id, gateway_key_id, model, usage_date)
);

create index if not exists gateway_usage_daily_user_date_idx
  on public.gateway_usage_daily(user_id, usage_date desc);

alter table public.gateway_usage_daily enable row level security;

create or replace function public.record_gateway_usage(
  p_user_id uuid,
  p_gateway_key_id uuid,
  p_model text,
  p_prompt_tokens bigint default 0,
  p_completion_tokens bigint default 0
) returns void
language sql
security definer
set search_path = public
as $$
  insert into public.gateway_usage_daily
    (user_id, gateway_key_id, model, usage_date, request_count, prompt_tokens, completion_tokens, updated_at)
  values
    (p_user_id, p_gateway_key_id, left(coalesce(p_model, 'unknown'), 240),
     (now() at time zone 'utc')::date, 1,
     greatest(coalesce(p_prompt_tokens, 0), 0),
     greatest(coalesce(p_completion_tokens, 0), 0), now())
  on conflict (user_id, gateway_key_id, model, usage_date)
  do update set
    request_count = public.gateway_usage_daily.request_count + 1,
    prompt_tokens = public.gateway_usage_daily.prompt_tokens + excluded.prompt_tokens,
    completion_tokens = public.gateway_usage_daily.completion_tokens + excluded.completion_tokens,
    updated_at = now();
$$;

revoke all on function public.record_gateway_usage(uuid, uuid, text, bigint, bigint) from public, anon, authenticated;
grant execute on function public.record_gateway_usage(uuid, uuid, text, bigint, bigint) to service_role;
