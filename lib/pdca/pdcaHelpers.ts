import { getServiceSupabase } from './supabaseAdmin'
import type { DraftMarket } from './draftMarket'

export function jstDateString(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
}

export function jstYesterdayString(d = new Date()): string {
  const j = new Date(d.toLocaleString('en-US', { timeZone: 'Asia/Tokyo' }))
  j.setDate(j.getDate() - 1)
  return jstDateString(j)
}

export function getPublicBaseUrl(): string {
  return (
    process.env.PDCA_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ''
  ).replace(/\/$/, '')
}

export function pickSportsCategory(allowed: string[], fallback: string): string {
  if (allowed.includes('スポーツ')) return 'スポーツ'
  if (allowed.includes('エンタメ')) return 'エンタメ'
  return fallback
}

export async function loadCategories(): Promise<{ names: string[]; defaultCategory: string }> {
  const sb = getServiceSupabase()
  const { data } = await sb.from('categories').select('name').order('display_order', { ascending: true })
  const names = (data || []).map((r: { name: string }) => r.name).filter(Boolean)
  const defaultCategory = names.includes('その他') ? 'その他' : names[0] || 'その他'
  return { names, defaultCategory }
}

export async function recentTitlesSample(): Promise<string[]> {
  const sb = getServiceSupabase()
  const { data } = await sb
    .from('markets')
    .select('title, created_at')
    .order('created_at', { ascending: false })
    .limit(60)
  return (data || []).map((r: { title: string }) => r.title.toLowerCase())
}

export function isTooSimilar(newTitle: string, existing: string[]): boolean {
  const t = newTitle.toLowerCase().slice(0, 24)
  if (t.length < 6) return false
  return existing.some((e) => e.includes(t) || t.includes(e.slice(0, 24)))
}

export async function resolveNewMarketId(
  sb: ReturnType<typeof getServiceSupabase>,
  title: string
): Promise<number | null> {
  const { data } = await sb
    .from('markets')
    .select('id')
    .eq('title', title)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (data?.id != null) return Number(data.id)
  const { data: last } = await sb.from('markets').select('id').order('created_at', { ascending: false }).limit(1).maybeSingle()
  return last?.id != null ? Number(last.id) : null
}

export async function insertMarket(draft: DraftMarket): Promise<{ error: string | null }> {
  const sb = getServiceSupabase()
  const end = new Date()
  end.setDate(end.getDate() + draft.endDays)
  const { error } = await sb.rpc('create_market_with_options', {
    title_input: draft.title,
    category_input: draft.category,
    end_date_input: end.toISOString(),
    description_input: draft.description,
    image_url_input: '',
    options_input: draft.options,
  })
  return { error: error ? error.message : null }
}

export function buildTweetLine(kind: 'mlb' | 'general', title: string): string {
  const t = title.slice(0, 72) + (title.length > 72 ? '…' : '')
  if (kind === 'mlb') return `⚾MLB（日本人選手等）「${t}」`
  return `📰話題の問い「${t}」`
}

export function buildTweetBody(line: string, baseUrl: string): string {
  if (baseUrl) return `【ヨソる】${line}\n${baseUrl}`.slice(0, 280)
  return `【ヨソる】${line}`.slice(0, 280)
}

export async function logPdcaPayload(kind: string, payload: Record<string, unknown>, ok: boolean) {
  try {
    const sb = getServiceSupabase()
    await sb.from('pdca_runs').insert({ ok, payload: { kind, ...payload } as Record<string, unknown> })
  } catch (e) {
    console.warn('[pdca] log:', e instanceof Error ? e.message : e)
  }
}
