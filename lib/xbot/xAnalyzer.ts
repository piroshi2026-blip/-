import Anthropic from '@anthropic-ai/sdk'
import { loadRecentPosts, saveAnalysisInsights } from './xStorage'

const MODEL = 'claude-sonnet-4-20250514'

export async function runAnalyze(): Promise<{ insights: string; analyzed: number }> {
  const posts = await loadRecentPosts(100)
  const withEngagement = posts.filter(p => p.score != null && (p.impressions ?? 0) > 0)

  if (withEngagement.length < 5) {
    return { insights: 'データ不足（5件以上のエンゲージメントデータが必要）', analyzed: 0 }
  }

  const sorted = [...withEngagement].sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
  const postList = sorted
    .map(p =>
      [
        `スコア${p.score?.toFixed(1)}`,
        `いいね${p.likes} RT${p.retweets} リプ${p.replies} 引用${p.quotes} ブクマ${p.bookmarks} IMP${p.impressions}`,
        `「${p.content.slice(0, 60)}…」`,
      ].join(' | ')
    )
    .join('\n')

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未設定')
  const client = new Anthropic({ apiKey })

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 600,
    messages: [
      {
        role: 'user',
        content: `以下はXアカウント「ヨソる」の投稿とエンゲージメントデータです。
スコア = (いいね×3 + ブクマ×5 + 引用×4 + リプ×2 + RT×2) / インプレッション × 1000

${postList}

以下を分析して日本語で答えてください：
1. 高スコア（上位20%）に共通するトピック・構造・トーン・切り口の特徴
2. 低スコア（下位20%）の失敗パターン
3. 次の投稿で具体的に意識すべき点（3点、明確に）

分析テキストのみ出力（見出しなし・箇条書き可）：`,
      },
    ],
  })

  const insights = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  await saveAnalysisInsights(insights)
  return { insights, analyzed: withEngagement.length }
}
