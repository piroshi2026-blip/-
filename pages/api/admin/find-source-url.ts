import type { NextApiRequest, NextApiResponse } from 'next'
import Parser from 'rss-parser'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'

export const maxDuration = 30

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'
const rssParser = new Parser({ timeout: 6000 })

async function findArticleUrl(title: string): Promise<string | null> {
  try {
    const q = encodeURIComponent(title)
    const feedUrl = `https://news.google.com/rss/search?q=${q}&hl=ja&gl=JP&ceid=JP:ja`
    const feed = await rssParser.parseURL(feedUrl)
    const link = feed.items?.[0]?.link
    if (link) return link
  } catch { /* fallthrough */ }

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

  const { adminPassword, marketId, title } = req.body as { adminPassword?: string; marketId?: number; title?: string }
  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }
  if (!title) {
    return res.status(400).json({ error: 'title が必要です' })
  }

  const url = await findArticleUrl(title)

  if (marketId) {
    const sb = getServiceSupabase()
    await sb.from('markets').update({ source_url: url ?? '' }).eq('id', marketId)
  }

  return res.status(200).json({ url })
}
