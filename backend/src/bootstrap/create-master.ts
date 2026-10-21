/**
 * Bootstrap do primeiro usuario Master. Nao existe endpoint publico para isso
 * (docs/security/privacidade-e-acesso.md - sem auto cadastro). Uso local:
 *   npx tsx scripts/create-master.ts admin@chatrag.local "senha-forte-aqui"
 */
import { db } from "../src/db/client.js";
import { identityService } from "../src/modules/identity/index.js";

const [email, password] = process.argv.slice(2);

if (!email || !password) {
  console.error('Uso: tsx scripts/create-master.ts <email> "<senha>"');
  process.exit(1);
}

const user = await identityService.createUser(db, email, password);
await db.insertInto("platform_roles").values({ user_id: user.id }).execute();

console.log(`Master criado: ${user.email} (${user.id})`);
await db.destroy();
