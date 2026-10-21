# Dockerfile multi-estagio do backend ChatRAG (API, worker e seed usam a mesma imagem).
#
# Base Debian (slim) e nao Alpine: o runtime ONNX usado pelos embeddings locais
# (@huggingface/transformers) so publica binarios para glibc.
FROM node:22-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src/ ./src/

RUN npm run build

# --- Estagio de producao ---
FROM node:22-slim AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
# node-pg-migrate + tsx: as migrations sao arquivos TypeScript.
RUN npm ci --omit=dev && npm install --no-save tsx@4 node-pg-migrate@7

# Baixa o modelo de embeddings local no build, para o primeiro upload nao
# esperar ~120 MB de download. Desligue com --build-arg PRELOAD_EMBEDDING_MODEL=false.
ARG PRELOAD_EMBEDDING_MODEL=true
ARG LOCAL_EMBEDDING_MODEL=Xenova/multilingual-e5-small
RUN if [ "$PRELOAD_EMBEDDING_MODEL" = "true" ]; then \
      node -e "import('@huggingface/transformers').then(t => t.pipeline('feature-extraction', process.argv[1], { dtype: 'q8' })).then(() => console.log('modelo de embeddings em cache'))" "$LOCAL_EMBEDDING_MODEL"; \
    fi

COPY --from=builder /app/dist ./dist
COPY migrations/ ./migrations/
COPY seed/ ./seed/
COPY entrypoint.sh ./entrypoint.sh
RUN chmod +x ./entrypoint.sh

EXPOSE 3333

ENTRYPOINT ["./entrypoint.sh"]
CMD ["node", "dist/server.js"]
