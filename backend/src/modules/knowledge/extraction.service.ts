import mammoth from "mammoth";
import pdfParse from "pdf-parse";
import { getSourceFile } from "../../storage/objects.js";
import { chunkText } from "./chunker.js";
import { sourcesRepository } from "./sources.repository.js";

export class SourceNotFoundError extends Error {}
export class ExtractionError extends Error {}

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

async function extractPlainText(
  source: NonNullable<Awaited<ReturnType<typeof sourcesRepository.findById>>>,
): Promise<string> {
  switch (source.kind) {
    case "texto":
      return source.raw_text ?? "";

    case "URL": {
      if (!source.origin_url) throw new ExtractionError("fonte do tipo URL sem origin_url");
      const response = await fetch(source.origin_url);
      if (!response.ok) throw new ExtractionError(`falha ao buscar URL: HTTP ${response.status}`);
      return stripHtml(await response.text());
    }

    case "PDF": {
      if (!source.storage_key) throw new ExtractionError("fonte PDF sem arquivo armazenado");
      const buffer = await getSourceFile(source.storage_key);
      const parsed = await pdfParse(buffer);
      return parsed.text;
    }

    case "DOCX": {
      if (!source.storage_key) throw new ExtractionError("fonte DOCX sem arquivo armazenado");
      const buffer = await getSourceFile(source.storage_key);
      const parsed = await mammoth.extractRawText({ buffer });
      return parsed.value;
    }
  }
}

export const extractionService = {
  /** Etapas 5 de docs/backend/especificacao-backend.md: normaliza texto e
   * divide em trechos. Retorna tambem o topic_id, que o modulo rag precisa
   * para escopar o chunk mas nao deve ler diretamente da tabela de fontes. */
  async extractAndChunk(
    organizationId: string,
    sourceId: string,
  ): Promise<{ topicId: string; chunks: string[] }> {
    const source = await sourcesRepository.findById(organizationId, sourceId);
    if (!source) throw new SourceNotFoundError();

    const text = await extractPlainText(source);
    return { topicId: source.topic_id, chunks: chunkText(text) };
  },
};
