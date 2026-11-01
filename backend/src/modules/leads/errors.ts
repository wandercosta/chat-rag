/** Classificacao indisponivel agora: desligada, sem conversa, sem modelo ou limite (409). */
export class LeadsUnavailableError extends Error {}

/** Contato ou classificacao que nao existe nesta organizacao (404). */
export class LeadInsightNotFoundError extends Error {}

/** O modelo respondeu fora do esquema: nada e gravado (502). */
export class LeadModelError extends Error {}

/** Sugestao ja aceita ou descartada (409). */
export class LeadAlreadyReviewedError extends Error {}
