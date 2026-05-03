-- Supabase SQL Editor で 1 回実行してください（実行ログ用・任意）
create table if not exists public.pdca_runs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  ok boolean not null default false,
  payload jsonb not null default '{}'::jsonb
);

create index if not exists pdca_runs_created_at_idx on public.pdca_runs (created_at desc);

alter table public.pdca_runs enable row level security;

-- サービスロールはRLSをバイパスするため、アプリからは anon で読めません。
-- ダッシュボードからログを見るだけなら service_role で読むか、必要なら認証済みポリシーを追加してください。
