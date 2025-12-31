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
  const [sortBy, setSortBy] = useState<'popular' | 'deadline'>('popular')

  const [voteAmount, setVoteAmount] = useState(100)
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  const [editName, setEditName] = useState('')
  const [isEditingName, setIsEditingName] = useState(false)
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
  }, [sortBy])

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
    let query = supabase.from('markets').select('*, market_options(*)')
    if (sortBy === 'popular') query = query.order('total_pool', { ascending: false })
    else query = query.order('end_date', { ascending: true })
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
    await supabase.from('profiles').update({ username: editName }).eq('id', profile.id)
    setIsEditingName(false); initUserData(profile.id); fetchRanking()
  }

  const handleGoogleLogin = async () => await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } })
  const handleVote = async () => {
    if (voteAmount > (profile?.point_balance || 0)) return alert('ポイント不足')
    const { error } = await supabase.rpc('place_bet', { market_id_input: selectedMarketId, option_id_input: selectedOptionId, amount_input: voteAmount })
    if (!error) { alert('投票完了！'); setSelectedMarketId(null); fetchMarkets(); initUserData(session.user.id); fetchRanking() }
  }

  const shareOnX = (market: any) => {
    const template = localStorage.getItem('x_template') || '💰予測市場「YOSOL」に参加中！\n\nQ. {title}\n\nあなたも予想しよう！ #YOSOL'
    const text = template.replace('{title}', market.title)
    window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.origin + '/?id=' + market.id)}`, '_blank')
  }

  const styles: any = {
    container: { maxWidth: '600px', margin: '0 auto', padding: '20px 15px 120px', fontFamily: 'sans-serif', color: '#1f2937' },
    header: { textAlign: 'center', marginBottom: '20px' },
    appTitle: { fontSize: '32px', fontWeight: '900', background: 'linear-gradient(to right, #2563eb, #9333ea)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 },
    appDesc: { fontSize: '13px', color: '#6b7280', marginTop: '5px', fontWeight: 'bold' },
    card: { background: 'white', borderRadius: '16px', marginBottom: '35px', boxShadow: '0 10px 25px -5px rgba(0,0,0,0.1)', overflow: 'hidden', border: '1px solid #f3f4f6' },
    imageArea: { height: '180px', position: 'relative', background: '#eee' },
    imageOverlay: { position: 'absolute', bottom: 0, left: 0, right: 0, padding: '20px', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' },
    contentArea: { padding: '20px', background: 'white', position: 'relative', zIndex: 10 },
    descBox: { fontSize: '12px', color: '#4b5563', background: '#f8fafc', padding: '15px', borderRadius: '10px', marginBottom: '20px', border: '1px solid #edf2f7', lineHeight: '1.6', whiteSpace: 'pre-wrap' },
    nav: { position: 'fixed', bottom: 0, left: 0, right: 0, background: 'rgba(255,255,255,0.95)', borderTop: '1px solid #eee', display: 'flex', justifyContent: 'space-around', padding: '12px', zIndex: 100 },
    adminLink: { textAlign: 'center', marginTop: '40px', fontSize: '12px', color: '#cbd5e1' }
  }

  if (isLoading) return <div style={{textAlign:'center', marginTop:'50px'}}>読み込み中...</div>

  return (
    <div style={styles.container}>
      <header style={styles.header}>
        <h1 style={styles.appTitle}>YOSOL</h1>
        <p style={styles.appDesc}>未来をヨソル、ポイントで遊ぶ予測市場</p>
        {profile && <div style={{marginTop:'10px', fontWeight:'bold', color:'#2563eb', fontSize:'16px'}}>💎 {profile.point_balance.toLocaleString()} pt</div>}
      </header>

      {activeTab === 'home' && (
        <>
          <div style={{display:'flex', gap:'10px', overflowX:'auto', marginBottom:'15px', paddingBottom:'5px'}}>
            {categories.map(cat => (
              <button key={cat} onClick={()=>setActiveCategory(cat)} style={{padding:'8px 18px', borderRadius:'25px', background:activeCategory===cat?'#1f2937':'white', color:activeCategory===cat?'white':'#4b5563', border:'1px solid #ddd', fontWeight:'bold', cursor:'pointer', whiteSpace:'nowrap'}}>{cat}</button>
            ))}
          </div>

          <div style={{display:'flex', justifyContent:'center', gap:'15px', marginBottom:'20px'}}>
            <button onClick={()=>setSortBy('popular')} style={{fontSize:'12px', border:'none', background:sortBy==='popular'?'#2563eb':'#f3f4f6', color:sortBy==='popular'?'white':'#94a3b8', padding:'6px 15px', borderRadius:'20px', fontWeight:'bold', cursor:'pointer'}}>🔥 人気順</button>
            <button onClick={()=>setSortBy('deadline')} style={{fontSize:'12px', border:'none', background:sortBy==='deadline'?'#2563eb':'#f3f4f6', color:sortBy==='deadline'?'white':'#94a3b8', padding:'6px 15px', borderRadius:'20px', fontWeight:'bold', cursor:'pointer'}}>⏰ 締切順</button>
          </div>

          {markets.filter(m => activeCategory==='すべて' || m.category===activeCategory).map(m => {
            const catInfo = categoryMeta[m.category] || { icon: '🎲', color: '#6b7280' }
            const active = !m.is_resolved && new Date(m.end_date) > new Date()
            return (
              <div key={m.id} style={styles.card}>
                <div style={styles.imageArea}>
                  {m.image_url ? <img src={m.image_url} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="" /> : <div style={{textAlign:'center', paddingTop:'60px', fontSize:'50px'}}>{catInfo.icon}</div>}
                  <div style={styles.imageOverlay}>
                    <div style={{display:'flex', gap:'8px', marginBottom:'8px'}}>
                      <span style={{fontSize:'10px', background:catInfo.color, color:'white', padding:'4px 10px', borderRadius:'6px', fontWeight:'bold'}}>{m.category}</span>
                      <span style={{fontSize:'10px', background:active?'rgba(255,255,255,0.9)':'#ef4444', color:active?'#059669':'white', padding:'4px 10px', borderRadius:'6px', fontWeight:'bold'}}>
                        {m.is_resolved ? '結果確定' : (active ? `あと ${Math.ceil((new Date(m.end_date).getTime() - new Date().getTime())/(1000*60*60*24))}日` : '受付終了')}
                      </span>
                    </div>
                    <h2 style={{color:'white', margin:0, fontSize:'20px', fontWeight:'bold', textShadow:'0 2px 10px rgba(0,0,0,0.5)'}}>{m.title}</h2>
                  </div>
                </div>

                <div style={styles.contentArea}>
                  {/* 判定基準：SQLのdescriptionカラムを確実に表示 */}
                  {m.description && (
                    <div style={styles.descBox}>
                      <div style={{fontWeight:'bold', fontSize:'11px', color:'#2563eb', marginBottom:'6px', borderBottom:'1px solid #edf2f7', paddingBottom:'4px'}}>📝 判定基準</div>
                      <div dangerouslySetInnerHTML={{ __html: m.description.replace(/\n/g, '<br />') }} />
                    </div>
                  )}

                  <div style={{fontSize:'14px', fontWeight:'bold', marginBottom:'15px', color:'#4b5563'}}>💰 投票総額: {m.total_pool.toLocaleString()} pt</div>

                  {m.market_options.map((opt: any, idx: number) => {
                    const pct = m.total_pool === 0 ? 0 : Math.round((opt.pool / m.total_pool) * 100)
                    const odds = opt.pool === 0 ? '1.0' : (m.total_pool / opt.pool).toFixed(1)
                    return (
                      <div key={opt.id} style={{marginBottom:'12px'}}>
                        <div style={{display:'flex', justifyContent:'space-between', fontSize:'14px', fontWeight:'bold', marginBottom:'4px'}}>
                          <span>{m.result_option_id === opt.id ? '👑 ' : ''}{opt.name}</span>
                          <span style={{color:'#2563eb'}}>{odds}倍 ({pct}%)</span>
                        </div>
                        <div style={{height:'10px', background:'#f1f5f9', borderRadius:'5px', overflow:'hidden'}}>
                          <div style={{width:`${pct}%`, height:'100%', background:['#3b82f6','#ef4444','#10b981','#f59e0b'][idx%4], transition:'width 0.8s ease-out'}} />
                        </div>
                      </div>
                    )
                  })}

                  {active ? (
                    selectedMarketId === m.id ? (
                      <div style={{marginTop:'20px', padding:'15px', background:'#f9fafb', borderRadius:'12px', border:'1px solid #e2e8f0'}}>
                        <div style={{display:'flex', gap:'8px', flexWrap:'wrap', marginBottom:'15px'}}>
                          {m.market_options.map((o: any) => (
                            <button key={o.id} onClick={()=>setSelectedOptionId(o.id)} style={{padding:'10px 15px', borderRadius:'25px', border:selectedOptionId===o.id?'2px solid #2563eb':'1px solid #cbd5e1', background:selectedOptionId===o.id?'#eff6ff':'white', color:'black', fontWeight:'bold', cursor:'pointer'}}>{o.name}</button>
                          ))}
                        </div>
                        <input type="range" min="10" max={profile?.point_balance || 1000} step="10" value={voteAmount} onChange={e=>setVoteAmount(Number(e.target.value))} style={{width:'100%', marginBottom:'15px'}} />
                        <div style={{display:'flex', gap:'10px'}}>
                          <button onClick={handleVote} style={{flex:2, padding:'14px', background:'#2563eb', color:'white', border:'none', borderRadius:'12px', fontWeight:'bold', cursor:'pointer'}}>投票を確定</button>
                          <button onClick={()=>setSelectedMarketId(null)} style={{flex:1, background:'#e2e8f0', color:'#475569', border:'none', borderRadius:'12px', fontWeight:'bold', cursor:'pointer'}}>中止</button>
                        </div>
                      </div>
                    ) : (
                      <div style={{display:'flex', gap:'12px', marginTop:'20px'}}>
                        <button onClick={()=>{ if(!session) handleGoogleLogin(); else setSelectedMarketId(m.id) }} style={{flex:2, padding:'14px', background:'#2563eb', color:'white', border:'none', borderRadius:'12px', fontWeight:'bold', cursor:'pointer', fontSize:'16px'}}>⚡️ 予想に参加</button>
                        <button onClick={()=>shareOnX(m)} style={{flex:1, background:'black', color:'white', border:'none', borderRadius:'12px', fontWeight:'bold', cursor:'pointer', fontSize:'16px'}}>𝕏 シェア</button>
                      </div>
                    )
                  ) : <div style={{textAlign:'center', padding:'15px', background:'#f8fafc', color:'#94a3b8', borderRadius:'12px', marginTop:'15px', fontWeight:'bold'}}>受付終了しました</div>}
                </div>
              </div>
            )
          })}

          <div style={{ textAlign: 'center', marginTop: '40px', paddingBottom: '40px' }}>
            <Link href="/admin" style={{ color: '#cbd5e1', textDecoration: 'none', fontSize: '12px' }}>Admin Login</Link>
          </div>
        </>
      )}

      {activeTab === 'ranking' && (
        <div style={{background:'white', borderRadius:'16px', padding:'25px', boxShadow:'0 4px 20px rgba(0,0,0,0.05)'}}>
           <h3 style={{textAlign:'center', marginBottom:'25px', fontSize:'20px', fontWeight:'bold'}}>🏆 投資家ランキング</h3>
           {ranking.map((u, i) => (
             <div key={u.id} style={{display:'flex', padding:'14px 0', borderBottom:'1px solid #f1f5f9', alignItems:'center'}}>
               <div style={{width:'40px', fontWeight:'bold', fontSize:'20px', color:i<3?'#f59e0b':'#cbd5e1'}}>{i+1}</div>
               <div style={{flex:1}}>{u.id===session?.user?.id ? <strong>{u.username} (自分)</strong> : u.username}</div>
               <div style={{fontWeight:'bold', color:'#2563eb', fontSize:'18px'}}>{u.point_balance.toLocaleString()} pt</div>
             </div>
           ))}
        </div>
      )}

      {activeTab === 'mypage' && (
        <div>
           <div style={{background:'linear-gradient(135deg, #2563eb, #1e40af)', color:'white', padding:'40px 20px', borderRadius:'20px', textAlign:'center', marginBottom:'30px', boxShadow:'0 10px 25px rgba(37,99,235,0.2)'}}>
              <div style={{fontSize:'14px', opacity:0.8, marginBottom:'5px'}}>あなたの総資産</div>
              <div style={{fontSize:'45px', fontWeight:'900'}}>{profile?.point_balance?.toLocaleString() || 0} pt</div>
              <div style={{marginTop:'20px'}}>
                {!isEditingName ? <div onClick={()=>setIsEditingName(true)} style={{cursor:'pointer', fontSize:'18px', background:'rgba(255,255,255,0.1)', display:'inline-block', padding:'8px 20px', borderRadius:'25px'}}>👤 {profile?.username || '名無しさん'} ✎</div>
                : <div style={{display:'flex', justifyContent:'center', gap:'10px'}}><input value={editName} onChange={e=>setEditName(e.target.value)} style={{color:'black', padding:'10px', borderRadius:'8px', border:'none', width:'150px'}} /><button onClick={handleUpdateName} style={{background:'#22c55e', color:'white', border:'none', padding:'10px 20px', borderRadius:'8px', fontWeight:'bold'}}>保存</button></div>}
              </div>
           </div>
           <button onClick={()=>supabase.auth.signOut().then(()=>window.location.reload())} style={{width:'100%', padding:'15px', background:'none', border:'1px solid #e2e8f0', borderRadius:'12px', marginTop:'40px', color:'#94a3b8', cursor:'pointer', fontWeight:'bold'}}>ログアウト</button>
        </div>
      )}

      <nav style={styles.nav}>
        <button onClick={()=>setActiveTab('home')} style={{background:'none', border:'none', color:activeTab==='home'?'#2563eb':'#94a3b8', cursor:'pointer', textAlign:'center'}}><span style={{fontSize:'24px'}}>🏠</span><br/><span style={{fontSize:'11px', fontWeight:'bold'}}>ホーム</span></button>
        <button onClick={()=>setActiveTab('ranking')} style={{background:'none', border:'none', color:activeTab==='ranking'?'#2563eb':'#94a3b8', cursor:'pointer', textAlign:'center'}}><span style={{fontSize:'24px'}}>👑</span><br/><span style={{fontSize:'11px', fontWeight:'bold'}}>ランク</span></button>
        <button onClick={()=>{if(!session)handleGoogleLogin(); else setActiveTab('mypage')}} style={{background:'none', border:'none', color:activeTab==='mypage'?'#2563eb':'#94a3b8', cursor:'pointer', textAlign:'center'}}><span style={{fontSize:'24px'}}>👤</span><br/><span style={{fontSize:'11px', fontWeight:'bold'}}>マイページ</span></button>
      </nav>
    </div>
  )
}
