import type { TrendItem } from './fetchTrends'

export type DraftMarket = {
  title: string
  description: string
  category: string
  options: string[]
  endDays: number
}

const BLACKBURN_AWARDS_RE = /ブラックバーン.*年間表彰|森下龍矢|大橋祐紀/
const BLACKBURN_TITLE = 'ブラックバーンの年間表彰は日本人コンビが独占するか？（森下龍矢や大橋祐紀）'
const BLACKBURN_DESCRIPTION = '判定は公式戦績・主要報道を基準にします（運営の判断で確定）'
const BLACKBURN_OPTIONS = [
  '日本人コンビが独占する',
  '日本人コンビは失速する',
  '1人だけ年間表彰対象に',
]

function isBlackburnAwardsTopic(headline: string): boolean {
  return BLACKBURN_AWARDS_RE.test(headline)
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
  const title = headline.length > 70 ? `${headline.slice(0, 67)}…` : headline
  const mlb = opts?.flavor === 'mlb'
  return {
    title,
    description: mlb
      ? 'MLB（大谷翔平・ドジャース、村上宗隆・鈴木誠也・今永・山本由伸 など、メジャーの日本人選手・球団）に関する予想です。判定は公式戦績・MLB発表・主要報道を基準にしてください（運営の判断で確定します）。'
      : '話題・報道を踏まえた予想です。判定は公式発表・信頼できる報道を基準にしてください（運営の判断で確定します）。',
    category: defaultCategory,
    options: mlb
      ? ['起きる／ある', '起きない／ない', 'この期間では判断できない']
      : ['起きる・そうなる', '起きない・そうならない', 'どちらとも言えない'],
    endDays: Number(process.env.PDCA_DEFAULT_END_DAYS || '7') || 7,
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
            content:
              'あなたは予測市場アプリ「ヨソる」の運営者です。与えられたニュース見出しから、公序良俗に反しない短い「問い」のJSONだけを返してください。キー: title(80文字以内), description(判定基準の短文), category(利用可能カテゴリのいずれかと完全一致), options(選択肢は日本語でちょうど3つ、簡潔に), endDays(3〜14の整数、締め切りまでの日数)。',
          },
          {
            role: 'user',
            content: `利用可能な category（このいずれかと完全一致）: ${catList}\n見出し: ${item.title}${flavorNote}`,
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
      parsed.options.length < 2
    ) {
      return fallbackDraft(item.title, defaultCategory, opts)
    }
    const endDays = Math.min(14, Math.max(3, Number(parsed.endDays) || 7))
    const finalTitle =
      isBlackburnAwardsTopic(item.title) ? BLACKBURN_TITLE : String(parsed.title).slice(0, 100)
    const finalDescription = isBlackburnAwardsTopic(item.title)
      ? BLACKBURN_DESCRIPTION
      : String(parsed.description || '').slice(0, 500) ||
        fallbackDraft(item.title, defaultCategory, opts).description
    const finalOptions = isBlackburnAwardsTopic(item.title)
      ? BLACKBURN_OPTIONS
      : parsed.options!.slice(0, 5).map((s) => String(s).slice(0, 40))
    return {
      title: finalTitle,
      description: finalDescription,
      category: pickCategory(String(parsed.category || defaultCategory)),
      options: finalOptions,
      endDays,
    }
  } catch {
    return fallbackDraft(item.title, defaultCategory, opts)
  }
}
