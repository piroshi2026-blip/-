import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'
import Link from 'next/link'
import { useRouter } from 'next/router'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      // 本番環境でのセッション維持を強化
      storageKey: 'yosol-auth-token',
      storage: typeof window !== 'undefined' ? window.localStorage : undefined
    }
  }
)

export default function Home() {
  const router = useRouter()
  // --- デバッグ用ステート ---
  const [debugInfo, setDebugInfo] = useState("初期化中...")

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

  const [showEmailForm, setShowEmailForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)

  // --- デバッグ：認証状態の監視 ---
  // --- ここから差し替え ---
  useEffect(() => {
    const initAuth = async () => {
      // 1. URLから直接セッションを取得・解析（Googleログイン後のハッシュ読み取りを強化）
      const { data: { session: s }, error: sessionError } = await supabase.auth.getSession();

      if (sessionError) {
        setDebugInfo(`セッション取得エラー: ${sessionError.message}`);
        return;
      }

      if (s) {
        setSession(s);
        setDebugInfo(`認証成功: ${s.user.id.slice(0,5)}`);
        await initUserData(s.user.id);
      } else {
        // 2. セッションがない場合、URL自体にエラーが返ってきていないか詳細を解析
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const errorDesc = params.get('error_description');
        const errorName = params.get('error');

        if (errorDesc || errorName) {
          setDebugInfo(`OAuthエラー: ${errorName} - ${errorDesc}`);
        } else {
          setDebugInfo("セッションなし（待機中/初期状態）");
        }
      }
    };

    // 認証状態の変化をリアルタイム監視
    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, currentSession) => {
      setDebugInfo(`イベント: ${event} | セッション: ${currentSession ? "あり" : "なし"}`);
      if (currentSession) {
        setSession(currentSession);
        await initUserData(currentSession.user.id);
      } else {
        setSession(null);
        setProfile(null);
      }
    });

    initAuth();

    return () => {
      authListener.subscription.unsubscribe();
    };
  }, []);
  // --- ここまで差し替え ---

  useEffect(() => {
    // 1. URLに認証情報（#access_token）が含まれているか最優先でチェック
    const checkHash = async () => {
      const { data: { session: hashSession } } = await supabase.auth.getSession();
      if (hashSession) {
        setSession(hashSession);
        setDebugInfo(`ハッシュからログイン成功: ${hashSession.user.id.slice(0,5)}`);
        initUserData(hashSession.user.id);
        // ログイン情報を読み取ったらURLを綺麗にする
        window.history.replaceState(null, '', window.location.pathname);
      }
    };

    // 2. 認証状態の変化を監視
    const { data: authListener } = supabase.auth.onAuthStateChange((event, currentSession) => {
      setDebugInfo(`イベント: ${event} | セッション: ${currentSession ? "あり" : "なし"}`);
      if (currentSession) {
        setSession(currentSession);
        initUserData
        
    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const initData = async () => {
      await Promise.all([fetchCategories(), fetchMarkets(), fetchRanking()])
      setIsLoading(false)
    }
    initData()
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
    if (data) setMarkets(data.map((m: any) => ({ ...m, market_options: m.market_options.sort((a: any, b: any) => a.id - b.id) })))
  }

  async function fetchRanking() {
    const { data } = await supabase.from('profiles').select('*').eq('is_hidden_from_ranking', false).order('point_balance', { ascending: false }).limit(20)
    if (data) setRanking(data)
  }

  async function initUserData(userId: string) {
    try {
      const { data: profileData, error } = await supabase.from('profiles').select('*').eq('id', userId).single()
      if (error) setDebugInfo(prev => prev + ` | DBエラー: ${error.message}`)
      if (profileData) {
        setProfile(profileData)
        setEditName(profileData.username || '名無しさん')
      }
      const { data: betsData } = await supabase.from('bets').select('*, markets(title), market_options(name)').eq('user_id', userId).order('created_at', { ascending: false })
      if (betsData) setMyBets(betsData)
    } catch (e: any) { setDebugInfo(prev => prev + ` | 例外: ${e.message}`) }
  }

  const handleGoogleLogin = async () => {
    setDebugInfo("Googleログイン開始...");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: 'https://minna-eta.vercel.app',
        queryParams: {
          access_type: 'offline',
          prompt: 'consent',
        },
      }
    })
    if (error) setDebugInfo(`ログインエラー: ${error.message}`)
  }

  const handleEmailAuth = async () => {
    if (!email || !password) return alert('入力してください')
    const { error } = isSignUp 
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password })
    if (error) setDebugInfo(`メールエラー: ${error.message}`)
    else if (isSignUp) alert('確認メールを送信しました')
  }

  const handleAnonLogin = async () => {
    setDebugInfo("匿名ログイン開始...")
    const { error } = await supabase.auth.signInAnonymously()
    if (error) setDebugInfo(`匿名エラー: ${error.message}`)
  }

  const handleUpdateName = async () => {
    if (!profile || !editName) return
    await supabase.from('profiles').update({ username: editName }).eq('id', profile.id)
    setIsEditingName(false); initUserData(profile.id); fetchRanking()
  }

  const handleVote = async () => {
    if (!session) return handleGoogleLogin()
    if (voteAmount > (profile?.point_balance || 0)) return alert('ポイント不足')
    const { error } = await supabase.rpc('place_bet', { market_id_input: selectedMarketId, option_id_input: selectedOptionId, amount_input: voteAmount })
    if (!error) { alert('投票完了！'); setSelectedMarketId(null); fetchMarkets(); initUserData(session.user.id); fetchRanking() }
  }

  const styles: any = {
    container: { maxWidth: '600px', margin: '0 auto', padding: '20px 15px 120px', fontFamily: 'sans-serif', color: '#1f2937' },
    appTitle: { fontSize: '32px', fontWeight: '900', background: 'linear-gradient(to right, #2563eb, #9333ea)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', margin: 0 },
    debugBar: { position: 'fixed', top: 0, left: 0, right: 0, background: 'rgba(0,0,0,0.8)', color: '#0f0', fontSize: '10px', padding: '5px', zIndex: 1000, wordBreak: 'break-all', fontFamily: 'monospace' }
  }

  if (isLoading) return <div style={{textAlign:'center', marginTop:'50px'}}>読み込み中...</div>

  return (
    <div style={styles.container}>
      {/* 携帯で原因を見るためのデバッグバー */}
      <div style={styles.debugBar}>{debugInfo}</div>

      <header style={{textAlign:'center', marginBottom:'20px', marginTop:'20px'}}>
        <h1 style={styles.appTitle}>YOSOL</h1>
        {profile ? (
          <div style={{marginTop:'10px', fontWeight:'bold', color:'#2563eb'}}>💎 {profile.point_balance.toLocaleString()} pt</div>
        ) : (
          <div style={{marginTop:'15px'}}>
            {!showEmailForm ? (
              <>
                <button onClick={handleGoogleLogin} style={{padding:'10px 20px', background:'white', border:'1px solid #ccc', borderRadius:'30px', fontWeight:'bold', display:'flex', alignItems:'center', justifyContent:'center', gap:'8px', margin:'0 auto'}}>
                  <img src="https://www.google.com/favicon.ico" width="16" alt="" /> Googleログイン
                </button>
                <button onClick={()=>setShowEmailForm(true)} style={{background:'none', border:'none', color:'#666', fontSize:'12px', marginTop:'10px', cursor:'pointer'}}>📧 メールアドレスでログイン</button>
                <button onClick={handleAnonLogin} style={{background:'none', border:'none', color:'#9ca3af', fontSize:'11px', marginTop:'5px', textDecoration:'underline', cursor:'pointer'}}>アカウントなしで試す(匿名)</button>
              </>
            ) : (
              <div style={{padding:'15px', background:'#f3f4f6', borderRadius:'12px'}}>
                <input placeholder="メール" value={email} onChange={e=>setEmail(e.target.value)} style={{padding:'8px', marginBottom:'5px', width:'200px'}} /><br/>
                <input type="password" placeholder="パスワード" value={password} onChange={e=>setPassword(e.target.value)} style={{padding:'8px', marginBottom:'5px', width:'200px'}} /><br/>
                <button onClick={handleEmailAuth} style={{padding:'8px 20px', background:'#2563eb', color:'white', border:'none', borderRadius:'5px'}}>{isSignUp ? '登録' : 'ログイン'}</button>
                <button onClick={()=>setShowEmailForm(false)} style={{marginLeft:'10px', fontSize:'11px'}}>× 閉じる</button>
              </div>
            )}
          </div>
        )}
      </header>

      {activeTab === 'home' && (
        <>
          <div style={{display:'flex', gap:'10px', overflowX:'auto', marginBottom:'20px'}}>
            {categories.map(cat => (
              <button key={cat} onClick={()=>setActiveCategory(cat)} style={{padding:'8px 16px', borderRadius:'20px', background:activeCategory===cat?'#1f2937':'white', color:activeCategory===cat?'white':'#4b5563', border:'1px solid #ddd', fontWeight:'bold', whiteSpace:'nowrap'}}>{cat}</button>
            ))}
          </div>
          {/* 市場カード（中身は以前と同じ） */}
          {markets.filter(m => activeCategory==='すべて' || m.category===activeCategory).map(m => (
            <div key={m.id} style={{background:'white', borderRadius:'16px', marginBottom:'25px', boxShadow:'0 4px 12px rgba(0,0,0,0.1)', overflow:'hidden', border:'1px solid #eee'}}>
               <div style={{height:'150px', background:'#eee', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'40px'}}>
                 {m.image_url ? <img src={m.image_url} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="" /> : (categoryMeta[m.category]?.icon || '🎲')}
               </div>
               <div style={{padding:'15px'}}>
                 <h3 style={{margin:0, fontSize:'18px'}}>{m.title}</h3>
                 <div style={{fontSize:'12px', color:'#6b7280', marginTop:'10px'}}>{m.description}</div>
                 <button onClick={()=>{ if(!session) handleGoogleLogin(); else setSelectedMarketId(m.id) }} style={{width:'100%', marginTop:'15px', padding:'12px', background:'#2563eb', color:'white', border:'none', borderRadius:'10px', fontWeight:'bold'}}>予想に参加する</button>
               </div>
            </div>
          ))}
        </>
      )}

      <nav style={{position:'fixed', bottom:0, left:0, right:0, background:'white', display:'flex', justifyContent:'space-around', padding:'15px', borderTop:'1px solid #eee'}}>
        <button onClick={()=>setActiveTab('home')} style={{background:'none', border:'none', color:activeTab==='home'?'#2563eb':'#999'}}>🏠 ホーム</button>
        <button onClick={()=>setActiveTab('ranking')} style={{background:'none', border:'none', color:activeTab==='ranking'?'#2563eb':'#999'}}>👑 ランク</button>
        <button onClick={()=>{ if(!session) handleGoogleLogin(); else setActiveTab('mypage') }} style={{background:'none', border:'none', color:activeTab==='mypage'?'#2563eb':'#999'}}>👤 マイページ</button>
      </nav>
    </div>
  )
}
