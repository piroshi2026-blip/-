import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useRouter } from 'next/router'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function Home() {
  const router = useRouter()
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [markets, setMarkets] = useState<any[]>([])
  const [ranking, setRanking] = useState<any[]>([])
  const [myBets, setMyBets] = useState<any[]>([])

  const [activeTab, setActiveTab] = useState<'home' | 'ranking' | 'mypage'>('home')
  const [activeCategory, setActiveCategory] = useState('すべて')
  const [sortBy, setSortBy] = useState<'popular' | 'deadline'>('popular') // ソート状態

  const [voteAmount, setVoteAmount] = useState(100)
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [editName, setEditName] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)

  const [showEmailForm, setShowEmailForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)

  const [categories, setCategories] = useState<string[]>(['すべて'])
  const [categoryMeta, setCategoryMeta] = useState<any>({})

  useEffect(() => {
    const init = async () => {
      const { data: { session: currentSession } } = await supabase.auth.getSession()
      setSession(currentSession)
      await Promise.all([
        fetchCategories(),
        fetchMarkets(),
        fetchRanking(),
        currentSession ? initUserData(currentSession.user.id) : Promise.resolve()
      ])
      setIsLoading(false)
    }
    init()
  }, [sortBy]) // ソート順が変わったら再取得

  async function fetchCategories() {
    const { data } = await supabase.from('categories').select('*').order('display_order', { ascending: true })
    if (data) {
      setCategories(['すべて', ...data.map((c: any) => c.name)])
      const meta: any = {}
      data.forEach((c: any) => { meta[c.name] = { icon: c.icon || '🎲', color: '#6b7280' } })
      setCategoryMeta(meta)
    }
  }

  async function fetchMarkets() {
    // ソート条件の設定
    let query = supabase.from('markets').select('*, market_options(*)')
    if (sortBy === 'popular') {
      query = query.order('total_pool', { ascending: false }) // 人気順（投票額順）
    } else {
      query = query.order('end_date', { ascending: true }) // 締切順
    }

    const { data } = await query
    if (data) {
      setMarkets(data.map((m: any) => ({
        ...m,
        market_options: m.market_options.sort((a: any, b: any) => a.id - b.id)
      })))
    }
  }

  async function fetchRanking() {
    const { data } = await supabase.from('profiles').select('*').eq('is_hidden_from_ranking', false).order('point_balance', { ascending: false }).limit(20)
    if (data) setRanking(data)
  }

  async function initUserData(userId: string) {
    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (profileData) { setProfile(profileData); setEditName(profileData.username || '名無しさん') }
    const { data: betsData } = await supabase.from('bets').select('*, markets(title), market_options(name)').eq('user_id', userId).order('created_at', { ascending: false })
    if (betsData) setMyBets(betsData)
  }

  const handleUpdateName = async () => {
    if (!profile || !editName) return
    const { error } = await supabase.from('profiles').update({ username: editName }).eq('id', profile.id)
    if (!error) { alert('名前を変更しました'); setIsEditingName(false); initUserData(profile.id); fetchRanking() }
  }

  const handleGoogleLogin = async () => { await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } }) }
  const handleAnonLogin = async () => { await supabase.auth.signInAnonymously(); window.location.reload() }
  const handleEmailAuth = async () => {
    if (isSignUp) { await supabase.auth.signUp({ email, password }); alert('確認メールを送りました') }
    else { const { error } = await supabase.auth.signInWithPassword({ email, password }); if (!error) window.location.reload() }
  }

  const openMarket = (marketId: number) => { if (!session) return handleGoogleLogin(); setSelectedMarketId(marketId); router.push(`/?id=${marketId}`, undefined, { shallow: true }) }
  const closeMarket = () => { setSelectedMarketId(null); setSelectedOptionId(null); router.push('/', undefined, { shallow: true }) }

  const handleVote = async () => {
    if (!session) return alert('ログインしてください')
    if (voteAmount > (profile?.point_balance || 0)) return alert('ポイント不足です')
    const { error } = await supabase.rpc('place_bet', { market_id_input: selectedMarketId, option_id_input: selectedOptionId, amount_input: voteAmount })
    if (error) alert(error.message)
    else { alert('投票しました！'); closeMarket(); fetchMarkets(); initUserData(session.user.id); fetchRanking() }
  }

  const shareOnX = (market: any) => {
    const url = `${window.location.origin}/?id=${market.id}`
    const template = localStorage.getItem('x_template') || '💰予測市場「YOSOL」に参加中！\n\nQ. {title}\n\nあなたも予想しよう！ #YOSOL'
    const text = template.replace('{title}', market.title)
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank')
  }

  const getOdds = (total: number, pool: number) => pool === 0 ? 1.0 : (total / pool)
  const getPercent = (total: number, pool: number) => total === 0 ? 0 : Math.round((pool / total) * 100)
  const isMarketActive = (market: any) => !market.is_resolved && new Date(market.end_date) > new Date()

  const filteredMarkets = markets.filter(m => activeCategory === 'すべて' ? true : m.category === activeCategory)

  const styles: any = {
    container: { maxWidth: '600px', margin: '0 auto', padding: '20px 15px 100px', minHeight: '100vh', fontFamily: 'sans-serif', color: '#1f2937' },
    headerContainer: { padding: '20px 0 10px', textAlign: 'center' },
    appTitle: { fontSize: '28px', fontWeight: '900', background: 'linear-gradient(to right, #2563eb, #9333ea)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0, letterSpacing: '-1px' },
    pointBadge: { display: 'inline-block', marginTop: '8px', padding: '4px 12px', background: '#eff6ff', color: '#2563eb', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold' },
    categoryScroll: { display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '10px', marginBottom: '10px' },
    categoryBtn: (isActive: boolean) => ({ padding: '8px 16px', borderRadius: '20px', border: isActive ? 'none' : '1px solid #e5e7eb', background: isActive ? '#1f2937' : 'white', color: isActive ? 'white' : '#4b5563', fontSize: '13px', fontWeight: 'bold', whiteSpace: 'nowrap', cursor: 'pointer' }),
    sortBar: { display: 'flex', justifyContent: 'flex-end', gap: '10px', marginBottom: '15px' },
    sortBtn: (isActive: boolean) => ({ fontSize: '11px', background: 'none', border: 'none', color: isActive ? '#2563eb' : '#9ca3af', fontWeight: isActive ? 'bold' : 'normal', cursor: 'pointer', textDecoration: isActive ? 'underline' : 'none' }),
    card: { background: 'white', borderRadius: '16px', marginBottom: '25px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', overflow: 'hidden', position: 'relative', border: '1px solid #f3f4f6' },
    imageArea: { position: 'relative', height: '180px', width: '100%' },
    cardImage: { width: '100%', height: '100%', objectFit: 'cover' },
    imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, height: '80%', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', padding: '15px' },
    watermark: { position: 'absolute', top: '-10px', right: '-10px', fontSize: '80px', opacity: 0.1, pointerEvents: 'none', transform: 'rotate(15deg)', zIndex: 0 },
    contentArea: { padding: '15px 20px 20px', position: 'relative', zIndex: 1 },
    descBox: { fontSize: '11px', color: '#4b5563', background: '#f9fafb', padding: '12px', borderRadius: '8px', marginBottom: '15px', lineHeight: '1.6', border: '1px solid #f3f4f6', whiteSpace: 'pre-wrap' },
    barRow: { marginBottom: '12px' },
    barTrack: { height: '12px', background: '#f3f4f6', borderRadius: '6px', overflow: 'hidden' },
    barFill: (percent: number, idx: number) => ({ height: '100%', width: `${percent}%`, background: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'][idx % 5], transition: 'width 0.5s' }),
    navBar: { position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(255,255,255,0.95)', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-around', padding: '12px', zIndex: 100 },
  }

  if (isLoading) return <div style={{textAlign:'center', paddingTop:'50px'}}>読み込み中...</div>

  return (
    <div style={styles.container}>
      <div style={styles.headerContainer}>
        <h1 style={styles.appTitle}>YOSOL</h1>
        {profile ? <span style={styles.pointBadge}>💎 {profile.point_balance.toLocaleString()} pt</span> : 
          <div style={{marginTop:'10px'}}>
            {!showEmailForm ? <>
              <button onClick={handleGoogleLogin} style={{padding:'8px 16px', borderRadius:'20px', border:'1px solid #ccc', background:'white', cursor:'pointer', fontWeight:'bold'}}>Googleでログイン</button>
              <button onClick={()=>setShowEmailForm(true)} style={{marginLeft:'10px', fontSize:'11px', background:'none', border:'none', color:'#666', textDecoration:'underline'}}>メールログイン</button>
              <button onClick={handleAnonLogin} style={{display:'block', margin:'5px auto', fontSize:'10px', color:'#999', background:'none', border:'none'}}>アカウントなしで試す</button>
            </> : <div style={{background:'white', padding:'15px', borderRadius:'10px', boxShadow:'0 2px 5px rgba(0,0,0,0.1)'}}>
              <input placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} style={styles.inputField} />
              <input type="password" placeholder="Pass" value={password} onChange={e=>setPassword(e.target.value)} style={styles.inputField} />
              <button onClick={handleEmailAuth} style={{width:'100%', padding:'10px', background:'#2563eb', color:'white', border:'none', borderRadius:'5px'}}>{isSignUp ? '登録' : 'ログイン'}</button>
              <button onClick={()=>setIsSignUp(!isSignUp)} style={{fontSize:'10px', marginTop:'10px', border:'none', background:'none', color:'blue'}}>{isSignUp ? 'ログインへ' : '新規登録へ'}</button>
              <button onClick={()=>setShowEmailForm(false)} style={{display:'block', margin:'5px auto', fontSize:'10px', border:'none', background:'none'}}>キャンセル</button>
            </div>}
          </div>
        }
      </div>

      {activeTab === 'home' && (
        <>
          <div style={styles.categoryScroll}>
            {categories.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)} style={styles.categoryBtn(activeCategory === cat)}>{cat}</button>
            ))}
          </div>
          <div style={styles.sortBar}>
            <button onClick={() => setSortBy('popular')} style={styles.sortBtn(sortBy === 'popular')}>🔥人気順</button>
            <button onClick={() => setSortBy('deadline')} style={styles.sortBtn(sortBy === 'deadline')}>⏰締切順</button>
          </div>

          {filteredMarkets.map((market) => {
            const isActive = isMarketActive(market)
            const catInfo = (market.category && categoryMeta[market.category]) ? categoryMeta[market.category] : { icon: '🎲', color: '#6b7280' }
            return (
              <div key={market.id} style={styles.card}>
                <div style={styles.watermark}>{catInfo.icon}</div>
                <div style={styles.imageArea}>
                    {market.image_url ? <img src={market.image_url} style={styles.cardImage} alt="" /> : <div style={{width:'100%', height:'100%', background:'#eee', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'40px'}}>{catInfo.icon}</div>}
                    <div style={styles.imageOverlay}>
                        <div style={{display:'flex', gap:'5px', marginBottom:'5px'}}>
                            <span style={{fontSize:'10px', background: catInfo.color, color:'white', padding:'2px 8px', borderRadius:'4px', fontWeight:'bold'}}>{market.category || 'その他'}</span>
                            <span style={{fontSize:'10px', background: isActive ? 'rgba(255,255,255,0.9)' : '#ef4444', color: isActive ? '#059669' : 'white', padding:'2px 8px', borderRadius:'4px', fontWeight:'bold'}}>
                                 {market.is_resolved ? '結果確定' : (isActive ? `あと ${Math.ceil((new Date(market.end_date).getTime() - new Date().getTime())/(1000*60*60*24))}日` : '受付終了')}
                            </span>
                        </div>
                        <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', margin: 0, textShadow:'0 2px 4px rgba(0,0,0,0.5)' }}>{market.title}</h2>
                    </div>
                </div>
                <div style={styles.contentArea}>
                    {/* ★ 判断基準を確実に表示 */}
                    {market.description && (
                      <div style={styles.descBox}>
                        <div style={{fontWeight:'bold', fontSize:'10px', marginBottom:'4px', color:'#2563eb'}}>【判定基準】</div>
                        <div dangerouslySetInnerHTML={{ __html: market.description.replace(/\n/g, '<br />') }} />
                      </div>
                    )}
                    <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '15px', fontWeight:'bold' }}>💰 投票総額: {market.total_pool.toLocaleString()} pt</div>
                    {market.market_options.map((opt: any, idx: number) => {
                        const percent = getPercent(market.total_pool, opt.pool)
                        const odds = getOdds(market.total_pool, opt.pool)
                        return (
                          <div key={opt.id} style={styles.barRow}>
                            <div style={{display:'flex', justifyContent:'space-between', fontSize:'13px', marginBottom:'4px', fontWeight:'bold'}}>
                              <span>{market.result_option_id === opt.id ? '👑 ' : ''}{opt.name}</span>
                              <span>{odds.toFixed(1)}倍 ({percent}%)</span>
                            </div>
                            <div style={styles.barTrack}><div style={styles.barFill(percent, idx) as any} /></div>
                          </div>
                        )
                    })}
                    {isActive ? (
                      selectedMarketId === market.id ? (
                        <div style={{ background: '#f9fafb', padding: '15px', borderRadius: '10px', marginTop: '10px', border:'1px solid #e5e7eb' }}>
                          <div style={{display:'flex', flexWrap:'wrap', gap:'8px', marginBottom:'10px'}}>
                            {market.market_options.map((opt: any) => (
                              <button key={opt.id} onClick={() => setSelectedOptionId(opt.id)} style={{ padding: '8px 12px', borderRadius: '20px', border: selectedOptionId === opt.id ? '2px solid #2563eb' : '1px solid #d1d5db', background: selectedOptionId === opt.id ? '#eff6ff' : 'white', fontSize:'13px', fontWeight:'bold', color:'black' }}>{opt.name}</button>
                            ))}
                          </div>
                          <input type="range" min="10" max={profile?.point_balance || 1000} step="10" value={voteAmount} onChange={e=>setVoteAmount(Number(e.target.value))} style={{width:'100%', marginBottom:'10px'}} />
                          <div style={{display:'flex', gap:'10px'}}>
                            <button onClick={handleVote} style={{flex:1, padding:'10px', background:'#2563eb', color:'white', border:'none', borderRadius:'8px', fontWeight:'bold'}}>{voteAmount}pt 投票</button>
                            <button onClick={closeMarket} style={{flex:1, background:'#ddd', border:'none', borderRadius:'8px'}}>やめる</button>
                          </div>
                        </div>
                      ) : <div style={{display:'flex', gap:'10px', marginTop:'15px'}}>
                        <button onClick={() => openMarket(market.id)} style={{flex:2, padding:'12px', background:'#2563eb', color:'white', border:'none', borderRadius:'10px', fontWeight:'bold'}}>⚡️ 予想する</button>
                        <button onClick={() => shareOnX(market)} style={{flex:1, padding:'12px', background:'black', color:'white', border:'none', borderRadius:'10px', fontWeight:'bold'}}>𝕏 シェア</button>
                      </div>
                    ) : <button disabled style={{width:'100%', padding:'12px', background:'#eee', color:'#999', border:'none', borderRadius:'10px', marginTop:'15px', fontWeight:'bold'}}>🚫 受付終了</button>}
                </div>
              </div>
            )
          })}
        </>
      )}

      {activeTab === 'ranking' && (
        <div style={{background:'white', borderRadius:'16px', padding:'20px', boxShadow:'0 4px 6px rgba(0,0,0,0.1)'}}>
          <h3 style={{textAlign:'center', marginBottom:'20px'}}>🏆 投資家ランキング</h3>
          {ranking.map((user, idx) => (
            <div key={user.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
              <div style={{ width: '30px', fontWeight: 'bold', color: idx < 3 ? '#d97706' : '#9ca3af' }}>{idx + 1}</div>
              <div style={{ flex: 1, fontSize: '14px' }}>{user.id === session?.user?.id ? <strong>{user.username || 'あなた'} (自分)</strong> : (user.username || '名無しさん')}</div>
              <div style={{ fontWeight: 'bold', color: '#2563eb' }}>{user.point_balance.toLocaleString()} pt</div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'mypage' && (
        <div>
          <div style={{background:'linear-gradient(135deg, #2563eb, #1e40af)', color:'white', padding:'30px 20px', borderRadius:'16px', textAlign:'center', marginBottom:'20px'}}>
            <div style={{fontSize:'14px', opacity:0.8}}>現在の総資産</div>
            <div style={{fontSize:'36px', fontWeight:'900'}}>{profile?.point_balance?.toLocaleString() || 0} pt</div>
            <div style={{marginTop:'15px'}}>
                {!isEditingName ? <div onClick={()=>setIsEditingName(true)} style={{cursor:'pointer'}}>👤 {profile?.username || '名無しさん'} ✎</div>
                : <div style={{display:'flex', justifyContent:'center', gap:'5px'}}><input value={editName} onChange={e=>setEditName(e.target.value)} style={{padding:'5px', borderRadius:'4px', border:'none', color:'black'}} /><button onClick={handleUpdateName} style={{background:'#22c55e', color:'white', border:'none', padding:'5px 10px', borderRadius:'4px'}}>保存</button></div>}
            </div>
          </div>
          <h3 style={{marginBottom:'10px'}}>📜 投票履歴</h3>
          {myBets.map(bet => (
            <div key={bet.id} style={{background:'white', padding:'15px', borderRadius:'12px', marginBottom:'10px', border:'1px solid #eee'}}>
              <div style={{fontSize:'12px', color:'#666'}}>{bet.markets?.title}</div>
              <div style={{fontWeight:'bold'}}>「{bet.market_options?.name}」に {bet.amount} pt</div>
            </div>
          ))}
          <button onClick={()=>supabase.auth.signOut().then(()=>window.location.reload())} style={{width:'100%', padding:'10px', background:'none', border:'1px solid #eee', borderRadius:'8px', marginTop:'20px', color:'#999'}}>ログアウト</button>
        </div>
      )}

      <nav style={styles.navBar}>
        <button onClick={() => setActiveTab('home')} style={{background:'none', border:'none', color:activeTab==='home'?'#2563eb':'#9ca3af'}}>🏠<br/><span style={{fontSize:'10px'}}>ホーム</span></button>
        <button onClick={() => setActiveTab('ranking')} style={{background:'none', border:'none', color:activeTab==='ranking'?'#2563eb':'#9ca3af'}}>👑<br/><span style={{fontSize:'10px'}}>ランク</span></button>
        <button onClick={() => { if(!session) handleGoogleLogin(); else setActiveTab('mypage') }} style={{background:'none', border:'none', color:activeTab==='mypage'?'#2563eb':'#9ca3af'}}>👤<br/><span style={{fontSize:'10px'}}>マイページ</span></button>
      </nav>
    </div>
  )
}
