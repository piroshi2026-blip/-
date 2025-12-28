import type { AppProps } from 'next/app'
import '../styles/globals.css' // もしCSSエラーが出たらこの行を消してください

export default function App({ Component, pageProps }: AppProps) {
  return <Component {...pageProps} />
}
