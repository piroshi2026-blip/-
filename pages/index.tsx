import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL || '', process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '')

export default function TestPage() {
  const [markets, setMarkets] = useState<any[]>([])

  useEffect(() => {
    const fetchTest = async () => {
      const { data } = await supabase.from('markets').select('*')
      if (data) setMarkets(data)
    }
    fetchTest()
  }, [])

  return (
    <div style={{ padding: '20px', background: '#fff', color: '#000' }}>
      <h1>判定基準テスト画面</h1>
      {markets.map(m => (
        <div key={m.id} style={{ border: '2px solid red', margin: '10px', padding: '10px' }}>
          <h2>タイトル: {m.title}</h2>
          <p style={{ background: 'yellow', padding: '10px' }}>
            <strong>判定基準（ここが出るか確認）:</strong> {m.description || "★データが空っぽです★"}
          </p>
        </div>
      ))}
    </div>
  )
}
