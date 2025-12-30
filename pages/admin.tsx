import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function Admin() {
  const [activeTab, setActiveTab] = useState<'markets' | 'users' | 'categories' | 'settings'>('markets')
  const [markets, setMarkets] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [password, setPassword] = useState('')

  // --- 新規作成用ステート (全項目) ---
  const [newTitle, setNewTitle] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newEndDate, setNewEndDate] = useState('')
  const [newOptions, setNewOptions] = useState('') 
  const [newImage, setNewImage] = useState('')

  // 編集用
  const [editingMarketId, setEditingMarketId] = useState<number | null>(null)
  const [editMarketForm, setEditMarketForm] = useState<any>({})

  useEffect(() => {
    if (localStorage.getItem('isAdmin') === 'true') setIsAdmin(true)
    fetchCategories()
  }, [])

  useEffect(() => { if (isAdmin) { fetchMarkets(); fetchUsers(); fetchCategories(); } }, [isAdmin])

  async function fetchMarkets() {
    const { data } = await supabase.from('markets').select('*, market_options(*)').order('created_at', { ascending: false })
    if (data) setMarkets(data)
  }
  async function fetchCategories() {
    const { data } = await supabase.from('categories').select('*').order('display_order', { ascending: true })
    if (data) { setCategories(data); if (!newCategory && data.length > 0) setNewCategory(data[0].name); }
  }
  async function fetchUsers() {
    const { data } = await supabase.from('profiles').select('*').order('point_balance', { ascending: false })
    if (data) setUsers(data)
  }

  // --- 新規追加 ---
  const handleCreateMarket = async () => {
    if (!newTitle || !newOptions || !newEndDate) return alert('必須項目を入力してください')
    try {
      const { data: market, error: mError } = await supabase.from('markets').insert({
        title: newTitle, description: newDescription, category: newCategory,
        end_date: new Date(newEndDate).toISOString(), image_url: newImage || 'https://placehold.co/600x400', total_pool: 0
      }).select().single()
      if (mError) throw mError
      const opts = newOptions.split(',').map(s => ({ market_id: market.id, name: s.trim(), pool: 0 }))
      await supabase.from('market_options').insert(opts)
      alert('追加しました！'); resetNewForm(); fetchMarkets()
    } catch (e: any) { alert(e.message) }
  }

  const resetNewForm = () => { setNewTitle(''); setNewDescription(''); setNewOptions(''); setNewEndDate(''); setNewImage(''); }

  const startEditMarket = (m: any) => {
    setEditingMarketId(m.id)
    setEditMarketForm({
      title: m.title, description: m.description, category: m.category,
      end_date: new Date(m.end_date).toISOString().slice(0, 16),
      options: m.market_options.sort((a: any, b: any) => a.id - b.id)
    })
  }

  const saveMarketEdit = async () => {
    await supabase.from('markets').update({
      title: editMarketForm.title, description: editMarketForm.description,
      category: editMarketForm.category, end_date: new Date(editMarketForm.end_date).toISOString()
    }).eq('id', editingMarketId)
    for (const opt of editMarketForm.options) {
      await supabase.from('market_options').update({ name: opt.name }).eq('id', opt.id)
    }
    alert('保存しました'); setEditingMarketId(null); fetchMarkets();
  }

  if (!isAdmin) return (
    <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h2>🔐 管理ログイン</h2>
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{padding:'10px'}} />
      <button onClick={() => { if(password==='admin1234'){setIsAdmin(true); localStorage.setItem('isAdmin','true')} }} style={{padding:'10px 20px', marginLeft:'10px'}}>ログイン</button>
      <div style={{marginTop:'20px'}}><button onClick={() => window.location.href = '/'}>アプリに戻る</button></div>
    </div>
  )

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h1>⚙️ YOSOL 管理</h1>
        <button onClick={() => {setIsAdmin(false); localStorage.removeItem('isAdmin')}}>ログアウト</button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom:'2px solid #eee', paddingBottom:'10px' }}>
        <button onClick={() => setActiveTab('markets')} style={{ background: activeTab==='markets'?'#2563eb':'#eee', color: activeTab==='markets'?'white':'black', border:'none', padding:'10px 20px', borderRadius:'20px' }}>マーケット</button>
        <button onClick={() => setActiveTab('users')} style={{ background: activeTab==='users'?'#2563eb':'#eee', color: activeTab==='users'?'white':'black', border:'none', padding:'10px 20px', borderRadius:'20px' }}>ユーザー</button>
        <button onClick={() => setActiveTab('categories')} style={{ background: activeTab==='categories'?'#2563eb':'#eee', color: activeTab==='categories'?'white':'black', border:'none', padding:'10px 20px', borderRadius:'20px' }}>カテゴリ</button>
      </div>

      {activeTab === 'markets' && (
        <div>
          {/* 新規問い追加 */}
          <div style={{ background: '#f0f9ff', padding: '20px', borderRadius: '12px', marginBottom: '30px', border: '1px solid #bae6fd' }}>
            <h3 style={{ marginTop: 0 }}>🆕 新しい問いを追加</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <input placeholder="タイトル" value={newTitle} onChange={e => setNewTitle(e.target.value)} style={{ padding: '10px' }} />
              <textarea placeholder="判定基準・詳細説明" value={newDescription} onChange={e => setNewDescription(e.target.value)} style={{ padding: '10px', height: '80px' }} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={{ flex: 1, padding: '10px' }}>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                <input type="datetime-local" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} style={{ flex: 1, padding: '10px' }} />
              </div>
              <input placeholder="選択肢 (カンマ区切り)" value={newOptions} onChange={e => setNewOptions(e.target.value)} style={{ padding: '10px' }} />
              <input placeholder="画像URL" value={newImage} onChange={e => setNewImage(e.target.value)} style={{ padding: '10px' }} />
              <button onClick={handleCreateMarket} style={{ padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>問いを公開する</button>
            </div>
          </div>

          {/* 既存リスト */}
          {markets.map(m => (
            <div key={m.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '10px', marginBottom: '15px', background: 'white' }}>
              {editingMarketId === m.id ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  <input value={editMarketForm.title} onChange={e => setEditMarketForm({...editMarketForm, title: e.target.value})} />
                  <textarea value={editMarketForm.description} onChange={e => setEditMarketForm({...editMarketForm, description: e.target.value})} style={{height:'80px'}} />
                  <div style={{display:'flex', gap:'10px'}}>
                    <button onClick={saveMarketEdit} style={{ background: '#22c55e', color: 'white', flex:1, padding:'10px' }}>保存</button>
                    <button onClick={() => setEditingMarketId(null)} style={{flex:1}}>キャンセル</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div><strong>{m.title}</strong><div style={{fontSize:'12px', color:'#666'}}>{m.category}</div></div>
                  <button onClick={() => startEditMarket(m)}>編集</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'users' && (
        <div>
          {users.map(u => (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #eee' }}>
              <span>{u.username || '名無し'} ({u.point_balance}pt)</span>
              <button onClick={async () => {
                await supabase.from('profiles').update({ is_hidden_from_ranking: !u.is_hidden_from_ranking }).eq('id', u.id)
                fetchUsers()
              }}>{u.is_hidden_from_ranking ? 'ランクに表示' : 'ランクから削除'}</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
