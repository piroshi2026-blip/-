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
      detectSessionInUrl: true
    }
  }
)

export default function Home() {
  const router = useRouter()
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
  const [showEmailForm, setShowEmailForm] = useState(false)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)

  // 1. 認証監視の useEffect (ここを修正しました)
  useEffect(() => {
    const initAuth = async () => {
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
        const hash = window.location.hash.substring(1);
        const params = new URLSearchParams(hash);
        const errorDesc = params.get('error_description');
        if (errorDesc) setDebugInfo(`OAuthエラー: ${errorDesc}`);
        else setDebugInfo("セッションなし（待機中）");
      }
    };

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

  // 2. データ取得の useEffect
  useEffect(() => {
    const initData = async () => {
      await Promise.all([fetchMarkets(), fetchRanking()]);
      setIsLoading(false);
    };
    initData();
  }, [sortBy]);

  async function initUserData(userId: string) {
    const { data: profileData } = await supabase.from('profiles').select('*').eq('id', userId).single();
    if (profileData) setProfile(profileData);
    const { data: betsData } = await supabase.from('bets').select('*, markets(title), market_options(name)').eq('user_id', userId).order('created_at', { ascending: false });
    if (betsData) setMyBets(betsData);
  }

  async function fetchMarkets() {
    let query = supabase.from('markets').select('*, market_options(*)');
    if (sortBy === 'popular') query = query.order('total_pool', { ascending: false });
    else query = query.order('end_date', { ascending: true });
    const { data } = await query;
    if (data) setMarkets(data);
  }

  async function fetchRanking() {
    const { data } = await supabase.from('profiles').select('*').order('point_balance', { ascending: false }).limit(20);
    if (data) setRanking(data);
  }

  const handleGoogleLogin = async () => {
    setDebugInfo("Googleログイン開始...");
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin }
    });
  };

  const handleAnonLogin = async () => {
    setDebugInfo("匿名ログイン開始...");
    const { error } = await supabase.auth.signInAnonymously();
    if (error) setDebugInfo(`匿名エラー: ${error.message}`);
  };

  const handleEmailAuth = async () => {
    const { error } = isSignUp 
      ? await supabase.auth.signUp({ email, password })
      : await supabase.auth.signInWithPassword({ email, password });
    if (error) setDebugInfo(`メールエラー: ${error.message}`);
  };

  if (isLoading) return <div style={{textAlign:'center', marginTop:'50px'}}>読み込み中...</div>;

  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px' }}>
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, background: 'black', color: '#0f0', fontSize: '10px', padding: '4px', zIndex: 1000 }}>
        {debugInfo}
      </div>

      <header style={{ textAlign: 'center', marginTop: '30px' }}>
        <h1 style={{ fontSize: '32px', fontWeight: 'bold' }}>YOSOL</h1>
        {profile ? (
          <div style={{ fontWeight: 'bold', color: '#2563eb' }}>💎 {profile.point_balance.toLocaleString()} pt</div>
        ) : (
          <div style={{ marginTop: '10px' }}>
            <button onClick={handleGoogleLogin} style={{ padding: '8px 16px', borderRadius: '20px', border: '1px solid #ccc', background: 'white', cursor: 'pointer' }}>Googleログイン</button>
            <button onClick={handleAnonLogin} style={{ display: 'block', margin: '10px auto', fontSize: '11px', color: '#666', background: 'none', border: 'none', textDecoration: 'underline' }}>アカウントなしで試す</button>
          </div>
        )}
      </header>

      {activeTab === 'home' && (
        <div style={{ marginTop: '20px' }}>
          {markets.map(m => (
            <div key={m.id} style={{ padding: '15px', border: '1px solid #eee', borderRadius: '12px', marginBottom: '15px' }}>
              <h3 style={{ margin: 0 }}>{m.title}</h3>
              <button onClick={() => { if(!session) handleGoogleLogin(); else setSelectedMarketId(m.id); }} style={{ width: '100%', marginTop: '10px', padding: '10px', background: '#2563eb', color: 'white', border: 'none', borderRadius: '8px' }}>予想に参加</button>
            </div>
          ))}
        </div>
      )}

      <nav style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', display: 'flex', justifyContent: 'space-around', padding: '15px', borderTop: '1px solid #eee' }}>
        <button onClick={() => setActiveTab('home')} style={{ background: 'none', border: 'none' }}>🏠 ホーム</button>
        <button onClick={() => setActiveTab('ranking')} style={{ background: 'none', border: 'none' }}>👑 ランク</button>
        <button onClick={() => { if(!session) handleGoogleLogin(); else setActiveTab('mypage'); }} style={{ background: 'none', border: 'none' }}>👤 マイページ</button>
      </nav>
    </div>
  );
}
