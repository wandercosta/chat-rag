/** Recurso do funil que nao existe nesta organizacao (404). */
export class DealsNotFoundError extends Error {}

/** Referencia invalida numa escrita: contato, etapa ou responsavel de fora (422). */
export class DealsInvalidReferenceError extends Error {}

/** Regra do funil impede a acao: etapa com negocios, ultimo funil etc. (409). */
export class DealsConflictError extends Error {}
