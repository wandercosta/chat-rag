import crypto from "node:crypto";

/** Chave publica do widget: nao e um segredo de aplicacao (fica exposta no
 * HTML do site hospedeiro), mas ainda assim so o hash e persistido, para que
 * um vazamento do banco nao permita reconstruir chaves validas em lote. */
export function generateEmbedKey(environment: "teste" | "producao"): string {
  const prefix = environment === "producao" ? "pk_live_" : "pk_test_";
  return `${prefix}${crypto.randomBytes(24).toString("hex")}`;
}

export function hashEmbedKey(plaintext: string): string {
  return crypto.createHash("sha256").update(plaintext).digest("hex");
}

export function maskEmbedKey(plaintext: string): string {
  return `${plaintext.slice(0, 8)}${"•".repeat(8)}${plaintext.slice(-4)}`;
}
