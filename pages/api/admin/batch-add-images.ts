import type { NextApiRequest, NextApiResponse } from 'next'
import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

const CATEGORY_FALLBACK: Record<string, string> = {
  'スポーツ':       'sports stadium competition athlete',
  '経済・投資':     'stock market finance economy',
  '政治・思想':     'government politics parliament',
  'エンタメ':       'entertainment concert celebrity',
  '自然・科学':     'nature science technology',
  '旅・生活':       'travel city lifestyle',
  'こども':         'children school education',
  '恋愛':           'couple romance relationship',
  'ゲーム':         'gaming esports',
  '芸術・デザイン': 'art design creative',
  'その他':         'news world event',
}

/** Claude で各問いタイトルから画像検索用の英語キーワードを一括生成 */
async function getKeywordsBatch(
  markets: { id: number; title: string; category: string }[]
): Promise<Record<number, string>> {
  const result: Record<number, string> = {}
  const key = process.env.ANTHROPIC_API_KEY?.trim()

  if (key) {
    try {
      const client = new Anthropic({ apiKey: key })
      const numbered = markets.map((m, i) => `${i + 1}. ${m.title}`).join('\n')
      const msg = await client.messages.create({
        model: process.env.CLAUDE_DRAFT_MODEL ?? 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system:
          '各日本語の予測市場の問いに対して、ストックフォト検索に使う英語キーワードを3〜4語で答えてください。\n番号付きで1行1問。形式: "N. keyword1 keyword2 keyword3"\n余分な説明は不要。',
        messages: [{ role: 'user', content: numbered }],
      })
      const tb = msg.content.find((b) => b.type === 'text')
      const text = tb && 'text' in tb ? (tb as { text: string }).text : ''
      const lines = text.trim().split('\n')
      for (let i = 0; i < markets.length; i++) {
        const kw = (lines[i] ?? '').replace(/^\d+\.\s*/, '').trim().slice(0, 80)
        result[markets[i].id] = kw || (CATEGORY_FALLBACK[markets[i].category] ?? 'news event world')
      }
      return result
    } catch { /* fall through to category fallback */ }
  }

  for (const m of markets) {
    result[m.id] = CATEGORY_FALLBACK[m.category] ?? 'news event world'
  }
  return result
}

async function fetchImageUrl(marketId: number, keywords: string): Promise<string> {
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 4000)
    const res = await fetch(
      `https://source.unsplash.com/800x400/?${encodeURIComponent(keywords)}`,
      { redirect: 'follow', signal: controller.signal }
    )
    if (res.ok && res.url.includes('images.unsplash.com')) {
      return res.url
    }
  } catch { /* fall through */ }

  // Picsum フォールバック（市場IDシード・確実に動く）
  return `https://picsum.photos/seed/${marketId}/800/400`
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

  // Claude で全問のキーワードを一括取得
  const keywordsMap = await getKeywordsBatch(markets)

  // 画像URLを並列取得 → Supabase 更新
  const results = await Promise.allSettled(
    markets.map(async (m) => {
      const keywords = keywordsMap[m.id]
      const imageUrl = await fetchImageUrl(m.id, keywords)
      await sb.from('markets').update({ image_url: imageUrl }).eq('id', m.id)
      return { id: m.id, title: m.title, keywords, imageUrl }
    })
  )

  const updated = results.filter((r) => r.status === 'fulfilled').length
  const errors = results
    .filter((r) => r.status === 'rejected')
    .map((r) => (r as PromiseRejectedResult).reason?.message ?? 'error')

  // 残り件数
  const [cNull, cEmpty] = await Promise.all([
    sb.from('markets').select('id', { count: 'exact', head: true }).is('image_url', null),
    sb.from('markets').select('id', { count: 'exact', head: true }).eq('image_url', ''),
  ])
  const remaining = (cNull.count ?? 0) + (cEmpty.count ?? 0)

  return res.status(200).json({ updated, errors, remaining })
}
