import type { NextApiRequest, NextApiResponse } from 'next'
import { generateDraftCandidate } from '../../../lib/pdca/generateDraft'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { adminPassword, count = 5 } = req.body as { adminPassword?: string; count?: number }

  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }

  const n = Math.min(10, Math.max(1, Number(count) || 5))

  const results = await Promise.allSettled(
    Array.from({ length: n }, () => generateDraftCandidate())
  )

  const candidates = results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : { error: (r as PromiseRejectedResult).reason?.message ?? '生成エラー' }
  )

  return res.status(200).json({ candidates })
}
