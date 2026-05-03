import {
  buildTweetBody,
  getPublicBaseUrl,
  insertMarket,
  isTooSimilar,
  loadCategories,
  logPdcaPayload,
  pickSportsCategory,
  recentTitlesSample,
  resolveNewMarketId,
} from './pdcaHelpers'
import { getServiceSupabase } from './supabaseAdmin'
import {
  buildDailyMlbFallbackItem,
  fetchOhtaniDodgersHeadlines,
  fetchTrendHeadlines,
} from './fetchTrends'
import { draftMarketFromTrend } from './draftMarket'
import { postPromotionTweet } from './postX'

export type PdcaResult = {
  plan: {
    feeds: string[]
    topicTitles: string[]
    mlbTopicTitles: string[]
    mlbFeedsUsed: string[]
  }
  mlb: {
    marketId: number | null
    title: string | null
    duplicateSkipped?: boolean
    usedFallback?: boolean
  }
  general: {
    marketId: number | null
    title: string | null
    duplicateSkipped?: boolean
  }
  check: { tweetIds: string[]; tweetSkipped: { reason: string }[] }
  act: { nextStep: string }
  errors: string[]
}

/** レガシー: MLB1＋一般1を一括。本番の毎日5枠は executePdcaSlot / planDailySlots を使用。 */
export async function runPdcaPipeline(): Promise<PdcaResult> {
  const errors: string[] = []
  const result: PdcaResult = {
    plan: { feeds: [], topicTitles: [], mlbTopicTitles: [], mlbFeedsUsed: [] },
    mlb: { marketId: null, title: null },
    general: { marketId: null, title: null },
    check: { tweetIds: [], tweetSkipped: [] },
    act: { nextStep: '' },
    errors,
  }

  const baseUrl = getPublicBaseUrl()

  try {
    const { names: allowedCategories, defaultCategory } = await loadCategories()
    const sportsDefault = pickSportsCategory(allowedCategories, defaultCategory)
    let recent = await recentTitlesSample()

    const mlbFetch = await fetchOhtaniDodgersHeadlines(30)
    result.plan.mlbFeedsUsed = mlbFetch.feedsUsed
    result.plan.mlbTopicTitles = mlbFetch.items.map((i) => i.title)

    let mlbItem = mlbFetch.items[0] || null
    if (mlbItem) {
      for (const it of mlbFetch.items) {
        if (!isTooSimilar(it.title, recent)) {
          mlbItem = it
          break
        }
      }
    }
    if (mlbItem && isTooSimilar(mlbItem.title, recent)) {
      mlbItem = null
    }
    if (!mlbItem) {
      mlbItem = buildDailyMlbFallbackItem()
      result.mlb.usedFallback = true
    }

    let mlbDraft = await draftMarketFromTrend(mlbItem, sportsDefault, allowedCategories, { flavor: 'mlb' })
    if (!allowedCategories.includes(mlbDraft.category)) {
      mlbDraft = { ...mlbDraft, category: sportsDefault }
    }

    result.mlb.title = mlbDraft.title
    const mlbIns = await insertMarket(mlbDraft)
    if (mlbIns.error) {
      errors.push(`[MLB] 問いの作成に失敗: ${mlbIns.error}`)
      result.mlb.title = null
    } else {
      const sb = getServiceSupabase()
      result.mlb.marketId = await resolveNewMarketId(sb, mlbDraft.title)
      recent = [...recent, mlbDraft.title.toLowerCase()]
    }

    const genFetch = await fetchTrendHeadlines(15)
    result.plan.feeds = genFetch.feedsUsed
    result.plan.topicTitles = genFetch.items.map((i) => i.title)

    if (genFetch.items.length === 0) {
      errors.push('一般トレンドRSSから見出しを取得できませんでした')
    } else {
      let chosen = genFetch.items[0]
      for (const it of genFetch.items) {
        if (!isTooSimilar(it.title, recent)) {
          chosen = it
          break
        }
      }
      if (isTooSimilar(chosen.title, recent)) {
        result.general.duplicateSkipped = true
        result.general.title = chosen.title
        errors.push('[一般] 直近の問いと似た見出しのためスキップしました')
      } else {
        let genDraft = await draftMarketFromTrend(chosen, defaultCategory, allowedCategories, {
          flavor: 'general',
        })
        if (!allowedCategories.includes(genDraft.category)) {
          genDraft = { ...genDraft, category: defaultCategory }
        }
        result.general.title = genDraft.title
        const genIns = await insertMarket(genDraft)
        if (genIns.error) {
          errors.push(`[一般] 問いの作成に失敗: ${genIns.error}`)
          result.general.title = null
        } else {
          const sb = getServiceSupabase()
          result.general.marketId = await resolveNewMarketId(sb, genDraft.title)
        }
      }
    }

    const tweetParts: string[] = []
    if (result.mlb.marketId && result.mlb.title) {
      tweetParts.push(
        `⚾MLB（日本人大リーガー等）「${result.mlb.title.slice(0, 70)}${result.mlb.title.length > 70 ? '…' : ''}」`
      )
    }
    if (result.general.marketId && result.general.title) {
      tweetParts.push(`📰話題「${result.general.title.slice(0, 70)}${result.general.title.length > 70 ? '…' : ''}」`)
    }
    const combined =
      tweetParts.length > 0 ? `本日の予想マーケット\n${tweetParts.join('\n')}` : null

    if (combined) {
      try {
        const { id } = await postPromotionTweet(buildTweetBody(combined, baseUrl))
        result.check.tweetIds.push(id)
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        result.check.tweetSkipped.push({ reason: msg })
        errors.push(`X投稿スキップ: ${msg}`)
      }
    }

    const ok = result.mlb.marketId != null
    result.act.nextStep = ok
      ? result.check.tweetIds.length > 0
        ? '翌日、インプレッションと参加数を確認しRSSや問いの文体を調整する（MLB系は毎日1件入っているか確認）'
        : 'X トークンを設定して告知を自動化。Supabase で問いが2件（MLB+一般）作成されているか確認'
      : 'SUPABASE_SERVICE_ROLE_KEY と create_market_with_options を確認'

    await logPdcaPayload('run_pipeline_legacy', { ...result } as unknown as Record<string, unknown>, ok)
    return result
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    errors.push(msg)
    result.act.nextStep = '.env と pdca_runs / RPC を確認'
    await logPdcaPayload('run_pipeline_legacy', { ...result, error: msg } as unknown as Record<string, unknown>, false)
    return result
  }
}
