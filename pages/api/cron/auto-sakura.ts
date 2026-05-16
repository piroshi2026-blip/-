import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../lib/pdca/cronGuard'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'

export const maxDuration = 30

/**
 * 新規投稿から約30分後（25〜35分ウィンドウ）に自動サクラ投票。
 * total_pool = 0 の問いにのみ適用（二重適用防止）。
 * cron-job.org で10分毎に実行推奨。
 */
async function applySakura(marketId: number, totalAmount = 150) {
  const sb = getServiceSupabase()

  const { data: options, error } = await sb
    .from('market_options')
    .select('id, name, pool')
    .eq('market_id', marketId)
    .order('id', { ascending: true })

  if (error || !options || options.length === 0) return null

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
  const results: { optionId: number; name: string; added: number }[] = []
  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1
    const share = isLast ? remaining : Math.max(5, Math.round((weights[i] / totalWeight) * totalAmount))
    const jitter = isLast ? 0 : Math.floor(Math.random() * 6) - 3
    const amount = Math.max(5, Math.min(remaining, share + jitter))
    remaining -= amount
    await sb.from('market_options').update({ pool: (options[i].pool || 0) + amount }).eq('id', options[i].id)
    results.push({ optionId: options[i].id, name: options[i].name, added: amount })
  }

  const totalAdded = results.reduce((s, r) => s + r.added, 0)
  const { data: market } = await sb.from('markets').select('total_pool').eq('id', marketId).single()
  await sb.from('markets').update({ total_pool: (market?.total_pool || 0) + totalAdded }).eq('id', marketId)

  return { marketId, totalAdded, distribution: results }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!assertCronAuthorized(req, res)) return

  const sb = getServiceSupabase()

  // 作成から25〜35分経過 & まだ誰も投票していない問いを取得
  const { data: targets, error } = await sb
    .from('markets')
    .select('id, title')
    .eq('total_pool', 0)
    .eq('is_resolved', false)
    .gte('created_at', new Date(Date.now() - 35 * 60 * 1000).toISOString())
    .lte('created_at', new Date(Date.now() - 25 * 60 * 1000).toISOString())

  if (error) return res.status(200).json({ error: error.message })
  if (!targets || targets.length === 0) return res.status(200).json({ applied: [], message: '対象なし' })

  const results = await Promise.allSettled(targets.map(m => applySakura(m.id)))

  const applied = results
    .map((r, i) => r.status === 'fulfilled' && r.value
      ? { ...r.value, title: targets[i].title }
      : { marketId: targets[i].id, error: r.status === 'rejected' ? String(r.reason) : 'null result' })

  return res.status(200).json({ applied })
}
