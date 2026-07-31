/**
 * Saudacoes e cortesias nao sao perguntas de conhecimento. Sem isto, um "oi"
 * recebia "nao encontrei essa informacao na base de conhecimento configurada"
 * — como se o produto estivesse quebrado — e ainda entrava na lista de lacunas
 * do tenant, que deveria mostrar o que falta na base, nao cumprimento.
 *
 * Deliberadamente conservador: so trata a mensagem como cortesia quando ela e
 * *inteiramente* cortesia. "oi, qual o horario?" continua sendo pergunta e
 * segue o fluxo normal de recuperacao. Na duvida, tratar como pergunta e o
 * comportamento seguro — no maximo gera uma lacuna a mais, nunca deixa de
 * responder algo que a base sabia.
 */

export type SmalltalkKind = "saudacao" | "agradecimento" | "despedida";

const GREETING = /^(oi+|ola+|opa|eae?|e ai|hey|hi|hello|bom dia|boa tarde|boa noite|tudo bem|tudo bom|como vai)$/;
const THANKS = /^(obrigad[oa]|valeu|vlw|agradecid[oa]|muito obrigad[oa]|thanks|obg)$/;
const FAREWELL = /^(tchau|ate mais|ate logo|adeus|falou|ate breve|bye)$/;

/** Texto lido pelo visitante — acentuado, ao contrario dos comentarios. */
const REPLIES: Record<SmalltalkKind, string> = {
  saudacao: "Olá! Como posso ajudar?",
  agradecimento: "Por nada! Se precisar de mais alguma coisa, é só perguntar.",
  despedida: "Até logo! Qualquer dúvida, estou por aqui.",
};

/** Remove acentos e pontuacao para "Olá!" e "ola" caírem na mesma regra. */
function normalize(message: string): string {
  return message
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[!?.,;:]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectSmalltalk(message: string): SmalltalkKind | null {
  const text = normalize(message);
  // Mensagem longa quase sempre carrega uma pergunta junto; nao arriscar.
  if (!text || text.length > 40) return null;

  if (GREETING.test(text)) return "saudacao";
  if (THANKS.test(text)) return "agradecimento";
  if (FAREWELL.test(text)) return "despedida";

  // Combinacoes curtas do tipo "oi bom dia" / "ola tudo bem": toda palavra
  // (ou par de palavras) precisa ser cortesia para a mensagem contar como tal.
  const parts = text.split(" ");
  if (parts.length <= 4) {
    let i = 0;
    while (i < parts.length) {
      if (GREETING.test(parts[i])) { i += 1; continue; }
      if (i + 1 < parts.length && GREETING.test(`${parts[i]} ${parts[i + 1]}`)) { i += 2; continue; }
      return null;
    }
    return "saudacao";
  }

  return null;
}

export function smalltalkReply(kind: SmalltalkKind): string {
  return REPLIES[kind];
}
