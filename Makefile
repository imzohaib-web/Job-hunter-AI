GIT_SHA ?= $(shell git rev-parse --short HEAD 2>nul || echo dev)
BUILD_TIME ?= $(shell powershell -NoProfile -Command "(Get-Date).ToUniversalTime().ToString('yyyy-MM-ddTHH:mm:ssZ')" 2>nul || echo unknown)

.PHONY: up rebuild down logs ps clean

up:
	GIT_SHA=$(GIT_SHA) BUILD_TIME=$(BUILD_TIME) docker compose up --build -d

rebuild:
	GIT_SHA=$(GIT_SHA) BUILD_TIME=$(BUILD_TIME) docker compose build --no-cache
	GIT_SHA=$(GIT_SHA) BUILD_TIME=$(BUILD_TIME) docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

ps:
	docker compose ps
