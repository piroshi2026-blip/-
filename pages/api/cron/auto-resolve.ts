import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../lib/pdca/cronGuard'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'

/**
 * アンケート型の問い（auto_resolve=true）で締切を過ぎたものを自動判定する。
 * 最多票の選択肢を正解として resolve_market RPC を呼ぶ。
 * Cron で毎時呼ぶか、管理画面から手動で呼ぶ。
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!assertCronAuthorized(req, res)) return

  const sb = getServiceSupabase()

  const { data: markets, error } = await sb
    .from('markets')
    .select('id, title, end_date, market_options(id, name, pool)')
    .eq('auto_resolve', true)
    .eq('is_resolved', false)
    .lt('end_date', new Date().toISOString())

  if (error) return res.status(500).json({ error: error.message })
  if (!markets || markets.length === 0) {
    return res.status(200).json({ resolved: 0, message: '自動判定対象なし' })
  }

  const results: { id: number; title: string; winner: string; error?: string }[] = []

  for (const m of markets) {
    const options = (m as any).market_options as { id: number; name: string; pool: number }[]
    if (!options || options.length === 0) {
      results.push({ id: m.id, title: m.title, winner: '', error: '選択肢なし' })
      continue
    }

    const topOption = options.reduce((a, b) => (b.pool > a.pool ? b : a), options[0])

    if (topOption.pool === 0) {
      results.push({ id: m.id, title: m.title, winner: '', error: '投票なし（スキップ）' })
      continue
    }

    const { error: rpcErr } = await sb.rpc('resolve_market', {
      market_id_input: m.id,
      winning_option_id: topOption.id,
    })

    if (rpcErr) {
      results.push({ id: m.id, title: m.title, winner: topOption.name, error: rpcErr.message })
    } else {
      results.push({ id: m.id, title: m.title, winner: topOption.name })
    }
  }

  const resolved = results.filter(r => !r.error).length
  return res.status(200).json({ resolved, total: markets.length, results })
}
