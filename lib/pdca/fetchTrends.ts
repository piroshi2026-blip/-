import Parser from 'rss-parser'

const parser = new Parser({ timeout: 15000 })

/** デフォルトの日本語ニュース・話題RSS（追加は env RSS_FEED_URLS でカンマ区切り） */
const DEFAULT_FEEDS = [
  'https://news.yahoo.co.jp/rss/topics/top-picks.xml',   // ヤフー総合
  'https://news.yahoo.co.jp/rss/topics/politics.xml',    // 政治
  'https://news.yahoo.co.jp/rss/topics/business.xml',    // ビジネス
  'https://news.yahoo.co.jp/rss/topics/entertainment.xml', // エンタメ
  'https://news.yahoo.co.jp/rss/topics/it.xml',          // テクノロジー
  'https://news.yahoo.co.jp/rss/topics/world.xml',       // 国際
  'https://www.nhk.or.jp/rss/news/cat0.xml',             // NHK総合
  'https://www.nhk.or.jp/rss/news/cat4.xml',             // NHK政治
  'https://www.nhk.or.jp/rss/news/cat5.xml',             // NHK経済
  'https://www.nhk.or.jp/rss/news/cat1.xml',             // NHK社会
]

/** 大谷・ドジャース・MLB 関連を拾うための追加RSS（スポーツ総合からキーワード抽出） */
const MLB_EXTRA_FEEDS = ['https://news.yahoo.co.jp/rss/categories/sports.xml']

export type TrendItem = { title: string; link?: string; source: string }

/**
 * 見出しが MLB / 大谷・ドジャース / 大リーグの日本人選手 等かどうか。
 * 村上・鈴木誠也・今永・山本 など、メジャーの日本勢を広く拾う。
 */
export const MLB_TOPIC_RE =
  /大谷|翔平|ドジャー|ドジャース|オオタニ|ＭＬＢ|\bMLB\b|大リーグ|ビッグリーグ|メジャー|日本人選手|日本勢|日米|エンゼルス|ワールドシリーズ|プレーオフ|オールスター|サイ・ヤング|MVP|本塁打|先発|中継ぎ|救援|投手|打者|ロバーツ|山本由伸|山本|ムーキー|ベッツ|フリードマン|ナ・リーグ|ア・リーグ|ダルビッシュ|イチロー|ショウヘイ|Shohei|Ohtani|Dodgers|Angels|Los\s*Angeles|村上|村神|鈴木誠也|吉田正尚|今永|藤浪|菊池雄星|菊池涼介|前田健太|佐々木朗希|千賀|ヌートバー|松井|田中将|大リーガー|Sasaki|Murakami|清宮|近藤|有原|上沢|秋山翔吾/i

function parseFeedList(envVal: string | undefined): string[] {
  const extra = (envVal || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return [...new Set([...DEFAULT_FEEDS, ...extra])]
}

function parseMlbFeedList(envVal: string | undefined): string[] {
  const extra = (envVal || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return [...new Set([...MLB_EXTRA_FEEDS, ...DEFAULT_FEEDS, ...extra])]
}

/**
 * 予測市場として成立しにくい見出しを除外するフィルター。
 * 気象警報・訃報・既確定の事故報道はオッズの張り合いにならない。
 */
const BAD_TOPIC_RE =
  /警報|暴風雪?|大雨警報|台風.*上陸|大雪警報|地震速報|津波|噴火|土砂崩れ|洪水|氾濫|震度[5-7強弱]|死亡確認|遺体|訃報|逮捕された|緊急逮捕|火災.*死傷|交通事故.*死|墜落|転落死|溺死|心肺停止/

export async function fetchTrendHeadlines(maxItems = 12): Promise<{ items: TrendItem[]; feedsUsed: string[] }> {
  const feeds = parseFeedList(process.env.RSS_FEED_URLS)
  const items: TrendItem[] = []
  const feedsUsed: string[] = []

  for (const url of feeds) {
    try {
      const feed = await parser.parseURL(url)
      feedsUsed.push(url)
      for (const entry of feed.items || []) {
        const title = entry.title?.trim()
        if (!title || title.length < 8) continue
        if (BAD_TOPIC_RE.test(title)) continue
        items.push({ title: title.slice(0, 200), link: entry.link, source: url })
        if (items.length >= maxItems * 2) break
      }
    } catch {
      // 次のフィードへ
    }
    if (items.length >= maxItems * 2) break
  }

  const seen = new Set<string>()
  const unique: TrendItem[] = []
  for (const it of items) {
    const k = it.title.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    unique.push(it)
    if (unique.length >= maxItems) break
  }

  return { items: unique, feedsUsed }
}

/**
 * 大谷・ドジャース・MLB 関連の見出しだけを集める（同一RSSを広く走査）
 */
export async function fetchOhtaniDodgersHeadlines(
  maxItems = 25
): Promise<{ items: TrendItem[]; feedsUsed: string[] }> {
  const feeds = parseMlbFeedList(process.env.OHTANI_RSS_FEEDS || process.env.RSS_FEED_URLS)
  const raw: TrendItem[] = []
  const feedsUsed: string[] = []

  for (const url of feeds) {
    try {
      const feed = await parser.parseURL(url)
      feedsUsed.push(url)
      for (const entry of feed.items || []) {
        const title = entry.title?.trim()
        if (!title || title.length < 6) continue
        if (!MLB_TOPIC_RE.test(title)) continue
        raw.push({ title: title.slice(0, 200), link: entry.link, source: url })
        if (raw.length >= 80) break
      }
    } catch {
      // ignore
    }
    if (raw.length >= 80) break
  }

  const seen = new Set<string>()
  const filtered: TrendItem[] = []
  for (const it of raw) {
    const k = it.title.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    filtered.push(it)
    if (filtered.length >= maxItems) break
  }

  return { items: filtered, feedsUsed: [...new Set(feedsUsed)] }
}

/** RSS にヒットがなくても「1日1件」用のフォールバック（日付で見出しが変わるので重複判定しやすい） */
export function buildDailyMlbFallbackItem(): TrendItem {
  const d = new Date()
  const ds = `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`
  return {
    title: `${ds}時点：メジャー（大谷翔平・ドジャース、村上宗隆・鈴木誠也・今永・山本由伸 ら日本人選手）の注目の出来事はあるか`,
    source: 'pdca-mlb-daily-fallback',
  }
}
