import { TwitterApi } from 'twitter-api-v2'
import { loadPendingEngagementPosts, updateEngagement } from './xStorage'

function calcScore(m: {
  like_count: number
  retweet_count: number
  reply_count: number
  quote_count: number
  impression_count: number
  bookmark_count: number
}): number {
  if (!m.impression_count) return 0
  // 2026年Xアルゴリズム (Phoenix Scorer) に基づく重み順:
  // いいね > 引用 > リツイート > リプライ > ブックマーク(影響限定的)
  const raw =
    m.like_count * 5 +
    m.quote_count * 4 +
    m.retweet_count * 3 +
    m.reply_count * 2 +
    m.bookmark_count * 1
  return Math.round((raw / m.impression_count) * 1000 * 100) / 100
}

export async function runFetch(): Promise<{ fetched: number }> {
  const pending = await loadPendingEngagementPosts()
  if (pending.length === 0) return { fetched: 0 }

  const appKey = process.env.TWITTER_API_KEY?.trim()
  const appSecret = process.env.TWITTER_API_SECRET?.trim()
  const accessToken = process.env.TWITTER_ACCESS_TOKEN?.trim()
  const accessSecret = process.env.TWITTER_ACCESS_SECRET?.trim()
  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error('Twitter API 環境変数未設定')
  }

  const client = new TwitterApi({ appKey, appSecret, accessToken, accessSecret })
  const ids = pending.map(p => p.tweet_id)

  let fetched = 0
  for (let i = 0; i < ids.length; i += 100) {
    const chunk = ids.slice(i, i + 100)
    const response = await client.v2.tweets(chunk, {
      'tweet.fields': ['public_metrics', 'non_public_metrics'],
    })
    for (const tweet of response.data ?? []) {
      const pub = tweet.public_metrics
      const non = (tweet as any).non_public_metrics
      if (!pub) continue
      const metrics = {
        like_count: pub.like_count ?? 0,
        retweet_count: pub.retweet_count ?? 0,
        reply_count: pub.reply_count ?? 0,
        quote_count: pub.quote_count ?? 0,
        impression_count: (pub as any).impression_count ?? non?.impression_count ?? 0,
        bookmark_count: (pub as any).bookmark_count ?? 0,
      }
      await updateEngagement(tweet.id, {
        likes: metrics.like_count,
        retweets: metrics.retweet_count,
        replies: metrics.reply_count,
        quotes: metrics.quote_count,
        impressions: metrics.impression_count,
        bookmarks: metrics.bookmark_count,
        score: calcScore(metrics),
      })
      fetched++
    }
  }

  return { fetched }
}
