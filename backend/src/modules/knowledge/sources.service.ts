import { aiCredentialsService } from "../organizations/index.js";
import { auditService } from "../audit/index.js";
import { enqueueSourceIndexing } from "../../queue/source-indexing.queue.js";
import { collectionsRepository } from "./collections.repository.js";
import { sourcesRepository } from "./sources.repository.js";
import { topicsRepository } from "./topics.repository.js";
import type { SourceKind, SourceStatus } from "../../db/types.js";

export class TopicNotFoundError extends Error {}
export class InvalidTransitionError extends Error {}

const MAX_TEXT_LENGTH = 200_000;
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

async function nextStatusAfterReviewGate(organizationId: string): Promise<SourceStatus> {
  const hasKey = await aiCredentialsService.hasAnyActiveKey(organizationId);
  return hasKey ? "fila" : "aguardando_ativacao";
}

async function enqueueIfQueued(organizationId: string, sourceId: string, status: SourceStatus) {
  if (status === "fila") await enqueueSourceIndexing({ organizationId, sourceId });
}

export const sourcesService = {
  list(organizationId: string, topicId: string) {
    return sourcesRepository.listForTopic(organizationId, topicId);
  },

  get(organizationId: string, id: string) {
    return sourcesRepository.findById(organizationId, id);
  },

  /**
   * Etapas 1-3 de docs/backend/especificacao-backend.md (Processamento de fonte):
   * valida, persiste mesmo sem chave de IA, e so entra na fila se a revisao
   * (quando exigida pela colecao do topico) e a ativacao ja tiverem passado.
   */
  async createTextOrUrl(
    actorUserId: string,
    organizationId: string,
    input: { topicId: string; title: string; kind: "texto" | "URL"; content: string },
  ) {
    const topic = await topicsRepository.findById(organizationId, input.topicId);
    if (!topic) throw new TopicNotFoundError();

    if (input.kind === "texto" && input.content.length > MAX_TEXT_LENGTH) {
      throw new RangeError(`texto excede o limite de ${MAX_TEXT_LENGTH} caracteres`);
    }

    const requiresReview = await collectionsRepository.requiresReview(topic.collection_id);
    const status: SourceStatus = requiresReview ? "aguardando_revisao" : await nextStatusAfterReviewGate(organizationId);

    const source = await sourcesRepository.insert({
      organizationId,
      topicId: input.topicId,
      title: input.title,
      kind: input.kind,
      status,
      originUrl: input.kind === "URL" ? input.content : null,
      rawText: input.kind === "texto" ? input.content : null,
    });

    await auditService.record({
      actorUserId,
      organizationId,
      action: "Criou fonte",
      type: "conteudo",
      target: source.title,
    });

    await enqueueIfQueued(organizationId, source.id, source.status);
    return source;
  },

  async createFileSource(
    actorUserId: string,
    organizationId: string,
    input: { topicId: string; title: string; kind: Extract<SourceKind, "PDF" | "DOCX">; storageKey: string },
  ) {
    const topic = await topicsRepository.findById(organizationId, input.topicId);
    if (!topic) throw new TopicNotFoundError();

    const requiresReview = await collectionsRepository.requiresReview(topic.collection_id);
    const status: SourceStatus = requiresReview ? "aguardando_revisao" : await nextStatusAfterReviewGate(organizationId);

    const source = await sourcesRepository.insert({
      organizationId,
      topicId: input.topicId,
      title: input.title,
      kind: input.kind,
      status,
      storageKey: input.storageKey,
    });

    await auditService.record({
      actorUserId,
      organizationId,
      action: "Enviou arquivo de fonte",
      type: "conteudo",
      target: source.title,
    });

    await enqueueIfQueued(organizationId, source.id, source.status);
    return source;
  },

  /** Aprovacao manual apos revisao (docs/workflows/rag-e-conhecimento.md). */
  async approve(actorUserId: string, organizationId: string, id: string) {
    const source = await sourcesRepository.findById(organizationId, id);
    if (!source || source.status !== "aguardando_revisao") throw new InvalidTransitionError();

    const nextStatus = await nextStatusAfterReviewGate(organizationId);
    const updated = await sourcesRepository.setStatus(organizationId, id, nextStatus);

    await auditService.record({
      actorUserId,
      organizationId,
      action: "Aprovou fonte",
      type: "conteudo",
      target: source.title,
    });

    await enqueueIfQueued(organizationId, id, nextStatus);
    return updated;
  },

  async reindex(actorUserId: string, organizationId: string, id: string) {
    const source = await sourcesRepository.findById(organizationId, id);
    if (!source || !["pronta", "erro"].includes(source.status)) throw new InvalidTransitionError();

    const nextStatus = await nextStatusAfterReviewGate(organizationId);
    const updated = await sourcesRepository.setStatus(organizationId, id, nextStatus);

    await auditService.record({
      actorUserId,
      organizationId,
      action: "Reindexou fonte",
      type: "conteudo",
      target: source.title,
    });

    await enqueueIfQueued(organizationId, id, nextStatus);
    return updated;
  },

  async archive(actorUserId: string, organizationId: string, id: string) {
    const source = await sourcesRepository.findById(organizationId, id);
    if (!source || !["pronta", "erro"].includes(source.status)) throw new InvalidTransitionError();

    const updated = await sourcesRepository.setStatus(organizationId, id, "arquivada");

    await auditService.record({
      actorUserId,
      organizationId,
      action: "Arquivou fonte",
      type: "conteudo",
      target: source.title,
    });

    return updated;
  },

  /** Chamadas pelo worker de indexacao (task da fila), fora do fluxo HTTP. */
  markProcessing(organizationId: string, id: string) {
    return sourcesRepository.setStatus(organizationId, id, "processando");
  },

  async markReady(organizationId: string, id: string, chunkCount: number) {
    await sourcesRepository.setChunkCount(organizationId, id, chunkCount);
    return sourcesRepository.setStatus(organizationId, id, "pronta");
  },

  markError(organizationId: string, id: string, message: string) {
    return sourcesRepository.setStatus(organizationId, id, "erro", message);
  },
};
