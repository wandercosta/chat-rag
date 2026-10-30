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
/** Candidatos buscados no pgvector antes da reordenacao. */
const CANDIDATES = 12;
/** Peso da sobreposicao de termos na reordenacao. As distancias dos melhores
 * candidatos costumam ficar a menos de 0.02 umas das outras; com este peso,
 * um trecho que contem as palavras da pergunta passa a frente de outro so
 * levemente mais proximo no espaco vetorial. */
const LEXICAL_WEIGHT = 0.03;

const STOPWORDS = new Set([
  "para", "pela", "pelo", "como", "qual", "quais", "quando", "onde", "posso", "pode",
  "sobre", "minha", "meu", "seus", "suas", "isso", "esse", "essa", "este", "esta",
  "uma", "com", "sem", "que", "dos", "das", "nos", "nas", "por", "mais", "muito",
]);

/** Radicais de 5 letras sem acento: "desistir" casa com "desistencia". */
export function queryTerms(text: string): string[] {
  const words = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 3 && !STOPWORDS.has(w));
  return [...new Set(words.map((w) => w.slice(0, 5)))];
}

/** Fracao dos termos da pergunta que aparecem no trecho. */
export function lexicalOverlap(terms: string[], content: string): number {
  if (terms.length === 0) return 0;
  const haystack = content.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
  return terms.filter((t) => haystack.includes(t)).length / terms.length;
}

/**
 * Reordenacao hibrida: distancia vetorial menos um bonus pela sobreposicao
 * de termos. O filtro de relevancia continua usando so a distancia vetorial.
 */
export function rerank(chunks: RetrievedChunk[], query: string): RetrievedChunk[] {
  const terms = queryTerms(query);
  return chunks
    .map((c) => ({ c, score: c.distance - LEXICAL_WEIGHT * lexicalOverlap(terms, c.content) }))
    .sort((a, b) => a.score - b.score)
    .map(({ c }) => c);
}

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
      CANDIDATES,
    );
    const relevant = rerank(
      candidates.filter((c) => c.distance <= provider.relevanceThreshold),
      query,
    ).slice(0, MAX_CHUNKS);

    return { chunks: relevant, sufficientContext: relevant.length > 0 };
  },
};
