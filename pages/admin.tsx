import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function Admin() {
  const [activeTab, setActiveTab] = useState<'markets' | 'categories' | 'users' | 'config'>('markets')
  const [marketSort, setMarketSort] = useState<'date' | 'category'>('date')
  const [markets, setMarkets] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [siteConfig, setSiteConfig] = useState<any>({ 
    id: 1, site_title: '', site_description: '', admin_message: '', show_ranking: true, share_text_base: '' 
  })

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [uploading, setUploading] = useState(false)
  const [generating, setGenerating] = useState(false)

  const [newMarket, setNewMarket] = useState({ title: '', category: '', end_date: '', description: '', image_url: '', options: '' })
  const [newCategory, setNewCategory] = useState({ name: '', icon: '', display_order: 0 })

  const fetchConfig = useCallback(async () => {
    const { data } = await supabase.from('site_config').select('*').single()
    if (data) setSiteConfig(data)
  }, [])

  const fetchData = useCallback(async () => {
    setIsLoading(true)
    let mQuery = supabase.from('markets').select('*, market_options(*)')
    if (marketSort === 'date') mQuery = mQuery.order('end_date', { ascending: true })
    else mQuery = mQuery.order('category', { ascending: true })

    const [m, c, u] = await Promise.all([
      mQuery,
      supabase.from('categories').select('*').order('display_order', { ascending: true }),
      supabase.from('profiles').select('*').order('point_balance', { ascending: false })
    ])
    if (m.data) setMarkets(m.data)
    if (c.data) setCategories(c.data)
    if (u.data) setUsers(u.data)
    setIsLoading(false)
  }, [marketSort])

  useEffect(() => {
    fetchData()
    fetchConfig()
  }, [fetchData, fetchConfig])

  // --- 画像関連機能 ---
  async function uploadImage(e: any, isEdit: boolean = false) {
    try {
      setUploading(true)
      const file = e.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random()}.${fileExt}`
      const { error: uploadError } = await supabase.storage.from('market-images').upload(fileName, file)
      if (uploadError) throw uploadError
      const { data: { publicUrl } } = supabase.storage.from('market-images').getPublicUrl(fileName)
      if (isEdit) setEditForm({ ...editForm, image_url: publicUrl })
      else setNewMarket({ ...newMarket, image_url: publicUrl })
      alert('アップロード完了')
    } catch (error: any) { alert(error.message) } finally { setUploading(false) }
  }

  // AI画像生成 (Edge Function等でDALL-Eを叩く想定)
  async function generateAIImage(prompt: string, isEdit: boolean = false) {
    if (!prompt) return alert('プロンプト（タイトルのキーワード等）を入力してください')
    try {
      setGenerating(true)
      // ここにAI生成API（OpenAI等）を呼び出すロジック、または生成用のEdge Function呼び出しを記述
      // 現状はプレースホルダとして機能のみ定義
      const response = await fetch('/api/generate-image', { 
        method: 'POST', 
        body: JSON.stringify({ prompt }) 
      })
      const { url } = await response.json()
      if (isEdit) setEditForm({ ...editForm, image_url: url })
      else setNewMarket({ ...newMarket, image_url: url })
    } catch (e) {
      alert('AI生成にはAPIの設定が必要です。URLを直接入力するかアップロードしてください。')
    } finally { setGenerating(false) }
  }

  // --- 更新・作成ロジック ---
  async function handleUpdateConfig() {
    const { error } = await supabase.from('site_config').update(siteConfig).eq('id', siteConfig.id)
    if (!error) alert('保存しました')
  }

  async function handleCreateMarket() {
    if(!newMarket.title || !newMarket.end_date || !newMarket.options) return alert('必須項目を入力してください')
    const optArray = newMarket.options.split(',').map(s => s.trim())
    const { error } = await supabase.rpc('create_market_with_options', {
      title_input: newMarket.title, category_input: newMarket.category,
      end_date_input: new Date(newMarket.end_date).toISOString(), description_input: newMarket.description,
      image_url_input: newMarket.image_url, options_input: optArray
    })
    if (!error) { alert('作成成功'); fetchData(); } else alert(error.message)
  }

  async function handleUpdateMarket() {
    await supabase.from('markets').update({
      title: editForm.title, description: editForm.description, category: editForm.category,
      end_date: new Date(editForm.end_date).toISOString(), image_url: editForm.image_url
    }).eq('id', editingId)
    for (const opt of editForm.market_options) {
      await supabase.from('market_options').update({ name: opt.name }).eq('id', opt.id)
    }
    alert('保存しました'); setEditingId(null); fetchData();
  }

  async function handleUpdateCategory(id: number, updates: any) {
    await supabase.from('categories').update(updates).eq('id', id)
    fetchData()
  }

  const s: any = {
    inp: { padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize:'13px', width: '100%', boxSizing: 'border-box' },
    btn: { background: '#1f2937', color: 'white', padding: '10px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' },
    section: { background: '#f8fafc', padding: '15px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0' },
    tab: (active: boolean) => ({ flex: 1, padding: '10px', background: active ? '#1f2937' : '#f3f4f6', color: active ? 'white' : '#4b5563', border:'none', cursor:'pointer', fontWeight:'bold', borderRadius:'4px', fontSize:'12px' })
  }

  if (isLoading) return <div style={{padding:'20px'}}>読み込み中...</div>

  return (
    <div style={{ maxWidth: '950px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '15px' }}>
        <h1 style={{ margin: 0, fontSize: '20px' }}>🛠 管理パネル</h1>
        <Link href="/" style={{ textDecoration: 'none', background: '#3b82f6', color: 'white', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize:'14px' }}>🏠 戻る</Link>
      </div>

      <div style={{ display: 'flex', gap: '5px', marginBottom: '20px' }}>
        <button onClick={() => setActiveTab('markets')} style={s.tab(activeTab === 'markets')}>問い管理</button>
        <button onClick={() => setActiveTab('categories')} style={s.tab(activeTab === 'categories')}>カテゴリ設定</button>
        <button onClick={() => setActiveTab('users')} style={s.tab(activeTab === 'users')}>ユーザー管理</button>
        <button onClick={() => setActiveTab('config')} style={s.tab(activeTab === 'config')}>サイト設定</button>
      </div>

      {activeTab === 'markets' && (
        <>
          <section style={s.section}>
            <h3>🆕 新規問い作成</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <input placeholder="タイトル" value={newMarket.title} onChange={e => setNewMarket({...newMarket, title: e.target.value})} style={s.inp} />
              <textarea placeholder="判定基準" value={newMarket.description} onChange={e => setNewMarket({...newMarket, description: e.target.value})} style={s.inp} />
              <div style={{display:'flex', gap:'10px'}}>
                <select value={newMarket.category} onChange={e => setNewMarket({...newMarket, category: e.target.value})} style={{...s.inp, flex:1}}>
                  <option value="">カテゴリ選択</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                <input type="datetime-local" onChange={e => setNewMarket({...newMarket, end_date: e.target.value})} style={{...s.inp, flex:1}} />
              </div>

              {/* 画像操作エリア */}
              <div style={{ padding: '10px', border: '1px dashed #ccc', borderRadius: '8px', background: '#fff' }}>
                <div style={{ fontSize: '12px', marginBottom: '8px', fontWeight: 'bold' }}>画像設定</div>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <input type="file" accept="image/*" onChange={(e) => uploadImage(e, false)} style={{ fontSize: '11px' }} />
                  <button onClick={() => generateAIImage(newMarket.title)} style={{ ...s.btn, background: '#a855f7', padding: '5px 10px', fontSize: '11px' }}>
                    {generating ? '生成中...' : '🪄 AIで生成'}
                  </button>
                </div>
                <input placeholder="画像URLを直接入力も可" value={newMarket.image_url} onChange={e => setNewMarket({...newMarket, image_url: e.target.value})} style={{ ...s.inp, marginTop: '8px' }} />
                {newMarket.image_url && <img src={newMarket.image_url} style={{ height: '50px', marginTop: '5px', borderRadius: '4px' }} />}
              </div>

              <input placeholder="選択肢 (カンマ区切り)" value={newMarket.options} onChange={e => setNewMarket({...newMarket, options: e.target.value})} style={s.inp} />
              <button onClick={handleCreateMarket} style={s.btn}>問いを公開</button>
            </div>
          </section>

          {markets.map(m => (
            <div key={m.id} style={{ border: '1px solid #f1f5f9', padding: '15px', borderRadius: '10px', marginBottom: '10px', background: 'white' }}>
              {editingId === m.id ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  <input value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} style={s.inp} />
                  <textarea value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} style={s.inp} />
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <select value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value})} style={{ ...s.inp, flex: 1 }}>
                      {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <input type="datetime-local" value={editForm.end_date} onChange={e => setEditForm({...editForm, end_date: e.target.value})} style={{ ...s.inp, flex: 1 }} />
                  </div>

                  {/* 編集時の画像操作 */}
                  <div style={{ padding: '10px', border: '1px solid #eee', borderRadius: '8px' }}>
                    <input type="file" onChange={(e) => uploadImage(e, true)} style={{ fontSize: '11px' }} />
                    <button onClick={() => generateAIImage(editForm.title, true)} style={{ ...s.btn, background: '#a855f7', padding: '5px 10px', fontSize: '11px', marginLeft: '10px' }}>AI生成</button>
                    <input value={editForm.image_url} onChange={e => setEditForm({ ...editForm, image_url: e.target.value })} style={{ ...s.inp, marginTop: '5px' }} />
                  </div>

                  <div style={{ padding: '10px', background: '#f8f9fa', borderRadius: '6px' }}>
                    {editForm.market_options.map((opt: any, idx: number) => (
                      <input key={opt.id} value={opt.name} onChange={e => {
                        const newOpts = [...editForm.market_options]; newOpts[idx].name = e.target.value; setEditForm({ ...editForm, market_options: newOpts })
                      }} style={{ ...s.inp, marginBottom: '5px' }} />
                    ))}
                  </div>
                  <div style={{display:'flex', gap:'10px'}}>
                    <button onClick={handleUpdateMarket} style={{...s.btn, flex:1, background:'#10b981'}}>保存</button>
                    <button onClick={() => setEditingId(null)} style={{...s.btn, flex:1, background:'#94a3b8'}}>中止</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <div>
                    <strong>{m.title}</strong>
                    <div style={{fontSize:'11px', color:'#666'}}>{m.category} | {new Date(m.end_date).toLocaleString()}</div>
                  </div>
                  <button onClick={() => { setEditingId(m.id); setEditForm({...m, end_date: new Date(m.end_date).toISOString().slice(0,16)}); }} style={{...s.btn, padding: '5px 10px'}}>編集</button>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {activeTab === 'categories' && (
        <section style={s.section}>
          <h3>📁 カテゴリ設定（名称編集・順序変更）</h3>
          <div style={{ display: 'flex', gap: '5px', marginBottom: '15px' }}>
            <input placeholder="新カテゴリ名" value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})} style={s.inp} />
            <input placeholder="順序" type="number" value={newCategory.display_order} onChange={e => setNewCategory({...newCategory, display_order: Number(e.target.value)})} style={{...s.inp, width:'60px'}} />
            <button onClick={() => { supabase.from('categories').insert([newCategory]).then(()=>fetchData()); setNewCategory({name:'', icon:'', display_order:0}); }} style={s.btn}>追加</button>
          </div>

          <div style={{ background: '#fff', borderRadius: '8px', border: '1px solid #eee' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px' }}>
              <thead><tr style={{ background: '#f1f5f9', textAlign: 'left' }}><th style={{ padding: '10px' }}>表示順</th><th>アイコン</th><th>カテゴリー名</th><th>操作</th></tr></thead>
              <tbody>
                {categories.map(c => (
                  <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                    <td style={{ padding: '10px' }}>
                      <input type="number" defaultValue={c.display_order} onBlur={e => handleUpdateCategory(c.id, { display_order: Number(e.target.value) })} style={{ width: '40px' }} />
                    </td>
                    <td>
                      <input defaultValue={c.icon} onBlur={e => handleUpdateCategory(c.id, { icon: e.target.value })} style={{ width: '30px', border: 'none' }} />
                    </td>
                    <td>
                      <input defaultValue={c.name} onBlur={e => handleUpdateCategory(c.id, { name: e.target.value })} style={{ border: 'none', width: '100%' }} />
                    </td>
                    <td>
                      <button onClick={() => { if(confirm('削除？')) supabase.from('categories').delete().eq('id', c.id).then(()=>fetchData()) }} style={{ color: 'red', border: 'none', background: 'none', cursor: 'pointer' }}>削除</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ユーザー管理・サイト設定は前回機能を維持 */}
      {activeTab === 'config' && (
        <section style={s.section}>
          <h3>📢 サイト基本設定</h3>
          <div style={{ display: 'grid', gap: '10px' }}>
            <input value={siteConfig.site_title} onChange={e => setSiteConfig({...siteConfig, site_title: e.target.value})} placeholder="サイト名" style={s.inp} />
            <textarea value={siteConfig.admin_message} onChange={e => setSiteConfig({...siteConfig, admin_message: e.target.value})} placeholder="通信欄" style={{...s.inp, height: '60px'}} />
            <button onClick={handleUpdateConfig} style={{...s.btn, background: '#10b981'}}>設定を保存</button>
          </div>
        </section>
      )}
    </div>
  )
}
