import { db } from "../../db/client.js";
import type { CredentialEnvironment } from "../../db/types.js";
import { auditService } from "../audit/index.js";
import { aiCredentialsRepository } from "./ai-credentials.repository.js";
import { decryptSecret, encryptSecret, maskSecret } from "./ai-credentials.envelope.js";
import { validateOpenAiKey } from "./ai-credentials.provider-check.js";

export interface CredentialStatusView {
  environment: CredentialEnvironment;
  status: "ausente" | "valida" | "invalida" | "substituida" | "removida";
  masked: string | null;
  updatedAt: string | null;
}

export const aiCredentialsService = {
  /** Visao segura por organizacao: nunca inclui o segredo, so estado e sufixo mascarado. */
  async getStatus(organizationId: string): Promise<CredentialStatusView[]> {
    const rows = await aiCredentialsRepository.findByOrganization(organizationId);
    const byEnv = new Map(rows.map((r) => [r.environment, r]));

    return (["teste", "producao", "ambos"] as const).map((environment) => {
      const row = byEnv.get(environment);
      return {
        environment,
        status: row?.status ?? "ausente",
        masked: row?.masked ?? null,
        updatedAt: row?.updated_at ? row.updated_at.toISOString() : null,
      };
    });
  },

  /**
   * Configura (ou substitui) a credencial. Testa a chave antes de marcar como
   * valida; se a validacao falhar, ainda assim persiste (criptografada) mas
   * com status 'invalida', para o tenant ver o erro sem reenviar a chave.
   */
  async configure(
    actorUserId: string,
    organizationId: string,
    environment: CredentialEnvironment,
    apiKey: string,
  ) {
    const isValid = await validateOpenAiKey(apiKey);
    const envelope = encryptSecret(apiKey);
    const masked = maskSecret(apiKey);

    const record = await db.transaction().execute(async (trx) => {
      const row = await aiCredentialsRepository.replaceForEnvironment(trx, {
        organizationId,
        environment,
        status: isValid ? "valida" : "invalida",
        masked,
        envelope,
      });

      await auditService.record(
        {
          actorUserId,
          organizationId,
          action: "Atualizou chave OpenAI",
          type: "configuracao",
          target: `ambiente: ${environment} · estado: ${isValid ? "valida" : "invalida"}`,
        },
        trx,
      );

      return row;
    });

    return { environment: record.environment, status: record.status, masked: record.masked };
  },

  async remove(actorUserId: string, organizationId: string, environment: CredentialEnvironment) {
    await aiCredentialsRepository.markRemoved(organizationId, environment);
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Removeu chave OpenAI",
      type: "seguranca",
      target: `ambiente: ${environment}`,
    });
  },

  /** Checagem barata (sem decriptar) usada por outros modulos, ex.: knowledge
   * decide se uma fonte pode sair de 'aguardando_ativacao'. */
  async hasActiveKey(organizationId: string, environment: "teste" | "producao"): Promise<boolean> {
    const row = await aiCredentialsRepository.findEffective(organizationId, environment);
    return Boolean(row && row.status === "valida");
  },

  /** Usado onde so importa "ha alguma chave utilizavel" (ex.: liberar indexacao),
   * sem se prender a qual ambiente especifico sera usado na chamada real. */
  async hasAnyActiveKey(organizationId: string): Promise<boolean> {
    const [producao, teste] = await Promise.all([
      this.hasActiveKey(organizationId, "producao"),
      this.hasActiveKey(organizationId, "teste"),
    ]);
    return producao || teste;
  },

  /** So para uso interno (ex.: modulo rag ao montar a chamada de chat/embeddings).
   * Nunca exposto via rota HTTP. */
  async resolveActiveKey(
    organizationId: string,
    environment: "teste" | "producao",
  ): Promise<string | null> {
    const row = await aiCredentialsRepository.findEffective(organizationId, environment);
    if (!row || row.status !== "valida") return null;

    return decryptSecret({
      ciphertext: row.ciphertext,
      iv: row.iv,
      authTag: row.auth_tag,
      wrappedDek: row.wrapped_dek,
      dekIv: row.dek_iv,
      dekAuthTag: row.dek_auth_tag,
      kekVersion: row.kek_version,
    });
  },
};
