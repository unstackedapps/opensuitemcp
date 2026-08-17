FROM node:22-bookworm-slim AS deps
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM node:22-bookworm-slim AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public
ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production
ENV AUTH_SECRET=build-time-placeholder
ENV ENCRYPTION_KEY=build-time-placeholder-key-32bytes
ENV POSTGRES_URL=postgresql://opensuitemcp:build@127.0.0.1:5432/opensuitemcp
ENV REDIS_URL=redis://127.0.0.1:6379
ENV SEARXNG_ENDPOINT=http://127.0.0.1:8080
RUN pnpm exec next build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates git \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@9.12.3 --activate
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
COPY package.json pnpm-lock.yaml ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/lib ./lib
COPY --from=builder /app/.personas ./.personas
RUN mkdir -p public .data/oracle-skills .data/community-skills .data/connected-skills
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY docker/app-entrypoint.mjs ./docker/app-entrypoint.mjs
EXPOSE 3000
ENTRYPOINT ["node", "docker/app-entrypoint.mjs"]
