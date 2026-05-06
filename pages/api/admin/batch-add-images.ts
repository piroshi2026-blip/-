import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'
import { fetchImageViaSearch, fetchWikipediaImage } from '../../../lib/pdca/fetchImage'

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

  // Tavily検索（ネット記事）と Wikipedia ワード取得を並列で準備
  const [tavilyResults, wikiTerms] = await Promise.all([
    // 各問いで Tavily 検索を並列実行
    Promise.allSettled(markets.map((m) => fetchImageViaSearch(m.title))),
    // Claude で Wikipedia 検索ワードを一括取得
    getSearchTermsBatch(markets),
  ])

  // Wikipedia 画像が必要な問いのみ取得
  const needsWiki = markets.filter(
    (_, i) => !(tavilyResults[i].status === 'fulfilled' && tavilyResults[i].status === 'fulfilled' && (tavilyResults[i] as PromiseFulfilledResult<string | null>).value)
  )
  const wikiImages: Record<number, string | null> = {}
  await Promise.allSettled(
    needsWiki.map(async (m) => {
      wikiImages[m.id] = await fetchWikipediaImage(wikiTerms[m.id])
    })
  )

  // Supabase 更新
  const updateResults = await Promise.allSettled(
    markets.map(async (m, i) => {
      const tavilyImg = tavilyResults[i].status === 'fulfilled'
        ? (tavilyResults[i] as PromiseFulfilledResult<string | null>).value
        : null
      const imageUrl = tavilyImg ?? wikiImages[m.id] ?? `https://picsum.photos/seed/${m.id}/800/400`
      const source = tavilyImg ? 'tavily' : wikiImages[m.id] ? 'wikipedia' : 'picsum'
      await sb.from('markets').update({ image_url: imageUrl }).eq('id', m.id)
      return { id: m.id, source, imageUrl }
    })
  )

  const updated = updateResults.filter((r) => r.status === 'fulfilled').length
  const details = updateResults
    .filter((r) => r.status === 'fulfilled')
    .map((r) => (r as PromiseFulfilledResult<{ id: number; source: string }>).value)

  const [cNull, cEmpty] = await Promise.all([
    sb.from('markets').select('id', { count: 'exact', head: true }).is('image_url', null),
    sb.from('markets').select('id', { count: 'exact', head: true }).eq('image_url', ''),
  ])
  const remaining = (cNull.count ?? 0) + (cEmpty.count ?? 0)

  return res.status(200).json({ updated, remaining, details })
}
