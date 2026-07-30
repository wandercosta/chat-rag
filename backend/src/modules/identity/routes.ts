import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { env } from "../../config/env.js";
import { InvalidCredentialsError, identityService } from "./service.js";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function identityRoutes(app: FastifyInstance) {
  app.post("/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);

    let token: string;
    try {
      token = await identityService.login(body.email, body.password);
    } catch (err) {
      if (err instanceof InvalidCredentialsError) {
        return reply.code(401).send({ error: "credenciais invalidas" });
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

  app.get("/auth/me", async (request, reply) => {
    if (!request.auth) return reply.code(401).send({ error: "sem sessao ativa" });
    return reply.send({ auth: request.auth });
  });
}
