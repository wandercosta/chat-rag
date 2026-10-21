/**
 * Bootstrap do primeiro usuario Master. Nao existe endpoint publico para isso
 * (docs/security/privacidade-e-acesso.md - sem auto cadastro). Uso local:
 *   npx tsx src/bootstrap/create-master.ts admin@chatrag.local "senha-forte-aqui"
 */
import { db } from "../db/client.js";
import { identityService } from "../modules/identity/index.js";

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error('Uso: tsx src/bootstrap/create-master.ts <email> "<senha>"');
  process.exit(1);
}

// Idempotente: o entrypoint do container roda isto a cada subida.
const existing = await db
  .selectFrom("users")
  .select("id")
  .where("email", "=", email)
  .executeTakeFirst();

if (existing) {
  console.log(`Master ja existe: ${email}`);
} else {
  const user = await identityService.createUser(db, email, password);
  await db.insertInto("platform_roles").values({ user_id: user.id }).execute();
  console.log(`Master criado: ${user.email} (${user.id})`);
}
await db.destroy();
