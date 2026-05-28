import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { adminPassword } = req.body as { adminPassword?: string }
  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const sb = getServiceSupabase()

  const [analysisRes, postsRes] = await Promise.all([
    sb.from('x_analysis').select('insights, last_analyzed').limit(1).maybeSingle(),
    sb.from('x_posts').select('tweet_id, posted_at, topic, content, likes, retweets, replies, quotes, impressions, bookmarks, score').order('posted_at', { ascending: false }).limit(30),
  ])

  return res.status(200).json({
    insights: (analysisRes.data as any)?.insights ?? null,
    lastAnalyzed: (analysisRes.data as any)?.last_analyzed ?? null,
    posts: postsRes.data ?? [],
  })
}
