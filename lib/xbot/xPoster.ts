import Anthropic from '@anthropic-ai/sdk'
import { TwitterApi } from 'twitter-api-v2'
import { getPublicBaseUrl } from '../pdca/pdcaHelpers'
import { fetchImageViaSearch } from '../pdca/fetchImage'
import { loadRecentPosts, loadAnalysisInsights, savePost, type XPost } from './xStorage'
import { pickTopic } from './xTopics'

const MODEL = 'claude-sonnet-4-6'

type PostContent = {
  poll_question: string   // 短い問い（ポーリングツイート用）
  poll_options: string[]  // 2〜4択、各25字以内
  insight: string         // 3〜5行の本質的考察
  closing: string         // リプライ誘引の締め文
  hashtags: string        // #ヨソる + 関連タグ
}

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

function buildSystemPrompt(recentPosts: XPost[], insights: string | null): string {
  const withScore = recentPosts.filter(p => p.score != null && (p.impressions ?? 0) > 0)
  const sorted = [...withScore].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const top5 = sorted.slice(0, 5)
  const bottom5 = sorted.slice(-5).reverse()
  const fmt = (posts: XPost[]) =>
    posts.length > 0
      ? posts.map(p => `・スコア${p.score?.toFixed(1)} ／ ${p.content.slice(0, 40)}…`).join('\n')
      : '（まだデータなし）'

  return `あなたは予測市場アプリ「ヨソる」の公式Xアカウントの中の人です。
2026年Xアルゴリズムに最適化した「スレッド投稿」用のコンテンツをJSON形式で生成します。

投稿は2ツイートのスレッド構成です：
- ツイート1（メイン）: poll_question + hashtags + Xポーリング（最大リーチを狙う）
- ツイート2（リプライ）: insight + closing + サイトURL（深い考察と誘導）

【高パフォーマンス投稿】\n${fmt(top5)}
【低パフォーマンス投稿】\n${fmt(bottom5)}
${insights ? `\n【学習インサイト】\n${insights}` : ''}

必ず以下のJSONのみ出力（説明文・コードブロック不要）：
{
  "poll_question": "読者を引き込む鋭い問い。60字以内。",
  "poll_options": ["選択肢1（25字以内）", "選択肢2（25字以内）", "選択肢3（25字以内）"],
  "insight": "3〜5行の考察。改行で読みやすく。争点・矛盾・驚きを含む。合計150字以内。",
  "closing": "毎回まったく違う言い回しでリプライを誘う1文。40字以内。",
  "hashtags": "#ヨソる #関連タグ1〜2個"
}`
}

async function generateContent(topic: { title: string; hint?: string }, recentPosts: XPost[], insights: string | null): Promise<PostContent> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未設定')
  const client = new Anthropic({ apiKey })

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 500,
    system: buildSystemPrompt(recentPosts, insights),
    messages: [
      {
        role: 'user',
        content: `今回のトピック：「${topic.title}」${topic.hint ? `\nヒント：${topic.hint}` : ''}`,
      },
    ],
  })

  const raw = msg.content[0].type === 'text' ? msg.content[0].text : ''
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start === -1 || end === -1) throw new Error('ClaudeがJSON形式で返しませんでした')
  const parsed = JSON.parse(raw.slice(start, end + 1)) as PostContent

  if (!parsed.poll_question || !Array.isArray(parsed.poll_options) || parsed.poll_options.length < 2) {
    throw new Error('生成されたJSONが不正です')
  }
  return parsed
}

async function uploadImage(client: TwitterApi, imageUrl: string): Promise<string | null> {
  try {
    const res = await fetch(imageUrl)
    if (!res.ok) return null
    const buffer = Buffer.from(await res.arrayBuffer())
    const mimeType = imageUrl.includes('.png') ? 'image/png' : 'image/jpeg'
    return await client.v1.uploadMedia(buffer, { mimeType })
  } catch {
    return null
  }
}

async function postThreadWithPoll(
  content: PostContent,
  imageUrl: string | null
): Promise<{ tweetId: string; fullText: string }> {
  const client = getTwitterClient()
  const baseUrl = getPublicBaseUrl()

  // ツイート1: 問い + ハッシュタグ + ポーリング（画像なし）
  const tweet1Text = `${content.poll_question}\n\n${content.hashtags}`.slice(0, 280)
  const { data: tweet1 } = await client.v2.tweet({
    text: tweet1Text,
    poll: {
      options: content.poll_options.slice(0, 4).map(o => o.slice(0, 25)),
      duration_minutes: 1440,
    },
  })
  if (!tweet1?.id) throw new Error('ツイートIDが取得できませんでした')

  // ツイート2（リプライ）: 本質的考察 + 締め + URL + 画像
  const mediaId = imageUrl ? await uploadImage(client, imageUrl) : null
  const urlPart = baseUrl ? `\n▶ ${baseUrl}` : ''
  const tweet2Text = `${content.insight}\n\n${content.closing}${urlPart}`.slice(0, 280)
  await client.v2.tweet({
    text: tweet2Text,
    reply: { in_reply_to_tweet_id: tweet1.id },
    ...(mediaId ? { media: { media_ids: [mediaId] } } : {}),
  })

  return { tweetId: tweet1.id, fullText: `${tweet1Text}\n---\n${tweet2Text}` }
}

export async function runPost(dryRun = false): Promise<{
  content: string
  tweetId: string | null
  topic: string
  dryRun: boolean
}> {
  const [recentPosts, insights, topic] = await Promise.all([
    loadRecentPosts(30),
    loadAnalysisInsights(),
    pickTopic(),
  ])

  // 投稿生成と画像取得を並列実行
  const [postContent, imageUrl] = await Promise.all([
    generateContent(topic, recentPosts, insights),
    fetchImageViaSearch(topic.title).catch(() => null),
  ])

  if (dryRun) {
    const preview = `【ツイート1（Poll）】\n${postContent.poll_question}\n選択肢: ${postContent.poll_options.join(' / ')}\n${postContent.hashtags}\n\n【ツイート2（リプライ＋画像）】\n${postContent.insight}\n\n${postContent.closing}\n\n画像: ${imageUrl ?? 'なし'}`
    return { content: preview, tweetId: null, topic: topic.title, dryRun: true }
  }

  const { tweetId, fullText } = await postThreadWithPoll(postContent, imageUrl)
  await savePost({
    tweet_id: tweetId,
    posted_at: new Date().toISOString(),
    topic: topic.title,
    content: fullText,
  })

  return { content: fullText, tweetId, topic: topic.title, dryRun: false }
}
