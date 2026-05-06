-- user_proposals テーブル作成（ユーザー投稿提案機能）
-- Supabase Dashboard → SQL Editor で実行してください

CREATE TABLE IF NOT EXISTS user_proposals (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'その他',
  options JSONB NOT NULL DEFAULT '["はい","いいえ","どちらとも言えない"]',
  end_days INT NOT NULL DEFAULT 7,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS（行レベルセキュリティ）を有効化
ALTER TABLE user_proposals ENABLE ROW LEVEL SECURITY;

-- ポリシー：ログインユーザーは自分の提案だけ投稿できる
CREATE POLICY "insert_own" ON user_proposals
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- ポリシー：ログインユーザーは自分の提案だけ閲覧できる
CREATE POLICY "select_own" ON user_proposals
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
