import { auditService } from "../audit/index.js";
import { cannedResponsesRepository } from "./canned-responses.repository.js";

export class DuplicateTitleError extends Error {}

export const cannedResponsesService = {
  list(organizationId: string) {
    return cannedResponsesRepository.list(organizationId);
  },

  async create(actorUserId: string, organizationId: string, title: string, content: string) {
    if (await cannedResponsesRepository.findByTitle(organizationId, title)) {
      throw new DuplicateTitleError();
    }
    const created = await cannedResponsesRepository.insert(organizationId, title, content);
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Criou resposta pronta",
      type: "configuracao",
      target: title,
    });
    return created;
  },

  async remove(actorUserId: string, organizationId: string, id: string): Promise<boolean> {
    const removed = await cannedResponsesRepository.remove(organizationId, id);
    if (removed) {
      await auditService.record({
        actorUserId,
        organizationId,
        action: "Removeu resposta pronta",
        type: "configuracao",
        target: id,
      });
    }
    return removed;
  },
};
