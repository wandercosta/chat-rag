# Dockerfile para o frontend do ChatRAG (TanStack Start / Vite / Nitro)
FROM oven/bun:1 AS builder

WORKDIR /app

COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# VITE_API_BASE_URL é injetado em build-time via ARG
ARG VITE_API_BASE_URL=http://localhost:3333
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

# NITRO_PRESET=node-server para gerar servidor Node.js HTTP nativo em vez de Cloudflare Worker
ENV NITRO_PRESET=node-server

RUN bun run build

# --- Estágio de Execução ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV NITRO_HOST=0.0.0.0
ENV NITRO_PORT=3000

COPY --from=builder /app/.output ./.output

EXPOSE 3000

CMD ["node", ".output/server/index.mjs"]
