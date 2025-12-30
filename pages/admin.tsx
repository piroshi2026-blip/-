import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function Admin() {
  const [activeTab, setActiveTab] = useState<'markets' | 'users' | 'categories'>('markets')
  const [markets, setMarkets] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [isAdmin, setIsAdmin] = useState(false)
  const [password, setPassword] = useState('')

  // 新規マーケット用
  const [newTitle, setNewTitle] = useState('')
  const [newImage, setNewImage] = useState('')
  const [newOptions, setNewOptions] = useState('') 
  const [newEndDate, setNewEndDate] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newDescription, setNewDescription] = useState('')
  const [uploading, setUploading] = useState(false)

  // 編集用
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ title: '', image_url: '', end_date: '', category: '', description: '' })
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editUserForm, setEditUserForm] = useState({ username: '', point_balance: 0, is_hidden: false })

  // カテゴリ管理用
  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('🎲')

  useEffect(() => {
    if (localStorage.getItem('isAdmin') === 'true') setIsAdmin(true)
  }, [])

  useEffect(() => {
    if (isAdmin) {
        fetchMarkets()
        fetchUsers()
        fetchCategories()
    }
  }, [isAdmin])

  async function fetchMarkets() {
    const { data } = await supabase.from('markets').select('*, market_options(*)').order('created_at', { ascending: false })
    if (data) setMarkets(data)
  }

  async function fetchUsers() {
      const { data } = await supabase.from('profiles').select('*').order('point_balance', { ascending: false })
      if (data) setUsers(data)
  }

  async function fetchCategories() {
      const { data } = await supabase.from('categories').select('*').order('id', { ascending: true })
      if (data) {
          setCategories(data)
          if (data.length > 0) setNewCategory(data[0].name)
      }
  }

  const handleLogin = () => { if (password === 'admin1234') { setIsAdmin(true); localStorage.setItem('isAdmin', 'true') } else alert('違うよ') }

  // カテゴリ操作
  const addCategory = async () => {
      await supabase.from('categories').insert({ name: newCatName, icon: newCatIcon })
      setNewCatName(''); fetchCategories()
  }
  const deleteCategory = async (id: number) => {
      if(confirm('削除しますか？')) { await supabase.from('categories').delete().eq('id', id); fetchCategories() }
  }

  // ユーザー操作（ランキング非表示）
  const toggleRankingVisibility = async (user: any) => {
      const { error } = await supabase.from('profiles').update({ is_hidden_from_ranking: !user.is_hidden_from_ranking }).eq('id', user.id)
      if (!error) fetchUsers()
  }

  // マーケット作成
  const createMarket = async () => {
    const { data: mData } = await supabase.from('markets').insert({ 
        title: newTitle, image_url: newImage || 'https://placehold.co/600x400',
        end_date: new Date(newEndDate).toISOString(), category: newCategory, description: newDescription
    }).select().single()
    const opts = newOptions.split(',').map(s => ({ market_id: mData.id, name: s.trim(), pool: 0 }))
    await supabase.from('market_options').insert(opts)
    alert('公開！'); fetchMarkets()
  }

  const resolve = async (mId: number, oId: number) => {
    if (!confirm('確定？')) return
    await supabase.rpc('resolve_market_multi', { market_id_input: mId, winning_option_id_input: oId })
    fetchMarkets()
  }

  if (!isAdmin) return (
    <div style={{ padding: '50px', textAlign: 'center' }}>
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button onClick={handleLogin}>Login</button>
    </div>
  )

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>⚙️ YOSOL 管理パネル</h1>

      <div style={{display:'flex', gap:'10px', marginBottom:'20px', borderBottom:'2px solid #eee', paddingBottom:'10px'}}>
        <button onClick={()=>setActiveTab('markets')} style={{padding:'10px', background: activeTab==='markets'?'#3b82f6':'#eee', color: activeTab==='markets'?'white':'#000', border:'none', borderRadius:'5px'}}>マーケット管理</button>
        <button onClick={()=>setActiveTab('users')} style={{padding:'10px', background: activeTab==='users'?'#3b82f6':'#eee', color: activeTab==='users'?'white':'#000', border:'none', borderRadius:'5px'}}>ユーザー管理</button>
        <button onClick={()=>setActiveTab('categories')} style={{padding:'10px', background: activeTab==='categories'?'#3b82f6':'#eee', color: activeTab==='categories'?'white':'#000', border:'none', borderRadius:'5px'}}>カテゴリ管理</button>
      </div>

      {activeTab === 'markets' && (
        <div>
          <div style={{background:'#f9fafb', padding:'20px', borderRadius:'10px', marginBottom:'20px'}}>
            <h3>📝 新規作成</h3>
            <input placeholder="タイトル" value={newTitle} onChange={e=>setNewTitle(e.target.value)} style={{display:'block', width:'100%', marginBottom:'10px'}} />
            <select value={newCategory} onChange={e=>setNewCategory(e.target.value)} style={{marginBottom:'10px', width:'100%'}}>
                {categories.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
            </select>
            <input type="datetime-local" value={newEndDate} onChange={e=>setNewEndDate(e.target.value)} style={{display:'block', width:'100%', marginBottom:'10px'}} />
            <input placeholder="選択肢 (A, B, C)" value={newOptions} onChange={e=>setNewOptions(e.target.value)} style={{display:'block', width:'100%', marginBottom:'10px'}} />
            <button onClick={createMarket} style={{width:'100%', padding:'10px', background:'#22c55e', color:'white', border:'none', borderRadius:'5px'}}>公開する</button>
          </div>

          {markets.map(m => (
            <div key={m.id} style={{border:'1px solid #ddd', padding:'15px', borderRadius:'10px', marginBottom:'10px'}}>
               <div style={{display:'flex', justifyContent:'space-between'}}>
                 <strong>{m.title}</strong>
                 <span>{m.category}</span>
               </div>
               <div style={{marginTop:'10px', display:'flex', gap:'5px'}}>
                 {m.market_options.map((o:any) => (
                   <button key={o.id} onClick={()=>resolve(m.id, o.id)} disabled={m.is_resolved} style={{padding:'5px', fontSize:'12px', background: m.result_option_id === o.id ? 'green' : 'white', color: m.result_option_id === o.id ? 'white' : 'black'}}>
                     {o.name}
                   </button>
                 ))}
               </div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'users' && (
        <div>
          <h3>👥 ユーザー管理</h3>
          <table style={{width:'100%', borderCollapse:'collapse'}}>
            <thead><tr style={{borderBottom:'2px solid #eee'}}><th>名前</th><th>pt</th><th>ランキング表示</th><th>操作</th></tr></thead>
            <tbody>
              {users.map(u => (
                <tr key={u.id} style={{borderBottom:'1px solid #eee'}}>
                  <td style={{padding:'10px'}}>{u.username || '名無し'}</td>
                  <td>{u.point_balance}</td>
                  <td>{u.is_hidden_from_ranking ? '❌ 非表示' : '✅ 表示'}</td>
                  <td>
                    <button onClick={()=>toggleRankingVisibility(u)} style={{fontSize:'12px'}}>
                        {u.is_hidden_from_ranking ? '表示する' : '非表示にする'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {activeTab === 'categories' && (
        <div>
          <h3>🏷️ カテゴリ管理</h3>
          <div style={{marginBottom:'20px', display:'flex', gap:'10px'}}>
            <input placeholder="アイコン (絵文字)" value={newCatIcon} onChange={e=>setNewCatIcon(e.target.value)} style={{width:'50px'}} />
            <input placeholder="カテゴリ名" value={newCatName} onChange={e=>setNewCatName(e.target.value)} />
            <button onClick={addCategory}>追加</button>
          </div>
          <div style={{display:'flex', flexWrap:'wrap', gap:'10px'}}>
            {categories.map(c => (
              <div key={c.id} style={{padding:'10px', border:'1px solid #ccc', borderRadius:'8px', display:'flex', gap:'10px'}}>
                <span>{c.icon} {c.name}</span>
                <button onClick={()=>deleteCategory(c.id)} style={{background:'none', border:'none', color:'red', cursor:'pointer'}}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
