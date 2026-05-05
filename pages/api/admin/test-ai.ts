import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

const DRAFT_SYSTEM = `あなたは予測市場アプリの編集長です。JSONオブジェクトのみ返す。コードブロック・余計な説明は不要。
出力キー: title（60文字以内）, description（1〜2文）, category（利用可能な一覧から完全一致）, options（3つ・各15文字以内・体言止め）, endDays（3〜14の整数）`

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { adminPassword } = req.body as { adminPassword?: string }
  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }

  const anthropicKey = process.env.ANTHROPIC_API_KEY?.trim()
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  const tavilyKey = process.env.TAVILY_API_KEY?.trim()

  const result: Record<string, unknown> = {
    env: {
      ANTHROPIC_API_KEY: anthropicKey ? `設定あり（先頭: ${anthropicKey.slice(0, 8)}...）` : '❌ 未設定',
      OPENAI_API_KEY: openaiKey ? `設定あり（先頭: ${openaiKey.slice(0, 8)}...）` : '❌ 未設定',
      TAVILY_API_KEY: tavilyKey ? `設定あり（先頭: ${tavilyKey.slice(0, 8)}...）` : '❌ 未設定',
      PDCA_CURRENT_CONTEXT: process.env.PDCA_CURRENT_CONTEXT || '❌ 未設定',
      CLAUDE_DRAFT_MODEL: process.env.CLAUDE_DRAFT_MODEL || '（デフォルト: claude-haiku-4-5-20251001）',
    },
    claude_ping: null as unknown,
    claude_draft: null as unknown,
    openai: null as unknown,
  }

  // Claude 接続テスト
  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey })
      const model = process.env.CLAUDE_DRAFT_MODEL ?? 'claude-haiku-4-5-20251001'
      const msg = await client.messages.create({
        model,
        max_tokens: 50,
        messages: [{ role: 'user', content: '「テスト」とだけ返してください。' }],
      })
      const textBlock = msg.content.find((b) => b.type === 'text')
      const text = textBlock && 'text' in textBlock ? (textBlock as { text: string }).text : '(no text)'
      result.claude_ping = { status: '✅ 接続OK', response: text }
    } catch (e) {
      result.claude_ping = { status: '❌ エラー', error: e instanceof Error ? e.message : String(e) }
    }

    // Claude ドラフト生成テスト（実際のプロンプトで試す）
    try {
      const client = new Anthropic({ apiKey: anthropicKey })
      const model = process.env.CLAUDE_DRAFT_MODEL ?? 'claude-haiku-4-5-20251001'
      const userContent = `利用可能な category（このいずれかと完全一致）: スポーツ / 政治 / 経済 / エンタメ / その他

ニュース見出し（題材。これをそのまま問いのタイトルにしないこと）:
大谷翔平が2本塁打でドジャース勝利`
      const msg = await client.messages.create({
        model,
        max_tokens: 600,
        system: DRAFT_SYSTEM,
        messages: [{ role: 'user', content: userContent }],
      })
      const textBlock = msg.content.find((b) => b.type === 'text')
      const rawText = textBlock && 'text' in textBlock ? (textBlock as { text: string }).text : ''
      let parseStatus = ''
      try {
        const obj = JSON.parse(rawText.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/)?.[1]?.trim() ?? rawText.match(/\{[\s\S]*\}/)?.[0] ?? rawText)
        parseStatus = obj.title ? `✅ パース成功: title="${obj.title}"` : '⚠️ titleなし'
      } catch {
        parseStatus = '❌ JSONパース失敗'
      }
      result.claude_draft = { status: parseStatus, rawResponse: rawText.slice(0, 800) }
    } catch (e) {
      result.claude_draft = { status: '❌ エラー', error: e instanceof Error ? e.message : String(e) }
    }
  } else {
    result.claude_ping = { status: '❌ キー未設定のためスキップ' }
    result.claude_draft = { status: '❌ キー未設定のためスキップ' }
  }

  // OpenAI テスト
  if (openaiKey) {
    try {
      const r = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${openaiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          max_tokens: 10,
          messages: [{ role: 'user', content: '「テスト」とだけ返して' }],
        }),
      })
      if (r.ok) {
        const d = (await r.json()) as { choices?: { message?: { content?: string } }[] }
        result.openai = { status: '✅ 接続OK', response: d.choices?.[0]?.message?.content }
      } else {
        result.openai = { status: `❌ HTTPエラー ${r.status}`, body: await r.text() }
      }
    } catch (e) {
      result.openai = { status: '❌ エラー', error: e instanceof Error ? e.message : String(e) }
    }
  } else {
    result.openai = { status: '❌ キー未設定のためスキップ' }
  }

  return res.status(200).json(result)
}
