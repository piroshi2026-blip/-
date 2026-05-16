import Anthropic from '@anthropic-ai/sdk'
import type { DraftMarket } from './draftMarket'

const CATEGORY_KEYWORDS: Record<string, string> = {
  'スポーツ':       'sports competition stadium crowd',
  '経済・投資':     'stock market finance trading',
  '政治・思想':     'government politics parliament',
  'エンタメ':       'entertainment concert stage lights',
  '自然・科学':     'nature science technology',
  '旅・生活':       'travel city lifestyle',
  'こども':         'children school education',
  '恋愛':           'couple romance',
  'ゲーム':         'gaming esports controller',
  '芸術・デザイン': 'art design creative',
  'その他':         'news world event',
}

/** Tavily で検索して画像URLを取得（include_images=true） */
export async function fetchImageViaSearch(query: string, excludeUrls?: string[]): Promise<string | null> {
  const key = process.env.TAVILY_API_KEY?.trim()
  if (!key) return null
  const exclude = new Set(excludeUrls ?? [])
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 5000)
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: 'basic',
        include_answer: false,
        include_images: true,
        max_results: 5,
      }),
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      images?: string[]
      results?: { url?: string }[]
    }
    const direct = (data.images ?? []).find((u) => typeof u === 'string' && u.startsWith('http') && !exclude.has(u))
    if (direct) return direct
    const firstUrl = data.results?.[0]?.url
    if (firstUrl) return fetchOgpImage(firstUrl)
  } catch { /* fall through */ }
  return null
}

/** Wikipedia API で画像URLを取得 */
export async function fetchWikipediaImage(searchTerm: string): Promise<string | null> {
  for (const lang of ['ja', 'en']) {
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 3000)
      const url =
        `https://${lang}.wikipedia.org/w/api.php?action=query` +
        `&titles=${encodeURIComponent(searchTerm)}` +
        `&prop=pageimages&format=json&pithumbsize=800&redirects=1`
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) continue
      const data = (await res.json()) as {
        query?: { pages?: Record<string, { thumbnail?: { source: string } }> }
      }
      const pages = Object.values(data.query?.pages ?? {})
      const src = pages[0]?.thumbnail?.source
      if (src) return src
    } catch { continue }
  }
  return null
}

async function searchUnsplash(keywords: string, accessKey: string): Promise<string | null> {
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keywords)}&per_page=5&orientation=landscape`
    const res = await fetch(url, { headers: { Authorization: `Client-ID ${accessKey}` } })
    if (!res.ok) return null
    const data = (await res.json()) as { results?: { urls?: { regular?: string } }[] }
    const results = data.results ?? []
    if (!results.length) return null
    const pick = results[Math.floor(Math.random() * Math.min(5, results.length))]
    return pick.urls?.regular ?? null
  } catch {
    return null
  }
}

async function fetchOgpImage(articleUrl: string): Promise<string | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 3000)
  try {
    const res = await fetch(articleUrl, { headers: { 'User-Agent': 'Mozilla/5.0' }, signal: controller.signal })
    if (!res.ok) return null
    const html = await res.text()
    const m =
      html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i)
    return m?.[1] ?? null
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

/**
 * 優先順位: 記事OGP（trendLink）→ Unsplash API（キーあり）→ Tavily 検索画像 → null
 * OGPを最優先にすることでトピックと無関係な画像を防ぐ
 */
export async function fetchMarketImage(
  draft: Pick<DraftMarket, 'title' | 'category'>,
  flavor: 'mlb' | 'general',
  trendLink?: string,
  excludeUrls?: string[]
): Promise<string | null> {
  const exclude = new Set(excludeUrls ?? [])

  // 記事OGP（最もトピックに関連性が高い）
  if (trendLink) {
    const ogp = await fetchOgpImage(trendLink)
    if (ogp && !exclude.has(ogp)) return ogp
  }

  // Unsplash API（キーあり時・ランダム選択なので毎回違う画像）
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY?.trim()
  if (unsplashKey) {
    const kw = flavor === 'mlb' ? 'baseball MLB stadium action' : (CATEGORY_KEYWORDS[draft.category] ?? 'news event')
    for (let i = 0; i < 3; i++) {
      const url = await searchUnsplash(kw, unsplashKey)
      if (url && !exclude.has(url)) return url
    }
  }

  // Tavily 検索で関連画像取得（既出URLを除外）
  return fetchImageViaSearch(draft.title, excludeUrls)
}
