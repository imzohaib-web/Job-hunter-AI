# syntax=docker/dockerfile:1

FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json ./apps/web/
COPY apps/api/package.json ./apps/api/
COPY packages/shared/package.json ./packages/shared/
RUN npm ci

# Development target with live Vite HMR
FROM node:20-alpine AS dev
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
RUN npm run build -w @jobpilot/shared

ENV NODE_ENV=development
EXPOSE 5173
CMD ["npm", "run", "dev", "-w", "@jobpilot/web", "--", "--host", "0.0.0.0"]

# Build stage for production static assets
FROM node:20-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY package.json package-lock.json ./
COPY packages/shared ./packages/shared
COPY apps/web ./apps/web
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
RUN npm run build -w @jobpilot/shared && npm run build -w @jobpilot/web

# Production runner stage (Nginx)
FROM nginx:1.27-alpine AS runner
COPY apps/web/nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx /etc/nginx \
  && touch /tmp/nginx.pid /tmp/nginx-error.log /tmp/nginx-access.log \
  && chown nginx:nginx /tmp/nginx.pid /tmp/nginx-error.log /tmp/nginx-access.log
USER nginx
EXPOSE 5173
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=5 \
  CMD wget -qO- http://127.0.0.1:5173/healthz || exit 1
CMD ["nginx", "-g", "daemon off;"]
