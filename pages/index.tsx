import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL || '',
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
)

export default function TestPage() {
  const [markets, setMarkets] = useState<any[]>([])
  const [debugMsg, setDebugMsg] = useState('読み込み中...')

  useEffect(() => {
    async function fetchTest() {
      try {
        const { data, error } = await supabase.from('markets').select('*')

        if (error) {
          setDebugMsg('エラー発生: ' + error.message)
          return
        }

        if (!data || data.length === 0) {
          setDebugMsg('データが0件です。テーブルに問いが存在しません。')
        } else {
          setDebugMsg(`データ取得成功！ (${data.length}件)`)
          setMarkets(data)
        }
      } catch (e: any) {
        setDebugMsg('例外エラー: ' + e.message)
      }
    }
    fetchTest()
  }, [])

  return (
    <div style={{ padding: '20px', background: 'white', color: 'black', minHeight: '100vh' }}>
      <h1 style={{ borderBottom: '2px solid black' }}>判定基準・通信テスト画面</h1>
      <p style={{ fontWeight: 'bold', color: 'blue' }}>ステータス: {debugMsg}</p>

      <hr />

      {markets.map((m) => (
        <div key={m.id} style={{ border: '3px solid red', margin: '15px 0', padding: '15px', borderRadius: '10px' }}>
          <h2 style={{ margin: '0 0 10px 0' }}>タイトル: {m.title}</h2>
          <div style={{ background: '#ffffcc', padding: '15px', borderRadius: '8px', border: '1px solid #ccc' }}>
            <h3 style={{ margin: '0 0 5px 0', fontSize: '14px', color: '#666' }}>判定基準（descriptionカラム）:</h3>
            <p style={{ fontSize: '18px', fontWeight: 'bold', whiteSpace: 'pre-wrap' }}>
              {m.description ? m.description : "⚠️データが空っぽ(NULL)です"}
            </p>
          </div>
        </div>
      ))}
    </div>
  )
}
