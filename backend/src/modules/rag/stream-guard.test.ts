import { describe, expect, it } from "vitest";
import { NO_ANSWER_SENTINEL } from "./answer.text.js";
import { createStreamGuard } from "./stream-guard.js";

function run(pieces: string[]) {
  const out: string[] = [];
  const push = createStreamGuard((t) => out.push(t));
  pieces.forEach(push);
  return out.join("");
}

describe("filtro do streaming", () => {
  it("deixa passar resposta normal, inclusive o que ficou retido no comeco", () => {
    expect(run(["O pra", "zo e de ", "3 dias."])).toBe("O prazo e de 3 dias.");
    expect(run(["_", "_Oi", " tudo bem"])).toBe("__Oi tudo bem");
  });

  it("nunca mostra a marca de sem resposta, mesmo em pedacos", () => {
    const half = Math.floor(NO_ANSWER_SENTINEL.length / 2);
    expect(run([NO_ANSWER_SENTINEL.slice(0, half), NO_ANSWER_SENTINEL.slice(half)])).toBe("");
    expect(run(["  ", NO_ANSWER_SENTINEL, " mais texto"])).toBe("");
  });
});
