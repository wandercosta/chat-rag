import { sql } from "kysely";
import { db } from "../../db/client.js";

export interface NewChunk {
  organizationId: string;
  sourceId: string;
  topicId: string;
  content: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

function toVectorLiteral(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

export interface RetrievedChunk {
  id: string;
  content: string;
  source_id: string;
  source_title: string;
  topic_id: string;
  distance: number;
}

export const chunksRepository = {
  async insertMany(chunks: NewChunk[]): Promise<void> {
    if (chunks.length === 0) return;

    for (const chunk of chunks) {
      await sql`
        insert into source_chunks (organization_id, source_id, topic_id, content, embedding, metadata)
        values (
          ${chunk.organizationId},
          ${chunk.sourceId},
          ${chunk.topicId},
          ${chunk.content},
          ${toVectorLiteral(chunk.embedding)}::vector,
          ${JSON.stringify(chunk.metadata ?? {})}::jsonb
        )
      `.execute(db);
    }
  },

  async deleteForSource(sourceId: string): Promise<void> {
    await db.deleteFrom("source_chunks").where("source_id", "=", sourceId).execute();
  },

  /** Busca por similaridade (cosine, via HNSW) restrita a organizacao e ao
   * conjunto de topicos acessiveis ao assistente (docs/security - filtro de
   * organizacao/assistente e obrigatorio, nunca opcional). */
  async searchSimilar(
    organizationId: string,
    topicIds: string[],
    queryEmbedding: number[],
    limit: number,
  ): Promise<RetrievedChunk[]> {
    if (topicIds.length === 0) return [];

    const result = await sql<RetrievedChunk>`
      select c.id, c.content, c.source_id, s.title as source_title, c.topic_id,
        c.embedding <=> ${toVectorLiteral(queryEmbedding)}::vector as distance
      from source_chunks c
      join sources s on s.id = c.source_id
      where c.organization_id = ${organizationId}
        and c.topic_id = any(${sql`array[${sql.join(topicIds)}]::uuid[]`})
      order by c.embedding <=> ${toVectorLiteral(queryEmbedding)}::vector
      limit ${limit}
    `.execute(db);

    return result.rows;
  },
};
