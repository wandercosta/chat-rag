import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import type { TenantRole } from "../../db/types.js";
import { hashPassword, verifyPassword } from "./crypto.js";
import { identityRepository } from "./repository.js";
import { sessions } from "./sessions.js";
import type { AuthContext } from "./types.js";
import { twoFactorService } from "./two-factor.service.js";

export class InvalidCredentialsError extends Error {}
/** Senha ou codigo errado demais para o mesmo e-mail: espera antes de tentar. */
export class TooManyAttemptsError extends Error {}

/** 10 erros em 15 minutos por e-mail. Sem isso, o codigo de 6 digitos do 2FA
 * (e a propria senha) poderiam ser testados a vontade. */
const MAX_FAILURES = 10;
const FAILURE_WINDOW_SECONDS = 15 * 60;
const failureKey = (email: string) => `login-fail:${email.trim().toLowerCase()}`;

async function registerFailure(email: string) {
  const count = await redis.incr(failureKey(email));
  if (count === 1) await redis.expire(failureKey(email), FAILURE_WINDOW_SECONDS);
}

export const identityService = {
  /** Usado por outros modulos (ex.: organizations) para criar o usuario administrador
   * inicial de um tenant. So o modulo identity sabe como o hash e gerado. */
  async createUser(trxDb: typeof db, email: string, plainPassword: string) {
    const passwordHash = await hashPassword(plainPassword);
    return identityRepository.insertUser(trxDb, { email, passwordHash });
  },

  /**
   * Senha e, com 2FA ativo, o codigo do aplicativo (ou de recuperacao). Erro
   * conta para o limite por e-mail; acerto zera.
   */
  async login(email: string, plainPassword: string, code?: string): Promise<string> {
    const failures = Number(await redis.get(failureKey(email)));
    if (failures >= MAX_FAILURES) throw new TooManyAttemptsError();

    const user = await identityRepository.findUserByEmail(email);
    const valid = user ? await verifyPassword(user.password_hash, plainPassword) : false;
    if (!user || !valid) {
      await registerFailure(email);
      throw new InvalidCredentialsError();
    }

    try {
      await twoFactorService.checkLogin(user.id, code);
    } catch (err) {
      // Pedir o codigo (sem ter mandado) nao conta como erro; codigo errado, sim.
      if (code) await registerFailure(email);
      throw err;
    }

    await redis.del(failureKey(email));
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
      twoFactorEnabled: !!user.totp_enabled_at,
      isPlatform,
      memberships: memberships.map((m) => ({
        organizationId: m.organization_id,
        role: m.role as TenantRole,
      })),
    };
  },
};
