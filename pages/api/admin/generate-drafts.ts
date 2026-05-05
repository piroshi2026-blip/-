import type { NextApiRequest, NextApiResponse } from 'next'
import { generateDraftCandidate } from '../../../lib/pdca/generateDraft'
import { fetchWorldContext } from '../../../lib/pdca/fetchContext'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { adminPassword, count = 5, hint } = req.body as {
    adminPassword?: string
    count?: number
    hint?: string
  }

  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }

  const n = Math.min(10, Math.max(1, Number(count) || 5))
  const hintText = typeof hint === 'string' ? hint.trim().slice(0, 500) : ''

  // コンテキストを1回だけ取得して全候補に使い回す（API節約）
  const worldCtx = await fetchWorldContext()

  const results = await Promise.allSettled(
    Array.from({ length: n }, () => generateDraftCandidate(worldCtx, hintText))
  )

  const candidates = results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : { error: (r as PromiseRejectedResult).reason?.message ?? '生成エラー' }
  )

  return res.status(200).json({ candidates })
}
