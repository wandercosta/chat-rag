import { describe, expect, it } from "vitest";
import { isOutsideBusinessHours, matches, type RuleContext } from "./conditions.js";
import { ruleInputSchema } from "./rules.js";

const ctx = (overrides: Partial<RuleContext> = {}): RuleContext => ({
  channel: "whatsapp",
  text: "Qual o PREÇO do plano?",
  isFirstMessage: true,
  contactTagIds: ["tag-vip"],
  // Quarta-feira, 30/10/2024 15:00 em Sao Paulo (18:00 UTC).
  now: new Date("2024-10-30T18:00:00Z"),
  ...overrides,
});

describe("condicoes", () => {
  it("palavra-chave sem acento e sem diferenca de maiuscula", () => {
    expect(matches([{ type: "texto_contem", keywords: ["preco"] }], ctx())).toBe(true);
    expect(matches([{ type: "texto_contem", keywords: ["boleto"] }], ctx())).toBe(false);
  });

  it("todas as condicoes precisam valer", () => {
    const conditions = [
      { type: "canal" as const, channels: ["whatsapp" as const] },
      { type: "contato_tem_etiqueta" as const, tagId: "tag-vip" },
      { type: "primeira_mensagem" as const },
    ];
    expect(matches(conditions, ctx())).toBe(true);
    expect(matches(conditions, ctx({ channel: "widget" }))).toBe(false);
    expect(matches(conditions, ctx({ isFirstMessage: false }))).toBe(false);
    expect(matches([], ctx())).toBe(true);
  });

  it("horario comercial no fuso de Sao Paulo, inclusive virando a meia-noite", () => {
    const weekdays = [1, 2, 3, 4, 5];
    const base = { type: "fora_do_horario" as const, weekdays };
    expect(isOutsideBusinessHours({ ...base, start: "08:00", end: "18:00" }, ctx().now)).toBe(
      false,
    );
    expect(isOutsideBusinessHours({ ...base, start: "08:00", end: "15:00" }, ctx().now)).toBe(true);
    // Sabado conta como fora.
    expect(
      isOutsideBusinessHours(
        { ...base, start: "08:00", end: "18:00" },
        new Date("2024-11-02T15:00:00Z"),
      ),
    ).toBe(true);
    // Plantao noturno 22:00-06:00: 15:00 esta fora.
    expect(isOutsideBusinessHours({ ...base, start: "22:00", end: "06:00" }, ctx().now)).toBe(true);
  });
});

describe("validacao da regra", () => {
  it("recusa acao que nao vale para o gatilho e exige o tempo do sem resposta", () => {
    const wrongAction = ruleInputSchema.safeParse({
      name: "x",
      trigger: "mensagem_recebida",
      conditions: [],
      actions: [{ type: "devolver_fila" }],
    });
    expect(wrongAction.success).toBe(false);
    const noMinutes = ruleInputSchema.safeParse({
      name: "x",
      trigger: "sem_resposta",
      conditions: [],
      actions: [{ type: "devolver_fila" }],
    });
    expect(noMinutes.success).toBe(false);
    const ok = ruleInputSchema.safeParse({
      name: "x",
      trigger: "sem_resposta",
      conditions: [{ type: "sem_resposta_ha", minutes: 30 }],
      actions: [{ type: "devolver_fila" }, { type: "nota_interna", text: "voltou" }],
    });
    expect(ok.success).toBe(true);
  });
});
