-- 毎日5枠（JST）の計画・実行ログ。Supabase SQL Editor で 1 回実行してください。

create table if not exists public.pdca_daily_slots (
  id uuid primary key default gen_random_uuid(),
  plan_date date not null,
  slot_index smallint not null check (slot_index >= 0 and slot_index <= 4),
  flavor text not null check (flavor in ('mlb', 'general')),
  trend_json jsonb not null default '{}'::jsonb,
  executed_at timestamptz,
  market_id bigint,
  tweet_id text,
  error text,
  unique (plan_date, slot_index)
);

create index if not exists pdca_daily_slots_plan_date_idx on public.pdca_daily_slots (plan_date desc);

alter table public.pdca_daily_slots enable row level security;
