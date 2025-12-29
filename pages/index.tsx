import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function Home() {
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [markets, setMarkets] = useState<any[]>([])
  const [ranking, setRanking] = useState<any[]>([])
  const [myBets, setMyBets] = useState<any[]>([])
  const [activeTab, setActiveTab] = useState<'home' | 'ranking' | 'mypage'>('home')

  const [voteAmount, setVoteAmount] = useState(100)
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

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
      .order('created_at', { ascending: false })

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
      setSelectedMarketId(null)
      fetchMarkets()
      initUserData(session.user.id)
      fetchRanking()
    }
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

  // --- スタイル設定 (エラー対策済み決定版) ---
  const styles = {
    container: { maxWidth: '600px', margin: '0 auto', padding: '20px 15px 100px', minHeight: '100vh', fontFamily: 'sans-serif', color: '#1f2937' },
    header: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', padding: '10px 0' },
    logo: { fontSize: '20px', fontWeight: '900', background: 'linear-gradient(to right, #2563eb, #9333ea)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    card: { background: 'white', borderRadius: '16px', padding: '20px', marginBottom: '20px', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)' },
    barRow: { marginBottom: '12px' },
    barLabelArea: { display: 'flex', justifyContent: 'space-between', fontSize: '13px', marginBottom: '4px', fontWeight: 'bold' },
    barTrack: { height: '12px', background: '#f3f4f6', borderRadius: '6px', overflow: 'hidden' },
    // ↓ 関数も型定義なしでそのまま書く
    barFill: (percent: number, idx: number) => ({ 
      height: '100%', 
      width: `${percent}%`, 
      background: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b', '#8b5cf6'][idx % 5], 
      transition: 'width 0.5s' 
    }),
    voteButton: { width: '100%', padding: '12px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '10px', fontWeight: 'bold', marginTop: '15px' },
    disabledButton: { width: '100%', padding: '12px', background: '#e5e7eb', color: '#9ca3af', border: 'none', borderRadius: '10px', fontWeight: 'bold', marginTop: '15px' },
    navBar: { 
      position: 'fixed' as const, // as const で固定
      bottom: 0, left: 0, right: 0, 
      background: 'rgba(255,255,255,0.95)', 
      borderTop: '1px solid #eee', 
      display: 'flex', 
      justifyContent: 'space-around', 
      padding: '12px', 
      zIndex: 100 
    },
    navBtn: (isActive: boolean) => ({ 
      background: 'none', 
      border: 'none', 
      color: isActive ? '#2563eb' : '#9ca3af', 
      fontWeight: isActive ? 'bold' : 'normal', 
      fontSize: '10px', 
      display: 'flex', 
      flexDirection: 'column' as const, // as const で固定
      alignItems: 'center' 
    }),
  }

  const renderHome = () => (
    <div>
      {markets.map((market) => {
        const isActive = isMarketActive(market)
        return (
          <div key={market.id} style={styles.card as any}>
            {market.image_url && <img src={market.image_url} style={{ width: '100%', height: '140px', objectFit: 'cover', borderRadius: '10px', marginBottom: '12px' }} />}
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
                  <div key={opt.id} style={styles.barRow as any}>
                    <div style={styles.barLabelArea as any}>
                      <span>{isWinner ? '👑 ' : ''}{opt.name}</span>
                      <span>{odds ? `${odds.toFixed(1)}倍` : '--倍'} ({percent}%)</span>
                    </div>
                    <div style={styles.barTrack as any}>
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
                      <button key={opt.id} onClick={() => setSelectedOptionId(opt.id)} style={{ padding: '8px 12px', borderRadius: '20px', border: selectedOptionId === opt.id ? '2px solid #2563eb' : '1px solid #d1d5db', background: selectedOptionId === opt.id ? '#eff6ff' : 'white', fontSize:'13px', fontWeight:'bold' }}>
                        {opt.name}
                      </button>
                    ))}
                  </div>
                  <div style={{fontSize:'13px', marginBottom:'5px'}}>投票額: <strong>{voteAmount} pt</strong></div>
                  <input type="range" min="10" max={profile?.point_balance} step="10" value={voteAmount} onChange={e=>setVoteAmount(Number(e.target.value))} style={{width:'100%', marginBottom:'15px'}} />
                  <div style={{display:'flex', gap:'10px'}}>
                    <button onClick={handleVote} style={{flex:1, padding:'10px', background:'#2563eb', color:'white', border:'none', borderRadius:'8px', fontWeight:'bold'}}>投票する</button>
                    <button onClick={()=>{setSelectedMarketId(null); setSelectedOptionId(null)}} style={{flex:1, padding:'10px', background:'#e5e7eb', color:'#374151', border:'none', borderRadius:'8px'}}>やめる</button>
                  </div>
                </div>
              ) : (
                <button onClick={() => { if(!session) return handleLogin(); setSelectedMarketId(market.id) }} style={styles.voteButton as any}>⚡️ 投票する</button>
              )
            ) : (
              <button disabled style={styles.disabledButton as any}>🚫 受付終了</button>
            )}
          </div>
        )
      })}
    </div>
  )

  const renderRanking = () => (
    <div style={styles.card as any}>
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
      <div style={{...(styles.card as any), background:'linear-gradient(135deg, #2563eb, #1e40af)', color:'white', textAlign:'center'}}>
        <div style={{fontSize:'14px', opacity:0.8}}>総資産ポイント</div>
        <div style={{fontSize:'32px', fontWeight:'900'}}>{profile?.point_balance.toLocaleString()} pt</div>
      </div>
      <h3 style={{fontWeight:'bold', marginLeft:'5px', marginBottom:'10px'}}>📜 投票履歴</h3>
      {myBets.length === 0 && <div style={{textAlign:'center', color:'#9ca3af', marginTop:'20px'}}>まだ投票履歴がありません</div>}
      {myBets.map((bet) => (
        <div key={bet.id} style={{...(styles.card as any), padding:'15px', marginBottom:'10px'}}>
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
      <header style={styles.header as any}>
        <div style={styles.logo as any}>🇯🇵 Polymarket JP</div>
        {profile ? <div style={{fontWeight:'bold', fontSize:'14px'}}>💎 {profile.point_balance.toLocaleString()}</div> : <button onClick={handleLogin}>ログイン</button>}
      </header>

      {activeTab === 'home' && renderHome()}
      {activeTab === 'ranking' && renderRanking()}
      {activeTab === 'mypage' && renderMyPage()}

      <nav style={styles.navBar as any}>
        <button onClick={() => setActiveTab('home')} style={styles.navBtn(activeTab === 'home') as any}><span style={{fontSize:'20px'}}>🏠</span>ホーム</button>
        <button onClick={() => setActiveTab('ranking')} style={styles.navBtn(activeTab === 'ranking') as any}><span style={{fontSize:'20px'}}>👑</span>ランキング</button>
        <button onClick={() => { if(!session) handleLogin(); setActiveTab('mypage') }} style={styles.navBtn(activeTab === 'mypage') as any}><span style={{fontSize:'20px'}}>👤</span>マイページ</button>
      </nav>
    </div>
  )
}
