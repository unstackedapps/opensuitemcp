# OpenSuiteMCP app image, published as ghcr.io/unstackedapps/opensuitemcp.
# Build context: this repository's root.
#
# The runner keeps only Next's standalone output plus two bundled scripts
# (migrate, skills sync), so an update pulls a few hundred MB, not the full
# node_modules tree.

FROM node:22-bookworm-slim AS base
RUN corepack enable && corepack prepare pnpm@9.12.3 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_OUTPUT=standalone
# `pnpm build` also migrates, which needs a database; the image migrates at
# boot instead (docker/entrypoint.sh).
RUN pnpm exec next build
# The two boot-time scripts run before the server, outside Next, so they are
# bundled into single files rather than shipping tsx and every dependency.
RUN pnpm dlx esbuild@0.25.1 lib/db/migrate.ts lib/ai/skills/cli-sync-oracle.ts \
      --bundle --platform=node --target=node22 --format=esm \
      --banner:js="import{createRequire}from'module';const require=createRequire(import.meta.url);" \
      --outdir=dist --entry-names=[name] --out-extension:.js=.mjs

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs nextjs \
  && mkdir -p /app/.data \
  && chown nextjs:nodejs /app/.data

COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/.personas ./.personas
COPY --from=builder --chown=nextjs:nodejs /app/lib/db/migrations ./lib/db/migrations
COPY --from=builder --chown=nextjs:nodejs /app/dist ./dist
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/osmcp-entrypoint

USER nextjs
EXPOSE 3000
VOLUME ["/app/.data"]
ENTRYPOINT ["/usr/local/bin/osmcp-entrypoint"]
