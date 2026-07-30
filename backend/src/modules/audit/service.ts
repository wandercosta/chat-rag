import { db } from "../../db/client.js";
import { auditRepository, type AuditEventInput } from "./repository.js";

export const auditService = {
  /** Recebe opcionalmente uma transacao (trxDb) para gravar o evento atomicamente
   * junto da acao que o originou (ex.: criacao de tenant). */
  record(input: AuditEventInput, trxDb: typeof db = db) {
    return auditRepository.insert(trxDb, input);
  },

  listForOrganization(organizationId: string) {
    return auditRepository.listForOrganization(organizationId);
  },
};
