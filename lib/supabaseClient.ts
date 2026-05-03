import { createClient, SupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

/** Both env vars must be set for real API access. */
export const isSupabaseConfigured = Boolean(url && anonKey)

// createClient throws when URL is empty. Local Supabase defaults satisfy the client until .env.local is set.
const FALLBACK_URL = 'http://127.0.0.1:54321'
const FALLBACK_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

export const supabase: SupabaseClient = createClient(url || FALLBACK_URL, anonKey || FALLBACK_ANON_KEY, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})
