import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../lib/pdca/cronGuard'
import { applyPendingSakura } from '../../../lib/pdca/sakuraVote'

export const maxDuration = 30

/**
 * 投票未発生の問いに遅延付きサクラ投票を適用する。
 * cron-job.org で10分毎に実行推奨。
 * pdca-hourly からも毎時呼ばれるのでフォールバックあり。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!assertCronAuthorized(req, res)) return

  const result = await applyPendingSakura()
  return res.status(200).json(result)
}
