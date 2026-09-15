# Multi-stage Dockerfile
FROM node:20-alpine AS base
WORKDIR /app

FROM base AS deps
COPY server/package.json server/package-lock.json* ./
RUN npm ci
COPY client/package.json client/package-lock.json* ./
RUN npm ci
COPY shared/package.json ./
RUN npm ci

FROM base AS server-build
COPY --from=deps /app/server/package.json /app/server/package-lock.json* /app/server/
COPY --from=deps /app/node_modules ./node_modules
COPY server/ ./
COPY shared/ ./shared/
RUN npm run build

FROM base AS client-build
COPY --from=deps /app/client/package.json /app/client/package-lock.json* /app/client/
COPY --from=deps /app/node_modules ./node_modules
COPY client/ ./
COPY shared/ ./shared/
RUN npm run build

FROM base AS runner
COPY --from=server-build /app/dist ./dist
COPY --from=client-build /app/dist ./client/dist
COPY server/package.json ./server/
EXPOSE 3000
CMD ["node", "dist/index.js"]
