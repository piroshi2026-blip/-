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

  useEffect(() => {
    if (localStorage.getItem('isAdmin') === 'true') setIsAdmin(true)
    fetchCategories()
  }, [])

  useEffect(() => {
    if (isAdmin) {
      fetchMarkets(); fetchUsers(); fetchCategories();
    }
  }, [isAdmin])

  async function fetchMarkets() {
    const { data } = await supabase.from('markets').select('*, market_options(*)').order('created_at', { ascending: false })
    if (data) setMarkets(data)
  }

  async function fetchCategories() {
    const { data } = await supabase.from('categories').select('*').order('display_order', { ascending: true })
    if (data) setCategories(data)
  }

  async function fetchUsers() {
    const { data } = await supabase.from('profiles').select('*').order('point_balance', { ascending: false })
    if (data) setUsers(data)
  }

  // --- 編集開始 ---
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

  // --- 保存実行 ---
  const saveMarketEdit = async () => {
    try {
      // 1. マーケット本体の更新
      await supabase.from('markets').update({
        title: editMarketForm.title,
        description: editMarketForm.description,
        category: editMarketForm.category,
        image_url: editMarketForm.image_url,
        end_date: new Date(editMarketForm.end_date).toISOString()
      }).eq('id', editingMarketId)

      // 2. 選択肢の更新
      for (const opt of editMarketForm.options) {
        await supabase.from('market_options').update({ name: opt.name }).eq('id', opt.id)
      }

      alert('すべての変更を保存しました');
      setEditingMarketId(null);
      fetchMarkets();
    } catch (e: any) { alert(e.message) }
  }

  // --- カテゴリー順序入れ替え ---
  const moveCategory = async (id: number, direction: 'up' | 'down') => {
    const idx = categories.findIndex(c => c.id === id)
    if ((direction === 'up' && idx === 0) || (direction === 'down' && idx === categories.length - 1)) return

    const newCats = [...categories]
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1
    const [moved] = newCats.splice(idx, 1)
    newCats.splice(targetIdx, 0, moved)

    for (let i = 0; i < newCats.length; i++) {
      await supabase.from('categories').update({ display_order: i }).eq('id', newCats[i].id)
    }
    fetchCategories()
  }

  if (!isAdmin) return (
    <div style={{ padding: '50px', textAlign: 'center' }}>
      <h2>🔐 管理者ログイン</h2>
      <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
      <button onClick={() => { if(password==='admin1234'){setIsAdmin(true); localStorage.setItem('isAdmin','true')} }}>ログイン</button>
    </div>
  )

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{display:'flex', justifyContent:'space-between', borderBottom:'2px solid #eee', marginBottom:'20px'}}>
        <h1>⚙️ YOSOL 管理パネル</h1>
        <button onClick={() => {setIsAdmin(false); localStorage.removeItem('isAdmin')}}>ログアウト</button>
      </div>

      <div style={{display:'flex', gap:'10px', marginBottom:'20px'}}>
        {['markets', 'users', 'categories'].map(t => (
          <button key={t} onClick={() => setActiveTab(t as any)} style={{padding:'10px 20px', background:activeTab===t?'#2563eb':'#eee', color:activeTab===t?'white':'black', border:'none', borderRadius:'20px'}}>{t}</button>
        ))}
      </div>

      {activeTab === 'markets' && (
        <div>
          {markets.map(m => (
            <div key={m.id} style={{border:'1px solid #ddd', padding:'15px', borderRadius:'10px', marginBottom:'15px'}}>
              {editingMarketId === m.id ? (
                <div style={{display:'grid', gap:'10px'}}>
                  <label>タイトル</label>
                  <input value={editMarketForm.title} onChange={e => setEditMarketForm({...editMarketForm, title: e.target.value})} />

                  <label>判断基準（説明文）</label>
                  <textarea value={editMarketForm.description} onChange={e => setEditMarketForm({...editMarketForm, description: e.target.value})} style={{height:'80px'}} />

                  <div style={{display:'flex', gap:'10px'}}>
                    <div style={{flex:1}}>
                      <label>カテゴリー</label>
                      <select value={editMarketForm.category} onChange={e => setEditMarketForm({...editMarketForm, category: e.target.value})} style={{width:'100%'}}>
                        {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                      </select>
                    </div>
                    <div style={{flex:1}}>
                      <label>締切日時</label>
                      <input type="datetime-local" value={editMarketForm.end_date} onChange={e => setEditMarketForm({...editMarketForm, end_date: e.target.value})} style={{width:'100%'}} />
                    </div>
                  </div>

                  <label>選択肢の名称変更</label>
                  <div style={{background:'#f9fafb', padding:'10px', borderRadius:'5px'}}>
                    {editMarketForm.options.map((opt: any, i: number) => (
                      <input key={opt.id} value={opt.name} onChange={e => {
                        const newOpts = [...editMarketForm.options];
                        newOpts[i].name = e.target.value;
                        setEditMarketForm({...editMarketForm, options: newOpts});
                      }} style={{display:'block', marginBottom:'5px', width:'100%'}} />
                    ))}
                  </div>

                  <div style={{display:'flex', gap:'10px'}}>
                    <button onClick={saveMarketEdit} style={{background:'#22c55e', color:'white', flex:1, padding:'10px'}}>保存</button>
                    <button onClick={() => setEditingMarketId(null)} style={{background:'#999', color:'white', flex:1}}>キャンセル</button>
                  </div>
                </div>
              ) : (
                <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                  <div>
                    <div style={{fontSize:'12px', color:'#666'}}>{m.category}</div>
                    <strong style={{fontSize:'16px'}}>{m.title}</strong>
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
          <h3>🏷️ カテゴリー管理 (並び替え)</h3>
          {categories.map((c, i) => (
            <div key={c.id} style={{display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px', border:'1px solid #eee', marginBottom:'5px'}}>
              <span>{c.icon} {c.name}</span>
              <div>
                <button onClick={() => moveCategory(c.id, 'up')} disabled={i===0}>↑</button>
                <button onClick={() => moveCategory(c.id, 'down')} disabled={i===categories.length-1}>↓</button>
                <button onClick={async() => {if(confirm('削除？')) await supabase.from('categories').delete().eq('id',c.id); fetchCategories()}} style={{color:'red'}}>削除</button>
              </div>
            </div>
          ))}
          <div style={{marginTop:'20px', borderTop:'1px solid #eee', paddingTop:'20px'}}>
             <h4>新規追加</h4>
             <input id="newCatIcon" placeholder="絵文字" style={{width:'50px'}} />
             <input id="newCatName" placeholder="名名" />
             <button onClick={async() => {
               const name = (document.getElementById('newCatName') as HTMLInputElement).value;
               const icon = (document.getElementById('newCatIcon') as HTMLInputElement).value;
               await supabase.from('categories').insert({ name, icon, display_order: categories.length });
               fetchCategories();
             }}>追加</button>
          </div>
        </div>
      )}
    </div>
  )
}
