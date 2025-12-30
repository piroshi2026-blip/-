import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function Admin() {
  const [markets, setMarkets] = useState<any[]>([])
  const [password, setPassword] = useState('')
  const [isAdmin, setIsAdmin] = useState(false)
  const [isReady, setIsReady] = useState(false) // 読み込み完了フラグ

  // 新規作成・編集用ステート
  const [newTitle, setNewTitle] = useState('')
  const [newImage, setNewImage] = useState('')
  const [newOptions, setNewOptions] = useState('') 
  const [newEndDate, setNewEndDate] = useState('')

  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ title: '', image_url: '', end_date: '' })

  useEffect(() => {
    // 1. ログイン状態の復元
    const storedAuth = localStorage.getItem('isAdmin')
    if (storedAuth === 'true') {
      setIsAdmin(true)
    }

    // 2. 初期値として7日後をセット
    const d = new Date()
    d.setDate(d.getDate() + 7)
    // JSTを意識してフォーマット (簡易版)
    const yyyy = d.getFullYear()
    const MM = ('0' + (d.getMonth() + 1)).slice(-2)
    const dd = ('0' + d.getDate()).slice(-2)
    const hh = ('0' + d.getHours()).slice(-2)
    const mm = ('0' + d.getMinutes()).slice(-2)
    setNewEndDate(`${yyyy}-${MM}-${dd}T${hh}:${mm}`)

    fetchMarkets()
    setIsReady(true)
  }, [])

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

  const handleLogin = () => {
    if (password === 'admin1234') {
      setIsAdmin(true)
      localStorage.setItem('isAdmin', 'true') // 記憶する
    } else {
      alert('パスワードが違います')
    }
  }

  const handleLogout = () => {
    setIsAdmin(false)
    localStorage.removeItem('isAdmin') // 記憶を消す
    window.location.href = '/'
  }

  // --- 作成・編集・削除・判定ロジック ---

  const createMarket = async () => {
    if (!newTitle || !newOptions || !newEndDate) return alert('必須項目が空です')
    try {
      const { data: marketData, error: marketError } = await supabase
        .from('markets')
        .insert({ 
          title: newTitle, 
          image_url: newImage || 'https://placehold.co/600x400',
          end_date: new Date(newEndDate).toISOString()
        })
        .select().single()
      if (marketError) throw marketError

      const optionsList = newOptions.split(',').map(s => s.trim()).filter(s => s)
      const optionsToInsert = optionsList.map(name => ({
        market_id: marketData.id, name: name, pool: 0
      }))
      const { error: optionError } = await supabase.from('market_options').insert(optionsToInsert)
      if (optionError) throw optionError

      alert('作成しました！')
      setNewTitle(''); setNewImage(''); setNewOptions(''); fetchMarkets()
    } catch (e: any) { alert(e.message) }
  }

  const startEdit = (market: any) => {
    setEditingId(market.id)
    // 日時をinput用に変換
    const localDate = new Date(market.end_date)
    // ずれている時間を補正してYYYY-MM-DDThh:mm形式にする
    const offset = localDate.getTimezoneOffset()
    const adjusted = new Date(localDate.getTime() - (offset * 60 * 1000))
    setEditForm({
      title: market.title,
      image_url: market.image_url || '',
      end_date: adjusted.toISOString().slice(0, 16)
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    try {
      const { error } = await supabase.from('markets').update({
        title: editForm.title, image_url: editForm.image_url, end_date: new Date(editForm.end_date).toISOString()
      }).eq('id', editingId)
      if (error) throw error
      alert('更新しました！'); setEditingId(null); fetchMarkets()
    } catch (e: any) { alert(e.message) }
  }

  const deleteMarket = async (id: number) => {
    if (!confirm('本当に削除しますか？')) return
    try {
      await supabase.from('bets').delete().eq('market_id', id)
      await supabase.from('market_options').delete().eq('market_id', id)
      await supabase.from('markets').delete().eq('id', id)
      alert('削除しました'); fetchMarkets()
    } catch (e: any) { alert(e.message) }
  }

  const resolve = async (marketId: number, optionId: number, name: string) => {
    if (!confirm(`「${name}」の勝ちで確定しますか？`)) return
    const { error } = await supabase.rpc('resolve_market_multi', { market_id_input: marketId, winning_option_id_input: optionId })
    if (error) alert(error.message); else { alert('配当配布完了！'); fetchMarkets() }
  }

  // --- 描画 ---
  if (!isReady) return null // 初期化待ち

  if (!isAdmin) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2>🔐 管理者ログイン</h2>
        <input type="password" placeholder="Pass" value={password} onChange={e => setPassword(e.target.value)} style={{ padding: '10px' }} />
        <button onClick={handleLogin} style={{ padding: '10px 20px', marginLeft: '10px' }}>入室</button>
        <div style={{ marginTop: '30px' }}><button onClick={() => window.location.href = '/'} style={{background:'none', border:'none', textDecoration:'underline'}}>アプリに戻る</button></div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif', paddingBottom:'100px' }}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
        <h1>⚙️ 管理画面</h1>
        <button onClick={handleLogout} style={{background:'#ef4444', color:'white', border:'none', padding:'8px 16px', borderRadius:'5px', fontWeight:'bold'}}>ログアウト</button>
      </div>

      {/* 新規作成 */}
      <div style={{ background: '#f0f9ff', padding: '20px', borderRadius: '12px', marginBottom: '30px', border:'1px solid #bae6fd' }}>
        <h3>📝 新規作成</h3>
        <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
          <input placeholder="タイトル" value={newTitle} onChange={e=>setNewTitle(e.target.value)} style={{padding:'8px'}} />
          <input type="datetime-local" value={newEndDate} onChange={e=>setNewEndDate(e.target.value)} style={{padding:'8px'}} />
          <input placeholder="画像URL" value={newImage} onChange={e=>setNewImage(e.target.value)} style={{padding:'8px'}} />
          <input placeholder="選択肢 (カンマ区切り)" value={newOptions} onChange={e=>setNewOptions(e.target.value)} style={{padding:'8px'}} />
          <button onClick={createMarket} style={{background:'#0284c7', color:'white', padding:'10px', border:'none', borderRadius:'5px'}}>公開</button>
        </div>
      </div>

      {/* 一覧 & 編集 */}
      <h3>📊 マーケット管理</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {markets.map((m) => (
          <div key={m.id} style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px', background: m.is_resolved ? '#f3f4f6' : 'white', position:'relative' }}>
             <button onClick={() => deleteMarket(m.id)} style={{ position:'absolute', top:'15px', right:'15px', background:'#fee2e2', color:'#dc2626', border:'none', padding:'5px 10px', borderRadius:'5px'}}>削除</button>

             {editingId === m.id ? (
               <div style={{background:'#fffbeb', padding:'15px', borderRadius:'8px', marginTop:'30px'}}>
                 <h4>編集中</h4>
                 <input value={editForm.title} onChange={e=>setEditForm({...editForm, title: e.target.value})} style={{width:'100%', marginBottom:'5px'}} />
                 <input type="datetime-local" value={editForm.end_date} onChange={e=>setEditForm({...editForm, end_date: e.target.value})} style={{width:'100%', marginBottom:'5px'}} />
                 <input value={editForm.image_url} onChange={e=>setEditForm({...editForm, image_url: e.target.value})} style={{width:'100%', marginBottom:'5px'}} />
                 <button onClick={saveEdit} style={{marginRight:'10px'}}>保存</button>
                 <button onClick={()=>setEditingId(null)}>キャンセル</button>
               </div>
             ) : (
               <>
                 <button onClick={() => startEdit(m)} style={{position:'absolute', top:'15px', right:'70px', background:'#e0f2fe', color:'#0284c7', border:'none', padding:'5px 10px', borderRadius:'5px'}}>編集</button>
                 <div style={{fontWeight:'bold', fontSize:'18px', paddingRight:'120px'}}>{m.title}</div>
                 <div style={{fontSize:'12px', color:'#666', marginBottom:'10px'}}>締切: {new Date(m.end_date).toLocaleString()}</div>
                 <div style={{display:'flex', gap:'5px', flexWrap:'wrap'}}>
                   {m.market_options.map((opt:any) => (
                     <button key={opt.id} disabled={m.is_resolved} onClick={()=>resolve(m.id, opt.id, opt.name)} style={{padding:'5px 10px', borderRadius:'15px', border:'1px solid #ccc', background: m.result_option_id === opt.id ? '#22c55e' : 'white', color: m.result_option_id === opt.id ? 'white' : 'black'}}>
                       {opt.name}
                     </button>
                   ))}
                 </div>
               </>
             )}
          </div>
        ))}
      </div>

      <div style={{marginTop:'40px', textAlign:'center'}}>
        <button onClick={() => window.location.href = '/'} style={{padding:'10px 20px', borderRadius:'20px', border:'1px solid #ccc', background:'#fff'}}>🏠 アプリに戻る</button>
      </div>
    </div>
  )
}
