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
    return res.status(401).json({ error: 'パスワードが違います' })
  }

  const sb = getServiceSupabase()
  const { data, error } = await sb
    .from('pdca_runs')
    .select('id, ok, payload, created_at')
    .order('created_at', { ascending: false })
    .limit(20)

  if (error) return res.status(200).json({ runs: null, tableError: error.message })
  return res.status(200).json({ runs: data ?? [] })
}
