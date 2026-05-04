import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'

export default function Admin() {
  const ADMIN_PASSWORD = 'yosoru_admin' 
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [passInput, setPassInput] = useState('')
  const [activeTab, setActiveTab] = useState<'markets' | 'categories' | 'users' | 'config' | 'pdca'>('markets')
  const [markets, setMarkets] = useState<any[]>([])
  /** '' = すべて表示 */
  const [marketCategoryFilter, setMarketCategoryFilter] = useState<string>('')
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

  const [pdcaSlot, setPdcaSlot] = useState(0)
  const [pdcaPassword, setPdcaPassword] = useState('')
  const [pdcaRunning, setPdcaRunning] = useState(false)
  const [pdcaResult, setPdcaResult] = useState<unknown>(null)

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
    if (!isSupabaseConfigured || !isAuthenticated) return
    setIsLoading(true)
    const mQuery = supabase.from('markets').select('*, market_options(*)')

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
  }, [isAuthenticated])

  useEffect(() => { fetchData() }, [fetchData])

  const displayedMarkets = useMemo(() => {
    let list = markets
    if (marketCategoryFilter) {
      list = list.filter((m: any) => m.category === marketCategoryFilter)
    }
    return [...list].sort((a: any, b: any) => {
      if (Boolean(a.is_resolved) !== Boolean(b.is_resolved)) return a.is_resolved ? 1 : -1
      return new Date(a.end_date).getTime() - new Date(b.end_date).getTime()
    })
  }, [markets, marketCategoryFilter])

  async function handleResolve(marketId: number, optionId: number, optionName: string) {
    if(!confirm(`「${optionName}」の結果で確定させますか？`)) return;
    const { error } = await supabase.rpc('resolve_market', { market_id_input: marketId, winning_option_id: optionId });
    if (error) { alert('確定エラー: ' + error.message); } else { alert('確定しました'); fetchData(); }
  }

  // 削除時にエラーが出ないよう、関連データの削除を追加しておきました
  async function handleDeleteMarket(id: number, title: string) {
    if (!confirm(`「${title}」を完全に削除しますか？`)) return
    await supabase.from('bets').delete().eq('market_id', id)
    await supabase.from('market_options').delete().eq('market_id', id)
    const { error } = await supabase.from('markets').delete().eq('id', id)
    if (error) alert('削除失敗: ' + error.message); else fetchData();
  }

  async function handleRunPdca() {
    setPdcaRunning(true)
    setPdcaResult(null)
    try {
      const res = await fetch('/api/admin/run-pdca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: pdcaPassword, slot: pdcaSlot }),
      })
      const data = await res.json()
      setPdcaResult(data)
    } catch (e) {
      setPdcaResult({ error: e instanceof Error ? e.message : String(e) })
    }
    setPdcaRunning(false)
  }

  async function handleRunQuick() {
    setPdcaRunning(true)
    setPdcaResult(null)
    try {
      const res = await fetch('/api/admin/run-pdca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: pdcaPassword, mode: 'quick' }),
      })
      const data = await res.json()
      setPdcaResult(data)
    } catch (e) {
      setPdcaResult({ error: e instanceof Error ? e.message : String(e) })
    }
    setPdcaRunning(false)
  }

  async function handleRunHourly() {
    setPdcaRunning(true)
    setPdcaResult(null)
    try {
      const res = await fetch('/api/admin/run-pdca', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: pdcaPassword, mode: 'hourly' }),
      })
      const data = await res.json()
      setPdcaResult(data)
    } catch (e) {
      setPdcaResult({ error: e instanceof Error ? e.message : String(e) })
    }
    setPdcaRunning(false)
  }

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
    await supabase.from('markets').update({ 
      title: editForm.title, 
      description: editForm.description, 
      category: editForm.category, // ここでカテゴリーも更新されます
      end_date: new Date(editForm.end_date).toISOString(), 
      image_url: editForm.image_url 
    }).eq('id', editingId);

    for (const opt of editForm.market_options) { 
      await supabase.from('market_options').update({ name: opt.name }).eq('id', opt.id) 
    }
    if (newOptionName.trim()) { 
      await supabase.from('market_options').insert([{ market_id: editingId, name: newOptionName.trim(), pool: 0 }]); 
      setNewOptionName(''); 
    }
    setEditingId(null); fetchData(); alert('更新完了');
  }

  const s: any = {
    inp: { padding: '10px', border: '1px solid #ddd', borderRadius: '8px', width: '100%', boxSizing: 'border-box', marginBottom: '10px', fontSize:'14px' },
    btn: { background: '#1f2937', color: 'white', padding: '12px 20px', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 'bold' },
    tab: (active: boolean) => ({ flex: 1, padding: '14px', background: active ? '#1f2937' : '#eee', color: active ? 'white' : '#666', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize:'13px' }),
    sortBtn: (active: boolean) => ({ padding: '6px 12px', borderRadius: '20px', border: active ? 'none' : '1px solid #ddd', background: active ? '#3b82f6' : '#fff', color: active ? '#fff' : '#666', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer' })
  }

  if (!isSupabaseConfigured) {
    return (
      <div style={{ maxWidth: '500px', margin: '80px auto', padding: '40px 24px', fontFamily: 'sans-serif', background: '#f8fafc', borderRadius: '16px' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 900, marginBottom: '16px' }}>Supabase の設定が必要です</h1>
        <p style={{ color: '#475569', lineHeight: 1.6, marginBottom: '12px' }}>
          プロジェクトルートに <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>.env.local</code> を作成し、<code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>NEXT_PUBLIC_SUPABASE_URL</code> と{' '}
          <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>NEXT_PUBLIC_SUPABASE_ANON_KEY</code> を設定してください。設定後は開発サーバーを再起動してください。
        </p>
        <Link href="/" style={{ color: '#3b82f6', fontSize: '14px' }}>← アプリに戻る</Link>
      </div>
    )
  }

  if (!isAuthenticated) {
    return (
      <div style={{ maxWidth: '400px', margin: '100px auto', padding: '30px', textAlign: 'center', background:'#fff', borderRadius:'20px', boxShadow:'0 10px 25px rgba(0,0,0,0.1)' }}>
        <h2>Admin Login</h2>
        <input type="password" value={passInput} onChange={e => setPassInput(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleLogin()} style={s.inp} />
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
        <button onClick={() => setActiveTab('pdca')} style={s.tab(activeTab === 'pdca')}>🤖 PDCA</button>
      </div>

      {activeTab === 'markets' && (
        <>
          <div style={{ marginBottom: '20px' }}>
            <span style={{ fontSize: '13px', fontWeight: 'bold', display: 'block', marginBottom: '8px' }}>カテゴリで表示</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', alignItems: 'center' }}>
              <button
                type="button"
                onClick={() => setMarketCategoryFilter('')}
                style={s.sortBtn(marketCategoryFilter === '')}
              >
                すべて
              </button>
              {categories.map((c: any) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setMarketCategoryFilter(c.name)}
                  style={s.sortBtn(marketCategoryFilter === c.name)}
                >
                  {c.name}
                </button>
              ))}
            </div>
            <p style={{ fontSize: '11px', color: '#64748b', margin: '8px 0 0' }}>
              締切が近い順 · 確定済みは一覧の後ろに表示されます
            </p>
          </div>

          <section style={{ background: '#f4f4f4', padding: '20px', borderRadius: '12px', marginBottom: '30px' }}>
            <h3>🆕 新規問い作成</h3>
            <input placeholder="タイトル" value={newMarket.title} onChange={e => setNewMarket({...newMarket, title: e.target.value})} style={s.inp} />
            <textarea placeholder="判定基準" value={newMarket.description} onChange={e => setNewMarket({...newMarket, description: e.target.value})} style={{...s.inp, height:'60px'}} />
            <div style={{ display: 'flex', gap: '10px' }}>
              <select value={newMarket.category} onChange={e => setNewMarket({...newMarket, category: e.target.value})} style={s.inp}>
                <option value="">カテゴリを選択</option>{categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
              </select>
              <input type="datetime-local" onChange={e => setNewMarket({...newMarket, end_date: e.target.value})} style={s.inp} />
            </div>
            <input type="file" onChange={e => uploadImage(e, false)} style={{marginBottom:'10px'}} />
            <input placeholder="選択肢 (カンマ区切り)" value={newMarket.options} onChange={e => setNewMarket({...newMarket, options: e.target.value})} style={s.inp} />
            <button onClick={handleCreateMarket} style={{ ...s.btn, width: '100%', background: '#3b82f6' }}>公開</button>
          </section>

          {displayedMarkets.map(m => (
            <div key={m.id} style={{ border: '1px solid #eee', padding: '20px', marginBottom: '15px', borderRadius: '12px', background:'#fff' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div><strong>{m.title}</strong><div style={{fontSize:'12px', color:'#666'}}>{m.category} | {new Date(m.end_date).toLocaleString()}</div></div>
                <div style={{display:'flex', gap:'5px'}}>
                  <button onClick={() => { setEditingId(m.id); setEditForm({...m, end_date: new Date(m.end_date).toISOString().slice(0,16)}); }} style={{...s.btn, background:'#3b82f6', padding:'8px 15px'}}>編集</button>
                  <button onClick={() => handleDeleteMarket(m.id, m.title)} style={{...s.btn, background:'#ef4444', padding:'8px 15px'}}>削除</button>
                </div>
              </div>
              {editingId === m.id && (
                <div style={{ marginTop: '10px', padding: '15px', background: '#f9f9f9', borderRadius: '8px', border:'1px solid #ddd' }}>
                  <label style={{fontSize:'11px', color:'#666'}}>タイトル修正</label>
                  <input value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} style={s.inp} />

                  <label style={{fontSize:'11px', color:'#666'}}>判定基準修正</label>
                  <textarea value={editForm.description} onChange={e => setEditForm({...editForm, description: e.target.value})} style={{...s.inp, height:'60px'}} />

                  {/* ▼▼▼ 追加箇所：ここから ▼▼▼ */}
                  <label style={{fontSize:'11px', color:'#666'}}>カテゴリ修正</label>
                  <select value={editForm.category} onChange={e => setEditForm({...editForm, category: e.target.value})} style={s.inp}>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                  {/* ▲▲▲ 追加箇所：ここまで ▲▲▲ */}

                  <label style={{fontSize:'11px', color:'#666'}}>締切日時修正</label>
                  <input type="datetime-local" value={editForm.end_date} onChange={e => setEditForm({...editForm, end_date: e.target.value})} style={s.inp} />

                  <div style={{marginBottom:'10px'}}><label style={{fontSize:'12px'}}>画像変更</label><br/><input type="file" onChange={e => uploadImage(e, true)} /></div>

                  <label style={{fontSize:'11px', color:'#666'}}>選択肢名の修正</label>
                  {editForm.market_options.map((opt: any, idx: number) => (
                    <input key={opt.id} value={opt.name} onChange={e => { const newOpts = [...editForm.market_options]; newOpts[idx].name = e.target.value; setEditForm({ ...editForm, market_options: newOpts }) }} style={s.inp} />
                  ))}
                  <input placeholder="+ 選択肢追加" value={newOptionName} onChange={e => setNewOptionName(e.target.value)} style={{ ...s.inp, border: '1px solid #3b82f6' }} />

                  <button onClick={handleUpdateMarket} style={{...s.btn, width:'100%', background:'#10b981'}}>更新内容を保存</button>
                  <button onClick={() => setEditingId(null)} style={{...s.btn, width:'100%', background:'#9ca3af', marginTop:'10px'}}>キャンセル</button>
                </div>
              )}
              {!m.is_resolved && (
                <div style={{marginTop:'10px', display:'flex', flexWrap:'wrap', gap:'5px'}}>
                  {m.market_options.map((opt: any) => (
                    <button key={opt.id} onClick={() => handleResolve(m.id, opt.id, opt.name)} style={{fontSize:'11px', padding:'6px 12px', borderRadius:'6px', border:'1px solid #ef4444', color:'#ef4444', background:'#fff'}}>「{opt.name}」で確定</button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}

      {activeTab === 'categories' && (
        <section style={{ background: '#fff', padding: '20px', borderRadius: '12px' }}>
          {categories.map(c => (
            <div key={c.id} style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
              <input type="number" defaultValue={c.display_order} onBlur={e => handleUpdateCategory(c.id, { display_order: Number(e.target.value) })} style={{ width: '60px' }} />
              <input defaultValue={c.name} onBlur={e => handleUpdateCategory(c.id, { name: e.target.value })} style={s.inp} />
              <button onClick={() => supabase.from('categories').delete().eq('id', c.id).then(()=>fetchData())} style={{color:'red', border:'none', background:'none'}}>✕</button>
            </div>
          ))}
          <input placeholder="新規カテゴリ名" value={newCategory.name} onChange={e => setNewCategory({...newCategory, name: e.target.value})} style={s.inp} />
          <button onClick={handleAddCategory} style={{...s.btn, width:'100%'}}>追加</button>
        </section>
      )}

      {activeTab === 'users' && (
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#eee', textAlign:'left' }}><th style={{padding:'10px'}}>ユーザー</th><th>ポイント</th><th>ランキング</th><th>操作</th></tr></thead>
          <tbody>
            {users.map(u => (
              <tr key={u.id} style={{ borderBottom: '1px solid #eee' }}>
                <td style={{padding:'10px'}}>{u.username || '匿名'}</td>
                <td><input type="number" defaultValue={u.point_balance} onBlur={e => supabase.from('profiles').update({ point_balance: Number(e.target.value) }).eq('id', u.id).then(()=>fetchData())} style={{ width: '80px' }} /></td>
                <td><button onClick={() => supabase.from('profiles').update({ is_hidden_from_ranking: !u.is_hidden_from_ranking }).eq('id', u.id).then(()=>fetchData())}>{u.is_hidden_from_ranking ? '隠し中' : '表示中'}</button></td>
                <td><button onClick={() => { if(confirm('削除？')) supabase.from('profiles').delete().eq('id', u.id).then(()=>fetchData()) }} style={{ color: 'red', border:'none', background:'none' }}>削除</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {activeTab === 'pdca' && (
        <section style={{ background: '#f8fafc', padding: '24px', borderRadius: '16px' }}>
          <h3 style={{ marginTop: 0 }}>🤖 PDCA 手動実行</h3>
          <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '20px', lineHeight: 1.6 }}>
            問い作成 → Supabase 公開 → X 投稿 を手動でまとめて実行します。<br />
            通常は Vercel Cron が JST 9・11・13・15・17 時に自動実行します。<br />
            <strong>すでに実行済みのスロット</strong>は skip されます。
          </p>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '140px' }}>
              <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>スロット番号</label>
              <select value={pdcaSlot} onChange={e => setPdcaSlot(Number(e.target.value))} style={s.inp}>
                {[0, 1, 2, 3, 4].map(n => (
                  <option key={n} value={n}>スロット {n}（JST {['9:00', '11:00', '13:00', '15:00', '17:00'][n]}）</option>
                ))}
              </select>
            </div>
            <div style={{ flex: 1, minWidth: '180px' }}>
              <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>管理パスワード</label>
              <input
                type="password"
                value={pdcaPassword}
                onChange={e => setPdcaPassword(e.target.value)}
                placeholder="yosoru_admin"
                style={s.inp}
              />
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginBottom: '16px', flexWrap: 'wrap' }}>
            <button
              onClick={handleRunHourly}
              disabled={pdcaRunning}
              style={{ ...s.btn, background: pdcaRunning ? '#9ca3af' : '#0284c7', flex: 1, minWidth: '160px' }}
            >
              {pdcaRunning ? '⏳ 実行中…' : '⚡⚡ 今すぐ2問投稿'}
            </button>
            <button
              onClick={handleRunQuick}
              disabled={pdcaRunning}
              style={{ ...s.btn, background: pdcaRunning ? '#9ca3af' : '#059669', flex: 1, minWidth: '160px' }}
            >
              {pdcaRunning ? '⏳ 実行中…' : '⚡ Quick（1問生成）'}
            </button>
            <button
              onClick={handleRunPdca}
              disabled={pdcaRunning}
              style={{ ...s.btn, background: pdcaRunning ? '#9ca3af' : '#7c3aed', flex: 1, minWidth: '160px' }}
            >
              {pdcaRunning ? '⏳ 実行中…' : `▶ スロット ${pdcaSlot} を実行`}
            </button>
          </div>
          {pdcaResult != null && (
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>実行結果：</div>
              <pre style={{
                background: '#1e293b', color: '#e2e8f0', padding: '16px',
                borderRadius: '8px', fontSize: '12px', overflow: 'auto',
                maxHeight: '320px', whiteSpace: 'pre-wrap', wordBreak: 'break-all'
              }}>
                {JSON.stringify(pdcaResult, null, 2)}
              </pre>
            </div>
          )}
          <div style={{ marginTop: '20px', padding: '12px', background: '#fef9c3', borderRadius: '8px', fontSize: '12px', color: '#854d0e' }}>
            <strong>X 投稿が 402 エラーになる場合：</strong><br />
            developer.twitter.com → Products でクレジット残高を確認・チャージしてください。
          </div>
        </section>
      )}

      {activeTab === 'config' && (
        <section style={{ background: '#f8fafc', padding: '24px', borderRadius: '16px' }}>
          <h3>📢 サイト設定・𝕏投稿テンプレート</h3>
          <div style={{marginBottom:'15px'}}>
            <label style={{fontSize:'12px', color:'#666'}}>サイト名</label>
            <input value={siteConfig.site_title} onChange={e => setSiteConfig({...siteConfig, site_title: e.target.value})} placeholder="タイトル" style={s.inp} />
          </div>
          <div style={{marginBottom:'15px'}}>
            <label style={{fontSize:'12px', color:'#666'}}>サイト説明</label>
            <input value={siteConfig.site_description} onChange={e => setSiteConfig({...siteConfig, site_description: e.target.value})} placeholder="説明" style={s.inp} />
          </div>
          <div style={{marginBottom:'15px'}}>
            <label style={{fontSize:'12px', color:'#666'}}>管理メッセージ</label>
            <textarea value={siteConfig.admin_message} onChange={e => setSiteConfig({...siteConfig, admin_message: e.target.value})} placeholder="メッセージ" style={{...s.inp, height:'60px'}} />
          </div>
          <div style={{marginBottom:'15px'}}>
            <label style={{fontSize:'12px', color:'#666'}}>𝕏投稿テンプレート（{'{title}'}, {'{option}'}が置換されます）</label>
            <textarea value={siteConfig.share_text_base} onChange={e => setSiteConfig({...siteConfig, share_text_base: e.target.value})} placeholder="𝕏投稿文" style={{...s.inp, height:'80px'}} />
          </div>
          <button onClick={handleUpdateConfig} style={{...s.btn, background: '#10b981', width:'100%'}}>サイト設定を保存</button>
        </section>
      )}
    </div>
  )
}
