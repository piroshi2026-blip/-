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

  const key = process.env.OPENAI_API_KEY?.trim()
  if (key) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          temperature: 0.2,
          max_tokens: 20,
          messages: [{
            role: 'user',
            content: `Prediction market question (Japanese): "${title}"\nRespond with 3 English keywords for a stock photo search. Keywords only, space-separated.`,
          }],
        }),
      })
      if (res.ok) {
        const data = await res.json() as { choices?: { message?: { content?: string } }[] }
        const kw = data.choices?.[0]?.message?.content?.trim().slice(0, 80)
        if (kw) return kw
      }
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

/**
 * 問いの内容を表す画像URLを取得する。
 * 優先順位: Unsplash（UNSPLASH_ACCESS_KEY 必須）→ 記事OGP → null
 */
export async function fetchMarketImage(
  draft: Pick<DraftMarket, 'title' | 'category'>,
  flavor: 'mlb' | 'general',
  trendLink?: string
): Promise<string | null> {
  const unsplashKey = process.env.UNSPLASH_ACCESS_KEY?.trim()
  if (unsplashKey) {
    const keywords = await resolveKeywords(draft.title, draft.category, flavor)
    const url = await searchUnsplash(keywords, unsplashKey)
    if (url) return url
  }

  if (trendLink) {
    return fetchOgpImage(trendLink)
  }

  return null
}
