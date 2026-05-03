import type { TrendItem } from './fetchTrends'

export type DraftMarket = {
  title: string
  description: string
  category: string
  options: string[]
  endDays: number
}

/** 問いの判定基準（将来の予想の正誤をどう決めるか）。UI・自動生成の既定文。 */
export const DEFAULT_RESOLUTION_DESCRIPTION =
  '正誤は公式の公表・実績・主要報道を根拠に、運営判断で確定します。'

const BLACKBURN_AWARDS_RE = /ブラックバーン.*年間表彰|森下龍矢|大橋祐紀/
const BLACKBURN_TITLE = 'ブラックバーンの年間表彰は日本人コンビが独占するか？（森下龍矢や大橋祐紀）'
const BLACKBURN_DESCRIPTION =
  '判定は公表・実績・主要報道を基準にします（運営の判断で確定）。'
const BLACKBURN_OPTIONS = [
  '日本人コンビが独占する',
  '日本人コンビは失速する',
  '1人だけ年間表彰対象に',
]

function isBlackburnAwardsTopic(headline: string): boolean {
  return BLACKBURN_AWARDS_RE.test(headline)
}

function normalizeForCompare(s: string): string {
  return s.replace(/\s+/g, '').trim()
}

/** 見出しの転載に近い問いなら true（チェック工程①） */
export function isLikelyHeadlineEcho(title: string, headline: string): boolean {
  const t = normalizeForCompare(title)
  const h = normalizeForCompare(headline)
  if (!t || !h) return false
  if (t === h) return true
  if (h.includes(t) && t.length >= Math.min(28, h.length * 0.82)) return true
  if (t.includes(h) && h.length >= 28) return true
  const prefix = 22
  if (t.length >= 20 && h.slice(0, prefix) === t.slice(0, prefix)) return true
  return false
}

/** OpenAI なし／エラー時も「見出しそのもの」にはしない（チェック工程②のテンプレ） */
function predictionFallbackTitle(headline: string): string {
  const oneLine = headline.replace(/\s+/g, ' ').trim()
  const hint = oneLine.length > 42 ? `${oneLine.slice(0, 39)}…` : oneLine
  const base = `【予想】「${hint}」と報じられた出来事について、締め切りまでにさらに発展・継続すると見られるか？`
  return base.length > 100 ? `${base.slice(0, 97)}…` : base
}

function fallbackDraft(
  headline: string,
  defaultCategory: string,
  opts?: { flavor?: 'general' | 'mlb' }
): DraftMarket {
  if (isBlackburnAwardsTopic(headline)) {
    return {
      title: BLACKBURN_TITLE,
      description: BLACKBURN_DESCRIPTION,
      category: defaultCategory,
      options: BLACKBURN_OPTIONS,
      endDays: Number(process.env.PDCA_DEFAULT_END_DAYS || '7') || 7,
    }
  }
  const mlb = opts?.flavor === 'mlb'
  return {
    title: predictionFallbackTitle(headline),
    description: mlb
      ? `メジャー／日本人選手などスポーツに関する将来の予想です。${DEFAULT_RESOLUTION_DESCRIPTION}`
      : `ニュースを題材にした将来の予想です。${DEFAULT_RESOLUTION_DESCRIPTION}`,
    category: defaultCategory,
    options: mlb
      ? ['発展・継続する見込みが高い', '沈静化・収束しやすい', 'この期間では判断しにくい']
      : ['起きる・そうなる', '起きない・そうならない', 'この期間では判断しにくい'],
    endDays: Number(process.env.PDCA_DEFAULT_END_DAYS || '7') || 7,
  }
}

const SYSTEM_PROMPT_BASE = `あなたは予測市場アプリ「ヨソる」の運営者です。
次のルールを必ず守り、JSON だけを返してください。

【問いのtitle】
・ニュース見出しの「転載・要約」にしない。疑問形で「これから先どうなるか」の予想を書く。
・見出しは題材としてだけ使い、「〜か」「〜なるか」「〜と見られるか」など未来に閉じた一文にする。
・80文字以内。

【description】
・将来の予想の「判定基準」を1〜2文で書く。
・必ず「正誤は公式の公表・実績・主要報道を根拠に、運営判断で確定する」趣旨を含める（表現は多少変えてよい）。

【options】
・日本語でちょうど3つ。それぞれ「予想しうる結論」が分かる短い語にする（見出しの語句を並べるだけにしない）。

キー: title, description, category, options（文字列の配列・長さ3）, endDays（3〜14の整数）`

function ensureResolutionDescription(desc: string): string {
  const d = desc.trim().slice(0, 500)
  if (!d) return DEFAULT_RESOLUTION_DESCRIPTION
  if (/公表|実績|報道|運営/.test(d)) return d
  return `${d} ${DEFAULT_RESOLUTION_DESCRIPTION}`.trim().slice(0, 500)
}

async function rewriteEchoingTitle(
  item: TrendItem,
  badTitle: string,
  catList: string,
  flavorNote: string
): Promise<string | null> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) return null
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.35,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'あなたは編集者です。与えられた見出しはニュースですが、問いのtitleが見出しのコピーになっているのを直します。JSONのみ返す。キー: title（80文字以内・将来の予想の疑問形・見出しの繰り返し禁止）',
        },
        {
          role: 'user',
          content: `利用可能なcategory一覧（参照のみ）: ${catList}\n見出し: ${item.title}\n${flavorNote}\n不適切なtitle（コピー気味）: ${badTitle}\n\n上記見出しを題材に、締め切りまでの「予想」としてふさわしいtitleだけを出力してください。`,
        },
      ],
    }),
  })
  if (!res.ok) return null
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
  const raw = data.choices?.[0]?.message?.content
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as { title?: string }
    const t = String(parsed.title || '').trim().slice(0, 100)
    return t || null
  } catch {
    return null
  }
}

export async function draftMarketFromTrend(
  item: TrendItem,
  defaultCategory: string,
  allowedCategories: string[],
  opts?: { flavor?: 'general' | 'mlb' }
): Promise<DraftMarket> {
  const flavor = opts?.flavor ?? 'general'
  const pickCategory = (raw: string) => {
    const c = raw.trim()
    if (allowedCategories.includes(c)) return c
    if (allowedCategories.includes('その他')) return 'その他'
    return defaultCategory
  }

  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) {
    return fallbackDraft(item.title, defaultCategory, opts)
  }

  const catList = allowedCategories.length ? allowedCategories.join(' / ') : defaultCategory
  const flavorNote =
    flavor === 'mlb'
      ? '\nこの見出しは大谷翔平・ドジャース、村上宗隆・鈴木誠也・今永 など、メジャーリーグの日本人選手・球団に関するスポーツ予想です。category は「スポーツ」が利用可能なら優先してください。'
      : ''

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.4,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: SYSTEM_PROMPT_BASE,
          },
          {
            role: 'user',
            content: `利用可能な category（このいずれかと完全一致）: ${catList}\n\nニュース見出し（題材。これをそのまま問いのタイトルにしないこと）:\n${item.title}${flavorNote}`,
          },
        ],
      }),
    })
    if (!res.ok) {
      return fallbackDraft(item.title, defaultCategory, opts)
    }
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const raw = data.choices?.[0]?.message?.content
    if (!raw) return fallbackDraft(item.title, defaultCategory, opts)
    const parsed = JSON.parse(raw) as Partial<DraftMarket>
    if (
      !parsed.title ||
      !Array.isArray(parsed.options) ||
      parsed.options.length < 3
    ) {
      return fallbackDraft(item.title, defaultCategory, opts)
    }
    const endDays = Math.min(14, Math.max(3, Number(parsed.endDays) || 7))

    let titleRaw = String(parsed.title || '').slice(0, 100).trim()
    if (!isBlackburnAwardsTopic(item.title) && titleRaw && isLikelyHeadlineEcho(titleRaw, item.title)) {
      const repaired = await rewriteEchoingTitle(item, titleRaw, catList, flavorNote)
      if (repaired && !isLikelyHeadlineEcho(repaired, item.title)) titleRaw = repaired
      else titleRaw = predictionFallbackTitle(item.title)
    }

    const descRaw = String(parsed.description || '').trim()
    const finalDescription = isBlackburnAwardsTopic(item.title)
      ? BLACKBURN_DESCRIPTION
      : ensureResolutionDescription(descRaw)

    const optsRaw = isBlackburnAwardsTopic(item.title)
      ? BLACKBURN_OPTIONS
      : parsed.options!.slice(0, 5).map((s) => String(s).slice(0, 40))

    const finalTitle = isBlackburnAwardsTopic(item.title)
      ? BLACKBURN_TITLE
      : titleRaw || predictionFallbackTitle(item.title)

    return {
      title: finalTitle,
      description: finalDescription,
      category: pickCategory(String(parsed.category || defaultCategory)),
      options: optsRaw.length >= 3 ? optsRaw.slice(0, 3) : fallbackDraft(item.title, defaultCategory, opts).options,
      endDays,
    }
  } catch {
    return fallbackDraft(item.title, defaultCategory, opts)
  }
}
