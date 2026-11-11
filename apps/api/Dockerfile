# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci

FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/api ./apps/api
RUN npm run build -w @jobpilot/shared && npm run build -w @jobpilot/api

FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S jobpilot && adduser -S jobpilot -G jobpilot
COPY --from=build --chown=jobpilot:jobpilot /app/package.json /app/package-lock.json ./
COPY --from=build --chown=jobpilot:jobpilot /app/node_modules ./node_modules
COPY --from=build --chown=jobpilot:jobpilot /app/packages/shared ./packages/shared
COPY --from=build --chown=jobpilot:jobpilot /app/apps/api/package.json ./apps/api/package.json
COPY --from=build --chown=jobpilot:jobpilot /app/apps/api/dist ./apps/api/dist
USER jobpilot
EXPOSE 3001
HEALTHCHECK --interval=10s --timeout=5s --start-period=20s --retries=5 \
  CMD node -e "fetch('http://127.0.0.1:3001/api/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/index.js"]
