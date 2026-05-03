import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../../lib/pdca/cronGuard'
import { executePdcaSlot } from '../../../../lib/pdca/executeSlot'

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
    const result = await executePdcaSlot(n, date)
    return res.status(200).json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ error: msg })
  }
}
