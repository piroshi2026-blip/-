import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../lib/pdca/cronGuard'
import { runPost } from '../../../lib/xbot/xPoster'
import { logPdcaPayload } from '../../../lib/pdca/pdcaHelpers'

export const maxDuration = 60

/**
 * 1日6回投稿（JST 9/12/15/18/21/23時）— cron-job.org から呼ばれる。
 * ?dry=true を付けると X投稿せず生成内容だけ返す（動作確認用）。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!assertCronAuthorized(req, res)) return

  const dryRun = req.query.dry === 'true'
  try {
    const result = await runPost(dryRun)
    await logPdcaPayload('x_post', result, true)
    return res.status(200).json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logPdcaPayload('x_post', { error: msg, dryRun }, false)
    return res.status(200).json({ error: msg })
  }
}
