import type { NextApiRequest, NextApiResponse } from 'next'
import { runPost } from '../../../lib/xbot/xPoster'
import { logPdcaPayload } from '../../../lib/pdca/pdcaHelpers'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

export const maxDuration = 60

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { adminPassword, title, hint } = req.body as { adminPassword?: string; title?: string; hint?: string }
  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }
  if (!title) {
    return res.status(400).json({ error: 'title が必要です' })
  }

  try {
    const result = await runPost(false, { title, hint })
    await logPdcaPayload('x_post_triggered', result, true)
    return res.status(200).json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logPdcaPayload('x_post_triggered', { error: msg, title }, false)
    return res.status(200).json({ error: msg })
  }
}
