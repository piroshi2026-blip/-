import type { NextApiRequest, NextApiResponse } from 'next'
import { assertCronAuthorized } from '../../../lib/pdca/cronGuard'
import { executeXMarketingPost, getScheduledPostType } from '../../../lib/pdca/xMarketing'

/**
 * X マーケティング自動投稿 Cron
 * 毎時実行 → JST の時間帯に応じて適切なタイプの投稿を生成・投稿。
 *
 * スケジュール:
 *  7:00  教育系（ヨソるの仕組み・魅力）
 *  9:00  新問い告知
 * 11:00  エンゲージメント（投票呼びかけ）
 * 13:00  新問い告知
 * 15:00  トレンド便乗
 * 17:00  新問い告知
 * 19:00  結果発表
 * 21:00  新問い告知
 * 23:00  教育系
 */
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', 'GET, POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  if (!assertCronAuthorized(req, res)) return

  const now = new Date()
  const jstHour = (now.getUTCHours() + 9) % 24

  const postType = getScheduledPostType(jstHour)
  if (!postType) {
    return res.status(200).json({ skipped: true, jstHour, message: `JST ${jstHour}時: 投稿予定なし` })
  }

  const result = await executeXMarketingPost(postType)
  return res.status(200).json({ jstHour, ...result })
}
