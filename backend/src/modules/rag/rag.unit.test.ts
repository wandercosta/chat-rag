import { describe, expect, it } from "vitest";
import { toAnthropicMessages } from "./anthropic-adapter.js";
import { bestExcerpt, citationsUsed, type Citation } from "./answer.service.js";
import { lexicalOverlap, queryTerms, rerank } from "./retrieval.service.js";
import { createHashEmbeddings } from "./local-embeddings.js";
import { EMBEDDING_DIMENSIONS, padEmbedding } from "./provider.types.js";

const citations: Citation[] = [1, 2, 3].map((index) => ({
  index,
  sourceId: `s${index}`,
  sourceTitle: `Doc ${index}`,
  excerpt: `trecho ${index}`,
}));

describe("citationsUsed", () => {
  it("keeps only the citations the answer referenced", () => {
    const used = citationsUsed("O prazo e de 7 dias [2]. Vale tambem [3].", citations);
    expect(used.map((c) => c.index)).toEqual([2, 3]);
  });

  it("falls back to the most relevant excerpt when nothing was referenced", () => {
    expect(citationsUsed("Resposta sem marcacao.", citations)).toEqual([citations[0]]);
  });

  it("ignores references to excerpts that were not retrieved", () => {
    expect(citationsUsed("Ver [9].", citations)).toEqual([citations[0]]);
  });
});

describe("toAnthropicMessages", () => {
  it("moves system messages out of the list and starts the conversation on a user turn", () => {
    const result = toAnthropicMessages([
      { role: "system", content: "regras" },
      { role: "assistant", content: "resposta antiga sem pergunta" },
      { role: "user", content: "pergunta" },
      { role: "assistant", content: "resposta" },
      { role: "user", content: "e agora?" },
    ]);

    expect(result.system).toBe("regras");
    expect(result.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  });
});

describe("padEmbedding", () => {
  it("pads smaller vectors to the column size without changing cosine similarity", () => {
    const padded = padEmbedding([0.6, 0.8]);
    expect(padded).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(padded.slice(0, 2)).toEqual([0.6, 0.8]);
    expect(padded.slice(2).every((v) => v === 0)).toBe(true);
  });

  it("rejects vectors larger than the column", () => {
    expect(() => padEmbedding(new Array(EMBEDDING_DIMENSIONS + 1).fill(0))).toThrow();
  });
});

describe("hash embeddings", () => {
  const cosine = (a: number[], b: number[]) => a.reduce((sum, v, i) => sum + v * b[i], 0);

  it("scores a related passage above an unrelated one", async () => {
    const provider = createHashEmbeddings();
    const [query, related, unrelated] = await provider.embed(
      [
        "prazo para desistir da compra",
        "O consumidor pode desistir do contrato no prazo de 7 dias",
        "receita de bolo de chocolate com cobertura",
      ],
      "passage",
    );
    expect(cosine(query, related)).toBeGreaterThan(cosine(query, unrelated));
  });
});

describe("hybrid rerank", () => {
  const chunk = (id: string, distance: number, content: string) => ({
    id,
    content,
    distance,
    source_id: "s",
    source_title: "CDC",
    topic_id: "t",
  });

  it("puts the excerpt with the question terms ahead of a slightly closer one", () => {
    const ranked = rerank(
      [
        chunk("a", 0.136, "o consumidor pode exigir a substituicao das partes viciadas"),
        chunk("b", 0.137, "Art. 49. O consumidor pode desistir do contrato no prazo de 7 dias"),
      ],
      "Comprei pela internet. Em quantos dias posso desistir da compra?",
    );
    expect(ranked.map((c) => c.id)).toEqual(["b", "a"]);
  });

  it("matches accent-free stems", () => {
    expect(queryTerms("desistência da compra")).toEqual(["desis", "compr"]);
    expect(lexicalOverlap(["desis"], "pode DESISTIR do contrato")).toBe(1);
  });
});

describe("bestExcerpt", () => {
  const content =
    "Art. 48. As declaracoes de vontade constantes de escritos particulares vinculam o fornecedor. " +
    "Art. 49. O consumidor pode desistir do contrato, no prazo de 7 dias a contar de sua assinatura. " +
    "Paragrafo unico. Se o consumidor exercer o direito de arrependimento, os valores serao devolvidos.";

  it("starts at the sentence that best matches the question", () => {
    const excerpt = bestExcerpt(content, "Em quantos dias posso desistir da compra?");
    expect(excerpt).toMatch(/^… Art\. 49\./);
    expect(excerpt).toContain("7 dias");
  });

  it("keeps the beginning when the first sentence is the best one", () => {
    expect(bestExcerpt(content, "declaracoes de vontade em escritos particulares")).toMatch(/^Art\. 48\./);
  });
});
