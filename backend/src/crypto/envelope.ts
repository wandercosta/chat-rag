import crypto from "node:crypto";
import { env } from "../config/env.js";

/**
 * Envelope encryption (ADR-002 #1): uma KEK protege uma DEK por segredo, que
 * por sua vez protege o valor real. Em dev, a KEK e derivada do APP_MASTER_KEY;
 * `getKek` e o unico ponto que precisa trocar para um KMS real (AWS KMS,
 * Vault, etc.) em homologacao/producao.
 */
const CURRENT_KEK_VERSION = 1;

function getKek(version: number): Buffer {
  if (version !== CURRENT_KEK_VERSION) {
    throw new Error(`KEK versao ${version} nao suportada neste ambiente`);
  }
  return crypto.scryptSync(env.APP_MASTER_KEY, `chatrag-kek-v${version}`, 32);
}

export interface Envelope {
  ciphertext: Buffer;
  iv: Buffer;
  authTag: Buffer;
  wrappedDek: Buffer;
  dekIv: Buffer;
  dekAuthTag: Buffer;
  kekVersion: number;
}

export function encryptSecret(plaintext: string): Envelope {
  const dek = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", dek, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  const kek = getKek(CURRENT_KEK_VERSION);
  const dekIv = crypto.randomBytes(12);
  const dekCipher = crypto.createCipheriv("aes-256-gcm", kek, dekIv);
  const wrappedDek = Buffer.concat([dekCipher.update(dek), dekCipher.final()]);
  const dekAuthTag = dekCipher.getAuthTag();

  return {
    ciphertext,
    iv,
    authTag,
    wrappedDek,
    dekIv,
    dekAuthTag,
    kekVersion: CURRENT_KEK_VERSION,
  };
}

export function decryptSecret(envelope: Envelope): string {
  const kek = getKek(envelope.kekVersion);
  const dekDecipher = crypto.createDecipheriv("aes-256-gcm", kek, envelope.dekIv);
  dekDecipher.setAuthTag(envelope.dekAuthTag);
  const dek = Buffer.concat([dekDecipher.update(envelope.wrappedDek), dekDecipher.final()]);

  const decipher = crypto.createDecipheriv("aes-256-gcm", dek, envelope.iv);
  decipher.setAuthTag(envelope.authTag);
  return Buffer.concat([decipher.update(envelope.ciphertext), decipher.final()]).toString("utf8");
}

export function maskSecret(plaintext: string): string {
  const tail = plaintext.slice(-4);
  const head = plaintext.slice(0, Math.min(3, Math.max(0, plaintext.length - 4)));
  return `${head}${"•".repeat(8)}${tail}`;
}

/** Envelope num unico valor jsonb (segredos de canal, ADR-006 #7); a chave de
 * IA continua em colunas proprias por compatibilidade. */
export interface SerializedEnvelope {
  ciphertext: string;
  iv: string;
  authTag: string;
  wrappedDek: string;
  dekIv: string;
  dekAuthTag: string;
  kekVersion: number;
}

export function serializeEnvelope(envelope: Envelope): SerializedEnvelope {
  const b64 = (b: Buffer) => b.toString("base64");
  return {
    ciphertext: b64(envelope.ciphertext),
    iv: b64(envelope.iv),
    authTag: b64(envelope.authTag),
    wrappedDek: b64(envelope.wrappedDek),
    dekIv: b64(envelope.dekIv),
    dekAuthTag: b64(envelope.dekAuthTag),
    kekVersion: envelope.kekVersion,
  };
}

export function deserializeEnvelope(value: SerializedEnvelope): Envelope {
  const buf = (s: string) => Buffer.from(s, "base64");
  return {
    ciphertext: buf(value.ciphertext),
    iv: buf(value.iv),
    authTag: buf(value.authTag),
    wrappedDek: buf(value.wrappedDek),
    dekIv: buf(value.dekIv),
    dekAuthTag: buf(value.dekAuthTag),
    kekVersion: value.kekVersion,
  };
}
