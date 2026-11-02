import { sql } from "kysely";
import { auditService } from "../audit/index.js";
import { db } from "../../db/client.js";
import { redis } from "../../db/redis.js";
import {
  decryptSecret,
  deserializeEnvelope,
  encryptSecret,
  serializeEnvelope,
  type SerializedEnvelope,
} from "../../crypto/envelope.js";
import {
  generateRecoveryCodes,
  generateSecret,
  hashRecoveryCode,
  otpauthUrl,
  verifyTotp,
} from "./totp.js";

export class TwoFactorRequiredError extends Error {}
export class InvalidTwoFactorCodeError extends Error {}
export class TwoFactorStateError extends Error {}

type UserRow = {
  id: string;
  email: string;
  totp_secret: SerializedEnvelope | null;
  totp_pending: SerializedEnvelope | null;
  totp_enabled_at: Date | null;
  recovery_codes: string[];
};

const open = (envelope: SerializedEnvelope) => decryptSecret(deserializeEnvelope(envelope));
const seal = (secret: string) => JSON.stringify(serializeEnvelope(encryptSecret(secret)));

function findUser(userId: string) {
  return db
    .selectFrom("users")
    .select(["id", "email", "totp_secret", "totp_pending", "totp_enabled_at", "recovery_codes"])
    .where("id", "=", userId)
    .executeTakeFirst() as Promise<UserRow | undefined>;
}

/** O mesmo codigo nao vale duas vezes (alguem que viu a tela por cima do ombro). */
async function claimStep(userId: string, step: number) {
  const ok = await redis.set(`totp-used:${userId}:${step}`, "1", "EX", 120, "NX");
  return ok === "OK";
}

/** Codigo do app ou um codigo de recuperacao (que e consumido). */
async function verifyCode(user: UserRow, code: string): Promise<"totp" | "recuperacao" | null> {
  if (user.totp_secret) {
    const step = verifyTotp(open(user.totp_secret), code);
    if (step !== null && (await claimStep(user.id, step))) return "totp";
  }
  const hash = hashRecoveryCode(code);
  if (user.recovery_codes.includes(hash)) {
    const result = await db
      .updateTable("users")
      .set({ recovery_codes: sql`recovery_codes - ${hash}` })
      .where("id", "=", user.id)
      .where(sql<boolean>`recovery_codes ? ${hash}`)
      .executeTakeFirst();
    if (Number(result.numUpdatedRows) > 0) return "recuperacao";
  }
  return null;
}

function audit(userId: string, action: string) {
  return auditService.record({
    actorUserId: userId,
    organizationId: null,
    action,
    type: "seguranca",
    target: userId,
  });
}

/**
 * Verificacao em duas etapas (etapa 8, ADR-006). O segredo fica cifrado como a
 * chave de IA; os codigos de recuperacao so aparecem uma vez e ficam em hash.
 */
export const twoFactorService = {
  async status(userId: string) {
    const user = await findUser(userId);
    return {
      enabled: !!user?.totp_enabled_at,
      enabledAt: user?.totp_enabled_at ?? null,
      recoveryCodesLeft: user?.recovery_codes.length ?? 0,
    };
  },

  /** Gera um segredo novo (ainda nao vale ate ser confirmado com um codigo). */
  async setup(userId: string) {
    const user = await findUser(userId);
    if (!user) throw new TwoFactorStateError();
    if (user.totp_enabled_at) throw new TwoFactorStateError();
    const secret = generateSecret();
    await db
      .updateTable("users")
      .set({ totp_pending: seal(secret) })
      .where("id", "=", userId)
      .execute();
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  },

  async enable(userId: string, code: string) {
    const user = await findUser(userId);
    if (!user?.totp_pending || user.totp_enabled_at) throw new TwoFactorStateError();
    const secret = open(user.totp_pending);
    const step = verifyTotp(secret, code);
    if (step === null || !(await claimStep(userId, step))) throw new InvalidTwoFactorCodeError();

    const recoveryCodes = generateRecoveryCodes();
    await db
      .updateTable("users")
      .set({
        totp_secret: seal(secret),
        totp_pending: null,
        totp_enabled_at: new Date(),
        recovery_codes: JSON.stringify(recoveryCodes.map(hashRecoveryCode)),
      })
      .where("id", "=", userId)
      .execute();
    await audit(userId, "Ativou verificacao em duas etapas");
    return { recoveryCodes };
  },

  async disable(userId: string, code: string) {
    const user = await findUser(userId);
    if (!user?.totp_enabled_at) throw new TwoFactorStateError();
    if (!(await verifyCode(user, code))) throw new InvalidTwoFactorCodeError();
    await db
      .updateTable("users")
      .set({
        totp_secret: null,
        totp_pending: null,
        totp_enabled_at: null,
        recovery_codes: "[]",
      })
      .where("id", "=", userId)
      .execute();
    await audit(userId, "Desativou verificacao em duas etapas");
  },

  /** Etapa do login: sem 2FA ativo, passa; com 2FA, exige codigo valido. */
  async checkLogin(userId: string, code: string | undefined) {
    const user = await findUser(userId);
    if (!user?.totp_enabled_at) return;
    if (!code) throw new TwoFactorRequiredError();
    const used = await verifyCode(user, code);
    if (!used) throw new InvalidTwoFactorCodeError();
    if (used === "recuperacao") await audit(userId, "Entrou com codigo de recuperacao");
  },

  async isEnabled(userId: string) {
    const user = await findUser(userId);
    return !!user?.totp_enabled_at;
  },
};
