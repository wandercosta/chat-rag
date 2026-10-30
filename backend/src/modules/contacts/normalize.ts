/** E-mail e telefone em forma unica, para a busca por duplicado funcionar. */

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeEmail(raw: string | null | undefined): string | null {
  const value = raw?.trim().toLowerCase();
  if (!value) return null;
  return EMAIL.test(value) ? value : null;
}

/**
 * Telefone em E.164 ("+5511999998888"). Numero brasileiro sem DDI (10 ou 11
 * digitos, ex.: "(11) 99999-8888") ganha o 55; com "+" na frente, o DDI e o
 * que veio. Fora de 10 a 15 digitos, e invalido.
 */
export function normalizePhone(raw: string | null | undefined): string | null {
  const value = raw?.trim();
  if (!value) return null;
  let digits = value.replace(/\D/g, "");
  if (!value.startsWith("+") && (digits.length === 10 || digits.length === 11)) {
    digits = `55${digits}`;
  }
  if (digits.length < 10 || digits.length > 15) return null;
  return `+${digits}`;
}

/** Chave de coluna/campo comparavel: sem acento, minuscula, com "_". */
export function normalizeKey(raw: string): string {
  return raw
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_|_$/g, "");
}

const TRUTHY = new Set(["sim", "s", "yes", "y", "true", "1", "x"]);

export function isTruthy(raw: string | null | undefined): boolean {
  return TRUTHY.has(normalizeKey(raw ?? ""));
}
