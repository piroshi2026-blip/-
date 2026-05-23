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
  const [profilesRes, authRes] = await Promise.all([
    sb.from('profiles').select('*').order('point_balance', { ascending: false }),
    sb.auth.admin.listUsers({ perPage: 1000 }),
  ])

  const profiles = profilesRes.data ?? []
  const emailMap: Record<string, string> = {}
  for (const u of authRes.data?.users ?? []) {
    emailMap[u.id] = u.email ?? ''
  }

  return res.status(200).json({
    users: profiles.map(p => ({ ...p, email: emailMap[p.id] ?? '' })),
  })
}
