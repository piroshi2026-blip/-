import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

/**
 * サクラ投票: 指定した問いの全選択肢にランダム量のptを均等に分配投票する。
 * RPC place_bet ではなくDB直接更新（管理者専用）。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { adminPassword, marketId, totalAmount = 1000 } = req.body as {
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
    .select('id, pool')
    .eq('market_id', marketId)

  if (error) return res.status(500).json({ error: error.message })
  if (!options || options.length === 0) return res.status(400).json({ error: '選択肢がありません' })

  const perOption = Math.floor(totalAmount / options.length)
  const results: { optionId: number; added: number }[] = []

  for (const opt of options) {
    const jitter = Math.floor(Math.random() * perOption * 0.4) - Math.floor(perOption * 0.2)
    const amount = Math.max(10, perOption + jitter)
    const newPool = (opt.pool || 0) + amount

    await sb.from('market_options').update({ pool: newPool }).eq('id', opt.id)
    results.push({ optionId: opt.id, added: amount })
  }

  const totalAdded = results.reduce((s, r) => s + r.added, 0)
  const { data: market } = await sb.from('markets').select('total_pool').eq('id', marketId).single()
  await sb.from('markets').update({ total_pool: (market?.total_pool || 0) + totalAdded }).eq('id', marketId)

  return res.status(200).json({ ok: true, marketId, totalAdded, distribution: results })
}
