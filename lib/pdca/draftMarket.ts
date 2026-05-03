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

const SYSTEM_PROMPT_BASE = `あなたは予測市場アプリ「ヨソる」の名物企画編集長です。
「これ、どうなると思う？！気になって仕方ない！」とユーザーが感情移入できる予想問いを作ります。
JSONのみ返してください。

━━━【絶対NG：見出しを言い換えただけの問い】━━━
見出し「大谷翔平が2本塁打でドジャース勝利」
❌「大谷翔平のホームランに関する今後の展開はどうなるか？」 ← NG（曖昧な言い換えにすぎない）
✅「大谷翔平は2025年シーズンを60本塁打以上で終えられるか？」 ← OK（具体的な賭け）

見出し「石破首相が経済対策を発表」
❌「石破首相の経済対策は今後どうなるか？」 ← NG（見出しの焼き直し）
✅「石破政権は2025年内に解散総選挙に踏み切るか？」 ← OK（ドラマがある未来の問い）

━━━【良い問いの5条件】━━━
① 具体的な数字・日付・人名・組織名・スコアが入っている
② 「自分はどちら派だ」と読んで即座に意見が湧く
③ 「まさかの逆転」「歴史的快挙」「前代未聞の事態」が起きうるスケール
④ 結論が明確に出る（「何らかの影響がある」のような曖昧な終わり方はNG）
⑤ 友達に思わず「これどう思う？」と送りたくなる

━━━【ジャンル別・良い問いの例】━━━
[スポーツ・MLB]
✅「大谷翔平、今シーズン中に通算300号本塁打を達成できるか？」
✅「村上宗隆は2025年シーズンに三冠王（打率・本塁打・打点）を獲れるか？」
✅「日本代表は2026年W杯でベスト8以上に進めるか？」

[政治・社会]
✅「次の衆院選、投票率は前回（55%）を5ポイント以上上回るか？」
✅「2025年内に日本の首相が交代するか？」
✅「NHKのネット受信料、2025年度中に月額500円以上で本格徴収が始まるか？」

[経済・ビジネス]
✅「日経平均、2025年末までに史上最高値（4万円超）を更新し続けるか？」
✅「円相場、年内に1ドル130円を下回る円高局面が来るか？」

[エンタメ・文化]
✅「紅白歌合戦2025、視聴率は30%を超えるか？（2024年は31%）」
✅「今年の年間1位楽曲は、AIが制作に関与した曲になるか？」

━━━【optionsの作り方】━━━
感情が真っ二つに分かれる3択：
例）「達成する」「届かない」「番狂わせ・怪我・ルール変更で無効」
例）「勝つ」「負ける」「引き分け・延長・特例で結論持ち越し」
→ 楽観派・悲観派・第三の展開（ドラマ）の3択にする

━━━【出力キー】━━━
title（80文字以内・疑問形・読んだ瞬間に賭けたくなる表現）
description（判定基準1〜2文・必ず「正誤は公式の公表・実績・主要報道を根拠に、運営判断で確定」趣旨を含む）
category（利用可能な一覧から完全一致で選ぶ）
options（ちょうど3つ・各40文字以内）
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
            'あなたは予測市場の編集長です。見出しそのままの問いを「感情に訴える未来の賭け」に書き直します。JSONのみ返す。キー: title（80文字以内・具体的な数字や人名を含む疑問形・「これどうなるの？！」と思わせる表現）',
        },
        {
          role: 'user',
          content: `ニュース見出し（題材のみ・言葉を使い回さないこと）: ${item.title}\n${flavorNote}\nNG例（コピー気味で却下）: ${badTitle}\n\n見出しの言葉を使わず、具体的な数字・期間・人名を使い、読んだ人が感情移入できる「未来の賭け」としてのtitleだけを出力してください。`,
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
