import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../../lib/pdca/cronGuard'
import { executePdcaSlot } from '../../../../lib/pdca/executeSlot'
import { createQuickMarket } from '../../../../lib/pdca/quickMarket'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!assertCronAuthorized(req, res)) return

  const raw = req.query.slot
  const n = Number(Array.isArray(raw) ? raw[0] : raw)
  if (!Number.isInteger(n) || n < 0 || n > 4) {
    return res.status(400).json({ error: 'slot は 0〜4 のURLで呼び出してください' })
  }

  try {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined

    // 1問目: 計画済みスロット（その日の話題から生成）
    const slotResult = await executePdcaSlot(n, date)

    // 2問目: リアルタイムRSSから別の問いを生成（X投稿も実施）
    let quickResult: Awaited<ReturnType<typeof createQuickMarket>> | { error: string } | null = null
    try {
      quickResult = await createQuickMarket()
    } catch (e) {
      quickResult = { error: e instanceof Error ? e.message : String(e) }
    }

    return res.status(200).json({ slot: slotResult, quick: quickResult })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ error: msg })
  }
}
