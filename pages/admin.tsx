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

  // 新規作成用フォーム
  const [newTitle, setNewTitle] = useState('')
  const [newImage, setNewImage] = useState('')
  const [newOptions, setNewOptions] = useState('') 
  const [newEndDate, setNewEndDate] = useState(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 16))

  // 編集用ステート
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ title: '', image_url: '', end_date: '' })

  useEffect(() => {
    fetchMarkets()
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
    if (password === 'admin1234') setIsAdmin(true)
    else alert('パスワードが違います')
  }

  // --- 作成機能 ---
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
        .select()
        .single()

      if (marketError) throw marketError

      const optionsList = newOptions.split(',').map(s => s.trim()).filter(s => s)
      const optionsToInsert = optionsList.map(name => ({
        market_id: marketData.id,
        name: name,
        pool: 0
      }))

      const { error: optionError } = await supabase.from('market_options').insert(optionsToInsert)
      if (optionError) throw optionError

      alert('作成しました！')
      setNewTitle('')
      setNewImage('')
      setNewOptions('')
      fetchMarkets()

    } catch (error: any) {
      alert('エラー: ' + error.message)
    }
  }

  // --- 編集機能 (New!) ---
  const startEdit = (market: any) => {
    setEditingId(market.id)
    // 日時をinput用に変換 (JSTを考慮して簡易変換)
    const localDate = new Date(market.end_date)
    localDate.setMinutes(localDate.getMinutes() - localDate.getTimezoneOffset())

    setEditForm({
      title: market.title,
      image_url: market.image_url || '',
      end_date: localDate.toISOString().slice(0, 16)
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    try {
      const { error } = await supabase
        .from('markets')
        .update({
          title: editForm.title,
          image_url: editForm.image_url,
          end_date: new Date(editForm.end_date).toISOString()
        })
        .eq('id', editingId)

      if (error) throw error
      alert('更新しました！')
      setEditingId(null)
      fetchMarkets()
    } catch (error: any) {
      alert('更新エラー: ' + error.message)
    }
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditForm({ title: '', image_url: '', end_date: '' })
  }

  // --- 削除機能 ---
  const deleteMarket = async (id: number) => {
    if (!confirm('本当に削除しますか？\n投票データなども全て消えます。')) return

    try {
      await supabase.from('bets').delete().eq('market_id', id)
      await supabase.from('market_options').delete().eq('market_id', id)
      const { error } = await supabase.from('markets').delete().eq('id', id)
      if (error) throw error

      alert('削除しました🗑️')
      fetchMarkets()
    } catch (error: any) {
      alert('削除エラー: ' + error.message)
    }
  }

  // --- 判定機能 ---
  const resolve = async (marketId: number, optionId: number, optionName: string) => {
    if (!confirm(`「${optionName}」の勝ちで確定しますか？`)) return

    const { error } = await supabase.rpc('resolve_market_multi', {
      market_id_input: marketId,
      winning_option_id_input: optionId
    })

    if (error) alert(error.message)
    else {
      alert('配当を配布しました！')
      fetchMarkets()
    }
  }

  // ログイン画面
  if (!isAdmin) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
        <h2>🔐 管理者ログイン</h2>
        <input type="password" placeholder="Pass" value={password} onChange={e => setPassword(e.target.value)} style={{ padding: '10px' }} />
        <button onClick={handleLogin} style={{ padding: '10px 20px', marginLeft: '10px', cursor: 'pointer' }}>入室</button>
        <div style={{ marginTop: '20px' }}>
           <button onClick={() => window.location.href = '/'} style={{ background: 'none', border: 'none', color: 'blue', textDecoration: 'underline', cursor: 'pointer' }}>アプリに戻る</button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif', paddingBottom:'100px' }}>
      <h1>⚙️ 管理画面</h1>

      {/* 新規作成フォーム */}
      <div style={{ background: '#f0f9ff', padding: '20px', borderRadius: '12px', marginBottom: '30px', border:'1px solid #bae6fd' }}>
        <h3>📝 新規作成</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          <div>
            <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>タイトル</label>
            <input placeholder="例: M-1グランプリ優勝は？" value={newTitle} onChange={e => setNewTitle(e.target.value)} style={{ width:'100%', padding: '10px' }} />
          </div>
          <div>
            <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>締切日時</label>
            <input type="datetime-local" value={newEndDate} onChange={e => setNewEndDate(e.target.value)} style={{ width:'100%', padding: '10px' }} />
          </div>
          <div>
            <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>画像URL (任意)</label>
            <input placeholder="https://..." value={newImage} onChange={e => setNewImage(e.target.value)} style={{ width:'100%', padding: '10px' }} />
          </div>
          <div>
            <label style={{display:'block', fontSize:'12px', fontWeight:'bold', marginBottom:'5px'}}>選択肢 (カンマ区切り)</label>
            <input placeholder="例: A, B, C" value={newOptions} onChange={e => setNewOptions(e.target.value)} style={{ width:'100%', padding: '10px' }} />
          </div>
          <button onClick={createMarket} style={{ background: '#0284c7', color: 'white', padding: '12px', border: 'none', borderRadius: '5px', fontWeight: 'bold', cursor: 'pointer' }}>公開する</button>
        </div>
      </div>

      {/* マーケット一覧 */}
      <h3>📊 マーケット設定・編集</h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {markets.map((m) => (
          <div key={m.id} style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px', background: m.is_resolved ? '#f3f4f6' : 'white', position: 'relative' }}>

            {/* 削除ボタン */}
            <button onClick={() => deleteMarket(m.id)} style={{ position: 'absolute', top: '15px', right: '15px', background: '#fee2e2', color: '#dc2626', border: 'none', padding: '5px 10px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer', fontWeight:'bold' }}>
              🗑️ 削除
            </button>

            {/* 編集モード or 表示モードの切り替え */}
            {editingId === m.id ? (
              // --- 編集モード ---
              <div style={{ background:'#fffbeb', padding:'15px', borderRadius:'8px', border:'2px solid #f59e0b', marginTop:'25px' }}>
                <h4 style={{marginTop:0, marginBottom:'10px', color:'#d97706'}}>✏️ 編集中</h4>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{fontSize:'12px', fontWeight:'bold'}}>タイトル</label>
                  <input value={editForm.title} onChange={e => setEditForm({...editForm, title: e.target.value})} style={{width:'100%', padding:'8px'}} />
                </div>
                <div style={{ marginBottom: '10px' }}>
                  <label style={{fontSize:'12px', fontWeight:'bold'}}>画像URL</label>
                  <input value={editForm.image_url} onChange={e => setEditForm({...editForm, image_url: e.target.value})} style={{width:'100%', padding:'8px'}} />
                </div>
                <div style={{ marginBottom: '15px' }}>
                  <label style={{fontSize:'12px', fontWeight:'bold'}}>締切日時</label>
                  <input type="datetime-local" value={editForm.end_date} onChange={e => setEditForm({...editForm, end_date: e.target.value})} style={{width:'100%', padding:'8px'}} />
                </div>
                <div style={{ display:'flex', gap:'10px' }}>
                  <button onClick={saveEdit} style={{ background:'#059669', color:'white', border:'none', padding:'8px 16px', borderRadius:'5px', fontWeight:'bold', cursor:'pointer' }}>保存する</button>
                  <button onClick={cancelEdit} style={{ background:'#9ca3af', color:'white', border:'none', padding:'8px 16px', borderRadius:'5px', fontWeight:'bold', cursor:'pointer' }}>キャンセル</button>
                </div>
              </div>
            ) : (
              // --- 表示モード ---
              <>
                 {/* 編集ボタン */}
                <button onClick={() => startEdit(m)} style={{ position: 'absolute', top: '15px', right: '80px', background: '#e0f2fe', color: '#0284c7', border: 'none', padding: '5px 10px', borderRadius: '5px', fontSize: '12px', cursor: 'pointer', fontWeight:'bold' }}>
                  ✏️ 編集
                </button>

                <div style={{ paddingRight: '120px' }}>
                  <div style={{ fontWeight: 'bold', fontSize:'18px' }}>{m.title}</div>
                  <div style={{ fontSize:'12px', color:'#666', marginTop:'5px' }}>
                    締切: {new Date(m.end_date).toLocaleString()} | 
                    <span style={{ fontWeight: 'bold', color: m.is_resolved ? 'green' : 'red', marginLeft:'5px' }}>
                      {m.is_resolved ? '✅ 終了済み' : '🔥 受付中'}
                    </span>
                  </div>
                </div>

                <div style={{ marginTop: '15px' }}>
                  <div style={{fontSize: '13px', marginBottom: '5px', fontWeight: 'bold'}}>勝者判定 (クリックで確定):</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px' }}>
                    {m.market_options && m.market_options.map((opt: any) => (
                      <button
                        key={opt.id}
                        disabled={m.is_resolved}
                        onClick={() => resolve(m.id, opt.id, opt.name)}
                        style={{
                          padding: '6px 14px',
                          border: '1px solid #ccc',
                          borderRadius: '20px',
                          background: m.result_option_id === opt.id ? '#22c55e' : '#fff',
                          color: m.result_option_id === opt.id ? '#fff' : '#000',
                          cursor: m.is_resolved ? 'default' : 'pointer',
                          fontSize: '13px',
                          fontWeight: m.result_option_id === opt.id ? 'bold' : 'normal',
                          opacity: m.is_resolved && m.result_option_id !== opt.id ? 0.5 : 1
                        }}
                      >
                        {opt.name}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div style={{marginTop:'40px', textAlign:'center', paddingBottom:'40px'}}>
        <button 
          onClick={() => window.location.href = '/'} 
          style={{ padding: '12px 24px', background: '#f3f4f6', color: '#333', border: '1px solid #ccc', borderRadius: '30px', fontWeight: 'bold', cursor: 'pointer' }}
        >
          🏠 アプリに戻る
        </button>
      </div>
    </div>
  )
}
