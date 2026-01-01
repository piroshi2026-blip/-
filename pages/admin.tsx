import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function Admin() {
  const [activeTab, setActiveTab] = useState<'markets' | 'categories' | 'users'>('markets')
  const [marketSort, setMarketSort] = useState<'date' | 'category'>('date') // ソート用
  const [markets, setMarkets] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [uploading, setUploading] = useState(false)

  const [newMarket, setNewMarket] = useState({ title: '', category: '', end_date: '', description: '', image_url: '', options: '' })
  const [newCategory, setNewCategory] = useState({ name: '', icon: '', display_order: 0 })

  useEffect(() => {
    fetchData()
  }, [marketSort]) // ソート変更時に再取得

  async function fetchData() {
    setIsLoading(true)
    let mQuery = supabase.from('markets').select('*, market_options(*)')

    // ソート条件の切り替え
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
  }

  // --- (uploadImageなどは既存のまま維持) ---
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

  async function handleCreateMarket() {
    if(!newMarket.title || !newMarket.end_date || !newMarket.options) return alert('必須項目を入力してください')
    const optArray = newMarket.options.split(',').map(s => s.trim())
    const { error } = await supabase.rpc('create_market_with_options', {
      title_input: newMarket.title, 
      category_input: newMarket.category,
      end_date_input: new Date(newMarket.end_date).toISOString(), // 型変換
      description_input: newMarket.description,
      image_url_input: newMarket.image_url, 
      options_input: optArray
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

  async function handleResolve(marketId: number, optionId: number) {
    if(!confirm('この結果で確定させますか？配当が自動配分されます。')) return
    const { error } = await supabase.rpc('resolve_market', { 
      market_id_input: marketId, 
      winning_option_id: optionId 
    })
    if (!error) { alert('確定成功'); fetchData(); } else alert(error.message)
  }

  async function handleUpdateCategory(id: number, updates: any) {
    await supabase.from('categories').update(updates).eq('id', id)
    fetchData()
  }

  if (isLoading) return <div style={{padding:'20px'}}>読み込み中...</div>

  return (
    <div style={{ maxWidth: '950px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '15px' }}>
        <h1 style={{ margin: 0, fontSize: '20px' }}>🛠 管理パネル</h1>
        <Link href="/" style={{ textDecoration: 'none', background: '#3b82f6', color: 'white', padding: '8px 16px', borderRadius: '8px', fontWeight: 'bold', fontSize:'14px' }}>
          🏠 アプリに戻る
        </Link>
      </div>

      <div style={{ display: 'flex', gap: '5px', marginBottom: '20px' }}>
        <button onClick={() => setActiveTab('markets')} style={tabStyle(activeTab === 'markets')}>問い管理</button>
        <button onClick={() => setActiveTab('categories')} style={tabStyle(activeTab === 'categories')}>カテゴリ設定</button>
        <button onClick={() => setActiveTab('users')} style={tabStyle(activeTab === 'users')}>ランキング・ユーザー</button>
      </div>

      {activeTab === 'markets' && (
        <>
          <section style={sectionStyle}>
            <h3 style={{fontSize:'16px'}}>🆕 新規作成</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <input placeholder="タイトル" onChange={e => setNewMarket({...newMarket, title: e.target.value})} style={inpStyle} />
              <textarea placeholder="判定基準" onChange={e => setNewMarket({...newMarket, description: e.target.value})} style={inpStyle} />
              <div style={{display:'flex', gap:'10px'}}>
                <select onChange={e => setNewMarket({...newMarket, category: e.target.value})} style={{...inpStyle, flex:1}}>
                  <option value="">カテゴリを選択</option>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                <input type="datetime-local" onChange={e => setNewMarket({...newMarket, end_date: e.target.value})} style={{...inpStyle, flex:1}} />
              </div>
              <div style={{fontSize:'12px', border:'1px dashed #ccc', padding:'10px', borderRadius:'6px'}}>
                画像: <input type="file" accept="image/*" onChange={(e) => uploadImage(e, false)} />
              </div>
              <input placeholder="選択肢 (カンマ区切り: はい, いいえ)" onChange={e => setNewMarket({...newMarket, options: e.target.value})} style={inpStyle} />
              <button onClick={handleCreateMarket} style={btnPrimary}>問いを公開する</button>
            </div>
          </section>

          {/* 問いのソートタブ */}
          <div style={{display:'flex', gap:'10px', marginBottom:'15px'}}>
            <button onClick={()=>setMarketSort('date')} style={sortTabStyle(marketSort==='date')}>📅 締切順</button>
            <button onClick={()=>setMarketSort('category')} style={sortTabStyle(marketSort==='category')}>📁 カテゴリ順</button>
          </div>

          {markets.map(m => (
            <div key={m.id} style={cardStyle}>
              {editingId === m.id ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  <input value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} style={inpStyle} />
                  <textarea value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} style={inpStyle} />
                  <input type="datetime-local" value={editForm.end_date} onChange={e => setEditForm({...editForm, end_date: e.target.value})} style={inpStyle} />
                  <input type="file" accept="image/*" onChange={(e) => uploadImage(e, true)} />
                  <div style={{display:'flex', gap:'10px'}}>
                    <button onClick={handleUpdateMarket} style={btnSave}>保存</button>
                    <button onClick={() => setEditingId(null)} style={btnCancel}>中止</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems:'flex-start' }}>
                    <div>
                      <div style={{fontSize:'11px', color:'#3b82f6', fontWeight:'bold'}}>{m.category}</div>
                      <strong style={{fontSize:'15px'}}>{m.title}</strong>
                      <div style={{fontSize:'11px', color:'#ef4444', marginTop:'4px'}}>⏰ 締切: {new Date(m.end_date).toLocaleString()}</div>
                    </div>
                    <div>
                      <button onClick={() => { setEditingId(m.id); setEditForm({...m, end_date: new Date(m.end_date).toISOString().slice(0,16)}); }} style={btnEdit}>編集</button>
                      <button onClick={() => { if(confirm('完全に削除しますか？')) supabase.from('markets').delete().eq('id', m.id).then(()=>fetchData()) }} style={{...btnEdit, color:'red'}}>削除</button>
                    </div>
                  </div>
                  {!m.is_resolved && (
                    <div style={{marginTop:'10px', display:'flex', gap:'5px', flexWrap:'wrap'}}>
                      {m.market_options.map((opt: any) => (
                        <button key={opt.id} onClick={() => handleResolve(m.id, opt.id)} style={btnResolve}>「{opt.name}」で確定</button>
                      ))}
                    </div>
                  )}
                  {m.is_resolved && <div style={{marginTop:'10px', background:'#f0fdf4', color:'#16a34a', fontSize:'11px', padding:'4px 8px', borderRadius:'4px', display:'inline-block', fontWeight:'bold'}}>✅ 確定済み</div>}
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
              <button onClick={() => { if(newCategory.name) { supabase.from('categories').insert([newCategory]).then(()=>fetchData()); setNewCategory({name:'', icon:'', display_order:0}); } }} style={btnPrimary}>追加</button>
            </div>
          </section>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize:'13px' }}>
            <thead><tr style={{textAlign:'left', borderBottom:'2px solid #eee'}}><th style={{padding:'10px'}}>順序</th><th>名前</th><th>アイコン</th><th>操作</th></tr></thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id} style={{borderBottom:'1px solid #eee'}}>
                  <td style={{padding:'10px'}}><input type="number" defaultValue={c.display_order} onBlur={e => handleUpdateCategory(c.id, {display_order: Number(e.target.value)})} style={{width:'50px'}} /></td>
                  <td><input defaultValue={c.name} onBlur={e => handleUpdateCategory(c.id, {name: e.target.value})} style={{border:'none', background:'none'}} /></td>
                  <td><input defaultValue={c.icon} onBlur={e => handleUpdateCategory(c.id, {icon: e.target.value})} style={{width:'40px', border:'none', background:'none'}} /></td>
                  <td><button onClick={() => { if(confirm('削除しますか？')) supabase.from('categories').delete().eq('id', c.id).then(()=>fetchData()) }} style={{color:'red', border:'none', background:'none', cursor:'pointer'}}>削除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {activeTab === 'users' && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize:'12px' }}>
          <thead><tr style={{textAlign:'left', borderBottom:'2px solid #eee'}}><th style={{padding:'10px'}}>ユーザー</th><th>ポイント</th><th>ランキング</th><th>操作</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{borderBottom:'1px solid #eee'}}>
                <td style={{padding:'10px'}}>{u.username || '名無しさん'} <div style={{fontSize:'9px', color:'#999'}}>{u.id.slice(0,8)}</div></td>
                <td style={{fontWeight:'bold'}}>{u.point_balance.toLocaleString()} pt</td>
                <td>{u.is_hidden_from_ranking ? '🙈 非表示' : '👁 表示中'}</td>
                <td>
                  <button onClick={() => supabase.from('profiles').update({ is_hidden_from_ranking: !u.is_hidden_from_ranking }).eq('id', u.id).then(()=>fetchData())} style={{background: u.is_hidden_from_ranking ? '#10b981' : '#f59e0b', color:'white', border:'none', padding:'4px 8px', borderRadius:'4px', marginRight:'5px', cursor:'pointer', fontSize:'10px'}}>
                    {u.is_hidden_from_ranking ? '戻す' : '隠す'}
                  </button>
                  <button onClick={() => { if(confirm('このユーザーを削除しますか？')) supabase.from('profiles').delete().eq('id', u.id).then(()=>fetchData()) }} style={{background:'#ef4444', color:'white', border:'none', padding:'4px 8px', borderRadius:'4px', cursor:'pointer', fontSize:'10px'}}>削除</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const tabStyle = (active: boolean) => ({ flex: 1, padding: '10px', background: active ? '#1f2937' : '#f3f4f6', color: active ? 'white' : '#4b5563', border:'none', cursor:'pointer', fontWeight:'bold', borderRadius:'4px', fontSize:'13px' });
const sortTabStyle = (active: boolean) => ({ padding: '6px 12px', background: active ? '#3b82f6' : 'white', color: active ? 'white' : '#666', border: '1px solid #ddd', borderRadius: '20px', fontSize: '11px', cursor: 'pointer', fontWeight: 'bold' });
const sectionStyle = { background: '#f8fafc', padding: '15px', borderRadius: '12px', marginBottom: '20px', border: '1px solid #e2e8f0' };
const cardStyle = { border: '1px solid #f1f5f9', padding: '15px', borderRadius: '10px', marginBottom: '10px', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' };
const inpStyle = { padding: '8px', border: '1px solid #ddd', borderRadius: '6px', fontSize:'13px' };
const btnPrimary = { background: '#1f2937', color: 'white', padding: '12px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' };
const btnEdit = { background: '#f1f5f9', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer', marginRight: '5px', fontSize:'11px' };
const btnSave = { flex: 1, background: '#10b981', color: 'white', padding: '10px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight:'bold' };
const btnCancel = { flex: 1, background: '#94a3b8', color: 'white', padding: '10px', border: 'none', borderRadius: '6px', cursor: 'pointer' };
const btnResolve = { background: '#eff6ff', border: '1px solid #bfdbfe', color: '#1d4ed8', padding: '6px 10px', borderRadius: '6px', fontSize: '11px', cursor: 'pointer', fontWeight:'bold' };
