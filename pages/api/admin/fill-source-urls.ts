import type { NextApiRequest, NextApiResponse } from 'next'
import Parser from 'rss-parser'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'

export const maxDuration = 60

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'
const rssParser = new Parser({ timeout: 6000 })

async function findArticleUrl(title: string): Promise<string | null> {
  // 1. Google ニュース RSS（APIキー不要）
  try {
    const q = encodeURIComponent(title)
    const feedUrl = `https://news.google.com/rss/search?q=${q}&hl=ja&gl=JP&ceid=JP:ja`
    const feed = await rssParser.parseURL(feedUrl)
    const link = feed.items?.[0]?.link
    if (link) return link
  } catch { /* fallthrough */ }

  // 2. Tavily（キーがある場合のみ）
  const tavilyKey = process.env.TAVILY_API_KEY?.trim()
  if (tavilyKey) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tavilyKey, query: `${title} ニュース`, search_depth: 'basic', max_results: 3 }),
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (res.ok) {
        const data = await res.json() as { results?: { url?: string }[] }
        const url = data.results?.[0]?.url
        if (url) return url
      }
    } catch { /* fallthrough */ }
  }

  return null
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

  const { data: markets, error } = await sb
    .from('markets')
    .select('id, title')
    .is('source_url', null)
    .order('created_at', { ascending: false })
    .limit(Math.min(20, Number(limit) || 15))

  if (error) return res.status(500).json({ error: error.message })
  if (!markets || markets.length === 0) {
    return res.status(200).json({ updated: 0, remaining: 0 })
  }

  // 並列で記事 URL を検索・更新
  const results = await Promise.allSettled(
    markets.map(async (m) => {
      const url = await findArticleUrl(m.title)
      if (!url) return { id: m.id, url: null }
      await sb.from('markets').update({ source_url: url }).eq('id', m.id)
      return { id: m.id, url }
    })
  )

  const updated = results.filter(
    r => r.status === 'fulfilled' && (r as PromiseFulfilledResult<any>).value?.url
  ).length

  const { count } = await sb
    .from('markets')
    .select('id', { count: 'exact', head: true })
    .is('source_url', null)

  return res.status(200).json({ updated, remaining: count ?? 0 })
}
