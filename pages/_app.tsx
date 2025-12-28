'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@supabase/supabase-js'

// 1. Supabaseに接続する準備
// Secretsに設定した鍵を読み込みます
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
const supabase = createClient(supabaseUrl, supabaseAnonKey)

export default function Home() {
  const [markets, setMarkets] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  // 2. 画面が開かれたらデータを取ってくる
  useEffect(() => {
    fetchMarkets()
  }, [])

  async function fetchMarkets() {
    try {
      const { data, error } = await supabase
        .from('markets')
        .select('*')
        .order('created_at', { ascending: false })

      if (error) throw error
      setMarkets(data || [])
    } catch (error) {
      console.error('Error:', error)
      alert('データの取得に失敗しました。Secretsの設定を確認してください。')
    } finally {
      setLoading(false)
    }
  }

  // 3. 画面の表示（HTMLのようなもの）
  return (
    <div style={{ maxWidth: '600px', margin: '0 auto', padding: '20px', fontFamily: 'sans-serif' }}>
      <h1 style={{ fontSize: '24px', fontWeight: 'bold', marginBottom: '20px' }}>
        🇯🇵 PolyMarket JP (Beta)
      </h1>

      {loading ? (
        <p>読み込み中...</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {markets.map((market) => (
            <div key={market.id} style={{ 
              border: '1px solid #ddd', 
              borderRadius: '12px', 
              padding: '16px', 
              boxShadow: '0 2px 5px rgba(0,0,0,0.05)' 
            }}>
              {/* 画像 */}
              {market.image_url && (
                <img 
                  src={market.image_url} 
                  alt={market.title} 
                  style={{ width: '100%', height: '150px', objectFit: 'cover', borderRadius: '8px', marginBottom: '12px' }} 
                />
              )}

              {/* タイトル */}
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '8px' }}>
                {market.title}
              </h2>

              {/* 説明文 */}
              <p style={{ fontSize: '14px', color: '#666', marginBottom: '16px' }}>
                {market.description}
              </p>

              {/* 投票ボタン（まだ見た目だけ） */}
              <div style={{ display: 'flex', gap: '10px' }}>
                <button style={{ 
                  flex: 1, padding: '10px', borderRadius: '8px', border: 'none', 
                  backgroundColor: '#E0F2FE', color: '#0369A1', fontWeight: 'bold' 
                }}>
                  Yes 予想
                </button>
                <button style={{ 
                  flex: 1, padding: '10px', borderRadius: '8px', border: 'none', 
                  backgroundColor: '#FEE2E2', color: '#B91C1C', fontWeight: 'bold' 
                }}>
                  No 予想
                </button>
              </div>

              <div style={{ marginTop: '10px', fontSize: '12px', color: '#888', textAlign: 'center' }}>
                総投票ポイント: {market.total_pool} pt
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
