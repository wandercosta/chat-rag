import { db } from "../../db/client.js";

export interface NewUserInput {
  email: string;
  passwordHash: string;
}

export const identityRepository = {
  findUserByEmail(email: string) {
    return db.selectFrom("users").selectAll().where("email", "=", email).executeTakeFirst();
  },

  findUserById(id: string) {
    return db.selectFrom("users").selectAll().where("id", "=", id).executeTakeFirst();
  },

  insertUser(trxDb: typeof db, input: NewUserInput) {
    return trxDb
      .insertInto("users")
      .values({ email: input.email, password_hash: input.passwordHash })
      .returningAll()
      .executeTakeFirstOrThrow();
  },

  isPlatformRole(userId: string) {
    return db
      .selectFrom("platform_roles")
      .select("user_id")
      .where("user_id", "=", userId)
      .executeTakeFirst()
      .then((row) => Boolean(row));
  },

  membershipsForUser(userId: string) {
    return db.selectFrom("memberships").selectAll().where("user_id", "=", userId).execute();
  },
};
