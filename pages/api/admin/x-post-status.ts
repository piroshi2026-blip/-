import type { NextApiRequest, NextApiResponse } from 'next'
import { isAutoPostEnabled } from '../../../lib/pdca/postX'

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

  const enabled = isAutoPostEnabled()
  const hasCredentials = Boolean(
    process.env.TWITTER_API_KEY?.trim() &&
    process.env.TWITTER_API_SECRET?.trim() &&
    process.env.TWITTER_ACCESS_TOKEN?.trim() &&
    process.env.TWITTER_ACCESS_SECRET?.trim()
  )
  const disabledByEnv = process.env.DISABLE_X_POST === 'true'

  return res.status(200).json({
    enabled,
    hasCredentials,
    disabledByEnv,
    message: !hasCredentials
      ? 'TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET を環境変数に設定してください'
      : disabledByEnv
        ? 'DISABLE_X_POST=true が設定されているため無効です。削除すると有効になります。'
        : '✅ X 自動投稿は有効です',
  })
}
