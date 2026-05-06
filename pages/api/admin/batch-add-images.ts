import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

const CATEGORY_KEYWORDS: Record<string, string> = {
  'スポーツ':       'sports stadium competition athlete',
  '経済・投資':     'stock market finance economy',
  '政治・思想':     'government politics parliament',
  'エンタメ':       'entertainment concert celebrity stage',
  '自然・科学':     'nature science technology',
  '旅・生活':       'travel city lifestyle',
  'こども':         'children school education',
  '恋愛':           'couple romance relationship',
  'ゲーム':         'gaming esports video game',
  '芸術・デザイン': 'art design creative',
  'その他':         'news world event',
}

const MLB_RE = /大谷|ドジャー|村上|鈴木誠也|今永|佐々木朗希|千賀|MLB|メジャー|本塁打|投手|打者|baseball/i

function getKeywords(title: string, category: string): string {
  if (MLB_RE.test(title)) return 'baseball stadium MLB player action'
  return CATEGORY_KEYWORDS[category] ?? 'news world event'
}

async function fetchImageUrl(marketId: number, title: string, category: string): Promise<string> {
  const keywords = getKeywords(title, category)

  // Unsplash Source（APIキー不要・リダイレクト先の実画像URLを取得）
  try {
    const controller = new AbortController()
    setTimeout(() => controller.abort(), 3500)
    const res = await fetch(
      `https://source.unsplash.com/800x400/?${encodeURIComponent(keywords)}`,
      { redirect: 'follow', signal: controller.signal }
    )
    if (res.ok && res.url.includes('images.unsplash.com')) {
      return res.url
    }
  } catch { /* fall through */ }

  // フォールバック: Picsum（ID をシードにした一貫した写真）
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

  // 20件を並列処理
  const results = await Promise.allSettled(
    markets.map(async (m) => {
      const imageUrl = await fetchImageUrl(m.id, m.title, m.category)
      await sb.from('markets').update({ image_url: imageUrl }).eq('id', m.id)
      return { id: m.id, imageUrl }
    })
  )

  const updated = results.filter((r) => r.status === 'fulfilled').length
  const errors = results
    .filter((r) => r.status === 'rejected')
    .map((r) => (r as PromiseRejectedResult).reason?.message ?? 'error')

  // まだ残っているか確認（NULL + 空文字の合計）
  const [cNull, cEmpty] = await Promise.all([
    sb.from('markets').select('id', { count: 'exact', head: true }).is('image_url', null),
    sb.from('markets').select('id', { count: 'exact', head: true }).eq('image_url', ''),
  ])
  const count = (cNull.count ?? 0) + (cEmpty.count ?? 0)

  return res.status(200).json({ updated, errors, remaining: count })
}
