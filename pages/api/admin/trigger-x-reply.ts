import type { NextApiRequest, NextApiResponse } from 'next'
import { runReply } from '../../../lib/xbot/xReplier'
import { logPdcaPayload } from '../../../lib/pdca/pdcaHelpers'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

export const maxDuration = 30

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { adminPassword } = req.body as { adminPassword?: string }
  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  try {
    const result = await runReply()
    await logPdcaPayload('x_reply', result as unknown as Record<string, unknown>, result.replied)
    return res.status(200).json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logPdcaPayload('x_reply', { error: msg }, false)
    return res.status(200).json({ error: msg })
  }
}
