.PHONY: dev test lint build typecheck docker-up docker-down

dev:
	npm run dev

test:
	npm run test
	cd apps/ai-service && python -m pytest

lint:
	npm run lint
	cd apps/ai-service && python -m ruff check app tests && python -m mypy app

build:
	npm run build

typecheck:
	npm run typecheck

docker-up:
	docker compose up --build

docker-down:
	docker compose down
