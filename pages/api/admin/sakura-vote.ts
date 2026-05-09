import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

/**
 * サクラ投票: 全選択肢に傾斜付きランダムで計150ptを配分。
 * 1番人気そう（既に最多票 or 先頭）を多めに配分して自然な分布に。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { adminPassword, marketId, totalAmount = 150 } = req.body as {
    adminPassword?: string
    marketId?: number
    totalAmount?: number
  }

  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }
  if (!marketId) return res.status(400).json({ error: 'marketId が必要です' })

  const sb = getServiceSupabase()

  const { data: options, error } = await sb
    .from('market_options')
    .select('id, name, pool')
    .eq('market_id', marketId)
    .order('id', { ascending: true })

  if (error) return res.status(500).json({ error: error.message })
  if (!options || options.length === 0) return res.status(400).json({ error: '選択肢がありません' })

  const n = options.length
  const weights: number[] = []
  let totalWeight = 0

  for (let i = 0; i < n; i++) {
    const baseWeight = n - i
    const popularityBonus = options[i].pool > 0 ? Math.log2(options[i].pool + 1) : 0
    const w = baseWeight + popularityBonus + Math.random() * 2
    weights.push(w)
    totalWeight += w
  }

  const maxIdx = weights.indexOf(Math.max(...weights))
  weights[maxIdx] *= 1.5
  totalWeight = weights.reduce((s, w) => s + w, 0)

  const results: { optionId: number; name: string; added: number }[] = []
  let remaining = totalAmount

  for (let i = 0; i < n; i++) {
    const isLast = i === n - 1
    const share = isLast ? remaining : Math.max(5, Math.round((weights[i] / totalWeight) * totalAmount))
    const jitter = isLast ? 0 : Math.floor(Math.random() * 6) - 3
    const amount = Math.max(5, Math.min(remaining, share + jitter))
    remaining -= amount

    const newPool = (options[i].pool || 0) + amount
    await sb.from('market_options').update({ pool: newPool }).eq('id', options[i].id)
    results.push({ optionId: options[i].id, name: options[i].name, added: amount })
  }

  const totalAdded = results.reduce((s, r) => s + r.added, 0)
  const { data: market } = await sb.from('markets').select('total_pool').eq('id', marketId).single()
  await sb.from('markets').update({ total_pool: (market?.total_pool || 0) + totalAdded }).eq('id', marketId)

  return res.status(200).json({ ok: true, marketId, totalAdded, distribution: results })
}
