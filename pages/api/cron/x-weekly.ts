import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../lib/pdca/cronGuard'
import { runWeekly } from '../../../lib/xbot/xWeekly'
import { logPdcaPayload } from '../../../lib/pdca/pdcaHelpers'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'

export const maxDuration = 30

/**
 * 毎週日曜 JST 20:00 — cron-job.org から呼ばれる。
 * 今週の確定問い・ランキング上位をまとめた週次ダイジェストを投稿。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!assertCronAuthorized(req, res)) return

  // 6日以内に成功済みの週次投稿があればスキップ（二重投稿防止）
  const sb = getServiceSupabase()
  const since = new Date(Date.now() - 6 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recent } = await sb
    .from('pdca_runs')
    .select('id')
    .eq('ok', true)
    .gte('created_at', since)
    .filter('payload->>kind', 'eq', 'x_weekly')
    .limit(1)
    .maybeSingle()

  if (recent) {
    return res.status(200).json({ skipped: true, reason: '6日以内に既に実行済み' })
  }

  try {
    const result = await runWeekly()
    await logPdcaPayload('x_weekly', result, true)
    return res.status(200).json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logPdcaPayload('x_weekly', { error: msg }, false)
    return res.status(200).json({ error: msg })
  }
}
