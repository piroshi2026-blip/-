import { getServiceSupabase } from './supabaseAdmin'
import {
  buildDailyMlbFallbackItem,
  fetchOhtaniDodgersHeadlines,
  fetchTrendHeadlines,
  type TrendItem,
} from './fetchTrends'
import { isTooSimilar, jstDateString, recentTitlesSample, logPdcaPayload } from './pdcaHelpers'

export type SlotFlavor = 'mlb' | 'general'

export type PlannedSlot = {
  slot_index: number
  flavor: SlotFlavor
  trend_json: TrendItem
}

/**
 * ①調査: 当日（JST）の5枠（slot 0=MLB必須、1〜4=一般）に使う見出しを確保して DB に保存。
 */
export async function planDailySlots(planDate?: string): Promise<{
  plan_date: string
  slots: PlannedSlot[]
  warning?: string
}> {
  const plan_date = planDate || jstDateString()
  const recent = await recentTitlesSample()
  const slots: PlannedSlot[] = []

  const mlbFetch = await fetchOhtaniDodgersHeadlines(35)
  let mlbItem: TrendItem | null = mlbFetch.items[0] || null
  if (mlbItem) {
    for (const it of mlbFetch.items) {
      if (!isTooSimilar(it.title, recent)) {
        mlbItem = it
        break
      }
    }
  }
  if (mlbItem && isTooSimilar(mlbItem.title, recent)) mlbItem = null
  if (!mlbItem) mlbItem = buildDailyMlbFallbackItem()

  slots.push({ slot_index: 0, flavor: 'mlb', trend_json: mlbItem })

  const genFetch = await fetchTrendHeadlines(45)
  const usedTitles = new Set<string>([mlbItem.title.toLowerCase()])
  let pool = [...genFetch.items]

  for (let si = 1; si <= 4; si++) {
    let chosen: TrendItem | null = null
    for (const it of pool) {
      const combinedRecent = [...recent, ...Array.from(usedTitles)]
      if (!isTooSimilar(it.title, combinedRecent)) {
        chosen = it
        usedTitles.add(it.title.toLowerCase())
        break
      }
    }
    if (!chosen && pool.length > 0) {
      chosen = pool[0]
      usedTitles.add(chosen.title.toLowerCase())
    }
    if (!chosen) {
      chosen = {
        title: `${plan_date}時点の話題から予想する「今日のホットトピック」その${si}`,
        source: 'pdca-general-fallback',
      }
    }
    pool = pool.filter((p) => p.title !== chosen!.title)
    slots.push({ slot_index: si, flavor: 'general', trend_json: chosen })
  }

  try {
    const sb = getServiceSupabase()
    await sb.from('pdca_daily_slots').delete().eq('plan_date', plan_date)
    const rows = slots.map((s) => ({
      plan_date,
      slot_index: s.slot_index,
      flavor: s.flavor,
      trend_json: s.trend_json as unknown as Record<string, unknown>,
      executed_at: null,
      market_id: null,
      tweet_id: null,
      error: null,
    }))
    const { error } = await sb.from('pdca_daily_slots').insert(rows)
    if (error) throw error
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    await logPdcaPayload(
      'plan_daily_slots_db_skip',
      { plan_date, slots, error: msg },
      false
    )
    return {
      plan_date,
      slots,
      warning:
        'pdca_daily_slots テーブルが未作成のためメモリ上のみ計画しました。supabase/sql/pdca_daily_slots.sql を実行してください。',
    }
  }

  await logPdcaPayload('plan_daily_slots', { plan_date, slot_count: slots.length }, true)
  return { plan_date, slots }
}

/** 欠けた枠だけ埋める（他スロットの行は削除しない） */
export async function upsertSingleMissingSlot(
  plan_date: string,
  slotIndex: number
): Promise<PlannedSlot | null> {
  const recent = await recentTitlesSample()
  const sb = getServiceSupabase()

  let existingTitles: string[] = []
  try {
    const { data: rows } = await sb
      .from('pdca_daily_slots')
      .select('trend_json')
      .eq('plan_date', plan_date)
    existingTitles = (rows || []).map((r: { trend_json: { title?: string } }) =>
      (r.trend_json?.title || '').toLowerCase()
    )
  } catch {
    /* noop */
  }

  let planned: PlannedSlot

  if (slotIndex === 0) {
    const mlbFetch = await fetchOhtaniDodgersHeadlines(25)
    let mlbItem: TrendItem | null = mlbFetch.items[0] || null
    if (mlbItem) {
      for (const it of mlbFetch.items) {
        if (!isTooSimilar(it.title, [...recent, ...existingTitles])) {
          mlbItem = it
          break
        }
      }
    }
    if (mlbItem && isTooSimilar(mlbItem.title, [...recent, ...existingTitles])) mlbItem = null
    if (!mlbItem) mlbItem = buildDailyMlbFallbackItem()
    planned = { slot_index: 0, flavor: 'mlb', trend_json: mlbItem }
  } else {
    const genFetch = await fetchTrendHeadlines(40)
    let chosen: TrendItem | null = null
    for (const it of genFetch.items) {
      if (!isTooSimilar(it.title, [...recent, ...existingTitles])) {
        chosen = it
        break
      }
    }
    if (!chosen && genFetch.items[0]) chosen = genFetch.items[0]
    if (!chosen) {
      chosen = {
        title: `${plan_date}の話題ベース（枠${slotIndex + 1}/5）`,
        source: 'pdca-single-fallback',
      }
    }
    planned = { slot_index: slotIndex, flavor: 'general', trend_json: chosen }
  }

  try {
    const { error } = await sb.from('pdca_daily_slots').upsert(
      {
        plan_date,
        slot_index: slotIndex,
        flavor: planned.flavor,
        trend_json: planned.trend_json as unknown as Record<string, unknown>,
        executed_at: null,
        market_id: null,
        tweet_id: null,
        error: null,
      },
      { onConflict: 'plan_date,slot_index' }
    )
    if (error) throw error
  } catch {
    return planned
  }

  return planned
}
