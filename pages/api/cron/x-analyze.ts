import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../lib/pdca/cronGuard'
import { runAnalyze } from '../../../lib/xbot/xAnalyzer'
import { logPdcaPayload } from '../../../lib/pdca/pdcaHelpers'

export const maxDuration = 60

/**
 * 1日1回 JST 0:30 — cron-job.org から呼ばれる。
 * 蓄積データを Claude Sonnet で分析し、次の投稿生成に使う insights を保存。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!assertCronAuthorized(req, res)) return

  try {
    const result = await runAnalyze()
    await logPdcaPayload('x_analyze', { analyzed: result.analyzed, insights: result.insights.slice(0, 400) }, true)
    return res.status(200).json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logPdcaPayload('x_analyze', { error: msg }, false)
    return res.status(200).json({ error: msg })
  }
}
