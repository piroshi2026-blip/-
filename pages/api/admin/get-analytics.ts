import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { adminPassword } = req.body as { adminPassword?: string }
  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Unauthorized' })
  }

  const sb = getServiceSupabase()
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const { data, error } = await sb
    .from('page_views')
    .select('page, viewed_at')
    .gte('viewed_at', since)
    .order('viewed_at', { ascending: false })

  if (error) return res.status(200).json({ error: error.message })

  // 日別集計（JST）
  const byDay: Record<string, number> = {}
  for (const row of data ?? []) {
    const d = new Date(row.viewed_at)
    const jstDate = new Date(d.getTime() + 9 * 60 * 60 * 1000)
    const key = jstDate.toISOString().slice(0, 10)
    byDay[key] = (byDay[key] ?? 0) + 1
  }

  const today = new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const yesterday = new Date(Date.now() + 9 * 60 * 60 * 1000 - 86400000).toISOString().slice(0, 10)

  return res.status(200).json({
    today: byDay[today] ?? 0,
    yesterday: byDay[yesterday] ?? 0,
    byDay,
    total7days: (data ?? []).length,
  })
}
