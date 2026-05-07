-- markets テーブルに参考記事 URL カラムを追加
-- Supabase Dashboard → SQL Editor で実行してください（1回だけ）

ALTER TABLE markets ADD COLUMN IF NOT EXISTS source_url TEXT;
