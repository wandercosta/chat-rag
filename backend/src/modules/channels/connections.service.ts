import crypto from "node:crypto";
import { assistantsService } from "../assistants/index.js";
import { auditService } from "../audit/index.js";
import {
  decryptSecret,
  deserializeEnvelope,
  encryptSecret,
  maskSecret,
  serializeEnvelope,
} from "../../crypto/envelope.js";
import { connectionsRepository, templatesRepository } from "./connections.repository.js";
import { WhatsAppApiError, whatsappClient } from "./whatsapp.client.js";

export class AssistantNotFoundError extends Error {}
export class ConnectionNotFoundError extends Error {}
export class DuplicateConnectionError extends Error {}
/** A Meta recusou o numero/token informado: a mensagem dela vai para o painel. */
export class ConnectionCheckError extends Error {}

export interface WhatsAppSecrets {
  accessToken: string;
  appSecret: string;
}

export interface NewWhatsAppConnection {
  name: string;
  assistantId: string;
  phoneNumberId: string;
  wabaId: string;
  accessToken: string;
  appSecret: string;
}

type ConnectionRow = NonNullable<Awaited<ReturnType<typeof connectionsRepository.findById>>>;

/** Segredos so existem decifrados dentro do processo, na hora do uso. */
export function secretsOf(connection: Pick<ConnectionRow, "secret">): WhatsAppSecrets {
  return JSON.parse(decryptSecret(deserializeEnvelope(connection.secret)));
}

/** Corpo do modelo e quantas variaveis ({{1}}, {{2}}...) ele pede. */
function templateBody(components: { type: string; text?: string }[] = []) {
  const body = components.find((c) => c.type === "BODY")?.text ?? "";
  const numbers = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]));
  return { body, variables: numbers.length ? Math.max(...numbers) : 0 };
}

export const connectionsService = {
  list(organizationId: string) {
    return connectionsRepository.list(organizationId);
  },

  /**
   * Conecta um numero do WhatsApp Business do proprio tenant (ADR-006 #7). Antes
   * de salvar, confere na Meta que o token enxerga aquele numero; o token e o
   * segredo do app ficam cifrados e so o final do token aparece no painel.
   */
  async createWhatsApp(actorUserId: string, organizationId: string, input: NewWhatsAppConnection) {
    if (!(await assistantsService.get(organizationId, input.assistantId))) {
      throw new AssistantNotFoundError();
    }
    if (await connectionsRepository.existsExternal("whatsapp", input.phoneNumberId)) {
      throw new DuplicateConnectionError();
    }

    let info;
    try {
      info = await whatsappClient.phoneNumberInfo(input.phoneNumberId, input.accessToken);
    } catch (err) {
      const reason = err instanceof WhatsAppApiError ? err.message : "erro desconhecido";
      throw new ConnectionCheckError(reason);
    }

    const secrets: WhatsAppSecrets = { accessToken: input.accessToken, appSecret: input.appSecret };
    const connection = await connectionsRepository.insert({
      organizationId,
      assistantId: input.assistantId,
      provider: "whatsapp",
      name: input.name,
      externalId: input.phoneNumberId,
      config: {
        wabaId: input.wabaId,
        displayPhone: info.display_phone_number ?? "",
        verifiedName: info.verified_name ?? "",
      },
      secret: serializeEnvelope(encryptSecret(JSON.stringify(secrets))),
      secretHint: maskSecret(input.accessToken),
      verifyToken: crypto.randomBytes(18).toString("hex"),
    });

    await auditService.record({
      actorUserId,
      organizationId,
      action: "Conectou canal WhatsApp",
      type: "seguranca",
      target: `${input.name} · ${info.display_phone_number ?? input.phoneNumberId}`,
    });
    return connection;
  },

  /** Testa de novo o token na Meta e atualiza o estado da conexao. */
  async check(organizationId: string, id: string) {
    const connection = await connectionsRepository.findById(organizationId, id);
    if (!connection) throw new ConnectionNotFoundError();
    try {
      await whatsappClient.phoneNumberInfo(
        connection.external_id,
        secretsOf(connection).accessToken,
      );
      await connectionsRepository.setStatus(id, "ativo", null);
      return { status: "ativo" as const, detail: null };
    } catch (err) {
      const detail = err instanceof WhatsAppApiError ? err.message : "erro desconhecido";
      await connectionsRepository.setStatus(id, "erro", detail);
      return { status: "erro" as const, detail };
    }
  },

  async remove(actorUserId: string, organizationId: string, id: string) {
    const connection = await connectionsRepository.findById(organizationId, id);
    if (!connection) throw new ConnectionNotFoundError();
    await connectionsRepository.remove(organizationId, id);
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Desconectou canal",
      type: "seguranca",
      target: `${connection.provider} · ${connection.name}`,
    });
  },

  listTemplates(organizationId: string, connectionId: string) {
    return templatesRepository.list(organizationId, connectionId);
  },

  /** Puxa da Meta os modelos da conta (WABA) e guarda o corpo de cada um. */
  async syncTemplates(actorUserId: string, organizationId: string, id: string) {
    const connection = await connectionsRepository.findById(organizationId, id);
    if (!connection) throw new ConnectionNotFoundError();
    let templates;
    try {
      templates = await whatsappClient.listTemplates(
        connection.config.wabaId ?? "",
        secretsOf(connection).accessToken,
      );
    } catch (err) {
      throw new ConnectionCheckError(err instanceof Error ? err.message : "erro desconhecido");
    }
    await templatesRepository.replaceAll(
      organizationId,
      id,
      templates.map((t) => ({
        name: t.name,
        language: t.language,
        category: t.category ?? null,
        status: t.status,
        ...templateBody(t.components),
      })),
    );
    await auditService.record({
      actorUserId,
      organizationId,
      action: `Sincronizou ${templates.length} modelo(s) do WhatsApp`,
      type: "configuracao",
      target: connection.name,
    });
    return templatesRepository.list(organizationId, id);
  },
};
