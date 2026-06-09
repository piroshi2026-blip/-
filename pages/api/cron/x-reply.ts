import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../lib/pdca/cronGuard'
import { runReply } from '../../../lib/xbot/xReplier'
import { logPdcaPayload } from '../../../lib/pdca/pdcaHelpers'

export const maxDuration = 30

/**
 * 1日5回（10/12/15/18/20時 JST）— 他アカウントの投稿に自然にリプライ。
 * 1回につき1件。1日合計5件上限。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!assertCronAuthorized(req, res)) return

  try {
    const result = await runReply()
    // replied=false でもスキップは正常動作。エラーがない限り ok=true
    await logPdcaPayload('x_reply', result as unknown as Record<string, unknown>, !('error' in result))
    return res.status(200).json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logPdcaPayload('x_reply', { error: msg }, false)
    return res.status(200).json({ error: msg })
  }
}
