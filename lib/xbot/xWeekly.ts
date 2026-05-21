import Anthropic from '@anthropic-ai/sdk'
import { TwitterApi } from 'twitter-api-v2'
import { getServiceSupabase } from '../pdca/supabaseAdmin'

const MODEL = 'claude-sonnet-4-6'

export async function runWeekly(): Promise<{ tweetId: string | null; content: string }> {
  const sb = getServiceSupabase()
  const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString()

  const [resolvedRes, topUsersRes] = await Promise.all([
    sb
      .from('markets')
      .select('title, market_options(name, pool), total_pool')
      .eq('is_resolved', true)
      .gte('updated_at', oneWeekAgo)
      .order('total_pool', { ascending: false })
      .limit(3),
    sb
      .from('profiles')
      .select('username, point_balance')
      .eq('is_hidden_from_ranking', false)
      .order('point_balance', { ascending: false })
      .limit(3),
  ])

  const resolved = (resolvedRes.data ?? []) as any[]
  const topUsers = (topUsersRes.data ?? []) as any[]

  if (resolved.length === 0 && topUsers.length === 0) {
    return { tweetId: null, content: 'データ不足のためスキップ' }
  }

  const resolvedSummary = resolved
    .map(m => {
      const top = (m.market_options as any[]).reduce(
        (a: any, b: any) => (b.pool > a.pool ? b : a),
        m.market_options[0]
      )
      const pct = Math.round((top?.pool ?? 0) / Math.max(m.total_pool, 1) * 100)
      return `・「${m.title.slice(0, 30)}」→ ${pct}%が「${top?.name ?? '?'}」と予測`
    })
    .join('\n')

  const rankSummary = topUsers
    .map((u, i) => `${['👑', '🥈', '🥉'][i]} ${u.username ?? '名無し'} ${u.point_balance.toLocaleString()}pt`)
    .join('  ')

  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY 未設定')
  const client = new Anthropic({ apiKey })

  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 300,
    messages: [
      {
        role: 'user',
        content: `予測市場「ヨソる」の週次ダイジェストをXに投稿します。以下のデータから280字以内の投稿文を生成してください。

【今週の確定問い】
${resolvedSummary || '（なし）'}

【現在のランキング上位】
${rankSummary || '（なし）'}

ルール：
- 「集合知」「みんなの予測」の面白さを伝える
- 次の予測への参加を自然に誘う
- #ヨソる を含める
- 投稿文のみ出力`,
      },
    ],
  })

  const content = msg.content[0].type === 'text' ? msg.content[0].text.trim() : ''
  if (!content) throw new Error('Claude が空のレスポンスを返しました')

  const appKey = process.env.TWITTER_API_KEY?.trim()
  const appSecret = process.env.TWITTER_API_SECRET?.trim()
  const accessToken = process.env.TWITTER_ACCESS_TOKEN?.trim()
  const accessSecret = process.env.TWITTER_ACCESS_SECRET?.trim()
  if (!appKey || !appSecret || !accessToken || !accessSecret) {
    throw new Error('Twitter API 環境変数未設定')
  }

  const twitterClient = new TwitterApi({ appKey, appSecret, accessToken, accessSecret })
  const { data } = await twitterClient.v2.tweet(content.slice(0, 280))
  return { tweetId: data?.id ?? null, content }
}
