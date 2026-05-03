import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../lib/pdca/cronGuard'
import { planDailySlots } from '../../../lib/pdca/planDailySlots'

/** ①調査 → 当日5枠の種を保存（JST 8時台推奨・UTC 23時） */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!assertCronAuthorized(req, res)) return

  try {
    const date = typeof req.query.date === 'string' ? req.query.date : undefined
    const result = await planDailySlots(date)
    return res.status(200).json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ error: msg })
  }
}
