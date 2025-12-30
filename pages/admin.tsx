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
  const [isReady, setIsReady] = useState(false)

  const categories = ['経済・政治', 'エンタメ', 'スポーツ', 'ライフ', 'こども', 'その他']
  const [sortType, setSortType] = useState<'created_at' | 'end_date' | 'category'>('created_at')
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc')

  // 新規作成用
  const [newTitle, setNewTitle] = useState('')
  const [newImage, setNewImage] = useState('') // ここにURLが入ります
  const [newOptions, setNewOptions] = useState('') 
  const [newEndDate, setNewEndDate] = useState('')
  const [newCategory, setNewCategory] = useState('経済・政治')
  const [newDescription, setNewDescription] = useState('')
  const [uploading, setUploading] = useState(false) // アップロード中のグルグル用

  // 編集用
  const [editingId, setEditingId] = useState<number | null>(null)
  const [editForm, setEditForm] = useState({ title: '', image_url: '', end_date: '', category: '', description: '' })

  useEffect(() => {
    const storedAuth = localStorage.getItem('isAdmin')
    if (storedAuth === 'true') setIsAdmin(true)

    const d = new Date()
    d.setDate(d.getDate() + 7)
    const yyyy = d.getFullYear()
    const MM = ('0' + (d.getMonth() + 1)).slice(-2)
    const dd = ('0' + d.getDate()).slice(-2)
    const hh = ('0' + d.getHours()).slice(-2)
    const mm = ('0' + d.getMinutes()).slice(-2)
    setNewEndDate(`${yyyy}-${MM}-${dd}T${hh}:${mm}`)

    fetchMarkets('created_at', 'desc')
    setIsReady(true)
  }, [])

  useEffect(() => {
    if (isAdmin) fetchMarkets(sortType, sortOrder)
  }, [sortType, sortOrder, isAdmin])

  async function fetchMarkets(column: string, order: 'asc' | 'desc') {
    const { data } = await supabase
      .from('markets')
      .select('*, market_options(*)')
      .order(column, { ascending: order === 'asc' })
    if (data) {
      const sorted = data.map((m: any) => ({
        ...m,
        market_options: m.market_options.sort((a: any, b: any) => a.id - b.id)
      }))
      setMarkets(sorted)
    }
  }

  const handleSortChange = (e: any) => {
      const value = e.target.value;
      switch(value) {
          case 'newest': setSortType('created_at'); setSortOrder('desc'); break;
          case 'closest_deadline': setSortType('end_date'); setSortOrder('asc'); break;
          case 'category': setSortType('category'); setSortOrder('asc'); break;
      }
  }

  // ★画像アップロード関数
  const handleImageUpload = async (event: any, isEdit = false) => {
    try {
      setUploading(true)
      const file = event.target.files[0]
      if (!file) return

      // ファイル名をランダムにする(被り防止)
      const fileExt = file.name.split('.').pop()
      const fileName = `${Math.random().toString(36).substring(2)}.${fileExt}`
      const filePath = `${fileName}`

      // Supabase Storageにアップロード
      const { error: uploadError } = await supabase.storage
        .from('market-images')
        .upload(filePath, file)

      if (uploadError) throw uploadError

      // 公開URLを取得
      const { data } = supabase.storage.from('market-images').getPublicUrl(filePath)
      const publicUrl = data.publicUrl

      if (isEdit) {
        setEditForm({ ...editForm, image_url: publicUrl })
      } else {
        setNewImage(publicUrl)
      }
    } catch (error: any) {
      alert('アップロード失敗: ' + error.message)
    } finally {
      setUploading(false)
    }
  }

  const handleLogin = () => {
    if (password === 'admin1234') {
      setIsAdmin(true)
      localStorage.setItem('isAdmin', 'true')
    } else { alert('パスワードが違います') }
  }

  const handleLogout = () => {
    setIsAdmin(false); localStorage.removeItem('isAdmin'); window.location.href = '/'
  }

  const createMarket = async () => {
    if (!newTitle || !newOptions || !newEndDate) return alert('必須項目が空です')
    try {
      const { data: marketData, error: marketError } = await supabase
        .from('markets')
        .insert({ 
          title: newTitle, 
          image_url: newImage || 'https://placehold.co/600x400',
          end_date: new Date(newEndDate).toISOString(),
          category: newCategory,
          description: newDescription
        })
        .select().single()
      if (marketError) throw marketError

      const optionsList = newOptions.split(',').map(s => s.trim()).filter(s => s)
      const optionsToInsert = optionsList.map(name => ({ market_id: marketData.id, name: name, pool: 0 }))
      const { error: optionError } = await supabase.from('market_options').insert(optionsToInsert)
      if (optionError) throw optionError

      alert('作成しました！')
      setNewTitle(''); setNewImage(''); setNewOptions(''); setNewDescription('');
      fetchMarkets(sortType, sortOrder)
    } catch (e: any) { alert(e.message) }
  }

  const startEdit = (market: any) => {
    setEditingId(market.id)
    const localDate = new Date(market.end_date)
    const offset = localDate.getTimezoneOffset()
    const adjusted = new Date(localDate.getTime() - (offset * 60 * 1000))
    setEditForm({
      title: market.title,
      image_url: market.image_url || '',
      end_date: adjusted.toISOString().slice(0, 16),
      category: market.category || 'その他',
      description: market.description || ''
    })
  }

  const saveEdit = async () => {
    if (!editingId) return
    try {
      const { error } = await supabase.from('markets').update({
        title: editForm.title, image_url: editForm.image_url, end_date: new Date(editForm.end_date).toISOString(),
        category: editForm.category, description: editForm.description
      }).eq('id', editingId)
      if (error) throw error
      alert('更新しました！'); setEditingId(null); fetchMarkets(sortType, sortOrder)
    } catch (e: any) { alert(e.message) }
  }

  const deleteMarket = async (id: number) => {
    if (!confirm('本当に削除しますか？')) return
    try {
      await supabase.from('bets').delete().eq('market_id', id)
      await supabase.from('market_options').delete().eq('market_id', id)
      await supabase.from('markets').delete().eq('id', id)
      alert('削除しました🗑️'); fetchMarkets(sortType, sortOrder)
    } catch (e: any) { alert(e.message) }
  }

  const resolve = async (marketId: number, optionId: number, name: string) => {
    if (!confirm(`「${name}」の勝ちで確定しますか？`)) return
    const { error } = await supabase.rpc('resolve_market_multi', { market_id_input: marketId, winning_option_id_input: optionId })
    if (error) alert(error.message); else { alert('配当配布完了！'); fetchMarkets(sortType, sortOrder) }
  }

  if (!isReady) return null
  if (!isAdmin) return (
    <div style={{ padding: '40px', textAlign: 'center', fontFamily: 'sans-serif' }}>
      <h2>🔐 管理者ログイン</h2>
      <input type="password" placeholder="Pass" value={password} onChange={e => setPassword(e.target.value)} style={{ padding: '10px' }} />
      <button onClick={handleLogin} style={{ padding: '10px 20px', marginLeft: '10px' }}>入室</button>
      <div style={{ marginTop: '30px' }}><button onClick={() => window.location.href = '/'} style={{background:'none', border:'none', textDecoration:'underline', color:'blue'}}>アプリに戻る</button></div>
    </div>
  )

  return (
    <div style={{ maxWidth: '800px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif', paddingBottom:'100px' }}>
      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'20px'}}>
        <h1>⚙️ 管理画面</h1>
        <button onClick={handleLogout} style={{background:'#ef4444', color:'white', border:'none', padding:'8px 16px', borderRadius:'5px', fontWeight:'bold'}}>ログアウト</button>
      </div>

      <div style={{ background: '#f0f9ff', padding: '20px', borderRadius: '12px', marginBottom: '30px', border:'1px solid #bae6fd' }}>
        <h3>📝 新規作成</h3>
        <div style={{display:'flex', flexDirection:'column', gap:'10px'}}>
          <label style={{fontSize:'12px', fontWeight:'bold'}}>タイトル</label>
          <input placeholder="例: M-1グランプリ優勝は？" value={newTitle} onChange={e=>setNewTitle(e.target.value)} style={{padding:'8px', border:'1px solid #ccc', borderRadius:'4px'}} />

          <div style={{display:'flex', gap:'10px'}}>
            <div style={{flex:1}}>
              <label style={{fontSize:'12px', fontWeight:'bold'}}>カテゴリ</label>
              <select value={newCategory} onChange={e=>setNewCategory(e.target.value)} style={{width:'100%', padding:'8px', border:'1px solid #ccc', borderRadius:'4px'}}>
                {categories.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <div style={{flex:1}}>
              <label style={{fontSize:'12px', fontWeight:'bold'}}>締切日時</label>
              <input type="datetime-local" value={newEndDate} onChange={e=>setNewEndDate(e.target.value)} style={{width:'100%', padding:'8px', border:'1px solid #ccc', borderRadius:'4px'}} />
            </div>
          </div>

          <label style={{fontSize:'12px', fontWeight:'bold'}}>詳細・判定基準</label>
          <textarea placeholder="例: 公式サイトの発表に基づきます" value={newDescription} onChange={e=>setNewDescription(e.target.value)} style={{padding:'8px', height:'60px', border:'1px solid #ccc', borderRadius:'4px'}} />

          {/* ★ 画像アップロード部分の変更 ★ */}
          <label style={{fontSize:'12px', fontWeight:'bold'}}>画像 (カメラロールから選択)</label>
          <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, false)} style={{padding:'5px'}} />
          {uploading && <span style={{fontSize:'12px', color:'blue'}}>アップロード中...</span>}
          {newImage && <img src={newImage} alt="Preview" style={{height:'100px', objectFit:'cover', borderRadius:'8px', marginTop:'5px'}} />}
          {/* URL直接入力も一応残しておく */}
          <input placeholder="またはURL直接入力" value={newImage} onChange={e=>setNewImage(e.target.value)} style={{padding:'8px', border:'1px solid #ccc', borderRadius:'4px', marginTop:'5px', fontSize:'12px'}} />

          <label style={{fontSize:'12px', fontWeight:'bold'}}>選択肢 (カンマ区切り)</label>
          <input placeholder="A, B, C" value={newOptions} onChange={e=>setNewOptions(e.target.value)} style={{padding:'8px', border:'1px solid #ccc', borderRadius:'4px'}} />

          <button onClick={createMarket} style={{background:'#0284c7', color:'white', padding:'10px', border:'none', borderRadius:'5px', marginTop:'10px', fontWeight:'bold', cursor:'pointer'}} disabled={uploading}>公開する</button>
        </div>
      </div>

      <div style={{display:'flex', justifyContent:'space-between', alignItems:'center'}}>
        <h3>📊 マーケット管理</h3>
        <select onChange={handleSortChange} style={{padding:'5px', borderRadius:'5px', border:'1px solid #ccc'}}>
            <option value="newest">作成順（新着）</option>
            <option value="closest_deadline">締切が近い順</option>
            <option value="category">カテゴリ順</option>
        </select>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', marginTop:'10px' }}>
        {markets.map((m) => (
          <div key={m.id} style={{ border: '1px solid #ddd', padding: '20px', borderRadius: '8px', background: m.is_resolved ? '#f3f4f6' : 'white', position:'relative' }}>
             <button onClick={() => deleteMarket(m.id)} style={{ position:'absolute', top:'15px', right:'15px', background:'#fee2e2', color:'#dc2626', border:'none', padding:'5px 10px', borderRadius:'5px', fontWeight:'bold', cursor:'pointer'}}>削除</button>

             {editingId === m.id ? (
               <div style={{background:'#fffbeb', padding:'15px', borderRadius:'8px', marginTop:'30px', border:'2px solid #fcd34d'}}>
                 <h4 style={{marginTop:0}}>✏️ 編集中</h4>
                 <input value={editForm.title} onChange={e=>setEditForm({...editForm, title: e.target.value})} style={{width:'100%', marginBottom:'5px', padding:'5px'}} />
                 <textarea value={editForm.description} onChange={e=>setEditForm({...editForm, description: e.target.value})} style={{width:'100%', marginBottom:'5px', padding:'5px', height:'80px'}} />
                 <input type="datetime-local" value={editForm.end_date} onChange={e=>setEditForm({...editForm, end_date: e.target.value})} style={{width:'100%', marginBottom:'5px', padding:'5px'}} />

                 {/* ★ 編集時の画像アップロード */}
                 <label style={{fontSize:'12px', display:'block', marginTop:'5px'}}>画像変更:</label>
                 <input type="file" accept="image/*" onChange={(e) => handleImageUpload(e, true)} style={{marginBottom:'5px'}} />
                 {uploading && <span style={{fontSize:'12px', color:'blue'}}>アップロード中...</span>}
                 {editForm.image_url && <img src={editForm.image_url} style={{height:'60px', borderRadius:'4px', display:'block', marginBottom:'5px'}} />}

                 <div style={{display:'flex', gap:'10px', marginTop:'10px'}}>
                   <button onClick={saveEdit} disabled={uploading} style={{background:'#059669', color:'white', border:'none', padding:'8px 16px', borderRadius:'5px', cursor:'pointer'}}>保存</button>
                   <button onClick={()=>setEditingId(null)} style={{background:'#9ca3af', color:'white', border:'none', padding:'8px 16px', borderRadius:'5px', cursor:'pointer'}}>キャンセル</button>
                 </div>
               </div>
             ) : (
               <>
                 <button onClick={() => startEdit(m)} style={{position:'absolute', top:'15px', right:'70px', background:'#e0f2fe', color:'#0284c7', border:'none', padding:'5px 10px', borderRadius:'5px', fontWeight:'bold', cursor:'pointer'}}>編集</button>
                 <div style={{marginBottom:'5px'}}>
                   <span style={{background:'#e5e7eb', fontSize:'10px', padding:'2px 6px', borderRadius:'4px', color:'#374151', marginRight:'5px'}}>{m.category || '未設定'}</span>
                   <span style={{fontWeight:'bold', color: m.is_resolved ? 'green' : 'red', fontSize:'12px'}}>{m.is_resolved ? '✅ 終了済み' : '🔥 受付中'}</span>
                 </div>
                 {/* 画像プレビュー追加 */}
                 <div style={{display:'flex', gap:'15px'}}>
                    {m.image_url && <img src={m.image_url} style={{width:'60px', height:'60px', objectFit:'cover', borderRadius:'4px'}} />}
                    <div>
                        <div style={{fontWeight:'bold', fontSize:'18px'}}>{m.title}</div>
                        <div style={{fontSize:'12px', color:'#666', marginTop:'5px'}}>締切: {new Date(m.end_date).toLocaleString()}</div>
                    </div>
                 </div>
                 <div style={{display:'flex', gap:'5px', flexWrap:'wrap', alignItems:'center', marginTop:'10px'}}>
                   <span style={{fontSize:'12px', fontWeight:'bold'}}>勝者判定:</span>
                   {m.market_options.map((opt:any) => (
                     <button key={opt.id} disabled={m.is_resolved} onClick={()=>resolve(m.id, opt.id, opt.name)} style={{padding:'5px 10px', borderRadius:'15px', border:'1px solid #ccc', background: m.result_option_id === opt.id ? '#22c55e' : 'white', color: m.result_option_id === opt.id ? 'white' : 'black', cursor: m.is_resolved ? 'default' : 'pointer'}}>
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
        <button onClick={() => window.location.href = '/'} style={{padding:'10px 20px', borderRadius:'20px', border:'1px solid #ccc', background:'#fff', cursor:'pointer'}}>🏠 アプリに戻る</button>
      </div>
    </div>
  )
}
