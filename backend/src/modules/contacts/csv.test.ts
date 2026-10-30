import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv.js";
import { isTruthy, normalizeEmail, normalizeKey, normalizePhone } from "./normalize.js";

describe("parseCsv", () => {
  it("detecta o ponto e virgula do Excel em portugues e ignora o BOM", () => {
    expect(parseCsv("﻿nome;email\r\nMaria;maria@x.com\r\n")).toEqual([
      ["nome", "email"],
      ["Maria", "maria@x.com"],
    ]);
  });

  it("aceita virgula, aspas com separador e quebra de linha dentro", () => {
    const rows = parseCsv('nome,obs\n"Silva, Ana","linha 1\nlinha 2"\n"diz ""oi""",x\n\n');
    expect(rows).toEqual([
      ["nome", "obs"],
      ["Silva, Ana", "linha 1\nlinha 2"],
      ['diz "oi"', "x"],
    ]);
  });
});

describe("toCsv", () => {
  it("neutraliza formula e escapa aspas", () => {
    const csv = toCsv(["nome", "obs"], [["=HYPERLINK(1)", 'disse "oi"; tchau']]);
    expect(csv).toBe('﻿nome;obs\r\n\'=HYPERLINK(1);"disse ""oi""; tchau"\r\n');
  });

  it("volta igual pelo parser", () => {
    const csv = toCsv(["a", "b"], [["x;y", "linha\nquebrada"]]);
    expect(parseCsv(csv)).toEqual([
      ["a", "b"],
      ["x;y", "linha\nquebrada"],
    ]);
  });
});

describe("normalizacao", () => {
  it("telefone brasileiro sem DDI ganha +55", () => {
    expect(normalizePhone("(11) 99999-8888")).toBe("+5511999998888");
    expect(normalizePhone("+1 415 555 0100")).toBe("+14155550100");
    expect(normalizePhone("123")).toBeNull();
  });

  it("e-mail em minuscula e valido", () => {
    expect(normalizeEmail("  Maria@Exemplo.COM ")).toBe("maria@exemplo.com");
    expect(normalizeEmail("sem-arroba")).toBeNull();
  });

  it("chave de coluna sem acento e opt-in em portugues", () => {
    expect(normalizeKey("Data de Nascimento")).toBe("data_de_nascimento");
    expect(normalizeKey("Etiquetas ")).toBe("etiquetas");
    expect(isTruthy("Sim")).toBe(true);
    expect(isTruthy("não")).toBe(false);
  });
});
