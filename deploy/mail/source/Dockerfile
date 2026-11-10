FROM node:22-bookworm-slim AS build
ENV NODE_OPTIONS=--max-old-space-size=640
WORKDIR /app
COPY package.json package-lock.json ./
# The base image already supplies Node; skip the workstation node package installer.
RUN npm ci --ignore-scripts --fetch-retries=1 --fetch-timeout=60000 \
    && rm -rf node_modules/node node_modules/.bin/node \
    && npm rebuild esbuild
COPY tsconfig.json vite.config.ts index.html ./
COPY src ./src
COPY server ./server
COPY shared ./shared
COPY tests ./tests
RUN npm run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4100
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY shared ./shared
COPY scripts/bootstrap-admin.ts ./scripts/bootstrap-admin.ts
USER node
EXPOSE 4100
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s CMD node -e "fetch('http://127.0.0.1:4100/api/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "--import", "tsx", "server/index.ts"]
