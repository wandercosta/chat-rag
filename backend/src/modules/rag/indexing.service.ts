import { chunksRepository } from "./chunks.repository.js";
import { padEmbedding } from "./provider.types.js";
import { resolveEmbeddingProvider } from "./provider-resolver.js";

/** Lotes pequenos: o modelo local roda na CPU do container e a API da OpenAI
 * limita o tamanho da requisicao. */
const EMBED_BATCH_SIZE = 32;

/** Consumido pelo worker de indexacao (task da fila) apos o modulo knowledge
 * extrair e dividir a fonte em trechos de texto puro. */
export const indexingService = {
  async embedAndStoreChunks(
    organizationId: string,
    sourceId: string,
    topicId: string,
    textChunks: string[],
  ): Promise<number> {
    if (textChunks.length === 0) return 0;

    await chunksRepository.deleteForSource(sourceId);

    const provider = await resolveEmbeddingProvider(organizationId);
    const embeddings: number[][] = [];
    for (let i = 0; i < textChunks.length; i += EMBED_BATCH_SIZE) {
      const batch = textChunks.slice(i, i + EMBED_BATCH_SIZE);
      embeddings.push(...(await provider.embed(batch, "passage")));
    }

    await chunksRepository.insertMany(
      textChunks.map((content, i) => ({
        organizationId,
        sourceId,
        topicId,
        content,
        embedding: padEmbedding(embeddings[i]),
        metadata: { position: i },
      })),
    );

    return textChunks.length;
  },
};
