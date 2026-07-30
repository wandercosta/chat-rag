import { db } from "../../db/client.js";
import type { TenantRole } from "../../db/types.js";
import { hashPassword, verifyPassword } from "./crypto.js";
import { identityRepository } from "./repository.js";
import { sessions } from "./sessions.js";
import type { AuthContext } from "./types.js";

export class InvalidCredentialsError extends Error {}

export const identityService = {
  /** Usado por outros modulos (ex.: organizations) para criar o usuario administrador
   * inicial de um tenant. So o modulo identity sabe como o hash e gerado. */
  async createUser(trxDb: typeof db, email: string, plainPassword: string) {
    const passwordHash = await hashPassword(plainPassword);
    return identityRepository.insertUser(trxDb, { email, passwordHash });
  },

  async login(email: string, plainPassword: string): Promise<string> {
    const user = await identityRepository.findUserByEmail(email);
    if (!user) throw new InvalidCredentialsError();

    const valid = await verifyPassword(user.password_hash, plainPassword);
    if (!valid) throw new InvalidCredentialsError();

    return sessions.create(user.id);
  },

  async logout(token: string): Promise<void> {
    await sessions.destroy(token);
  },

  async resolveAuth(token: string | undefined): Promise<AuthContext | null> {
    const userId = await sessions.resolve(token);
    if (!userId) return null;

    const [user, isPlatform, memberships] = await Promise.all([
      identityRepository.findUserById(userId),
      identityRepository.isPlatformRole(userId),
      identityRepository.membershipsForUser(userId),
    ]);
    if (!user) return null;

    return {
      userId,
      email: user.email,
      isPlatform,
      memberships: memberships.map((m) => ({
        organizationId: m.organization_id,
        role: m.role as TenantRole,
      })),
    };
  },
};
