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

async function resolveKeywords(
  title: string,
  category: string,
  flavor: 'mlb' | 'general'
): Promise<string> {
  if (flavor === 'mlb') return 'baseball MLB stadium action player'

  const claudeKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (claudeKey) {
    try {
      const client = new Anthropic({ apiKey: claudeKey })
      const msg = await client.messages.create({
        model: process.env.CLAUDE_DRAFT_MODEL ?? 'claude-haiku-4-5-20251001',
        max_tokens: 25,
        system: 'Output 3-4 English keywords for a stock photo search based on the Japanese text. Keywords only, space-separated, no punctuation.',
        messages: [{ role: 'user', content: title }],
      })
      const tb = msg.content.find((b) => b.type === 'text')
      const kw = tb && 'text' in tb ? (tb as { text: string }).text.trim().slice(0, 80) : ''
      if (kw) return kw
    } catch { /* fall through */ }
  }

  return CATEGORY_KEYWORDS[category] ?? 'news world event'
}

async function searchUnsplash(keywords: string, accessKey: string): Promise<string | null> {
  try {
    const url = `https://api.unsplash.com/search/photos?query=${encodeURIComponent(keywords)}&per_page=5&orientation=landscape`
    const res = await fetch(url, {
      headers: { Authorization: `Client-ID ${accessKey}` },
    })
    if (!res.ok) return null
    const data = await res.json() as { results?: { urls?: { regular?: string } }[] }
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
    const res = await fetch(articleUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0' },
      signal: controller.signal,
    })
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

async function fetchUnsplashSource(keywords: string): Promise<string | null> {
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 3000)
    const res = await fetch(
      `https://source.unsplash.com/800x400/?${encodeURIComponent(keywords)}`,
      { redirect: 'follow', signal: controller.signal }
    )
    if (res.ok && res.url.includes('images.unsplash.com')) return res.url
  } catch { /* fall through */ }
  return null
}

/**
 * 問いの内容を表す画像URLを取得する。
 * 優先順位: Unsplash API（キーあり時）→ 記事OGP → Unsplash Source（キー不要）→ null
 */
export async function fetchMarketImage(
  draft: Pick<DraftMarket, 'title' | 'category'>,
  flavor: 'mlb' | 'general',
  trendLink?: string
): Promise<string | null> {
  const keywords = await resolveKeywords(draft.title, draft.category, flavor)

  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY?.trim()
  if (unsplashKey) {
    const url = await searchUnsplash(keywords, unsplashKey)
    if (url) return url
  }

  if (trendLink) {
    const ogp = await fetchOgpImage(trendLink)
    if (ogp) return ogp
  }

  // Unsplash Source（APIキー不要）
  return fetchUnsplashSource(keywords)
}
