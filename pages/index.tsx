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

  // カテゴリ関連
  const [categories, setCategories] = useState<string[]>(['すべて'])
  const [categoryMeta, setCategoryMeta] = useState<any>({})
  const [activeCategory, setActiveCategory] = useState('すべて')

  const [activeTab, setActiveTab] = useState<'home' | 'ranking' | 'mypage'>('home')
  const [voteAmount, setVoteAmount] = useState(100)
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  // ユーザー設定用
  const [editName, setEditName] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)

  // ログイン用
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      setSession(session)

      // 並列でデータ取得
      await Promise.all([
        fetchCategories(),
        fetchMarkets(),
        fetchRanking(),
        session ? initUserData(session.user.id) : Promise.resolve()
      ])

      setIsLoading(false)
    }
    init()
  }, [])

  // URLパラメータの監視（特定のマーケットを開く用）
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

  async function fetchCategories() {
    const { data } = await supabase.from('categories').select('*').order('id', { ascending: true })
    if (data) {
      setCategories(['すべて', ...data.map(c => c.name)])
      const meta: any = {}
      data.forEach(c => {
        meta[c.name] = { icon: c.icon || '🎲', color: '#6b7280' }
      })
      setCategoryMeta(meta)
    }
  }

  async function initUserData(userId: string) {
    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (profileData) {
      setProfile(profileData)
      setEditName(profileData.username || '名無しさん')
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
      setMarkets(data.map(m => ({
        ...m,
        market_options: m.market_options.sort((a: any, b: any) => a.id - b.id)
      })))
    }
  }

  async function fetchRanking() {
    const { data } = await supabase
      .from('profiles')
      .select('*')
      .eq('is_hidden_from_ranking', false) // 管理画面で除外した人を出さない
      .order('point_balance', { ascending: false })
      .limit(20)
    if (data) setRanking(data)
  }

  const handleUpdateName = async () => {
    if (!profile || !editName) return
    const { error } = await supabase.from('profiles').update({ username: editName }).eq('id', profile.id)
    if (!error) {
      alert('名前を変更しました')
      setIsEditingName(false)
      initUserData(profile.id)
      fetchRanking()
    }
  }

  // --- ログイン処理 ---
  const handleGoogleLogin = async () => {
    await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
  }

  const handleEmailAuth = async () => {
    if (isSignUp) {
      const { error } = await supabase.auth.signUp({ email, password })
      if (!error) alert('確認メールを送りました')
    } else {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (!error) window.location.reload()
    }
  }

  const handleAnonLogin = async () => {
    await supabase.auth.signInAnonymously()
    window.location.reload()
  }

  // --- 投票処理 ---
  const handleVote = async () => {
    if (!session) return alert('ログインしてください')
    if (voteAmount > (profile?.point_balance || 0)) return alert('ポイント不足')
    const { error } = await supabase.rpc('place_bet', {
      market_id_input: selectedMarketId,
      option_id_input: selectedOptionId,
      amount_input: voteAmount
    })
    if (!error) {
      alert('投票完了！')
      setSelectedMarketId(null)
      fetchMarkets()
      initUserData(session.user.id)
    }
  }

  // 補助関数
  const isMarketActive = (m: any) => !m.is_resolved && new Date(m.end_date) > new Date()
  const getPercent = (total: number, pool: number) => total === 0 ? 0 : Math.round((pool / total) * 100)
  const getOdds = (total: number, pool: number) => pool === 0 ? 0 : (total / pool).toFixed(1)

  const styles: any = {
    container: { maxWidth: '600px', margin: '0 auto', padding: '20px 15px 100px', minHeight: '100vh', fontFamily: 'sans-serif' },
    header: { textAlign: 'center', padding: '20px 0' },
    card: { background: 'white', borderRadius: '16px', marginBottom: '20px', boxShadow: '0 4px 12px rgba(0,0,0,0.1)', overflow: 'hidden', border: '1px solid #eee' },
    nav: { position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-around', padding: '12px' },
    badge: { background: '#eff6ff', color: '#2563eb', padding: '4px 12px', borderRadius: '20px', fontWeight: 'bold' }
  }

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={{ fontSize: '32px', fontWeight: '900', color: '#2563eb', margin: 0 }}>YOSOL</h1>
        {profile ? (
          <div style={{ marginTop: '10px' }}><span style={styles.badge}>💎 {profile.point_balance.toLocaleString()} pt</span></div>
        ) : (
          <div style={{ marginTop: '10px' }}>
            {!showEmailForm ? (
              <>
                <button onClick={handleGoogleLogin} style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #ccc', background: 'white', cursor: 'pointer' }}>Googleでログイン</button>
                <button onClick={() => setShowEmailForm(true)} style={{ marginLeft: '10px', fontSize: '12px', background: 'none', border: 'none', color: '#666', textDecoration: 'underline' }}>メールログイン</button>
              </>
            ) : (
              <div style={{ background: '#f3f4f6', padding: '15px', borderRadius: '10px' }}>
                <input placeholder="Email" onChange={e => setEmail(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '5px' }} />
                <input type="password" placeholder="Pass" onChange={e => setPassword(e.target.value)} style={{ display: 'block', width: '100%', marginBottom: '10px' }} />
                <button onClick={handleEmailAuth} style={{ width: '100%', background: '#2563eb', color: 'white', border: 'none', padding: '8px', borderRadius: '5px' }}>{isSignUp ? '新規登録' : 'ログイン'}</button>
                <button onClick={() => setIsSignUp(!isSignUp)} style={{ fontSize: '11px', marginTop: '5px', background: 'none', border: 'none' }}>{isSignUp ? 'ログインへ' : '登録はこちら'}</button>
              </div>
            )}
            <button onClick={handleAnonLogin} style={{ display: 'block', margin: '10px auto', fontSize: '11px', background: 'none', border: 'none', color: '#999' }}>アカウントなしで試す</button>
          </div>
        )}
      </header>

      {activeTab === 'home' && (
        <>
          <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '15px' }}>
            {categories.map(cat => (
              <button key={cat} onClick={() => setActiveCategory(cat)} style={{ padding: '8px 16px', borderRadius: '20px', border: activeCategory === cat ? 'none' : '1px solid #ddd', background: activeCategory === cat ? '#1f2937' : 'white', color: activeCategory === cat ? 'white' : '#666', whiteSpace: 'nowrap', fontWeight: 'bold' }}>{cat}</button>
            ))}
          </div>
          {markets.filter(m => activeCategory === 'すべて' || m.category === activeCategory).map(m => {
            const active = isMarketActive(m)
            const meta = categoryMeta[m.category] || { icon: '🎲' }
            return (
              <div key={m.id} style={styles.card}>
                <div style={{ height: '150px', background: '#eee', position: 'relative' }}>
                  {m.image_url ? <img src={m.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ fontSize: '50px', textAlign: 'center', paddingTop: '40px' }}>{meta.icon}</div>}
                  <div style={{ position: 'absolute', top: '10px', left: '10px', background: 'rgba(0,0,0,0.6)', color: 'white', padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }}>{m.category}</div>
                </div>
                <div style={{ padding: '15px' }}>
                  <h3 style={{ margin: '0 0 10px 0' }}>{m.title}</h3>
                  {m.market_options.map((opt: any, idx: number) => (
                    <div key={opt.id} style={{ marginBottom: '8px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', fontWeight: 'bold' }}>
                        <span>{opt.name}</span>
                        <span>{getOdds(m.total_pool, opt.pool)}倍 ({getPercent(m.total_pool, opt.pool)}%)</span>
                      </div>
                      <div style={{ height: '8px', background: '#f3f4f6', borderRadius: '4px', overflow: 'hidden' }}>
                        <div style={{ width: `${getPercent(m.total_pool, opt.pool)}%`, height: '100%', background: ['#3b82f6', '#ef4444', '#10b981'][idx % 3] }} />
                      </div>
                    </div>
                  ))}
                  {active ? (
                    selectedMarketId === m.id ? (
                      <div style={{ marginTop: '15px', background: '#f9fafb', padding: '10px', borderRadius: '8px' }}>
                        <div style={{ display: 'flex', gap: '5px', flexWrap: 'wrap' }}>
                          {m.market_options.map((o: any) => (
                            <button key={o.id} onClick={() => setSelectedOptionId(o.id)} style={{ padding: '6px 12px', borderRadius: '15px', border: selectedOptionId === o.id ? '2px solid #2563eb' : '1px solid #ccc', background: 'white' }}>{o.name}</button>
                          ))}
                        </div>
                        <input type="range" min="10" max={profile?.point_balance || 1000} step="10" onChange={e => setVoteAmount(Number(e.target.value))} style={{ width: '100%', margin: '15px 0' }} />
                        <div style={{ display: 'flex', gap: '10px' }}>
                          <button onClick={handleVote} style={{ flex: 1, padding: '10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '5px', fontWeight: 'bold' }}>{voteAmount}pt 投票</button>
                          <button onClick={() => setSelectedMarketId(null)} style={{ flex: 1, background: '#ddd', border: 'none', borderRadius: '5px' }}>やめる</button>
                        </div>
                      </div>
                    ) : (
                      <button onClick={() => { if (!session) handleGoogleLogin(); else setSelectedMarketId(m.id) }} style={{ width: '100%', padding: '12px', marginTop: '10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold' }}>予想に参加する</button>
                    )
                  ) : <div style={{ textAlign: 'center', padding: '10px', color: '#999', fontWeight: 'bold' }}>結果確定済み</div>}
                </div>
              </div>
            )
          })}
        </>
      )}

      {activeTab === 'ranking' && (
        <div style={styles.card}>
          <h2 style={{ textAlign: 'center' }}>🏆 ランキング</h2>
          {ranking.map((user, idx) => (
            <div key={user.id} style={{ display: 'flex', padding: '15px', borderBottom: '1px solid #eee', alignItems: 'center' }}>
              <div style={{ width: '30px', fontWeight: 'bold', color: idx < 3 ? '#d97706' : '#999' }}>{idx + 1}</div>
              <div style={{ flex: 1 }}>{user.id === session?.user?.id ? <strong>{user.username || 'あなた'} (自分)</strong> : (user.username || '名無しさん')}</div>
              <div style={{ fontWeight: 'bold', color: '#2563eb' }}>{user.point_balance.toLocaleString()} pt</div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'mypage' && (
        <div>
          <div style={{ ...styles.card, padding: '20px', background: '#2563eb', color: 'white', textAlign: 'center' }}>
            <div style={{ opacity: 0.8 }}>現在の資産</div>
            <div style={{ fontSize: '32px', fontWeight: 'bold' }}>{profile?.point_balance.toLocaleString()} pt</div>
            <div style={{ marginTop: '15px' }}>
              {!isEditingName ? (
                <div onClick={() => setIsEditingName(true)} style={{ cursor: 'pointer' }}>👤 {profile?.username || '名無しさん'} <span style={{ fontSize: '10px', opacity: 0.7 }}>[編集]</span></div>
              ) : (
                <div style={{ display: 'flex', justifyContent: 'center', gap: '5px' }}>
                  <input value={editName} onChange={e => setEditName(e.target.value)} style={{ width: '120px', borderRadius: '4px', border: 'none', padding: '4px' }} />
                  <button onClick={handleUpdateName} style={{ background: '#22c55e', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px' }}>保存</button>
                </div>
              )}
            </div>
          </div>
          <h3>投票履歴</h3>
          {myBets.map(bet => (
            <div key={bet.id} style={{ ...styles.card, padding: '15px' }}>
              <div style={{ fontSize: '12px', color: '#666' }}>{bet.markets?.title}</div>
              <div style={{ fontWeight: 'bold' }}>「{bet.market_options?.name}」に {bet.amount} pt</div>
            </div>
          ))}
          <button onClick={() => supabase.auth.signOut().then(() => window.location.reload())} style={{ width: '100%', padding: '10px', background: 'none', border: '1px solid #ccc', borderRadius: '5px', marginTop: '20px' }}>ログアウト</button>
        </div>
      )}

      <nav style={styles.nav}>
        <button onClick={() => setActiveTab('home')} style={{ background: 'none', border: 'none', color: activeTab === 'home' ? '#2563eb' : '#999' }}>🏠<br /><span style={{ fontSize: '10px' }}>ホーム</span></button>
        <button onClick={() => setActiveTab('ranking')} style={{ background: 'none', border: 'none', color: activeTab === 'ranking' ? '#2563eb' : '#999' }}>🏆<br /><span style={{ fontSize: '10px' }}>ランク</span></button>
        <button onClick={() => { if (!session) handleGoogleLogin(); else setActiveTab('mypage') }} style={{ background: 'none', border: 'none', color: activeTab === 'mypage' ? '#2563eb' : '#999' }}>👤<br /><span style={{ fontSize: '10px' }}>マイページ</span></button>
      </nav>
    </div>
  )
}
