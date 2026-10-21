import crypto from "node:crypto";
import type { EmbeddingProvider } from "./provider.types.js";

type FeatureExtractor = (
  texts: string[],
  options: { pooling: "mean"; normalize: boolean },
) => Promise<{ tolist(): number[][] }>;

let extractorPromise: Promise<FeatureExtractor> | null = null;

/** Carrega o modelo uma vez por processo. O download (~120 MB) acontece no
 * build da imagem Docker; em dev ele vai para o cache do Hugging Face. */
function loadExtractor(model: string): Promise<FeatureExtractor> {
  extractorPromise ??= import("@huggingface/transformers").then(
    async ({ pipeline }) =>
      (await pipeline("feature-extraction", model, { dtype: "q8" })) as unknown as FeatureExtractor,
  );
  return extractorPromise;
}

/**
 * Embeddings rodando no proprio container (transformers.js + ONNX), sem chave
 * de API. O e5 multilingue espera os prefixos "query:" e "passage:".
 */
export function createLocalEmbeddings(model: string): EmbeddingProvider {
  return {
    // Medido com o CDC (scripts/debug-retrieval.ts): o melhor trecho de
    // perguntas cobertas pela lei ficou entre 0.125 e 0.138; perguntas fora do
    // escopo ("capital da Franca", "bolo de chocolate"), entre 0.182 e 0.221.
    relevanceThreshold: 0.16,
    async embed(texts, purpose) {
      const extractor = await loadExtractor(model);
      const prefixed = texts.map((t) => `${purpose}: ${t}`);
      const output = await extractor(prefixed, { pooling: "mean", normalize: true });
      return output.tolist();
    },
  };
}

const HASH_DIMENSIONS = 512;

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2);
}

/**
 * Vetor por hashing de termos (bag of words). Nao entende sinonimos, mas e
 * deterministico, instantaneo e funciona offline: usado nos testes e no CI,
 * onde baixar um modelo ou chamar uma API nao faz sentido.
 */
export function createHashEmbeddings(): EmbeddingProvider {
  return {
    relevanceThreshold: 0.9,
    async embed(texts) {
      return texts.map((text) => {
        const vector = new Array(HASH_DIMENSIONS).fill(0);
        for (const token of tokenize(text)) {
          const digest = crypto.createHash("md5").update(token).digest();
          vector[digest.readUInt32BE(0) % HASH_DIMENSIONS] += 1;
        }
        const norm = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0)) || 1;
        return vector.map((v) => v / norm);
      });
    },
  };
}
