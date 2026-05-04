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
  const hint = oneLine.length > 30 ? `${oneLine.slice(0, 27)}…` : oneLine
  return `${hint}、この先どう動く？`
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
      ? ['達成・上回る', '届かず・下回る', '番狂わせ（怪我・規定変更など）']
      : ['そうなる', 'そうならない', '別の形で決着'],
    endDays: Number(process.env.PDCA_DEFAULT_END_DAYS || '7') || 7,
  }
}

const SYSTEM_PROMPT_BASE = `あなたは予測市場アプリ「ヨソる」の名物企画編集長です。
Polymarket・Kalshiのような「読んだ瞬間に賭けたくなる」問いを作ります。
JSONのみ返してください。

━━━【タイトルの絶対ルール】━━━
・「【予想】」「【問い】」「【注目】」などの角括弧プレフィックスは絶対に付けない
・ニュース見出しを「○○」と引用形式でタイトルに入れない
・「〜と報じられていますが」「〜という話題について」のような間接表現は使わない
・タイトルは30〜50文字が理想（長くても60文字まで）

━━━【絶対NG：見出しを言い換えただけの問い】━━━
見出し「大谷翔平が2本塁打でドジャース勝利」
❌「【予想】大谷翔平のホームランに関する今後の展開はどうなるか？」← NG
❌「「大谷翔平が2本塁打」と報じられていますが継続するでしょうか？」← NG
✅「大谷翔平、今シーズン60本塁打超えを達成できるか？」← OK

見出し「石破首相が経済対策を発表」
❌「石破首相の経済対策は今後どうなるか？」← NG
✅「石破政権は2026年内に解散総選挙に踏み切るか？」← OK

━━━【Polymarket風・理想タイトル例】━━━
「イラン政権は5月末までに崩壊するか？」
「ビットコイン、年末までに1500万円を超えるか？」
「2026年NBAチャンピオンはどのチーム？」
「次の衆院選、自民党は単独過半数を維持できるか？」
「大谷翔平、今季MVP受賞なるか？」
「日銀、次の会合で利上げに踏み切るか？」

━━━【良い問いの5条件】━━━
① 具体的な数字・日付・人名・組織名・スコアが入っている
② 「自分はどちら派だ」と読んで即座に意見が湧く
③ 結論が明確に出る（「何らかの影響がある」は絶対NG）
④ 30〜50文字で完結している（長い文章はNG）
⑤ 友達に思わず「これどう思う？」と送りたくなる

━━━【ジャンル別・良い問いの例】━━━
[スポーツ・MLB]
✅「大谷翔平、今シーズン通算300号本塁打を達成できるか？」
✅「村上宗隆は今季三冠王（打率・本塁打・打点）を獲れるか？」
✅「日本代表は2026年W杯でベスト8以上に進めるか？」

[政治・社会]
✅「次の衆院選、投票率は前回より5ポイント以上上回るか？」
✅「2026年内に日本の首相が交代するか？」
✅「NHKのネット受信料、今年度中に月500円以上で本格徴収が始まるか？」

[経済・ビジネス]
✅「日経平均、今年末に4万5000円を超えるか？」
✅「円相場、年内に1ドル130円を下回る円高局面が来るか？」

[エンタメ・文化]
✅「紅白歌合戦2026、視聴率は30%を超えるか？」
✅「今年の年間1位楽曲はAI制作曲になるか？」

━━━【optionsの作り方】━━━
感情が真っ二つに分かれる3択。楽観派・悲観派・番狂わせの3択にする：
例）「達成する」「届かない」「怪我・ルール変更で無効」
例）「勝つ」「負ける」「延長・引き分けで持ち越し」
各選択肢は15文字以内・体言止めで歯切れよく。

━━━【出力キー】━━━
title（60文字以内・プレフィックスなし・読んだ瞬間に賭けたくなる）
description（判定基準1〜2文・必ず「正誤は公式の公表・実績・主要報道を根拠に、運営判断で確定」趣旨を含む）
category（利用可能な一覧から完全一致で選ぶ）
options（ちょうど3つ・各15文字以内・体言止め）
endDays（3〜14の整数）`

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
            'あなたは予測市場の編集長です。見出しそのままの問いを「感情に訴える未来の賭け」に書き直します。JSONのみ返す。キー: title（60文字以内・「【予想】」などプレフィックス禁止・見出しを「」で引用しない・具体的な数字や人名を含む疑問形または体言止め）',
        },
        {
          role: 'user',
          content: `ニュース見出し（題材のみ・言葉を使い回さないこと）: ${item.title}\n${flavorNote}\nNG例（コピー気味で却下）: ${badTitle}\n\n見出しの言葉を使わず、Polymarket風に「イラン政権は5月末までに崩壊するか？」のような具体的な数字・期間・人名を使い、読んだ人が賭けたくなるtitleだけを出力してください。`,
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
