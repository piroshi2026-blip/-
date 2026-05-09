import Anthropic from '@anthropic-ai/sdk'
import { getServiceSupabase } from './supabaseAdmin'
import { postPromotionTweet, isAutoPostEnabled } from './postX'

const SITE_URL = process.env.PDCA_PUBLIC_SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://minna-eta.vercel.app'

export type TweetType =
  | 'new_market'
  | 'result_announce'
  | 'education'
  | 'trend_hook'
  | 'engagement'

interface TweetPlan {
  type: TweetType
  text: string
  context?: string
}

const EDUCATION_TOPICS = [
  'ヨソるとは何か（予測市場の楽しさ）',
  'オッズの仕組み（みんなの予想で倍率が変わる）',
  'ポイントの使い方（無料で遊べる）',
  '的中のコツ（情報収集とタイミング）',
  'ランキングの楽しみ方（友達と競争）',
  '予測市場が世の中にある理由（集合知の力）',
  '問いの投稿機能（自分の疑問を世界に問おう）',
  'アンケート型の問い（みんなの意見がそのまま結果に）',
  '長期予測のロマン（半年後を今ヨソる楽しさ）',
  'カテゴリの多様性（スポーツからAIまで何でもヨソれる）',
]

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が未設定です')

  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: 'claude-3-5-sonnet-20241022',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const block = msg.content[0]
  if (block.type === 'text') return block.text.trim()
  throw new Error('Claude returned non-text response')
}

export async function generateNewMarketTweet(title: string, category: string): Promise<string> {
  const prompt = `あなたはX(Twitter)のバズるツイートを書くプロです。
以下の予測市場の新しい「問い」を宣伝する投稿を1つ書いてください。

問い: 「${title}」
カテゴリ: ${category}
サイト: ${SITE_URL}

ルール:
- 280文字以内（厳守）
- 思わず意見を言いたくなるような煽り・問いかけ口調
- そのカテゴリのコミュニティに刺さるハッシュタグを2-3個
- #ヨソる は必ず入れる
- 🔮 をどこかに入れる
- サイトURLを末尾に入れる
- 機械的・テンプレ的にならず、生きた言葉で

投稿文のみ出力（説明不要）:`

  return callClaude(prompt)
}

export async function generateResultTweet(
  title: string,
  winnerOption: string,
  topPredictors: string[],
  odds: number
): Promise<string> {
  const prompt = `あなたはX(Twitter)のバズるツイートを書くプロです。
予測市場の結果発表ツイートを1つ書いてください。

問い: 「${title}」
正解: 「${winnerOption}」
倍率: ${odds}倍
的中者: ${topPredictors.length}人
サイト: ${SITE_URL}

ルール:
- 280文字以内
- 🎯🎉 など祝福感を出す
- 的中者を称える（すごい！さすが！的な）
- 次の問いへの誘導「次はあなたもヨソってみない？」的な
- #ヨソる #予測市場 + カテゴリ関連タグ
- URLを末尾に

投稿文のみ出力:`

  return callClaude(prompt)
}

export async function generateEducationTweet(): Promise<string> {
  const topic = EDUCATION_TOPICS[Math.floor(Math.random() * EDUCATION_TOPICS.length)]

  const prompt = `あなたはX(Twitter)で人気のある教育系アカウントです。
予測市場アプリ「ヨソる」の魅力や仕組みについて、以下のトピックで投稿を1つ書いてください。

トピック: ${topic}
サイト: ${SITE_URL}

ルール:
- 280文字以内
- 親しみやすい口調（硬くならない）
- 「へぇ〜」「なるほど」と思わせる切り口
- 具体例を1つ入れる
- #ヨソる は必ず入れる
- URLを末尾に入れる
- スレッド形式ではなく1投稿で完結

投稿文のみ出力:`

  return callClaude(prompt)
}

export async function generateTrendHookTweet(trendKeyword: string, relatedMarketTitle?: string): Promise<string> {
  const marketLine = relatedMarketTitle
    ? `関連する問い: 「${relatedMarketTitle}」`
    : '（関連する問いは省略可）'

  const prompt = `あなたはXのトレンドに乗るのが得意なアカウントです。
今トレンドの話題に絡めて「ヨソる」を宣伝する投稿を書いてください。

トレンドワード: ${trendKeyword}
${marketLine}
サイト: ${SITE_URL}

ルール:
- 280文字以内
- トレンドの話題に自然に絡める（無理やり感NG）
- 「これ、ヨソってみない？」的な自然な誘導
- そのトレンド関連のハッシュタグ + #ヨソる
- URL末尾
- 予測・未来志向のアングルで切る

投稿文のみ出力:`

  return callClaude(prompt)
}

export async function generateEngagementTweet(markets: { title: string; topOption: string; topPct: number }[]): Promise<string> {
  const marketList = markets.slice(0, 3).map(m => `• ${m.title}（現在${m.topPct}%が「${m.topOption}」）`).join('\n')

  const prompt = `あなたはXでフォロワーとの交流が上手いアカウントです。
予測市場「ヨソる」の現在の注目問いについて、リプライや引用RTを誘発する投稿を書いてください。

現在の注目問い:
${marketList}

サイト: ${SITE_URL}

ルール:
- 280文字以内
- 「あなたはどう思う？」的な問いかけで返信を誘う
- 意見が割れそうなポイントを突く
- #ヨソる を入れる
- 選択肢を見せて「みんなで投票しよう」感
- URLを末尾に

投稿文のみ出力:`

  return callClaude(prompt)
}

export async function executeXMarketingPost(type: TweetType): Promise<{
  type: TweetType
  text: string
  tweetId: string | null
  error: string | null
}> {
  if (!isAutoPostEnabled()) {
    return { type, text: '', tweetId: null, error: 'X投稿が無効です' }
  }

  const sb = getServiceSupabase()
  let text = ''

  try {
    switch (type) {
      case 'new_market': {
        const { data: markets } = await sb
          .from('markets')
          .select('title, category')
          .eq('is_resolved', false)
          .order('created_at', { ascending: false })
          .limit(1)
        if (markets?.[0]) {
          text = await generateNewMarketTweet(markets[0].title, markets[0].category)
        }
        break
      }

      case 'result_announce': {
        const { data: resolved } = await sb
          .from('markets')
          .select('title, result_option_id, total_pool, market_options(id, name, pool)')
          .eq('is_resolved', true)
          .order('created_at', { ascending: false })
          .limit(1)
        if (resolved?.[0]) {
          const m = resolved[0] as any
          const winner = m.market_options?.find((o: any) => o.id === m.result_option_id)
          if (winner) {
            const odds = m.total_pool > 0 ? (m.total_pool / Math.max(winner.pool, 1)) : 1
            text = await generateResultTweet(m.title, winner.name, [], Math.round(odds * 10) / 10)
          }
        }
        break
      }

      case 'education': {
        text = await generateEducationTweet()
        break
      }

      case 'trend_hook': {
        const { data: popular } = await sb
          .from('markets')
          .select('title')
          .eq('is_resolved', false)
          .order('total_pool', { ascending: false })
          .limit(1)
        const trendTitle = popular?.[0]?.title || '予測市場'
        const keyword = trendTitle.slice(0, 15)
        text = await generateTrendHookTweet(keyword, popular?.[0]?.title)
        break
      }

      case 'engagement': {
        const { data: hot } = await sb
          .from('markets')
          .select('title, total_pool, market_options(name, pool)')
          .eq('is_resolved', false)
          .gt('total_pool', 0)
          .order('total_pool', { ascending: false })
          .limit(3)
        if (hot && hot.length > 0) {
          const markets = hot.map((m: any) => {
            const topOpt = m.market_options?.reduce((a: any, b: any) => b.pool > a.pool ? b : a, m.market_options[0])
            return { title: m.title, topOption: topOpt?.name || '', topPct: Math.round((topOpt?.pool || 0) / (m.total_pool || 1) * 100) }
          })
          text = await generateEngagementTweet(markets)
        }
        break
      }
    }

    if (!text) {
      return { type, text: '', tweetId: null, error: 'ツイート文が生成されませんでした' }
    }

    const truncated = text.length > 278 ? text.slice(0, 275) + '…' : text
    const { id } = await postPromotionTweet(truncated)
    return { type, text: truncated, tweetId: id, error: null }
  } catch (e) {
    return { type, text, tweetId: null, error: e instanceof Error ? e.message : String(e) }
  }
}

export function getScheduledPostType(hour: number): TweetType | null {
  // JST hour-based schedule
  if (hour === 7) return 'education'
  if (hour === 9 || hour === 13 || hour === 17 || hour === 21) return 'new_market'
  if (hour === 11) return 'engagement'
  if (hour === 15) return 'trend_hook'
  if (hour === 19) return 'result_announce'
  if (hour === 23) return 'education'
  return null
}
