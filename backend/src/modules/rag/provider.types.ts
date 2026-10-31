/**
 * Interfaces internas que separam chat e embeddings do fornecedor
 * (docs/backend/especificacao-backend.md - Provedor de IA). Chat e embeddings
 * sao resolvidos separadamente porque nem todo provedor oferece os dois (a
 * Anthropic nao tem API de embeddings) e porque o embedding precisa ser o
 * mesmo para o deploy inteiro, enquanto o chat pode vir da chave do tenant.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatProvider {
  /** "extractive" nao chama LLM: a resposta e montada a partir dos trechos. */
  kind: "llm" | "extractive";
  chat(messages: ChatMessage[], model: string): Promise<string>;
  /** Mesma resposta, mas avisando cada pedaco de texto assim que chega. */
  stream?(messages: ChatMessage[], model: string, onDelta: (text: string) => void): Promise<string>;
}

export interface EmbeddingProvider {
  /** Distancia cosine maxima para um trecho contar como relevante. Depende do
   * modelo: cada um distribui as distancias numa faixa diferente. */
  relevanceThreshold: number;
  embed(texts: string[], purpose: "query" | "passage"): Promise<number[][]>;
}

/** Dimensao da coluna `source_chunks.embedding` (migration source-chunks).
 * Modelos menores sao completados com zeros: isso nao altera a distancia
 * cosine entre dois vetores do mesmo modelo. */
export const EMBEDDING_DIMENSIONS = 1536;

export function padEmbedding(vector: number[]): number[] {
  if (vector.length > EMBEDDING_DIMENSIONS) {
    throw new Error(`embedding com ${vector.length} dimensoes excede ${EMBEDDING_DIMENSIONS}`);
  }
  if (vector.length === EMBEDDING_DIMENSIONS) return vector;
  return [...vector, ...new Array(EMBEDDING_DIMENSIONS - vector.length).fill(0)];
}
