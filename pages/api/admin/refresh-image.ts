import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'
import { fetchImageViaSearch, fetchWikipediaImage } from '../../../lib/pdca/fetchImage'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

async function getWikipediaSearchTerm(title: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return title.slice(0, 20)
  try {
    const client = new Anthropic({ apiKey: key })
    const msg = await client.messages.create({
      model: process.env.CLAUDE_DRAFT_MODEL ?? 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      system: '日本語の予測市場の問いから、Wikipedia検索に使う固有名詞を1つだけ返す。人物・球団・企業・政党を優先。余分な説明不要。',
      messages: [{ role: 'user', content: title }],
    })
    const tb = msg.content.find((b) => b.type === 'text')
    return (tb && 'text' in tb ? (tb as { text: string }).text.trim() : '').slice(0, 50) || title.slice(0, 20)
  } catch {
    return title.slice(0, 20)
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { adminPassword, marketId } = req.body as { adminPassword?: string; marketId?: number }
  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }
  if (!marketId) return res.status(400).json({ error: 'marketId が必要です' })

  const sb = getServiceSupabase()
  const { data: market, error: fetchError } = await sb
    .from('markets')
    .select('id, title, category')
    .eq('id', marketId)
    .single()

  if (fetchError || !market) {
    return res.status(404).json({ error: `問いが見つかりません: ${fetchError?.message ?? ''}` })
  }

  // Tavily（ネット記事）と Wikipedia を並列実行。先に取れた方を使う
  const wikiTermPromise = getWikipediaSearchTerm(market.title)
  const [tavilyResult, wikiTermResult] = await Promise.allSettled([
    fetchImageViaSearch(market.title),
    wikiTermPromise,
  ])

  const tavilyImage = tavilyResult.status === 'fulfilled' ? tavilyResult.value : null
  const wikiTerm = wikiTermResult.status === 'fulfilled' ? wikiTermResult.value : market.title.slice(0, 20)
  const wikiImage = tavilyImage ? null : await fetchWikipediaImage(wikiTerm)

  const imageUrl = tavilyImage ?? wikiImage ?? `https://picsum.photos/seed/${market.id}/800/400`
  const source = tavilyImage ? 'tavily' : wikiImage ? 'wikipedia' : 'picsum'

  const { error: updateError } = await sb
    .from('markets')
    .update({ image_url: imageUrl })
    .eq('id', market.id)

  if (updateError) {
    return res.status(500).json({ error: `DB更新失敗: ${updateError.message}` })
  }

  return res.status(200).json({ imageUrl, wikiTerm, source })
}
