import type { FastifyReply, FastifyRequest } from "fastify";

/** Abaixo do timeout ocioso tipico de proxies (60s), para a conexao nao cair. */
const HEARTBEAT_MS = 25_000;

export interface SseStream {
  send(data: unknown): void;
  /** Roda quando o cliente desconecta (ou na hora, se ja desconectou). */
  onClose(cleanup: () => void | Promise<void>): void;
}

/**
 * Server-Sent Events sobre a resposta crua do Node. `hijack` tira a resposta
 * do ciclo do Fastify, entao os cabecalhos ja definidos pelos hooks (CORS em
 * cors.ts) sao copiados a mao.
 */
/**
 * Limpeza de quem desconectou e melhor esforco: se o Redis estiver fora do ar
 * (ou fechando) nessa hora, o erro fica aqui. Uma rejeicao sem tratamento
 * derrubaria o processo da API inteiro por causa de um cliente que saiu.
 */
function runCleanup(cleanup: () => void | Promise<void>) {
  Promise.resolve()
    .then(cleanup)
    .catch(() => {});
}

export function startSse(request: FastifyRequest, reply: FastifyReply): SseStream {
  reply.hijack();
  const inherited: Record<string, string> = {};
  for (const [name, value] of Object.entries(reply.getHeaders())) {
    if (value !== undefined) inherited[name] = String(value);
  }
  reply.raw.writeHead(200, {
    ...inherited,
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  reply.raw.write(": conectado\n\n");

  let closed = false;
  const cleanups: Array<() => void | Promise<void>> = [];
  const heartbeat = setInterval(() => reply.raw.write(": ping\n\n"), HEARTBEAT_MS);

  request.raw.on("close", () => {
    closed = true;
    clearInterval(heartbeat);
    for (const cleanup of cleanups) runCleanup(cleanup);
  });

  return {
    send(data) {
      if (!closed) reply.raw.write(`data: ${JSON.stringify(data)}\n\n`);
    },
    onClose(cleanup) {
      if (closed) runCleanup(cleanup);
      else cleanups.push(cleanup);
    },
  };
}
