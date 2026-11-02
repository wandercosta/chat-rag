import { platformAiAvailable } from "../../config/ai.js";
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

/** Indexa quando o tenant tem chave BYOK ou quando a plataforma oferece IA
 * propria (.env, ADR-005); senao a fonte espera a ativacao. */
async function canIndex(organizationId: string): Promise<boolean> {
  return platformAiAvailable() || (await aiCredentialsService.hasAnyActiveKey(organizationId));
}

async function nextStatusAfterReviewGate(organizationId: string): Promise<SourceStatus> {
  return (await canIndex(organizationId)) ? "fila" : "aguardando_ativacao";
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
    const status: SourceStatus = requiresReview
      ? "aguardando_revisao"
      : await nextStatusAfterReviewGate(organizationId);

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
    input: {
      topicId: string;
      title: string;
      kind: Extract<SourceKind, "PDF" | "DOCX">;
      storageKey: string;
    },
  ) {
    const topic = await topicsRepository.findById(organizationId, input.topicId);
    if (!topic) throw new TopicNotFoundError();

    const requiresReview = await collectionsRepository.requiresReview(topic.collection_id);
    const status: SourceStatus = requiresReview
      ? "aguardando_revisao"
      : await nextStatusAfterReviewGate(organizationId);

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

  /**
   * Revisao fora do fluxo da colecao: marca (ou desmarca) uma fonte como
   * revisada, para os assistentes que so respondem com fontes revisadas.
   */
  async setReviewed(actorUserId: string, organizationId: string, id: string, reviewed: boolean) {
    const source = await sourcesRepository.findById(organizationId, id);
    if (!source || source.status === "aguardando_revisao" || source.status === "arquivada") {
      throw new InvalidTransitionError();
    }
    const updated = await sourcesRepository.setReviewed(
      organizationId,
      id,
      reviewed ? actorUserId : null,
    );
    await auditService.record({
      actorUserId,
      organizationId,
      action: reviewed ? "Marcou fonte como revisada" : "Tirou a revisao da fonte",
      type: "conteudo",
      target: source.title,
    });
    return updated;
  },

  /** Aprovacao manual apos revisao (docs/workflows/rag-e-conhecimento.md). */
  async approve(actorUserId: string, organizationId: string, id: string) {
    const source = await sourcesRepository.findById(organizationId, id);
    if (!source || source.status !== "aguardando_revisao") throw new InvalidTransitionError();

    const nextStatus = await nextStatusAfterReviewGate(organizationId);
    await sourcesRepository.setReviewed(organizationId, id, actorUserId);
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

  /** `aguardando_ativacao` entra aqui de proposito: uma fonte criada antes de
   * existir chave de IA nao teria nenhuma outra saida desse estado (era um
   * beco sem saida — ver `activatePending`, que faz isso em lote). */
  async reindex(actorUserId: string, organizationId: string, id: string) {
    const source = await sourcesRepository.findById(organizationId, id);
    if (!source || !["pronta", "erro", "aguardando_ativacao"].includes(source.status)) {
      throw new InvalidTransitionError();
    }

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

  /**
   * Destrava em lote as fontes que ficaram em `aguardando_ativacao` por nao
   * haver chave de IA quando foram criadas (etapa 3 de
   * docs/backend/especificacao-backend.md). Chamado pelo painel logo apos uma
   * chave ser validada; sem chave valida agora, nao faz nada.
   */
  async activatePending(organizationId: string) {
    if (!(await canIndex(organizationId))) return { activated: 0 };

    const pending = await sourcesRepository.listByStatus(organizationId, "aguardando_ativacao");
    for (const source of pending) {
      await sourcesRepository.setStatus(organizationId, source.id, "fila");
      await enqueueSourceIndexing({ organizationId, sourceId: source.id });
    }
    return { activated: pending.length };
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
