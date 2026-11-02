/**
 * Envio de modelo do WhatsApp pedido por uma automacao. Quem envia e o modulo
 * de canais, que ja depende deste (o inbound roda as automacoes): o worker
 * registra o envio aqui (src/worker.ts), sem ciclo entre modulos.
 */
export interface TemplateSendInput {
  organizationId: string;
  contactId: string;
  connectionId: string;
  templateId: string;
  /** Ja com `{nome}` trocado pelo nome do contato. */
  params: string[];
  /** Quem publicou a regra: o responsavel humano pelo envio (ADR-006 #3). */
  responsibleUserId: string | null;
}

export type TemplateSender = (
  input: TemplateSendInput,
) => Promise<{ status: "enviada" | "falhou" | "tentar_de_novo"; error?: string }>;

let sender: TemplateSender | null = null;

export function setTemplateSender(fn: TemplateSender) {
  sender = fn;
}

/** Falha vira erro no historico da regra (automation_runs). */
export async function sendTemplate(
  input: Omit<TemplateSendInput, "params"> & { params: string[]; contactName?: string | null },
) {
  if (!sender) throw new Error("envio de modelo indisponivel neste processo");
  const { contactName, ...rest } = input;
  const params = input.params.map((p) => p.replaceAll("{nome}", contactName ?? ""));
  const result = await sender({ ...rest, params });
  if (result.status !== "enviada") throw new Error(`modelo nao enviado: ${result.error ?? "erro"}`);
}
