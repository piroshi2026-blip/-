import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../lib/pdca/cronGuard'
import { createQuickMarket, type QuickMarketResult } from '../../../lib/pdca/quickMarket'
import { preloadDraftData } from '../../../lib/pdca/generateDraft'
import { isAutoPostEnabled } from '../../../lib/pdca/postX'
import { logPdcaPayload } from '../../../lib/pdca/pdcaHelpers'
import { applyPendingSakura } from '../../../lib/pdca/sakuraVote'

export const maxDuration = 60

/**
 * JST 9/12/15/18/21時 実行（cron-job.org から呼ばれる）。
 * RSS/worldCtx を1回プリロードし、1問を生成・公開・X投稿。
 * 画像はタイムアウト防止のためスキップ（後で batch-add-images で補完）。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  await logPdcaPayload('pdca_hourly_start', { stage: 'auth_check' }, true)
  if (!assertCronAuthorized(req, res)) {
    await logPdcaPayload('pdca_hourly_start', { stage: 'auth_failed' }, false)
    return
  }

  const xEnabled = isAutoPostEnabled()
  await logPdcaPayload('pdca_hourly_start', { stage: 'start', xAutoPostEnabled: xEnabled }, true)

  let preloaded: Awaited<ReturnType<typeof preloadDraftData>>
  try {
    preloaded = await preloadDraftData()
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logPdcaPayload('pdca_hourly', { stage: 'preload', error: msg, xAutoPostEnabled: xEnabled }, false)
    return res.status(200).json({ error: msg, stage: 'preload', xAutoPostEnabled: xEnabled })
  }

  await logPdcaPayload('pdca_hourly_start', { stage: 'preloaded' }, true)

  // 市場生成とサクラチェックを並列実行
  const [r1, r2] = await Promise.allSettled([
    createQuickMarket(preloaded, false),
    applyPendingSakura(),
  ])

  const market = r1.status === 'fulfilled'
    ? r1.value
    : { error: (r1.reason as Error)?.message ?? String(r1.reason) }
  const ok = !(market as any).error
  const sakuraApplied = r2.status === 'fulfilled' ? r2.value.applied : 0

  await logPdcaPayload('pdca_hourly', { market, xAutoPostEnabled: xEnabled, sakuraApplied }, ok)

  return res.status(200).json({ market, xAutoPostEnabled: xEnabled, sakuraApplied })
}
