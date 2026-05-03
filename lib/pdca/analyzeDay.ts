import { getServiceSupabase } from './supabaseAdmin'
import { jstYesterdayString, logPdcaPayload } from './pdcaHelpers'

/**
 * ⑤前日 JST のスロット実行結果を集計し、改善メモをログに残す（APIが無い場合は件数のみ）。
 */
export async function analyzePdcaPreviousDay(): Promise<{
  summary_date: string
  slots_total: number
  markets_created: number
  tweets_sent: number
  failures: number
  suggestion: string
}> {
  const summary_date = jstYesterdayString()
  let slots_total = 0
  let markets_created = 0
  let tweets_sent = 0
  let failures = 0

  try {
    const sb = getServiceSupabase()
    const { data } = await sb
      .from('pdca_daily_slots')
      .select('market_id, tweet_id, error')
      .eq('plan_date', summary_date)

    const rows = data || []
    slots_total = rows.length
    for (const r of rows) {
      if (r.market_id) markets_created++
      if (r.tweet_id) tweets_sent++
      if (r.error) failures++
    }
  } catch {
    /* no table */
  }

  const suggestion =
    markets_created >= 4 && tweets_sent >= 4
      ? '投稿・公開は安定。問いの長さやカテゴリを曜日別に振り返り、参加率が低い枠のRSSを見直すとよいです。'
      : markets_created < 3
        ? '問い作成の失敗が目立ちます。Supabase RPC・カテゴリ名・SERVICE_ROLE_KEY を確認してください。'
        : tweets_sent < 3
          ? 'X 投稿が不足しています。TWITTER_* トークンと API の Read/Write を確認してください。'
          : '一部スロットのみ未達の可能性。pdca_daily_slots と CRON の時刻（JST）を確認してください。'

  const payload = {
    summary_date,
    slots_total,
    markets_created,
    tweets_sent,
    failures,
    suggestion,
  }
  await logPdcaPayload('analyze_previous_day', payload, failures === 0)

  return { ...payload, suggestion }
}
