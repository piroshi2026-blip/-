import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { generateDraftCandidate, preloadDraftData } from '../../../lib/pdca/generateDraft'
import { formatWorldContextForPrompt } from '../../../lib/pdca/fetchContext'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { adminPassword, count = 5, hint, debug } = req.body as {
    adminPassword?: string
    count?: number
    hint?: string
    debug?: boolean
  }

  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }

  // デバッグモード: Claudeの実際のレスポンスを直接確認
  if (debug) {
    const key = process.env.ANTHROPIC_API_KEY?.trim()
    if (!key) return res.status(200).json({ debug: { error: 'ANTHROPIC_API_KEY 未設定' } })
    try {
      const preloaded = await preloadDraftData()
      const worldContext = formatWorldContextForPrompt(preloaded.worldCtx)
      const catList = preloaded.allowedCategories.length
        ? preloaded.allowedCategories.join(' / ')
        : preloaded.defaultCategory
      const userContent = `${worldContext}\n\n利用可能な category（このいずれかと完全一致）: ${catList}\n\nニュース見出し（題材。これをそのまま問いのタイトルにしないこと）:\nカンボジアで日本人を保護 誘拐か`
      const client = new Anthropic({ apiKey: key })
      const msg = await client.messages.create({
        model: process.env.CLAUDE_DRAFT_MODEL ?? 'claude-haiku-4-5-20251001',
        max_tokens: 600,
        system: 'あなたは予測市場「ヨソる」の編集長です。ニュース見出しをもとに「読んだ瞬間に予想したくなる問い」を作ります。\nJSONオブジェクトのみ返す。コードブロック・説明文は不要。\n\n必須キー（すべて含めること）:\ntitle: 問いのタイトル。見出しそのままは禁止。具体的な数字・人名・期日を入れた「〜するか？」形式・60文字以内\ndescription: 判定基準1〜2文。「公式の公表・実績・主要報道を根拠に、運営判断で確定します。」趣旨を含む\ncategory: 利用可能なカテゴリ一覧から完全一致で1つ選ぶ\noptions: ちょうど3つの選択肢（各15文字以内・体言止め）\nendDays: 3〜14の整数\n\n出力例:\n{"title":"大谷翔平、今季65本塁打の新記録を更新するか？","description":"2026年シーズン終了時点の本塁打数で判定。公式記録を根拠に、運営判断で確定します。","category":"スポーツ","options":["更新する","届かず","怪我・規定変更で無効"],"endDays":7}',
        messages: [{ role: 'user', content: userContent }],
      })
      const textBlock = msg.content.find((b) => b.type === 'text')
      const rawText = textBlock && 'text' in textBlock ? (textBlock as { text: string }).text : ''
      return res.status(200).json({
        debug: {
          userContent: userContent.slice(0, 600),
          rawClaudeResponse: rawText.slice(0, 800),
          categories: catList.slice(0, 200),
          worldContext: worldContext.slice(0, 300),
        }
      })
    } catch (e) {
      return res.status(200).json({ debug: { error: e instanceof Error ? e.message : String(e) } })
    }
  }

  const n = Math.min(15, Math.max(1, Number(count) || 10))
  const hintText = typeof hint === 'string' ? hint.trim().slice(0, 500) : ''

  // worldCtx・トレンド・カテゴリを1回だけ取得（Tavily でトレンド系トピックも補完）
  const preloaded = await preloadDraftData(undefined, { enrichWithTavily: true })

  // プールをシャッフルして各カードに別々のニュース記事を割り当て（重複防止）
  const shuffled = [...preloaded.pool].sort(() => Math.random() - 0.5)

  const results = await Promise.allSettled(
    Array.from({ length: n }, (_, i) => {
      const item = shuffled[i % shuffled.length]
      return generateDraftCandidate(undefined, hintText, preloaded, true, item)
    })
  )

  const candidates = results.map((r) =>
    r.status === 'fulfilled'
      ? r.value
      : { error: (r as PromiseRejectedResult).reason?.message ?? '生成エラー' }
  )

  return res.status(200).json({ candidates })
}
