# Luna deploy notes (Vercel project `luna`)

Single project: static `artifacts/her-planner/dist/public` + serverless `api/*` → Express app.

## Required env (Vercel project + Doppler locally)

| Variable | Purpose |
|----------|---------|
| `DATABASE_URL` | Neon Postgres (enable `vector` for memories) |
| `OPENAI_API_KEY` | Embeddings + OpenAI chat fallback (or AI Gateway vars below) |
| `XAI_API_KEY` | Grok 4.5 via `xai.chat` when set |
| `AI_GATEWAY_API_KEY` or `VERCEL_OIDC_TOKEN` | Optional Vercel AI Gateway for OpenAI path |

Later: Blob token, `ELEVENLABS_*`, Google OAuth.

## Notes

- `maxDuration` for API functions is **300s** (tool loops / streaming).
- Express only calls `listen` when `VERCEL` is unset.
- After schema changes: `pnpm --filter @workspace/db push` (runs pgvector bootstrap).
