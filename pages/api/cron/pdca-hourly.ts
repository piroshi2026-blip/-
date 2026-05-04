import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../lib/pdca/cronGuard'
import { createQuickMarket } from '../../../lib/pdca/quickMarket'

/**
 * JST 9:00〜23:00 毎時実行。createQuickMarket を2回呼んで2問を公開・X投稿。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!assertCronAuthorized(req, res)) return

  const market1 = await createQuickMarket().catch((e: unknown) => ({
    error: e instanceof Error ? e.message : String(e),
  }))

  const market2 = await createQuickMarket().catch((e: unknown) => ({
    error: e instanceof Error ? e.message : String(e),
  }))

  return res.status(200).json({ market1, market2 })
}
