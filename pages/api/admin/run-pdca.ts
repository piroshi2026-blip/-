import type { NextApiRequest, NextApiResponse } from 'next'
import { executePdcaSlot } from '../../../lib/pdca/executeSlot'
import { createQuickMarket } from '../../../lib/pdca/quickMarket'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { adminPassword, slot, date, mode } = req.body as {
    adminPassword?: string
    slot?: unknown
    date?: string
    mode?: string
  }

  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }

  try {
    if (mode === 'quick' || mode === 'hourly') {
      const { preloadDraftData } = await import('../../../lib/pdca/generateDraft')
      const preloaded = await preloadDraftData()
      if (mode === 'quick') {
        const result = await createQuickMarket(preloaded, true)
        return res.status(200).json(result)
      }
      const [r1, r2] = await Promise.allSettled([
        createQuickMarket(preloaded, true),
        createQuickMarket(preloaded, true),
      ])
      return res.status(200).json({
        market1: r1.status === 'fulfilled' ? r1.value : { error: (r1 as PromiseRejectedResult).reason?.message },
        market2: r2.status === 'fulfilled' ? r2.value : { error: (r2 as PromiseRejectedResult).reason?.message },
      })
    }

    const n = Number(slot)
    if (!Number.isInteger(n) || n < 0 || n > 4) {
      return res.status(400).json({ error: 'slot は 0〜4 を指定してください' })
    }
    const result = await executePdcaSlot(n, date)
    return res.status(200).json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ error: msg })
  }
}
