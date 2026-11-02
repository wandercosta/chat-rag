import { API_BASE_URL, ApiError } from "./api-client";

/**
 * POST que recebe a resposta em pedacos (Server-Sent Events): eventos
 * `{ type: "delta", text }` e um `{ type: "done", ... }` com a resposta
 * final, que e a que vale. Se o servidor responder JSON (sem streaming), o
 * JSON e devolvido como resposta final.
 */
export async function postStreaming<T>(
  path: string,
  body: unknown,
  onDelta: (text: string) => void,
): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json", Accept: "text/event-stream" },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new ApiError(response.status, data?.error ?? `erro HTTP ${response.status}`, data);
  }
  if (!response.body || !response.headers.get("content-type")?.includes("event-stream")) {
    return response.json() as Promise<T>;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const blocks = buffer.split("\n\n");
    buffer = blocks.pop() ?? "";
    for (const block of blocks) {
      if (!block.startsWith("data: ")) continue; // comentario/heartbeat
      const event = JSON.parse(block.slice("data: ".length));
      if (event.type === "delta") onDelta(event.text);
      else if (event.type === "error") throw new ApiError(500, event.error);
      else if (event.type === "done") return event as T;
    }
  }
  throw new ApiError(500, "resposta interrompida");
}
