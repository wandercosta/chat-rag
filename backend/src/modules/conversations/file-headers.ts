/** Nome seguro no cabecalho: sem aspas, barras nem caracteres de controle. */
export function headerFileName(name: string) {
  return name.replace(/[^\w.\- ]+/g, "_").slice(0, 120) || "arquivo";
}
