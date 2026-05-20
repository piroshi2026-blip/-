-- X自動投稿システム用テーブル
-- Supabase ダッシュボードの SQL Editor で実行してください

create table if not exists public.x_posts (
  id bigserial primary key,
  tweet_id text unique not null,
  posted_at timestamptz not null default now(),
  topic text,
  content text not null,
  -- エンゲージメント指標（取得前はnull）
  likes int,
  retweets int,
  replies int,
  quotes int,
  impressions int,
  bookmarks int,
  score numeric(8, 4),
  engagement_fetched_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists x_posts_posted_at_idx on public.x_posts (posted_at desc);
create index if not exists x_posts_engagement_idx on public.x_posts (engagement_fetched_at) where engagement_fetched_at is null;

alter table public.x_posts enable row level security;

-- 分析インサイト（単一行）
create table if not exists public.x_analysis (
  id int primary key default 1,
  insights text,
  last_analyzed timestamptz
);

alter table public.x_analysis enable row level security;
