import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

/** Claude で全問の Wikipedia 検索ワードを一括生成 */
async function getSearchTermsBatch(
  markets: { id: number; title: string }[]
): Promise<Record<number, string>> {
  const result: Record<number, string> = {}
  const key = process.env.ANTHROPIC_API_KEY?.trim()

  if (key) {
    try {
      const client = new Anthropic({ apiKey: key })
      const prompt = markets.map((m, i) => `${i + 1}. ${m.title}`).join('\n')
      const msg = await client.messages.create({
        model: process.env.CLAUDE_DRAFT_MODEL ?? 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system:
          '各問いから、Wikipedia検索に最適な固有名詞を1つ抽出。人物・球団・企業・政党などを優先。\n番号付きで1行1問。形式: "N. 検索ワード"\n余分な説明不要。',
        messages: [{ role: 'user', content: prompt }],
      })
      const tb = msg.content.find((b) => b.type === 'text')
      const text = tb && 'text' in tb ? (tb as { text: string }).text : ''
      const lines = text.trim().split('\n')
      for (let i = 0; i < markets.length; i++) {
        const term = (lines[i] ?? '').replace(/^\d+\.\s*/, '').trim().slice(0, 50)
        result[markets[i].id] = term || markets[i].title.slice(0, 20)
      }
      return result
    } catch { /* fall through */ }
  }

  for (const m of markets) result[m.id] = m.title.slice(0, 20)
  return result
}

/** Wikipedia API で画像URLを取得 */
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

  const { adminPassword } = req.body as { adminPassword?: string }
  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }

  const sb = getServiceSupabase()

  // image_url が NULL または空文字の問いを取得
  const [nullRes, emptyRes] = await Promise.all([
    sb.from('markets').select('id, title, category').is('image_url', null).order('id', { ascending: false }).limit(20),
    sb.from('markets').select('id, title, category').eq('image_url', '').order('id', { ascending: false }).limit(20),
  ])
  const seen = new Set<number>()
  const markets = [...(nullRes.data ?? []), ...(emptyRes.data ?? [])]
    .filter((m) => { if (seen.has(m.id)) return false; seen.add(m.id); return true })
    .slice(0, 20)

  if (!markets.length) {
    return res.status(200).json({ updated: 0, remaining: 0, message: '画像なしの問いはありません' })
  }

  // Claude で検索ワードを一括取得
  const searchTerms = await getSearchTermsBatch(markets)

  // Wikipedia 画像を並列取得 → Supabase 更新
  const results = await Promise.allSettled(
    markets.map(async (m) => {
      const term = searchTerms[m.id]
      const wikiImage = await fetchWikipediaImage(term)
      const imageUrl = wikiImage ?? `https://picsum.photos/seed/${m.id}/800/400`
      await sb.from('markets').update({ image_url: imageUrl }).eq('id', m.id)
      return { id: m.id, term, imageUrl, source: wikiImage ? 'wikipedia' : 'picsum' }
    })
  )

  const updated = results.filter((r) => r.status === 'fulfilled').length
  const details = results
    .filter((r) => r.status === 'fulfilled')
    .map((r) => (r as PromiseFulfilledResult<{ id: number; term: string; source: string }>).value)

  // 残り件数
  const [cNull, cEmpty] = await Promise.all([
    sb.from('markets').select('id', { count: 'exact', head: true }).is('image_url', null),
    sb.from('markets').select('id', { count: 'exact', head: true }).eq('image_url', ''),
  ])
  const remaining = (cNull.count ?? 0) + (cEmpty.count ?? 0)

  return res.status(200).json({ updated, remaining, details })
}
