/** Erro de API de canal (Meta, Telegram), com a mensagem do provedor e nunca o token. */
export class ChannelApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }

  /** 5xx e limite de taxa valem nova tentativa; o resto e erro de dado. */
  get retryable() {
    return this.status >= 500 || this.status === 429;
  }
}

/**
 * Chamada JSON a um provedor. `describe` tira do corpo a mensagem de erro no
 * formato de cada um. A URL nao entra no erro: no Telegram o token vai nela.
 */
export async function requestJson<T>(
  url: string,
  init: RequestInit,
  describe: (body: unknown) => string | undefined,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...init.headers },
    });
  } catch {
    throw new ChannelApiError(503, "nao foi possivel falar com o provedor do canal");
  }
  const body = (await response.json().catch(() => ({}))) as T;
  if (!response.ok) {
    throw new ChannelApiError(response.status, describe(body) ?? `erro ${response.status}`);
  }
  return body;
}
