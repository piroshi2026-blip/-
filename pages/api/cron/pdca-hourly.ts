import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../lib/pdca/cronGuard'
import { createQuickMarket, type QuickMarketResult } from '../../../lib/pdca/quickMarket'
import { preloadDraftData } from '../../../lib/pdca/generateDraft'

/**
 * JST 9:00〜23:00 毎時実行（cron-job.org から呼ばれる）。
 * RSS/worldCtx を1回プリロードし、2問を並列生成・公開・X投稿。
 * 画像はタイムアウト防止のためスキップ（後で batch-add-images で補完）。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!assertCronAuthorized(req, res)) return

  const preloaded = await preloadDraftData()

  const [r1, r2] = await Promise.allSettled([
    createQuickMarket(preloaded, true),   // skipImage=true で10秒以内に収める
    createQuickMarket(preloaded, true),
  ])

  const toResult = (r: PromiseSettledResult<QuickMarketResult>) =>
    r.status === 'fulfilled'
      ? r.value
      : { error: (r.reason as Error)?.message ?? String(r.reason) }

  return res.status(200).json({ market1: toResult(r1), market2: toResult(r2) })
}
