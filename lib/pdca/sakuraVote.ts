import { getServiceSupabase } from './supabaseAdmin'

export async function applySakura(marketId: number, totalAmount = 150): Promise<void> {
  const sb = getServiceSupabase()

  const { data: options, error } = await sb
    .from('market_options')
    .select('id, name, pool')
    .eq('market_id', marketId)
    .order('id', { ascending: true })

  if (error || !options || options.length === 0) return

  const n = options.length
  const weights: number[] = []
  let totalWeight = 0
  for (let i = 0; i < n; i++) {
    const w = (n - i) + Math.random() * 2
    weights.push(w)
    totalWeight += w
  }
  const maxIdx = weights.indexOf(Math.max(...weights))
  weights[maxIdx] *= 1.5
  totalWeight = weights.reduce((s, w) => s + w, 0)

  let remaining = totalAmount
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1
    const share = isLast ? remaining : Math.max(5, Math.round((weights[i] / totalWeight) * totalAmount))
    const jitter = isLast ? 0 : Math.floor(Math.random() * 6) - 3
    const amount = Math.max(5, Math.min(remaining, share + jitter))
    remaining -= amount
    await sb.from('market_options').update({ pool: (options[i].pool || 0) + amount }).eq('id', options[i].id)
  }

  const totalAdded = totalAmount - remaining
  const { data: market } = await sb.from('markets').select('total_pool').eq('id', marketId).single()
  await sb.from('markets').update({ total_pool: (market?.total_pool || 0) + totalAdded }).eq('id', marketId)
}

/**
 * 投票未発生の問いに対して遅延付きサクラ投票を適用する。
 * - 各市場IDから30〜89分の擬似ランダム遅延を算出
 * - 作成から遅延時刻を過ぎていれば適用
 * - 作成から90分以上経過している場合は即時適用（キャッチアップ）
 */
export async function applyPendingSakura(): Promise<{ applied: number }> {
  const sb = getServiceSupabase()
  const now = Date.now()

  // 作成から30分以上経過 & まだ誰も投票していない問いを取得
  const { data: candidates } = await sb
    .from('markets')
    .select('id, created_at')
    .eq('total_pool', 0)
    .eq('is_resolved', false)
    .lte('created_at', new Date(now - 30 * 60 * 1000).toISOString())

  if (!candidates || candidates.length === 0) return { applied: 0 }

  // IDから決定論的に30〜89分の遅延を算出して対象を絞る
  const targets = candidates.filter(m => {
    const id = Number(m.id)
    const delayMs = (30 + (id * 7 % 60)) * 60 * 1000
    const createdAt = new Date(m.created_at).getTime()
    return createdAt + delayMs <= now
  })

  if (targets.length === 0) return { applied: 0 }

  await Promise.allSettled(targets.map(m => applySakura(Number(m.id))))
  return { applied: targets.length }
}
