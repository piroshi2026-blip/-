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

/**
 * タイトルに「YYYY年」が含まれ、かつその年が現在〜1年後の範囲なら
 * 翌年1月30日を判定日とする（例：「2026年までに…」→ 2027-01-30）。
 * それ以外は締切日 + 21日。
 */
function resolveResolutionDate(title: string, endDate: Date): Date {
  const now = new Date()
  const currentYear = now.getFullYear()
  const m = title.match(/(20\d{2})年/)
  if (m) {
    const year = parseInt(m[1])
    if (year >= currentYear && year <= currentYear + 1) {
      return new Date(`${year + 1}-01-30T00:00:00.000Z`)
    }
  }
  const res = new Date(endDate)
  res.setDate(res.getDate() + 21)
  return res
}

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
export async function createQuickMarket(preloaded?: PreloadedDraftData, skipImage = false): Promise<QuickMarketResult> {
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

  const imageUrl = skipImage ? null : await fetchMarketImage(draft, kind, item.link).catch(() => null)

  const ins = await insertMarket(draft, imageUrl)
  if (ins.error) throw new Error(ins.error)

  const sb = getServiceSupabase()

  // タイトルで検索して実際に挿入されたか確認
  const { data: byTitle } = await sb
    .from('markets')
    .select('id')
    .eq('title', draft.title)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const insertOk = byTitle?.id != null
  const marketId = insertOk
    ? Number(byTitle!.id)
    : await resolveNewMarketId(sb, draft.title)

  // source_url / source_title / resolution_date を保存
  if (insertOk && marketId) {
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + draft.endDays)
    const resolutionDate = resolveResolutionDate(draft.title, endDate)
    try {
      await sb.from('markets').update({
        source_url: item.link ?? null,
        source_title: item.title ?? null,
        resolution_date: resolutionDate.toISOString(),
      }).eq('id', marketId)
    } catch { /* ignore */ }
  }

  const baseUrl = getPublicBaseUrl()
  const body = buildTweetBody(kind, draft.title, baseUrl)

  let tweetId: string | null = null
  let tweetError: string | null = null
  if (insertOk) {
    try {
      const { id } = await postPromotionTweet(body)
      tweetId = id
    } catch (e) {
      tweetError = e instanceof Error ? e.message : String(e)
    }
  }

  await logPdcaPayload(
    'pdca_quick',
    { headline: item.title, title: draft.title, kind, marketId, tweetId, tweetError, insertOk },
    insertOk
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
