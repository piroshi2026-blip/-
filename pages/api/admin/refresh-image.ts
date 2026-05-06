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

async function getKeywords(title: string, category: string): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY?.trim()
  if (key) {
    try {
      const client = new Anthropic({ apiKey: key })
      const msg = await client.messages.create({
        model: process.env.CLAUDE_DRAFT_MODEL ?? 'claude-haiku-4-5-20251001',
        max_tokens: 25,
        system: 'Output 3-4 English keywords for a stock photo search based on the Japanese text. Keywords only, space-separated, no punctuation.',
        messages: [{ role: 'user', content: title }],
      })
      const tb = msg.content.find((b) => b.type === 'text')
      const kw = tb && 'text' in tb ? (tb as { text: string }).text.trim().slice(0, 80) : ''
      if (kw) return kw
    } catch { /* fall through */ }
  }
  return CATEGORY_FALLBACK[category] ?? 'news world event'
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

  // Claude でキーワード生成（失敗してもカテゴリフォールバック）
  const keywords = await getKeywords(market.title, market.category)

  // Picsum（確実に動く・marketId ベースのシードで一貫した画像）
  const imageUrl = `https://picsum.photos/seed/${market.id}/800/400`

  const { error: updateError } = await sb
    .from('markets')
    .update({ image_url: imageUrl })
    .eq('id', market.id)

  if (updateError) {
    return res.status(500).json({ error: `DB更新失敗: ${updateError.message}` })
  }

  return res.status(200).json({ imageUrl, keywords })
}
