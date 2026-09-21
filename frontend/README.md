# Frontend (Vite + React)

SPA for Luma Welfare. Talks **only** to Supabase (Auth + Edge Functions + Storage).

See the monorepo root [README](../README.md) and [docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md).

```bash
# from repo root
cp frontend/.env.example frontend/.env   # set VITE_SUPABASE_* only
npm install
npm run dev
```

Do not set `VITE_API_URL` — there is no separate Node/Hono API.
