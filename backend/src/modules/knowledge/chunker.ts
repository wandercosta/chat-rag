const CHUNK_SIZE = 1000;
const CHUNK_OVERLAP = 150;
/** O corte so recua ate uma fronteira de frase se ela estiver nesta fracao
 * final da janela; antes disso o trecho ficaria curto demais. */
const MIN_SENTENCE_CUT = 0.6;

/** Fim de frase: ponto, interrogacao, exclamacao ou ponto e virgula seguidos
 * de espaco. Em texto de lei, ";" fecha incisos e e um bom ponto de corte. */
const SENTENCE_END = /[.!?;]\s/g;

function lastSentenceEnd(text: string, from: number, to: number): number {
  let found = -1;
  SENTENCE_END.lastIndex = from;
  for (let m = SENTENCE_END.exec(text); m && m.index < to; m = SENTENCE_END.exec(text)) {
    found = m.index + 1;
  }
  return found;
}

/**
 * Divisao por tamanho com sobreposicao. O corte prefere fim de frase e, na
 * falta dele, um espaco; o inicio do trecho seguinte tambem cai num espaco.
 * Antes o inicio podia cair no meio de uma palavra ("t. 84 e paragrafos. Art.
 * 49..."), o que piorava o embedding e aparecia feio na citacao.
 */
export function chunkText(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < normalized.length) {
    let end = Math.min(start + CHUNK_SIZE, normalized.length);
    if (end < normalized.length) {
      const sentenceEnd = lastSentenceEnd(normalized, start + CHUNK_SIZE * MIN_SENTENCE_CUT, end);
      const lastSpace = normalized.lastIndexOf(" ", end);
      if (sentenceEnd > start) end = sentenceEnd;
      else if (lastSpace > start) end = lastSpace;
    }

    chunks.push(normalized.slice(start, end).trim());
    if (end >= normalized.length) break;

    let next = Math.max(end - CHUNK_OVERLAP, start + 1);
    const space = normalized.indexOf(" ", next);
    if (space !== -1 && space < end) next = space + 1;
    start = next;
  }

  return chunks.filter((c) => c.length > 0);
}
