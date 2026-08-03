# Dockerfile multi-estágio para o backend ChatRAG (API e Worker)
FROM node:22-alpine AS builder

WORKDIR /app

# Copiar manifests de dependência e instalar (inclui devDeps para build e migrations)
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
# node-pg-migrate precisa de tsx para ler migrations em TypeScript
RUN npm ci --only=production && \
    npm install --no-save tsx node-pg-migrate

# Copiar artefatos compilados do estágio builder
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/migrations ./migrations
COPY --from=builder /app/scripts ./scripts

# Copiar e tornar o entrypoint executável
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3333

# O entrypoint roda migrações + setup antes de iniciar o processo principal
ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/server.js"]
