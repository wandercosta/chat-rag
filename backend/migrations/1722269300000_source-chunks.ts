import type { MigrationBuilder } from "node-pg-migrate";

// text-embedding-3-small (OpenAI) = 1536 dimensoes. Fixado aqui porque pgvector
// exige tamanho de vetor conhecido na definicao da coluna/indice.
const EMBEDDING_DIMENSIONS = 1536;

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`
    CREATE TABLE source_chunks (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      organization_id uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
      source_id uuid NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
      topic_id uuid NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
      content text NOT NULL,
      embedding vector(${EMBEDDING_DIMENSIONS}) NOT NULL,
      metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
      created_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  pgm.sql(`CREATE INDEX source_chunks_org_idx ON source_chunks (organization_id)`);
  pgm.sql(`CREATE INDEX source_chunks_source_idx ON source_chunks (source_id)`);
  // HNSW por padrao (ADR-002 #4): melhor tempo de consulta, custo de construcao aceito.
  pgm.sql(
    `CREATE INDEX source_chunks_embedding_hnsw ON source_chunks USING hnsw (embedding vector_cosine_ops)`,
  );
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.sql(`DROP TABLE IF EXISTS source_chunks`);
}
