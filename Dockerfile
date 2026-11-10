FROM node:22-alpine AS builder
# Fit the production builder budget, including native bundler allocations.
ENV NODE_OPTIONS=--max-old-space-size=640 \
    ROLLDOWN_WORKER_THREADS=1 \
    RAYON_NUM_THREADS=1

WORKDIR /app

ARG VITE_API_URL=/api/v1
ARG VITE_MAIL_APP_URL=https://inbox.teamspace.kz
ARG VITE_TENANT_WORKSPACE_ENABLED=false
ARG VITE_TENANT_BASE_DOMAIN=teamspace.kz
ARG VERSION=dev
ARG BUILD_TIME=local

ENV VITE_API_URL=${VITE_API_URL}
ENV VITE_MAIL_APP_URL=${VITE_MAIL_APP_URL}
ENV VITE_TENANT_WORKSPACE_ENABLED=${VITE_TENANT_WORKSPACE_ENABLED}
ENV VITE_TENANT_BASE_DOMAIN=${VITE_TENANT_BASE_DOMAIN}
ENV VITE_APP_VERSION=${VERSION}
ENV VITE_BUILD_TIME=${BUILD_TIME}

COPY package*.json ./
RUN npm ci

COPY . .
# CI runs the required full typecheck before publishing this image.
RUN npm run build:bundle

FROM nginx:1.27-alpine

COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1/health || exit 1
