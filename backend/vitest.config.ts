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
  },
});
