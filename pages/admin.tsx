import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function Admin() {
  const ADMIN_PASSWORD = 'yosoru_admin' 
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [passInput, setPassInput] = useState('')

  const [activeTab, setActiveTab] = useState<'markets' | 'categories' | 'users' | 'config'>('markets')
  const [marketSortBy, setMarketSortBy] = useState<'deadline' | 'category' | 'popular'>('deadline')
  const [markets, setMarkets] = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [users, setUsers] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [siteConfig, setSiteConfig] = useState<any>({ 
    id: 1, site_title: '', site_description: '', admin_message: '', show_ranking: true, share_text_base: '' 
  })

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState<any>({})
  const [newOptionName, setNewOptionName] = useState('')
  const [uploading, setUploading] = useState(false)
  const [newMarket, setNewMarket] = useState({ title: '', category: '', end_date: '', description: '', image_url: '', options: '' })
  const [newCategory, setNewCategory] = useState({ name: '', icon: '', display_order: 0 })

  useEffect(() => {
    const authStatus = localStorage.getItem('yosoru_admin_auth')
    if (authStatus === 'true') setIsAuthenticated(true)
  }, [])

  const handleLogin = () => {
    if (passInput === ADMIN_PASSWORD) {
      setIsAuthenticated(true)
      localStorage.setItem('yosoru_admin_auth', 'true')
    } else { alert('パスワードが違います') }
  }

  const handleLogout = () => {
    setIsAuthenticated(false)
    localStorage.removeItem('yosoru_admin_auth')
    window.location.href = '/'
  }

  const fetchData = useCallback(async () => {
    if (!isAuthenticated) return
    setIsLoading(true)
    let mQuery = supabase.from('markets').select('*, market_options(*)')
    if (marketSortBy === 'deadline') mQuery = mQuery.order('end_date', { ascending: true })
    else if (marketSortBy === 'category') mQuery = mQuery.order('category', { ascending: true })
    else if (marketSortBy === 'popular') mQuery = mQuery.order('total_pool', { ascending: false })

    const [m, c, u, cfg] = await Promise.all([
      mQuery,
      supabase.from('categories').select('*').order('display_order', { ascending: true }),
      supabase.from('profiles').select('*').order('point_balance', { ascending: false }),
      supabase.from('site_config').select('*').single()
    ])
    if (m.data) setMarkets(m.data)
    if (c.data) setCategories(c.data)
    if (u.data) setUsers(u.data)
    if (cfg.data) setSiteConfig(cfg.data)
    setIsLoading(false)
  }, [marketSortBy, isAuthenticated])

  useEffect(() => { fetchData() }, [fetchData])

  // --- 【重要修正】決定ボタン（配当確定）の実行関数 ---
  async function handleResolve(marketId: number, optionId: number, optionName: string) {
    if(!confirm(`「${optionName}」の結果で確定させますか？\n的中者に配当が分配されます。この操作は取り消せません。`)) return;

    const { error } = await supabase.rpc('resolve_market', { 
      market_id_input: marketId, 
      winning_option_id: optionId 
    });

    if (error) {
      alert('確定エラー: ' + error.message);
    } else {
      alert('配当を確定しました！');
      fetchData();
    }
  }

  // --- 【維持】削除ロジック ---
  async function handleDeleteMarket(id: number, title: string) {
    if (!confirm(`「${title}」を完全に削除しますか？\nすでに投票されているデータも含めてすべて強制削除します。この操作は戻せません。`)) return
    await supabase.from('bets').delete().eq('market_id', id)
    await supabase.from('market_options').delete().eq('market_id', id)
    const { error } = await supabase.from('markets').delete().eq('id', id)
    if (error) alert('削除失敗: ' + error.message); else fetchData();
  }

  // --- 【維持】その他の全機能 ---
  async function handleUpdateConfig() { await supabase.from('site_config').update(siteConfig).eq('id', siteConfig.id); alert('保存完了'); }
  async function handleUpdateCategory(id: number, updates: any) { await supabase.from('categories').update(updates).eq('id', id); fetchData(); }
  async function handleAddCategory() { if (!newCategory.name) return; await supabase.from('categories').insert([newCategory]); setNewCategory({ name: '', icon: '', display_order: 0 }); fetchData(); }
  async function uploadImage(e: any, isEdit: boolean) {
    setUploading(true); const file = e.target.files[0]; const fileName = `${Math.random()}.${file.name.split('.').pop()}`;
    const { error } = await supabase.storage.from('market-images').upload(fileName, file);
    if (!error) {
      const { data: { publicUrl } } = supabase.storage.from('market-images').getPublicUrl(fileName);
      if (isEdit) setEditForm({ ...editForm, image_url: publicUrl }); else setNewMarket({ ...newMarket, image_url: publicUrl });
    }
    setUploading(false);
  }
  async function handleCreateMarket() {
    const optArray = newMarket.options.split(',').map(s => s.trim());
    const { error } = await supabase.rpc('create_market_with_options', { title_input: newMarket.title, category_input: newMarket.category, end_date_input: new Date(newMarket.end_date).toISOString(), description_input: newMarket.description, image_url_input: newMarket.image_url, options_input: optArray });
    if (!error) { alert('作成完了'); fetchData(); }
  }
  async function handleUpdateMarket() {
    await supabase.from('markets').update({ title: editForm.title, description: editForm.description, category: editForm.category, end_date: new Date(editForm.end_date).toISOString(), image_url: editForm.image_url }).eq('id', editingId);
    for (const opt of editForm.market_options) { await supabase.from('market_options').update({ name: opt.name }).eq('id', opt.id) }
    if (newOptionName.trim()) { await supabase.from('market_options').insert([{ market_id: editingId, name: newOptionName.trim(), pool: 0 }]); setNewOptionName(''); }
    setEditingId(null); fetchData(); alert('更新完了');
  }

  const s: any = {
    inp: { padding: '10px', border: '1px solid #ddd', borderRadius: '8px', width: '100%', boxSizing: 'border-box', marginBottom: '10px', fontSize:'14px' },
    btn: { background: '#1f2937', color: 'white', padding: '12px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
    tab: (active: boolean) => ({ flex: 1, padding: '14px', background: active ? '#1f2937' : '#eee', color: active ? 'white' : '#666', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize:'13px' }),
    sortBtn: (active: boolean) => ({ padding: '6px 12px', borderRadius: '20px', border: active ? 'none' : '1px solid #ddd', background: active ? '#3b82f6' : '#fff', color: active ? 'fff' : '#666', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' })
  }

  if (!isAuthenticated) {
    return (
      <div style={{ maxWidth: '400px', margin: '100px auto', padding: '30px', textAlign: 'center', fontFamily: 'sans-serif', background:'#fff', borderRadius:'20px', boxShadow:'0 10px 25px rgba(0,0,0,0.1)' }}>
        <h2 style={{fontWeight:'900', marginBottom:'20px'}}>Admin Login</h2>
        <input type="password" placeholder="パスワード" value={passInput} onChange={e => setPassInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} style={s.inp} />
        <button onClick={handleLogin} style={{ ...s.btn, width: '100%', background: '#3b82f6' }}>ログイン</button>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h1 style={{fontWeight:'900'}}>🛠 管理パネル</h1>
        <div style={{ display: 'flex', gap: '10px' }}>
          <Link href="/"><button style={{...s.btn, background: '#3b82f6', padding:'8px 15px'}}>🏠 アプリへ</button></Link>
          <button onClick={handleLogout} style={{...s.btn, background: '#ef4444', padding:'8px 15px'}}>🚪 ログアウト</button>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '2px', marginBottom: '20px', borderRadius:'10px', overflow:'hidden' }}>
        <button onClick={() => setActiveTab('markets')} style={s.tab(activeTab === 'markets')}>問い管理</button>
        <button onClick={() => setActiveTab('categories')} style={s.tab(activeTab === 'categories')}>カテゴリ</button>
        <button onClick={() => setActiveTab('users')} style={s.tab(activeTab === 'users')}>ユーザー</button>
        <button onClick={() => setActiveTab('config')} style={s.tab(activeTab === 'config')}>サイト設定</button>
      </div>

      {activeTab === 'markets' && (
        <>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '20px', alignItems: 'center' }}>
            <span style={{fontSize:'13px', fontWeight:'bold'}}>並び替え:</span>
            {['deadline', 'category', 'popular'].map(t => <button key={t} onClick={() => setMarketSortBy(t as any)} style={{padding:'6px 12px', borderRadius:'20px', border:marketSortBy===t?'none':'1px solid #ddd', background:marketSortBy===t?'#3b82f6':'#fff', color:marketSortBy===t?'#fff':'#666', fontSize:'12px', fontWeight:'bold'}}>{t==='deadline'?'⏰締切順':t==='category'?'📁カテゴリ順':'🔥人気順'}</button>)}
          </div>

          <section style={{ background: '#f4f4f4', padding: '20px', borderRadius: '12px', marginBottom: '30px' }}>
            <h3>🆕 新規問い作成</h3>
            <input placeholder="タイトル" value={newMarket.title} onChange={e => setNewMarket({...newMarket, title: e.target.value})} style={s.inp} />
            <textarea placeholder="判定基準の詳細" value={newMarket.description} onChange={e => setNewMarket({...newMarket, description: e.target.value})} style={{...s.inp, height:'60px'}} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <select value={newMarket.category} onChange={e => setNewMarket({...newMarket, category: e.target.value})} style={s.inp}>
                <option value="">カテゴリを選択</option>{categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <input type="datetime-local" onChange={e => setNewMarket({...newMarket, end_date: e.target.value})} style={s.inp} />
            </div>
            <div style={{marginBottom:'15px'}}><label style={{fontSize:'12px', display:'block'}}>画像アップロード</label><input type="file" onChange={e => uploadImage(e, false)} /></div>
            <input placeholder="選択肢 (カンマ区切り)" value={newMarket.options} onChange={e => setNewMarket({...newMarket, options: e.target.value})} style={s.inp} />
            <button onClick={handleCreateMarket} style={{ ...s.btn, width: '100%', background: '#3b82f6' }}>問いを公開する</button>
          </section>

          {markets.map(m => (
            <div key={m.id} style={{ border: '1px solid #eee', padding: '20px', marginBottom: '15px', borderRadius: '12px', background:'#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <div>
                  <strong style={{fontSize:'18px'}}>{m.title}</strong>
                  <div style={{fontSize:'12px', color:'#666', marginTop:'5px'}}>{m.category} | ⏰ 締切: {new Date(m.end_date).toLocaleString()} | 🔥 {m.total_pool}pt</div>
                </div>
                <div style={{ display:'flex', gap:'8px' }}>
                  <button onClick={() => { setEditingId(m.id); setEditForm({...m, end_date: new Date(m.end_date).toISOString().slice(0,16)}); }} style={{...s.btn, background:'#3b82f6', padding:'8px 15px'}}>編集</button>
                  <button onClick={() => handleDeleteMarket(m.id, m.title)} style={{...s.btn, background:'#ef4444', padding:'8px 15px'}}>削除</button>
                </div>
              </div>

              {editingId === m.id && (
                <div style={{ marginTop: '20px', padding: '20px', background: '#f9fafb', borderRadius: '12px', border:'1px solid #e2e8f0' }}>
                  <input value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} style={s.inp} />
                  <textarea value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} style={{...s.inp, height:'60px'}} />
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <select value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value})} style={s.inp}>
                      {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                    </select>
                    <input type="datetime-local" value={editForm.end_date} onChange={e => setEditForm({...editForm, end_date: e.target.value})} style={s.inp} />
                  </div>
                  <div style={{marginBottom:'15px'}}><label style={{fontSize:'12px'}}>画像変更</label><br/><input type="file" onChange={e => uploadImage(e, true)} /></div>
                  <div style={{background:'#fff', padding:'15px', borderRadius:'8px', border:'1px solid #ddd'}}>
                    <div style={{fontSize:'13px', fontWeight:'bold', marginBottom:'10px'}}>選択肢の編集・追加</div>
                    {editForm.market_options.map((opt: any, idx: number) => (
                      <input key={opt.id} value={opt.name} onChange={e => { const newOpts = [...editForm.market_options]; newOpts[idx].name = e.target.value; setEditForm({ ...editForm, market_options: newOpts }) }} style={s.inp} />
                    ))}
                    <input placeholder="+ 新しい選択肢を追加" value={newOptionName} onChange={e => setNewOptionName(e.target.value)} style={{ ...s.inp, border: '1px solid #3b82f6', marginBottom:0 }} />
                  </div>
                  <button onClick={handleUpdateMarket} style={{...s.btn, width:'100%', background:'#10b981', marginTop:'15px'}}>変更を保存</button>
                </div>
              )}

              {/* 復活：配当確定（決定ボタン）エリア */}
              {!m.is_resolved && (
                <div style={{marginTop:'15px', borderTop:'1px dashed #ddd', paddingTop:'15px'}}>
                  <div style={{fontSize:'12px', color:'#ef4444', fontWeight:'bold', marginBottom:'8px'}}>配当確定（このボタンで配当を分配）</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    {m.market_options.map((opt: any) => (
                      <button 
                        key={opt.id} 
                        onClick={() => handleResolve(m.id, opt.id, opt.name)} 
                        style={{fontSize:'11px', padding:'6px 12px', borderRadius:'6px', border:'1px solid #ef4444', color:'#ef4444', background:'#fff', fontWeight:'bold'}}
                      >
                        「{opt.name}」で確定
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {/* 設定、ユーザー、カテゴリ管理のセクションも完璧に維持 */}
      {activeTab === 'categories' && (
        <section style={{ background: '#fff', padding: '20px', borderRadius: '12px', border:'1px solid #eee' }}>
          <h3 style={{marginTop:0}}>📁 カテゴリ管理</h3>
          {categories.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input type="number" defaultValue={c.display_order} onBlur={e => handleUpdateCategory(c.id, { display_order: Number(e.target.value) })} style={{ width: '60px', padding:'8px', border:'1px solid #ddd', borderRadius:'6px' }} />
              <input defaultValue={c.name} onBlur={e => handleUpdateCategory(c.id, { name: e.target.value })} style={{...s.inp, marginBottom:0}} />
              <button onClick={() => supabase.from('categories').delete().eq('id', c.id).then(()=>fetchData())} style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer', padding:'0 10px'}}>✕</button>
            </div>
          ))}
          <div style={{marginTop:'20px', borderTop:'1px solid #eee', paddingTop:'20px'}}>
            <input placeholder="新しいカテゴリ名" value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})} style={s.inp} />
            <button onClick={handleAddCategory} style={{...s.btn, width:'100%'}}>カテゴリ追加</button>
          </div>
        </section>
      )}

      {activeTab === 'users' && (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
          <thead><tr style={{ background: '#eee', textAlign:'left' }}><th style={{padding:'12px'}}>ユーザー</th><th>ポイント</th><th>ランキング</th><th>操作</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{padding:'12px'}}>{u.username || '匿名'}</td>
                <td><input type="number" defaultValue={u.point_balance} onBlur={e => supabase.from('profiles').update({ point_balance: Number(e.target.value) }).eq('id', u.id).then(()=>fetchData())} style={{ width: '90px', padding:'5px' }} /></td>
                <td><button onClick={() => supabase.from('profiles').update({ is_hidden_from_ranking: !u.is_hidden_from_ranking }).eq('id', u.id).then(()=>fetchData())} style={{padding:'4px 8px', borderRadius:'4px', border:'none', background:u.is_hidden_from_ranking?'#94a3b8':'#10b981', color:'#fff', fontSize:'11px'}}>{u.is_hidden_from_ranking ? '隠し中' : '表示中'}</button></td>
                <td><button onClick={() => { if(confirm('削除しますか？')) supabase.from('profiles').delete().eq('id', u.id).then(()=>fetchData()) }} style={{ color: '#ef4444', border:'none', background:'none', cursor:'pointer' }}>削除</button></td>
              </tr>
            </tbody>
        </table>
      )}

      {activeTab === 'config' && (
        <section style={{ background: '#f8fafc', padding: '24px', borderRadius: '16px', border:'1px solid #e2e8f0' }}>
          <h3>📢 サイト基本情報</h3>
          <input value={siteConfig.site_title} onChange={e => setSiteConfig({...siteConfig, site_title: e.target.value})} placeholder="タイトル" style={s.inp} />
          <input value={siteConfig.site_description} onChange={e => setSiteConfig({...siteConfig, site_description: e.target.value})} placeholder="説明" style={s.inp} />
          <textarea value={siteConfig.admin_message} onChange={e => setSiteConfig({...siteConfig, admin_message: e.target.value})} placeholder="メッセージ" style={{...s.inp, height:'80px'}} />
          <textarea value={siteConfig.share_text_base} onChange={e => setSiteConfig({...siteConfig, share_text_base: e.target.value})} placeholder="𝕏投稿文" style={{...s.inp, height:'80px'}} />
          <button onClick={handleUpdateConfig} style={{...s.btn, background: '#10b981', width:'100%'}}>設定を保存</button>
        </section>
      )}
    </div>
  )
}
