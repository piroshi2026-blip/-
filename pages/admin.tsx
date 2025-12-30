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

  // 𝕏投稿設定
  const [xTextTemplate, setXTextTemplate] = useState('💰予測市場「YOSOL」に参加中！\n\nQ. {title}\n\nあなたも予想しよう！ #YOSOL')

  // 新規作成用
  const [newTitle, setNewTitle] = useState('')
  const [newImage, setNewImage] = useState('')
  const [newOptions, setNewOptions] = useState('') 
  const [newEndDate, setNewEndDate] = useState('')
  const [newCategory, setNewCategory] = useState('')
  const [newDescription, setNewDescription] = useState('')

  // 編集用ステート
  const [editingMarketId, setEditingMarketId] = useState<number | null>(null)
  const [editMarketForm, setEditMarketForm] = useState<any>({})
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [editUserForm, setEditUserForm] = useState({ username: '', point_balance: 0 })

  useEffect(() => {
    if (localStorage.getItem('isAdmin') === 'true') setIsAdmin(true)
    const savedX = localStorage.getItem('x_template')
    if (savedX) setXTextTemplate(savedX)
  }, [])

  useEffect(() => {
    if (isAdmin) {
      fetchMarkets()
      fetchUsers()
      fetchCategories()
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
    if (data) {
      setCategories(data)
      if (!newCategory && data.length > 0) setNewCategory(data[0].name)
    }
  }

  // --- 認証 ---
  const handleLogin = () => {
    if (password === 'admin1234') {
      setIsAdmin(true)
      localStorage.setItem('isAdmin', 'true')
    } else alert('パスワードが違います')
  }

  // --- 画像アップロード ---
  const handleImageUpload = async (event: any, target: 'new' | 'edit') => {
    try {
      setUploading(true)
      const file = event.target.files[0]
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random()}.${fileExt}`
      const { error: uploadError } = await supabase.storage.from('market-images').upload(fileName, file)
      if (uploadError) throw uploadError
      const { data } = supabase.storage.from('market-images').getPublicUrl(fileName)
      if (target === 'new') setNewImage(data.publicUrl)
      else setEditMarketForm({ ...editMarketForm, image_url: data.publicUrl })
    } catch (e: any) { alert(e.message) } finally { setUploading(false) }
  }

  // --- マーケット編集・保存 (選択肢含む) ---
  const startEditMarket = (m: any) => {
    setEditingMarketId(m.id)
    setEditMarketForm({
      title: m.title, image_url: m.image_url, category: m.category,
      description: m.description, end_date: new Date(m.end_date).toISOString().slice(0, 16),
      options: m.market_options.sort((a: any, b: any) => a.id - b.id)
    })
  }

  const saveMarketEdit = async () => {
    // 1. 基本情報の更新
    const { error: mError } = await supabase.from('markets').update({
      title: editMarketForm.title, image_url: editMarketForm.image_url,
      category: editMarketForm.category, description: editMarketForm.description,
      end_date: new Date(editMarketForm.end_date).toISOString()
    }).eq('id', editingMarketId)

    // 2. 選択肢名の更新
    for (const opt of editMarketForm.options) {
      await supabase.from('market_options').update({ name: opt.name }).eq('id', opt.id)
    }

    if (!mError) { alert('保存しました'); setEditingMarketId(null); fetchMarkets() }
  }

  // --- カテゴリー順序変更 ---
  const moveCategory = async (id: number, direction: 'up' | 'down') => {
    const index = categories.findIndex(c => c.id === id)
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === categories.length - 1)) return

    const newCats = [...categories]
    const targetIndex = direction === 'up' ? index - 1 : index + 1
    const [movedItem] = newCats.splice(index, 1)
    newCats.splice(targetIndex, 0, movedItem)

    // DB一括更新
    for (let i = 0; i < newCats.length; i++) {
      await supabase.from('categories').update({ display_order: i }).eq('id', newCats[i].id)
    }
    fetchCategories()
  }

  if (!isAdmin) return (
    <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h2>🔐 管理者ログイン</h2>
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ padding: '10px' }} />
      <button onClick={handleLogin} style={{ padding: '10px 20px', marginLeft: '10px' }}>入室</button>
    </div>
  )

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif', paddingBottom: '100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>⚙️ YOSOL 管理パネル</h1>
        <button onClick={() => {localStorage.removeItem('isAdmin'); setIsAdmin(false)}} style={{ background: '#eee', border: 'none', padding: '5px 15px', borderRadius: '5px' }}>ログアウト</button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '10px', overflowX: 'auto' }}>
        {['markets', 'users', 'categories', 'settings'].map((t: any) => (
          <button key={t} onClick={() => setActiveTab(t)} style={{ padding: '10px 20px', border: 'none', borderRadius: '20px', background: activeTab === t ? '#2563eb' : '#eee', color: activeTab === t ? 'white' : 'black', whiteSpace: 'nowrap' }}>
            {t === 'markets' ? 'マーケット' : t === 'users' ? 'ユーザー' : t === 'categories' ? 'カテゴリー' : '𝕏設定'}
          </button>
        ))}
      </div>

      {activeTab === 'markets' && (
        <div>
          {/* 新規作成 */}
          <div style={{ background: '#f0f9ff', padding: '20px', borderRadius: '12px', marginBottom: '30px' }}>
            <h3 style={{ marginTop: 0 }}>🆕 新規質問</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <input placeholder="タイトル" value={newTitle} onChange={e => setNewTitle(e.target.value)} style={{ padding: '10px' }} />
              <textarea placeholder="詳細" value={newDescription} onChange={e => setNewDescription(e.target.value)} style={{ padding: '10px' }} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={{ flex: 1, padding: '10px' }}>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
                </select>
                <input type="datetime-local" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} style={{ flex: 1, padding: '10px' }} />
              </div>
              <input placeholder="選択肢 (カンマ区切り)" value={newOptions} onChange={e => setNewOptions(e.target.value)} style={{ padding: '10px' }} />
              <button onClick={async () => {
                const { data } = await supabase.from('markets').insert({ title: newTitle, description: newDescription, category: newCategory, end_date: new Date(newEndDate).toISOString(), image_url: newImage || 'https://placehold.co/600x400' }).select().single()
                const opts = newOptions.split(',').map(s => ({ market_id: data.id, name: s.trim(), pool: 0 }))
                await supabase.from('market_options').insert(opts)
                fetchMarkets()
              }} style={{ padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px' }}>公開</button>
            </div>
          </div>

          {/* マーケット一覧 */}
          {markets.map(m => (
            <div key={m.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '10px', marginBottom: '15px' }}>
              {editingMarketId === m.id ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  <input value={editMarketForm.title} onChange={e => setEditMarketForm({...editMarketForm, title: e.target.value})} style={{padding:'8px'}} />
                  {/* 選択肢の編集エリア */}
                  <div style={{background:'#eee', padding:'10px', borderRadius:'5px'}}>
                    <div style={{fontSize:'12px', marginBottom:'5px', fontWeight:'bold'}}>選択肢名の編集:</div>
                    {editMarketForm.options.map((opt: any, i: number) => (
                      <input key={opt.id} value={opt.name} onChange={e => {
                        const newOpts = [...editMarketForm.options];
                        newOpts[i].name = e.target.value;
                        setEditMarketForm({...editMarketForm, options: newOpts});
                      }} style={{padding:'5px', marginBottom:'5px', width:'90%'}} />
                    ))}
                  </div>
                  <div style={{display:'flex', gap:'10px'}}>
                    <button onClick={saveMarketEdit} style={{background:'#22c55e', color:'white', border:'none', padding:'8px 15px', borderRadius:'5px'}}>保存</button>
                    <button onClick={() => setEditingMarketId(null)} style={{background:'#999', color:'white', border:'none', padding:'8px 15px', borderRadius:'5px'}}>中止</button>
                  </div>
                </div>
              ) : (
                <div style={{display:'flex', justifyContent:'space-between'}}>
                  <div>
                    <strong>{m.title}</strong>
                    <div style={{fontSize:'12px', color:'#666'}}>{m.category} | {m.market_options.map((o:any)=>o.name).join(' / ')}</div>
                  </div>
                  <button onClick={() => startEditMarket(m)}>編集</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'categories' && (
        <div>
          <h3>🏷️ カテゴリー順序設定</h3>
          <div style={{ display: 'grid', gap: '10px' }}>
            {categories.map((c, i) => (
              <div key={c.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px', border: '1px solid #eee', borderRadius: '8px' }}>
                <span>{c.icon} {c.name}</span>
                <div style={{ display: 'flex', gap: '5px' }}>
                  <button onClick={() => moveCategory(c.id, 'up')} disabled={i === 0}>↑</button>
                  <button onClick={() => moveCategory(c.id, 'down')} disabled={i === categories.length - 1}>↓</button>
                  <button onClick={async () => {if(confirm('削除？')) await supabase.from('categories').delete().eq('id',c.id); fetchCategories()}} style={{color:'red'}}>×</button>
                </div>
              </div>
            ))}
          </div>
          <div style={{marginTop:'20px', display:'flex', gap:'5px'}}>
            <input id="newCatIcon" placeholder="アイコン" style={{width:'50px'}} />
            <input id="newCatName" placeholder="名前" style={{flex:1}} />
            <button onClick={async () => {
              const name = (document.getElementById('newCatName') as HTMLInputElement).value;
              const icon = (document.getElementById('newCatIcon') as HTMLInputElement).value;
              await supabase.from('categories').insert({ name, icon, display_order: categories.length });
              fetchCategories();
            }}>追加</button>
          </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div>
          <h3>𝕏 (Twitter) 投稿テンプレート</h3>
          <p style={{fontSize:'12px', color:'#666'}}>`{`{title}`}` という文字を入れると、自動的に質問のタイトルに置き換わります。</p>
          <textarea 
            value={xTextTemplate} 
            onChange={e => setXTextTemplate(e.target.value)} 
            style={{ width: '100%', height: '150px', padding: '10px', borderRadius: '8px', border: '1px solid #ccc' }}
          />
          <button onClick={() => {
            localStorage.setItem('x_template', xTextTemplate);
            alert('保存しました！index.tsxのshareOnX関数内でこのlocalStorageを読み込むようにしてください。');
          }} style={{ marginTop: '10px', padding: '10px 20px', background: '#1da1f2', color: 'white', border: 'none', borderRadius: '8px' }}>
            設定を保存
          </button>
        </div>
      )}

      <div style={{ marginTop: '50px', textAlign: 'center' }}>
        <button onClick={() => window.location.href = '/'} style={{ padding: '10px 30px', borderRadius: '30px', border: '1px solid #ccc', background: 'white' }}>🏠 アプリに戻る</button>
      </div>
    </div>
  )
}
