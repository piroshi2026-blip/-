import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../lib/pdca/cronGuard'
import { createQuickMarket } from '../../../lib/pdca/quickMarket'

/** テスト用：スロット管理なしで毎回新しい問いを生成・公開・X 投稿する。 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!assertCronAuthorized(req, res)) return

  try {
    const result = await createQuickMarket()
    return res.status(200).json(result)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return res.status(500).json({ error: msg })
  }
}
