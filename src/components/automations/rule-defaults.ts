import type { Action, Condition } from "@/lib/automations-api";

/** Valores iniciais de uma condicao ou acao nova. */
export function newCondition(type: Condition["type"]): Condition {
  switch (type) {
    case "canal":
      return { type, channels: ["whatsapp"] };
    case "texto_contem":
      return { type, keywords: [] };
    case "contato_tem_etiqueta":
    case "etiqueta_adicionada":
      return { type, tagId: "" };
    case "fora_do_horario":
      return { type, start: "08:00", end: "18:00", weekdays: [1, 2, 3, 4, 5] };
    case "sem_resposta_ha":
      return { type, minutes: 30 };
    default:
      return { type };
  }
}

export function newAction(type: Action["type"]): Action {
  switch (type) {
    case "responder":
    case "nota_interna":
      return { type, text: "" };
    case "adicionar_etiqueta":
      return { type, tagId: "" };
    case "atribuir":
      return { type, userId: "" };
    case "enviar_modelo":
      return { type, connectionId: "", templateId: "", params: [] };
    default:
      return { type };
  }
}
