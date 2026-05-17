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
 * 投票未発生の問いに対してサクラ投票を適用する。
 * force=false（デフォルト）: IDから30〜89分の遅延を算出し、時刻を過ぎた問いのみ適用。
 * force=true: 遅延・経過時間を無視して未投票の問い全件に即時適用。
 */
export async function applyPendingSakura(force = false): Promise<{ applied: number }> {
  const sb = getServiceSupabase()
  const now = Date.now()

  const query = sb
    .from('markets')
    .select('id, created_at')
    .eq('total_pool', 0)
    .eq('is_resolved', false)

  // 通常モードは作成から30分以上経過した問いのみ対象
  if (!force) {
    query.lte('created_at', new Date(now - 30 * 60 * 1000).toISOString())
  }

  const { data: candidates } = await query

  if (!candidates || candidates.length === 0) return { applied: 0 }

  const targets = force ? candidates : candidates.filter(m => {
    const id = Number(m.id)
    const delayMs = (30 + (id * 7 % 60)) * 60 * 1000
    const createdAt = new Date(m.created_at).getTime()
    return createdAt + delayMs <= now
  })

  if (targets.length === 0) return { applied: 0 }

  await Promise.allSettled(targets.map(m => applySakura(Number(m.id))))
  return { applied: targets.length }
}
