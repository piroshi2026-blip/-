import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../lib/pdca/cronGuard'
import { createQuickMarket, type QuickMarketResult } from '../../../lib/pdca/quickMarket'
import { preloadDraftData } from '../../../lib/pdca/generateDraft'
import { isAutoPostEnabled } from '../../../lib/pdca/postX'
import { logPdcaPayload } from '../../../lib/pdca/pdcaHelpers'

export const maxDuration = 60

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

  const xEnabled = isAutoPostEnabled()

  let preloaded: Awaited<ReturnType<typeof preloadDraftData>>
  try {
    preloaded = await preloadDraftData()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logPdcaPayload('pdca_hourly', { stage: 'preload', error: msg, xAutoPostEnabled: xEnabled }, false)
    return res.status(200).json({ error: msg, stage: 'preload', xAutoPostEnabled: xEnabled })
  }

  const [r1, r2] = await Promise.allSettled([
    createQuickMarket(preloaded, true),
    createQuickMarket(preloaded, true),
  ])

  const toResult = (r: PromiseSettledResult<QuickMarketResult>) =>
    r.status === 'fulfilled'
      ? r.value
      : { error: (r.reason as Error)?.message ?? String(r.reason) }

  const market1 = toResult(r1)
  const market2 = toResult(r2)
  const ok = !(market1 as any).error && !(market2 as any).error

  await logPdcaPayload('pdca_hourly', { market1, market2, xAutoPostEnabled: xEnabled }, ok)

  return res.status(200).json({ market1, market2, xAutoPostEnabled: xEnabled })
}
