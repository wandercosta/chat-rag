import { chunksRepository } from "./chunks.repository.js";
import { resolveAnyProviderForTenant } from "./provider-resolver.js";

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

    const provider = await resolveAnyProviderForTenant(organizationId);
    const embeddings = await provider.embed(textChunks);

    await chunksRepository.insertMany(
      textChunks.map((content, i) => ({
        organizationId,
        sourceId,
        topicId,
        content,
        embedding: embeddings[i],
      })),
    );

    return textChunks.length;
  },
};
