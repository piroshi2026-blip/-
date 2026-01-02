import { useState, useEffect, useCallback } from 'react'
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
  const [dbCategories, setDbCategories] = useState<any[]>([{ name: 'すべて' }])
  const [config, setConfig] = useState<any>({ site_title: 'ヨソる', site_description: '未来をヨソる予測市場', admin_message: '', show_ranking: true, share_text_base: '「{title}」の「{option}」にヨソりました！ #ヨソる' })

  const [showAuthModal, setShowAuthModal] = useState(false)
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [newUsername, setNewUsername] = useState(''); const [isEditingName, setIsEditingName] = useState(false)
  const [activeCategory, setActiveCategory] = useState('すべて')
  const [sortBy, setSortBy] = useState<'new' | 'deadline' | 'popular'>('new')
  const [voteAmount, setVoteAmount] = useState(100)
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true); const [justVoted, setJustVoted] = useState<any>(null)

  const categoryMeta: any = { 'こども': { color: '#f43f5e' }, '経済・政治': { color: '#3b82f6' }, 'エンタメ': { color: '#a855f7' }, 'スポーツ': { color: '#22c55e' }, 'ライフ': { color: '#f59e0b' }, 'ゲーム': { color: '#10b981' }, 'その他': { color: '#6b7280' } }

  const fetchMarkets = useCallback(async () => {
    let query = supabase.from('markets').select('*, market_options(*)')
    if (sortBy === 'new') query = query.order('created_at', { ascending: false })
    else if (sortBy === 'deadline') query = query.order('end_date', { ascending: true })
    else if (sortBy === 'popular') query = query.order('total_pool', { ascending: false })
    const { data } = await query
    if (data) setMarkets(data.map((m: any) => ({ ...m, market_options: m.market_options.sort((a: any, b: any) => a.id - b.id) })))
  }, [sortBy])

  const fetchRanking = useCallback(async () => {
    const { data } = await supabase.from('profiles').select('*').eq('is_hidden_from_ranking', false).order('point_balance', { ascending: false }).limit(20)
    if (data) setRanking(data)
  }, [])

  const initUserData = useCallback(async (userId: string) => {
    const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (p) { setProfile(p); setNewUsername(p.username || ''); }
    const { data: b } = await supabase.from('bets').select('*, markets(title, is_resolved, result_option_id), market_options(name)').eq('user_id', userId).order('created_at', { ascending: false })
    if (b) setMyBets(b)
  }, [])

  useEffect(() => {
    const init = async () => {
      const [cfgRes, catRes] = await Promise.all([supabase.from('site_config').select('*').single(), supabase.from('categories').select('*').order('display_order', { ascending: true })])
      if (cfgRes.data) setConfig(cfgRes.data)
      if (catRes.data) setDbCategories([{ name: 'すべて' }, ...catRes.data])
      const { data: { session: s } } = await supabase.auth.getSession()
      setSession(s); if (s) initUserData(s.user.id)
      fetchMarkets(); fetchRanking(); setIsLoading(false)
    }
    init()
    const { data: authListener } = supabase.auth.onAuthStateChange((_, s) => { 
      setSession(s); 
      if (s) initUserData(s.user.id);
      else { setProfile(null); setMyBets([]); }
    })
    return () => authListener.subscription.unsubscribe()
  }, [sortBy, fetchMarkets, fetchRanking, initUserData])

  const handleUpdateName = async () => {
    if (!profile) return
    const { error } = await supabase.from('profiles').update({ username: newUsername }).eq('id', profile.id)
    if (!error) { setIsEditingName(false); initUserData(profile.id); alert('名前を変更しました'); }
  }

  const handleVote = async () => {
    if (!session) { setShowAuthModal(true); return; }
    if (!selectedOptionId) return alert('選択肢を選んでください')
    const { error } = await supabase.rpc('place_bet', { market_id_input: selectedMarketId, option_id_input: selectedOptionId, amount_input: voteAmount })
    if (!error) {
      const m = markets.find(m => m.id === selectedMarketId); const o = m?.market_options.find((o: any) => o.id === selectedOptionId)
      setJustVoted({ title: m?.title, option: o?.name }); setSelectedMarketId(null); fetchMarkets(); initUserData(session.user.id)
    } else alert(error.message)
  }

  const s: any = {
    container: { maxWidth: '500px', margin: '0 auto', padding: '10px 10px 80px', fontFamily: 'sans-serif' },
    title: { fontSize: '26px', fontWeight: '900', textAlign: 'center', margin: '0', background: 'linear-gradient(to right, #2563eb, #9333ea)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' },
    siteDesc: { textAlign: 'center', fontSize: '11px', color: '#999', marginBottom: '8px' },
    adminMsg: { fontSize: '11px', background: '#f0f9ff', color: '#0369a1', padding: '10px', borderRadius: '8px', marginBottom: '10px', textAlign: 'center', border: '1px solid #bae6fd' },
    catGrid: { display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '3px', marginBottom: '10px' },
    card: { borderRadius: '12px', marginBottom: '12px', border: '1px solid #eee', overflow: 'hidden', position: 'relative' as const },
    modal: { position: 'fixed' as const, top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }
  }

  return (
    <div style={s.container}>
      {/* 𝕏シェアモーダル */}
      {justVoted && <div style={s.modal as any}><div style={{background:'white', padding:'24px', borderRadius:'20px', textAlign:'center', width:'100%', maxWidth:'320px'}}><h3>🎯 ヨソりました！</h3><button onClick={() => { const text = config.share_text_base.replace('{title}', justVoted.title).replace('{option}', justVoted.option); window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.origin)}`, '_blank') }} style={{background:'#000', color:'#fff', padding:'12px', borderRadius:'8px', width:'100%', fontWeight:'bold', border:'none'}}>𝕏に投稿する</button><button onClick={() => setJustVoted(null)} style={{marginTop:'10px', background:'none', border:'none', color:'#999'}}>閉じる</button></div></div>}

      {showAuthModal && <div style={s.modal as any}><div style={{background:'white', padding:'24px', borderRadius:'20px', width:'100%', maxWidth:'380px'}}><h2>ログイン</h2><input type="email" placeholder="メール" value={email} onChange={e => setEmail(e.target.value)} style={{width:'100%', padding:'10px', marginBottom:'8px'}} /><input type="password" placeholder="パス" value={password} onChange={e => setPassword(e.target.value)} style={{width:'100%', padding:'10px', marginBottom:'16px'}} /><div style={{display:'flex', gap:'8px'}}><button onClick={() => supabase.auth.signInWithPassword({email, password}).then(()=>setShowAuthModal(false))} style={{flex:1, padding:'12px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:'8px'}}>ログイン</button><button onClick={() => supabase.auth.signUp({email, password}).then(()=>setShowAuthModal(false))} style={{flex:1, padding:'12px', background:'#1f2937', color:'#fff', border:'none', borderRadius:'8px'}}>新規登録</button></div><button onClick={()=>setShowAuthModal(false)} style={{width:'100%', marginTop:'10px', background:'none', border:'none', color:'#999'}}>キャンセル</button></div></div>}

      <header>
        <h1 style={s.title}>{config.site_title}</h1>
        <div style={s.siteDesc}>{config.site_description}</div>
        {activeTab === 'home' && (
          <><div style={s.adminMsg}>{config.admin_message}</div>
            <div style={s.catGrid}>{dbCategories.map(c => <button key={c.name} onClick={() => setActiveCategory(c.name)} style={{padding:'6px 0', fontSize:'9px', fontWeight:'bold', background:activeCategory===c.name?'#1f2937':'#fff', color:activeCategory===c.name?'#fff':'#666', border:'1px solid #eee', borderRadius:'4px'}}>{c.name}</button>)}</div>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '8px', marginBottom: '10px' }}>{['new', 'deadline', 'popular'].map(t => <button key={t} onClick={() => setSortBy(t as any)} style={{ padding: '4px 12px', borderRadius: '15px', border: 'none', background: sortBy === t ? '#3b82f6' : '#eee', color: sortBy === t ? '#fff' : '#666', fontSize: '10px', fontWeight: 'bold' }}>{t === 'new' ? '✨新着' : t === 'deadline' ? '⏰締切' : '🔥人気'}</button>)}</div></>
        )}
      </header>

      {activeTab === 'home' && (
        <div>{markets.filter(m => activeCategory === 'すべて' || m.category === activeCategory).map(m => {
          const active = !m.is_resolved && new Date(m.end_date) > new Date(); const days = Math.ceil((new Date(m.end_date).getTime() - new Date().getTime()) / 86400000)
          return (<div key={m.id} style={s.card}><div style={{ height: '140px', position: 'relative', background: '#eee' }}>{m.image_url && <img src={m.image_url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}<div style={{ position: 'absolute', top: 8, left: 8, background: categoryMeta[m.category]?.color || '#666', color: '#fff', fontSize: '9px', padding: '2px 6px', borderRadius: '4px' }}>{m.category}</div>{active && <div style={{ position: 'absolute', top: 8, right: 8, background: '#fff', color: '#ef4444', fontSize: '9px', padding: '2px 6px', borderRadius: '4px', fontWeight: 'bold', border: '1px solid #ef4444' }}>あと{days}日</div>}<div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, padding: '10px', background: 'linear-gradient(to top, rgba(0,0,0,0.85), transparent)', color: '#fff' }}><h2 style={{ fontSize: '15px', margin: 0 }}>{m.title}</h2><div style={{fontSize:'10px', opacity:0.8}}>⏰ 締切: {new Date(m.end_date).toLocaleString()}</div></div></div>
            <div style={{ padding: '8px 10px' }}><div style={{ fontSize: '10px', color: '#555', background: '#f8f8f8', padding: '4px', borderRadius: '4px', marginBottom: '6px' }}>{m.description}</div>
              {m.market_options.map((opt: any, i: number) => { const pct = Math.round((opt.pool / (m.total_pool || 1)) * 100); return (<div key={opt.id} style={{ marginBottom: '4px' }}><div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '11px' }}><span>{m.result_option_id === opt.id ? '👑 ' : ''}{opt.name}</span><span style={{ color: '#3b82f6' }}>{opt.pool===0?0:(m.total_pool/opt.pool).toFixed(1)}倍 ({pct}%)</span></div><div style={{ height: '5px', background: '#eee', borderRadius: '3px', overflow: 'hidden' }}><div style={{ width: `${pct}%`, height: '100%', background: ['#3b82f6', '#ef4444', '#10b981'][i % 3] }} /></div></div>) })}
              {active ? (selectedMarketId === m.id ? (<div style={{ marginTop: '8px' }}><div style={{ display: 'flex', gap: '4px', flexWrap:'wrap' }}>{m.market_options.map((o: any) => (<button key={o.id} onClick={()=>setSelectedOptionId(o.id)} style={{ padding: '4px 8px', borderRadius: '15px', border: selectedOptionId === o.id ? '2px solid #3b82f6' : '1px solid #ddd', fontSize: '10px', background: '#fff' }}>{o.name}</button>))}</div><div style={{ display: 'flex', gap: '6px', alignItems: 'center', marginTop: '6px' }}><input type="range" min="10" max={profile?.point_balance || 1000} step="10" value={voteAmount} onChange={e => setVoteAmount(Number(e.target.value))} style={{ flex: 1 }} /><button onClick={handleVote} style={{ background: '#1f2937', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '11px', fontWeight: 'bold' }}>確定({voteAmount}pt)</button></div></div>) : (<button onClick={()=>setSelectedMarketId(m.id)} style={{ width: '100%', padding: '8px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: '8px', fontWeight: 'bold', marginTop: '6px' }}>ヨソる</button>)) : <div style={{ textAlign: 'center', fontSize: '11px', color: '#999', marginTop: '6px' }}>終了</div>}
            </div></div>)
        })}</div>
      )}

      {activeTab === 'ranking' && (
        <div style={{ border: '1px solid #eee', borderRadius: '12px' }}>
          {ranking.map((u, i) => (
            <div key={u.id} style={{ display: 'flex', padding: '12px', borderBottom: '1px solid #eee', fontSize: '14px', background: u.id === profile?.id ? '#fffbeb' : '#fff' }}>
              <span style={{ width: '30px', fontWeight: 'bold', color: i < 3 ? '#d97706' : '#999' }}>{i + 1}</span>
              <span style={{ flex: 1, fontWeight: u.id === profile?.id ? 'bold' : 'normal' }}>
                {u.username || '名無しさん'}{u.id === profile?.id && ' (あなた)'}
              </span>
              <span style={{ fontWeight: 'bold' }}>{u.point_balance.toLocaleString()}pt</span>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'mypage' && (
        <div>
          {!session ? (
            <div style={{textAlign:'center', padding:'40px'}}>
              <p style={{color:'#666', marginBottom:'20px'}}>ログインすると履歴の確認や名前の変更ができます</p>
              <button onClick={()=>setShowAuthModal(true)} style={{padding:'12px 24px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:'8px', fontWeight:'bold'}}>ログイン / 新規登録</button>
            </div>
          ) : (
            <>
              <div style={{ background: 'linear-gradient(135deg, #1e3a8a, #3b82f6)', color: '#fff', padding: '24px', borderRadius: '16px', textAlign: 'center', marginBottom: '20px' }}>
                {isEditingName ? (
                  <div style={{ display: 'flex', gap: '5px', justifyContent: 'center' }}>
                    <input value={newUsername} onChange={e => setNewUsername(e.target.value)} style={{ color: '#333', borderRadius: '4px', padding: '6px', border: 'none' }} />
                    <button onClick={handleUpdateName} style={{ background: '#fff', color: '#3b82f6', border: 'none', padding: '6px 12px', borderRadius: '4px', fontWeight: 'bold' }}>保存</button>
                  </div>
                ) : (
                  <div>
                    <span style={{ fontSize: '20px', fontWeight: 'bold' }}>{profile?.username || '名無しさん'}</span>
                    <button onClick={() => setIsEditingName(true)} style={{ fontSize: '10px', marginLeft: '8px', background: 'rgba(255,255,255,0.2)', color: '#fff', border: 'none', padding: '4px 8px', borderRadius: '4px' }}>名前編集</button>
                  </div>
                )}
                <div style={{ fontSize: '36px', fontWeight: '900', marginTop: '10px' }}>{profile?.point_balance?.toLocaleString()} <span style={{fontSize:'16px'}}>pt</span></div>
              </div>

              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '12px' }}>📜 ヨソり履歴</h3>
              <div style={{ display: 'grid', gap: '10px' }}>
                {myBets.map(b => (
                  <div key={b.id} style={{ padding: '12px', border: '1px solid #eee', borderRadius: '12px', background: '#fff', borderLeft: b.markets?.is_resolved && b.markets?.result_option_id === b.market_option_id ? '4px solid #10b981' : '1px solid #eee' }}>
                    <div style={{ fontSize: '11px', color: '#666' }}>{b.markets?.title}</div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '4px' }}>
                      <span style={{ fontWeight: 'bold', fontSize: '14px' }}>{b.market_options?.name} / {b.amount}pt</span>
                      <span style={{ fontSize: '12px', fontWeight: 'bold', color: b.markets?.is_resolved ? (b.markets?.result_option_id === b.market_option_id ? '#10b981' : '#ef4444') : '#999' }}>
                        {b.markets?.is_resolved ? (b.markets?.result_option_id === b.market_option_id ? '🎯 的中！' : '終了') : '判定中'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              <button onClick={() => supabase.auth.signOut()} style={{ width: '100%', marginTop: '30px', padding: '12px', color: '#ef4444', background: 'none', border: '1px solid #ef4444', borderRadius: '8px', fontWeight: 'bold' }}>ログアウト</button>
            </>
          )}
        </div>
      )}

      {activeTab === 'info' && (
        <div style={{ fontSize: '13px', lineHeight: '1.7', padding: '10px' }}>
          <section style={{background:'#f9f9f9', padding:'16px', borderRadius:'12px', border:'1px solid #eee', marginBottom:'20px'}}>
            <h3 style={{borderBottom:'2px solid #3b82f6', paddingBottom:'5px', color:'#1f2937', marginTop:0}}>📖 ヨソるの遊び方</h3>
            <p><strong>1. 未来を予想する</strong><br/>問いを選んで、自分の予想にポイントをヨソ（ベット）ります。</p>
            <p><strong>2. 配当を獲得する</strong><br/>的中すると、プールされたポイントが的中者全員に分配されます。</p>
            <p><strong>3. 安心の無料シミュレーター</strong><br/>ポイントは換金不可のゲーム内通貨です。安心して予想を楽しめます。</p>
          </section>
          <section style={{ background: '#f9f9f9', padding: '16px', borderRadius: '12px', border: '1px solid #eee' }}>
            <h3 style={{ borderBottom: '2px solid #3b82f6', paddingBottom: '5px', color:'#1f2937', marginTop:0 }}>⚖️ 法的ガイドライン</h3>
            <p>本サービスは刑法第185条の賭備には該当しない娯楽用シミュレーターです。取得ポイントは現金や財物へ換金できません。また、ランキング等で提供されるデジタル資産は景品表示法の範囲内で行われます。</p>
          </section>
          <div style={{ textAlign: 'center', marginTop: '40px' }}><Link href="/admin" style={{ color: '#eee', textDecoration: 'none', fontSize:'10px' }}>admin</Link></div>
        </div>
      )}

      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', display: 'flex', justifyContent: 'space-around', padding: '12px 0', borderTop: '1px solid #eee', zIndex: 100 }}>
        <button onClick={() => setActiveTab('home')} style={{ background: 'none', border: 'none', color: activeTab === 'home' ? '#3b82f6' : '#999', fontSize:'11px', fontWeight:'bold' }}>🏠<br />ホーム</button>
        <button onClick={() => setActiveTab('ranking')} style={{ background: 'none', border: 'none', color: activeTab === 'ranking' ? '#3b82f6' : '#999', fontSize:'11px', fontWeight:'bold' }}>👑<br />ランク</button>
        <button onClick={() => setActiveTab('mypage')} style={{ background: 'none', border: 'none', color: activeTab === 'mypage' ? '#3b82f6' : '#999', fontSize:'11px', fontWeight:'bold' }}>👤<br />マイペ</button>
        <button onClick={() => setActiveTab('info')} style={{ background: 'none', border: 'none', color: activeTab === 'info' ? '#3b82f6' : '#999', fontSize:'11px', fontWeight:'bold' }}>📖<br />ガイド</button>
      </nav>
    </div>
  )
}
