import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.test.ts"],
    environment: "node",
    // Testes de integracao compartilham um Postgres real e cada `beforeEach`
    // faz DELETE global (resetDatabase). Rodar arquivos em paralelo causa uma
    // corrida real: um arquivo apaga o usuario que outro acabou de criar
    // (achado rodando a suite de verdade, nao e teorico).
    fileParallelism: false,
    // Integracao cria tenants e usuarios de verdade (argon2 e lento de
    // proposito); 5s padrao nao basta para os testes com dois tenants.
    testTimeout: 30_000,
    // resetDatabase() apaga organizations/users/etc. de verdade. Sem isto, a
    // suite ia rodar contra o DATABASE_URL de dev do .env e apagar dados
    // reais criados manualmente (aconteceu uma vez: um `test:integration`
    // local apagou o tenant de demo inteiro). banco de teste isolado,
    // criado uma vez com `createdb chatrag_test` + migrate:up apontando
    // pra ele (ver backend/README.md - Testes).
    //
    // Os demais valores sao ficticios e so existem para os testes nao
    // dependerem de um .env local. IA: modo local + embeddings por hashing,
    // sem rede e sem chave (ver src/modules/rag/local-embeddings.ts).
    env: {
      DATABASE_URL:
        process.env.TEST_DATABASE_URL ?? "postgres://chatrag:chatrag@localhost:5433/chatrag_test",
      // Banco 1 do Redis: as filas dos testes nao se misturam com o worker de dev
      // (que usa o banco 0) rodando na mesma maquina.
      REDIS_URL: process.env.TEST_REDIS_URL ?? "redis://localhost:6379/1",
      // Os testes de webhook entregam num servidor http local.
      WEBHOOKS_ALLOW_PRIVATE_NETWORK: "true",
      APP_MASTER_KEY: "test-only-master-key-not-a-secret-32b",
      S3_ENDPOINT: "http://localhost:9000",
      S3_ACCESS_KEY_ID: "test",
      S3_SECRET_ACCESS_KEY: "test",
      S3_BUCKET: "chatrag-test",
      AI_PROVIDER: "local",
      EMBEDDING_PROVIDER: "hash",
      // APIs da Meta e do Telegram simuladas pelos testes de canal
      // (src/test/fake-graph-api.ts), no mesmo servidor.
      META_GRAPH_URL: "http://127.0.0.1:4599/v21.0",
      TELEGRAM_API_URL: "http://127.0.0.1:4599",
    },
  },
});
