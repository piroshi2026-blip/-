import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

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
    claude: null as unknown,
    openai: null as unknown,
  }

  // Claude テスト
  if (anthropicKey) {
    try {
      const client = new Anthropic({ apiKey: anthropicKey })
      const msg = await client.messages.create({
        model: process.env.CLAUDE_DRAFT_MODEL ?? 'claude-haiku-4-5-20251001',
        max_tokens: 50,
        messages: [{ role: 'user', content: '「テスト」とだけ返してください。' }],
      })
      const text = msg.content.find((b) => b.type === 'text')
      result.claude = { status: '✅ 接続OK', response: text && 'text' in text ? (text as { text: string }).text : '(no text)' }
    } catch (e) {
      result.claude = { status: '❌ エラー', error: e instanceof Error ? e.message : String(e) }
    }
  } else {
    result.claude = { status: '❌ キー未設定のためスキップ' }
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
