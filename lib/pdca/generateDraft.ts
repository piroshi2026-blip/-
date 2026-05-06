import { fetchTrendHeadlines, fetchOhtaniDodgersHeadlines, fetchTechAiHeadlines, fetchScienceCultureHeadlines, MLB_TOPIC_RE, buildDailyMlbFallbackItem, type TrendItem } from './fetchTrends'
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
  sourceSnippet: string | null
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
  const [worldCtx, genResult, mlbResult, techResult, sciResult, catData] = await Promise.all([
    fetchWorldContext(),
    fetchTrendHeadlines(20),
    fetchOhtaniDodgersHeadlines(10),
    fetchTechAiHeadlines(10),
    fetchScienceCultureHeadlines(8),
    loadCategories(),
  ])

  // 多様なソースから合成: MLB(3) + テック/AI(8) + 科学/文化(5) + 一般ニュース(16)
  const combined = [
    ...mlbResult.items.slice(0, 3),
    ...techResult.items.slice(0, 8),
    ...sciResult.items.slice(0, 5),
    ...genResult.items.slice(0, 16),
  ]
  // 重複タイトルを除去（先頭15文字で判定）
  const seen = new Set<string>()
  const pool: TrendItem[] = []
  for (const item of combined) {
    const key = item.title.slice(0, 15).toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    pool.push(item)
  }
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
  skipImage?: boolean,
  forcedItem?: TrendItem,
): Promise<DraftCandidate> {
  let pool: TrendItem[]
  let worldCtx: WorldContext
  let allowedCategories: string[]
  let defaultCategory: string
  let sportsDefault: string

  if (preloaded) {
    ;({ pool, worldCtx, allowedCategories, defaultCategory, sportsDefault } = preloaded)
  } else {
    const [genResult, mlbResult, techResult, sciResult, ctx] = await Promise.all([
      fetchTrendHeadlines(20),
      fetchOhtaniDodgersHeadlines(10),
      fetchTechAiHeadlines(10),
      fetchScienceCultureHeadlines(8),
      preloadedContext ? Promise.resolve(preloadedContext) : fetchWorldContext(),
    ])
    worldCtx = ctx
    const combined = [
      ...mlbResult.items.slice(0, 3),
      ...techResult.items.slice(0, 8),
      ...sciResult.items.slice(0, 5),
      ...genResult.items.slice(0, 16),
    ]
    const seen2 = new Set<string>()
    pool = []
    for (const it of combined) {
      const k = it.title.slice(0, 15).toLowerCase()
      if (seen2.has(k)) continue
      seen2.add(k)
      pool.push(it)
    }
    if (!pool.length) pool.push(buildDailyMlbFallbackItem())
    const catData = await loadCategories()
    allowedCategories = catData.names
    defaultCategory = catData.defaultCategory
    sportsDefault = pickSportsCategory(allowedCategories, catData.defaultCategory)
  }

  const worldContext = formatWorldContextForPrompt(worldCtx)

  const item = forcedItem ?? pool[Math.floor(Math.random() * pool.length)]
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

  return { draft, headline: item.title, kind, imageUrl, sourceLink: item.link ?? null, sourceSnippet: item.snippet ?? null }
}
