import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
)

export default function Home() {
  const [activeTab, setActiveTab] = useState<'home' | 'ranking' | 'mypage' | 'info'>('home')
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [markets, setMarkets] = useState<any[]>([])
  const [ranking, setRanking] = useState<any[]>([])
  const [myBets, setMyBets] = useState<any[]>([])
  const [config, setConfig] = useState<any>({ site_title: 'ヨソる', show_ranking: true, categories: 'すべて' })

  // 認証・編集用
  const [showAuthModal, setShowAuthModal] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [newUsername, setNewUsername] = useState('') // 名前編集用
  const [isEditingName, setIsEditingName] = useState(false)

  const [activeCategory, setActiveCategory] = useState('すべて')
  const [sortBy, setSortBy] = useState<'new' | 'deadline' | 'popular'>('new')
  const [voteAmount, setVoteAmount] = useState(100)
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const categoryMeta: any = {
    'こども': { icon: '🎒', color: '#f43f5e' },
    '経済・政治': { icon: '🏛️', color: '#3b82f6' },
    'エンタメ': { icon: '🎤', color: '#a855f7' },
    'スポーツ': { icon: '⚽️', color: '#22c55e' },
    'ライフ': { icon: '🌅', color: '#f59e0b' },
    'ゲーム': { icon: '🎮', color: '#10b981' },
    'その他': { icon: '🎲', color: '#6b7280' },
  }

  useEffect(() => {
    const init = async () => {
      const { data: cfg } = await supabase.from('site_config').select('*').single()
      if (cfg) setConfig(cfg)
      const { data: { session: s } } = await supabase.auth.getSession()
      setSession(s)
      if (s) initUserData(s.user.id)
      fetchMarkets()
      fetchRanking()
      setIsLoading(false)
    }
    const { data: authListener } = supabase.auth.onAuthStateChange((_, s) => {
      setSession(s); if (s) initUserData(s.user.id);
    })
    init(); return () => authListener.subscription.unsubscribe()
  }, [sortBy])

  async function initUserData(userId: string) {
    const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (p) { setProfile(p); setNewUsername(p.username || ''); }
    const { data: b } = await supabase.from('bets').select('*, markets(title, is_resolved, result_option_id), market_options(name)').eq('user_id', userId).order('created_at', { ascending: false })
    if (b) setMyBets(b)
  }

  // 名前更新処理
  async function handleUpdateName() {
    if (!profile) return
    const { error } = await supabase.from('profiles').update({ username: newUsername }).eq('id', profile.id)
    if (error) alert('更新に失敗しました')
    else { alert('名前を更新しました'); setIsEditingName(false); initUserData(profile.id); }
  }

  async function fetchMarkets() {
    let query = supabase.from('markets').select('*, market_options(*)')
    if (sortBy === 'new') query = query.order('created_at', { ascending: false })
    else if (sortBy === 'deadline') query = query.order('end_date', { ascending: true })
    else if (sortBy === 'popular') query = query.order('total_pool', { ascending: false })
    const { data } = await query
    if (data) setMarkets(data.map((m: any) => ({ ...m, market_options: m.market_options.sort((a: any, b: any) => a.id - b.id) })))
  }

  async function fetchRanking() {
    const { data } = await supabase.from('profiles').select('*').order('point_balance', { ascending: false }).limit(10)
    if (data) setRanking(data)
  }

  const handleVote = async () => {
    if (!session) { setShowAuthModal(true); return; }
    if (!selectedOptionId) return alert('選択肢を選んでください');
    const { error } = await supabase.rpc('place_bet', { market_id_input: selectedMarketId, option_id_input: selectedOptionId, amount_input: voteAmount })
    if (!error) { alert('ヨソりました！'); setSelectedMarketId(null); fetchMarkets(); initUserData(session.user.id); }
    else alert(error.message)
  }

  const getOdds = (t: number, p: number) => (p === 0 ? 0 : (t / p).toFixed(1))
  const getPercent = (t: number, p: number) => (t === 0 ? 0 : Math.round((p / t) * 100))
  const dynamicCategories = config.categories ? config.categories.split(',').map((c: string) => c.trim()) : ['すべて']

  // スタイル設定
  const s: any = {
    container: { maxWidth: '500px', margin: '0 auto', padding: '10px 10px 80px', fontFamily: 'sans-serif', background: '#fff' },
    title: { fontSize: '24px', fontWeight: '900', textAlign: 'center', margin: '0 0 10px', background: 'linear-gradient(to right, #2563eb, #9333ea)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    catGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '4px', marginBottom: '10px' },
    catBtn: (active: boolean) => ({ padding: '6px 0', borderRadius: '4px', border: '1px solid #eee', background: active ? '#1f2937' : '#fff', color: active ? '#fff' : '#666', fontSize: '10px', fontWeight: 'bold' }),
    card: { borderRadius: '12px', marginBottom: '12px', border: '1px solid #eee', overflow: 'hidden', position: 'relative' },
    imgOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', color: '#fff' },
    desc: { fontSize: '11px', color: '#555', background: '#f5f5f5', padding: '4px 8px', borderRadius: '4px', margin: '4px 0', border: '1px solid #eee', lineHeight: '1.4' },
    modal: { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' },
    modalContent: { background: 'white', padding: '20px', borderRadius: '16px', width: '100%', maxWidth: '400px', textAlign: 'center' }
  }

  return (
    <div style={s.container}>
      {/* 認証モーダル */}
      {showAuthModal && (
        <div style={s.modal as any}>
          <div style={s.modalContent as any}>
            <h2 style={{ fontSize: '18px', marginBottom: '15px' }}>ヨソるを開始</h2>
            <button onClick={() => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })} style={{ width: '100%', padding: '12px', marginBottom: '10px', borderRadius: '8px', border: '1px solid #ddd', background: '#fff', fontWeight: 'bold' }}>Googleで続ける</button>
            <input type="email" placeholder="メール" value={email} onChange={e => setEmail(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '8px', borderRadius: '6px', border: '1px solid #ddd' }} />
            <input type="password" placeholder="パス" value={password} onChange={e => setPassword(e.target.value)} style={{ width: '100%', padding: '10px', marginBottom: '10px', borderRadius: '6px', border: '1px solid #ddd' }} />
            <button onClick={handleEmailAuth} style={{ width: '100%', padding: '12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>{isSignUp ? '登録' : 'ログイン'}</button>
            <button onClick={() => setIsSignUp(!isSignUp)} style={{ background: 'none', border: 'none', color: '#3b82f6', fontSize: '11px', marginTop: '10px' }}>切替</button>
            <button onClick={() => { supabase.auth.signInAnonymously(); setShowAuthModal(false); }} style={{ display: 'block', margin: '15px auto', fontSize: '11px', color: '#999' }}>匿名ログイン</button>
            <button onClick={() => setShowAuthModal(false)} style={{ color: '#666', border: 'none', background: 'none' }}>閉じる</button>
          </div>
        </div>
      )}

      <header>
        <h1 style={s.title}>{config.site_title}</h1>
        <div style={s.catGrid}>
          {dynamicCategories.map(c => <button key={c} onClick={() => setActiveCategory(c)} style={s.catBtn(activeCategory === c)}>{c}</button>)}
        </div>
        <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '12px' }}>
          {['new', 'deadline', 'popular'].map(type => (
            <button key={type} onClick={() => setSortBy(type as any)} style={{ padding: '4px 12px', borderRadius: '15px', border: 'none', background: sortBy === type ? '#3b82f6' : '#eee', color: sortBy === type ? '#fff' : '#666', fontSize: '10px', fontWeight: 'bold' }}>
              {type === 'new' ? '✨新着' : type === 'deadline' ? '⏰締切' : '🔥人気'}
            </button>
          ))}
        </div>
      </header>

      {activeTab === 'home' && (
        <div>
          {markets.filter(m => activeCategory === 'すべて' || m.category === activeCategory).map(m => {
            const active = !m.is_resolved && new Date(m.end_date) > new Date()
            const daysLeft = Math.ceil((new Date(m.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
            return (
              <div key={m.id} style={s.card}>
                <div style={{ height: '140px', position: 'relative', background: '#eee' }}>
                  {m.image_url && <img src={m.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  <div style={{ position: 'absolute', top: 8, left: 8, background: categoryMeta[m.category]?.color || '#666', color: '#fff', fontSize: '9px', padding: '2px 6px', borderRadius: '4px' }}>{m.category}</div>
                  {active && <div style={{ position: 'absolute', top: 8, right: 8, background: '#fff', color: '#ef4444', fontSize: '9px', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', border: '1px solid #ef4444' }}>あと{daysLeft}日</div>}
                  <div style={s.imgOverlay}><h2 style={{ fontSize: '15px', margin: 0, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>{m.title}</h2></div>
                </div>
                <div style={{ padding: '8px 10px' }}>
                  <div style={s.desc}>{m.description}</div>
                  <div style={{ fontSize: '10px', fontWeight: 'bold', marginBottom: '6px' }}>💰 総額: {m.total_pool.toLocaleString()} pt</div>
                  {m.market_options.map((opt: any, i: number) => {
                    const pct = getPercent(m.total_pool, opt.pool);
                    return (
                      <div key={opt.id} style={{ marginBottom: '4px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px', fontWeight: 'bold' }}>
                          <span>{m.result_option_id === opt.id ? '👑 ' : ''}{opt.name}</span>
                          <span style={{ color: '#3b82f6' }}>{getOdds(m.total_pool, opt.pool)}倍 ({pct}%)</span>
                        </div>
                        <div style={{ height: '6px', background: '#eee', borderRadius: '3px', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: ['#3b82f6', '#ef4444', '#10b981'][i % 3] }} /></div>
                      </div>
                    )
                  })}
                  {active ? (
                    selectedMarketId === m.id ? (
                      <div style={{ marginTop: '8px', padding: '8px', background: '#f9fafb', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                          {m.market_options.map((o: any) => (<button key={o.id} onClick={() => setSelectedOptionId(o.id)} style={{ padding: '5px 10px', borderRadius: '15px', border: selectedOptionId === o.id ? '2px solid #3b82f6' : '1px solid #ddd', fontSize: '11px', background: '#fff' }}>{o.name}</button>))}
                        </div>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <input type="range" min="10" max={profile?.point_balance || 1000} step="10" value={voteAmount} onChange={e => setVoteAmount(Number(e.target.value))} style={{ flex: 1 }} />
                          <input type="number" value={voteAmount} onChange={e => setVoteAmount(Number(e.target.value))} style={{ width: '50px', fontSize: '11px' }} />
                          <button onClick={handleVote} style={{ background: '#1f2937', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>確定</button>
                        </div>
                      </div>
                    ) : ( <button onClick={() => setSelectedMarketId(m.id)} style={{ width: '100%', padding: '8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', fontSize: '13px', marginTop: '6px' }}>ヨソる</button> )
                  ) : <div style={{ textAlign: 'center', fontSize: '11px', color: '#999', marginTop: '6px' }}>終了</div>}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'ranking' && (
        <div style={{ border: '1px solid #eee', borderRadius: '12px' }}>
          {ranking.map((u, i) => (
            <div key={u.id} style={{ display: 'flex', padding: '10px', borderBottom: '1px solid #eee', fontSize: '13px' }}>
              <span style={{ width: '30px', fontWeight: 'bold', color: i < 3 ? '#d97706' : '#999' }}>{i + 1}</span>
              <span style={{ flex: 1 }}>{u.username || '名無しさん'}</span>
              <span style={{ fontWeight: 'bold' }}>{u.point_balance.toLocaleString()}pt</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'mypage' && (
        <div>
          <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)', color: '#fff', padding: '20px', borderRadius: '12px', textAlign: 'center', marginBottom: '15px' }}>
            {/* 名前表示・編集エリア */}
            {isEditingName ? (
              <div style={{ display: 'flex', gap: '5px', justifyContent: 'center', marginBottom: '10px' }}>
                <input value={newUsername} onChange={e => setNewUsername(e.target.value)} style={{ padding: '5px', borderRadius: '4px', border: 'none', color: '#333' }} />
                <button onClick={handleUpdateName} style={{ background: '#fff', border: 'none', padding: '5px 10px', borderRadius: '4px', fontSize: '12px' }}>保存</button>
                <button onClick={() => setIsEditingName(false)} style={{ background: 'none', border: 'none', color: '#fff', fontSize: '12px' }}>取消</button>
              </div>
            ) : (
              <div style={{ marginBottom: '5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '10px' }}>
                <span style={{ fontSize: '18px', fontWeight: 'bold' }}>{profile?.username || '名無しさん'}</span>
                <button onClick={() => setIsEditingName(true)} style={{ background: 'rgba(255,255,255,0.2)', border: 'none', color: '#fff', padding: '2px 8px', borderRadius: '4px', fontSize: '10px' }}>編集</button>
              </div>
            )}
            <div style={{ fontSize: '11px', opacity: 0.8 }}>現在の資産</div>
            <div style={{ fontSize: '30px', fontWeight: '900' }}>{profile?.point_balance?.toLocaleString()} pt</div>
          </div>
          <h3 style={{ fontSize: '14px', marginBottom: '10px' }}>📜 履歴</h3>
          {myBets.map(b => (
            <div key={b.id} style={{ padding: '10px', border: '1px solid #eee', borderRadius: '8px', marginBottom: '8px', fontSize: '12px' }}>
              <div style={{ color: '#999', fontSize: '10px' }}>{b.markets.title}</div>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold', marginTop: '2px' }}>
                <span>{b.market_options.name} / {b.amount}pt</span>
                <span style={{ color: b.markets.is_resolved ? (b.markets.result_option_id === b.market_option_id ? '#10b981' : '#ef4444') : '#666' }}>
                  {b.markets.is_resolved ? (b.markets.result_option_id === b.market_option_id ? '✅的中' : '❌終了') : '判定中'}
                </span>
              </div>
            </div>
          ))}
          <button onClick={() => supabase.auth.signOut()} style={{ width: '100%', marginTop: '20px', padding: '10px', color: '#ef4444', background: 'none', border: '1px solid #ef4444', borderRadius: '8px', fontSize: '12px' }}>ログアウト</button>
        </div>
      )}

      {activeTab === 'info' && (
        <div style={{ fontSize: '12px', padding: '10px' }}>
          <h3 style={{ borderLeft: '4px solid #3b82f6', paddingLeft: '8px', marginBottom: '8px' }}>遊び方</h3>
          <p>未来の問いを選び、ポイントを「ヨソる」！的中すれば配当獲得。</p>
          <div style={{ textAlign: 'center', marginTop: '40px' }}><Link href="/admin" style={{ color: '#f0f0f0', textDecoration: 'none' }}>admin</Link></div>
        </div>
      )}

      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', display: 'flex', justifyContent: 'space-around', padding: '8px 0', borderTop: '1px solid #eee', zIndex: 100 }}>
        <button onClick={() => setActiveTab('home')} style={{ background: 'none', border: 'none', fontSize: '10px', color: activeTab === 'home' ? '#3b82f6' : '#999' }}>🏠<br/>ホーム</button>
        {config.show_ranking && <button onClick={() => setActiveTab('ranking')} style={{ background: 'none', border: 'none', fontSize: '10px', color: activeTab === 'ranking' ? '#3b82f6' : '#999' }}>👑<br/>ランク</button>}
        <button onClick={() => { if(!session) setShowAuthModal(true); else setActiveTab('mypage') }} style={{ background: 'none', border: 'none', fontSize: '10px', color: activeTab === 'mypage' ? '#3b82f6' : '#9ca3af' }}>👤<br/>マイペ</button>
        <button onClick={() => setActiveTab('info')} style={{ background: 'none', border: 'none', fontSize: '10px', color: activeTab === 'info' ? '#3b82f6' : '#999' }}>📖<br/>ガイド</button>
      </nav>
    </div>
  )
}

// 既存のhandleEmailAuth等の補助関数
async function handleEmailAuth(isSignUp: boolean, email: string, password: string, setShow: Function) {
  const { error } = isSignUp ? await supabase.auth.signUp({ email, password }) : await supabase.auth.signInWithPassword({ email, password })
  if (error) alert(error.message); else setShow(false)
}
