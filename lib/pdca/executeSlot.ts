import { getServiceSupabase } from './supabaseAdmin'
import type { TrendItem } from './fetchTrends'
import { draftMarketFromTrend } from './draftMarket'
import { postPromotionTweet } from './postX'
import type { PlannedSlot, SlotFlavor } from './planDailySlots'
import { planDailySlots, upsertSingleMissingSlot } from './planDailySlots'
import {
  buildTweetBody,
  getPublicBaseUrl,
  insertMarket,
  jstDateString,
  loadCategories,
  logPdcaPayload,
  pickSportsCategory,
  resolveNewMarketId,
} from './pdcaHelpers'

/**
 * ②問い作成 → ③ヨソるで公開（RPC）→ ④X公式で宣伝（1枠あたり1投稿）
 */
export async function executePdcaSlot(
  slotIndex: number,
  planDate?: string
): Promise<{
  plan_date: string
  slot: number
  marketId: number | null
  title: string | null
  tweetId: string | null
  tweetError: string | null
  errors: string[]
  skipped?: boolean
  skipReason?: string
}> {
  const errors: string[] = []
  const plan_date = planDate || jstDateString()
  const baseUrl = getPublicBaseUrl()

  if (slotIndex < 0 || slotIndex > 4) {
    errors.push('slot は 0〜4 です')
    return { plan_date, slot: slotIndex, marketId: null, title: null, tweetId: null, tweetError: null, errors }
  }

  try {
    const sb = getServiceSupabase()
    const { data: existing } = await sb
      .from('pdca_daily_slots')
      .select('executed_at, market_id, tweet_id, flavor, trend_json')
      .eq('plan_date', plan_date)
      .eq('slot_index', slotIndex)
      .maybeSingle()

    if (existing?.executed_at) {
      return {
        plan_date,
        slot: slotIndex,
        marketId: existing.market_id != null ? Number(existing.market_id) : null,
        title: null,
        tweetId: existing.tweet_id,
        tweetError: null,
        errors: [],
        skipped: true,
        skipReason: 'この枠は既に実行済みです',
      }
    }

    let planned: PlannedSlot | null = null
    if (existing?.trend_json && !existing.executed_at) {
      planned = {
        slot_index: slotIndex,
        flavor: existing.flavor as SlotFlavor,
        trend_json: existing.trend_json as TrendItem,
      }
    }

    if (!planned) {
      const { count, error: cntErr } = await sb
        .from('pdca_daily_slots')
        .select('*', { count: 'exact', head: true })
        .eq('plan_date', plan_date)

      if (!cntErr && (count ?? 0) === 0) {
        const planResult = await planDailySlots(plan_date)
        // DB保存が失敗してもインメモリの計画を優先して使う
        const inMemory = planResult.slots.find((s) => s.slot_index === slotIndex)
        if (inMemory) {
          planned = inMemory
        } else {
          const { data: row } = await sb
            .from('pdca_daily_slots')
            .select('flavor, trend_json')
            .eq('plan_date', plan_date)
            .eq('slot_index', slotIndex)
            .maybeSingle()
          if (row?.trend_json) {
            planned = {
              slot_index: slotIndex,
              flavor: row.flavor as SlotFlavor,
              trend_json: row.trend_json as TrendItem,
            }
          }
        }
      } else {
        planned = await upsertSingleMissingSlot(plan_date, slotIndex)
      }
    }

    if (!planned) {
      errors.push('この枠の計画データを取得できませんでした')
      return { plan_date, slot: slotIndex, marketId: null, title: null, tweetId: null, tweetError: null, errors }
    }

    const { names: allowedCategories, defaultCategory } = await loadCategories()
    const sportsDefault = pickSportsCategory(allowedCategories, defaultCategory)
    const item = planned.trend_json

    let draft = await draftMarketFromTrend(
      item,
      planned.flavor === 'mlb' ? sportsDefault : defaultCategory,
      allowedCategories,
      { flavor: planned.flavor === 'mlb' ? 'mlb' : 'general' }
    )
    const catOk =
      planned.flavor === 'mlb'
        ? allowedCategories.includes(draft.category)
          ? draft.category
          : sportsDefault
        : allowedCategories.includes(draft.category)
          ? draft.category
          : defaultCategory
    draft = { ...draft, category: catOk }

    const ins = await insertMarket(draft)
    if (ins.error) {
      errors.push(ins.error)
      await updateSlotError(plan_date, slotIndex, ins.error)
      await logPdcaPayload('execute_slot', { plan_date, slotIndex, error: ins.error }, false)
      return {
        plan_date,
        slot: slotIndex,
        marketId: null,
        title: draft.title,
        tweetId: null,
        tweetError: null,
        errors,
      }
    }

    const marketId = await resolveNewMarketId(sb, draft.title)

    const body = buildTweetBody(
      planned.flavor === 'mlb' ? 'mlb' : 'general',
      draft.title,
      baseUrl
    )

    let tweetId: string | null = null
    let tweetError: string | null = null
    try {
      const { id } = await postPromotionTweet(body)
      tweetId = id
    } catch (e) {
      tweetError = e instanceof Error ? e.message : String(e)
      errors.push(`X: ${tweetError}`)
    }

    await finalizeSlot(plan_date, slotIndex, marketId, tweetId, tweetError)
    await logPdcaPayload(
      'execute_slot',
      { plan_date, slotIndex, marketId, title: draft.title, tweetId, tweetError },
      marketId != null
    )

    return {
      plan_date,
      slot: slotIndex,
      marketId,
      title: draft.title,
      tweetId,
      tweetError,
      errors,
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    errors.push(msg)
    return { plan_date, slot: slotIndex, marketId: null, title: null, tweetId: null, tweetError: null, errors }
  }
}

async function updateSlotError(plan_date: string, slotIndex: number, err: string) {
  try {
    const sb = getServiceSupabase()
    await sb
      .from('pdca_daily_slots')
      .update({ error: err })
      .eq('plan_date', plan_date)
      .eq('slot_index', slotIndex)
  } catch {
    /* noop */
  }
}

async function finalizeSlot(
  plan_date: string,
  slotIndex: number,
  marketId: number | null,
  tweetId: string | null,
  tweetError: string | null
) {
  try {
    const sb = getServiceSupabase()
    await sb
      .from('pdca_daily_slots')
      .update({
        executed_at: new Date().toISOString(),
        market_id: marketId,
        tweet_id: tweetId,
        error: tweetError,
      })
      .eq('plan_date', plan_date)
      .eq('slot_index', slotIndex)
  } catch {
    /* noop */
  }
}
