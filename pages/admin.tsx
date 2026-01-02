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
  const [uploading, setUploading] = useState(false)
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

  async function handleUpdateConfig() {
    await supabase.from('site_config').update(siteConfig).eq('id', siteConfig.id)
    alert('設定を保存しました')
  }

  async function uploadImage(e: any, isEdit: boolean) {
    setUploading(true)
    const file = e.target.files[0]
    const fileName = `${Math.random()}.${file.name.split('.').pop()}`
    const { error } = await supabase.storage.from('market-images').upload(fileName, file)
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('market-images').getPublicUrl(fileName)
      if (isEdit) setEditForm({ ...editForm, image_url: publicUrl })
      else setNewMarket({ ...newMarket, image_url: publicUrl })
    }
    setUploading(false)
  }

  async function handleUpdateMarket() {
    await supabase.from('markets').update({ 
      title: editForm.title, 
      description: editForm.description, 
      category: editForm.category, 
      end_date: new Date(editForm.end_date).toISOString(), 
      image_url: editForm.image_url 
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

  async function handleCreateMarket() {
    const optArray = newMarket.options.split(',').map(s => s.trim())
    const { error } = await supabase.rpc('create_market_with_options', { 
      title_input: newMarket.title, 
      category_input: newMarket.category, 
      end_date_input: new Date(newMarket.end_date).toISOString(), 
      description_input: newMarket.description, 
      image_url_input: newMarket.image_url, 
      options_input: optArray 
    })
    if (!error) { alert('作成完了'); fetchData(); }
  }

  const s: any = {
    inp: { padding: '8px', border: '1px solid #ddd', borderRadius: '6px', width: '100%', boxSizing: 'border-box', marginBottom: '8px' },
    btn: { background: '#1f2937', color: 'white', padding: '10px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
    tab: (active: boolean) => ({ flex: 1, padding: '12px', background: active ? '#1f2937' : '#eee', color: active ? 'white' : '#666', border: 'none', cursor: 'pointer', fontWeight: 'bold' })
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '20px' }}>
        <h1>🛠 管理パネル</h1>
        <Link href="/"><button style={{...s.btn, background: '#3b82f6'}}>🏠 戻る</button></Link>
      </div>

      <div style={{ display: 'flex', gap: '2px', marginBottom: '20px' }}>
        {['markets', 'categories', 'users', 'config'].map((t: any) => (
          <button key={t} onClick={() => setActiveTab(t)} style={s.tab(activeTab === t)}>{t === 'markets' ? '問い管理' : t === 'categories' ? 'カテゴリ' : t === 'users' ? 'ユーザー' : 'サイト設定'}</button>
        ))}
      </div>

      {activeTab === 'config' && (
        <div style={{ background: '#f9f9f9', padding: '20px', borderRadius: '12px' }}>
          <h3>📢 サイト基本情報の編集</h3>
          <div style={{ display: 'grid', gap: '10px' }}>
            <div><label>サイトタイトル</label><input value={siteConfig.site_title} onChange={e => setSiteConfig({...siteConfig, site_title: e.target.value})} style={s.inp} /></div>
            <div><label>タイトル下の説明文</label><input value={siteConfig.site_description} onChange={e => setSiteConfig({...siteConfig, site_description: e.target.value})} style={s.inp} /></div>
            <div><label>通信欄メッセージ (ホーム上部)</label><textarea value={siteConfig.admin_message} onChange={e => setSiteConfig({...siteConfig, admin_message: e.target.value})} style={{...s.inp, height: '60px'}} /></div>
            <div><label>𝕏投稿テンプレート</label><textarea value={siteConfig.share_text_base} onChange={e => setSiteConfig({...siteConfig, share_text_base: e.target.value})} style={{ ...s.inp, height: '60px' }} /></div>
            <button onClick={handleUpdateConfig} style={{ ...s.btn, background: '#10b981' }}>設定を保存</button>
          </div>
        </div>
      )}

      {activeTab === 'markets' && (
        <>
          <section style={{ background: '#f4f4f4', padding: '15px', borderRadius: '10px', marginBottom: '20px' }}>
            <h3>🆕 新規問い作成</h3>
            <input placeholder="タイトル" value={newMarket.title} onChange={e => setNewMarket({...newMarket, title: e.target.value})} style={s.inp} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <select value={newMarket.category} onChange={e => setNewMarket({...newMarket, category: e.target.value})} style={s.inp}>
                <option value="">カテゴリ選択</option>{categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <input type="datetime-local" onChange={e => setNewMarket({...newMarket, end_date: e.target.value})} style={s.inp} />
            </div>
            <input type="file" onChange={e => uploadImage(e, false)} style={{marginBottom:'8px'}} />
            <input placeholder="選択肢 (カンマ区切り)" value={newMarket.options} onChange={e => setNewMarket({...newMarket, options: e.target.value})} style={s.inp} />
            <button onClick={handleCreateMarket} style={{ ...s.btn, width: '100%', background: '#3b82f6' }}>公開</button>
          </section>

          {markets.map(m => (
            <div key={m.id} style={{ border: '1px solid #eee', padding: '15px', marginBottom: '10px', borderRadius: '10px' }}>
              {editingId === m.id ? (
                <div style={{ display: 'grid', gap: '5px' }}>
                  <input value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} style={s.inp} />
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <select value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value})} style={s.inp}>
                      {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <input type="datetime-local" value={editForm.end_date} onChange={e => setEditForm({...editForm, end_date: e.target.value})} style={s.inp} />
                  </div>
                  <input type="file" onChange={e => uploadImage(e, true)} />
                  {editForm.market_options.map((opt: any, idx: number) => (
                    <input key={opt.id} value={opt.name} onChange={e => { const newOpts = [...editForm.market_options]; newOpts[idx].name = e.target.value; setEditForm({ ...editForm, market_options: newOpts }) }} style={s.inp} />
                  ))}
                  <input placeholder="+ 選択肢を追加" value={newOptionName} onChange={e => setNewOptionName(e.target.value)} style={{ ...s.inp, border: '1px solid #3b82f6' }} />
                  <button onClick={handleUpdateMarket} style={{...s.btn, background:'#10b981'}}>保存</button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><strong>{m.title}</strong><div style={{fontSize:'11px', color:'#666'}}>{m.category} | 締切: {new Date(m.end_date).toLocaleString()}</div></div>
                  <button onClick={() => { setEditingId(m.id); setEditForm({...m, end_date: new Date(m.end_date).toISOString().slice(0,16)}); }} style={{...s.btn, padding:'5px 10px'}}>編集</button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {activeTab === 'categories' && (
        <div style={{ background: '#fff', padding: '15px', borderRadius: '10px', border: '1px solid #eee' }}>
          <h3>📁 カテゴリの編集と順序変更</h3>
          {categories.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: '5px', marginBottom: '5px' }}>
              <input type="number" defaultValue={c.display_order} onBlur={e => supabase.from('categories').update({ display_order: Number(e.target.value) }).eq('id', c.id).then(()=>fetchData())} style={{ width: '50px' }} />
              <input defaultValue={c.name} onBlur={e => supabase.from('categories').update({ name: e.target.value }).eq('id', c.id).then(()=>fetchData())} style={s.inp} />
              <button onClick={() => { if(confirm('削除？')) supabase.from('categories').delete().eq('id', c.id).then(()=>fetchData()) }} style={{background:'none', border:'none', color:'red'}}>✕</button>
            </div>
          ))}
          <div style={{ marginTop: '15px', borderTop: '1px solid #eee', paddingTop: '10px' }}>
            <input placeholder="新しいカテゴリ名" value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})} style={s.inp} />
            <button onClick={() => supabase.from('categories').insert([newCategory]).then(()=>fetchData())} style={{...s.btn, width: '100%'}}>カテゴリ追加</button>
          </div>
        </div>
      )}

      {activeTab === 'users' && (
        <table style={{ width: '100%', fontSize: '13px' }}>
          <thead><tr style={{ background: '#eee' }}><th>ユーザー</th><th>ポイント</th><th>ランキング</th><th>操作</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '10px' }}>{u.username || '匿名'}</td>
                <td><input type="number" defaultValue={u.point_balance} onBlur={e => supabase.from('profiles').update({ point_balance: Number(e.target.value) }).eq('id', u.id).then(()=>fetchData())} style={{ width: '80px' }} /></td>
                <td><select defaultValue={u.is_hidden_from_ranking ? 'hide' : 'show'} onChange={e => supabase.from('profiles').update({ is_hidden_from_ranking: e.target.value === 'hide' }).eq('id', u.id).then(()=>fetchData())}><option value="show">表示</option><option value="hide">隠す</option></select></td>
                <td><button onClick={() => { if(confirm('削除？')) supabase.from('profiles').delete().eq('id', u.id).then(()=>fetchData()) }} style={{ color: 'red', border: 'none', background: 'none' }}>削除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
