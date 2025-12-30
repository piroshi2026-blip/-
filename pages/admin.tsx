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

  const [editingMarketId, setEditingMarketId] = useState<number | null>(null)
  const [editMarketForm, setEditMarketForm] = useState<any>({})
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editUserForm, setEditUserForm] = useState({ username: '', point_balance: 0 })

  useEffect(() => {
    if (localStorage.getItem('isAdmin') === 'true') setIsAdmin(true)
    fetchCategories()
  }, [])

  useEffect(() => {
    if (isAdmin) {
      fetchMarkets(); fetchUsers(); fetchCategories();
    }
  }, [isAdmin])

  // --- データ取得 ---
  async function fetchMarkets() {
    const { data } = await supabase.from('markets').select('*, market_options(*)').order('created_at', { ascending: false })
    if (data) setMarkets(data)
  }

  async function fetchUsers() {
    const { data } = await supabase.from('profiles').select('*').order('point_balance', { ascending: false })
    if (data) setUsers(data)
  }

  async function fetchCategories() {
    const { data } = await supabase.from('categories').select('*').order('display_order', { ascending: true })
    if (data) setCategories(data)
  }

  const handleLogin = () => {
    if (password === 'admin1234') {
      setIsAdmin(true)
      localStorage.setItem('isAdmin', 'true')
    } else alert('パスワードが違います')
  }

  // --- マーケット編集・保存 (全項目) ---
  const startEditMarket = (m: any) => {
    setEditingMarketId(m.id)
    setEditMarketForm({
      title: m.title,
      description: m.description,
      category: m.category,
      image_url: m.image_url,
      end_date: new Date(m.end_date).toISOString().slice(0, 16),
      options: m.market_options.sort((a: any, b: any) => a.id - b.id)
    })
  }

  const saveMarketEdit = async () => {
    try {
      await supabase.from('markets').update({
        title: editMarketForm.title,
        description: editMarketForm.description,
        category: editMarketForm.category,
        image_url: editMarketForm.image_url,
        end_date: new Date(editMarketForm.end_date).toISOString()
      }).eq('id', editingMarketId)

      for (const opt of editMarketForm.options) {
        await supabase.from('market_options').update({ name: opt.name }).eq('id', opt.id)
      }
      alert('変更を保存しました'); setEditingMarketId(null); fetchMarkets();
    } catch (e: any) { alert(e.message) }
  }

  // --- カテゴリー順序入れ替え ---
  const moveCategory = async (id: number, direction: 'up' | 'down') => {
    const idx = categories.findIndex(c => c.id === id)
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === categories.length - 1)) return
    const newCats = [...categories];
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    const [moved] = newCats.splice(idx, 1);
    newCats.splice(targetIdx, 0, moved);
    for (let i = 0; i < newCats.length; i++) {
      await supabase.from('categories').update({ display_order: i }).eq('id', newCats[i].id)
    }
    fetchCategories()
  }

  // --- ユーザー管理 (ランキング編集含む) ---
  const toggleRankingVisibility = async (user: any) => {
    const { error } = await supabase.from('profiles').update({ is_hidden_from_ranking: !user.is_hidden_from_ranking }).eq('id', user.id)
    if (!error) fetchUsers()
  }

  if (!isAdmin) return (
    <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h2>🔐 管理者ログイン</h2>
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{padding:'10px'}} />
      <button onClick={handleLogin} style={{padding:'10px 20px', marginLeft:'10px'}}>入室</button>
    </div>
  )

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif', paddingBottom: '100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1>⚙️ YOSOL 管理パネル</h1>
        <button onClick={() => {setIsAdmin(false); localStorage.removeItem('isAdmin')}}>ログアウト</button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '10px', overflowX: 'auto' }}>
        {['markets', 'users', 'categories', 'settings'].map((t: any) => (
          <button key={t} onClick={() => setActiveTab(t)} style={{ padding: '10px 20px', border: 'none', borderRadius: '20px', background: activeTab === t ? '#2563eb' : '#eee', color: activeTab === t ? 'white' : 'black', fontWeight: 'bold' }}>
            {t === 'markets' ? 'マーケット' : t === 'users' ? 'ユーザー' : t === 'categories' ? 'カテゴリー' : '𝕏設定'}
          </button>
        ))}
      </div>

      {activeTab === 'markets' && (
        <div>
          {markets.map(m => (
            <div key={m.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '10px', marginBottom: '15px', background: m.is_resolved ? '#f9fafb' : 'white' }}>
              {editingMarketId === m.id ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  <label>タイトル / 判断基準</label>
                  <input value={editMarketForm.title} onChange={e => setEditMarketForm({...editMarketForm, title: e.target.value})} style={{padding:'8px'}} />
                  <textarea value={editMarketForm.description} onChange={e => setEditMarketForm({...editMarketForm, description: e.target.value})} style={{height:'100px', padding:'8px'}} />
                  <div style={{display:'flex', gap:'10px'}}>
                    <select value={editMarketForm.category} onChange={e => setEditMarketForm({...editMarketForm, category: e.target.value})} style={{flex:1, padding:'8px'}}>
                      {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <input type="datetime-local" value={editMarketForm.end_date} onChange={e => setEditMarketForm({...editMarketForm, end_date: e.target.value})} style={{flex:1, padding:'8px'}} />
                  </div>
                  <label>選択肢名</label>
                  {editMarketForm.options.map((opt: any, i: number) => (
                    <input key={opt.id} value={opt.name} onChange={e => {
                      const newOpts = [...editMarketForm.options];
                      newOpts[i].name = e.target.value;
                      setEditMarketForm({...editMarketForm, options: newOpts});
                    }} style={{padding:'8px'}} />
                  ))}
                  <div style={{ display: 'flex', gap: '10px', marginTop: '10px' }}>
                    <button onClick={saveMarketEdit} style={{ background: '#22c55e', color: 'white', flex: 1, padding: '12px', border: 'none', borderRadius: '8px' }}>保存</button>
                    <button onClick={() => setEditingMarketId(null)} style={{ background: '#999', color: 'white', flex: 1, border: 'none', borderRadius: '8px' }}>キャンセル</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{fontSize:'12px', color:'#666'}}>{m.category}</div>
                    <strong>{m.title}</strong>
                  </div>
                  <button onClick={() => startEditMarket(m)} style={{padding:'8px 16px', background:'#e0f2fe', color:'#0369a1', border:'none', borderRadius:'5px'}}>編集</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'users' && (
        <div>
          <h3>👥 ユーザー管理 (ランキング編集)</h3>
          {users.map(u => (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '12px', borderBottom: '1px solid #eee', alignItems: 'center', background: 'white' }}>
              <div>
                <div style={{ fontWeight: 'bold' }}>{u.username || '名無し'} {u.is_hidden_from_ranking ? ' (👻 非表示)' : ''}</div>
                <div style={{ fontSize: '13px', color: '#2563eb' }}>{u.point_balance.toLocaleString()} pt</div>
              </div>
              <button onClick={() => toggleRankingVisibility(u)} style={{ fontSize: '12px', padding: '6px 12px', background: u.is_hidden_from_ranking ? '#eee' : '#fee2e2', color: u.is_hidden_from_ranking ? '#333' : '#dc2626', border: 'none', borderRadius: '4px' }}>
                {u.is_hidden_from_ranking ? 'ランクに表示' : 'ランクから削除'}
              </button>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'categories' && (
        <div>
          <h3>🏷️ カテゴリーの順序設定</h3>
          {categories.map((c, i) => (
            <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', border: '1px solid #eee', marginBottom: '8px', borderRadius: '8px', background: 'white' }}>
              <span>{c.icon} {c.name}</span>
              <div style={{ display: 'flex', gap: '5px' }}>
                <button onClick={() => moveCategory(c.id, 'up')} disabled={i === 0}>↑</button>
                <button onClick={() => moveCategory(c.id, 'down')} disabled={i === categories.length - 1}>↓</button>
                <button onClick={async () => {if(confirm('削除しますか？')) await supabase.from('categories').delete().eq('id', c.id); fetchCategories()}} style={{color: 'red'}}>削除</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: '50px', textAlign: 'center' }}>
        <button onClick={() => window.location.href = '/'} style={{ padding: '10px 30px', borderRadius: '30px', border: '1px solid #ccc', background: 'white', fontWeight: 'bold' }}>🏠 アプリに戻る</button>
      </div>
    </div>
  )
}
