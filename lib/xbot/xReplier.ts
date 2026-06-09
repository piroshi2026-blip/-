import Anthropic from '@anthropic-ai/sdk'
import { TwitterApi } from 'twitter-api-v2'
import { getServiceSupabase } from '../pdca/supabaseAdmin'
import { savePost } from './xStorage'

const MODEL = 'claude-sonnet-4-6'
const DAILY_REPLY_LIMIT = 5

function getTwitterClient(): TwitterApi {
  const appKey = process.env.TWITTER_API_KEY?.trim()
  const appSecret = process.env.TWITTER_API_SECRET?.trim()
  const accessToken = process.env.TWITTER_ACCESS_TOKEN?.trim()
  const accessSecret = process.env.TWITTER_ACCESS_SECRET?.trim()
  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error('Twitter API 環境変数未設定')
  }
  return new TwitterApi({ appKey, appSecret, accessToken, accessSecret })
}

async function getTodayReplyCount(): Promise<number> {
  const sb = getServiceSupabase()
  const jstNow = new Date(Date.now() + 9 * 60 * 60 * 1000)
  const jstMidnight = new Date(jstNow)
  jstMidnight.setHours(0, 0, 0, 0)
  const utcMidnight = new Date(jstMidnight.getTime() - 9 * 60 * 60 * 1000)

  const { count } = await sb
    .from('x_posts')
    .select('*', { count: 'exact', head: true })
    .like('topic', 'reply:%')
    .gte('posted_at', utcMidnight.toISOString())
  return count ?? 0
}

type SearchTarget = {
  keyword: string
  marketTitle: string
  prediction: string
}

async function getSearchTargets(): Promise<SearchTarget[]> {
  const sb = getServiceSupabase()
  const { data: markets } = await sb
    .from('markets')
    .select('title, market_options(*), total_pool')
    .eq('is_resolved', false)
    .gt('total_pool', 0)
    .order('total_pool', { ascending: false })
    .limit(8)

  if (!markets || markets.length === 0) return []

  return markets.flatMap((m: any) => {
    const opts = (m.market_options as any[]).sort((a: any, b: any) => (b.pool ?? 0) - (a.pool ?? 0))
    if (opts.length === 0) return []
    const topOpt = opts[0]
    const pct = Math.round((topOpt.pool ?? 0) / Math.max(m.total_pool, 1) * 100)

    // タイトルから検索キーワードを抽出（人名・固有名詞・数値を優先）
    const keyword = m.title
      .replace(/[？?、。！!「」]/g, ' ')
      .replace(/するか|できるか|なるか|超えるか|達成するか|実現するか|突破するか/g, '')
      .split(/\s+/)
      .filter((w: string) => w.length >= 2)
      .slice(0, 2)
      .join(' ')
      .trim()

    if (!keyword) return []
    return [{ keyword, marketTitle: m.title, prediction: `${pct}%が「${topOpt.name}」と予想` }]
  }).slice(0, 5)
}

async function generateReply(tweetText: string, target: SearchTarget): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未設定')
  const client = new Anthropic({ apiKey })

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 150,
    messages: [{
      role: 'user',
      content: `予測市場アプリ「ヨソる」の公式Xアカウントとして返信を生成してください。

【返信先ツイート】
${tweetText.slice(0, 200)}

【関連する予測データ】
「${target.marketTitle}」→ 現在 ${target.prediction}

返信ルール：
- まず相手の投稿内容に対して自然な1文（共感・補足・軽い反論など）
- 続けて「ちなみにヨソる（予測市場）では〜」と予測データを自然に紹介
- 最後は問いかけで終わる
- 100文字以内・押し売り感NG・URLは含めない
- 返信文のみ出力`,
    }],
  })

  return msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
}

export type ReplyResult = {
  replied: boolean
  skipped: boolean
  reason?: string
  tweetId?: string
  replyId?: string
  keyword?: string
}

export async function runReply(): Promise<ReplyResult> {
  // 1日の上限チェック
  const todayCount = await getTodayReplyCount()
  if (todayCount >= DAILY_REPLY_LIMIT) {
    return { replied: false, skipped: true, reason: `本日の上限${DAILY_REPLY_LIMIT}件に達しました` }
  }

  const targets = await getSearchTargets()
  if (targets.length === 0) {
    return { replied: false, skipped: true, reason: '対象マーケットなし' }
  }

  const client = getTwitterClient()

  for (const target of targets) {
    try {
      // 最近の日本語ツイートを検索（リツイート・リプライ除外）
      const searchRes = await client.v2.search(
        `${target.keyword} -is:retweet -is:reply lang:ja`,
        {
          max_results: 10,
          'tweet.fields': ['public_metrics', 'author_id', 'text'],
          sort_order: 'recency',
        } as any
      )

      const tweets = (searchRes as any).data?.data ?? []

      // いいね5〜500件のツイートを候補とする（過疎でも過熱でもない）
      const candidate = tweets.find((t: any) => {
        const likes = t.public_metrics?.like_count ?? 0
        return likes >= 5 && likes <= 500
      })

      if (!candidate) continue

      // リプライ文生成
      const replyText = await generateReply(candidate.text, target)
      if (!replyText) continue

      // CTA付きで投稿
      const fullReply = `${replyText}\n▶ https://minna-eta.vercel.app/ 登録で1000pt！`.slice(0, 280)

      const { data: posted } = await client.v2.tweet({
        text: fullReply,
        reply: { in_reply_to_tweet_id: candidate.id },
      })

      if (!posted?.id) continue

      await savePost({
        tweet_id: posted.id,
        posted_at: new Date().toISOString(),
        topic: `reply:${target.keyword}`,
        content: fullReply,
      })

      return {
        replied: true,
        skipped: false,
        tweetId: candidate.id,
        replyId: posted.id,
        keyword: target.keyword,
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      // 403=検索API権限なし → 即終了
      if (msg.includes('403') || msg.includes('Forbidden')) {
        return { replied: false, skipped: true, reason: `X API検索権限なし（Basic tier要確認）: ${msg}` }
      }
      // 429=レートリミット → 次のターゲットへ
      if (msg.includes('429')) {
        return { replied: false, skipped: true, reason: 'レートリミット到達。次回まで待機します。' }
      }
      // その他エラーは次のキーワードで再試行
      continue
    }
  }

  return { replied: false, skipped: true, reason: '全キーワードで適切な候補ツイートなし' }
}
