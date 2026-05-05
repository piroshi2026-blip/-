import Parser from 'rss-parser'

export type WorldContext = {
  dateJst: string
  currentFacts: string
  headlines: string[]
  trendKeywords: string[]
  tavilyAnswer: string | null
}

const rssParser = new Parser({ timeout: 10000 })

async function fetchGoogleTrendsJP(): Promise<string[]> {
  try {
    const feed = await rssParser.parseURL(
      'https://trends.google.co.jp/trends/trendingsearches/daily/rss?geo=JP'
    )
    return (feed.items || [])
      .slice(0, 15)
      .map((item) => item.title?.trim())
      .filter((t): t is string => Boolean(t) && t.length > 1)
  } catch {
    return []
  }
}

async function fetchTavilyContext(
  query: string
): Promise<{ answer: string | null; headlines: string[] }> {
  const key = process.env.TAVILY_API_KEY?.trim()
  if (!key) return { answer: null, headlines: [] }
  try {
    const res = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        api_key: key,
        query,
        search_depth: 'basic',
        include_answer: true,
        max_results: 8,
        include_domains: [
          'nhk.or.jp',
          'asahi.com',
          'mainichi.jp',
          'nikkei.com',
          'yomiuri.co.jp',
          'jiji.com',
          'yahoo.co.jp',
          'sankei.com',
          'tokyo-np.co.jp',
        ],
      }),
    })
    if (!res.ok) return { answer: null, headlines: [] }
    const data = (await res.json()) as { answer?: string; results?: { title?: string }[] }
    const headlines = (data.results || [])
      .map((r) => r.title?.trim())
      .filter((t): t is string => Boolean(t))
      .slice(0, 8)
    return { answer: data.answer?.trim() ?? null, headlines }
  } catch {
    return { answer: null, headlines: [] }
  }
}

function getJstDateString(): string {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(new Date())
}

export async function fetchWorldContext(): Promise<WorldContext> {
  const dateJst = getJstDateString()
  const currentFacts =
    process.env.PDCA_CURRENT_CONTEXT || '現在の日本の首相：高市早苗（自民党政権）、2026年'

  const todayStr = new Date().toLocaleDateString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
  })
  const tavilyQuery = `日本 ${todayStr} 話題 最新ニュース 政治 社会 経済 トレンド`

  const [tavilyResult, trendsResult] = await Promise.allSettled([
    fetchTavilyContext(tavilyQuery),
    fetchGoogleTrendsJP(),
  ])

  return {
    dateJst,
    currentFacts,
    headlines: tavilyResult.status === 'fulfilled' ? tavilyResult.value.headlines : [],
    trendKeywords: trendsResult.status === 'fulfilled' ? trendsResult.value : [],
    tavilyAnswer: tavilyResult.status === 'fulfilled' ? tavilyResult.value.answer : null,
  }
}

export function formatWorldContextForPrompt(ctx: WorldContext): string {
  const lines: string[] = [
    '━━━【今日の世相・最新情報（AIの学習データより必ず優先すること）】━━━',
    `📅 現在の日時: ${ctx.dateJst}（JST）`,
    `🏛 現在の状況: ${ctx.currentFacts}`,
  ]

  if (ctx.trendKeywords.length > 0) {
    lines.push(`🔥 Googleトレンド急上昇: ${ctx.trendKeywords.slice(0, 12).join(' / ')}`)
  }

  if (ctx.headlines.length > 0) {
    lines.push('📰 今日の主要ニュース・話題:')
    ctx.headlines.slice(0, 7).forEach((h) => lines.push(`  ・${h}`))
  }

  if (ctx.tavilyAnswer) {
    lines.push(`📊 ウェブ情報サマリー: ${ctx.tavilyAnswer.slice(0, 400)}`)
  }

  lines.push('⚠️ 上記の現在情報を最優先にし、学習データの背景知識と矛盾する場合は上記を採用すること')
  lines.push('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━')

  return lines.join('\n')
}
