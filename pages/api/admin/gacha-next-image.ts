import type { NextApiRequest, NextApiResponse } from 'next'
import { fetchMarketImage } from '../../../lib/pdca/fetchImage'
import type { DraftMarket } from '../../../lib/pdca/draftMarket'

export const maxDuration = 15

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

async function fetchOgpDescription(url: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 4000)
  try {
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal })
    if (!res.ok) return null
    const html = await res.text()
    const m =
      html.match(/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:description["']/i) ||
      html.match(/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+name=["']description["']/i)
    return m?.[1]?.trim().slice(0, 200) ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { adminPassword, mode, title, category, kind, trendLink, url, excludeUrls } = req.body as {
    adminPassword?: string
    mode?: string
    title?: string
    category?: string
    kind?: string
    trendLink?: string
    url?: string
    excludeUrls?: string[]
  }

  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }

  if (mode === 'snippet') {
    if (!url) return res.status(400).json({ error: 'url が必要です' })
    const snippet = await fetchOgpDescription(url)
    return res.status(200).json({ snippet })
  }

  if (!title || !category) return res.status(400).json({ error: 'title と category が必要です' })
  const draft = { title, category } as Pick<DraftMarket, 'title' | 'category'>
  const flavor: 'mlb' | 'general' = kind === 'mlb' ? 'mlb' : 'general'
  const imageUrl = await fetchMarketImage(draft, flavor, trendLink || undefined, excludeUrls).catch(() => null)
  return res.status(200).json({ imageUrl })
}
