import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function Admin() {
  const [activeTab, setActiveTab] = useState<'markets' | 'categories' | 'users' | 'config'>('markets')
  const [markets, setMarkets] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [siteConfig, setSiteConfig] = useState<any>({ id: 1, site_title: '', site_description: '', admin_message: '', show_ranking: true, share_text_base: '' })

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [newOptionName, setNewOptionName] = useState('')
  const [newMarket, setNewMarket] = useState({ title: '', category: '', end_date: '', description: '', image_url: '', options: '' })
  const [newCategory, setNewCategory] = useState({ name: '', icon: '', display_order: 0 })

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    const [m, c, u, cfg] = await Promise.all([
      supabase.from('markets').select('*, market_options(*)').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('display_order', { ascending: true }),
      supabase.from('profiles').select('*').order('point_balance', { ascending: false }),
      supabase.from('site_config').select('*').single()
    ])
    if (m.data) setMarkets(m.data)
    if (c.data) setCategories(c.data)
    if (u.data) setUsers(u.data)
    if (cfg.data) setSiteConfig(cfg.data)
    setIsLoading(false)
  }, [])

  useEffect(() => { fetchData() }, [fetchData])

  // 配当確定（決定）ボタンのロジック
  async function handleResolve(marketId: number, optionId: number) {
    if(!confirm('この結果で確定させますか？的中者に配当が配分されます。この操作は消せません。')) return
    const { error } = await supabase.rpc('resolve_market', { 
      market_id_input: marketId, 
      winning_option_id: optionId 
    })
    if (!error) { alert('配当を確定しました！'); fetchData(); } else alert(error.message)
  }

  async function handleUpdateMarket() {
    await supabase.from('markets').update({ 
      title: editForm.title, description: editForm.description, category: editForm.category, 
      end_date: new Date(editForm.end_date).toISOString(), image_url: editForm.image_url 
    }).eq('id', editingId)
    for (const opt of editForm.market_options) {
      await supabase.from('market_options').update({ name: opt.name }).eq('id', opt.id)
    }
    if (newOptionName.trim()) {
      await supabase.from('market_options').insert([{ market_id: editingId, name: newOptionName.trim(), pool: 0 }])
      setNewOptionName('')
    }
    setEditingId(null); fetchData(); alert('保存完了')
  }

  const s: any = {
    inp: { padding: '8px', border: '1px solid #ddd', borderRadius: '6px', width: '100%', marginBottom: '8px' },
    btn: { background: '#1f2937', color: 'white', padding: '10px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
    tab: (active: boolean) => ({ flex: 1, padding: '12px', background: active ? '#1f2937' : '#eee', color: active ? 'white' : '#666', border: 'none', cursor: 'pointer', fontWeight: 'bold' })
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>🛠 管理パネル</h1>
      <div style={{ display: 'flex', gap: '2px', marginBottom: '20px' }}>
        {['markets', 'categories', 'users', 'config'].map((t: any) => (
          <button key={t} onClick={() => setActiveTab(t as any)} style={s.tab(activeTab === t)}>{t}</button>
        ))}
      </div>

      {activeTab === 'markets' && (
        <>
          {markets.map(m => (
            <div key={m.id} style={{ border: '1px solid #eee', padding: '15px', marginBottom: '10px', borderRadius: '10px', background: '#fff' }}>
              {editingId === m.id ? (
                <div>
                  <input value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} style={s.inp} />
                  {editForm.market_options.map((opt: any, idx: number) => (
                    <input key={opt.id} value={opt.name} onChange={e => { const newOpts = [...editForm.market_options]; newOpts[idx].name = e.target.value; setEditForm({ ...editForm, market_options: newOpts }) }} style={s.inp} />
                  ))}
                  <button onClick={handleUpdateMarket} style={{...s.btn, background:'#10b981', width:'100%'}}>基本情報を保存</button>
                  <button onClick={()=>setEditingId(null)} style={{background:'none', border:'none', width:'100%', marginTop:'5px', color:'#999'}}>キャンセル</button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><strong>{m.title}</strong></div>
                  <div>
                    <button onClick={() => { setEditingId(m.id); setEditForm({...m, end_date: new Date(m.end_date).toISOString().slice(0,16)}); }} style={{...s.btn, background:'#3b82f6', padding:'5px 10px', marginRight:'5px'}}>編集</button>
                  </div>
                </div>
              )}
              {/* 配当確定セクション */}
              {!m.is_resolved && (
                <div style={{ marginTop: '10px', padding: '10px', border: '1px dashed #ef4444', borderRadius: '8px' }}>
                  <div style={{ fontSize: '11px', color: '#ef4444', fontWeight: 'bold', marginBottom: '5px' }}>⚠️ 結果の確定（配当の実行）</div>
                  <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {m.market_options.map((opt: any) => (
                      <button key={opt.id} onClick={() => handleResolve(m.id, opt.id)} style={{ padding: '5px 10px', borderRadius: '4px', border: '1px solid #ef4444', color: '#ef4444', background: '#fff', fontSize: '11px', fontWeight: 'bold' }}>
                        「{opt.name}」で決定
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}
      {/* 他のタブ機能は維持 */}
    </div>
  )
}
