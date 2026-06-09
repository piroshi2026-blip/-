import Anthropic from '@anthropic-ai/sdk'
import { TwitterApi } from 'twitter-api-v2'
import { getPublicBaseUrl } from '../pdca/pdcaHelpers'
import { fetchImageViaSearch } from '../pdca/fetchImage'
import { loadRecentPosts, loadAnalysisInsights, savePost, type XPost } from './xStorage'
import { pickTopic } from './xTopics'

const MODEL = 'claude-sonnet-4-6'

type PostContent = {
  question: string   // 読者を引き込む問い（ポールなし）
  insight: string    // 3〜5行の本質的考察
  closing: string    // リプライ誘引の締め文
  hashtags: string   // #ヨソる + 人気検索タグ
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
2026年Xアルゴリズム（Phoenix Scorer）に最適化した「スレッド投稿」用コンテンツをJSON形式で生成します。

投稿は2ツイートのスレッド構成です：
- ツイート1（メイン）: question + hashtags（ポールなし）
- ツイート2（リプライ）: insight + closing + サイトURL + 画像

【2026年アルゴリズム重要シグナル（優先順）】
① いいね → 「わかる」「驚き」「鋭い」と感じさせる感情的共鳴が最重要
② 引用ツイート → 「自分の意見を言いたくなる」独自視点・逆張り・強い主張
③ リツイート → 「友人に見せたい」拡散価値のある洞察
④ リプライ → 「答えたくなる」明確な問いかけ
⑤ プロフィールクリック → 「この人は誰？」と思わせる独自の知性・視点
✕ ブロック・ミュート・通報を誘発するような極端・攻撃的表現は厳禁

【高パフォーマンス投稿】\n${fmt(top5)}
【低パフォーマンス投稿】\n${fmt(bottom5)}
${insights ? `\n【学習インサイト】\n${insights}` : ''}

必ず以下のJSONのみ出力（説明文・コードブロック不要）：
{
  "question": "「えっ、どっちだ」「これ気になる」と思わず止まる鋭い問い。60字以内。",
  "insight": "驚き・矛盾・逆説を含む3〜5行の考察。改行で読みやすく。「この人すごい」と思わせる知性。150字以内。",
  "closing": "毎回まったく違う言い回しで、自分の意見を言いたくなるよう自然に誘う1文。40字以内。",
  "hashtags": "#ヨソる と、このトピックでXで実際に検索されている具体的なハッシュタグ1〜2個（人名・球団・ブランド・イベント名など。#予測市場 より #大谷翔平 #日経平均 のような具体語を優先）"
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

  if (!parsed.question || !parsed.insight) {
    throw new Error('生成されたJSONが不正です')
  }
  return parsed
}

async function getImageUrl(topic: string): Promise<string | null> {
  const tavilyUrl = await fetchImageViaSearch(topic).catch(() => null)
  if (tavilyUrl) return tavilyUrl
  // Tavilyで見つからなければ Pollinations.ai (Flux) で生成
  const prompt = encodeURIComponent(`${topic} future society prediction abstract`)
  return `https://image.pollinations.ai/prompt/${prompt}?width=1200&height=630&nologo=true`
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

async function postThread(
  content: PostContent,
  imageUrl: string | null
): Promise<{ tweetId: string; fullText: string; imageAttached: boolean; imageSource: string | null }> {
  const client = getTwitterClient()

  // ツイート1: 問い + ハッシュタグ（ポールなし）
  const tweet1Text = `${content.question}\n\n${content.hashtags}`.slice(0, 280)
  const { data: tweet1 } = await client.v2.tweet({ text: tweet1Text })
  if (!tweet1?.id) throw new Error('ツイートIDが取得できませんでした')

  // ツイート2（リプライ）: 本質的考察 + 締め + CTA + 画像
  const mediaId = imageUrl ? await uploadImage(client, imageUrl) : null
  const ctaPart = '\n\nアプリで予測してみる→ https://minna-eta.vercel.app/ 登録で1000pt！'
  const tweet2Text = `${content.insight}\n\n${content.closing}${ctaPart}`.slice(0, 280)
  await client.v2.tweet({
    text: tweet2Text,
    reply: { in_reply_to_tweet_id: tweet1.id },
    ...(mediaId ? { media: { media_ids: [mediaId] } } : {}),
  })

  const imageSource = imageUrl
    ? (imageUrl.includes('pollinations.ai') ? 'flux(pollinations)' : 'tavily')
    : null

  return { tweetId: tweet1.id, fullText: `${tweet1Text}\n---\n${tweet2Text}`, imageAttached: !!mediaId, imageSource }
}

export async function runPost(dryRun = false, forceTopic?: { title: string; hint?: string }): Promise<{
  content: string
  tweetId: string | null
  topic: string
  dryRun: boolean
  imageAttached?: boolean
  imageSource?: string | null
}> {
  const [recentPosts, insights, topic] = await Promise.all([
    loadRecentPosts(30),
    loadAnalysisInsights(),
    forceTopic ? Promise.resolve(forceTopic) : pickTopic(),
  ])

  // 投稿生成と画像取得を並列実行（Tavilyで見つからなければFluxで生成）
  const [postContent, imageUrl] = await Promise.all([
    generateContent(topic, recentPosts, insights),
    getImageUrl(topic.title).catch(() => null),
  ])

  if (dryRun) {
    const preview = `【ツイート1】\n${postContent.question}\n${postContent.hashtags}\n\n【ツイート2（リプライ＋画像）】\n${postContent.insight}\n\n${postContent.closing}\n\n画像: ${imageUrl ?? 'なし'}`
    return { content: preview, tweetId: null, topic: topic.title, dryRun: true }
  }

  const { tweetId, fullText, imageAttached, imageSource } = await postThread(postContent, imageUrl)
  await savePost({
    tweet_id: tweetId,
    posted_at: new Date().toISOString(),
    topic: topic.title,
    content: fullText,
  })

  return { content: fullText, tweetId, topic: topic.title, dryRun: false, imageAttached, imageSource }
}
