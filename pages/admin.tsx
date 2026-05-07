import { useState, useEffect, useCallback, useMemo } from 'react'
import Link from 'next/link'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'

export default function Admin() {
  const ADMIN_PASSWORD = 'yosoru_admin' 
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  const [passInput, setPassInput] = useState('')
  const [activeTab, setActiveTab] = useState<'markets' | 'categories' | 'users' | 'config' | 'pdca' | 'gacha' | 'proposals'>('markets')
  const [markets, setMarkets] = useState<any[]>([])
  /** '' = すべて表示 */
  const [marketCategoryFilter, setMarketCategoryFilter] = useState<string>('')
  const [marketSortBy, setMarketSortBy] = useState<'new' | 'deadline' | 'popular'>('new')
  const [proposals, setProposals] = useState<any[]>([])
  const [proposalsLoading, setProposalsLoading] = useState(false)
  const [proposalsTableMissing, setProposalsTableMissing] = useState(false)
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

  type GachaCard = {
    draft: { title: string; description: string; category: string; options: string[]; endDays: number }
    headline: string
    kind: 'mlb' | 'general'
    imageUrl: string | null
    sourceLink?: string | null
    sourceSnippet?: string | null
    error?: string
  }
  type EditCard = { title: string; options: string[]; endDays: number }
  const [gachaCards, setGachaCards] = useState<GachaCard[]>([])
  const [gachaEdits, setGachaEdits] = useState<EditCard[]>([])
  const [gachaLoading, setGachaLoading] = useState(false)
  const [gachaPosting, setGachaPosting] = useState<number | null>(null)
  const [gachaPostResults, setGachaPostResults] = useState<Record<number, unknown>>({})
  const [gachaHint, setGachaHint] = useState('')
  const [aiTestResult, setAiTestResult] = useState<unknown>(null)
  const [aiTestLoading, setAiTestLoading] = useState(false)

  useEffect(() => {
    const authStatus = localStorage.getItem('yosoru_admin_auth')
    if (authStatus === 'true') setIsAuthenticated(true)
  }, [])

  const handleLogin = () => {
    if (passInput === ADMIN_PASSWORD) {
      setIsAuthenticated(true)
      setPdcaPassword(passInput)
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
      if (marketSortBy === 'deadline') return new Date(a.end_date).getTime() - new Date(b.end_date).getTime()
      if (marketSortBy === 'popular') {
        const aPool = (a.market_options ?? []).reduce((s: number, o: any) => s + (o.pool ?? 0), 0)
        const bPool = (b.market_options ?? []).reduce((s: number, o: any) => s + (o.pool ?? 0), 0)
        return bPool - aPool
      }
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })
  }, [markets, marketCategoryFilter, marketSortBy])

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

  async function fetchProposals() {
    setProposalsLoading(true)
    setProposalsTableMissing(false)
    try {
      const res = await fetch('/api/admin/get-proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: ADMIN_PASSWORD }),
      })
      const data = await res.json()
      if (data.error && /does not exist|undefined.*table/i.test(data.error)) {
        setProposalsTableMissing(true)
      } else {
        setProposals(data.proposals ?? [])
      }
    } catch (e) {
      alert('提案取得エラー: ' + (e instanceof Error ? e.message : String(e)))
    }
    setProposalsLoading(false)
  }

  async function handleProposalAction(proposalId: number, action: 'approve' | 'reject') {
    const label = action === 'approve' ? '承認' : '却下'
    if (!confirm(`この提案を${label}しますか？`)) return
    try {
      const res = await fetch('/api/admin/approve-proposal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: ADMIN_PASSWORD, proposalId, action }),
      })
      const data = await res.json()
      if (data.ok) {
        alert(`${label}しました`)
        fetchProposals()
      } else {
        alert(`エラー: ${data.error}`)
      }
    } catch (e) {
      alert('エラー: ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function handleTestAi() {
    setAiTestLoading(true)
    setAiTestResult(null)
    try {
      const res = await fetch('/api/admin/test-ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: pdcaPassword }),
      })
      setAiTestResult(await res.json())
    } catch (e) {
      setAiTestResult({ error: e instanceof Error ? e.message : String(e) })
    }
    setAiTestLoading(false)
  }

  async function handleDebugDraft() {
    setAiTestLoading(true)
    setAiTestResult(null)
    try {
      const res = await fetch('/api/admin/generate-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: pdcaPassword, debug: true }),
      })
      setAiTestResult(await res.json())
    } catch (e) {
      setAiTestResult({ error: e instanceof Error ? e.message : String(e) })
    }
    setAiTestLoading(false)
  }

  async function handleGacha() {
    if (!pdcaPassword) { alert('管理パスワードを入力してください'); return }
    setGachaLoading(true)
    setGachaCards([])
    setGachaEdits([])
    setGachaPostResults({})
    try {
      const res = await fetch('/api/admin/generate-drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: pdcaPassword, count: 10, hint: gachaHint }),
      })
      const data = await res.json()
      if (!res.ok) {
        setGachaCards([{ draft: { title: '', description: '', category: '', options: [], endDays: 7 }, headline: '', kind: 'general', imageUrl: null, error: data.error ?? `エラー (${res.status})` }])
        setGachaLoading(false)
        return
      }
      const cards: any[] = data.candidates || []
      if (cards.length === 0) {
        setGachaCards([{ draft: { title: '', description: '', category: '', options: [], endDays: 7 }, headline: '', kind: 'general', imageUrl: null, error: '候補が生成されませんでした。APIキーやパスワードを確認してください。' }])
      } else {
        setGachaCards(cards)
        setGachaEdits(cards.map((c: any) => ({
          title: c.draft?.title ?? '',
          options: c.draft?.options ?? ['', '', ''],
          endDays: c.draft?.endDays ?? 7,
        })))
      }
    } catch (e) {
      setGachaCards([{ draft: { title: '', description: '', category: '', options: [], endDays: 7 }, headline: '', kind: 'general', imageUrl: null, error: e instanceof Error ? e.message : String(e) }])
    }
    setGachaLoading(false)
  }

  async function handlePostGacha(idx: number) {
    const card = gachaCards[idx]
    const edit = gachaEdits[idx]
    if (!card || !edit) return
    setGachaPosting(idx)
    try {
      const draft = { ...card.draft, title: edit.title, options: edit.options, endDays: edit.endDays }
      const res = await fetch('/api/admin/post-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: pdcaPassword, draft, headline: card.headline, kind: card.kind, imageUrl: card.imageUrl, sourceLink: card.sourceLink }),
      })
      const data = await res.json()
      setGachaPostResults(prev => ({ ...prev, [idx]: data }))
    } catch (e) {
      setGachaPostResults(prev => ({ ...prev, [idx]: { error: e instanceof Error ? e.message : String(e) } }))
    }
    setGachaPosting(null)
  }

  const [batchImageLoading, setBatchImageLoading] = useState(false)
  const [batchImageResult, setBatchImageResult] = useState<unknown>(null)
  const [refreshImageLoading, setRefreshImageLoading] = useState(false)

  async function handleBatchAddImages() {
    if (!confirm('画像なしの問いに自動で画像を追加します（最大20件ずつ）。続けますか？')) return
    setBatchImageLoading(true)
    setBatchImageResult(null)
    try {
      const res = await fetch('/api/admin/batch-add-images', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminPassword: ADMIN_PASSWORD }),
      })
      const data = await res.json()
      setBatchImageResult(data)
      if ((data.remaining ?? 0) > 0) {
        alert(`${data.updated}件更新。残り${data.remaining}件。もう一度ボタンを押してください。`)
      } else {
        alert(`完了：${data.updated}件更新しました。`)
      }
      fetchData()
    } catch (e) {
      setBatchImageResult({ error: e instanceof Error ? e.message : String(e) })
    }
    setBatchImageLoading(false)
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
        <button onClick={() => setActiveTab('gacha')} style={{...s.tab(activeTab === 'gacha'), background: activeTab === 'gacha' ? '#f59e0b' : '#fef3c7', color: activeTab === 'gacha' ? '#fff' : '#92400e'}}>🎰 ガチャ投稿</button>
        <button onClick={() => setActiveTab('categories')} style={s.tab(activeTab === 'categories')}>カテゴリ</button>
        <button onClick={() => setActiveTab('users')} style={s.tab(activeTab === 'users')}>ユーザー</button>
        <button onClick={() => setActiveTab('config')} style={s.tab(activeTab === 'config')}>サイト設定</button>
        <button onClick={() => setActiveTab('pdca')} style={s.tab(activeTab === 'pdca')}>🤖 PDCA</button>
        <button onClick={() => { setActiveTab('proposals'); fetchProposals() }} style={s.tab(activeTab === 'proposals')}>✏️ 投稿提案</button>
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
            <div style={{ display: 'flex', gap: '6px', marginTop: '10px', alignItems: 'center' }}>
              <span style={{ fontSize: '11px', color: '#64748b', marginRight: '4px' }}>並び順:</span>
              {(['new', 'deadline', 'popular'] as const).map(v => (
                <button key={v} type="button" onClick={() => setMarketSortBy(v)} style={s.sortBtn(marketSortBy === v)}>
                  {v === 'new' ? '新着順' : v === 'deadline' ? '締切順' : '人気順'}
                </button>
              ))}
              <span style={{ fontSize: '11px', color: '#94a3b8', marginLeft: '6px' }}>確定済みは後ろに表示</span>
            </div>
          </div>

          <div style={{ marginBottom: '16px', display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={handleBatchAddImages}
              disabled={batchImageLoading}
              style={{ ...s.btn, background: batchImageLoading ? '#9ca3af' : '#0891b2', padding: '8px 16px', fontSize: '13px' }}
            >
              {batchImageLoading ? '処理中…' : '🖼 画像なし問いに一括追加（20件ずつ）'}
            </button>
            {batchImageResult != null && (
              <span style={{ fontSize: '12px', color: '#64748b' }}>
                {JSON.stringify(batchImageResult)}
              </span>
            )}
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

                  <label style={{fontSize:'11px', color:'#666'}}>画像</label>
                  {editForm.image_url && <img src={editForm.image_url} alt="" style={{width:'100%', maxHeight:'120px', objectFit:'cover', borderRadius:'6px', marginBottom:'8px'}} />}
                  <button type="button" disabled={refreshImageLoading} onClick={async () => {
                    setRefreshImageLoading(true)
                    try {
                      const res = await fetch('/api/admin/refresh-image', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ adminPassword: ADMIN_PASSWORD, marketId: editingId }) })
                      const data = await res.json()
                      if (data.imageUrl) {
                        setEditForm((f: any) => ({ ...f, image_url: data.imageUrl }))
                        await fetchData()
                        alert(`画像を更新しました！\nキーワード: ${data.keywords}\nURL: ${data.imageUrl}`)
                      } else {
                        alert('画像取得失敗: ' + (data.error ?? JSON.stringify(data)))
                      }
                    } catch (e) {
                      alert('通信エラー: ' + (e instanceof Error ? e.message : String(e)))
                    }
                    setRefreshImageLoading(false)
                  }} style={{...s.btn, background: refreshImageLoading ? '#9ca3af' : '#0891b2', padding:'8px 14px', fontSize:'12px', marginBottom:'8px', width:'100%'}}>
                    {refreshImageLoading ? 'AI処理中…（数秒かかります）' : '🔄 AIで画像を再取得'}
                  </button>
                  <div style={{marginBottom:'10px'}}><label style={{fontSize:'12px', color:'#666'}}>または画像ファイルをアップロード</label><br/><input type="file" onChange={e => uploadImage(e, true)} /></div>

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

      {activeTab === 'gacha' && (
        <section style={{ background: '#fffbeb', padding: '24px', borderRadius: '16px' }}>
          <h3 style={{ marginTop: 0, fontSize: '20px' }}>🎰 ガチャ投稿</h3>
          <p style={{ fontSize: '13px', color: '#78350f', marginBottom: '16px', lineHeight: 1.7 }}>
            ボタンを押すと最新ニュース・Xトレンドから<strong>10問の候補</strong>を生成します。<br />
            気に入った問いを選び、必要なら編集してからX投稿できます。
          </p>
          <div style={{ display: 'flex', gap: '12px', marginBottom: '12px', flexWrap: 'wrap', alignItems: 'flex-end' }}>
            <div style={{ flex: 1, minWidth: '200px' }}>
              <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>管理パスワード</label>
              <input type="password" value={pdcaPassword} onChange={e => setPdcaPassword(e.target.value)} placeholder="yosoru_admin" style={s.inp} />
            </div>
            <button
              onClick={handleTestAi}
              disabled={aiTestLoading}
              style={{ ...s.btn, background: aiTestLoading ? '#9ca3af' : '#64748b', padding: '10px 16px', fontSize: '12px', marginBottom: '10px' }}
            >
              {aiTestLoading ? '確認中…' : '🔍 AI接続テスト'}
            </button>
            <button
              onClick={handleDebugDraft}
              disabled={aiTestLoading}
              style={{ ...s.btn, background: aiTestLoading ? '#9ca3af' : '#7c3aed', padding: '10px 16px', fontSize: '12px', marginBottom: '10px' }}
            >
              {aiTestLoading ? '確認中…' : '🔬 ガチャ診断'}
            </button>
          </div>
          {aiTestResult != null && (
            <div style={{ marginBottom: '16px', padding: '12px', background: '#1e293b', borderRadius: '10px' }}>
              <div style={{ fontSize: '11px', color: '#94a3b8', marginBottom: '6px' }}>AI接続テスト結果：</div>
              <pre style={{ color: '#e2e8f0', fontSize: '12px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                {JSON.stringify(aiTestResult, null, 2)}
              </pre>
            </div>
          )}
          <div style={{ marginBottom: '16px' }}>
            <label style={{ fontSize: '12px', color: '#78350f', fontWeight: 'bold', display: 'block', marginBottom: '4px' }}>
              💡 AIへの着眼点・指示（任意）
            </label>
            <textarea
              value={gachaHint}
              onChange={e => setGachaHint(e.target.value)}
              placeholder={'例：今週の政治ネタで攻めたい&#10;例：エンタメ・アイドル系で若い人が食いつくもの&#10;例：円安・物価上昇で庶民が感じるリアルな問い&#10;例：AI・テクノロジーで近い未来が見えるもの'}
              rows={3}
              style={{ ...s.inp, resize: 'vertical', marginBottom: 0, fontSize: '13px', background: '#fffbeb', borderColor: '#fcd34d' }}
            />
            <p style={{ fontSize: '11px', color: '#92400e', marginTop: '4px' }}>空欄でもOK。入力するとAIがその方向性で問いを生成します。</p>
          </div>
          <div style={{ marginBottom: '16px' }}>
            <button
              onClick={handleGacha}
              disabled={gachaLoading}
              style={{ ...s.btn, background: gachaLoading ? '#9ca3af' : '#f59e0b', fontSize: '16px', padding: '12px 28px', minWidth: '160px' }}
            >
              {gachaLoading ? '⏳ 生成中…' : '🎰 10問ガチャ！'}
            </button>
          </div>

          {gachaCards.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {gachaCards.map((card, idx) => {
                const edit = gachaEdits[idx]
                const postResult = gachaPostResults[idx]
                const isPosting = gachaPosting === idx
                const posted = postResult && !(postResult as any).error
                if (card.error) {
                  return (
                    <div key={idx} style={{ background: '#fee2e2', padding: '16px', borderRadius: '12px', color: '#991b1b', fontSize: '13px' }}>
                      ❌ 生成エラー: {card.error}
                    </div>
                  )
                }
                if (!edit) return null
                return (
                  <div key={idx} style={{ background: '#fff', border: posted ? '2px solid #10b981' : '1px solid #fcd34d', borderRadius: '14px', padding: '20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px', gap: '8px' }}>
                      <span style={{ fontSize: '11px', color: '#9ca3af', flex: 1 }}>📰 {card.headline}</span>
                      <span style={{ fontSize: '11px', background: '#e0f2fe', color: '#0369a1', borderRadius: '20px', padding: '2px 10px', whiteSpace: 'nowrap' }}>{card.draft?.category}</span>
                    </div>

                    {(card.sourceLink || card.sourceSnippet) && (() => {
                      let domain = ''
                      try { domain = card.sourceLink ? new URL(card.sourceLink).hostname.replace(/^www\./, '') : '' } catch { domain = (card.sourceLink ?? '').slice(0, 40) }
                      return (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'baseline', padding: '5px 10px', background: '#f0f9ff', borderRadius: '7px', fontSize: '11px', color: '#64748b', marginBottom: '10px', lineHeight: 1.5 }}>
                          {domain && (
                            <a href={card.sourceLink!} target="_blank" rel="noopener noreferrer" style={{ color: '#0284c7', whiteSpace: 'nowrap', fontWeight: 600, textDecoration: 'none', flexShrink: 0 }}>
                              🔗 {domain}
                            </a>
                          )}
                          {card.sourceSnippet && (
                            <span style={{ overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' } as React.CSSProperties}>
                              {card.sourceSnippet}
                            </span>
                          )}
                        </div>
                      )
                    })()}

                    <div style={{ marginBottom: '10px' }}>
                      <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '4px' }}>タイトル（編集可）</label>
                      <textarea
                        value={edit.title}
                        onChange={e => setGachaEdits(prev => prev.map((ed, i) => i === idx ? { ...ed, title: e.target.value } : ed))}
                        rows={2}
                        style={{ ...s.inp, resize: 'vertical', marginBottom: 0, fontWeight: 'bold', fontSize: '15px' }}
                      />
                    </div>

                    <div style={{ marginBottom: '12px' }}>
                      <label style={{ fontSize: '11px', color: '#666', display: 'block', marginBottom: '6px' }}>選択肢（編集可）</label>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {edit.options.map((opt, oi) => (
                          <input
                            key={oi}
                            value={opt}
                            onChange={e => setGachaEdits(prev => prev.map((ed, i) => {
                              if (i !== idx) return ed
                              const newOpts = [...ed.options]
                              newOpts[oi] = e.target.value
                              return { ...ed, options: newOpts }
                            }))}
                            placeholder={`選択肢 ${oi + 1}`}
                            style={{ ...s.inp, flex: 1, minWidth: '100px', marginBottom: 0, fontSize: '13px' }}
                          />
                        ))}
                      </div>
                    </div>

                    <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <label style={{ fontSize: '11px', color: '#666' }}>締切</label>
                        <select
                          value={edit.endDays}
                          onChange={e => setGachaEdits(prev => prev.map((ed, i) => i === idx ? { ...ed, endDays: Number(e.target.value) } : ed))}
                          style={{ padding: '6px 8px', border: '1px solid #ddd', borderRadius: '6px', fontSize: '13px' }}
                        >
                          {[3, 5, 7, 10, 14].map(d => <option key={d} value={d}>{d}日後</option>)}
                        </select>
                      </div>

                      {posted ? (
                        <div style={{ color: '#10b981', fontSize: '13px', fontWeight: 'bold' }}>
                          ✅ 投稿済み（market ID: {(postResult as any).marketId}）
                          {(postResult as any).tweetError && <span style={{ color: '#f59e0b', marginLeft: '8px' }}>X投稿エラー: {(postResult as any).tweetError}</span>}
                        </div>
                      ) : (
                        <button
                          onClick={() => handlePostGacha(idx)}
                          disabled={isPosting || gachaPosting !== null}
                          style={{ ...s.btn, background: isPosting ? '#9ca3af' : '#0284c7', padding: '10px 20px' }}
                        >
                          {isPosting ? '⏳ 投稿中…' : '📤 この問いを投稿'}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {activeTab === 'pdca' && (
        <section style={{ background: '#f8fafc', padding: '24px', borderRadius: '16px' }}>
          <h3 style={{ marginTop: 0 }}>🤖 自動投稿（毎時 JST 9〜23時）</h3>

          {/* cron-job.org 設定手順 */}
          <div style={{ padding: '16px', background: '#f0fdf4', border: '1px solid #86efac', borderRadius: '10px', marginBottom: '20px', fontSize: '13px', lineHeight: 1.8 }}>
            <strong style={{ color: '#166534' }}>⚙️ cron-job.org の設定手順（初回のみ）</strong><br />
            <ol style={{ margin: '8px 0 0', paddingLeft: '18px', color: '#166534' }}>
              <li><a href="https://cron-job.org" target="_blank" rel="noopener noreferrer" style={{ color: '#15803d' }}>cron-job.org</a> で無料アカウントを作成</li>
              <li>「CREATE CRONJOB」→ 以下のURLを設定：<br />
                <code style={{ background: '#dcfce7', padding: '2px 6px', borderRadius: '4px', wordBreak: 'break-all', fontSize: '12px' }}>
                  {typeof window !== 'undefined' ? window.location.origin : 'https://your-site.vercel.app'}/api/cron/pdca-hourly?secret=【CRON_SECRETの値】
                </code>
              </li>
              <li>スケジュール：「Every hour」で時間を「0〜14時（UTC）」に限定 ＝ JST 9〜23時</li>
              <li>「CRON_SECRETの値」は Vercel Dashboard → Settings → Environment Variables で確認</li>
            </ol>
          </div>

          {/* 手動実行 */}
          <div style={{ padding: '16px', background: '#fff', border: '1px solid #e2e8f0', borderRadius: '10px', marginBottom: '20px' }}>
            <strong style={{ fontSize: '14px' }}>手動で今すぐ投稿</strong>
            <p style={{ fontSize: '12px', color: '#64748b', margin: '6px 0 12px' }}>確認なしで即投稿されます。画像は後で「🖼 画像なし問いに一括追加」で補完できます。</p>
            <div style={{ marginBottom: '12px' }}>
              <label style={{ fontSize: '12px', color: '#666', display: 'block', marginBottom: '4px' }}>管理パスワード</label>
              <input type="password" value={pdcaPassword} onChange={e => setPdcaPassword(e.target.value)} placeholder="yosoru_admin" style={{ ...s.inp, marginBottom: 0 }} />
            </div>
            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
              <button onClick={handleRunHourly} disabled={pdcaRunning}
                style={{ ...s.btn, background: pdcaRunning ? '#9ca3af' : '#7c3aed', flex: 1 }}>
                {pdcaRunning ? '⏳ 実行中…' : '▶ 今すぐ2問投稿'}
              </button>
              <button onClick={handleRunQuick} disabled={pdcaRunning}
                style={{ ...s.btn, background: pdcaRunning ? '#9ca3af' : '#3b82f6', flex: 1 }}>
                {pdcaRunning ? '⏳ 実行中…' : '▶ 今すぐ1問投稿'}
              </button>
            </div>
          </div>

          {pdcaResult != null && (
            <div>
              <div style={{ fontSize: '12px', color: '#64748b', marginBottom: '6px' }}>実行結果：</div>
              <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: '16px', borderRadius: '8px', fontSize: '12px', overflow: 'auto', maxHeight: '320px', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                {JSON.stringify(pdcaResult, null, 2)}
              </pre>
            </div>
          )}

          <div style={{ marginTop: '16px', padding: '12px', background: '#fef9c3', borderRadius: '8px', fontSize: '12px', color: '#854d0e' }}>
            <strong>X 投稿が 402 エラーになる場合：</strong><br />
            developer.twitter.com → Products でクレジット残高を確認・チャージしてください。
          </div>
        </section>
      )}

      {activeTab === 'proposals' && (
        <section style={{ background: '#f8fafc', padding: '24px', borderRadius: '16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h3 style={{ margin: 0 }}>✏️ ユーザー投稿提案</h3>
            <button onClick={fetchProposals} disabled={proposalsLoading} style={{ ...s.btn, background: proposalsLoading ? '#9ca3af' : '#3b82f6', padding: '8px 16px', fontSize: '13px' }}>
              {proposalsLoading ? '読み込み中…' : '🔄 更新'}
            </button>
          </div>

          {proposalsTableMissing && (() => {
            const sql = `CREATE TABLE IF NOT EXISTS user_proposals (
  id BIGSERIAL PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'その他',
  options JSONB NOT NULL DEFAULT '["はい","いいえ","どちらとも言えない"]',
  end_days INT NOT NULL DEFAULT 7,
  description TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE user_proposals ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert_own" ON user_proposals FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "select_own" ON user_proposals FOR SELECT TO authenticated USING (auth.uid() = user_id);`
            return (
              <div style={{ background: '#fef3c7', border: '1px solid #f59e0b', borderRadius: '12px', padding: '20px', marginBottom: '20px' }}>
                <div style={{ fontWeight: 'bold', color: '#92400e', marginBottom: '10px', fontSize: '15px' }}>⚠️ データベースのセットアップが必要です</div>
                <p style={{ color: '#78350f', fontSize: '13px', margin: '0 0 14px', lineHeight: 1.7 }}>
                  以下の手順で1回だけ実行してください：<br />
                  <strong>① 下のボタンで SQL エディタを開く</strong><br />
                  <strong>② SQL をコピーして貼り付ける</strong><br />
                  <strong>③ 「Run」ボタンを押す</strong>
                </p>
                <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap' }}>
                  <a
                    href="https://supabase.com/dashboard/project/qtjavdmcubhxbbmrmnvi/sql/new"
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ ...s.btn, background: '#3b82f6', padding: '10px 18px', fontSize: '13px', textDecoration: 'none', display: 'inline-block' }}
                  >
                    🔗 ① Supabase SQL エディタを開く
                  </a>
                  <button
                    onClick={() => { navigator.clipboard.writeText(sql); alert('SQLをコピーしました！エディタに貼り付けてRunを押してください') }}
                    style={{ ...s.btn, background: '#10b981', padding: '10px 18px', fontSize: '13px' }}
                  >
                    📋 ② SQL をコピー
                  </button>
                </div>
                <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: '14px', borderRadius: '8px', fontSize: '11px', whiteSpace: 'pre-wrap', wordBreak: 'break-all', margin: 0 }}>
                  {sql}
                </pre>
              </div>
            )
          })()}

          {!proposalsTableMissing && proposals.length === 0 && !proposalsLoading && (
            <p style={{ color: '#64748b', fontSize: '14px' }}>提案がありません</p>
          )}
          {proposals.map((p: any) => (
            <div key={p.id} style={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '12px', padding: '16px', marginBottom: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', marginBottom: '8px' }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 'bold', fontSize: '15px', marginBottom: '4px' }}>{p.title}</div>
                  <div style={{ fontSize: '12px', color: '#64748b' }}>
                    カテゴリ: {p.category} ／ 締切: {p.end_days}日 ／ 投稿: {new Date(p.created_at).toLocaleString()}
                  </div>
                </div>
                <span style={{
                  fontSize: '11px', padding: '3px 10px', borderRadius: '20px', fontWeight: 'bold', whiteSpace: 'nowrap',
                  background: p.status === 'pending' ? '#fef3c7' : p.status === 'approved' ? '#d1fae5' : '#fee2e2',
                  color: p.status === 'pending' ? '#92400e' : p.status === 'approved' ? '#065f46' : '#991b1b',
                }}>
                  {p.status === 'pending' ? '審査中' : p.status === 'approved' ? '承認済' : '却下'}
                </span>
              </div>
              <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                {(Array.isArray(p.options) ? p.options : JSON.parse(p.options ?? '[]')).map((opt: string, i: number) => (
                  <span key={i} style={{ fontSize: '12px', background: '#f1f5f9', padding: '3px 10px', borderRadius: '20px', color: '#334155' }}>{opt}</span>
                ))}
              </div>
              {p.description && <p style={{ fontSize: '12px', color: '#475569', margin: '0 0 10px' }}>{p.description}</p>}
              {p.status === 'pending' && (
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => handleProposalAction(p.id, 'approve')} style={{ ...s.btn, background: '#10b981', padding: '8px 18px', fontSize: '13px' }}>✅ 承認して公開</button>
                  <button onClick={() => handleProposalAction(p.id, 'reject')} style={{ ...s.btn, background: '#ef4444', padding: '8px 18px', fontSize: '13px' }}>❌ 却下</button>
                </div>
              )}
            </div>
          ))}
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
