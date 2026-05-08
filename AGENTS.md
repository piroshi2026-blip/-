# AGENTS.md

## Cursor Cloud specific instructions

### Project overview

This is **ヨソる (Yosoru)** — a Japanese prediction market platform built with Next.js (Pages Router) + Supabase. Users bet virtual points on outcomes of real-world events. It includes a PDCA automation pipeline that generates markets from news using Claude AI.

### Running the app

- **Dev server:** `npm run dev` (port 3000, listens on 0.0.0.0)
- **Lint:** `npx next lint` (uses `.eslintrc.json` → `next/core-web-vitals`)
- **Build:** `npm run build`
- **PDCA scripts:** `npm run pdca`, `npm run pdca:plan`, `npm run pdca:slot`

### Key architecture notes

- Single Next.js app (not a monorepo). Pages Router with `pages/` directory.
- Supabase client in `lib/supabaseClient.ts` gracefully handles missing config — the app renders a setup prompt page when `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` are not set.
- API routes live under `pages/api/`. Cron endpoints require `CRON_SECRET` header auth (see `lib/pdca/cronGuard.ts`).
- PDCA automation code is in `lib/pdca/`.

### Environment variables

See `pdca.env.example` for the full list. The following secrets are registered in Cursor Cloud Secrets and injected automatically on new sessions:
- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` — Supabase project (also needed in `.env.local` for Next.js client-side)
- `SUPABASE_SERVICE_ROLE_KEY` — for backend/cron operations
- `CRON_SECRET` — authenticates cron API calls

Additional optional vars:
- `ANTHROPIC_API_KEY` — AI question generation (PDCA)
- `TWITTER_API_KEY` / `TWITTER_API_SECRET` / `TWITTER_ACCESS_TOKEN` / `TWITTER_ACCESS_SECRET` — X auto-posting
- `DISABLE_X_POST=true` — disables X auto-posting when set

**Important**: `NEXT_PUBLIC_*` vars must be in `.env.local` for Next.js to expose them client-side. On new sessions, create `.env.local` from the injected env vars:
```
echo "NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL" > .env.local
echo "NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY" >> .env.local
echo "SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY" >> .env.local
echo "CRON_SECRET=$CRON_SECRET" >> .env.local
```

### Gotchas

- `next lint` is deprecated in Next.js 16+ but works fine on the current version (15.x). The warnings about `<img>` vs `<Image />` are non-blocking.
- The build output is in `.next/` — this directory is gitignored.
- No test framework is configured in this repo (no Jest, Vitest, etc.). Validation is done via lint + build + manual testing.
- The admin password is hardcoded as `yosoru_admin` in `pages/admin.tsx`.
