import { fetchTrendHeadlines, fetchOhtaniDodgersHeadlines, MLB_TOPIC_RE, buildDailyMlbFallbackItem } from './fetchTrends'
import { draftMarketFromTrend, type DraftMarket } from './draftMarket'
import { fetchMarketImage } from './fetchImage'
import { loadCategories, pickSportsCategory } from './pdcaHelpers'
import { fetchWorldContext, formatWorldContextForPrompt, type WorldContext } from './fetchContext'

export type DraftCandidate = {
  draft: DraftMarket
  headline: string
  kind: 'mlb' | 'general'
  imageUrl: string | null
}

export async function generateDraftCandidate(
  preloadedContext?: WorldContext,
  hint?: string
): Promise<DraftCandidate> {
  const [genResult, mlbResult, worldCtx] = await Promise.all([
    fetchTrendHeadlines(20),
    fetchOhtaniDodgersHeadlines(10),
    preloadedContext ? Promise.resolve(preloadedContext) : fetchWorldContext(),
  ])

  const worldContext = formatWorldContextForPrompt(worldCtx)

  const pool = [...mlbResult.items.slice(0, 3), ...genResult.items].slice(0, 12)
  if (!pool.length) pool.push(buildDailyMlbFallbackItem())

  const item = pool[Math.floor(Math.random() * pool.length)]
  const isMlb = MLB_TOPIC_RE.test(item.title)
  const kind: 'mlb' | 'general' = isMlb ? 'mlb' : 'general'

  const { names: allowedCategories, defaultCategory } = await loadCategories()
  const sportsDefault = pickSportsCategory(allowedCategories, defaultCategory)

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

  const imageUrl = await fetchMarketImage(draft, kind, item.link)

  return { draft, headline: item.title, kind, imageUrl }
}
