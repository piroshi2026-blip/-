import { fetchTrendHeadlines, fetchOhtaniDodgersHeadlines, MLB_TOPIC_RE, buildDailyMlbFallbackItem, type TrendItem } from './fetchTrends'
import { draftMarketFromTrend, type DraftMarket } from './draftMarket'
import { fetchMarketImage } from './fetchImage'
import { loadCategories, pickSportsCategory } from './pdcaHelpers'
import { fetchWorldContext, formatWorldContextForPrompt, type WorldContext } from './fetchContext'

export type DraftCandidate = {
  draft: DraftMarket
  headline: string
  kind: 'mlb' | 'general'
  imageUrl: string | null
  sourceLink: string | null
}

export type PreloadedDraftData = {
  worldCtx: WorldContext
  pool: TrendItem[]
  allowedCategories: string[]
  defaultCategory: string
  sportsDefault: string
}

/** worldCtx・トレンドプール・カテゴリを一括プリロード（generate-drafts で1回だけ呼ぶ）*/
export async function preloadDraftData(hint?: string): Promise<PreloadedDraftData> {
  void hint
  const [worldCtx, genResult, mlbResult, catData] = await Promise.all([
    fetchWorldContext(),
    fetchTrendHeadlines(20),
    fetchOhtaniDodgersHeadlines(10),
    loadCategories(),
  ])

  const pool = [...mlbResult.items.slice(0, 3), ...genResult.items].slice(0, 12)
  if (!pool.length) pool.push(buildDailyMlbFallbackItem())

  const { names: allowedCategories, defaultCategory } = catData
  const sportsDefault = pickSportsCategory(allowedCategories, defaultCategory)

  return { worldCtx, pool, allowedCategories, defaultCategory, sportsDefault }
}

/** プリロード済みデータから1候補を生成（Claude API呼び出しのみ）*/
export async function generateDraftCandidate(
  preloadedContext?: WorldContext,
  hint?: string,
  preloaded?: PreloadedDraftData,
  skipImage?: boolean
): Promise<DraftCandidate> {
  let pool: TrendItem[]
  let worldCtx: WorldContext
  let allowedCategories: string[]
  let defaultCategory: string
  let sportsDefault: string

  if (preloaded) {
    ;({ pool, worldCtx, allowedCategories, defaultCategory, sportsDefault } = preloaded)
  } else {
    const [genResult, mlbResult, ctx] = await Promise.all([
      fetchTrendHeadlines(20),
      fetchOhtaniDodgersHeadlines(10),
      preloadedContext ? Promise.resolve(preloadedContext) : fetchWorldContext(),
    ])
    worldCtx = ctx
    pool = [...mlbResult.items.slice(0, 3), ...genResult.items].slice(0, 12)
    if (!pool.length) pool.push(buildDailyMlbFallbackItem())
    const catData = await loadCategories()
    allowedCategories = catData.names
    defaultCategory = catData.defaultCategory
    sportsDefault = pickSportsCategory(allowedCategories, defaultCategory)
  }

  const worldContext = formatWorldContextForPrompt(worldCtx)

  const item = pool[Math.floor(Math.random() * pool.length)]
  const isMlb = MLB_TOPIC_RE.test(item.title)
  const kind: 'mlb' | 'general' = isMlb ? 'mlb' : 'general'

  let draft = await draftMarketFromTrend(
    item,
    kind === 'mlb' ? sportsDefault : defaultCategory,
    allowedCategories,
    { flavor: kind, worldContext, hint }
  )
  const catOk = allowedCategories.includes(draft.category)
    ? draft.category
    : kind === 'mlb'
      ? sportsDefault
      : defaultCategory
  draft = { ...draft, category: catOk }

  const imageUrl = skipImage ? null : await fetchMarketImage(draft, kind, item.link)

  return { draft, headline: item.title, kind, imageUrl, sourceLink: item.link ?? null }
}
