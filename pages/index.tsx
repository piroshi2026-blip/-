import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient'

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

  // 初期表示を締切順に設定
  const [sortBy, setSortBy] = useState<'new' | 'deadline' | 'popular'>('deadline')

  const [voteAmount, setVoteAmount] = useState(100)
  const [selectedMarketId, setSelectedMarketId] = useState<number | null>(null)
  const [selectedOptionId, setSelectedOptionId] = useState<number | null>(null)
  const [justVoted, setJustVoted] = useState<any>(null)

  const categoryMeta: any = { 'こども': { color: '#f43f5e' }, '経済・投資': { color: '#3b82f6' }, 'エンタメ': { color: '#a855f7' }, 'スポーツ': { color: '#22c55e' }, '旅・生活': { color: '#f59e0b' }, 'ゲーム': { color: '#10b981' }, '恋愛': { color: '#ec4899' }, '芸術・デザイン': { color: '#8b5cf6' }, '自然・科学': { color: '#06b6d4' }, '政治・思想': { color: '#6366f1' }, 'その他': { color: '#6b7280' } }

  const fetchMarkets = useCallback(async () => {
    let query = supabase.from('markets').select('*, market_options(*)')
    if (sortBy === 'new') query = query.order('created_at', { ascending: false })
    else if (sortBy === 'deadline') query = query.order('end_date', { ascending: true })
    else if (sortBy === 'popular') query = query.order('total_pool', { ascending: false })
    const { data } = await query
    if (data) {
      // 確定済みを後ろに回すソート
      const sortedData = data.sort((a, b) => {
        if (a.is_resolved === b.is_resolved) return 0;
        return a.is_resolved ? 1 : -1;
      });
      setMarkets(sortedData.map((m: any) => ({ ...m, market_options: m.market_options.sort((a: any, b: any) => a.id - b.id) })))
    }
  }, [sortBy])

  const initUserData = useCallback(async (userId: string) => {
    const { data: p } = await supabase.from('profiles').select('*').eq('id', userId).single()
    if (p) { setProfile(p); setNewUsername(p.username || ''); }
    const { data: b } = await supabase.from('bets').select('*, markets(title, is_resolved, result_option_id, total_pool, market_options(id, pool)), market_options(name)').eq('user_id', userId).order('created_at', { ascending: false })
    if (b) setMyBets(b)
  }, [])

  useEffect(() => {
    if (!isSupabaseConfigured) return
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
    const { data: authListener } = supabase.auth.onAuthStateChange((_, s) => { 
      setSession(s); if (s) initUserData(s.user.id); else { setSession(null); setProfile(null); setMyBets([]); }
    })
    return () => authListener.subscription.unsubscribe()
  }, [sortBy, fetchMarkets, initUserData])

  const handleUpdateName = async () => {
    if (!profile) return
    const { error } = await supabase.from('profiles').update({ username: newUsername }).eq('id', profile.id)
    if (!error) { setIsEditingName(false); initUserData(profile.id); alert('名前を変更しました'); }
  }

  const handleVote = async () => {
    if (!session) { setShowAuthModal(true); return; }
    if (!selectedOptionId) return alert('先に「答え」の選択肢をひとつ選んでください！')
    const { error } = await supabase.rpc('place_bet', { market_id_input: selectedMarketId, option_id_input: selectedOptionId, amount_input: voteAmount })
    if (!error) {
      const m = markets.find(m => m.id === selectedMarketId); const o = m?.market_options.find((o: any) => o.id === selectedOptionId)
      setJustVoted({ title: m?.title, option: o?.name }); setSelectedMarketId(null); setSelectedOptionId(null); fetchMarkets(); initUserData(session.user.id)
    } else alert(error.message)
  }

  if (!isSupabaseConfigured) {
    return (
      <div style={{ maxWidth: '500px', margin: '0 auto', padding: '40px 20px', fontFamily: 'sans-serif', minHeight: '100vh', background: '#f8fafc' }}>
        <h1 style={{ fontSize: '20px', fontWeight: 900, marginBottom: '16px' }}>Supabase の設定が必要です</h1>
        <p style={{ color: '#475569', lineHeight: 1.6, marginBottom: '12px' }}>
          プロジェクトルートに <code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>.env.local</code> を作成し、次の値を設定してください。
        </p>
        <pre style={{ background: '#1e293b', color: '#e2e8f0', padding: '16px', borderRadius: '12px', fontSize: '12px', overflow: 'auto' }}>
{`NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key`}
        </pre>
        <p style={{ color: '#64748b', fontSize: '13px', marginTop: '16px' }}>
          Supabase ダッシュボードの Project Settings → API から取得できます。設定後は開発サーバーを再起動してください。
        </p>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '500px', margin: '0 auto', padding: '10px 10px 80px', fontFamily: 'sans-serif', background: '#f8fafc', minHeight: '100vh' }}>
      {justVoted && <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.8)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'20px'}}><div style={{background:'white', padding:'24px', borderRadius:'24px', textAlign:'center', width:'100%', maxWidth:'320px'}}><div style={{fontSize:'40px', marginBottom:'10px'}}>🎯</div><h3 style={{margin:'0 0 10px', fontSize:'20px', fontWeight:'900'}}>ヨソりました！</h3><button onClick={() => { const text = config.share_text_base.replace('{title}', justVoted.title).replace('{option}', justVoted.option); window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.origin)}`, '_blank') }} style={{background:'#000', color:'#fff', padding:'14px', borderRadius:'12px', width:'100%', fontWeight:'bold', border:'none'}}>𝕏に投稿して自慢する</button><button onClick={() => setJustVoted(null)} style={{background:'none', border:'none', color:'#999', fontSize:'13px', marginTop:'10px'}}>閉じる</button></div></div>}

      {showAuthModal && <div style={{position:'fixed', top:0, left:0, right:0, bottom:0, background:'rgba(0,0,0,0.7)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:'20px'}}><div style={{background:'white', padding:'24px', borderRadius:'20px', width:'100%', maxWidth:'380px', textAlign:'center'}}><h2 style={{fontSize:'20px', fontWeight:'900', marginBottom:'15px'}}>ヨソるを開始</h2><button onClick={() => supabase.auth.signInWithOAuth({provider:'google'})} style={{width:'100%', padding:'12px', marginBottom:'10px', borderRadius:'8px', border:'1px solid #ddd', background:'#fff', fontWeight:'bold', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px'}}><img src="https://www.google.com/favicon.ico" alt="Google icon" width="16"/>Googleでつづける</button><div style={{margin:'15px 0', color:'#999', fontSize:'12px'}}>またはメールアドレスで</div><input type="email" placeholder="メール" value={email} onChange={e => setEmail(e.target.value)} style={{width:'100%', padding:'10px', marginBottom:'8px', borderRadius:'8px', border:'1px solid #eee'}} /><input type="password" placeholder="パス" value={password} onChange={e => setPassword(e.target.value)} style={{width:'100%', padding:'10px', marginBottom:'16px', borderRadius:'8px', border:'1px solid #eee'}} /><div style={{display:'flex', gap:'8px'}}><button onClick={() => supabase.auth.signInWithPassword({email, password}).then(()=>setShowAuthModal(false))} style={{flex:1, padding:'12px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:'8px'}}>ログイン</button><button onClick={() => supabase.auth.signUp({email, password}).then(()=>setShowAuthModal(false))} style={{flex:1, padding:'12px', background:'#1f2937', color:'#fff', border:'none', borderRadius:'8px'}}>新規登録</button></div><button onClick={() => supabase.auth.signInAnonymously().then(()=>setShowAuthModal(false))} style={{background:'none', border:'none', color:'#999', fontSize:'12px', marginTop:'15px'}}>ゲスト利用（匿名）</button></div></div>}

      <header>
        <h1 style={{fontSize:'28px', fontWeight:'900', textAlign:'center', background:'linear-gradient(to right, #2563eb, #9333ea)', WebkitBackgroundClip:'text', WebkitTextFillColor:'transparent', margin:'10px 0 5px'}}>{config.site_title}</h1>
        <div style={{ textAlign: 'center', fontSize: '11px', color: '#999', marginBottom: '8px' }}>{config.site_description}</div>
        {activeTab === 'home' && (
          <><div style={{fontSize:'11px', background:'#fff', padding:'8px', borderRadius:'8px', textAlign:'center', border:'1px solid #e2e8f0', color:'#64748b', marginBottom:'10px'}}>{config.admin_message}</div>
            <div style={{display:'grid', gridTemplateColumns:'repeat(6, 1fr)', gap:'4px', margin:'10px 0'}}>{dbCategories.map(c => <button key={c.name} onClick={() => setActiveCategory(c.name)} style={{padding:'6px 0', fontSize:'9px', fontWeight:'bold', background:activeCategory===c.name?'#1f2937':'#fff', color:activeCategory===c.name?'#fff':'#64748b', border:'1px solid #e2e8f0', borderRadius:'6px'}}>{c.name}</button>)}</div>
            <div style={{display:'flex', justifyContent:'center', gap:'8px'}}>{['new', 'deadline', 'popular'].map(t => <button key={t} onClick={() => setSortBy(t as any)} style={{padding:'6px 16px', borderRadius:'20px', border:'none', background:sortBy===t?'#3b82f6':'#e2e8f0', color:sortBy===t?'#fff':'#64748b', fontSize:'11px', fontWeight:'bold'}}>{t==='new'?'✨新着':t==='deadline'?'⏰締切':t==='popular'?'🔥人気':''}</button>)}</div></>
        )}
      </header>

      {activeTab === 'home' && (
        <div style={{marginTop:'15px'}}>{markets.filter(m => activeCategory === 'すべて' || m.category === activeCategory).map(m => {
          const active = !m.is_resolved && new Date(m.end_date) > new Date(); 
          const days = Math.ceil((new Date(m.end_date).getTime() - new Date().getTime()) / 86400000);
          const isPopular = m.total_pool > 1000; const isUrgent = active && days <= 2;
          return (
            <div key={m.id} style={{borderRadius:'16px', marginBottom:'16px', border: isUrgent ? '2px solid #ef4444' : '1px solid #e2e8f0', overflow:'hidden', position:'relative', background:'#fff', boxShadow:'0 4px 6px -1px rgba(0,0,0,0.05)', opacity: m.is_resolved ? 0.8 : 1}}>
              <div style={{position:'absolute', top:10, right:10, zIndex:10, display:'flex', gap:'5px'}}>
                {m.is_resolved && <div style={{background:'#10b981', color:'#fff', fontSize:'10px', padding:'4px 8px', borderRadius:'8px', fontWeight:'bold'}}>✅ 確定済み</div>}
                {isPopular && !m.is_resolved && <div style={{background:'#f59e0b', color:'#fff', fontSize:'10px', padding:'4px 8px', borderRadius:'8px', fontWeight:'bold'}}>💎 人気</div>}
                {active && <div style={{background:isUrgent?'#ef4444':'#1f2937', color:'#fff', fontSize:'10px', padding:'4px 8px', borderRadius:'8px', fontWeight:'bold'}}>⏰ あと{days}日</div>}
              </div>
              <div style={{height:'150px', position:'relative', background:'#eee'}}>{m.image_url && <img src={m.image_url} alt={m.title} style={{width:'100%', height:'100%', objectFit:'cover', filter: m.is_resolved ? 'grayscale(40%)' : 'none'}} />}
                <div style={{position:'absolute', top:10, left:10, background: categoryMeta[m.category]?.color || '#374151', color:'#fff', fontSize:'9px', padding:'4px 10px', borderRadius:'6px', fontWeight:'bold'}}>{m.category}</div>
                <div style={{position:'absolute', bottom:0, left:0, right:0, padding:'15px', background:'linear-gradient(to top, rgba(0,0,0,0.9), transparent)', color:'#fff'}}><h2 style={{fontSize:'16px', margin:0, fontWeight:'800'}}>{m.title}</h2></div>
              </div>
              <div style={{padding:'12px'}}>
                <div style={{fontSize:'10px', color:'#94a3b8', marginBottom:'6px'}}>⏰ {m.is_resolved ? '終了日時' : '締切'}: {new Date(m.end_date).toLocaleString()}</div>
                <div style={{ fontSize: '11px', color: '#64748b', background: '#f1f5f9', padding: '8px 10px', borderRadius: '8px', marginBottom: '12px', borderLeft: '4px solid #cbd5e1', lineHeight: '1.4' }}><strong>判定基準:</strong> {m.description}</div>
                {m.market_options.map((opt: any, i: number) => { const pct = Math.round((opt.pool / (m.total_pool || 1)) * 100); return (<div key={opt.id} style={{marginBottom:'6px'}}><div style={{display:'flex', justifyContent:'space-between', fontSize:'12px', marginBottom:'2px'}}><span>{m.result_option_id === opt.id ? '👑 ' : ''}{opt.name}</span><span style={{fontWeight:'bold', color: m.result_option_id === opt.id ? '#10b981' : '#2563eb'}}>{opt.pool===0?0:(m.total_pool/opt.pool).toFixed(1)}倍 <span style={{color:'#94a3b8', fontSize:'10px'}}>({pct}%)</span></span></div><div style={{height:'6px', background:'#e2e8f0', borderRadius:'3px', overflow:'hidden'}}><div style={{width:`${pct}%`, height:'100%', background: m.result_option_id === opt.id ? '#10b981' : ['#3b82f6', '#ef4444', '#10b981'][i%3]}} /></div></div>) })}
                {active ? (selectedMarketId === m.id ? (<div style={{marginTop:'12px', background:'#f8fafc', padding:'12px', borderRadius:'12px', border:'1px solid #e2e8f0'}}><div style={{display:'flex', gap:'6px', flexWrap:'wrap', marginBottom:'12px'}}>{m.market_options.map((o: any) => (<button key={o.id} onClick={()=>setSelectedOptionId(o.id)} style={{padding:'8px 12px', borderRadius:'20px', border:selectedOptionId===o.id?'2px solid #2563eb':'1px solid #cbd5e1', fontSize:'12px', background:'#fff', color:selectedOptionId===o.id?'#2563eb':'#475569'}}>{o.name}</button>))}</div>
                  <div style={{display:'flex', alignItems:'center', gap:'10px', marginBottom:'12px'}}><input type="range" min="10" max={profile?.point_balance || 1000} step="10" value={voteAmount} onChange={e => setVoteAmount(Number(e.target.value))} style={{flex:1}} /><input type="number" value={voteAmount} onChange={e => setVoteAmount(Number(e.target.value))} style={{width:'70px', border:'1px solid #cbd5e1', borderRadius:'8px', padding:'5px', fontSize:'13px', textAlign:'center'}} /> <span style={{fontSize:'12px'}}>pt</span></div>
                  <button onClick={handleVote} style={{width:'100%', padding:'12px', background:'#1f2937', color:'#fff', borderRadius:'12px', fontWeight:'bold', border:'none'}}>確定する</button></div>) : (<button onClick={()=>setSelectedMarketId(m.id)} style={{width:'100%', padding:'10px', background:'#3b82f6', color:'#fff', borderRadius:'10px', fontWeight:'bold', border:'none', marginTop:'10px'}}>ヨソる</button>)) : <div style={{textAlign:'center', fontSize:'12px', color: m.is_resolved ? '#10b981' : '#94a3b8', marginTop:'10px', padding:'8px', background: m.is_resolved ? '#ecfdf5' : '#f1f5f9', borderRadius:'8px', fontWeight: m.is_resolved ? 'bold' : 'normal'}}>{m.is_resolved ? `正解：${m.market_options.find((o:any) => o.id === m.result_option_id)?.name || '未設定'}` : '判定中'}</div>}
              </div>
            </div>
          )
        })}</div>
      )}

      {activeTab === 'ranking' && (
        <div style={{ border: '1px solid #e2e8f0', borderRadius: '16px', overflow: 'hidden', background:'#fff' }}>
          {ranking.map((u, i) => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', padding: '16px', borderBottom: '1px solid #f1f5f9', background: u.id === profile?.id ? '#fffbeb' : '#fff' }}>
              <div style={{ width: '45px', fontSize: '20px', textAlign: 'center' }}>{i === 0 ? '👑' : i === 1 ? '🥈' : i === 2 ? '🥉' : i + 1}</div>
              <div style={{ flex: 1, marginLeft: '10px' }}><strong>{u.username || '名無しさん'}</strong>{u.id === profile?.id && <span style={{fontSize:'10px', marginLeft:'5px', color:'#3b82f6'}}>(あなた)</span>}</div>
              <div style={{ fontWeight: '900', color: i === 0 ? '#d97706' : '#475569' }}>{u.point_balance.toLocaleString()} pt</div>
            </div>
          ))}
        </div>
      )}

      {activeTab === 'mypage' && (
        <div>
          {!session ? <div style={{textAlign:'center', padding:'40px'}}><button onClick={()=>setShowAuthModal(true)} style={{padding:'12px 24px', background:'#3b82f6', color:'#fff', border:'none', borderRadius:'8px', fontWeight:'bold'}}>ログインして開始</button></div> : 
          <>
            <div style={{background:'linear-gradient(135deg, #1e3a8a, #3b82f6)', color:'#fff', padding:'30px 20px', borderRadius:'24px', textAlign:'center', boxShadow:'0 10px 20px rgba(30,58,138,0.2)', marginBottom:'25px'}}>
              {isEditingName ? (
                <div style={{display:'flex', gap:'8px', justifyContent:'center', alignItems:'center'}}>
                  <input value={newUsername} onChange={e=>setNewUsername(e.target.value)} style={{color:'#333', borderRadius:'8px', padding:'8px 12px', border:'none', width:'150px'}} />
                  <button onClick={handleUpdateName} style={{background:'#10b981', color:'#fff', border:'none', padding:'8px 15px', borderRadius:'8px', fontWeight:'bold'}}>保存</button>
                </div>
              ) : (
                <div>
                  <span style={{fontSize:'20px', fontWeight:'900'}}>{profile?.username || '名無しさん'}</span>
                  <button onClick={()=>setIsEditingName(true)} style={{fontSize:'11px', marginLeft:'10px', background:'rgba(255,255,255,0.2)', color:'#fff', border:'none', padding:'4px 10px', borderRadius:'6px'}}>名前変更</button>
                </div>
              )}
              <div style={{fontSize:'36px', fontWeight:'900', marginTop:'15px'}}>{profile?.point_balance?.toLocaleString()} <span style={{fontSize:'16px', opacity:0.8}}>pt</span></div>
              <div style={{fontSize:'11px', opacity:0.7, marginTop:'5px'}}>保有スコア</div>
            </div>

            <h3 style={{fontSize:'16px', fontWeight:'800', margin:'0 0 15px'}}>📜 ヨソり履歴</h3>
            {myBets.map(b => {
              const isWin = b.markets.is_resolved && b.markets.result_option_id === b.option_id;
              const pool = b.markets.total_pool || 0;
              const winOption = b.markets.market_options?.find((o:any) => o.id === b.option_id);
              const winOptionPool = winOption?.pool || 0;
              const odds = winOptionPool > 0 ? (pool / winOptionPool).toFixed(1) : "0";
              const payout = isWin ? Math.floor(b.amount * Number(odds)) : 0;

              return (
                <div key={b.id} style={{padding:'15px', background:'#fff', border:'1px solid #e2e8f0', borderRadius:'16px', marginBottom:'10px', borderLeft: b.markets.is_resolved && isWin ? '6px solid #10b981' : b.markets.is_resolved ? '6px solid #ef4444' : '6px solid #cbd5e1'}}>
                  <div style={{fontSize:'11px', color:'#64748b'}}>{b.markets.title}</div>
                  <div style={{display:'flex', justifyContent:'space-between', alignItems:'flex-end', marginTop:'5px'}}>
                    <div>
                      <div style={{fontSize:'13px', fontWeight:'bold'}}>{b.market_options.name} / {b.amount}pt</div>
                      {isWin && (
                        <div style={{fontSize:'11px', color:'#10b981', fontWeight:'bold'}}>獲得: +{payout.toLocaleString()}pt ({odds}倍)</div>
                      )}
                    </div>
                    <div style={{textAlign:'right'}}>
                      <div style={{fontSize:'12px', fontWeight:'bold', color: b.markets.is_resolved ? (isWin ? '#10b981' : '#ef4444') : '#666'}}>
                        {b.markets.is_resolved ? (isWin ? '🎯 的中！' : '不的中') : '判定中'}
                      </div>
                      {isWin && (
                        <button 
                          onClick={() => {
                            const text = `【的中！】「${b.markets.title}」の予想を当てました！🎯\n🔥 ${odds}倍の配当で ${payout}pt 獲得！\n#ヨソる #予測市場`;
                            window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(window.location.origin)}`, '_blank');
                          }}
                          style={{fontSize:'10px', background:'#000', color:'#fff', border:'none', padding:'4px 8px', borderRadius:'6px', marginTop:'5px', cursor:'pointer', fontWeight:'bold'}}
                        >
                          𝕏 的中報告
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
            <button onClick={()=>supabase.auth.signOut()} style={{width:'100%', marginTop:'20px', color:'#ef4444', background:'#fff', border:'1px solid #ef4444', padding:'12px', borderRadius:'12px', fontWeight:'bold'}}>ログアウト</button>
          </>}
        </div>
      )}

      {activeTab === 'info' && (
        <div style={{ fontSize: '13px', padding: '10px' }}>
          <section style={{background:'#fff', padding:'20px', borderRadius:'16px', border:'1px solid #e2e8f0', marginBottom:'20px'}}>
            <h3 style={{borderBottom:'3px solid #3b82f6', paddingBottom:'8px', marginTop:0, fontWeight:'900'}}>📖 ヨソるの遊び方</h3>
            <p>1. 未来に起こる出来事を予想し、自分の信じる答えにポイントをヨソ（ベット）ります。</p>
            <p>2. 予想が的中すると、外れた人のポイントを含めたプールから、オッズに応じて配当ポイントを獲得できます。</p>
            <p>3. ポイントは無料のゲーム内通貨であり、現実の金銭で購入したり換金したりすることはできません。</p>
          </section>

          <section style={{background:'#fff', padding:'20px', borderRadius:'16px', border:'1px solid #e2e8f0'}}>
            <h3 style={{borderBottom:'3px solid #3b82f6', paddingBottom:'8px', marginTop:0, fontWeight:'900'}}>⚖️ 利用規約・法的ガイドライン</h3>
            <div style={{lineHeight:'1.6', color:'#475569'}}>
              <p><strong>1. 賭博罪の不該当性について</strong><br/>本サービスは刑法185条（賭博罪）に抵触しない娯楽用シミュレーターです。ポイントの現金交換、財物への引換機能は一切提供しません。</p>
              <p><strong>2. 景品表示法の遵守</strong><br/>ランキング報酬やキャンペーンで提供されるデジタル資産（NFT等）は、景品表示法に基づき、法令の定める範囲内で提供されます。</p>
              <p><strong>3. アカウントの管理</strong><br/>複数アカウントによるポイントの不正取得、自動操作、またはポイントのリアルマネー取引（RMT）を固く禁じます。違反時は全スコアを没収します。</p>
              <p><strong>4. デジタル特典について</strong><br/>付与されるデジタル資産や称号はサービス内での娯楽を目的としたものであり、投資対象や経済的価値を有するものではありません。</p>
            </div>
          </section>
          <div style={{ textAlign: 'center', marginTop: '40px' }}><Link href="/admin" style={{ color: '#eee', textDecoration: 'none', fontSize: '10px' }}>admin</Link></div>
        </div>
      )}

      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', display: 'flex', justifyContent: 'space-around', padding: '12px 0', borderTop: '1px solid #e2e8f0', zIndex: 100 }}>
        <button onClick={() => setActiveTab('home')} style={{ background: 'none', border: 'none', color: activeTab === 'home' ? '#3b82f6' : '#94a3b8', fontSize:'11px', fontWeight:'bold' }}>🏠<br />ホーム</button>
        <button onClick={() => setActiveTab('ranking')} style={{ background: 'none', border: 'none', color: activeTab === 'ranking' ? '#3b82f6' : '#94a3b8', fontSize:'11px', fontWeight:'bold' }}>👑<br />ランク</button>
        <button onClick={() => setActiveTab('mypage')} style={{ background: 'none', border: 'none', color: activeTab === 'mypage' ? '#3b82f6' : '#94a3b8', fontSize:'11px', fontWeight:'bold' }}>👤<br />マイペ</button>
        <button onClick={() => setActiveTab('info')} style={{ background: 'none', border: 'none', color: activeTab === 'info' ? '#3b82f6' : '#94a3b8', fontSize:'11px', fontWeight:'bold' }}>📖<br />ガイド</button>
      </nav>
    </div>
  )
}
