import { getServiceSupabase } from '../pdca/supabaseAdmin'

export type XPost = {
  id?: number
  tweet_id: string
  posted_at: string
  topic: string
  content: string
  likes?: number | null
  retweets?: number | null
  replies?: number | null
  quotes?: number | null
  impressions?: number | null
  bookmarks?: number | null
  score?: number | null
  engagement_fetched_at?: string | null
}

export async function savePost(post: Pick<XPost, 'tweet_id' | 'posted_at' | 'topic' | 'content'>): Promise<void> {
  const sb = getServiceSupabase()
  await sb.from('x_posts').insert(post)
}

export async function loadRecentPosts(limit = 30): Promise<XPost[]> {
  const sb = getServiceSupabase()
  const { data } = await sb
    .from('x_posts')
    .select('*')
    .order('posted_at', { ascending: false })
    .limit(limit)
  return (data as XPost[]) ?? []
}

export async function loadPendingEngagementPosts(): Promise<XPost[]> {
  const sb = getServiceSupabase()
  const now = Date.now()
  const twoHoursAgo = new Date(now - 2 * 60 * 60 * 1000).toISOString()
  const twentyFourHoursAgo = new Date(now - 24 * 60 * 60 * 1000).toISOString()
  const { data } = await sb
    .from('x_posts')
    .select('*')
    .is('engagement_fetched_at', null)
    .lte('posted_at', twoHoursAgo)
    .gte('posted_at', twentyFourHoursAgo)
  return (data as XPost[]) ?? []
}

export async function updateEngagement(
  tweetId: string,
  metrics: {
    likes: number
    retweets: number
    replies: number
    quotes: number
    impressions: number
    bookmarks: number
    score: number
  }
): Promise<void> {
  const sb = getServiceSupabase()
  await sb
    .from('x_posts')
    .update({ ...metrics, engagement_fetched_at: new Date().toISOString() })
    .eq('tweet_id', tweetId)
}

export async function loadAnalysisInsights(): Promise<string | null> {
  const sb = getServiceSupabase()
  const { data } = await sb
    .from('x_analysis')
    .select('insights')
    .limit(1)
    .maybeSingle()
  return (data as { insights: string } | null)?.insights ?? null
}

export async function saveAnalysisInsights(insights: string): Promise<void> {
  const sb = getServiceSupabase()
  await sb
    .from('x_analysis')
    .upsert({ id: 1, insights, last_analyzed: new Date().toISOString() })
}
