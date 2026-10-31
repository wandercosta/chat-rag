import type { TemplateSender } from "../automations/index.js";
import { sendToContact } from "./outbound.service.js";

/**
 * Envio de modelo pedido por automacao ("etiqueta adicionada"). O worker
 * registra esta funcao no modulo de automacoes. Mesmo caminho da campanha:
 * vira mensagem de atendente com quem publicou a regra como responsavel.
 */
export const automationTemplateSender: TemplateSender = (input) =>
  sendToContact({
    organizationId: input.organizationId,
    connectionId: input.connectionId,
    contactId: input.contactId,
    actorUserId: input.responsibleUserId,
    content: { kind: "template", templateId: input.templateId, params: input.params },
  });
