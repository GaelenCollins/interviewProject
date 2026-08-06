# Sales Quote Checker

Automated quote checking & verification for  sales workflows. Upload a Distributor Quote (Excel) and a Customer Quote (PDF), then review error findings with PDF/Excel highlights, an AI assistant, annotated PDF export, and Outlook-ready email drafts.

## What it does

- Cross-checks Excel cost source vs customer-facing PDF (SKUs, qty, margins, schedules, totals, omitted terms)
- Ranks findings as Critical / Warning / Notice with an Unsafe / Needs approval / Safe verdict
- Highlights issues on the PDF and Excel viewers
- Streams check progress and chat answers from Claude
- Generates annotated PDFs and `.eml` drafts (annotated PDF + original Excel attached)
- Responsive desktop multi-panel layout and mobile tabbed workspace
- Sample Tool Usage analytics dashboard (hardcoded demo data — future feature)

## Architecture

| Layer | Role |
|--------|------|
| React + Vite + Tailwind | UI (`src/`) |
| Express API (`server/`) | Uploads, PDF text extract, Claude calls, SSE streams |
| `auditEngine.js` | Deterministic math & findings — not LLM arithmetic |
| Claude Haiku | Fast PDF → structured schema extraction |
| Claude Sonnet | Schema fallback, chat, check summary, email prose |

Locally, Vite proxies `/api` → Express (`API_PORT`, default `3001`). In production, the Netlify frontend calls a remote API via `VITE_API_BASE_URL` (hosted using Render).

```
Browser (Netlify or localhost:8443)
    └── /api/*  →  Express (local :3001 or Render)
                      ├── pdfjs extract
                      ├── Claude (Haiku / Sonnet)
                      └── auditEngine (deterministic checks)
```

Never put `ANTHROPIC_API_KEY` in `VITE_*` variables — it stays on the API host only.

## Stack

- React 19, Vite 8, Tailwind CSS v4
- Express 5, Multer, SSE
- Anthropic SDK, pdfjs-dist, pdf-lib, xlsx, recharts

## Prerequisites

- Node.js 22+
- pnpm (or npm)
- An Anthropic API key

## Local setup

```bash
pnpm install
cp .env.example .env
# Edit .env — set ANTHROPIC_API_KEY
pnpm dev
```

- Web: [http://localhost:8443](http://localhost:8443)
- API: [http://localhost:3001](http://localhost:3001) (`GET /api/health`)

Leave `VITE_API_BASE_URL` unset locally so the Vite proxy is used.

| Script | Purpose |
|--------|---------|
| `pnpm dev` | API + Vite together |
| `pnpm dev:web` | Frontend only |
| `pnpm dev:api` / `pnpm start` | Express API |
| `pnpm build` | Production frontend build → `dist/` |
| `pnpm format` | Format with oxfmt |

### `.env` (API / local)

See `.env.example`:

| Variable | Where | Notes |
|----------|--------|--------|
| `ANTHROPIC_API_KEY` | API host only | Required |
| `CLAUDE_HAIKU_MODEL` | API | Default `claude-haiku-4-5` |
| `CLAUDE_SONNET_MODEL` | API | Default `claude-sonnet-4-5` |
| `API_PORT` | Local API | Default `3001` |
| `FRONTEND_URL` / `CORS_ORIGINS` | API | Optional; `*.netlify.app` already allowed |
| `VITE_API_BASE_URL` | Netlify build | e.g. `https://your-api.onrender.com` |

## Production deploy

### 1. API (Render / Railway / similar)

- Start command: `npm start` (`node server/index.js`)
- Set `ANTHROPIC_API_KEY`, model env vars, optional `FRONTEND_URL`
- Do not set `API_PORT` on Render — use platform `PORT`
- Confirm: `https://YOUR-API/api/health` → `"ok": true`, `"hasAnthropicKey": true`

### 2. Frontend (Netlify)

- Build: `npm run build`, publish: `dist` (see `netlify.toml`)
- Set only `VITE_API_BASE_URL` to your API origin (no trailing slash)
- Redeploy after changing `VITE_*` (baked in at build time)
- Do not put `ANTHROPIC_API_KEY` in Netlify (secrets scan + unused by the SPA)

## Project layout

```
src/
  App.jsx                 # App shell, check/chat/email flows
  api/client.js           # /api fetch + SSE
  components/             # Workspace, PDF/Excel viewers, findings, chat, …
  utils/auditEngine.js    # Deterministic audit + schedule math
  utils/outlookDraftBuilder.js
server/
  index.js                # Express routes
  services/pipeline.js    # Check orchestration
  services/claude.js      # Model routing & prompts
  services/pdf.js         # PDF text extraction
```

## Notes

- Quote math (margins, extensions, schedule cash-flow / fix options) is computed in code; the LLM explains using those figures.
- Soft voice: suggestions use “probably / should / could,” not hard mandates.
- Tool Usage dashboard is sample UI only.

## License

Private / internal — Dynamix interview project.
