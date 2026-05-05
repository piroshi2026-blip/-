import type { TrendItem } from './fetchTrends'
import Anthropic from '@anthropic-ai/sdk'

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
Polymarket・Kalshiのような「読んだ瞬間に予想したくなる」問いを作ります。
目標はフォロワー獲得・新規ユーザー増加・X拡散。マーケティング視点を最優先にしてください。
JSONのみ返してください。

━━━【バズらせる問いの3条件】━━━
① Xで議論が二極化する：賛否がくっきり分かれ、リプで言い争いが起きる
② シェアしたくなる：「これ友達に聞いてみたい」「タイムラインに流したい」と思わせる
③ 今この瞬間のトレンドと直結：Xトレンド・速報ニュース・直近の炎上と絡める

━━━【新規ユーザーを引き込む問いの特徴】━━━
・誰でも知っている人物・球団・ブランド名が入っている（大谷・ONE PIECE・任天堂等）
・「答えが近い未来に出る」：1週間〜1か月以内に結果がわかる
・「自分ごと」として感じられる：物価・給料・推しアーティスト・スポーツ成績

━━━【タイトルの絶対ルール】━━━
・「【予想】」「【問い】」「【注目】」などの角括弧プレフィックスは絶対に付けない
・ニュース見出しを「○○」と引用形式でタイトルに入れない
・「〜と報じられていますが」「〜という話題について」のような間接表現は使わない
・タイトルは30〜50文字が理想（長くても60文字まで）

━━━【絶対NG：見出しを言い換えただけの問い】━━━
見出し「大谷翔平が2本塁打でドジャース勝利」
❌「大谷翔平のホームランは今後も続くか？」← NG（見出しのコピー）
✅「大谷翔平、今シーズン65本塁打を超えるか？」← OK（具体的数字・挑戦的）

見出し「石破首相が経済対策を発表」
❌「石破首相の経済対策は効果があるか？」← NG（曖昧）
✅「石破政権、2026年内に内閣不信任案が可決されるか？」← OK（具体・драマチック）

━━━【Polymarket風・バズる理想タイトル例】━━━
「大谷翔平、今季65本塁打の新記録を更新するか？」
「ビットコイン、2026年末に2000万円を突破するか？」
「日本代表、2026年W杯でベスト8進出なるか？」
「次の衆院選、自民党が単独過半数を失うか？」
「日銀、2026年内にマイナス金利に逆戻りするか？」
「藤井聡太、今年度全8タイトル防衛できるか？」
「円相場、2026年内に1ドル120円を下回るか？」

━━━【良い問いの5条件】━━━
① 具体的な数字・日付・人名・組織名が入っている（「ある程度」は絶対NG）
② 「自分はどっち派」と読んで0.5秒で意見が出る
③ 結論が明確に出る日が決まっている
④ 30〜50文字で完結（長い文章はNG）
⑤ Xで「これどう思う？」とリプ・RTしたくなる炎上ポテンシャルがある

━━━【ジャンル別・バズる問いの例】━━━
[スポーツ・MLB]
✅「大谷翔平、今シーズン通算300号本塁打を達成できるか？」
✅「村上宗隆は今季三冠王（打率・本塁打・打点）を獲れるか？」
✅「日本代表は2026年W杯でベスト8以上に進めるか？」

[政治・社会]
✅「次の参院選、自民・公明の与党が過半数割れするか？」
✅「2026年内に日本の首相が交代するか？」
✅「NHKのネット受信料、月500円以上で年内徴収が始まるか？」

[経済・ビジネス]
✅「日経平均、2026年内に5万円を超えるか？」
✅「円相場、年内に1ドル120円を下回る円高が来るか？」
✅「トヨタ、2027年末までに完全自動運転を市販化できるか？」

[エンタメ・文化・AI]
✅「紅白歌合戦2026、視聴率30%超えを達成するか？」
✅「2026年内に生成AIが日本の国家資格試験で合格点を取るか？」
✅「任天堂Switch 2、年内出荷台数1000万台を突破するか？」

━━━【optionsの作り方】━━━
感情が真っ二つに分かれる3択。楽観派・悲観派・番狂わせの3択：
例）「達成・超える」「届かず」「怪我・制度変更で無効」
例）「勝つ」「負ける」「延長・引き分けで持ち越し」
各選択肢は15文字以内・体言止めで歯切れよく。

━━━【出力キー】━━━
title（60文字以内・プレフィックスなし・読んだ瞬間に予想したくなる・Xでバズるポテンシャルあり）
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

function extractJsonFromText(text: string): string {
  const block = text.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)
  if (block) return block[1].trim()
  const obj = text.match(/\{[\s\S]*\}/)
  if (obj) return obj[0]
  return text.trim()
}

async function callClaudeForDraft(userContent: string): Promise<Partial<DraftMarket> | null> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return null
  try {
    const client = new Anthropic({ apiKey: key })
    const msg = await client.messages.create({
      model: process.env.CLAUDE_DRAFT_MODEL ?? 'claude-haiku-4-5-20251001',
      max_tokens: 600,
      system: SYSTEM_PROMPT_BASE + '\n\nJSONオブジェクトのみ返す。コードブロック・余計な説明は不要。',
      messages: [{ role: 'user', content: userContent }],
    })
    const textBlock = msg.content.find((b) => b.type === 'text')
    const text = textBlock && 'text' in textBlock ? (textBlock.text as string) : undefined
    if (!text) return null
    const parsed = JSON.parse(extractJsonFromText(text)) as Partial<DraftMarket>
    if (!parsed.title || !Array.isArray(parsed.options) || parsed.options.length < 3) return null
    return parsed
  } catch {
    return null
  }
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
            'あなたは予測市場の編集長です。見出しそのままの問いを「感情に訴える未来の予想」に書き直します。JSONのみ返す。キー: title（60文字以内・「【予想】」などプレフィックス禁止・見出しを「」で引用しない・具体的な数字や人名を含む疑問形または体言止め）',
        },
        {
          role: 'user',
          content: `ニュース見出し（題材のみ・言葉を使い回さないこと）: ${item.title}\n${flavorNote}\nNG例（コピー気味で却下）: ${badTitle}\n\n見出しの言葉を使わず、Polymarket風に「イラン政権は5月末までに崩壊するか？」のような具体的な数字・期間・人名を使い、読んだ人が予想したくなるtitleだけを出力してください。`,
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
  opts?: { flavor?: 'general' | 'mlb'; worldContext?: string; hint?: string }
): Promise<DraftMarket> {
  const flavor = opts?.flavor ?? 'general'
  const pickCategory = (raw: string) => {
    const c = raw.trim()
    if (allowedCategories.includes(c)) return c
    if (allowedCategories.includes('その他')) return 'その他'
    return defaultCategory
  }

  const claudeKey = process.env.ANTHROPIC_API_KEY?.trim()
  const openaiKey = process.env.OPENAI_API_KEY?.trim()

  if (!claudeKey && !openaiKey) {
    return fallbackDraft(item.title, defaultCategory, opts)
  }

  const catList = allowedCategories.length ? allowedCategories.join(' / ') : defaultCategory
  const flavorNote =
    flavor === 'mlb'
      ? '\nこの見出しは大谷翔平・ドジャース、村上宗隆・鈴木誠也・今永 など、メジャーリーグの日本人選手・球団に関するスポーツ予想です。category は「スポーツ」が利用可能なら優先してください。'
      : ''
  const contextPrefix = opts?.worldContext ? `${opts.worldContext}\n\n` : ''
  const hintSection = opts?.hint ? `\n\n【編集者からの着眼点・方向性】\n${opts.hint}\n上記の着眼点を意識しながら、ニュース見出しを題材に問いを作ること。` : ''
  const userContent = `${contextPrefix}利用可能な category（このいずれかと完全一致）: ${catList}\n\nニュース見出し（題材。これをそのまま問いのタイトルにしないこと）:\n${item.title}${flavorNote}${hintSection}`

  let parsed: Partial<DraftMarket> | null = null

  // Claude 優先（日本語品質が高い）
  if (claudeKey) {
    parsed = await callClaudeForDraft(userContent)
  }

  // OpenAI フォールバック
  if (!parsed && openaiKey) {
    try {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          temperature: 0.4,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: SYSTEM_PROMPT_BASE },
            { role: 'user', content: userContent },
          ],
        }),
      })
      if (res.ok) {
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] }
        const raw = data.choices?.[0]?.message?.content
        if (raw) {
          const p = JSON.parse(raw) as Partial<DraftMarket>
          if (p.title && Array.isArray(p.options) && p.options.length >= 3) parsed = p
        }
      }
    } catch { /* fallback below */ }
  }

  if (!parsed) return fallbackDraft(item.title, defaultCategory, opts)

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
}
