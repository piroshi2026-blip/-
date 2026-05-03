import { fetchTrendHeadlines, fetchOhtaniDodgersHeadlines, MLB_TOPIC_RE } from './fetchTrends'
import { draftMarketFromTrend } from './draftMarket'
import { postPromotionTweet } from './postX'
import {
  buildTweetBody,
  getPublicBaseUrl,
  insertMarket,
  loadCategories,
  logPdcaPayload,
  pickSportsCategory,
  resolveNewMarketId,
} from './pdcaHelpers'
import { getServiceSupabase } from './supabaseAdmin'

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
 * pdca_daily_slots のスロット管理を介さないため、いつでも何度でも呼べる。
 */
export async function createQuickMarket(): Promise<QuickMarketResult> {
  const [genResult, mlbResult] = await Promise.all([
    fetchTrendHeadlines(20),
    fetchOhtaniDodgersHeadlines(10),
  ])

  // MLB を先頭に混ぜつつ、上位8件からランダムに1件選ぶ（毎回異なる問いに）
  const pool = [...mlbResult.items.slice(0, 3), ...genResult.items].slice(0, 8)
  if (!pool.length) throw new Error('ニュースが取得できませんでした')

  const item = pool[Math.floor(Math.random() * pool.length)]
  const isMlb = MLB_TOPIC_RE.test(item.title)
  const kind: 'mlb' | 'general' = isMlb ? 'mlb' : 'general'

  const { names: allowedCategories, defaultCategory } = await loadCategories()
  const sportsDefault = pickSportsCategory(allowedCategories, defaultCategory)

  let draft = await draftMarketFromTrend(
    item,
    kind === 'mlb' ? sportsDefault : defaultCategory,
    allowedCategories,
    { flavor: kind }
  )
  const catOk = allowedCategories.includes(draft.category)
    ? draft.category
    : kind === 'mlb'
      ? sportsDefault
      : defaultCategory
  draft = { ...draft, category: catOk }

  const ins = await insertMarket(draft)
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
