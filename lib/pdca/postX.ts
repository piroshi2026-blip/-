import { TwitterApi } from 'twitter-api-v2'

/**
 * 投稿には X Developer Portal で「Read and Write」権限付きの
 * TWITTER_API_KEY, TWITTER_API_SECRET, TWITTER_ACCESS_TOKEN, TWITTER_ACCESS_SECRET が必要です。
 * （メッセージで途切れていた「Xの情報」はここに設定してください）
 */

export function isAutoPostEnabled(): boolean {
  if (process.env.DISABLE_X_POST === 'true') return false
  const appKey = process.env.TWITTER_API_KEY?.trim()
  const appSecret = process.env.TWITTER_API_SECRET?.trim()
  const accessToken = process.env.TWITTER_ACCESS_TOKEN?.trim()
  const accessSecret = process.env.TWITTER_ACCESS_SECRET?.trim()
  return Boolean(appKey && appSecret && accessToken && accessSecret)
}

export async function postPromotionTweet(text: string): Promise<{ id: string }> {
  if (process.env.DISABLE_X_POST === 'true') {
    throw new Error('X 自動投稿は管理者により無効化されています（DISABLE_X_POST=true）')
  }

  const appKey = process.env.TWITTER_API_KEY?.trim()
  const appSecret = process.env.TWITTER_API_SECRET?.trim()
  const accessToken = process.env.TWITTER_ACCESS_TOKEN?.trim()
  const accessSecret = process.env.TWITTER_ACCESS_SECRET?.trim()

  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error('X 投稿用の TWITTER_API_* / TWITTER_ACCESS_* が未設定です。Vercel の環境変数に設定してください。')
  }

  const client = new TwitterApi({
    appKey,
    appSecret,
    accessToken,
    accessSecret,
  })

  const tweet = text.length > 275 ? `${text.slice(0, 272)}…` : text
  try {
    const { data } = await client.v2.tweet(tweet)
    if (!data?.id) throw new Error('X API がツイートIDを返しませんでした')
    return { id: data.id }
  } catch (e: unknown) {
    const code = (e as { code?: number; status?: number })?.code ?? (e as { status?: number })?.status
    const msg = e instanceof Error ? e.message : String(e)
    if (code === 402 || msg.includes('402')) {
      throw new Error(
        '[X 402] クレジット不足です。developer.twitter.com → Products → クレジット残高を確認・チャージしてください。'
      )
    }
    throw e
  }
}
