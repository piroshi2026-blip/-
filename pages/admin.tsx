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

  // 編集用ステート
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<any>({ title: '', description: '', category: '', end_date: '', options: [] })

  useEffect(() => {
    if (localStorage.getItem('isAdmin') === 'true') setIsAdmin(true)
  }, [])

  useEffect(() => { if (isAdmin) fetchAll() }, [isAdmin])

  async function fetchAll() {
    const { data: m } = await supabase.from('markets').select('*, market_options(*)').order('created_at', { ascending: false })
    const { data: c } = await supabase.from('categories').select('*').order('display_order', { ascending: true })
    const { data: u } = await supabase.from('profiles').select('*').order('point_balance', { ascending: false })
    if (m) setMarkets(m)
    if (c) setCategories(c)
    if (u) setUsers(u)
  }

  // --- マーケット全項目編集の保存 ---
  const handleSaveMarket = async () => {
    try {
      // 1. マーケット本体の更新
      const { error: mError } = await supabase.from('markets').update({
        title: editForm.title,
        description: editForm.description,
        category: editForm.category,
        end_date: new Date(editForm.end_date).toISOString(),
        image_url: editForm.image_url
      }).eq('id', editingId)
      if (mError) throw mError

      // 2. 選択肢の更新（個別ループ）
      for (const opt of editForm.options) {
        await supabase.from('market_options').update({ name: opt.name }).eq('id', opt.id)
      }

      alert('すべての項目を更新しました');
      setEditingId(null);
      fetchAll();
    } catch (e: any) { alert(e.message) }
  }

  // --- ユーザーポイント（ランキング）編集 ---
  const handleUpdateUserPoint = async (userId: string, newPoints: number) => {
    const { error } = await supabase.from('profiles').update({ point_balance: newPoints }).eq('id', userId)
    if (!error) { alert('ポイントを更新しました'); fetchAll(); }
  }

  if (!isAdmin) return (
    <div style={{ padding: '50px', textAlign: 'center' }}>
      <input type="password" onChange={e => setPassword(e.target.value)} placeholder="Password" />
      <button onClick={() => { if(password==='admin1234'){setIsAdmin(true); localStorage.setItem('isAdmin','true')} }}>Login</button>
    </div>
  )

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>🛠 YOSOL 管理パネル</h1>
      <nav style={{ marginBottom: '20px', display: 'flex', gap: '10px' }}>
        <button onClick={() => setActiveTab('markets')}>問い編集</button>
        <button onClick={() => setActiveTab('categories')}>カテゴリ</button>
        <button onClick={() => setActiveTab('users')}>ランキング・ユーザー</button>
      </nav>

      {activeTab === 'markets' && (
        <div>
          {markets.map(m => (
            <div key={m.id} style={{ border: '1px solid #ccc', padding: '15px', marginBottom: '10px', borderRadius: '8px', background: 'white' }}>
              {editingId === m.id ? (
                <div style={{ display: 'grid', gap: '10px' }}>
                  <label>質問タイトル:</label>
                  <input value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} />

                  <label>判定基準 (説明文):</label>
                  <textarea value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} style={{ height: '100px' }} />

                  <div style={{ display: 'flex', gap: '10px' }}>
                    <div style={{ flex: 1 }}>
                      <label>カテゴリ:</label><br/>
                      <select value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value})} style={{ width: '100%' }}>
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <label>締切日時:</label><br/>
                      <input type="datetime-local" value={editForm.end_date} onChange={e => setEditForm({...editForm, end_date: e.target.value})} style={{ width: '100%' }} />
                    </div>
                  </div>

                  <label>選択肢の名称:</label>
                  {editForm.options.map((opt: any, i: number) => (
                    <input key={opt.id} value={opt.name} onChange={e => {
                      const newOpts = [...editForm.options];
                      newOpts[i].name = e.target.value;
                      setEditForm({...editForm, options: newOpts});
                    }} placeholder={`選択肢 ${i+1}`} />
                  ))}

                  <div style={{ marginTop: '10px', display: 'flex', gap: '10px' }}>
                    <button onClick={handleSaveMarket} style={{ background: '#22c55e', color: 'white', padding: '10px 20px', border: 'none', borderRadius: '5px' }}>変更をすべて保存</button>
                    <button onClick={() => setEditingId(null)} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '5px' }}>キャンセル</button>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>{m.title}</strong>
                    <div style={{ fontSize: '11px', color: '#666' }}>終了: {new Date(m.end_date).toLocaleString()} | カテゴリ: {m.category}</div>
                  </div>
                  <button onClick={() => {
                    setEditingId(m.id);
                    setEditForm({
                      ...m,
                      end_date: new Date(m.end_date).toISOString().slice(0, 16),
                      options: m.market_options.sort((a:any, b:any)=>a.id - b.id)
                    });
                  }}>編集する</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {activeTab === 'users' && (
        <div style={{ background: 'white', padding: '20px', borderRadius: '10px' }}>
          <h3>🏆 ランキング編集 (ユーザーポイント管理)</h3>
          {users.map(u => (
            <div key={u.id} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px', borderBottom: '1px solid #eee', alignItems: 'center' }}>
              <div>
                <strong>{u.username || '名無し'}</strong><br/>
                <span style={{fontSize:'12px', color:'#666'}}>{u.id}</span>
              </div>
              <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                <input type="number" defaultValue={u.point_balance} onBlur={(e) => handleUpdateUserPoint(u.id, Number(e.target.value))} style={{ width: '100px', padding: '5px' }} />
                <span>pt</span>
                <button onClick={() => {
                  const p = prompt('新しいポイントを入力:', u.point_balance);
                  if(p) handleUpdateUserPoint(u.id, Number(p));
                }}>変更</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* カテゴリ管理タブは以前のロジックを維持 */}
    </div>
  )
}
