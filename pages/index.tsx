import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useRouter } from 'next/router' // URL操作用

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function Home() {
  const router = useRouter() // URL情報を取得
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

  const categories = ['すべて', 'こども', '経済・政治', 'エンタメ', 'スポーツ', 'ライフ', 'その他']

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

  // URLに ?id=123 があったら、自動でそのマーケットを開く
  useEffect(() => {
    if (!router.isReady || markets.length === 0) return
    const { id } = router.query
    if (id) {
      const marketId = Number(id)
      const target = markets.find(m => m.id === marketId)
      if (target) {
        setSelectedMarketId(marketId)
        // 必要ならカテゴリも切り替える
        if (target.category) setActiveCategory(target.category)
      }
    }
  }, [router.isReady, router.query, markets])

  async function initUserData(userId: string) {
    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (profileData) setProfile(profileData)

    const { data: betsData } = await supabase
      .from('bets')
      .select('*, markets(title), market_options(name)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
    if (betsData) setMyBets(betsData)
  }

  async function fetchMarkets() {
    const { data } = await supabase
      .from('markets')
      .select('*, market_options(*)')
      // ★ここを変更: 締切が近い順 (昇順) に並べる
      .order('end_date', { ascending: true })

    if (data) {
      const sorted = data.map((m: any) => ({
        ...m,
        market_options: m.market_options.sort((a: any, b: any) => a.id - b.id)
      }))
      setMarkets(sorted)
    }
  }

  async function fetchRanking() {
    const { data } = await supabase.from('profiles').select('*').order('point_balance', { ascending: false }).limit(20)
    if (data) setRanking(data)
  }

  const handleLogin = async () => {
    await supabase.auth.signInAnonymously()
    window.location.reload()
  }

  // マーケットを選択した時、URLも書き換える（シェア用）
  const openMarket = (marketId: number) => {
    if (!session) return handleLogin()
    setSelectedMarketId(marketId)
    // URLを書き換え (履歴に残さない shallow routing)
    router.push(`/?id=${marketId}`, undefined, { shallow: true })
  }

  // 閉じる時、URLを元に戻す
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
      // 投票後は閉じずに、シェアを促すUIにするのもアリだが一旦閉じて更新
      closeMarket()
      fetchMarkets()
      initUserData(session.user.id)
      fetchRanking()
    }
  }

  // Xでシェアする機能
  const shareOnX = (market: any) => {
    const url = `${window.location.origin}/?id=${market.id}`
    const text = `💰予測市場「Polymarket JP」に参加中！\n\nQ. ${market.title}\n\nあなたも予想しよう！ #PolymarketJP`
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

  // --- スタイル設定 ---
  const styles = {
    container: { maxWidth: '600px', margin: '0 auto', padding: '20px 15px 100px', minHeight: '100vh', fontFamily: 'sans-serif', color: '#1f2937' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', padding: '10px 0' },
    logo: { fontSize: '20px', fontWeight: '900', background: 'linear-gradient(to right, #2563eb, #9333ea)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },

    categoryScroll: { display: 'flex', gap: '10px', overflowX: 'auto' as const, paddingBottom: '10px', marginBottom: '20px', scrollbarWidth: 'none' as const },
    categoryBtn: (isActive: boolean) => ({
      padding: '8px 16px',
      borderRadius: '20px',
      border: isActive ? 'none' : '1px solid #e5e7eb',
      background: isActive ? '#1f2937' : 'white',
      color: isActive ? 'white' : '#4b5563',
      fontSize: '13px',
      fontWeight: 'bold' as const,
      whiteSpace: 'nowrap' as const,
      cursor: 'pointer',
      boxShadow: isActive ? '0 4px 6px -1px rgba(0,0,0,0.1)' : 'none'
    }),

    card: { background: 'white', borderRadius: '16px', padding: '20px', marginBottom: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' },
    barRow: { marginBottom: '12px' },
    barLabelArea: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px', fontWeight: 'bold' },
    barTrack: { height: '12px', background: '#f3f4f6', borderRadius: '6px', overflow: 'hidden' },
    barFill: (percent: number, idx: number) => ({ height: '100%', width: `${percent}%`, background: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'][idx % 5], transition: 'width 0.5s' }),
    voteButton: { width: '100%', padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', marginTop: '15px' },
    shareButton: { width: '100%', padding: '10px', background: 'black', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', marginTop: '10px', fontSize: '13px' },
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

      {filteredMarkets.length === 0 && (
        <div style={{textAlign:'center', padding:'40px', color:'#9ca3af', fontSize:'14px'}}>
          まだこのジャンルの質問はありません
        </div>
      )}

      {filteredMarkets.map((market) => {
        const isActive = isMarketActive(market)
        return (
          <div key={market.id} style={styles.card}>
            {market.image_url && <img src={market.image_url} style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '10px', marginBottom: '12px' }} />}

            <div style={{display:'flex', justifyContent:'space-between', marginBottom:'8px'}}>
               <span style={{fontSize:'10px', background:'#f3f4f6', padding:'2px 8px', borderRadius:'4px', color:'#666'}}>{market.category || 'その他'}</span>
            </div>

            <h2 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '8px' }}>{market.title}</h2>
            <div style={{ fontSize: '12px', color: '#6b7280', marginBottom: '15px', display:'flex', gap:'10px' }}>
              <span>💰 総額: {market.total_pool.toLocaleString()}pt</span>
              <span style={{ color: isActive ? '#059669' : '#dc2626', fontWeight:'bold' }}>
                {market.is_resolved ? '🏁 結果確定' : (isActive ? `⏰ 締切: ${new Date(market.end_date).toLocaleDateString()}` : '🚫 受付終了')}
              </span>
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

            {/* 投票エリア */}
            {isActive ? (
              selectedMarketId === market.id ? (
                <div style={{ background: '#f9fafb', padding: '15px', borderRadius: '10px', marginTop: '15px', border:'1px solid #e5e7eb' }}>
                  <div style={{fontWeight:'bold', marginBottom:'10px', fontSize:'14px'}}>選択肢を選ぶ:</div>
                  <div style={{display:'flex', flexWrap:'wrap', gap:'8px', marginBottom:'15px'}}>
                    {market.market_options.map((opt: any) => (
                      <button key={opt.id} onClick={() => setSelectedOptionId(opt.id)} style={{ padding: '8px 12px', borderRadius: '20px', border: selectedOptionId === opt.id ? '2px solid #2563eb' : '1px solid #d1d5db', background: selectedOptionId === opt.id ? '#eff6ff' : 'white', fontSize:'13px', fontWeight:'bold' }}>
                        {opt.name}
                      </button>
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
                <div style={{display:'flex', gap:'10px'}}>
                  <button onClick={() => openMarket(market.id)} style={{...styles.voteButton, marginTop:'15px', flex:2}}>⚡️ 投票する</button>
                  <button onClick={() => shareOnX(market)} style={{...styles.shareButton, marginTop:'15px', background:'black', flex:1}}>𝕏 シェア</button>
                </div>
              )
            ) : (
              <button disabled style={styles.disabledButton}>🚫 受付終了</button>
            )}
          </div>
        )
      })}
    </div>
  )

  const renderRanking = () => (
    <div style={styles.card}>
      <h3 style={{textAlign:'center', fontWeight:'900', marginBottom:'20px', fontSize:'18px'}}>🏆 投資家ランキング</h3>
      {ranking.map((user, idx) => (
        <div key={user.id} style={{ display: 'flex', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid #f3f4f6' }}>
          <div style={{ width: '30px', textAlign: 'center', fontWeight: 'bold', color: idx < 3 ? '#d97706' : '#9ca3af' }}>{idx + 1}</div>
          <div style={{ flex: 1, fontSize: '14px', fontWeight: user.id === session?.user?.id ? 'bold' : 'normal' }}>
            {user.id === session?.user?.id ? 'あなた' : `名無しさん ${user.id.slice(0,4)}`}
          </div>
          <div style={{ fontWeight: 'bold', color: '#2563eb' }}>{user.point_balance.toLocaleString()} pt</div>
        </div>
      ))}
    </div>
  )

  const renderMyPage = () => (
    <div>
      <div style={{...styles.card, background:'linear-gradient(135deg, #2563eb, #1e40af)', color:'white', textAlign:'center'}}>
        <div style={{fontSize:'14px', opacity:0.8}}>総資産ポイント</div>
        <div style={{fontSize:'32px', fontWeight:'900'}}>{profile?.point_balance.toLocaleString()} pt</div>
      </div>
      <h3 style={{fontWeight:'bold', marginLeft:'5px', marginBottom:'10px'}}>📜 投票履歴</h3>
      {myBets.length === 0 && <div style={{textAlign:'center', color:'#9ca3af', marginTop:'20px'}}>まだ投票履歴がありません</div>}
      {myBets.map((bet) => (
        <div key={bet.id} style={{...styles.card, padding:'15px', marginBottom:'10px'}}>
          <div style={{fontSize:'12px', color:'#6b7280', marginBottom:'5px'}}>{bet.markets?.title}</div>
          <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
            <div style={{fontWeight:'bold', fontSize:'15px'}}>
              「{bet.market_options?.name}」に {bet.amount}pt
            </div>
            <div style={{fontSize:'12px', padding:'2px 8px', borderRadius:'10px', background:'#f3f4f6', color:'#6b7280'}}>
               結果待ち
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  if (isLoading) return <div style={{display:'flex', justifyContent:'center', paddingTop:'50px'}}>読み込み中...</div>

  return (
    <div style={styles.container as any}>
      <header style={styles.header}>
        <div style={styles.logo}>🇯🇵 Polymarket JP</div>
        {profile ? <div style={{fontWeight:'bold', fontSize:'14px'}}>💎 {profile.point_balance.toLocaleString()}</div> : <button onClick={handleLogin}>ログイン</button>}
      </header>

      {activeTab === 'home' && renderHome()}
      {activeTab === 'ranking' && renderRanking()}
      {activeTab === 'mypage' && renderMyPage()}

      <div style={{ textAlign: 'center', paddingBottom: '80px', fontSize: '12px', color: '#ccc' }}>
        <Link href="/admin" style={{ textDecoration: 'none', color: '#e5e7eb' }}>Admin Login</Link>
      </div>

      <nav style={styles.navBar}>
        <button onClick={() => setActiveTab('home')} style={styles.navBtn(activeTab === 'home')}><span style={{fontSize:'20px'}}>🏠</span>ホーム</button>
        <button onClick={() => setActiveTab('ranking')} style={styles.navBtn(activeTab === 'ranking')}><span style={{fontSize:'20px'}}>👑</span>ランキング</button>
        <button onClick={() => { if(!session) handleLogin(); setActiveTab('mypage') }} style={styles.navBtn(activeTab === 'mypage')}><span style={{fontSize:'20px'}}>👤</span>マイページ</button>
      </nav>
    </div>
  )
}
