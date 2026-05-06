import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

/** Claude で問いタイトルから Wikipedia 検索ワードを1つ抽出 */
async function getSearchTerm(title: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (!key) return title.slice(0, 20)
  try {
    const client = new Anthropic({ apiKey: key })
    const msg = await client.messages.create({
      model: process.env.CLAUDE_DRAFT_MODEL ?? 'claude-haiku-4-5-20251001',
      max_tokens: 20,
      system: '日本語の予測市場の問いから、Wikipedia検索に使う固有名詞を1つだけ返してください。人物・球団・企業・政党などを優先。余分な説明は不要。\n例: 「大谷翔平は今季65本塁打を超えるか？」→ 大谷翔平\n例: 「次の参院選で自民党が過半数割れするか？」→ 自民党',
      messages: [{ role: 'user', content: title }],
    })
    const tb = msg.content.find((b) => b.type === 'text')
    const term = tb && 'text' in tb ? (tb as { text: string }).text.trim().slice(0, 50) : ''
    return term || title.slice(0, 20)
  } catch {
    return title.slice(0, 20)
  }
}

/** Wikipedia API で画像URLを取得（日本語 → 英語の順で試す） */
async function fetchWikipediaImage(searchTerm: string): Promise<string | null> {
  for (const lang of ['ja', 'en']) {
    try {
      const controller = new AbortController()
      setTimeout(() => controller.abort(), 3000)
      const url =
        `https://${lang}.wikipedia.org/w/api.php?action=query` +
        `&titles=${encodeURIComponent(searchTerm)}` +
        `&prop=pageimages&format=json&pithumbsize=800&redirects=1`
      const res = await fetch(url, { signal: controller.signal })
      if (!res.ok) continue
      const data = (await res.json()) as {
        query?: { pages?: Record<string, { thumbnail?: { source: string } }> }
      }
      const pages = Object.values(data.query?.pages ?? {})
      const src = pages[0]?.thumbnail?.source
      if (src) return src
    } catch { continue }
  }
  return null
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

  const searchTerm = await getSearchTerm(market.title)
  const wikiImage = await fetchWikipediaImage(searchTerm)
  const imageUrl = wikiImage ?? `https://picsum.photos/seed/${market.id}/800/400`

  const { error: updateError } = await sb
    .from('markets')
    .update({ image_url: imageUrl })
    .eq('id', market.id)

  if (updateError) {
    return res.status(500).json({ error: `DB更新失敗: ${updateError.message}` })
  }

  return res.status(200).json({ imageUrl, searchTerm, source: wikiImage ? 'wikipedia' : 'picsum' })
}
