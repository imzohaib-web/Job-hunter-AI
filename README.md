# JobPilot

Production-grade AI job-hunt assistant (portfolio project).

> 📖 **Comprehensive Architecture & Docker Guide**: For a detailed breakdown of end-to-end user flows, multi-agent LangGraph orchestration, containerization specs, and networking architecture, see [docs/project-flow-and-docker-setup.md](docs/project-flow-and-docker-setup.md).

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
- AI readiness: http://localhost:8000/ready (returns 200 when embedding model is loaded, 503 while loading)

## Troubleshooting

### Docker Resource Allocation
- **Memory Requirement**: Docker Desktop requires at least **4 GB of RAM** (6 GB recommended) allocated in **Settings > Resources > Advanced** (or WSL 2 `.wslconfig`). The AI service utilizes PyTorch and SentenceTransformer (`all-MiniLM-L6-v2`) for semantic ranking, running concurrently with MongoDB, Redis, Node API, and Vite web server.
- **Slow Startup or Unhealthy Containers**:
  - The AI service implements a lightweight, non-blocking liveness probe (`/health`) that responds with 200 OK immediately at boot.
  - The heavy embedding model is pre-downloaded at build time and cached in the `ai_model_cache` volume (`/app/models/cache`).
  - Model initialization runs asynchronously in a background thread during application startup. The `/ready` endpoint reports 503 until model weights are in memory, then switches to 200.
  - To inspect live container health logs:
    ```bash
    docker inspect --format "{{json .State.Health}}" job-hunt-agent-v2-ai-service-1
    ```
- **Port Conflicts**: Ensure ports 5173, 3001, 8000, 27017, and 6379 are not occupied by local background processes before running `docker compose up`.
