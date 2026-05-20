import { getThemePool } from '../pdca/themePool'
import { getServiceSupabase } from '../pdca/supabaseAdmin'

export type XTopic = {
  title: string
  hint?: string
  fromMarket?: boolean
}

async function fetchMarketTopics(): Promise<XTopic[]> {
  const sb = getServiceSupabase()
  const { data } = await sb
    .from('markets')
    .select('title')
    .eq('is_resolved', false)
    .order('created_at', { ascending: false })
    .limit(5)
  return ((data as { title: string }[]) ?? []).map(m => ({ title: m.title, fromMarket: true }))
}

export async function pickTopic(): Promise<XTopic> {
  const themes = getThemePool()

  if (Math.random() < 0.7) {
    const t = themes[Math.floor(Math.random() * themes.length)]
    return { title: t.title, hint: t.snippet }
  }

  const markets = await fetchMarketTopics().catch(() => [] as XTopic[])
  if (markets.length === 0) {
    const t = themes[Math.floor(Math.random() * themes.length)]
    return { title: t.title, hint: t.snippet }
  }
  return markets[Math.floor(Math.random() * markets.length)]
}
