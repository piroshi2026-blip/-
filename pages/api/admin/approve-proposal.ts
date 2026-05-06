import type { NextApiRequest, NextApiResponse } from 'next'
import { getServiceSupabase } from '../../../lib/pdca/supabaseAdmin'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'yosoru_admin'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST')
    return res.status(405).json({ error: 'Method not allowed' })
  }
  const { adminPassword, proposalId, action } = req.body as {
    adminPassword?: string
    proposalId?: number
    action?: 'approve' | 'reject'
  }
  if (!adminPassword || adminPassword !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'パスワードが違います' })
  }
  if (!proposalId) {
    return res.status(400).json({ error: 'proposalId が必要です' })
  }

  const sb = getServiceSupabase()

  if (action === 'reject') {
    const { error } = await sb.from('user_proposals').update({ status: 'rejected' }).eq('id', proposalId)
    if (error) return res.status(500).json({ error: error.message })
    return res.status(200).json({ ok: true })
  }

  // approve: マーケットを作成してステータスを更新
  try {
    const { data: proposal, error: fetchErr } = await sb
      .from('user_proposals')
      .select('*')
      .eq('id', proposalId)
      .single()
    if (fetchErr || !proposal) throw new Error('提案が見つかりません')

    const end = new Date()
    end.setDate(end.getDate() + (Number(proposal.end_days) || 7))

    const { error: rpcErr } = await sb.rpc('create_market_with_options', {
      title_input: proposal.title,
      category_input: proposal.category,
      end_date_input: end.toISOString(),
      description_input: proposal.description || '',
      image_url_input: null,
      options_input: proposal.options,
    })
    if (rpcErr) throw rpcErr

    await sb.from('user_proposals').update({ status: 'approved' }).eq('id', proposalId)
    return res.status(200).json({ ok: true })
  } catch (e) {
    return res.status(500).json({ error: e instanceof Error ? e.message : String(e) })
  }
}
