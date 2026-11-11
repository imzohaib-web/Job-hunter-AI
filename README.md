# JobPilot

Production-grade AI job-hunt assistant (portfolio project).

## Monorepo

| Path | Stack |
|------|--------|
| `apps/web` | React 18 + Vite + TypeScript + Tailwind + shadcn/ui |
| `apps/api` | Node 20 + Express + TypeScript + MongoDB + Redis/BullMQ |
| `apps/ai-service` | Python 3.11 + FastAPI + LangGraph |
| `packages/shared` | Shared TypeScript types |
| `legacy/` | Old Streamlit app — **reference only** |

## Quick start (Docker)

```bash
# Ensure per-app .env files exist (examples are ready to copy)
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/ai-service/.env.example apps/ai-service/.env

docker compose up --build
```

Requires Docker Desktop. When it is healthy, `GET http://localhost:3001/api/health/deep` should report `status: ok` for api, aiService, mongo, and redis.

- Web: http://localhost:5173
- API: http://localhost:3001/api/health
- Deep health: http://localhost:3001/api/health/deep
- `docker-compose.override.yml` also publishes ai-service `:8000`, mongo `:27017`, redis `:6379` for local tooling.

## Quick start (native)

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env
cp apps/ai-service/.env.example apps/ai-service/.env

npm install

cd apps/ai-service && python -m venv .venv && .venv/Scripts/activate  # Windows
pip install -r requirements.txt -r requirements-dev.txt
cd ../..

npm run dev:api
npm run dev:web
cd apps/ai-service && uvicorn app.main:app --reload --port 8000
```

## Make targets

- `make dev` — start web and api
- `make test` — run tests across packages
- `make lint` — lint all packages
- `make build` — build all packages

## Health checks

- Web: http://localhost:5173
- API: http://localhost:3001/api/health
- Deep: http://localhost:3001/api/health/deep
- AI service: http://localhost:8000/health (requires `X-Service-Key` on non-health routes)
