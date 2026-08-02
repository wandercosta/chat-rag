# Dockerfile multi-estágio para o backend ChatRAG (API e Worker)
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar manifests de dependência e instalar
COPY package*.json ./
RUN npm ci

# Copiar código fonte e TypeScript config
COPY tsconfig.json ./
COPY migrations/ ./migrations/
COPY scripts/ ./scripts/
COPY src/ ./src/

# Compilar TypeScript para JavaScript (dist/)
RUN npm run build

# --- Estágio de Produção ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copiar dependências de produção
COPY package*.json ./
RUN npm ci --only=production

# Copiar artefatos compilados do estágio builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts

EXPOSE 3333

# Por padrão inicia a API Fastify. Pode ser sobrescrito para `node dist/worker.js`
CMD ["node", "dist/server.js"]
