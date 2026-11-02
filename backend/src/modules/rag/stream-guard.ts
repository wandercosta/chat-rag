import { NO_ANSWER_SENTINEL } from "./answer.text.js";

/**
 * Filtro dos pedacos da resposta em streaming. O modelo responde a marca
 * NO_ANSWER_SENTINEL quando a base nao tem a resposta; ela nunca pode aparecer
 * para o visitante. Enquanto o comeco do texto ainda pode ser a marca, nada
 * sai; quando fica claro que nao e, o que estava retido sai junto e o resto
 * passa direto. A resposta final (evento "done") continua sendo a que vale:
 * se a marca vier no meio, quem recebe troca o texto pela resposta final.
 */
export function createStreamGuard(emit: (text: string) => void) {
  let held = "";
  let open = false;
  return (delta: string) => {
    if (open) {
      emit(delta);
      return;
    }
    held += delta;
    const start = held.trimStart();
    if (start.length === 0) return;
    const couldBeSentinel =
      start.length < NO_ANSWER_SENTINEL.length
        ? NO_ANSWER_SENTINEL.startsWith(start)
        : start.startsWith(NO_ANSWER_SENTINEL);
    if (couldBeSentinel) return;
    open = true;
    emit(held);
  };
}
