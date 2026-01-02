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
  const [config, setConfig] = useState<any>({ site_title: 'ヨソる', site_description: '', admin_message: '', show_ranking: true, share_text_base: '「{title}」の「{option}」にヨソりました！' })

  const [showAuthModal, setShowAuthModal] = useState(false)
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('')
  const [newUsername, setNewUsername] = useState(''); const [isEditingName, setIsEditingName] = useState(false)
  const [activeCategory, setActiveCategory] = useState('すべて')
  const [sortBy, setSortBy] = useState<'new' | 'deadline' | 'popular'>('new')
  const [voteAmount, setVoteAmount] = useState(100)
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null)
  const [justVoted, setJustVoted] = useState<any>(null)

  const fetchMarkets = useCallback(async () => {
    let query = supabase.from('markets').select('*, market_options(*)')
    if (sortBy === 'new') query = query.order('created_at', { ascending: false })
    else if (sortBy === 'deadline') query = query.order('end_date', { ascending: true })
    else if (sortBy === 'popular') query = query.order('total_pool', { ascending: false })
    const { data } = await query
    if (data) setMarkets(data.map((m: any) => ({ ...m, market_options: m.market_options.sort((a: any, b: any) => a.id - b.id) })))
  }, [sortBy])

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
      fetchMarkets()
      const { data: r } = await supabase.from('profiles').select('*').eq('is_hidden_from_ranking', false).order('point_balance', { ascending: false }).limit(20)
      if (r) setRanking(r)
    }
    init()
  }, [sortBy, fetchMarkets, initUserData])

  const handleVote = async () => {
    if (!session) { setShowAuthModal(true); return; }
    if (!selectedOptionId) return alert('先に「答え」の選択肢をひとつ選んでください！')
    const { error } = await supabase.rpc('place_bet', { market_id_input: selectedMarketId, option_id_input: selectedOptionId, amount_input: voteAmount })
    if (!error) {
      const m = markets.find(m => m.id === selectedMarketId); const o = m?.market_options.find((o: any) => o.id === selectedOptionId)
      setJustVoted({ title: m?.title, option: o?.name }); setSelectedMarketId(null); setSelectedOptionId(null); fetchMarkets(); initUserData(session.user.id)
    } else alert(error.message)
  }

  // 上位者向けの装飾スタイル
  const getRankStyle = (index: number) => {
    if (index === 0) return { color: '#d97706', badge: '👑', aura: '0 0 10px #fde68a' }
    if (index === 1) return { color: '#4b5563', badge: '🥈', aura: 'none' }
    if (index === 2) return { color: '#92400e', badge: '🥉', aura: 'none' }
    return { color: '#999', badge: '', aura: 'none' }
  }

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto', padding: '10px 10px 80px', fontFamily: 'sans-serif', background: '#fff' }}>
      {/* 𝕏シェアモーダル */}
      {justVoted && <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'20px'}}>
        <div style={{background:'white', padding:'24px', borderRadius:'20px', textAlign:'center', width:'100%', maxWidth:'320px'}}>
          <h3 style={{margin:'0 0 10px'}}>🎯 ヨソりました！</h3>
          <button onClick={() => { const text = config.share_text_base.replace('{title}', justVoted.title).replace('{option}', justVoted.option); window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.origin)}`, '_blank') }} style={{background:'#000', color:'#fff', padding:'12px', borderRadius:'8px', width:'100%', fontWeight:'bold', border:'none'}}>𝕏に投稿して自慢する</button>
          <button onClick={() => setJustVoted(null)} style={{marginTop:'10px', background:'none', border:'none', color:'#999'}}>閉じる</button>
        </div>
      </div>}

      {showAuthModal && <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'20px'}}><div style={{background:'white', padding:'24px', borderRadius:'20px', width:'100%', maxWidth:'380px', textAlign:'center'}}>
        <h2 style={{fontSize:'20px', fontWeight:'900', marginBottom:'15px'}}>ヨソるを開始</h2>
        <button onClick={() => supabase.auth.signInWithOAuth({provider:'google'})} style={{width:'100%', padding:'12px', marginBottom:'10px', borderRadius:'8px', border:'1px solid #ddd', background:'#fff', fontWeight:'bold'}}>Googleでログイン</button>
        <button onClick={() => supabase.auth.signInAnonymously().then(()=>setShowAuthModal(false))} style={{width:'100%', padding:'12px', borderRadius:'8px', border:'none', background:'#eee', fontWeight:'bold', color:'#666'}}>ゲスト利用（匿名）</button>
        <button onClick={()=>setShowAuthModal(false)} style={{marginTop:'15px', background:'none', border:'none', color:'#999'}}>閉じる</button>
      </div></div>}

      <header>
        <h1 style={{fontSize:'26px', fontWeight:'900', textAlign:'center', background:'linear-gradient(to right, #2563eb, #9333ea)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent'}}>{config.site_title}</h1>
        <div style={{ textAlign: 'center', fontSize: '11px', color: '#999', marginBottom: '8px' }}>{config.site_description}</div>
        {activeTab === 'home' && (
          <><div style={{fontSize:'11px', background:'#f0f9ff', padding:'8px', borderRadius:'6px', textAlign:'center', border:'1px solid #bae6fd'}}>{config.admin_message}</div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:'3px', margin:'10px 0'}}>{dbCategories.map(c => <button key={c.name} onClick={() => setActiveCategory(c.name)} style={{padding:'6px 0', fontSize:'9px', fontWeight:'bold', background:activeCategory===c.name?'#1f2937':'#fff', color:activeCategory===c.name?'#fff':'#666', border:'1px solid #eee', borderRadius:'4px'}}>{c.name}</button>)}</div>
            <div style={{display:'flex', justifyContent:'center', gap:'8px'}}>{['new', 'deadline', 'popular'].map(t => <button key={t} onClick={() => setSortBy(t as any)} style={{padding:'4px 12px', borderRadius:'15px', border:'none', background:sortBy===t?'#3b82f6':'#eee', color:sortBy===t?'#fff':'#666', fontSize:'10px', fontWeight:'bold'}}>{t==='new'?'✨新着':t==='deadline'?'⏰締切':'🔥人気'}</button>)}</div></>
        )}
      </header>

      {activeTab === 'home' && (
        <div style={{marginTop:'15px'}}>{markets.filter(m => activeCategory === 'すべて' || m.category === activeCategory).map(m => {
          const active = !m.is_resolved && new Date(m.end_date) > new Date(); const days = Math.ceil((new Date(m.end_date).getTime() - new Date().getTime()) / 86400000)
          const isPopular = m.total_pool > 1000; const isUrgent = active && days <= 2;
          return (<div key={m.id} style={{borderRadius:'12px', marginBottom:'12px', border: isUrgent ? '2px solid #ef4444' : '1px solid #eee', overflow:'hidden', position:'relative'}}>
            {isUrgent && <div style={{position:'absolute', top:5, right:5, background:'#ef4444', color:'#fff', fontSize:'10px', padding:'2px 8px', borderRadius:'10px', zIndex:10, fontWeight:'bold'}}>🔥 締切間近</div>}
            {isPopular && !isUrgent && <div style={{position:'absolute', top:5, right:5, background:'#f59e0b', color:'#fff', fontSize:'10px', padding:'2px 8px', borderRadius:'10px', zIndex:10, fontWeight:'bold'}}>💎 大注目</div>}
            <div style={{height:'140px', position:'relative', background:'#eee'}}>{m.image_url && <img src={m.image_url} style={{width:'100%', height:'100%', objectFit:'cover'}} />}<div style={{position:'absolute', bottom:0, left:0, right:0, padding:'10px', background:'linear-gradient(to top, rgba(0,0,0,0.85), transparent)', color:'#fff'}}><h2 style={{fontSize:'15px', margin:0}}>{m.title}</h2><div style={{fontSize:'10px', opacity:0.8}}>⏰ {new Date(m.end_date).toLocaleString()}</div></div></div>
            <div style={{padding:'8px 10px'}}>{m.market_options.map((opt: any, i: number) => { const pct = Math.round((opt.pool / (m.total_pool || 1)) * 100); return (<div key={opt.id} style={{marginBottom:'4px'}}><div style={{display:'flex', justifyContent:'space-between', fontSize:'11px'}}><span>{m.result_option_id === opt.id ? '👑 ' : ''}{opt.name}</span><span style={{color:'#3b82f6'}}>{opt.pool===0?0:(m.total_pool/opt.pool).toFixed(1)}倍 ({pct}%)</span></div><div style={{height:'5px', background:'#eee', borderRadius:'3px', overflow:'hidden'}}><div style={{width:`${pct}%`, height:'100%', background:['#3b82f6', '#ef4444', '#10b981'][i%3]}} /></div></div>) })}
            {active ? (selectedMarketId === m.id ? (<div style={{marginTop:'8px', background:'#f8fafc', padding:'10px', borderRadius:'8px'}}><div style={{display:'flex', gap:'4px', flexWrap:'wrap', marginBottom:'10px'}}>{m.market_options.map((o: any) => (<button key={o.id} onClick={()=>setSelectedOptionId(o.id)} style={{padding:'6px 10px', borderRadius:'15px', border:selectedOptionId===o.id?'2px solid #3b82f6':'1px solid #ddd', fontSize:'11px', background:'#fff'}}>{o.name}</button>))}</div>
                <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'10px'}}><input type="range" min="10" max={profile?.point_balance || 1000} step="10" value={voteAmount} onChange={e => setVoteAmount(Number(e.target.value))} style={{flex:1}} /><input type="number" value={voteAmount} onChange={e => setVoteAmount(Number(e.target.value))} style={{width:'50px', border:'1px solid #ddd', borderRadius:'4px', fontSize:'11px'}} /></div>
                <button onClick={handleVote} style={{width:'100%', padding:'10px', background:'#1f2937', color:'#fff', borderRadius:'8px', fontWeight:'bold', border:'none'}}>確定</button></div>) : (<button onClick={()=>setSelectedMarketId(m.id)} style={{width:'100%', padding:'8px', background:'#3b82f6', color:'#fff', borderRadius:'8px', fontWeight:'bold', border:'none', marginTop:'6px'}}>ヨソる</button>)) : <div style={{textAlign:'center', fontSize:'11px', color:'#999', marginTop:'6px'}}>終了</div>}
          </div></div>)
        })}</div>
      )}

      {activeTab === 'ranking' && (
        <div style={{ border: '1px solid #eee', borderRadius: '12px', overflow: 'hidden' }}>
          {ranking.map((u, i) => {
            const r = getRankStyle(i)
            return (
              <div key={u.id} style={{ display: 'flex', alignItems: 'center', padding: '15px', borderBottom: '1px solid #eee', background: u.id === profile?.id ? '#fffbeb' : '#fff', boxShadow: r.aura }}>
                <div style={{ width: '40px', fontSize: '18px', textAlign: 'center' }}>
                  {r.badge ? r.badge : <span style={{ color: '#999', fontSize: '14px' }}>{i + 1}</span>}
                </div>
                <div style={{ flex: 1, marginLeft: '10px' }}>
                  <div style={{ fontWeight: 'bold', fontSize: '15px', color: i < 3 ? '#1f2937' : '#4b5563' }}>
                    {u.username || '名無しさん'}{u.id === profile?.id && <span style={{fontSize:'10px', marginLeft:'5px', color:'#3b82f6'}}>(あなた)</span>}
                  </div>
                  <div style={{ fontSize: '11px', color: '#999' }}>通算スコア</div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: '900', fontSize: '16px', color: r.color }}>{u.point_balance.toLocaleString()}</div>
                  <div style={{ fontSize: '10px', color: '#999' }}>pt</div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {activeTab === 'mypage' && (
        <div>
          {!session ? <div style={{textAlign:'center', padding:'40px'}}><button onClick={()=>setShowAuthModal(true)} style={{padding:'12px 24px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:'8px', fontWeight:'bold'}}>ログインして開始</button></div> : 
          <>
            <div style={{background:'linear-gradient(135deg, #1e3a8a, #3b82f6)', color:'#fff', padding:'24px', borderRadius:'16px', textAlign:'center'}}>
              {isEditingName ? (<div style={{display:'flex', gap:'5px', justifyContent:'center'}}><input value={newUsername} onChange={e=>setNewUsername(e.target.value)} style={{color:'#333', borderRadius:'4px', padding:'4px'}} /><button onClick={() => supabase.from('profiles').update({username: newUsername}).eq('id', profile.id).then(() => {setIsEditingName(false); initUserData(profile.id);})} style={{background:'#fff', color:'#3b82f6', border:'none', padding:'4px 8px', borderRadius:'4px', fontWeight:'bold'}}>保存</button></div>) : (<div><span style={{fontSize:'18px', fontWeight:'bold'}}>{profile?.username || '名無しさん'}</span><button onClick={()=>setIsEditingName(true)} style={{fontSize:'10px', marginLeft:'8px', background:'rgba(255,255,255,0.2)', color:'#fff', border:'none', padding:'2px 6px', borderRadius:'4px'}}>編集</button></div>)}
              <div style={{fontSize:'32px', fontWeight:'900', marginTop:'10px'}}>{profile?.point_balance?.toLocaleString()} pt</div>
            </div>
            <h3 style={{fontSize:'14px', margin:'20px 0 10px'}}>📜 ヨソり履歴</h3>
            {myBets.map(b => (
              <div key={b.id} style={{padding:'12px', border:'1px solid #eee', borderRadius:'10px', marginBottom:'8px', fontSize:'13px', borderLeft: b.markets.is_resolved && b.markets.result_option_id === b.market_option_id ? '4px solid #10b981' : '1px solid #eee'}}>
                <div style={{color:'#666', fontSize:'11px'}}>{b.markets.title}</div>
                <div style={{display:'flex', justifyContent:'space-between', fontWeight:'bold', marginTop:'4px'}}>
                  <span>{b.market_options.name} / {b.amount}pt</span>
                  <span style={{color: b.markets.is_resolved ? (b.markets.result_option_id === b.market_option_id ? '#10b981' : '#ef4444') : '#666'}}>
                    {b.markets.is_resolved ? (b.markets.result_option_id === b.market_option_id ? '🎯 的中！' : '終了') : '判定中'}
                  </span>
                </div>
              </div>
            ))}
            <button onClick={()=>supabase.auth.signOut()} style={{width:'100%', marginTop:'20px', color:'#ef4444', background:'none', border:'1px solid #ef4444', padding:'10px', borderRadius:'8px', fontWeight:'bold'}}>ログアウト</button>
          </>}
        </div>
      )}

      {activeTab === 'info' && (
        <div style={{ fontSize: '13px', padding: '10px' }}>
          <section style={{background:'#f9f9f9', padding:'16px', borderRadius:'12px', border:'1px solid #eee', marginBottom:'20px'}}>
            <h3 style={{borderBottom:'2px solid #3b82f6', paddingBottom:'5px', marginTop:0}}>⚖️ 法的ガイドライン</h3>
            <p style={{fontSize:'12px', color:'#666'}}>取得ポイントはゲーム内通貨であり換金不可です。本サービスは刑法185条（賭博）に該当しません。</p>
          </section>
          <div style={{ textAlign: 'center', marginTop: '40px' }}><Link href="/admin" style={{ color: '#eee', textDecoration: 'none', fontSize: '10px' }}>admin</Link></div>
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
