import Anthropic from '@anthropic-ai/sdk'
import type { DraftMarket } from './draftMarket'

const CATEGORY_KEYWORDS: Record<string, string> = {
  'スポーツ':   'sports competition stadium crowd',
  '経済・投資': 'stock market finance trading',
  '政治・思想': 'government politics parliament',
  'エンタメ':   'entertainment concert stage lights',
  '自然・科学': 'nature science technology',
  '旅・生活':   'travel city lifestyle',
  'こども':     'children school education',
  '恋愛':       'couple romance',
  'ゲーム':     'gaming esports controller',
  '芸術・デザイン': 'art design creative',
  'その他':     'news world event',
}

/** Claude で問いタイトルから Wikipedia 検索ワードを抽出 */
async function getWikipediaSearchTerm(title: string): Promise<string | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return null
  try {
    const client = new Anthropic({ apiKey: key })
    const msg = await client.messages.create({
      model: process.env.CLAUDE_DRAFT_MODEL ?? 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      system: '日本語の予測市場の問いから、Wikipedia検索に使う固有名詞を1つだけ返す。人物・球団・企業・政党を優先。余分な説明不要。',
      messages: [{ role: 'user', content: title }],
    })
    const tb = msg.content.find((b) => b.type === 'text')
    const term = tb && 'text' in tb ? (tb as { text: string }).text.trim().slice(0, 50) : ''
    return term || null
  } catch {
    return null
  }
}

/** Wikipedia API で画像URLを取得（日本語 → 英語の順で試す） */
async function fetchWikipediaImage(searchTerm: string): Promise<string | null> {
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
 * 優先順位: Unsplash API（キーあり）→ 記事OGP → Wikipedia画像 → null
 */
export async function fetchMarketImage(
  draft: Pick<DraftMarket, 'title' | 'category'>,
  flavor: 'mlb' | 'general',
  trendLink?: string
): Promise<string | null> {
  // Unsplash API（キーあり時）
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY?.trim()
  if (unsplashKey) {
    const kw = flavor === 'mlb' ? 'baseball MLB stadium action' : (CATEGORY_KEYWORDS[draft.category] ?? 'news event')
    const url = await searchUnsplash(kw, unsplashKey)
    if (url) return url
  }

  // 記事OGP（元URLがある場合）
  if (trendLink) {
    const ogp = await fetchOgpImage(trendLink)
    if (ogp) return ogp
  }

  // Wikipedia（Claude でキーワード抽出 → Wikipedia 画像）
  if (flavor === 'mlb') {
    // MLB は選手名を問いから直接抽出して Wikipedia を引く
    const term = await getWikipediaSearchTerm(draft.title)
    if (term) {
      const img = await fetchWikipediaImage(term)
      if (img) return img
    }
  } else {
    const term = await getWikipediaSearchTerm(draft.title)
    if (term) {
      const img = await fetchWikipediaImage(term)
      if (img) return img
    }
  }

  return null
}
