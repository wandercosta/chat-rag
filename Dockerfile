# Dockerfile para o frontend do ChatRAG (TanStack Start / Vite)
FROM node:22-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

# Build do frontend
RUN npm run build

# --- Estágio de Execução ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --only=production

COPY --from=builder /app/.output ./.output 2>/dev/null || COPY --from=builder /app/dist ./dist 2>/dev/null || true
COPY --from=builder /app/public ./public 2>/dev/null || true

EXPOSE 3000

CMD ["npm", "run", "preview"]
