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

  // 新規追加用のステート
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

  // 市場（問い）の操作
  async function handleCreateMarket() {
    const optArray = newMarket.options.split(',').map(s => s.trim())
    const { data, error } = await supabase.rpc('create_market_with_options', {
      title_input: newMarket.title,
      category_input: newMarket.category,
      end_date_input: newMarket.end_date,
      description_input: newMarket.description,
      image_url_input: newMarket.image_url,
      options_input: optArray
    })
    if (!error) { alert('作成成功'); fetchData(); } else alert(error.message)
  }

  async function handleResolve(marketId: number, optionId: number) {
    if(!confirm('この選択肢で結果を確定させ、払い戻しを実行しますか？')) return
    const { error } = await supabase.rpc('resolve_market', { market_id_input: marketId, winning_option_id: optionId })
    if (!error) { alert('確定成功'); fetchData(); } else alert(error.message)
  }

  async function handleDeleteMarket(id: number) {
    if(!confirm('本当に削除しますか？')) return
    await supabase.from('markets').delete().eq('id', id)
    fetchData()
  }

  // カテゴリーの操作
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
    if(!confirm('カテゴリーを削除しますか？')) return
    await supabase.from('categories').delete().eq('id', id)
    fetchData()
  }

  // ユーザーの操作（ランキング非表示）
  async function toggleUserVisibility(id: string, isHidden: boolean) {
    await supabase.from('profiles').update({ is_hidden_from_ranking: isHidden }).eq('id', id)
    fetchData()
  }

  if (isLoading) return <div style={{padding: '20px'}}>読み込み中...</div>

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1>🛠 YOSOL 管理画面</h1>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        <button onClick={() => setActiveTab('markets')} style={{ flex: 1, padding: '10px', background: activeTab === 'markets' ? '#2563eb' : '#eee', color: activeTab === 'markets' ? 'white' : 'black' }}>問い管理</button>
        <button onClick={() => setActiveTab('categories')} style={{ flex: 1, padding: '10px', background: activeTab === 'categories' ? '#2563eb' : '#eee', color: activeTab === 'categories' ? 'white' : 'black' }}>カテゴリー管理</button>
        <button onClick={() => setActiveTab('users')} style={{ flex: 1, padding: '10px', background: activeTab === 'users' ? '#2563eb' : '#eee', color: activeTab === 'users' ? 'white' : 'black' }}>ユーザー管理</button>
      </div>

      {activeTab === 'markets' && (
        <>
          <section style={{ background: '#f9fafb', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
            <h3>🆕 新しい問いを作成</h3>
            <div style={{ display: 'grid', gap: '10px' }}>
              <input placeholder="タイトル" onChange={e => setNewMarket({...newMarket, title: e.target.value})} style={inpStyle} />
              <select onChange={e => setNewMarket({...newMarket, category: e.target.value})} style={inpStyle}>
                <option value="">カテゴリーを選択</option>
                {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <input type="datetime-local" onChange={e => setNewMarket({...newMarket, end_date: e.target.value})} style={inpStyle} />
              <textarea placeholder="判定基準（詳細説明）" onChange={e => setNewMarket({...newMarket, description: e.target.value})} style={inpStyle} />
              <input placeholder="画像URL" onChange={e => setNewMarket({...newMarket, image_url: e.target.value})} style={inpStyle} />
              <input placeholder="選択肢 (カンマ区切り: はい, いいえ)" onChange={e => setNewMarket({...newMarket, options: e.target.value})} style={inpStyle} />
              <button onClick={handleCreateMarket} style={{ background: '#2563eb', color: 'white', padding: '10px', border: 'none', borderRadius: '4px' }}>作成実行</button>
            </div>
          </section>

          <h3>📋 既存の問い一覧</h3>
          {markets.map(m => (
            <div key={m.id} style={{ border: '1px solid #ddd', padding: '15px', borderRadius: '8px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <strong>{m.title} [{m.category}]</strong>
                <button onClick={() => handleDeleteMarket(m.id)} style={{ color: 'red', border: 'none', background: 'none' }}>削除</button>
              </div>
              <div style={{ fontSize: '12px', color: '#666', margin: '5px 0' }}>締切: {new Date(m.end_date).toLocaleString()}</div>

              <div style={{ marginTop: '10px' }}>
                {m.is_resolved ? (
                  <span style={{ color: 'green', fontWeight: 'bold' }}>✅ 確定済み (ID: {m.result_option_id})</span>
                ) : (
                  <div>
                    <p style={{ fontSize: '12px', fontWeight: 'bold' }}>👇 結果を選んで確定（払い戻し実行）</p>
                    <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                      {m.market_options.map((opt: any) => (
                        <button key={opt.id} onClick={() => handleResolve(m.id, opt.id)} style={{ padding: '5px 10px', fontSize: '11px', background: '#f3f4f6', border: '1px solid #ccc', borderRadius: '4px' }}>
                          「{opt.name}」で確定
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </>
      )}

      {activeTab === 'categories' && (
        <>
          <section style={{ background: '#f9fafb', padding: '20px', borderRadius: '8px', marginBottom: '30px' }}>
            <h3>🆕 新カテゴリー作成</h3>
            <div style={{ display: 'flex', gap: '10px' }}>
              <input placeholder="名前 (例: 経済)" value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})} style={inpStyle} />
              <input placeholder="アイコン (例: 💰)" value={newCategory.icon} onChange={e => setNewCategory({...newCategory, icon: e.target.value})} style={{...inpStyle, width: '80px'}} />
              <input type="number" placeholder="順序" value={newCategory.display_order} onChange={e => setNewCategory({...newCategory, display_order: Number(e.target.value)})} style={{...inpStyle, width: '60px'}} />
              <button onClick={handleCreateCategory} style={{ background: '#059669', color: 'white', border: 'none', padding: '0 20px', borderRadius: '4px' }}>追加</button>
            </div>
          </section>

          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '2px solid #eee' }}>
                <th style={{ padding: '10px' }}>順序</th>
                <th>名前</th>
                <th>アイコン</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {categories.map(c => (
                <tr key={c.id} style={{ borderBottom: '1px solid #eee' }}>
                  <td style={{ padding: '10px' }}><input type="number" defaultValue={c.display_order} onBlur={e => handleUpdateCategory(c.id, { display_order: Number(e.target.value) })} style={{ width: '50px' }} /></td>
                  <td><input defaultValue={c.name} onBlur={e => handleUpdateCategory(c.id, { name: e.target.value })} style={{ border: 'none', background: 'none' }} /></td>
                  <td><input defaultValue={c.icon} onBlur={e => handleUpdateCategory(c.id, { icon: e.target.value })} style={{ border: 'none', background: 'none', width: '40px' }} /></td>
                  <td><button onClick={() => handleDeleteCategory(c.id)} style={{ color: 'red', border: 'none', background: 'none' }}>削除</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {activeTab === 'users' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', borderBottom: '2px solid #eee' }}>
              <th style={{ padding: '10px' }}>ユーザー</th>
              <th>ポイント</th>
              <th>ランキング表示</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{ padding: '10px' }}>{u.username}</td>
                <td>{u.point_balance.toLocaleString()}</td>
                <td>{u.is_hidden_from_ranking ? '❌ 非表示' : '✅ 表示中'}</td>
                <td>
                  <button onClick={() => toggleUserVisibility(u.id, !u.is_hidden_from_ranking)} style={{ background: u.is_hidden_from_ranking ? '#22c55e' : '#f59e0b', color: 'white', border: 'none', padding: '5px 10px', borderRadius: '4px', cursor: 'pointer' }}>
                    {u.is_hidden_from_ranking ? 'ランキングに戻す' : 'ランキングから隠す'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

const inpStyle = { padding: '10px', border: '1px solid #ddd', borderRadius: '4px' }
