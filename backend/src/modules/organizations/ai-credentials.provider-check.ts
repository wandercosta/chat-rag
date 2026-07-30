import OpenAI from "openai";

/**
 * Validacao controlada da chave antes de ativa-la (docs/backend/especificacao-backend.md).
 * Escopo deliberadamente minimo: so confirma que a chave autentica com sucesso.
 * A interface completa de provedor (chat/embeddings/moderacao) pertence ao
 * modulo rag e sera implementada junto da recuperacao/geracao de resposta.
 */
export async function validateOpenAiKey(apiKey: string): Promise<boolean> {
  const client = new OpenAI({ apiKey });
  try {
    await client.models.list();
    return true;
  } catch {
    return false;
  }
}
