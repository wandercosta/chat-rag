const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;

/** Divisao por tamanho fixo com sobreposicao, respeitando quebras de palavra
 * quando possivel. Simples de proposito: metadados/estrategia mais ricos
 * (por paragrafo, por secao) ficam para uma iteracao futura. */
export function chunkText(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + CHUNK_SIZE, normalized.length);
    if (end < normalized.length) {
      const lastSpace = normalized.lastIndexOf(" ", end);
      if (lastSpace > start) end = lastSpace;
    }

    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) break;
    start = Math.max(end - CHUNK_OVERLAP, start + 1);
  }

  return chunks.filter((c) => c.length > 0);
}
