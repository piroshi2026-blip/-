import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceSupabase } from '../../lib/pdca/supabaseAdmin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') return res.status(405).end()
  const { page = '/' } = req.body as { page?: string }
  try {
    const sb = getServiceSupabase()
    await sb.from('page_views').insert({ page })
  } catch { /* ignore */ }
  return res.status(204).end()
}
