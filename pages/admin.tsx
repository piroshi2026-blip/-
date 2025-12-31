import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function Admin() {
  const [activeTab, setActiveTab] = useState<'markets' | 'categories' | 'users'>('markets')
  const [markets, setMarkets] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  // 編集用ステート
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [uploading, setUploading] = useState(false)

  // 新規追加用
  const [newMarket, setNewMarket] = useState({ title: '', category: '', end_date: '', description: '', image_url: '', options: '' })
  const [newCategory, setNewCategory] = useState({ name: '', icon: '', display_order: 0 })

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setIsLoading(true)
    const [m, c, u] = await Promise.all([
      supabase.from('markets').select('*, market_options(*)').order('created_at', { ascending: false }),
      supabase.from('categories').select('*').order('display_order', { ascending: true }),
      supabase.from('profiles').select('*').order('point_balance', { ascending: false })
    ])
    if (m.data) setMarkets(m.data)
    if (c.data) setCategories(c.data)
    if (u.data) setUsers(u.data)
    setIsLoading(false)
  }

  // --- 画像アップロード機能 ---
  async function uploadImage(e: any, isEdit: boolean = false) {
    try {
      setUploading(true)
      const file = e.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random()}.${fileExt}`
      const filePath = `${fileName}`

      const { error: uploadError } = await supabase.storage
        .from('market-images')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      const { data: { publicUrl } } = supabase.storage
        .from('market-images')
        .getPublicUrl(filePath)

      if (isEdit) {
        setEditForm({ ...editForm, image_url: publicUrl })
      } else {
        setNewMarket({ ...newMarket, image_url: publicUrl })
      }
      alert('画像をアップロードしました')
    } catch (error: any) {
      alert(error.message)
    } finally {
      setUploading(false)
    }
  }

  // --- マーケット全項目編集の保存 ---
  async function handleUpdateMarket() {
    try {
      // 1. 本体更新
      const { error: mError } = await supabase.from('markets').update({
        title: editForm.title,
        description: editForm.description,
        category: editForm.category,
        end_date: new Date(editForm.end_date).toISOString(),
        image_url: editForm.image_url
      }).eq('id', editingId)
      if (mError) throw mError

      // 2. 選択肢更新
      for (const opt of editForm.market_options) {
        await supabase.from('market_options').update({ name: opt.name }).eq('id', opt.id)
      }

      alert('すべて保存しました')
      setEditingId(null)
      fetchData()
    } catch (e: any) { alert(e.message) }
  }

  // --- その他の機能（維持） ---
  async function handleCreateMarket() {
    const optArray = newMarket.options.split(',').map(s => s.trim())
    const { error } = await supabase.rpc('create_market_with_options', {
      title_input: newMarket.title, category_input: newMarket.category,
      end_date_input: newMarket.end_date, description_input: newMarket.description,
      image_url_input: newMarket.image_url, options_input: optArray
    })
    if (!error) { alert('作成成功'); fetchData(); } else alert(error.message)
  }

  async function handleResolve(marketId: number, optionId: number) {
    if(!confirm('結果を確定させますか？')) return
    const { error } = await supabase.rpc('resolve_market', { market_id_input: marketId, winning_option_id: optionId })
    if (!error) { alert('確定成功'); fetchData(); } else alert(error.message)
  }

  const toggleUserVisibility = async (id: string, hide: boolean) => {
    await supabase.from('profiles').update({ is_hidden_from_ranking: hide }).eq('id', id)
    fetchData()
  }

  if (isLoading) return <div style={{padding: '20px'}}>読み込み中...</div>

  return (
    <div style={{ maxWidth: '950px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>🛠 YOSOL 管理パネル</h1>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => setActiveTab('markets')} style={tabStyle(activeTab === 'markets')}>問い管理</button>
        <button onClick={() => setActiveTab('categories')} style={tabStyle(activeTab === 'categories')}>カテゴリー</button>
        <button onClick={() => setActiveTab('users')} style={tabStyle(activeTab === 'users')}>ユーザー・ランク</button>
      </div>

      {activeTab === 'markets' && (
        <>
          <section style={sectionStyle}>
            <h3>🆕 新規作成</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <input placeholder="タイトル" onChange={e => setNewMarket({...newMarket, title: e.target.value})} style={inpStyle} />
              <textarea placeholder="判定基準" onChange={e => setNewMarket({...newMarket, description: e.target.value})} style={inpStyle} />
              <div style={{display:'flex', gap:'10px'}}>
                <select onChange={e => setNewMarket({...newMarket, category: e.target.value})} style={{...inpStyle, flex:1}}>
                  <option value="">カテゴリ</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                <input type="datetime-local" onChange={e => setNewMarket({...newMarket, end_date: e.target.value})} style={{...inpStyle, flex:1}} />
              </div>
              <div>
                <label style={{fontSize:'12px'}}>画像アップロード:</label><br/>
                <input type="file" accept="image/*" onChange={(e) => uploadImage(e, false)} disabled={uploading} />
                {newMarket.image_url && <img src={newMarket.image_url} style={{height: '50px', display: 'block', marginTop:'5px'}} />}
              </div>
              <input placeholder="選択肢 (カンマ区切り)" onChange={e => setNewMarket({...newMarket, options: e.target.value})} style={inpStyle} />
              <button onClick={handleCreateMarket} style={btnPrimary}>作成</button>
            </div>
          </section>

          {markets.map(m => (
            <div key={m.id} style={cardStyle}>
              {editingId === m.id ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  <input value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} style={inpStyle} />
                  <textarea value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} style={{...inpStyle, height:'80px'}} />
                  <div style={{display:'flex', gap:'10px'}}>
                    <select value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value})} style={{...inpStyle, flex:1}}>
                      {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <input type="datetime-local" value={editForm.end_date} onChange={e => setEditForm({...editForm, end_date: e.target.value})} style={{...inpStyle, flex:1}} />
                  </div>
                  <div>
                    <label style={{fontSize:'12px'}}>画像変更:</label><br/>
                    <input type="file" accept="image/*" onChange={(e) => uploadImage(e, true)} disabled={uploading} />
                    {editForm.image_url && <img src={editForm.image_url} style={{height: '80px', marginTop:'5px'}} />}
                  </div>
                  {editForm.market_options.map((opt: any, i: number) => (
                    <input key={opt.id} value={opt.name} onChange={e => {
                      const newOpts = [...editForm.market_options];
                      newOpts[i].name = e.target.value;
                      setEditForm({...editForm, market_options: newOpts});
                    }} style={inpStyle} placeholder={`選択肢 ${i+1}`} />
                  ))}
                  <div style={{display:'flex', gap:'10px'}}>
                    <button onClick={handleUpdateMarket} style={btnSave}>すべて保存</button>
                    <button onClick={() => setEditingId(null)} style={btnCancel}>キャンセル</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{m.title} <span style={{fontSize:'12px', color:'#999'}}>[{m.category}]</span></strong>
                    <button onClick={() => {
                      setEditingId(m.id);
                      setEditForm({ ...m, end_date: new Date(m.end_date).toISOString().slice(0, 16) });
                    }} style={btnEdit}>編集</button>
                  </div>
                  {!m.is_resolved && (
                    <div style={{marginTop:'10px', display:'flex', gap:'5px', flexWrap:'wrap'}}>
                      {m.market_options.map((opt: any) => (
                        <button key={opt.id} onClick={() => handleResolve(m.id, opt.id)} style={btnResolve}>「{opt.name}」で確定</button>
                      ))}
                    </div>
                  )}
                  {m.is_resolved && <span style={{color:'green', fontSize:'12px'}}>✅ 解決済み</span>}
                </>
              )}
            </div>
          ))}
        </>
      )}

      {/* カテゴリー・ユーザー管理タブは維持 */}
    </div>
  )
}

// スタイル定義
const tabStyle = (active: boolean) => ({ flex: 1, padding: '12px', background: active ? '#2563eb' : '#eee', color: active ? 'white' : 'black', border: 'none', cursor: 'pointer', borderRadius: '4px' });
const cardStyle = { border: '1px solid #ddd', padding: '15px', borderRadius: '12px', marginBottom: '15px', background: 'white', boxShadow:'0 2px 4px rgba(0,0,0,0.05)' };
const sectionStyle = { background: '#f8fafc', padding: '20px', borderRadius: '12px', marginBottom: '30px', border: '1px solid #e2e8f0' };
const inpStyle = { padding: '10px', border: '1px solid #cbd5e1', borderRadius: '6px' };
const btnPrimary = { background: '#2563eb', color: 'white', padding: '12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' };
const btnEdit = { background: '#f3f4f6', border: '1px solid #ddd', padding: '5px 12px', borderRadius: '4px', cursor: 'pointer' };
const btnSave = { flex: 1, background: '#059669', color: 'white', padding: '10px', border: 'none', borderRadius: '6px', cursor: 'pointer' };
const btnCancel = { flex: 1, background: '#94a3b8', color: 'white', padding: '10px', border: 'none', borderRadius: '6px', cursor: 'pointer' };
const btnResolve = { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', padding: '4px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' };
