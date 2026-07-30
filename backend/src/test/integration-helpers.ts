import { env } from "../config/env.js";
import { db } from "../db/client.js";

/** Integration tests precisam de Postgres/Redis reais (docker compose up -d + migrate:up).
 * Ficam atras deste opt-in para nao falhar ruidosamente em ambientes sem infra. */
export const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === "1";

/**
 * Trava de seguranca: ja aconteceu de `test:integration` rodar contra o
 * DATABASE_URL de dev do .env (vitest.config.ts nao tinha o override na
 * epoca) e apagar um tenant de demo inteiro. resetDatabase() so roda contra
 * um banco cujo nome contenha "test" — o override em vitest.config.ts
 * aponta pra `chatrag_test` por padrao.
 */
function assertTestDatabase() {
  if (!/\/[^/?]*test[^/?]*(\?|$)/i.test(env.DATABASE_URL)) {
    throw new Error(
      `resetDatabase() recusou rodar: DATABASE_URL nao parece ser um banco de teste (${env.DATABASE_URL}). ` +
        "Isso existe pra nao repetir um incidente onde a suite de integracao apagou dados de dev de verdade.",
    );
  }
}

export async function resetDatabase() {
  assertTestDatabase();
  await db.deleteFrom("audit_events").execute();
  await db.deleteFrom("memberships").execute();
  await db.deleteFrom("platform_roles").execute();
  await db.deleteFrom("organizations").execute();
  await db.deleteFrom("users").execute();
}
