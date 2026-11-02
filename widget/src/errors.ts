import { ChatRagApiError } from "./api.js";

/** Texto para o visitante, nunca diagnostico interno. */
export function describeError(err: unknown): string {
  if (err instanceof ChatRagApiError) {
    if (err.status === 429) return "Muitas mensagens em pouco tempo. Tente novamente em instantes.";
    if (err.status === 409) return "Este assistente esta temporariamente indisponivel.";
    if (err.status === 401 || err.status === 403)
      return "Este atendimento nao esta disponivel neste site.";
  }
  return "Nao foi possivel enviar sua mensagem agora. Tente novamente.";
}

/** O 409 aqui significa "sem WhatsApp configurado", nao "assistente fora do
 * ar" como em /messages. Reusar describeError diria ao visitante que o
 * atendimento quebrou, quando o chat esta funcionando normalmente. */
export function describeHandoffError(err: unknown): string {
  if (err instanceof ChatRagApiError) {
    if (err.status === 409)
      return "O encaminhamento para atendente nao esta disponivel neste atendimento.";
    if (err.status === 422) return "Nao consegui identificar o setor escolhido. Tente novamente.";
  }
  return describeError(err);
}
