import { db } from "../db/client.js";

/** Integration tests precisam de Postgres/Redis reais (docker compose up -d + migrate:up).
 * Ficam atras deste opt-in para nao falhar ruidosamente em ambientes sem infra. */
export const RUN_INTEGRATION_TESTS = process.env.RUN_INTEGRATION_TESTS === "1";

export async function resetDatabase() {
  await db.deleteFrom("audit_events").execute();
  await db.deleteFrom("memberships").execute();
  await db.deleteFrom("platform_roles").execute();
  await db.deleteFrom("organizations").execute();
  await db.deleteFrom("users").execute();
}
