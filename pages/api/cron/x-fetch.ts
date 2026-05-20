import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../lib/pdca/cronGuard'
import { runFetch } from '../../../lib/xbot/xFetcher'
import { logPdcaPayload } from '../../../lib/pdca/pdcaHelpers'

export const maxDuration = 30

/**
 * 毎時:10 に実行 — cron-job.org から呼ばれる。
 * 投稿から2〜24時間経過していてエンゲージメント未取得のツイートを自動処理。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!assertCronAuthorized(req, res)) return

  try {
    const result = await runFetch()
    await logPdcaPayload('x_fetch', result, true)
    return res.status(200).json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logPdcaPayload('x_fetch', { error: msg }, false)
    return res.status(200).json({ error: msg })
  }
}
