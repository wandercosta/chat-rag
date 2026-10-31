import type { Condition } from "./rules.js";

/** O que a regra enxerga da mensagem/conversa na hora de decidir. */
export interface RuleContext {
  channel: string;
  text: string;
  isFirstMessage: boolean;
  contactTagIds: string[];
  now: Date;
  /** Gatilho "etiqueta adicionada": a etiqueta que acabou de entrar. */
  addedTagId?: string;
}

/** Horario comercial e no fuso do Brasil, independente de onde o servidor roda. */
const TIME_ZONE = "America/Sao_Paulo";
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function localClock(now: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return {
    weekday: WEEKDAYS.indexOf(get("weekday")),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
  };
}

const toMinutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
};

/** Fora do expediente: dia que nao e de trabalho ou hora fora do intervalo
 * (intervalo que vira a meia-noite, ex. 22:00-06:00, tambem vale). */
export function isOutsideBusinessHours(
  condition: Extract<Condition, { type: "fora_do_horario" }>,
  now: Date,
) {
  const { weekday, minutes } = localClock(now);
  if (!condition.weekdays.includes(weekday)) return true;
  const start = toMinutes(condition.start);
  const end = toMinutes(condition.end);
  const inside =
    start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end;
  return !inside;
}

/** Todas as condicoes precisam valer; regra sem condicao vale sempre. */
export function matches(conditions: Condition[], ctx: RuleContext): boolean {
  return conditions.every((condition) => {
    switch (condition.type) {
      case "canal":
        return (condition.channels as string[]).includes(ctx.channel);
      case "texto_contem": {
        const text = normalize(ctx.text);
        return condition.keywords.some((k) => text.includes(normalize(k)));
      }
      case "contato_tem_etiqueta":
        return ctx.contactTagIds.includes(condition.tagId);
      case "primeira_mensagem":
        return ctx.isFirstMessage;
      case "fora_do_horario":
        return isOutsideBusinessHours(condition, ctx.now);
      case "sem_resposta_ha":
        // O tempo e conferido pela varredura (engine.ts), nao aqui.
        return true;
      case "etiqueta_adicionada":
        return ctx.addedTagId === condition.tagId;
    }
  });
}
