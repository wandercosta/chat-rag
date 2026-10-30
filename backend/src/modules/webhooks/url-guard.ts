import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { env } from "../../config/env.js";

export class UnsafeWebhookUrlError extends Error {}

/**
 * Protecao contra SSRF: o servidor nao pode ser usado para chamar a propria
 * rede interna (metadados de nuvem, Redis, Postgres...). Fora de teste/dev,
 * so https e so endereco publico. O destino e conferido de novo a cada
 * entrega, porque o DNS pode mudar depois do cadastro.
 */
export function assertWebhookUrl(raw: string): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new UnsafeWebhookUrlError("URL invalida");
  }
  if (url.username || url.password) throw new UnsafeWebhookUrlError("URL com credenciais");
  const allowed = env.WEBHOOKS_ALLOW_PRIVATE_NETWORK ? ["https:", "http:"] : ["https:"];
  if (!allowed.includes(url.protocol)) throw new UnsafeWebhookUrlError("a URL precisa ser https");
  return url;
}

export async function assertPublicTarget(url: URL): Promise<void> {
  if (env.WEBHOOKS_ALLOW_PRIVATE_NETWORK) return;
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [host]
    : (await lookup(host, { all: true }).catch(() => [])).map((a) => a.address);
  if (addresses.length === 0) throw new UnsafeWebhookUrlError("endereco nao encontrado");
  if (addresses.some(isPrivateAddress)) {
    throw new UnsafeWebhookUrlError("a URL aponta para uma rede interna");
  }
}

export function isPrivateAddress(address: string): boolean {
  const ip = address.toLowerCase();
  if (isIP(ip) === 6) {
    if (ip.startsWith("::ffff:")) return isPrivateAddress(ip.slice(7));
    return (
      ip === "::" ||
      ip === "::1" ||
      /^f[cd]/.test(ip) || // ULA
      /^fe[89ab]/.test(ip) || // link-local
      ip.startsWith("ff") // multicast
    );
  }
  const [a, b] = ip.split(".").map(Number);
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}
