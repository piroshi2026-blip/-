import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../lib/pdca/cronGuard'
import { runWeekly } from '../../../lib/xbot/xWeekly'
import { logPdcaPayload } from '../../../lib/pdca/pdcaHelpers'

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
