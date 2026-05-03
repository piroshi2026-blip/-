import type { NextApiRequest, NextApiResponse } from 'next'

export function assertCronAuthorized(
  req: NextApiRequest,
  res: NextApiResponse
): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) {
    res.status(500).json({ error: 'CRON_SECRET が未設定です' })
    return false
  }
  const auth = req.headers.authorization
  const token =
    auth?.startsWith('Bearer ') ? auth.slice(7) : (req.query.secret as string | undefined)
  if (token !== secret) {
    res.status(401).json({ error: 'Unauthorized' })
    return false
  }
  return true
}
