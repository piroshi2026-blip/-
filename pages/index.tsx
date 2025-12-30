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

  const [voteAmount, setVoteAmount] = useState(100)
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // 名前変更用のステート
  const [editName, setEditName] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)

  // メールログイン用のステート
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)

  const categories = ['すべて', 'こども', '経済・政治', 'エンタメ', 'スポーツ', 'ライフ', 'その他']

  const categoryMeta: any = {
    'こども': { icon: '🎒', color: '#f43f5e' },
    '経済・政治': { icon: '🏛️', color: '#3b82f6' },
    'エンタメ': { icon: '🎤', color: '#a855f7' },
    'スポーツ': { icon: '⚽️', color: '#22c55e' },
    'ライフ': { icon: '🌅', color: '#f59e0b' },
    'その他': { icon: '🎲', color: '#6b7280' },
  }

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)
      if (session) await initUserData(session.user.id)
      await fetchMarkets()
      await fetchRanking()
      setIsLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!router.isReady || markets.length === 0) return
    const { id } = router.query
    if (id) {
      const marketId = Number(id)
      const target = markets.find(m => m.id === marketId)
      if (target) {
        setSelectedMarketId(marketId)
        if (target.category) setActiveCategory(target.category)
      }
    }
  }, [router.isReady, router.query, markets])

  async function initUserData(userId: string) {
    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (profileData) {
        setProfile(profileData)
        setEditName(profileData.username || '名無しさん') // 初期値をセット
    }

    const { data: betsData } = await supabase
      .from('bets')
      .select('*, markets(title), market_options(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (betsData) setMyBets(betsData)
  }

  async function fetchMarkets() {
    const { data } = await supabase.from('markets').select('*, market_options(*)').order('end_date', { ascending: true })
    if (data) {
      const sorted = data.map((m: any) => ({
        ...m,
        market_options: m.market_options.sort((a: any, b: any) => a.id - b.id)
      }))
      setMarkets(sorted)
    }
  }
  
// fetchRanking を以下に差し替え
  async function fetchRanking() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_hidden_from_ranking', false) // ★ここ：非表示フラグが立っていない人だけ
      .order('point_balance', { ascending: false })
      .limit(20)
    if (data) setRanking(data)
  }

  // カテゴリ取得を動的にする
  const [categories, setCategories] = useState<any[]>([])
  const [categoryMeta, setCategoryMeta] = useState<any>({})

  async function fetchCategories() {
    const { data } = await supabase.from('categories').select('*').order('id', { ascending: true })
    if (data) {
      const list = ['すべて', ...data.map((c:any) => c.name)]
      setCategories(list)
      const meta: any = {}
      data.forEach((c:any) => {
          meta[c.name] = { icon: c.icon || '🎲', color: '#6b7280' } // アイコンをDBから反映
      })
      setCategoryMeta(meta)
    }
  }

  const handleUpdateName = async () => {
      if (!profile || !editName) return
      try {
          const { error } = await supabase.from('profiles').update({ username: editName }).eq('id', profile.id)
          if (error) throw error
          alert('名前を変更しました！')
          setIsEditingName(false)
          initUserData(profile.id) // プロフィール再取得
          fetchRanking() // ランキングにも反映
      } catch (e: any) {
          alert('エラー: ' + e.message)
      }
  }

  // --- ログイン関連 ---
  const handleGoogleLogin = async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin },
    })
    if (error) alert(error.message)
  }

  const handleEmailAuth = async () => {
    if (!email || !password) return alert('入力してください')
    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({ email, password })
        if (error) throw error
        alert('確認メールを送信しました！')
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) throw error
        window.location.reload()
      }
    } catch (e: any) { alert(e.message) }
  }

  const handleAnonLogin = async () => {
    await supabase.auth.signInAnonymously()
    window.location.reload()
  }

  const openMarket = (marketId: number) => {
    if (!session) return handleGoogleLogin()
    setSelectedMarketId(marketId)
    router.push(`/?id=${marketId}`, undefined, { shallow: true })
  }

  const closeMarket = () => {
    setSelectedMarketId(null)
    setSelectedOptionId(null)
    router.push('/', undefined, { shallow: true })
  }

  const handleVote = async () => {
    if (!session) return alert('ログインしてください')
    if (!selectedMarketId || !selectedOptionId) return
    if (voteAmount > (profile?.point_balance || 0)) return alert('ポイント不足です')

    const { error } = await supabase.rpc('place_bet', {
      market_id_input: selectedMarketId,
      option_id_input: selectedOptionId,
      amount_input: voteAmount
    })

    if (error) alert(error.message)
    else {
      alert('投票しました！')
      closeMarket()
      fetchMarkets()
      initUserData(session.user.id)
      fetchRanking()
    }
  }

  const shareOnX = (market: any) => {
    const url = `${window.location.origin}/?id=${market.id}`
    const text = `💰予測市場「YOSOL」に参加中！\n\nQ. ${market.title}\n\nあなたも予想しよう！ #YOSOL`
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
    window.open(twitterUrl, '_blank')
  }

  const getOdds = (marketTotal: number, optionPool: number) => {
    if (optionPool === 0) return 0
    return (marketTotal / optionPool)
  }

  const getPercent = (marketTotal: number, optionPool: number) => {
    if (marketTotal === 0) return 0
    return Math.round((optionPool / marketTotal) * 100)
  }

  const isMarketActive = (market: any) => {
    if (market.is_resolved) return false
    if (new Date(market.end_date) < new Date()) return false
    return true
  }

  const filteredMarkets = markets.filter(m => {
    if (activeCategory === 'すべて') return true
    if (activeCategory === 'その他' && !m.category) return true
    return m.category === activeCategory
  })

  // --- スタイル ---
  const styles = {
    container: { maxWidth: '600px', margin: '0 auto', padding: '20px 15px 100px', minHeight: '100vh', fontFamily: 'sans-serif', color: '#1f2937' },
    headerContainer: { padding: '20px 0 10px', textAlign: 'center' as const },
    appTitle: { fontSize: '28px', fontWeight: '900', background: 'linear-gradient(to right, #2563eb, #9333ea)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0, letterSpacing: '-1px' },
    appDesc: { fontSize: '12px', color: '#6b7280', marginTop: '5px', fontWeight: 'bold' },
    pointBadge: { display: 'inline-block', marginTop: '8px', padding: '4px 12px', background: '#eff6ff', color: '#2563eb', borderRadius: '20px', fontSize: '14px', fontWeight: 'bold' },

    googleButton: { marginTop: '10px', padding: '10px 20px', background: 'white', color: '#333', border: '1px solid #ccc', borderRadius: '30px', fontSize: '14px', fontWeight: 'bold', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', cursor: 'pointer', width: 'fit-content', margin: '10px auto', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' },
    mailButton: { marginTop: '5px', padding: '8px 16px', background: '#f3f4f6', color: '#555', border: 'none', borderRadius: '30px', fontSize: '12px', fontWeight: 'bold', cursor: 'pointer', width: 'fit-content', margin: '5px auto' },
    inputField: { padding: '10px', border: '1px solid #ccc', borderRadius: '5px', width: '250px', marginBottom: '10px', fontSize: '14px' },

    categoryScroll: { display: 'flex', gap: '10px', overflowX: 'auto' as const, paddingBottom: '10px', marginBottom: '20px', scrollbarWidth: 'none' as const },
    categoryBtn: (isActive: boolean) => ({
      padding: '8px 16px', borderRadius: '20px', border: isActive ? 'none' : '1px solid #e5e7eb', background: isActive ? '#1f2937' : 'white', color: isActive ? 'white' : '#4b5563', fontSize: '13px', fontWeight: 'bold' as const, whiteSpace: 'nowrap' as const, cursor: 'pointer', boxShadow: isActive ? '0 4px 6px -1px rgba(0,0,0,0.1)' : 'none'
    }),

    card: { background: 'white', borderRadius: '16px', padding: '0', marginBottom: '25px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)', overflow: 'hidden', position: 'relative' as const, border: '1px solid #f3f4f6' },
    imageArea: { position: 'relative' as const, height: '180px', width: '100%' },
    cardImage: { width: '100%', height: '100%', objectFit: 'cover' as const },
    imageOverlay: { position: 'absolute' as const, bottom: 0, left: 0, right: 0, height: '80%', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)', display: 'flex', flexDirection: 'column' as const, justifyContent: 'flex-end', padding: '15px' },
    watermark: (cat: string) => ({ position: 'absolute' as const, top: '-10px', right: '-10px', fontSize: '80px', opacity: 0.1, pointerEvents: 'none' as const, transform: 'rotate(15deg)', zIndex: 0 }),
    contentArea: { padding: '15px 20px 20px', position: 'relative' as const, zIndex: 1 },
    descBox: { fontSize: '11px', color: '#4b5563', background: '#f9fafb', padding: '12px', borderRadius: '8px', marginTop: '10px', marginBottom: '15px', lineHeight: '1.6', border: '1px solid #f3f4f6', whiteSpace: 'pre-wrap' as const },
    barRow: { marginBottom: '12px' },
    barLabelArea: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px', fontWeight: 'bold' },
    barTrack: { height: '12px', background: '#f3f4f6', borderRadius: '6px', overflow: 'hidden' },
    barFill: (percent: number, idx: number) => ({ height: '100%', width: `${percent}%`, background: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'][idx % 5], transition: 'width 0.5s' }),
    voteButton: { width: '100%', padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '14px' },
    shareButton: { width: '100%', padding: '12px', background: 'black', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', fontSize: '13px' },
    disabledButton: { width: '100%', padding: '12px', background: '#e5e7eb', color: '#9ca3af', border: 'none', borderRadius: '10px', fontWeight: 'bold', marginTop: '15px' },
    navBar: { position: 'fixed' as const, bottom: 0, left: 0, right: 0, background: 'rgba(255,255,255,0.95)', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-around', padding: '12px', zIndex: 100 },
    navBtn: (isActive: boolean) => ({ background: 'none', border: 'none', color: isActive ? '#2563eb' : '#9ca3af', fontWeight: isActive ? 'bold' : 'normal', fontSize: '10px', display: 'flex', flexDirection: 'column' as const, alignItems: 'center' }),
  }

  const renderHome = () => (
    <div>
      <div style={styles.categoryScroll}>
        {categories.map(cat => (
          <button key={cat} onClick={() => { setActiveCategory(cat); router.push('/', undefined, { shallow: true }) }} style={styles.categoryBtn(activeCategory === cat)}>
            {cat}
          </button>
        ))}
      </div>

      {filteredMarkets.length === 0 && <div style={{textAlign:'center', padding:'40px', color:'#9ca3af', fontSize:'14px'}}>まだこのジャンルの質問はありません</div>}

      {filteredMarkets.map((market) => {
        const isActive = isMarketActive(market)
        const catInfo = categoryMeta[market.category] || categoryMeta['その他']
        return (
          <div key={market.id} style={styles.card}>
            <div style={styles.watermark(market.category)}>{catInfo.icon}</div>
            <div style={styles.imageArea}>
                {market.image_url ? 
                  <img src={market.image_url} style={styles.cardImage} /> : 
                  <div style={{width:'100%', height:'100%', background:'#eee', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'40px'}}>{catInfo.icon}</div>
                }
                <div style={styles.imageOverlay}>
                    <div style={{display:'flex', gap:'5px', marginBottom:'5px'}}>
                        <span style={{fontSize:'10px', background: catInfo.color, color:'white', padding:'2px 8px', borderRadius:'4px', fontWeight:'bold'}}>{market.category || 'その他'}</span>
                        <span style={{fontSize:'10px', background: isActive ? 'rgba(255,255,255,0.9)' : '#ef4444', color: isActive ? '#059669' : 'white', padding:'2px 8px', borderRadius:'4px', fontWeight:'bold'}}>
                             {market.is_resolved ? '結果確定' : (isActive ? `あと ${Math.ceil((new Date(market.end_date).getTime() - new Date().getTime())/(1000*60*60*24))}日` : '受付終了')}
                        </span>
                    </div>
                    <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: 'white', margin: 0, lineHeight: '1.3', textShadow:'0 2px 4px rgba(0,0,0,0.5)' }}>{market.title}</h2>
                </div>
            </div>
            <div style={styles.contentArea}>
                {market.description && <div style={styles.descBox} dangerouslySetInnerHTML={{ __html: market.description.replace(/\\n/g, '<br />') }} />}
                <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '15px', fontWeight:'bold' }}>
                  💰 投票総額: <span style={{fontSize:'14px', color:'#1f2937'}}>{market.total_pool.toLocaleString()} pt</span>
                </div>
                <div>
                  {market.market_options.map((opt: any, idx: number) => {
                    const percent = getPercent(market.total_pool, opt.pool)
                    const odds = getOdds(market.total_pool, opt.pool)
                    const isWinner = market.result_option_id === opt.id
                    return (
                      <div key={opt.id} style={styles.barRow}>
                        <div style={styles.barLabelArea}>
                          <span>{isWinner ? '👑 ' : ''}{opt.name}</span>
                          <span>{odds ? `${odds.toFixed(1)}倍` : '--倍'} ({percent}%)</span>
                        </div>
                        <div style={styles.barTrack}>
                          <div style={styles.barFill(percent, idx) as any} />
                        </div>
                      </div>
                    )
                  })}
                </div>
                {isActive ? (
                  selectedMarketId === market.id ? (
                    <div style={{ background: '#f9fafb', padding: '15px', borderRadius: '10px', marginTop: '15px', border:'1px solid #e5e7eb' }}>
                      <div style={{fontWeight:'bold', marginBottom:'10px', fontSize:'14px'}}>選択肢を選ぶ:</div>
                      <div style={{display:'flex', flexWrap:'wrap', gap:'8px', marginBottom:'15px'}}>
                        {market.market_options.map((opt: any) => (
                          <button key={opt.id} onClick={() => setSelectedOptionId(opt.id)} style={{ padding: '8px 12px', borderRadius: '20px', border: selectedOptionId === opt.id ? '2px solid #2563eb' : '1px solid #d1d5db', background: selectedOptionId === opt.id ? '#eff6ff' : 'white', fontSize:'13px', fontWeight:'bold' }}>{opt.name}</button>
                        ))}
                      </div>
                      <div style={{fontSize:'13px', marginBottom:'5px'}}>投票額: <strong>{voteAmount} pt</strong></div>
                      <input type="range" min="10" max={profile?.point_balance} step="10" value={voteAmount} onChange={e=>setVoteAmount(Number(e.target.value))} style={{width:'100%', marginBottom:'15px'}} />
                      <div style={{display:'flex', gap:'10px'}}>
                        <button onClick={handleVote} style={{flex:1, padding:'10px', background:'#2563eb', color:'white', border:'none', borderRadius:'8px', fontWeight:'bold'}}>投票する</button>
                        <button onClick={closeMarket} style={{flex:1, padding:'10px', background:'#e5e7eb', color:'#374151', border:'none', borderRadius:'8px'}}>やめる</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{display:'flex', gap:'10px', marginTop:'15px'}}>
                      <button onClick={() => openMarket(market.id)} style={{...styles.voteButton, flex:2}}>⚡️ 投票する</button>
                      <button onClick={() => shareOnX(market)} style={{...styles.shareButton, flex:1}}>𝕏 シェア</button>
                    </div>
                  )
                ) : <button disabled style={styles.disabledButton}>🚫 受付終了</button>}
            </div>
          </div>
        )
      })}
    </div>
  )

  const renderRanking = () => (
    <div style={{...styles.card, padding:'20px'}}>
      <h3 style={{textAlign:'center', fontWeight:'900', marginBottom:'20px', fontSize:'18px'}}>🏆 投資家ランキング</h3>
      {ranking.map((user, idx) => (
        <div key={user.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ width: '30px', textAlign: 'center', fontWeight: 'bold', color: idx < 3 ? '#d97706' : '#9ca3af' }}>{idx + 1}</div>
          <div style={{ flex: 1, fontSize: '14px', fontWeight: user.id === session?.user?.id ? 'bold' : 'normal' }}>
            {/* ★ 名前表示を修正 */}
            {user.id === session?.user?.id ? `${user.username || 'あなた'} (自分)` : (user.username || `名無しさん ${user.id.slice(0,4)}`)}
          </div>
          <div style={{ fontWeight: 'bold', color: '#2563eb' }}>{user.point_balance.toLocaleString()} pt</div>
        </div>
      ))}
    </div>
  )

  const renderMyPage = () => (
    <div>
      <div style={{...styles.card, padding:'20px', background:'linear-gradient(135deg, #2563eb, #1e40af)', color:'white', textAlign:'center'}}>
        <div style={{fontSize:'14px', opacity:0.8}}>総資産ポイント</div>
        <div style={{fontSize:'32px', fontWeight:'900'}}>{profile?.point_balance.toLocaleString()} pt</div>

        {/* ★ 名前変更エリア */}
        <div style={{marginTop:'15px', background:'rgba(255,255,255,0.2)', padding:'10px', borderRadius:'8px'}}>
            {!isEditingName ? (
                <div style={{display:'flex', justifyContent:'center', alignItems:'center', gap:'10px'}}>
                    <span style={{fontWeight:'bold'}}>{profile?.username || '名無しさん'}</span>
                    <button onClick={()=>setIsEditingName(true)} style={{fontSize:'10px', background:'white', color:'#333', border:'none', padding:'4px 8px', borderRadius:'4px', cursor:'pointer'}}>変更</button>
                </div>
            ) : (
                <div style={{display:'flex', justifyContent:'center', alignItems:'center', gap:'5px'}}>
                    <input value={editName} onChange={e=>setEditName(e.target.value)} style={{width:'120px', padding:'5px', borderRadius:'4px', border:'none', color:'black'}} />
                    <button onClick={handleUpdateName} style={{fontSize:'10px', background:'#22c55e', color:'white', border:'none', padding:'6px 8px', borderRadius:'4px', cursor:'pointer'}}>保存</button>
                    <button onClick={()=>{setIsEditingName(false); setEditName(profile?.username)}} style={{fontSize:'10px', background:'#666', color:'white', border:'none', padding:'6px 8px', borderRadius:'4px', cursor:'pointer'}}>✕</button>
                </div>
            )}
        </div>
      </div>

      <h3 style={{fontWeight:'bold', marginLeft:'5px', marginBottom:'10px'}}>📜 投票履歴</h3>
      {myBets.length === 0 && <div style={{textAlign:'center', color:'#9ca3af', marginTop:'20px'}}>まだ投票履歴がありません</div>}
      {myBets.map((bet) => (
        <div key={bet.id} style={{...styles.card, padding:'15px', marginBottom:'10px'}}>
          <div style={{fontSize:'12px', color:'#6b7280', marginBottom:'5px'}}>{bet.markets?.title}</div>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div style={{fontWeight:'bold', fontSize:'15px'}}>「{bet.market_options?.name}」に {bet.amount}pt</div>
            <div style={{fontSize:'12px', padding:'2px 8px', borderRadius:'10px', background:'#f3f4f6', color:'#6b7280'}}>結果待ち</div>
          </div>
        </div>
      ))}
    </div>
  )

  if (isLoading) return <div style={{display:'flex', justifyContent:'center', paddingTop:'50px'}}>読み込み中...</div>

  return (
    <div style={styles.container as any}>
      <div style={styles.headerContainer}>
        <h1 style={styles.appTitle}>YOSOL</h1>
        <p style={styles.appDesc}>未来をヨソル、ポイントで遊ぶ予測市場</p>
        <div>
           {profile ? (
             <span style={styles.pointBadge}>💎 {profile.point_balance.toLocaleString()} pt</span> 
           ) : (
             <div style={{display:'flex', flexDirection:'column', alignItems:'center'}}>
               {!showEmailForm ? (
                   <>
                     <button onClick={handleGoogleLogin} style={styles.googleButton}><img src="https://www.google.com/favicon.ico" width="16" /> Googleでログイン</button>
                     <button onClick={()=>setShowEmailForm(true)} style={styles.mailButton}>📧 メールアドレスでログイン</button>
                     <button onClick={handleAnonLogin} style={{background:'none', border:'none', fontSize:'11px', color:'#9ca3af', marginTop:'5px', textDecoration:'underline'}}>アカウントなしで試す</button>
                   </>
               ) : (
                   <div style={{marginTop:'10px', padding:'15px', background:'white', borderRadius:'10px', boxShadow:'0 2px 5px rgba(0,0,0,0.1)'}}>
                       <div style={{fontSize:'12px', marginBottom:'5px'}}>メールアドレス</div>
                       <input type="email" value={email} onChange={e=>setEmail(e.target.value)} style={styles.inputField} />
                       <div style={{fontSize:'12px', marginBottom:'5px'}}>パスワード</div>
                       <input type="password" value={password} onChange={e=>setPassword(e.target.value)} style={styles.inputField} />
                       <button onClick={handleEmailAuth} style={{...styles.voteButton, width:'100%', marginTop:'5px'}}>{isSignUp ? '登録してログイン' : 'ログイン'}</button>
                       <div style={{fontSize:'11px', marginTop:'10px', color:'#666'}}>{isSignUp ? 'すでにアカウントをお持ちですか？' : 'アカウントをお持ちでないですか？'} <span onClick={()=>setIsSignUp(!isSignUp)} style={{color:'blue', cursor:'pointer', marginLeft:'5px'}}>{isSignUp ? 'ログインへ' : '新規登録へ'}</span></div>
                       <button onClick={()=>setShowEmailForm(false)} style={{marginTop:'10px', background:'none', border:'none', fontSize:'11px', color:'#999'}}>キャンセル</button>
                   </div>
               )}
             </div>
           )}
        </div>
      </div>

      {activeTab === 'home' && renderHome()}
      {activeTab === 'ranking' && renderRanking()}
      {activeTab === 'mypage' && renderMyPage()}

      <div style={{ textAlign: 'center', paddingBottom: '80px', fontSize: '12px', color: '#ccc' }}>
        <Link href="/admin" style={{ textDecoration: 'none', color: '#e5e7eb' }}>Admin Login</Link>
      </div>

      <nav style={styles.navBar}>
        <button onClick={() => setActiveTab('home')} style={styles.navBtn(activeTab === 'home')}><span style={{fontSize:'20px'}}>🏠</span>ホーム</button>
        <button onClick={() => setActiveTab('ranking')} style={styles.navBtn(activeTab === 'ranking')}><span style={{fontSize:'20px'}}>👑</span>ランキング</button>
        <button onClick={() => { if(!session) handleGoogleLogin(); setActiveTab('mypage') }} style={styles.navBtn(activeTab === 'mypage')}><span style={{fontSize:'20px'}}>👤</span>マイページ</button>
      </nav>
    </div>
  )
}
