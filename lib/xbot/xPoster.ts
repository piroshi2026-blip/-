import Anthropic from '@anthropic-ai/sdk'
import { postPromotionTweet } from '../pdca/postX'
import { loadRecentPosts, loadAnalysisInsights, savePost, type XPost } from './xStorage'
import { pickTopic } from './xTopics'

const MODEL = 'claude-sonnet-4-6'

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
2026年のXアルゴリズムに最適化した投稿を生成します。

【最大化するシグナル】滞留時間 / リプライ / 引用RT / ブックマーク
【避けるシグナル】「興味なし」を押されるような薄い内容 / 同じトーン・構造の繰り返し

【高パフォーマンス投稿（上位5件）】
${fmt(top5)}

【低パフォーマンス投稿（下位5件）】
${fmt(bottom5)}

${insights ? `【学習インサイト（前回の分析）】\n${insights}` : ''}

【出力フォーマット（厳守）】
（問い）1文。読者を引き込む鋭い問いかけ。

（本質）3〜5行の考察。改行を活用。争点・矛盾・驚きを含む。

（締め）毎回まったく違う言い回しでリプライを自然に誘う1文。

#ヨソる #関連ハッシュタグ1〜2個

【制約】
- 280文字以内（厳守）
- URLなし
- 絵文字1〜2個（毎回違うもの）
- テンプレ的な定型文・前置き絶対NG
- 投稿文のみ出力`
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

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未設定')
  const client = new Anthropic({ apiKey })

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: buildSystemPrompt(recentPosts, insights),
    messages: [
      {
        role: 'user',
        content: `今回のトピック：「${topic.title}」${topic.hint ? `\nヒント：${topic.hint}` : ''}`,
      },
    ],
  })

  const content = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  if (!content) throw new Error('Claude が空のレスポンスを返しました')
  if (dryRun) return { content, tweetId: null, topic: topic.title, dryRun: true }

  const { id: tweetId } = await postPromotionTweet(content)
  await savePost({ tweet_id: tweetId, posted_at: new Date().toISOString(), topic: topic.title, content })
  return { content, tweetId, topic: topic.title, dryRun: false }
}
