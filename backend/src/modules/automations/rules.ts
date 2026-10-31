import { z } from "zod";

/**
 * Formato das regras (ADR-006 #4). Validado na entrada da API e lido do
 * jsonb do banco; tudo que a regra pode fazer esta listado aqui.
 */
export const triggerSchema = z.enum(["mensagem_recebida", "sem_resposta", "etiqueta_adicionada"]);
export type Trigger = z.infer<typeof triggerSchema>;

const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "horario no formato HH:MM");

export const conditionSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("canal"),
    channels: z.array(z.enum(["widget", "whatsapp", "telegram", "instagram", "messenger"])).min(1),
  }),
  z.object({
    type: z.literal("texto_contem"),
    keywords: z.array(z.string().trim().min(1).max(60)).min(1).max(30),
  }),
  z.object({ type: z.literal("contato_tem_etiqueta"), tagId: z.string().uuid() }),
  z.object({ type: z.literal("primeira_mensagem") }),
  z.object({
    type: z.literal("fora_do_horario"),
    start: hhmm,
    end: hhmm,
    /** 0 = domingo ... 6 = sabado; dias fora da lista sao "fora do horario". */
    weekdays: z.array(z.number().int().min(0).max(6)).max(7),
  }),
  z.object({ type: z.literal("sem_resposta_ha"), minutes: z.number().int().min(1).max(10_080) }),
  /** Qual etiqueta disparou o gatilho "etiqueta adicionada". */
  z.object({ type: z.literal("etiqueta_adicionada"), tagId: z.string().uuid() }),
]);
export type Condition = z.infer<typeof conditionSchema>;

export const actionSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("responder"), text: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal("adicionar_etiqueta"), tagId: z.string().uuid() }),
  z.object({ type: z.literal("encaminhar_humano") }),
  z.object({ type: z.literal("atribuir"), userId: z.string().uuid() }),
  z.object({ type: z.literal("nota_interna"), text: z.string().trim().min(1).max(2000) }),
  z.object({ type: z.literal("devolver_fila") }),
  /**
   * Modelo aprovado do WhatsApp para o contato (fora da janela de 24 horas).
   * Nos parametros, `{nome}` vira o nome do contato.
   */
  z.object({
    type: z.literal("enviar_modelo"),
    connectionId: z.string().uuid(),
    templateId: z.string().uuid(),
    params: z.array(z.string().trim().min(1).max(200)).max(10),
  }),
]);
export type Action = z.infer<typeof actionSchema>;

/** O que cada gatilho aceita: acao de conversa com humano so no "sem resposta". */
const ALLOWED: Record<Trigger, { conditions: Condition["type"][]; actions: Action["type"][] }> = {
  mensagem_recebida: {
    conditions: [
      "canal",
      "texto_contem",
      "contato_tem_etiqueta",
      "primeira_mensagem",
      "fora_do_horario",
    ],
    actions: ["responder", "adicionar_etiqueta", "encaminhar_humano", "atribuir", "nota_interna"],
  },
  sem_resposta: {
    conditions: ["sem_resposta_ha", "canal", "contato_tem_etiqueta"],
    actions: ["devolver_fila", "atribuir", "nota_interna", "adicionar_etiqueta"],
  },
  // Sem conversa de origem: so acoes sobre o contato.
  etiqueta_adicionada: {
    conditions: ["etiqueta_adicionada", "contato_tem_etiqueta"],
    actions: ["enviar_modelo", "adicionar_etiqueta"],
  },
};

export const ruleInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    trigger: triggerSchema,
    conditions: z.array(conditionSchema).max(10),
    actions: z.array(actionSchema).min(1).max(10),
  })
  .superRefine((rule, ctx) => {
    const allowed = ALLOWED[rule.trigger];
    for (const c of rule.conditions) {
      if (!allowed.conditions.includes(c.type)) {
        ctx.addIssue({
          code: "custom",
          message: `condicao "${c.type}" nao vale para esse gatilho`,
        });
      }
    }
    for (const a of rule.actions) {
      if (!allowed.actions.includes(a.type)) {
        ctx.addIssue({ code: "custom", message: `acao "${a.type}" nao vale para esse gatilho` });
      }
    }
    if (
      rule.trigger === "sem_resposta" &&
      !rule.conditions.some((c) => c.type === "sem_resposta_ha")
    ) {
      ctx.addIssue({ code: "custom", message: "informe depois de quantos minutos sem resposta" });
    }
    if (
      rule.trigger === "etiqueta_adicionada" &&
      !rule.conditions.some((c) => c.type === "etiqueta_adicionada")
    ) {
      ctx.addIssue({ code: "custom", message: "informe qual etiqueta dispara a regra" });
    }
    if (rule.actions.filter((a) => a.type === "enviar_modelo").length > 1) {
      ctx.addIssue({ code: "custom", message: "uma regra envia no maximo um modelo" });
    }
    if (rule.actions.filter((a) => a.type === "responder").length > 1) {
      ctx.addIssue({ code: "custom", message: "uma regra responde no maximo uma vez" });
    }
  });
export type RuleInput = z.infer<typeof ruleInputSchema>;
