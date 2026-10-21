/**
 * Diagnostico do limiar de relevancia do RAG (`relevanceThreshold` de cada
 * provedor de embeddings, ver src/modules/rag/). Mede a distancia cosine entre uma
 * pergunta e os chunks ja indexados de uma organizacao, sem passar pelo LLM.
 *
 * Serve para calibrar o limiar com dado real em vez de chute: rode com
 * perguntas que a base deveria responder e com perguntas claramente fora do
 * escopo, e escolha um valor na folga entre os dois grupos.
 *
 * Uso:
 *   npx tsx scripts/debug-retrieval.ts <organizationId> "pergunta 1" "pergunta 2" ...
 */
import { sql } from "kysely";
import { db } from "../src/db/client.js";
import { padEmbedding } from "../src/modules/rag/provider.types.js";
import { resolveEmbeddingProvider } from "../src/modules/rag/provider-resolver.js";

const [organizationId, ...questions] = process.argv.slice(2);

if (!organizationId || questions.length === 0) {
  console.error(
    'Uso: tsx scripts/debug-retrieval.ts <organizationId> "pergunta" ["outra pergunta" ...]',
  );
  process.exit(1);
}

const provider = await resolveEmbeddingProvider(organizationId);

for (const question of questions) {
  const [embedding] = await provider.embed([question], "query");
  const vector = `[${padEmbedding(embedding).join(",")}]`;

  const result = await sql<{ title: string; distance: number }>`
    select s.title, (sc.embedding <=> ${vector}::vector) as distance
    from source_chunks sc
    join sources s on s.id = sc.source_id
    where s.organization_id = ${organizationId}
    order by distance asc
    limit 3
  `.execute(db);

  console.log(`\n"${question}"`);
  if (result.rows.length === 0) {
    console.log("  (nenhum chunk indexado nesta organizacao)");
    continue;
  }
  for (const row of result.rows) {
    const distance = Number(row.distance);
    const mark = distance <= provider.relevanceThreshold ? "passa" : "corta";
    console.log(`  ${distance.toFixed(3)}  [${mark}]  ${row.title}`);
  }
}

console.log(`\nLimiar atual: ${RELEVANCE_DISTANCE_THRESHOLD}`);
await db.destroy();
