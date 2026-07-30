import { knowledgeAccessService } from "../knowledge/index.js";
import { chunksRepository, type RetrievedChunk } from "./chunks.repository.js";
import { resolveProviderForTenant } from "./provider-resolver.js";

/** Distancia cosine (pgvector `<=>`, 0 = identico, 2 = oposto). Abaixo deste
 * limiar o chunk conta como relevante o suficiente para responder (ADR
 * futuro pode tornar isso configuravel por assistente). */
export const RELEVANCE_DISTANCE_THRESHOLD = 0.45;
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
    environment: "teste" | "producao",
  ): Promise<RetrievalResult> {
    const topicIds = await knowledgeAccessService.listAccessibleTopicIds(organizationId, assistantId);
    if (topicIds.length === 0) return { chunks: [], sufficientContext: false };

    const provider = await resolveProviderForTenant(organizationId, environment);
    const [queryEmbedding] = await provider.embed([query]);

    const candidates = await chunksRepository.searchSimilar(organizationId, topicIds, queryEmbedding, MAX_CHUNKS);
    const relevant = candidates.filter((c) => c.distance <= RELEVANCE_DISTANCE_THRESHOLD);

    return { chunks: relevant, sufficientContext: relevant.length > 0 };
  },
};
