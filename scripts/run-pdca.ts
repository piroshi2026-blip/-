/**
 * ローカル・CI から手動実行: npm run pdca
 * .env.local に SERVICE_ROLE_KEY と CRON 以外の変数を読み込みます。
 */
import { config } from 'dotenv'

config({ path: '.env.local' })
config()

async function main() {
  const { runPdcaPipeline } = await import('../lib/pdca/runPipeline')
  const result = await runPdcaPipeline()
  console.log(JSON.stringify(result, null, 2))
  const fatal = result.mlb.marketId == null
  process.exit(fatal ? 1 : 0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
