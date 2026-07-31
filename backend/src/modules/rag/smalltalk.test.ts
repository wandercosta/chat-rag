import { describe, expect, it } from "vitest";
import { detectSmalltalk } from "./smalltalk.js";

describe("detectSmalltalk", () => {
  it("reconhece saudacoes, agradecimentos e despedidas", () => {
    for (const message of ["oi", "Oi!", "Olá", "ola", "bom dia", "Boa tarde", "opa", "tudo bem?"]) {
      expect(detectSmalltalk(message), message).toBe("saudacao");
    }
    for (const message of ["obrigado", "Obrigada!", "valeu", "vlw"]) {
      expect(detectSmalltalk(message), message).toBe("agradecimento");
    }
    for (const message of ["tchau", "ate logo", "falou"]) {
      expect(detectSmalltalk(message), message).toBe("despedida");
    }
  });

  it("aceita combinacoes curtas de cortesia", () => {
    expect(detectSmalltalk("oi bom dia")).toBe("saudacao");
    expect(detectSmalltalk("ola tudo bem")).toBe("saudacao");
  });

  /** O risco real: engolir uma pergunta de verdade e nunca consultar a base. */
  it("nao trata pergunta como cortesia, mesmo comecando com saudacao", () => {
    for (const message of [
      "oi, qual o horario de atendimento?",
      "bom dia, voces entregam em Manaus?",
      "obrigado, mas qual o prazo de garantia?",
      "qual o CNPJ?",
      "preciso trocar um produto",
    ]) {
      expect(detectSmalltalk(message), message).toBeNull();
    }
  });

  it("ignora mensagem vazia e texto longo", () => {
    expect(detectSmalltalk("")).toBeNull();
    expect(detectSmalltalk("   ")).toBeNull();
    expect(detectSmalltalk("oi ".repeat(30))).toBeNull();
  });
});
