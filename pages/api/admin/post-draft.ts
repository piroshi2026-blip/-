import type { NextApiRequest, NextApiResponse } from 'next'
import type { DraftMarket } from '../../../lib/pdca/draftMarket'
import {
  insertMarket,
  resolveNewMarketId,
  buildTweetBody,
  getPublicBaseUrl,
  logPdcaPayload,
} from '../../../lib/pdca/pdcaHelpers'
import { postPromotionTweet } from '../../../lib/pdca/postX'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const { adminPassword, draft, headline, kind, imageUrl } = req.body as {
    adminPassword?: string
    draft?: DraftMarket
    headline?: string
    kind?: 'mlb' | 'general'
    imageUrl?: string | null
  }

  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }

  if (!draft?.title || !Array.isArray(draft.options) || draft.options.length < 2) {
    return res.status(400).json({ error: 'draft が不正です（title と options が必要）' })
  }

  const ins = await insertMarket(draft, imageUrl ?? null)
  if (ins.error) return res.status(500).json({ error: ins.error })

  const sb = getServiceSupabase()
  const marketId = await resolveNewMarketId(sb, draft.title)
  const baseUrl = getPublicBaseUrl()
  const body = buildTweetBody(kind ?? 'general', draft.title, baseUrl)

  let tweetId: string | null = null
  let tweetError: string | null = null
  try {
    const { id } = await postPromotionTweet(body)
    tweetId = id
  } catch (e) {
    tweetError = e instanceof Error ? e.message : String(e)
  }

  await logPdcaPayload(
    'gacha_post',
    { headline, title: draft.title, kind, marketId, tweetId, tweetError },
    marketId != null
  )

  return res.status(200).json({ marketId, tweetId, tweetError })
}
