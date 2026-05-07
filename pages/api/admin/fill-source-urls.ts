import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'

export const maxDuration = 60

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

async function searchTavily(query: string): Promise<string | null> {
  const key = process.env.TAVILY_API_KEY?.trim()
  if (!key) return null
  try {
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), 5000)
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ api_key: key, query, search_depth: 'basic', max_results: 3 }),
      signal: controller.signal,
    })
    clearTimeout(timer)
    if (!res.ok) return null
    const data = await res.json() as { results?: { url?: string; title?: string }[] }
    return data.results?.[0]?.url ?? null
  } catch {
    return null
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { adminPassword, limit = 15 } = req.body as { adminPassword?: string; limit?: number }
  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }

  const sb = getServiceSupabase()

  // source_url が NULL の問いを取得
  const { data: markets, error } = await sb
    .from('markets')
    .select('id, title')
    .is('source_url', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(20, Number(limit) || 15))

  if (error) return res.status(500).json({ error: error.message })
  if (!markets || markets.length === 0) return res.status(200).json({ updated: 0, remaining: 0 })

  // 並列で Tavily 検索
  const results = await Promise.allSettled(
    markets.map(async (m) => {
      const url = await searchTavily(`${m.title} ニュース 記事`)
      if (!url) return { id: m.id, url: null }
      await sb.from('markets').update({ source_url: url }).eq('id', m.id)
      return { id: m.id, url }
    })
  )

  const updated = results.filter(r => r.status === 'fulfilled' && (r as any).value?.url).length

  // まだ NULL が残っているか確認
  const { count } = await sb
    .from('markets')
    .select('id', { count: 'exact', head: true })
    .is('source_url', null)

  return res.status(200).json({ updated, remaining: count ?? 0 })
}
