/**
 * CSV de contatos (importacao e exportacao). Sem dependencia: o formato e
 * pequeno e as armadilhas conhecidas estao cobertas aqui — aspas com virgula
 * ou quebra de linha dentro, BOM do Excel e o ";" que o Excel em portugues
 * usa como separador.
 */

/** O separador e o que mais aparece na primeira linha (cabecalho). */
function detectDelimiter(text: string): string {
  const header = text.slice(0, text.search(/\r?\n/) === -1 ? undefined : text.search(/\r?\n/));
  const semicolons = header.split(";").length;
  const commas = header.split(",").length;
  return semicolons > commas ? ";" : ",";
}

export function parseCsv(input: string): string[][] {
  const text = input.replace(/^﻿/, "");
  const delimiter = detectDelimiter(text);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (char === '"') {
        quoted = false;
      } else {
        cell += char;
      }
    } else if (char === '"' && cell === "") {
      quoted = true;
    } else if (char === delimiter) {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  // Linhas totalmente vazias (comum no fim do arquivo) nao sao contatos.
  return rows.filter((r) => r.some((c) => c.trim() !== ""));
}

/**
 * Celula que comeca com =, +, - ou @ vira formula ao abrir no Excel
 * ("injecao de CSV"). O apostrofo na frente faz o Excel tratar como texto.
 */
function safeCell(value: string): string {
  const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[";\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** ";" e BOM: o Excel em portugues abre com acento e colunas certas. */
export function toCsv(header: string[], rows: string[][]): string {
  const lines = [header, ...rows].map((r) => r.map(safeCell).join(";"));
  return `﻿${lines.join("\r\n")}\r\n`;
}
