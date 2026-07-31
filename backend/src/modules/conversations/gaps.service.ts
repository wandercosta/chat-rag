import { sourcesService } from "../knowledge/index.js";
import { gapsRepository } from "./gaps.repository.js";

export class GapNotFoundError extends Error {}

function normalizeQuestion(question: string): string {
  return question.trim().toLowerCase().replace(/\s+/g, " ");
}

export const gapsService = {
  list(organizationId: string) {
    return gapsRepository.listForOrganization(organizationId);
  },

  /**
   * Chamado pelo modulo rag quando a relevancia recuperada fica abaixo do
   * limiar configurado (docs/workflows/rag-e-conhecimento.md - Lacunas).
   *
   * `groupingQuestion` e a chave de agrupamento — numa pergunta de
   * continuidade ela carrega a anterior junto, senao "e o CPF?" de conversas
   * sem relacao nenhuma cairia tudo na mesma lacuna. `originalQuestion` e
   * `contextSnippet` existem para a tela: quem responde precisa ver o que a
   * pessoa realmente digitou e sobre o que se falava.
   */
  recordOccurrence(
    organizationId: string,
    assistantId: string,
    groupingQuestion: string,
    details: { originalQuestion?: string; contextSnippet?: string | null } = {},
  ) {
    return gapsRepository.upsertOccurrence(
      organizationId,
      assistantId,
      normalizeQuestion(groupingQuestion),
      details,
    );
  },

  resolve(organizationId: string, id: string) {
    return gapsRepository.resolve(organizationId, id);
  },

  /**
   * Responder uma lacuna cria uma fonte de texto de verdade (mesmo pipeline
   * de extracao/chunking/indexacao de qualquer outra fonte, ver
   * knowledge/sources.service.ts) e marca a lacuna como resolvida. A pergunta
   * original vira o titulo da fonte, para rastrear de onde ela veio.
   */
  async answer(
    actorUserId: string,
    organizationId: string,
    gapId: string,
    input: { topicId: string; content: string },
  ) {
    const gap = await gapsRepository.findById(organizationId, gapId);
    if (!gap) throw new GapNotFoundError();

    const source = await sourcesService.createTextOrUrl(actorUserId, organizationId, {
      topicId: input.topicId,
      title: gap.question_normalized,
      kind: "texto",
      content: input.content,
    });

    await gapsRepository.resolve(organizationId, gapId);

    return source;
  },
};
