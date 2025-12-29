import type { AppProps } from 'next/app'

const globalStyles = `
  * { box-sizing: border-box; padding: 0; margin: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; background-color: #f3f4f6; color: #1f2937; }
  button { cursor: pointer; }
`

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <style jsx global>{globalStyles}</style>
      <Component {...pageProps} />
    </>
  )
}
