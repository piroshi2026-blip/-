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
  const [uploading, setUploading] = useState(false)

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

  // カテゴリ追加用
  const [newCatName, setNewCatName] = useState('')
  const [newCatIcon, setNewCatIcon] = useState('🎲')

  useEffect(() => {
    if (localStorage.getItem('isAdmin') === 'true') setIsAdmin(true)
    fetchCategories()
  }, [])

  useEffect(() => {
    if (isAdmin) {
      fetchMarkets()
      fetchUsers()
      fetchCategories()
    }
  }, [isAdmin])

  // --- データ取得系 ---
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
      if (!newCategory && data.length > 0) setNewCategory(data[0].name)
    }
  }

  // --- 認証系 ---
  const handleLogin = () => {
    if (password === 'admin1234') {
      setIsAdmin(true)
      localStorage.setItem('isAdmin', 'true')
    } else alert('パスワードが違います')
  }
  const handleLogout = () => {
    setIsAdmin(false)
    localStorage.removeItem('isAdmin')
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

  // --- マーケット操作 ---
  const createMarket = async () => {
    if (!newTitle || !newOptions || !newEndDate) return alert('入力不足です')
    const { data: mData, error } = await supabase.from('markets').insert({ 
      title: newTitle, image_url: newImage || 'https://placehold.co/600x400',
      end_date: new Date(newEndDate).toISOString(), category: newCategory, description: newDescription
    }).select().single()
    if (error) return alert(error.message)
    const opts = newOptions.split(',').map(s => ({ market_id: mData.id, name: s.trim(), pool: 0 }))
    await supabase.from('market_options').insert(opts)
    alert('公開しました！'); resetNewForm(); fetchMarkets()
  }

  const resetNewForm = () => {
    setNewTitle(''); setNewImage(''); setNewOptions(''); setNewDescription(''); setNewEndDate('')
  }

  const startEditMarket = (m: any) => {
    setEditingMarketId(m.id)
    setEditMarketForm({
      title: m.title, image_url: m.image_url, category: m.category,
      description: m.description, end_date: new Date(m.end_date).toISOString().slice(0, 16)
    })
  }

  const saveMarketEdit = async () => {
    const { error } = await supabase.from('markets').update({
      title: editMarketForm.title, image_url: editMarketForm.image_url,
      category: editMarketForm.category, description: editMarketForm.description,
      end_date: new Date(editMarketForm.end_date).toISOString()
    }).eq('id', editingMarketId)
    if (!error) { alert('更新しました'); setEditingMarketId(null); fetchMarkets() }
  }

  const deleteMarket = async (id: number) => {
    if (!confirm('関連する投票データもすべて消えますが、本当に削除しますか？')) return
    await supabase.from('bets').delete().eq('market_id', id)
    await supabase.from('market_options').delete().eq('market_id', id)
    await supabase.from('markets').delete().eq('id', id)
    fetchMarkets()
  }

  const resolve = async (mId: number, oId: number, name: string) => {
    if (!confirm(`「${name}」を正解として確定し、配当を配りますか？`)) return
    const { error } = await supabase.rpc('resolve_market_multi', { market_id_input: mId, winning_option_id_input: oId })
    if (error) alert(error.message); else { alert('確定しました！'); fetchMarkets() }
  }

  // --- カテゴリ操作 ---
  const addCategory = async () => {
    if (!newCatName) return
    await supabase.from('categories').insert({ name: newCatName, icon: newCatIcon })
    setNewCatName(''); fetchCategories()
  }
  const deleteCategory = async (id: number) => {
    if (confirm('削除しますか？')) { await supabase.from('categories').delete().eq('id', id); fetchCategories() }
  }

  // --- ユーザー操作 ---
  const toggleRankingVisibility = async (user: any) => {
    await supabase.from('profiles').update({ is_hidden_from_ranking: !user.is_hidden_from_ranking }).eq('id', user.id)
    fetchUsers()
  }
  const startEditUser = (u: any) => {
    setEditingUserId(u.id)
    setEditUserForm({ username: u.username || '', point_balance: u.point_balance })
  }
  const saveUserEdit = async () => {
    await supabase.from('profiles').update(editUserForm).eq('id', editingUserId)
    setEditingUserId(null); fetchUsers()
  }

  if (!isAdmin) return (
    <div style={{ padding: '50px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h2>🔐 管理者ログイン</h2>
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} style={{ padding: '10px' }} />
      <button onClick={handleLogin} style={{ padding: '10px 20px', marginLeft: '10px' }}>入室</button>
      <div style={{ marginTop: '20px' }}><button onClick={() => window.location.href = '/'} style={{ background: 'none', border: 'none', color: '#666', textDecoration: 'underline', cursor: 'pointer' }}>アプリに戻る</button></div>
    </div>
  )

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif', paddingBottom: '100px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>⚙️ YOSOL 管理画面</h1>
        <button onClick={handleLogout} style={{ background: '#eee', border: 'none', padding: '5px 15px', borderRadius: '5px' }}>ログアウト</button>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>
        <button onClick={() => setActiveTab('markets')} style={{ padding: '10px 20px', border: 'none', borderRadius: '20px', background: activeTab === 'markets' ? '#2563eb' : '#eee', color: activeTab === 'markets' ? 'white' : 'black' }}>マーケット</button>
        <button onClick={() => setActiveTab('users')} style={{ padding: '10px 20px', border: 'none', borderRadius: '20px', background: activeTab === 'users' ? '#2563eb' : '#eee', color: activeTab === 'users' ? 'white' : 'black' }}>ユーザー</button>
        <button onClick={() => setActiveTab('categories')} style={{ padding: '10px 20px', border: 'none', borderRadius: '20px', background: activeTab === 'categories' ? '#2563eb' : '#eee', color: activeTab === 'categories' ? 'white' : 'black' }}>カテゴリ</button>
      </div>

      {activeTab === 'markets' && (
        <div>
          {/* 新規作成 */}
          <div style={{ background: '#f0f9ff', padding: '20px', borderRadius: '12px', marginBottom: '30px' }}>
            <h3 style={{ marginTop: 0 }}>🆕 新規質問を作成</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <input placeholder="タイトル" value={newTitle} onChange={e => setNewTitle(e.target.value)} style={{ padding: '10px' }} />
              <textarea placeholder="詳細・判定基準" value={newDescription} onChange={e => setNewDescription(e.target.value)} style={{ padding: '10px', height: '60px' }} />
              <div style={{ display: 'flex', gap: '10px' }}>
                <select value={newCategory} onChange={e => setNewCategory(e.target.value)} style={{ flex: 1, padding: '10px' }}>
                  {categories.map(c => <option key={c.id} value={c.name}>{c.icon} {c.name}</option>)}
                </select>
                <input type="datetime-local" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} style={{ flex: 1, padding: '10px' }} />
              </div>
              <input placeholder="選択肢 (カンマ区切り。例: はい, いいえ, その他)" value={newOptions} onChange={e => setNewOptions(e.target.value)} style={{ padding: '10px' }} />
              <div style={{ fontSize: '12px' }}>画像アップロード: <input type="file" onChange={e => handleImageUpload(e, 'new')} /></div>
              <button onClick={createMarket} disabled={uploading} style={{ padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>公開する</button>
            </div>
          </div>

          {/* マーケット一覧 */}
          <h3>📊 公開中のマーケット</h3>
          {markets.map(m => (
            <div key={m.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '10px', marginBottom: '15px', background: m.is_resolved ? '#f9fafb' : 'white' }}>
              {editingMarketId === m.id ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  <input value={editMarketForm.title} onChange={e => setEditMarketForm({ ...editMarketForm, title: e.target.value })} style={{ padding: '8px' }} />
                  <textarea value={editMarketForm.description} onChange={e => setEditMarketForm({ ...editMarketForm, description: e.target.value })} style={{ padding: '8px' }} />
                  <select value={editMarketForm.category} onChange={e => setEditMarketForm({ ...editMarketForm, category: e.target.value })} style={{ padding: '8px' }}>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                  <input type="datetime-local" value={editMarketForm.end_date} onChange={e => setEditMarketForm({ ...editMarketForm, end_date: e.target.value })} style={{ padding: '8px' }} />
                  <div>画像変更: <input type="file" onChange={e => handleImageUpload(e, 'edit')} /></div>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button onClick={saveMarketEdit} style={{ background: '#22c55e', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px' }}>保存</button>
                    <button onClick={() => setEditingMarketId(null)} style={{ background: '#999', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px' }}>キャンセル</button>
                  </div>
                </div>
              ) : (
                <>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <span style={{ fontSize: '10px', background: '#eee', padding: '2px 6px', borderRadius: '4px', marginRight: '5px' }}>{m.category}</span>
                      <strong style={{ fontSize: '18px' }}>{m.title}</strong>
                    </div>
                    <div>
                      <button onClick={() => startEditMarket(m)} style={{ marginRight: '5px', fontSize: '12px' }}>編集</button>
                      <button onClick={() => deleteMarket(m.id)} style={{ color: 'red', fontSize: '12px' }}>削除</button>
                    </div>
                  </div>
                  <div style={{ marginTop: '10px', display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                    {m.market_options.map((o: any) => (
                      <button key={o.id} onClick={() => resolve(m.id, o.id, o.name)} disabled={m.is_resolved} style={{ padding: '5px 10px', fontSize: '12px', background: m.result_option_id === o.id ? '#22c55e' : 'white', color: m.result_option_id === o.id ? 'white' : 'black', borderRadius: '15px', border: '1px solid #ccc' }}>
                        {o.name} {m.result_option_id === o.id ? '✅' : ''}
                      </button>
                    ))}
                  </div>
                  {m.is_resolved && <div style={{ color: '#22c55e', fontWeight: 'bold', fontSize: '12px', marginTop: '5px' }}>[確定済み]</div>}
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'users' && (
        <div>
          <h3>👥 ユーザー管理</h3>
          {users.map(u => (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #eee', alignItems: 'center' }}>
              {editingUserId === u.id ? (
                <div style={{ display: 'flex', gap: '5px' }}>
                  <input value={editUserForm.username} onChange={e => setEditUserForm({ ...editUserForm, username: e.target.value })} style={{ width: '100px' }} />
                  <input type="number" value={editUserForm.point_balance} onChange={e => setEditUserForm({ ...editUserForm, point_balance: Number(e.target.value) })} style={{ width: '80px' }} />
                  <button onClick={saveUserEdit} style={{ background: '#22c55e', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px' }}>保存</button>
                </div>
              ) : (
                <>
                  <div>
                    <div style={{ fontWeight: 'bold' }}>{u.username || '名無し'} {u.is_hidden_from_ranking ? ' (👻非表示中)' : ''}</div>
                    <div style={{ fontSize: '12px', color: '#2563eb' }}>{u.point_balance.toLocaleString()} pt</div>
                  </div>
                  <div style={{ display: 'flex', gap: '5px' }}>
                    <button onClick={() => startEditUser(u)} style={{ fontSize: '11px' }}>ポイント修正</button>
                    <button onClick={() => toggleRankingVisibility(u)} style={{ fontSize: '11px' }}>{u.is_hidden_from_ranking ? 'ランクに表示' : 'ランクから消す'}</button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'categories' && (
        <div>
          <h3>🏷️ カテゴリ管理</h3>
          <div style={{ marginBottom: '20px', display: 'flex', gap: '5px' }}>
            <input placeholder="アイコン" value={newCatIcon} onChange={e => setNewCatIcon(e.target.value)} style={{ width: '50px' }} />
            <input placeholder="カテゴリ名" value={newCatName} onChange={e => setNewCatName(e.target.value)} style={{ flex: 1 }} />
            <button onClick={addCategory} style={{ background: '#2563eb', color: 'white', border: 'none', padding: '8px 15px', borderRadius: '5px' }}>追加</button>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
            {categories.map(c => (
              <div key={c.id} style={{ padding: '8px 15px', border: '1px solid #ddd', borderRadius: '20px', display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span>{c.icon} {c.name}</span>
                <button onClick={() => deleteCategory(c.id)} style={{ background: 'none', border: 'none', color: '#ff4d4d', cursor: 'pointer', fontWeight: 'bold' }}>×</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ marginTop: '50px', textAlign: 'center', borderTop: '1px solid #eee', paddingTop: '20px' }}>
        <button onClick={() => window.location.href = '/'} style={{ padding: '10px 30px', borderRadius: '30px', border: '1px solid #ccc', background: 'white', cursor: 'pointer', fontWeight: 'bold' }}>🏠 アプリに戻る</button>
      </div>
    </div>
  )
}
