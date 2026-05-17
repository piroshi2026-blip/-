import type { NextApiRequest, NextApiResponse } from 'next'
import { applyPendingSakura } from '../../../lib/pdca/sakuraVote'

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

  const result = await applyPendingSakura(true)
  return res.status(200).json({ ok: true, applied: result.applied })
}
