import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useRouter } from 'next/router'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  }
)

export default function Home() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'home' | 'ranking' | 'mypage' | 'info'>('home')
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [markets, setMarkets] = useState<any[]>([])
  const [ranking, setRanking] = useState<any[]>([])
  const [myBets, setMyBets] = useState<any[]>([])
  const [voteAmount, setVoteAmount] = useState(100)
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const init = async () => {
      const { data: { session: s } } = await supabase.auth.getSession()
      setSession(s)
      if (s) initUserData(s.user.id)
      fetchMarkets()
      fetchRanking()
      setIsLoading(false)
    }
    init()
  }, [])

  async function initUserData(userId: string) {
    const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (p) setProfile(p)
    const { data: b } = await supabase.from('bets').select('*, markets(title, is_resolved, result_option_id), market_options(name)').eq('user_id', userId).order('created_at', { ascending: false })
    if (b) setMyBets(b)
  }

  async function fetchMarkets() {
    const { data } = await supabase.from('markets').select('*, market_options(*)').order('end_date', { ascending: true })
    if (data) setMarkets(data)
  }

  async function fetchRanking() {
    const { data } = await supabase.from('profiles').select('*').order('point_balance', { ascending: false }).limit(10)
    if (data) setRanking(data)
  }

  const handleVote = async () => {
    if (!session) return alert('ログインが必要です')
    const { error } = await supabase.rpc('place_bet', {
      market_id_input: selectedMarketId,
      option_id_input: selectedOptionId,
      amount_input: voteAmount
    })
    if (error) alert(error.message)
    else {
      alert('ヨソりました！')
      setSelectedMarketId(null)
      fetchMarkets()
      initUserData(session.user.id)
    }
  }

  // --- スタイル (余白を削減) ---
  const s = {
    card: { background: 'white', borderRadius: '12px', marginBottom: '16px', overflow: 'hidden', border: '1px solid #eee', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' },
    descBox: { fontSize: '12px', color: '#666', background: '#f9f9f9', padding: '8px 12px', borderRadius: '6px', margin: '8px 0', lineHeight: '1.4' },
    nav: { position: 'fixed' as const, bottom: 0, left: 0, right: 0, background: 'white', display: 'flex', justifyContent: 'space-around', padding: '8px 0', borderTop: '1px solid #eee', zIndex: 100 },
    btn: { padding: '10px', borderRadius: '8px', border: 'none', fontWeight: 'bold' as const, cursor: 'pointer' },
    input: { padding: '8px', border: '1px solid #ddd', borderRadius: '6px', width: '70px', textAlign: 'center' as const, fontSize: '14px' }
  }

  const renderHome = () => (
    <div>
      {markets.map(m => (
        <div key={m.id} style={s.card}>
          <div style={{ padding: '12px' }}>
            <div style={{ fontSize: '10px', color: '#3b82f6', fontWeight: 'bold' }}>{m.category}</div>
            <h2 style={{ fontSize: '16px', margin: '4px 0' }}>{m.title}</h2>
            <div style={s.descBox}>{m.description}</div>
            <div style={{ fontSize: '11px', color: '#999' }}>締切: {new Date(m.end_date).toLocaleString()}</div>

            {selectedMarketId === m.id ? (
              <div style={{ marginTop: '10px', padding: '10px', border: '1px solid #eee', borderRadius: '8px' }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', marginBottom: '10px' }}>
                  {m.market_options.map((opt: any) => (
                    <button key={opt.id} onClick={() => setSelectedOptionId(opt.id)} style={{ ...s.btn, background: selectedOptionId === opt.id ? '#3b82f6' : '#f3f4f6', color: selectedOptionId === opt.id ? 'white' : 'black', fontSize: '12px' }}>{opt.name}</button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input type="range" min="10" max={profile?.point_balance || 1000} step="10" value={voteAmount} onChange={e => setVoteAmount(Number(e.target.value))} style={{ flex: 1 }} />
                  <input type="number" value={voteAmount} onChange={e => setVoteAmount(Number(e.target.value))} style={s.input} />
                  <button onClick={handleVote} style={{ ...s.btn, background: '#1f2937', color: 'white' }}>確定</button>
                </div>
              </div>
            ) : (
              <button onClick={() => setSelectedMarketId(m.id)} style={{ ...s.btn, background: '#3b82f6', color: 'white', width: '100%', marginTop: '10px' }}>ヨソる</button>
            )}
          </div>
        </div>
      ))}
    </div>
  )

  const renderInfo = () => (
    <div style={{ fontSize: '14px', lineHeight: '1.6' }}>
      <section style={{ marginBottom: '20px' }}>
        <h3 style={{ borderLeft: '4px solid #3b82f6', paddingLeft: '8px' }}>遊び方</h3>
        <p>1. 興味のある未来の問いを選びます。<br/>2. 結果を予想してポイントを「ヨソる」！<br/>3. 予想が当たると、外れた人のポイントが配分されます。</p>
      </section>
      <section style={{ marginBottom: '20px' }}>
        <h3 style={{ borderLeft: '4px solid #3b82f6', paddingLeft: '8px' }}>利用規約</h3>
        <p style={{ fontSize: '12px', color: '#666' }}>
          ・当サービス内のポイントはゲーム内通貨であり、換金は一切できません。<br/>
          ・不適切な行為と判断された場合、アカウントを停止することがあります。<br/>
          ・お問い合わせは公式𝕏までご連絡ください。
        </p>
      </section>
    </div>
  )

  const renderMyPage = () => (
    <div>
      <div style={{ background: '#1f2937', color: 'white', padding: '20px', borderRadius: '12px', textAlign: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', opacity: 0.8 }}>現在の資産</div>
        <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{profile?.point_balance?.toLocaleString()} pt</div>
      </div>
      <h3 style={{ fontSize: '16px', marginBottom: '8px' }}>履歴</h3>
      {myBets.map(b => {
        const isWin = b.markets.is_resolved && b.markets.result_option_id === b.market_option_id
        const isLost = b.markets.is_resolved && b.markets.result_option_id !== b.market_option_id
        return (
          <div key={b.id} style={{ ...s.card, padding: '10px', fontSize: '13px' }}>
            <div style={{ color: '#999', fontSize: '11px' }}>{b.markets.title}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '4px' }}>
              <span>{b.market_options.name} に {b.amount}pt</span>
              <span style={{ fontWeight: 'bold', color: isWin ? '#10b981' : isLost ? '#ef4444' : '#666' }}>
                {isWin ? '+ 配当' : isLost ? `-${b.amount}` : '判定中'}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto', padding: '10px 15px 80px' }}>
      <header style={{ textAlign: 'center', marginBottom: '15px' }}>
        <h1 style={{ fontSize: '28px', fontWeight: '900', color: '#1f2937', margin: 0 }}>ヨソる</h1>
        <p style={{ fontSize: '11px', color: '#999' }}>未来をヨソる予測市場</p>
      </header>

      {activeTab === 'home' && renderHome()}
      {activeTab === 'ranking' && (
        <div style={s.card}>{ranking.map((u, i) => (
          <div key={u.id} style={{ display: 'flex', padding: '12px', borderBottom: '1px solid #eee' }}>
            <span style={{ width: '30px', fontWeight: 'bold' }}>{i + 1}</span>
            <span style={{ flex: 1 }}>{u.username || '名無しさん'}</span>
            <span style={{ fontWeight: 'bold' }}>{u.point_balance.toLocaleString()}pt</span>
          </div>
        ))}</div>
      )}
      {activeTab === 'mypage' && renderMyPage()}
      {activeTab === 'info' && renderInfo()}

      <nav style={s.nav}>
        <button onClick={() => setActiveTab('home')} style={{ background: 'none', border: 'none', fontSize: '10px', color: activeTab === 'home' ? '#3b82f6' : '#999' }}>🏠<br/>ホーム</button>
        <button onClick={() => setActiveTab('ranking')} style={{ background: 'none', border: 'none', fontSize: '10px', color: activeTab === 'ranking' ? '#3b82f6' : '#999' }}>👑<br/>ランク</button>
        <button onClick={() => setActiveTab('mypage')} style={{ background: 'none', border: 'none', fontSize: '10px', color: activeTab === 'mypage' ? '#3b82f6' : '#999' }}>👤<br/>マイペ</button>
        <button onClick={() => setActiveTab('info')} style={{ background: 'none', border: 'none', fontSize: '10px', color: activeTab === 'info' ? '#3b82f6' : '#999' }}>📖<br/>ガイド</button>
      </nav>
    </div>
  )
}
