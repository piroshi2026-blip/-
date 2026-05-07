import type { NextApiRequest, NextApiResponse } from 'next'
import Parser from 'rss-parser'

export const maxDuration = 30

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'
const rssParser = new Parser({ timeout: 6000 })

async function findArticleUrls(title: string): Promise<string[]> {
  const urls: string[] = []
  const short = title.replace(/[？?。、「」【】『』〈〉]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 30).trim()

  // フルタイトル（JP ロケール）
  try {
    const feed = await rssParser.parseURL(
      `https://news.google.com/rss/search?q=${encodeURIComponent(title)}&hl=ja&gl=JP&ceid=JP:ja`
    )
    for (const item of feed.items?.slice(0, 5) ?? []) {
      if (item.link && !urls.includes(item.link)) urls.push(item.link)
    }
  } catch { /* fallthrough */ }

  // 短縮クエリ（JP ロケール）— 追加候補を補充
  if (short && short !== title && urls.length < 3) {
    try {
      const feed = await rssParser.parseURL(
        `https://news.google.com/rss/search?q=${encodeURIComponent(short)}&hl=ja&gl=JP&ceid=JP:ja`
      )
      for (const item of feed.items?.slice(0, 5) ?? []) {
        if (item.link && !urls.includes(item.link)) urls.push(item.link)
      }
    } catch { /* fallthrough */ }
  }

  const tavilyKey = process.env.TAVILY_API_KEY?.trim()
  if (tavilyKey && urls.length < 3) {
    try {
      const controller = new AbortController()
      const timer = setTimeout(() => controller.abort(), 5000)
      const res = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ api_key: tavilyKey, query: `${short || title} ニュース`, search_depth: 'basic', max_results: 5 }),
        signal: controller.signal,
      })
      clearTimeout(timer)
      if (res.ok) {
        const data = await res.json() as { results?: { url?: string }[] }
        for (const r of data.results ?? []) {
          if (r.url && !urls.includes(r.url)) urls.push(r.url)
        }
      }
    } catch { /* fallthrough */ }
  }

  return urls
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { adminPassword, title } = req.body as { adminPassword?: string; title?: string }
  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }
  if (!title) {
    return res.status(400).json({ error: 'title が必要です' })
  }

  const urls = await findArticleUrls(title)
  return res.status(200).json({ urls })
}
