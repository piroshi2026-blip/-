import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useRouter } from 'next/router'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }
)

export default function Home() {
  const router = useRouter()
  const [activeTab, setActiveTab] = useState<'home' | 'ranking' | 'mypage' | 'info'>('home')
  const [session, setSession] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [markets, setMarkets] = useState<any[]>([])
  const [ranking, setRanking] = useState<any[]>([])
  const [myBets, setMyBets] = useState<any[]>([])

  const [activeCategory, setActiveCategory] = useState('すべて')
  const [sortBy, setSortBy] = useState<'new' | 'deadline' | 'popular'>('new')

  const [voteAmount, setVoteAmount] = useState(100)
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const categories = ['すべて', 'こども', '経済・政治', 'エンタメ', 'スポーツ', 'ライフ', 'ゲーム', 'その他']
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
      const { data: { session: s } } = await supabase.auth.getSession()
      setSession(s)
      if (s) initUserData(s.user.id)
      fetchMarkets()
      fetchRanking()
      setIsLoading(false)
    }
    init()
  }, [sortBy])

  async function initUserData(userId: string) {
    const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (p) setProfile(p)
    const { data: b } = await supabase.from('bets').select('*, markets(title, is_resolved, result_option_id), market_options(name)').eq('user_id', userId).order('created_at', { ascending: false })
    if (b) setMyBets(b)
  }

  async function fetchMarkets() {
    let query = supabase.from('markets').select('*, market_options(*)')
    if (sortBy === 'new') query = query.order('created_at', { ascending: false })
    else if (sortBy === 'deadline') query = query.order('end_date', { ascending: true })
    else if (sortBy === 'popular') query = query.order('total_pool', { ascending: false })

    const { data } = await query
    if (data) {
      setMarkets(data.map((m: any) => ({
        ...m, market_options: m.market_options.sort((a: any, b: any) => a.id - b.id)
      })))
    }
  }

  async function fetchRanking() {
    const { data } = await supabase.from('profiles').select('*').order('point_balance', { ascending: false }).limit(10)
    if (data) setRanking(data)
  }

  const handleVote = async () => {
    if (!session) return alert('ログインが必要です')
    if (!selectedOptionId) return alert('選択肢を選んでください')
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

  const getOdds = (total: number, pool: number) => (pool === 0 ? 0 : (total / pool).toFixed(1))
  const getPercent = (total: number, pool: number) => (total === 0 ? 0 : Math.round((pool / total) * 100))

  // --- UIスタイル ---
  const s: any = {
    container: { maxWidth: '500px', margin: '0 auto', padding: '10px 12px 100px', fontFamily: 'sans-serif', color: '#1f2937', background: '#fcfcfc' },
    header: { textAlign: 'center', marginBottom: '12px' },
    title: { fontSize: '26px', fontWeight: '900', background: 'linear-gradient(to right, #2563eb, #9333ea)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 },
    catGrid: { display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '6px', marginBottom: '12px' },
    catBtn: (active: boolean) => ({ padding: '6px 2px', borderRadius: '6px', border: '1px solid #eee', background: active ? '#1f2937' : 'white', color: active ? 'white' : '#666', fontSize: '11px', fontWeight: 'bold', cursor: 'pointer' }),
    sortRow: { display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '12px' },
    sortBtn: (active: boolean) => ({ padding: '4px 10px', borderRadius: '15px', border: 'none', background: active ? '#3b82f6' : '#eee', color: active ? 'white' : '#888', fontSize: '10px', fontWeight: 'bold' }),
    card: { background: 'white', borderRadius: '14px', marginBottom: '14px', border: '1px solid #f1f1f1', boxShadow: '0 4px 12px -2px rgba(0,0,0,0.05)', overflow: 'hidden' },
    imgArea: { height: '140px', position: 'relative', background: '#f0f0f0' },
    badge: (bg: string) => ({ position: 'absolute', top: '8px', left: '8px', background: bg, color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold' }),
    days: { position: 'absolute', top: '8px', right: '8px', background: 'rgba(255,255,255,0.9)', color: '#ef4444', padding: '2px 8px', borderRadius: '4px', fontSize: '10px', fontWeight: 'bold', border: '1px solid #ef4444' },
    content: { padding: '10px 12px' },
    desc: { fontSize: '11px', color: '#6b7280', background: '#f8f9fa', padding: '6px 10px', borderRadius: '6px', margin: '6px 0', lineHeight: '1.4', border: '1px solid #f1f1f1' },
    barRow: { marginBottom: '6px' },
    barLabel: { display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold', marginBottom: '2px' },
    barTrack: { height: '8px', background: '#f3f4f6', borderRadius: '4px', overflow: 'hidden' },
    barFill: (pct: number, idx: number) => ({ width: `${pct}%`, height: '100%', background: ['#3b82f6', '#ef4444', '#10b981', '#f59e0b'][idx % 4], transition: 'width 0.6s' }),
    nav: { position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', display: 'flex', justifyContent: 'space-around', padding: '8px 0', borderTop: '1px solid #eee', zIndex: 100 }
  }

  const renderHome = () => (
    <div>
      {/* カテゴリ2列（実際は4列の2段）表示 */}
      <div style={s.catGrid}>
        {categories.map(cat => (
          <button key={cat} onClick={() => setActiveCategory(cat)} style={s.catBtn(activeCategory === cat)}>
            {cat}
          </button>
        ))}
      </div>

      {/* ソートボタン */}
      <div style={s.sortRow}>
        <button onClick={() => setSortBy('new')} style={s.sortBtn(sortBy === 'new')}>✨ 新着順</button>
        <button onClick={() => setSortBy('deadline')} style={s.sortBtn(sortBy === 'deadline')}>⏰ 締切順</button>
        <button onClick={() => setSortBy('popular')} style={s.sortBtn(sortBy === 'popular')}>🔥 人気順</button>
      </div>

      {markets.filter(m => activeCategory === 'すべて' || m.category === activeCategory).map(m => {
        const active = !m.is_resolved && new Date(m.end_date) > new Date()
        const catInfo = categoryMeta[m.category] || categoryMeta['その他']
        const daysLeft = Math.ceil((new Date(m.end_date).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))

        return (
          <div key={m.id} style={s.card}>
            <div style={s.imgArea}>
              {m.image_url ? <img src={m.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ fontSize: '40px', textAlign: 'center', paddingTop: '40px' }}>{catInfo.icon}</div>}
              <div style={s.badge(catInfo.color)}>{m.category || 'その他'}</div>
              {active && <div style={s.days}>あと {daysLeft}日</div>}
              {!active && !m.is_resolved && <div style={{...s.days, background:'#666', color:'white', border:'none'}}>受付終了</div>}
            </div>

            <div style={s.content}>
              <h2 style={{ fontSize: '16px', margin: '0 0 4px 0', lineHeight: '1.3' }}>{m.title}</h2>
              <div style={s.desc}>{m.description}</div>

              <div style={{ fontSize: '11px', fontWeight: 'bold', marginBottom: '8px', color: '#4b5563' }}>💰 総額: {m.total_pool.toLocaleString()} pt</div>

              {m.market_options.map((opt: any, idx: number) => {
                const pct = getPercent(m.total_pool, opt.pool)
                const odds = getOdds(m.total_pool, opt.pool)
                return (
                  <div key={opt.id} style={s.barRow}>
                    <div style={s.barLabel}>
                      <span>{m.result_option_id === opt.id ? '👑 ' : ''}{opt.name}</span>
                      <span style={{ color: '#3b82f6' }}>{odds}倍 ({pct}%)</span>
                    </div>
                    <div style={s.barTrack}><div style={s.barFill(pct, idx) as any} /></div>
                  </div>
                )
              })}

              {active ? (
                selectedMarketId === m.id ? (
                  <div style={{ marginTop: '10px', background: '#f9fafb', padding: '8px', borderRadius: '10px' }}>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '8px' }}>
                      {m.market_options.map((opt: any) => (
                        <button key={opt.id} onClick={() => setSelectedOptionId(opt.id)} style={{ padding: '6px 10px', borderRadius: '15px', border: selectedOptionId === opt.id ? '2px solid #3b82f6' : '1px solid #ddd', background: selectedOptionId === opt.id ? '#eff6ff' : 'white', fontSize: '11px', fontWeight: 'bold' }}>{opt.name}</button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input type="range" min="10" max={profile?.point_balance || 1000} step="10" value={voteAmount} onChange={e => setVoteAmount(Number(e.target.value))} style={{ flex: 1 }} />
                      <input type="number" value={voteAmount} onChange={e => setVoteAmount(Number(e.target.value))} style={{ width: '60px', padding: '4px', border: '1px solid #ddd', borderRadius: '4px', fontSize: '12px' }} />
                      <button onClick={handleVote} style={{ padding: '6px 12px', background: '#1f2937', color: 'white', border: 'none', borderRadius: '6px', fontWeight: 'bold', fontSize: '12px' }}>確定</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setSelectedMarketId(m.id)} style={{ width: '100%', padding: '10px', background: '#3b82f6', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', marginTop: '8px', fontSize: '14px' }}>ヨソる</button>
                )
              ) : <div style={{ textAlign: 'center', padding: '8px', color: '#999', fontSize: '12px', fontWeight: 'bold' }}>結果判定待ち</div>}
            </div>
          </div>
        )
      })}
    </div>
  )

  const renderInfo = () => (
    <div style={{ fontSize: '13px', lineHeight: '1.6' }}>
      <section style={{ background: 'white', padding: '15px', borderRadius: '12px', marginBottom: '15px' }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#3b82f6' }}>🎒 遊び方</h3>
        <p style={{ margin: 0 }}>未来の出来事を予想してポイントを「ヨソる」だけ！<br/>予想が的中すると、プールされたポイントが配当として分配されます。</p>
      </section>
      <section style={{ background: 'white', padding: '15px', borderRadius: '12px' }}>
        <h3 style={{ margin: '0 0 8px 0', color: '#3b82f6' }}>⚖️ 規約</h3>
        <p style={{ margin: 0, fontSize: '11px', color: '#666' }}>・ポイントは換金できません。<br/>・判定は運営が信頼できる情報を元に行います。<br/>・お問い合わせは𝕏まで。</p>
      </section>
      <div style={{ textAlign: 'center', marginTop: '30px' }}>
        <Link href="/admin" style={{ color: '#eee', textDecoration: 'none', fontSize: '10px' }}>admin</Link>
      </div>
    </div>
  )

  const renderMyPage = () => (
    <div>
      <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)', color: 'white', padding: '24px', borderRadius: '16px', textAlign: 'center', marginBottom: '16px' }}>
        <div style={{ fontSize: '12px', opacity: 0.8 }}>総資産ポイント</div>
        <div style={{ fontSize: '36px', fontWeight: '900' }}>{profile?.point_balance?.toLocaleString()} pt</div>
      </div>
      <h3 style={{ fontSize: '15px', fontWeight: 'bold', margin: '0 0 10px 4px' }}>📜 ヨソり履歴</h3>
      {myBets.map(b => {
        const isWin = b.markets.is_resolved && b.markets.result_option_id === b.market_option_id
        const isLost = b.markets.is_resolved && b.markets.result_option_id !== b.market_option_id
        return (
          <div key={b.id} style={{ ...s.card, padding: '10px' }}>
            <div style={{ fontSize: '10px', color: '#999', marginBottom: '2px' }}>{b.markets.title}</div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '13px', fontWeight: 'bold' }}>
              <span>{b.market_options.name} / {b.amount}pt</span>
              <span style={{ color: isWin ? '#10b981' : isLost ? '#ef4444' : '#666' }}>
                {isWin ? '+ 配当' : isLost ? `-${b.amount}` : '判定待ち'}
              </span>
            </div>
          </div>
        )
      })}
    </div>
  )

  if (isLoading) return <div style={{ textAlign: 'center', paddingTop: '50px' }}>読み込み中...</div>

  return (
    <div style={s.container}>
      <header style={s.header}>
        <h1 style={s.title}>ヨソる</h1>
        <p style={{ fontSize: '10px', color: '#9ca3af', margin: '2px 0' }}>未来をヨソる予測市場</p>
        {profile && <div style={{ fontSize: '13px', fontWeight: 'bold', color: '#3b82f6', marginTop: '4px' }}>💎 {profile.point_balance.toLocaleString()} pt</div>}
      </header>

      {activeTab === 'home' && renderHome()}
      {activeTab === 'ranking' && (
        <div style={s.card}>
          <h3 style={{ textAlign: 'center', fontSize: '15px', padding: '12px 0', margin: 0, borderBottom: '1px solid #f1f1f1' }}>🏆 ランク</h3>
          {ranking.map((u, i) => (
            <div key={u.id} style={{ display: 'flex', padding: '10px 15px', borderBottom: '1px solid #f9fafb', fontSize: '13px', alignItems: 'center' }}>
              <span style={{ width: '25px', color: i < 3 ? '#d97706' : '#999', fontWeight: 'bold' }}>{i + 1}</span>
              <span style={{ flex: 1 }}>{u.username || '名無しさん'}</span>
              <span style={{ fontWeight: 'bold' }}>{u.point_balance.toLocaleString()}</span>
            </div>
          ))}
        </div>
      )}
      {activeTab === 'mypage' && renderMyPage()}
      {activeTab === 'info' && renderInfo()}

      <nav style={s.nav}>
        <button onClick={() => setActiveTab('home')} style={{ background: 'none', border: 'none', fontSize: '10px', color: activeTab === 'home' ? '#3b82f6' : '#9ca3af' }}>🏠<br/>ホーム</button>
        <button onClick={() => setActiveTab('ranking')} style={{ background: 'none', border: 'none', fontSize: '10px', color: activeTab === 'ranking' ? '#3b82f6' : '#9ca3af' }}>👑<br/>ランク</button>
        <button onClick={() => { if(!session) return alert('ログインが必要です'); setActiveTab('mypage') }} style={{ background: 'none', border: 'none', fontSize: '10px', color: activeTab === 'mypage' ? '#3b82f6' : '#9ca3af' }}>👤<br/>マイペ</button>
        <button onClick={() => setActiveTab('info')} style={{ background: 'none', border: 'none', fontSize: '10px', color: activeTab === 'info' ? '#3b82f6' : '#9ca3af' }}>📖<br/>ガイド</button>
      </nav>
    </div>
  )
}
