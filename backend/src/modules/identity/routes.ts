import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config/env.js";
import { InvalidCredentialsError, TooManyAttemptsError, identityService } from "./service.js";
import {
  InvalidTwoFactorCodeError,
  TwoFactorRequiredError,
  TwoFactorStateError,
  twoFactorService,
} from "./two-factor.service.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  /** Codigo do aplicativo autenticador ou de recuperacao, quando o 2FA esta ativo. */
  code: z.string().trim().max(20).optional(),
});
const codeSchema = z.object({ code: z.string().trim().min(6).max(20) });

export async function identityRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);

    let token: string;
    try {
      token = await identityService.login(body.email, body.password, body.code);
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        return reply.code(401).send({ error: "credenciais invalidas" });
      }
      if (err instanceof TwoFactorRequiredError) {
        return reply
          .code(401)
          .send({ error: "informe o codigo do aplicativo autenticador", twoFactorRequired: true });
      }
      if (err instanceof InvalidTwoFactorCodeError) {
        return reply.code(401).send({ error: "codigo invalido", twoFactorRequired: true });
      }
      if (err instanceof TooManyAttemptsError) {
        return reply.code(429).send({ error: "muitas tentativas; espere 15 minutos" });
      }
      throw err;
    }

    reply.setCookie(env.SESSION_COOKIE_NAME, token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: env.SESSION_TTL_HOURS * 3600,
    });
    return reply.send({ ok: true });
  });

  app.post("/auth/logout", async (request, reply) => {
    const token = request.cookies[env.SESSION_COOKIE_NAME];
    if (token) await identityService.logout(token);
    reply.clearCookie(env.SESSION_COOKIE_NAME, { path: "/" });
    return reply.send({ ok: true });
  });

  // Verificacao em duas etapas da propria conta (etapa 8, ADR-006).
  app.get("/auth/2fa", async (request, reply) => {
    if (!request.auth) return reply.code(401).send({ error: "sem sessao ativa" });
    return twoFactorService.status(request.auth.userId);
  });

  app.post("/auth/2fa/setup", async (request, reply) => {
    if (!request.auth) return reply.code(401).send({ error: "sem sessao ativa" });
    try {
      return await twoFactorService.setup(request.auth.userId);
    } catch (err) {
      if (err instanceof TwoFactorStateError)
        return reply.code(409).send({ error: "a verificacao em duas etapas ja esta ativa" });
      throw err;
    }
  });

  app.post("/auth/2fa/enable", async (request, reply) => {
    if (!request.auth) return reply.code(401).send({ error: "sem sessao ativa" });
    const { code } = codeSchema.parse(request.body);
    try {
      return await twoFactorService.enable(request.auth.userId, code);
    } catch (err) {
      if (err instanceof InvalidTwoFactorCodeError)
        return reply.code(422).send({ error: "codigo invalido; confira o relogio do celular" });
      if (err instanceof TwoFactorStateError)
        return reply.code(409).send({ error: "gere a chave de novo antes de ativar" });
      throw err;
    }
  });

  app.post("/auth/2fa/disable", async (request, reply) => {
    if (!request.auth) return reply.code(401).send({ error: "sem sessao ativa" });
    const { code } = codeSchema.parse(request.body);
    try {
      await twoFactorService.disable(request.auth.userId, code);
      return { ok: true };
    } catch (err) {
      if (err instanceof InvalidTwoFactorCodeError)
        return reply.code(422).send({ error: "codigo invalido" });
      if (err instanceof TwoFactorStateError)
        return reply.code(409).send({ error: "a verificacao em duas etapas nao esta ativa" });
      throw err;
    }
  });

  app.get("/auth/me", async (request, reply) => {
    if (!request.auth) return reply.code(401).send({ error: "sem sessao ativa" });
    return reply.send({ auth: request.auth });
  });
}
