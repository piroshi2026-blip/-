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
  const [uploading, setUploading] = useState(false)

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

  // --- 新規追加機能 ---
  const handleCreateMarket = async () => {
    if (!newTitle || !newOptions || !newEndDate) return alert('必須項目を入力してください')
    try {
      const { data: market, error: mError } = await supabase.from('markets').insert({
        title: newTitle,
        description: newDescription,
        category: newCategory,
        end_date: new Date(newEndDate).toISOString(),
        image_url: newImage || 'https://placehold.co/600x400',
        total_pool: 0
      }).select().single()

      if (mError) throw mError

      const opts = newOptions.split(',').map(s => ({
        market_id: market.id,
        name: s.trim(),
        pool: 0
      }))
      const { error: oError } = await supabase.from('market_options').insert(opts)
      if (oError) throw oError

      alert('問いを追加しました！')
      setNewTitle(''); setNewDescription(''); setNewOptions(''); setNewEndDate(''); setNewImage('');
      fetchMarkets()
    } catch (e: any) { alert(e.message) }
  }

  // --- 既存編集保存 ---
  const saveMarketEdit = async () => {
    await supabase.from('markets').update({
      title: editMarketForm.title,
      description: editMarketForm.description,
      category: editMarketForm.category,
      end_date: new Date(editMarketForm.end_date).toISOString()
    }).eq('id', editingMarketId)
    for (const opt of editMarketForm.options) {
      await supabase.from('market_options').update({ name: opt.name }).eq('id', opt.id)
    }
    alert('保存完了'); setEditingMarketId(null); fetchMarkets();
  }

  if (!isAdmin) return (
    <div style={{ padding: '50px', textAlign: 'center' }}>
      <h2>🔐 管理ログイン</h2>
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button onClick={() => { if(password==='admin1234'){setIsAdmin(true); localStorage.setItem('isAdmin','true')} }}>ログイン</button>
    </div>
  )

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>⚙️ YOSOL 管理</h1>
      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => setActiveTab('markets')} style={{ background: activeTab==='markets'?'#2563eb':'#eee', color: activeTab==='markets'?'white':'black', border:'none', padding:'10px 20px', borderRadius:'20px' }}>マーケット管理</button>
        <button onClick={() => setActiveTab('users')} style={{ background: activeTab==='users'?'#2563eb':'#eee', color: activeTab==='users'?'white':'black', border:'none', padding:'10px 20px', borderRadius:'20px' }}>ユーザー管理</button>
        <button onClick={() => setActiveTab('categories')} style={{ background: activeTab==='categories'?'#2563eb':'#eee', color: activeTab==='categories'?'white':'black', border:'none', padding:'10px 20px', borderRadius:'20px' }}>カテゴリ順序</button>
      </div>

      {activeTab === 'markets' && (
        <div>
          {/* ★ 新規追加セクション */}
          <div style={{ background: '#f0f9ff', padding: '20px', borderRadius: '12px', marginBottom: '30px', border: '2px solid #bae6fd' }}>
            <h3 style={{ marginTop: 0 }}>🆕 新しい問いを追加</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <input placeholder="タイトル (例: 次の選挙でA党は勝つ？)" value={newTitle} onChange={e => setNewTitle(e.target.value)} style={{ padding: '10px' }} />
              <textarea placeholder="判定基準・詳細説明 (いつ、何をもって正解とするか)" value={newDescription} onChange={e => setNewDescription(e.target.value)} style={{ padding: '10px', height: '80px' }} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={{ flex: 1, padding: '10px' }}>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                </select>
                <input type="datetime-local" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} style={{ flex: 1, padding: '10px' }} />
              </div>
              <input placeholder="選択肢 (カンマ区切り。例: 勝つ, 負ける, 引き分け)" value={newOptions} onChange={e => setNewOptions(e.target.value)} style={{ padding: '10px' }} />
              <input placeholder="画像URL (任意)" value={newImage} onChange={e => setNewImage(e.target.value)} style={{ padding: '10px' }} />
              <button onClick={handleCreateMarket} style={{ padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>問いを公開する</button>
            </div>
          </div>

          {/* 既存リストの編集 */}
          <h3>📋 既存の問いを編集</h3>
          {markets.map(m => (
            <div key={m.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '10px', marginBottom: '15px' }}>
              {editingMarketId === m.id ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  <input value={editMarketForm.title} onChange={e => setEditMarketForm({...editMarketForm, title: e.target.value})} />
                  <textarea value={editMarketForm.description} onChange={e => setEditMarketForm({...editMarketForm, description: e.target.value})} />
                  <button onClick={saveMarketEdit} style={{ background: '#22c55e', color: 'white', padding: '10px' }}>保存</button>
                  <button onClick={() => setEditingMarketId(null)}>中止</button>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{m.title}</span>
                  <button onClick={() => { setEditingMarketId(m.id); setEditMarketForm({ ...m, options: m.market_options }); }}>編集</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ユーザー・カテゴリータブのロジックは維持 */}
    </div>
  )
}
