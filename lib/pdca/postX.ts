import { TwitterApi } from 'twitter-api-v2'

/**
 * 投稿には X Developer Portal で「Read and Write」権限付きの
 * TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET が必要です。
 * （メッセージで途切れていた「Xの情報」はここに設定してください）
 */
export async function postPromotionTweet(text: string): Promise<{ id: string }> {
  const appKey = process.env.TWITTER_API_KEY?.trim()
  const appSecret = process.env.TWITTER_API_SECRET?.trim()
  const accessToken = process.env.TWITTER_ACCESS_TOKEN?.trim()
  const accessSecret = process.env.TWITTER_ACCESS_SECRET?.trim()

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error('X 投稿用の TWITTER_API_* / TWITTER_ACCESS_* が未設定です')
  }

  const client = new TwitterApi({
    appKey,
    appSecret,
    accessToken,
    accessSecret,
  })

  const tweet = text.length > 275 ? `${text.slice(0, 272)}…` : text
  const { data } = await client.v2.tweet(tweet)
  if (!data?.id) throw new Error('X API がツイートIDを返しませんでした')
  return { id: data.id }
}
