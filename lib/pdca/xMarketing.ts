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
  '予測することで世界の見え方が変わる（認知を深めるツール）',
  '社会の縮図としての予測市場（今、世の中はどこに向かっているか）',
  '未来は自分でつくる（予測への参加が主体性を育てる）',
  '現在と未来をつなぐ問い（今の選択が未来を形成する）',
  '集合知が照らす社会の潮流（みんなの予想が"今"を映す鏡）',
  '世界を自らに投影する（問いを立てることで思考が深まる）',
  '予測市場と社会課題（世の中の本質を問うことの意味）',
]

const PHILOSOPHY_ANGLES = [
  '未来は自分でつくるという前提への問いかけ',
  '予測市場が世の中の縮図であるという視点',
  '現在と未来をつなぐ架け橋としての予測',
  '認知を深め、世界を理解するためのツールとして',
  '社会の潮流・トレンドを読む力を育てる手段として',
  '集合知が照らす世界の本質',
  '世の中はどこに向かっているか、という根源的な問い',
  '自分の考えを持つことが世界への理解につながるという哲学',
]

const TWEET_STYLES = [
  '短い詩的な一文から始めて、深みのある問いかけで締める',
  '「〜って考えたことある？」という共感を誘う問いかけスタイル',
  '社会の動きを一言で切り取り、予測市場との接点を示すスタイル',
  'ふと気づきを与える格言調で始め、具体的な問いに着地するスタイル',
  '「今日の世界」「今の瞬間」をキーワードに現在と未来を結ぶスタイル',
  'データや数字（〇%、〇人など）を使って現実感を出すスタイル',
  '「もし〜だったら？」という仮定で想像力を刺激するスタイル',
]

async function callClaude(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim()
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY が未設定です')

  const client = new Anthropic({ apiKey })
  const msg = await client.messages.create({
    model: process.env.CLAUDE_DRAFT_MODEL ?? 'claude-haiku-4-5-20251001',
    max_tokens: 300,
    messages: [{ role: 'user', content: prompt }],
  })

  const block = msg.content[0]
  if (block.type === 'text') return block.text.trim()
  throw new Error('Claude returned non-text response')
}

export async function generateNewMarketTweet(title: string, category: string): Promise<string> {
  const angle = PHILOSOPHY_ANGLES[Math.floor(Math.random() * PHILOSOPHY_ANGLES.length)]
  const style = TWEET_STYLES[Math.floor(Math.random() * TWEET_STYLES.length)]

  const prompt = `あなたは予測市場アプリ「ヨソる」の公式Xアカウントの中の人です。
新しい「問い」を公開したことを告知する投稿を1つ書いてください。

問い: 「${title}」
カテゴリ: ${category}
サイト: ${SITE_URL}

今回の投稿の切り口: ${angle}
文体スタイル: ${style}

ルール:
- 280文字以内（厳守）
- 毎回まったく違う切り口・表現で書く。テンプレ的な定型文は絶対NG
- 予測市場が「世界を理解するツール」「社会の縮図」「認知を深める手段」であるというニュアンスを自然にどこかに織り込む
- 「この問いを考えることで、世の中の流れや本質が見えてくる」という視点を入れる
- #ヨソる は必ず入れる
- 関連ハッシュタグを1〜2個（カテゴリ・話題に合ったもの）
- URLを末尾に
- 🔮 など絵文字を1〜2個（毎回違うもの）
- 人が思わず立ち止まって考えたくなるような言葉を選ぶ

投稿文のみ出力（説明・前置き不要）:`

  return callClaude(prompt)
}

export async function generateResultTweet(
  title: string,
  winnerOption: string,
  topPredictors: string[],
  odds: number
): Promise<string> {
  const angle = PHILOSOPHY_ANGLES[Math.floor(Math.random() * PHILOSOPHY_ANGLES.length)]
  const style = TWEET_STYLES[Math.floor(Math.random() * TWEET_STYLES.length)]

  const prompt = `あなたは予測市場アプリ「ヨソる」の公式Xアカウントの中の人です。
問いの結果が確定したので発表投稿を書いてください。

問い: 「${title}」
結果: 「${winnerOption}」
倍率: ${odds}倍
サイト: ${SITE_URL}

今回の投稿の切り口: ${angle}
文体スタイル: ${style}

ルール:
- 280文字以内
- 毎回まったく違う切り口で書く。パターン化・テンプレ化NG
- 結果発表だけでなく「この結果が示す社会の動き・世の中の流れ」への一言考察を自然に入れる
- 「みんなの予測が集まって、世の中の縮図が見えた」という感覚を出す
- 的中した人へのさりげない称賛
- 次の問いへ誘導
- #ヨソる + 関連タグ1〜2個
- URLを末尾に
- 絵文字は2個まで

投稿文のみ出力（説明不要）:`

  return callClaude(prompt)
}

export async function generateEducationTweet(): Promise<string> {
  const topic = EDUCATION_TOPICS[Math.floor(Math.random() * EDUCATION_TOPICS.length)]
  const angle = PHILOSOPHY_ANGLES[Math.floor(Math.random() * PHILOSOPHY_ANGLES.length)]
  const style = TWEET_STYLES[Math.floor(Math.random() * TWEET_STYLES.length)]

  const prompt = `あなたは予測市場アプリ「ヨソる」の公式Xアカウントの中の人です。
以下のトピックについて、深みのある投稿を1つ書いてください。

トピック: ${topic}
哲学的視点: ${angle}
文体スタイル: ${style}
サイト: ${SITE_URL}

ルール:
- 280文字以内
- 毎回まったく違う表現・切り口で。同じパターンを繰り返さない
- 単なるアプリ説明にせず、「予測市場は世界を理解するレンズ」「社会の鏡」「認知を深めるツール」という本質的な価値観を自然に織り込む
- 「未来は自分でつくる」「今を問うことで世の中が見える」というメッセージをどこかに
- 読んだ人が「ちょっと考えさせられる」「なるほど」と思う一言
- #ヨソる は必ず入れる
- URLを末尾に

投稿文のみ出力（説明不要）:`

  return callClaude(prompt)
}

export async function generateTrendHookTweet(trendKeyword: string, relatedMarketTitle?: string): Promise<string> {
  const marketLine = relatedMarketTitle
    ? `関連する問い: 「${relatedMarketTitle}」`
    : ''
  const angle = PHILOSOPHY_ANGLES[Math.floor(Math.random() * PHILOSOPHY_ANGLES.length)]
  const style = TWEET_STYLES[Math.floor(Math.random() * TWEET_STYLES.length)]

  const prompt = `あなたは予測市場アプリ「ヨソる」の公式Xアカウントの中の人です。
今話題のトレンドを切り口に、社会の潮流を読む投稿を書いてください。

トレンド・話題: ${trendKeyword}
${marketLine}
哲学的視点: ${angle}
文体スタイル: ${style}
サイト: ${SITE_URL}

ルール:
- 280文字以内
- 毎回まったく違う切り口で書く。定型的な紹介文NG
- トレンドを「世の中の流れ・潮流」として捉え、「この動きはどこへ向かっているか」という問いを立てる
- 「今この話題を予測することに意味がある」という緊張感・リアルタイム感を出す
- 予測市場が社会の縮図であり、世界の本質を映す鏡であることを自然に示す
- トレンド関連ハッシュタグ + #ヨソる
- URLを末尾に
- 絵文字は1〜2個（毎回変える）

投稿文のみ出力（説明不要）:`

  return callClaude(prompt)
}

export async function generateEngagementTweet(markets: { title: string; topOption: string; topPct: number }[]): Promise<string> {
  const marketList = markets.slice(0, 3).map(m => `• ${m.title}（現在${m.topPct}%が「${m.topOption}」予想）`).join('\n')
  const angle = PHILOSOPHY_ANGLES[Math.floor(Math.random() * PHILOSOPHY_ANGLES.length)]
  const style = TWEET_STYLES[Math.floor(Math.random() * TWEET_STYLES.length)]

  const prompt = `あなたは予測市場アプリ「ヨソる」の公式Xアカウントの中の人です。
今の社会の関心が集まっている問いについて、深みのある投稿を書いてください。

現在注目の問いと予測状況:
${marketList}

哲学的視点: ${angle}
文体スタイル: ${style}
サイト: ${SITE_URL}

ルール:
- 280文字以内
- 毎回まったく異なる表現で。お決まりの呼びかけ文NG
- 「今これだけの人が〜と予測している」というデータから社会の空気感・集合知を読み取る視点を入れる
- 「あなたはどう読む？」という個人の考えへの問いかけ
- 自分の考えを持つことが世界理解につながる、というメッセージをさりげなく
- #ヨソる + 関連タグ1〜2個
- URLを末尾に

投稿文のみ出力（説明不要）:`

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
