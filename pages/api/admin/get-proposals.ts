/**
 * ユーザー投稿提案一覧を取得（管理者用）
 *
 * 初回セットアップ: Supabase ダッシュボードの SQL Editor で以下を実行してください。
 *
 * CREATE TABLE IF NOT EXISTS user_proposals (
 *   id BIGSERIAL PRIMARY KEY,
 *   user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
 *   title TEXT NOT NULL,
 *   category TEXT NOT NULL DEFAULT 'その他',
 *   options JSONB NOT NULL DEFAULT '["はい","いいえ","どちらとも言えない"]',
 *   end_days INT NOT NULL DEFAULT 7,
 *   description TEXT DEFAULT '',
 *   status TEXT NOT NULL DEFAULT 'pending',
 *   created_at TIMESTAMPTZ DEFAULT NOW()
 * );
 * ALTER TABLE user_proposals ENABLE ROW LEVEL SECURITY;
 * CREATE POLICY "insert_own" ON user_proposals FOR INSERT TO authenticated
 *   WITH CHECK (auth.uid() = user_id);
 * CREATE POLICY "select_own" ON user_proposals FOR SELECT TO authenticated
 *   USING (auth.uid() = user_id);
 */
import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { adminPassword } = req.body as { adminPassword?: string }
  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }
  try {
    const sb = getServiceSupabase()
    const { data, error } = await sb
      .from('user_proposals')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return res.status(200).json({ proposals: data ?? [] })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
