import { knowledgeAccessService } from "../knowledge/index.js";
import { chunksRepository, type RetrievedChunk } from "./chunks.repository.js";
import { padEmbedding } from "./provider.types.js";
import { resolveEmbeddingProvider } from "./provider-resolver.js";

/**
 * Distancia cosine (pgvector `<=>`, 0 = identico, 2 = oposto). Abaixo do
 * limiar do provedor de embeddings (`relevanceThreshold`) o chunk conta como
 * relevante o suficiente para responder.
 *
 * Historico da calibracao com OpenAI:
 * 0.45 era estrito demais e recusava pergunta cuja resposta estava
 * literalmente na base (ex.: "quem e o representante legal?" contra uma ficha
 * cadastral que traz o nome do representante). Medido com `text-embedding-3-small`
 * numa base real (ver `scripts/debug-retrieval.ts`): perguntas legitimas ficaram
 * entre 0.42 e 0.56; perguntas fora do escopo ("qual a capital da Franca?",
 * "como faco um bolo?") ficaram entre 0.70 e 0.83. 0.65 fica na folga entre os
 * dois grupos. O modelo local tem seu proprio limiar (local-embeddings.ts).
 *
 * Este limiar e o primeiro filtro, nao o unico: o prompt do modo estrito manda
 * o modelo dizer que nao encontrou quando o contexto recuperado nao contem a
 * resposta, entao um chunk pouco relevante que passe aqui ainda nao vira
 * invencao.
 */
const MAX_CHUNKS = 6;

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  sufficientContext: boolean;
}

export const retrievalService = {
  async retrieve(
    organizationId: string,
    assistantId: string,
    query: string,
  ): Promise<RetrievalResult> {
    const topicIds = await knowledgeAccessService.listAccessibleTopicIds(
      organizationId,
      assistantId,
    );
    if (topicIds.length === 0) return { chunks: [], sufficientContext: false };

    const provider = await resolveEmbeddingProvider(organizationId);
    const [queryEmbedding] = await provider.embed([query], "query");

    const candidates = await chunksRepository.searchSimilar(
      organizationId,
      topicIds,
      padEmbedding(queryEmbedding),
      MAX_CHUNKS,
    );
    const relevant = candidates.filter((c) => c.distance <= provider.relevanceThreshold);

    return { chunks: relevant, sufficientContext: relevant.length > 0 };
  },
};
