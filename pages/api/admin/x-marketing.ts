import type { NextApiRequest, NextApiResponse } from 'next'
import { executeXMarketingPost } from '../../../lib/pdca/xMarketing'
import type { TweetType } from '../../../lib/pdca/xMarketing'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { adminPassword, type } = req.body as { adminPassword?: string; type?: string }
  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }

  const validTypes = ['new_market', 'result_announce', 'education', 'trend_hook', 'engagement']
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({ error: `type は ${validTypes.join(', ')} のいずれかを指定してください` })
  }

  const result = await executeXMarketingPost(type as any)
  return res.status(200).json(result)
}
