import { MLB_TOPIC_RE } from './fetchTrends'
import { draftMarketFromTrend } from './draftMarket'
import { postPromotionTweet } from './postX'
import { fetchMarketImage } from './fetchImage'
import {
  buildTweetBody,
  getPublicBaseUrl,
  insertMarket,
  logPdcaPayload,
  resolveNewMarketId,
} from './pdcaHelpers'
import { getServiceSupabase } from './supabaseAdmin'
import { formatWorldContextForPrompt } from './fetchContext'
import { preloadDraftData, type PreloadedDraftData } from './generateDraft'

export type QuickMarketResult = {
  headline: string
  title: string
  category: string
  marketId: number | null
  tweetId: string | null
  tweetError: string | null
}

/**
 * RSS から1件ランダムに選び、問いを生成 → Supabase 公開 → X 投稿までまとめて実行。
 * preloaded を渡すと RSS/worldCtx 取得をスキップできる（pdca-hourly で2並列時に効果的）。
 */
export async function createQuickMarket(preloaded?: PreloadedDraftData): Promise<QuickMarketResult> {
  const { pool, worldCtx, allowedCategories, defaultCategory, sportsDefault } =
    preloaded ?? (await preloadDraftData())
  const worldContext = formatWorldContextForPrompt(worldCtx)

  const item = pool[Math.floor(Math.random() * pool.length)]
  const isMlb = MLB_TOPIC_RE.test(item.title)
  const kind: 'mlb' | 'general' = isMlb ? 'mlb' : 'general'

  let draft = await draftMarketFromTrend(
    item,
    kind === 'mlb' ? sportsDefault : defaultCategory,
    allowedCategories,
    { flavor: kind, worldContext }
  )
  const catOk = allowedCategories.includes(draft.category)
    ? draft.category
    : kind === 'mlb'
      ? sportsDefault
      : defaultCategory
  draft = { ...draft, category: catOk }

  const imageUrl = await fetchMarketImage(draft, kind, item.link).catch(() => null)

  const ins = await insertMarket(draft, imageUrl)
  if (ins.error) throw new Error(ins.error)

  const sb = getServiceSupabase()
  const marketId = await resolveNewMarketId(sb, draft.title)
  const baseUrl = getPublicBaseUrl()
  const body = buildTweetBody(kind, draft.title, baseUrl)

  let tweetId: string | null = null
  let tweetError: string | null = null
  try {
    const { id } = await postPromotionTweet(body)
    tweetId = id
  } catch (e) {
    tweetError = e instanceof Error ? e.message : String(e)
  }

  await logPdcaPayload(
    'pdca_quick',
    { headline: item.title, title: draft.title, kind, marketId, tweetId, tweetError },
    marketId != null
  )

  return {
    headline: item.title,
    title: draft.title,
    category: draft.category,
    marketId,
    tweetId,
    tweetError,
  }
}
