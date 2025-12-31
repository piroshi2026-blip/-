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

  // --- 画像アップロード ---
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

  // --- 問い（マーケット）操作 ---
  async function handleCreateMarket() {
    const optArray = newMarket.options.split(',').map(s => s.trim())
    const { error } = await supabase.rpc('create_market_with_options', {
      title_input: newMarket.title, category_input: newMarket.category,
      end_date_input: newMarket.end_date, description_input: newMarket.description,
      image_url_input: newMarket.image_url, options_input: optArray
    })
    if (!error) { alert('作成成功'); fetchData(); } else alert(error.message)
  }

  async function handleUpdateMarket() {
    const { error: mError } = await supabase.from('markets').update({
      title: editForm.title, description: editForm.description, category: editForm.category,
      end_date: new Date(editForm.end_date).toISOString(), image_url: editForm.image_url
    }).eq('id', editingId)
    for (const opt of editForm.market_options) {
      await supabase.from('market_options').update({ name: opt.name }).eq('id', opt.id)
    }
    alert('保存しました'); setEditingId(null); fetchData();
  }

  async function handleDeleteMarket(id: number) {
    if(!confirm('問いを削除しますか？')) return
    await supabase.from('markets').delete().eq('id', id)
    fetchData()
  }

  async function handleResolve(marketId: number, optionId: number) {
    if(!confirm('この結果で確定させますか？')) return
    const { error } = await supabase.rpc('resolve_market', { market_id_input: marketId, winning_option_id: optionId })
    if (!error) { alert('確定成功'); fetchData(); } else alert(error.message)
  }

  // --- カテゴリー操作 ---
  async function handleCreateCategory() {
    await supabase.from('categories').insert([newCategory])
    setNewCategory({ name: '', icon: '', display_order: 0 })
    fetchData()
  }

  async function handleUpdateCategory(id: number, updates: any) {
    await supabase.from('categories').update(updates).eq('id', id)
    fetchData()
  }

  async function handleDeleteCategory(id: number) {
    if(!confirm('削除しますか？')) return
    await supabase.from('categories').delete().eq('id', id)
    fetchData()
  }

  // --- ユーザー・ランキング操作 ---
  async function toggleUserVisibility(id: string, hide: boolean) {
    await supabase.from('profiles').update({ is_hidden_from_ranking: hide }).eq('id', id)
    fetchData()
  }

  async function handleDeleteUser(id: string) {
    if(!confirm('ユーザーデータを削除しますか？(認証データは残ります)')) return
    await supabase.from('profiles').delete().eq('id', id)
    fetchData()
  }

  if (isLoading) return <div style={{padding:'20px'}}>読み込み中...</div>

  return (
    <div style={{ maxWidth: '950px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>🛠 YOSOL 管理パネル</h1>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => setActiveTab('markets')} style={tabStyle(activeTab === 'markets')}>問い管理</button>
        <button onClick={() => setActiveTab('categories')} style={tabStyle(activeTab === 'categories')}>カテゴリー設定</button>
        <button onClick={() => setActiveTab('users')} style={tabStyle(activeTab === 'users')}>ランキング・ユーザー</button>
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
              <input type="file" accept="image/*" onChange={(e) => uploadImage(e, false)} />
              <input placeholder="選択肢 (カンマ区切り)" onChange={e => setNewMarket({...newMarket, options: e.target.value})} style={inpStyle} />
              <button onClick={handleCreateMarket} style={btnPrimary}>問いを公開する</button>
            </div>
          </section>

          {markets.map(m => (
            <div key={m.id} style={cardStyle}>
              {editingId === m.id ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  <input value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} style={inpStyle} />
                  <textarea value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} style={inpStyle} />
                  <input type="datetime-local" value={editForm.end_date} onChange={e => setEditForm({...editForm, end_date: e.target.value})} style={inpStyle} />
                  <input type="file" accept="image/*" onChange={(e) => uploadImage(e, true)} />
                  {editForm.market_options.map((opt: any, i: number) => (
                    <input key={opt.id} value={opt.name} onChange={e => {
                      const n = [...editForm.market_options]; n[i].name = e.target.value; setEditForm({...editForm, market_options: n});
                    }} style={inpStyle} />
                  ))}
                  <div style={{display:'flex', gap:'10px'}}>
                    <button onClick={handleUpdateMarket} style={btnSave}>保存</button>
                    <button onClick={() => setEditingId(null)} style={btnCancel}>中止</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <strong>{m.title} [{m.category}]</strong>
                    <div>
                      <button onClick={() => { setEditingId(m.id); setEditForm({...m, end_date: new Date(m.end_date).toISOString().slice(0,16)}); }} style={btnEdit}>編集</button>
                      <button onClick={() => handleDeleteMarket(m.id)} style={{...btnEdit, color:'red'}}>削除</button>
                    </div>
                  </div>
                  {!m.is_resolved && (
                    <div style={{marginTop:'10px', display:'flex', gap:'5px'}}>
                      {m.market_options.map((opt: any) => (
                        <button key={opt.id} onClick={() => handleResolve(m.id, opt.id)} style={btnResolve}>「{opt.name}」で確定</button>
                      ))}
                    </div>
                  )}
                  {m.is_resolved && <span style={{color:'green', fontSize:'12px'}}>✅ 確定済み</span>}
                </>
              )}
            </div>
          ))}
        </>
      )}

      {activeTab === 'categories' && (
        <>
          <section style={sectionStyle}>
            <h3>🆕 カテゴリ追加</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input placeholder="名前" value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})} style={inpStyle} />
              <input placeholder="アイコン" value={newCategory.icon} onChange={e => setNewCategory({...newCategory, icon: e.target.value})} style={{...inpStyle, width:'60px'}} />
              <input type="number" value={newCategory.display_order} onChange={e => setNewCategory({...newCategory, display_order: Number(e.target.value)})} style={{...inpStyle, width:'60px'}} />
              <button onClick={handleCreateCategory} style={btnPrimary}>追加</button>
            </div>
          </section>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr style={{textAlign:'left'}}><th style={{padding:'10px'}}>順序</th><th>名前</th><th>アイコン</th><th>操作</th></tr></thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id} style={{borderBottom:'1px solid #eee'}}>
                  <td><input type="number" defaultValue={c.display_order} onBlur={e => handleUpdateCategory(c.id, {display_order: Number(e.target.value)})} style={{width:'50px'}} /></td>
                  <td><input defaultValue={c.name} onBlur={e => handleUpdateCategory(c.id, {name: e.target.value})} style={{border:'none'}} /></td>
                  <td><input defaultValue={c.icon} onBlur={e => handleUpdateCategory(c.id, {icon: e.target.value})} style={{width:'40px', border:'none'}} /></td>
                  <td><button onClick={() => handleDeleteCategory(c.id)} style={{color:'red', border:'none', background:'none'}}>削除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {activeTab === 'users' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{textAlign:'left'}}><th style={{padding:'10px'}}>ユーザー</th><th>ポイント</th><th>ランキング</th><th>操作</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{borderBottom:'1px solid #eee'}}>
                <td style={{padding:'10px'}}>{u.username}</td>
                <td>{u.point_balance.toLocaleString()}</td>
                <td>{u.is_hidden_from_ranking ? '🙈 非表示' : '👁 表示中'}</td>
                <td>
                  <button onClick={() => toggleUserVisibility(u.id, !u.is_hidden_from_ranking)} style={{background: u.is_hidden_from_ranking ? '#22c55e' : '#f59e0b', color:'white', border:'none', padding:'5px', borderRadius:'4px', marginRight:'5px'}}>
                    {u.is_hidden_from_ranking ? '戻す' : '隠す'}
                  </button>
                  <button onClick={() => handleDeleteUser(u.id)} style={{background:'red', color:'white', border:'none', padding:'5px', borderRadius:'4px'}}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

// 共通スタイル
const tabStyle = (active: boolean) => ({ flex: 1, padding: '12px', background: active ? '#2563eb' : '#eee', color: active ? 'white' : 'black', border:'none', cursor:'pointer' });
const sectionStyle = { background: '#f8fafc', padding: '20px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #eee' };
const cardStyle = { border: '1px solid #ddd', padding: '15px', borderRadius: '10px', marginBottom: '10px', background: 'white' };
const inpStyle = { padding: '10px', border: '1px solid #ddd', borderRadius: '6px' };
const btnPrimary = { background: '#2563eb', color: 'white', padding: '10px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' };
const btnEdit = { background: '#eee', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer', marginRight: '5px' };
const btnSave = { flex: 1, background: '#059669', color: 'white', padding: '10px', border: 'none', borderRadius: '6px' };
const btnCancel = { flex: 1, background: '#94a3b8', color: 'white', padding: '10px', border: 'none', borderRadius: '6px' };
const btnResolve = { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', padding: '5px 10px', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' };
