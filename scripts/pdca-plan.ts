import { config } from 'dotenv'

config({ path: '.env.local' })
config()

async function main() {
  const plan_date = process.argv[2]
  const { planDailySlots } = await import('../lib/pdca/planDailySlots')
  const r = await planDailySlots(plan_date)
  console.log(JSON.stringify(r, null, 2))
}

main().catch(console.error)
