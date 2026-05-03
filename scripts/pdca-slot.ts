import { config } from 'dotenv'

config({ path: '.env.local' })
config()

async function main() {
  const slot = Number(process.argv[2])
  const date = process.argv[3]
  if (!Number.isInteger(slot) || slot < 0 || slot > 4) {
    console.error('使い方: npm run pdca:slot -- <0-4> [YYYY-MM-DD]')
    process.exit(1)
  }
  const { executePdcaSlot } = await import('../lib/pdca/executeSlot')
  const r = await executePdcaSlot(slot, date)
  console.log(JSON.stringify(r, null, 2))
  process.exit(r.marketId != null || r.skipped ? 0 : 1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
