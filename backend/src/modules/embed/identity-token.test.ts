import { describe, expect, it } from "vitest";
import {
  InvalidIdentityTokenError,
  signIdentityToken,
  verifyIdentityToken,
} from "./identity-token.js";

const SECRET = "wis_segredo-de-teste";
const now = Date.UTC(2026, 0, 1);
const exp = Math.floor(now / 1000) + 3600;

describe("token de identidade do widget", () => {
  it("aceita token HS256 valido e devolve a identidade", () => {
    const token = signIdentityToken(
      { sub: "cliente-42", name: "Ana", email: "ana@x.com", context: { plano: "Pro" }, exp },
      SECRET,
    );
    expect(verifyIdentityToken(token, SECRET, now)).toEqual({
      externalUserId: "cliente-42",
      name: "Ana",
      email: "ana@x.com",
      context: { plano: "Pro" },
    });
  });

  it("recusa assinatura errada, alg none, vencido, sem sub e validade longa", () => {
    const bad =
      (payload: Record<string, unknown>, secret = SECRET) =>
      () =>
        verifyIdentityToken(signIdentityToken(payload, secret), SECRET, now);
    expect(bad({ sub: "a", exp }, "outro-segredo")).toThrow(InvalidIdentityTokenError);
    expect(bad({ sub: "a", exp: exp - 7200 })).toThrow("token vencido");
    expect(bad({ exp })).toThrow("sub obrigatorio");
    expect(bad({ sub: "a", exp: exp + 2 * 86400 })).toThrow("24 horas");
    expect(bad({ sub: "a" })).toThrow("token vencido");

    const [, body] = signIdentityToken({ sub: "a", exp }, SECRET).split(".");
    const none = `${Buffer.from('{"alg":"none"}').toString("base64url")}.${body}.`;
    expect(() => verifyIdentityToken(none, SECRET, now)).toThrow(InvalidIdentityTokenError);
    expect(() => verifyIdentityToken("lixo", SECRET, now)).toThrow("formato invalido");
  });
});
