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
    // resetDatabase() apaga organizations/users/etc. de verdade. Sem isto, a
    // suite ia rodar contra o DATABASE_URL de dev do .env e apagar dados
    // reais criados manualmente (aconteceu uma vez: um `test:integration`
    // local apagou o tenant de demo inteiro). banco de teste isolado,
    // criado uma vez com `createdb chatrag_test` + migrate:up apontando
    // pra ele (ver backend/README.md - Testes).
    env: {
      DATABASE_URL: "postgres://chatrag:chatrag@localhost:5433/chatrag_test",
    },
  },
});
