import type { FastifyReply, FastifyRequest } from "fastify";
import { AssistantNotFoundError, NoActiveCredentialError } from "../rag/index.js";
import {
  DomainNotAllowedError,
  InvalidKeyError,
  OrganizationSuspendedError,
} from "./public-access.service.js";

export function originOf(request: FastifyRequest): string | undefined {
  return (
    (request.headers.origin as string | undefined) ??
    (request.headers.referer as string | undefined)
  );
}

export function handlePublicError(err: unknown, reply: FastifyReply) {
  if (err instanceof InvalidKeyError) return reply.code(401).send({ error: "chave invalida" });
  if (err instanceof DomainNotAllowedError)
    return reply.code(403).send({ error: "dominio nao autorizado" });
  if (err instanceof OrganizationSuspendedError) {
    return reply.code(403).send({ error: "atendimento indisponivel" });
  }
  if (err instanceof AssistantNotFoundError)
    return reply.code(404).send({ error: "assistente nao encontrado" });
  if (err instanceof NoActiveCredentialError) {
    return reply.code(409).send({ error: "assistente indisponivel no momento" });
  }
  throw err;
}
