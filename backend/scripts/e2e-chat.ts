/**
 * Teste ponta a ponta do ciclo de conhecimento, contra o backend real — sem
 * mock em lugar nenhum. Exercita, em ordem, o que um cliente faria:
 *
 *   1. pergunta algo que a base nao sabe        -> deve RECUSAR e criar lacuna
 *   2. cadastra a fonte que responde a pergunta -> deve indexar (worker)
 *   3. repete a pergunta                        -> deve RESPONDER a partir da base
 *   4. responde a lacuna pelo painel            -> vira fonte nova, lacuna resolvida
 *   5. pergunta o conteudo dessa resposta       -> deve RESPONDER
 *   6. pergunta fora do escopo                  -> deve RECUSAR (nao alucina)
 *
 * Usa apenas a API HTTP publica (mesmas rotas do painel), entao passa pelas
 * mesmas regras de autorizacao e de negocio.
 *
 * Pre-requisitos: backend (`npm run dev`) E worker (`npm run worker`) rodando,
 * e o tenant com chave OpenAI valida configurada — sem ela as fontes ficam em
 * `aguardando_ativacao` e o passo 2 falha com uma mensagem explicando isso.
 *
 * Uso:
 *   npx tsx scripts/e2e-chat.ts --email admin@demo-widget.com --password demo12345
 *   [--api http://localhost:3333] [--assistant "Assistente Widget Demo"]
 *   [--widget-key pk_test_...]   # tambem testa o widget publico (chat externo)
 *   [--origin http://localhost:4174]
 */
const args = new Map<string, string>();
for (let i = 2; i < process.argv.length; i++) {
  if (!process.argv[i].startsWith("--")) continue;
  const next = process.argv[i + 1];
  args.set(process.argv[i].slice(2), next && !next.startsWith("--") ? (i++, next) : "true");
}

const apiBase = args.get("api") ?? "http://localhost:3333";
const email = args.get("email");
const password = args.get("password");
const assistantName = args.get("assistant");
const widgetKey = args.get("widget-key");
const origin = args.get("origin") ?? "http://localhost:4174";

if (!email || !password) {
  console.error("Uso: tsx scripts/e2e-chat.ts --email <admin do tenant> --password <senha> [--widget-key pk_...]");
  process.exit(1);
}

// Marcador unico por execucao: evita que a rodada anterior (fonte ja indexada,
// lacuna ja resolvida) faca o passo 1 passar por engano.
const run = Date.now().toString().slice(-6);
// O identificador do run entra no NOME da entidade, nao solto na frase: uma
// pergunta como "unidade Norte 123456" faz o modelo entender que se trata de
// outra unidade e recusar, mesmo com o dado na base — falso negativo do teste,
// nao do produto.
const UNIT = `unidade R${run}`;
const PRODUCT = `produto P${run}`;
const SECRET_FACT = `O codigo interno de rastreio da ${UNIT} e ZK-${run}.`;
const QUESTION = `qual o codigo interno de rastreio da ${UNIT}?`;
const GAP_QUESTION = `qual o prazo de garantia estendida do ${PRODUCT}?`;
const GAP_ANSWER = `O prazo de garantia estendida do ${PRODUCT} e de 730 dias corridos apos a compra.`;
const OFF_TOPIC = "qual e a capital da Franca?";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`  ${ok ? "PASSOU" : "FALHOU"}  ${label}${detail ? ` — ${detail}` : ""}`);
  if (!ok) failures++;
}

let cookie = "";
async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...((init.headers as Record<string, string>) ?? {}) };
  if (init.body) headers["Content-Type"] = "application/json";
  if (cookie) headers.Cookie = cookie;
  const res = await fetch(`${apiBase}${path}`, { ...init, headers });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  const body = res.headers.get("content-type")?.includes("application/json") ? await res.json() : null;
  if (!res.ok) throw new Error(`${init.method ?? "GET"} ${path} -> ${res.status}: ${JSON.stringify(body)}`);
  return body as T;
}

/** Chamada do widget publico: sem cookie, autenticada por chave + origem. */
async function widget<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${apiBase}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Origin: origin },
    body: JSON.stringify(body),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`POST ${path} -> ${res.status}: ${JSON.stringify(data)}`);
  return data as T;
}

interface Answer {
  conversationId: string;
  answer: string;
  usedContext: boolean;
}
interface Source {
  id: string;
  title: string;
  status: string;
  chunk_count: number;
}

async function ask(orgId: string, assistantId: string, message: string): Promise<Answer> {
  return api<Answer>(`/organizations/${orgId}/assistants/${assistantId}/playground-messages`, {
    method: "POST",
    body: JSON.stringify({ message, environment: "teste" }),
  });
}

/** A indexacao e assincrona (fila BullMQ); espera a fonte sair de fila/processando. */
async function waitIndexed(orgId: string, topicId: string, sourceId: string, timeoutMs = 60_000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const sources = await api<Source[]>(`/organizations/${orgId}/topics/${topicId}/sources`);
    const source = sources.find((s) => s.id === sourceId);
    if (source && !["fila", "processando"].includes(source.status)) return source;
    await new Promise((r) => setTimeout(r, 1500));
  }
  throw new Error("timeout esperando a indexacao — o worker (`npm run worker`) esta rodando?");
}

async function main() {
  await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
  const { auth } = await api<{ auth: { memberships: { organizationId: string }[] } }>("/auth/me");
  const orgId = auth.memberships[0]?.organizationId;
  if (!orgId) throw new Error("este usuario nao pertence a nenhuma organizacao");

  const assistants = await api<{ id: string; name: string }[]>(`/organizations/${orgId}/assistants`);
  const assistant = assistantName ? assistants.find((a) => a.name === assistantName) : assistants[0];
  if (!assistant) throw new Error(`assistente nao encontrado (${assistantName ?? "primeiro da lista"})`);

  const topics = await api<{ id: string; name: string }[]>(`/organizations/${orgId}/topics`);
  const topic = topics[0];
  if (!topic) throw new Error("nenhum topico cadastrado — crie um antes de rodar o teste");

  console.log(`Organizacao ${orgId} · assistente "${assistant.name}" · topico "${topic.name}"\n`);

  console.log("1. Pergunta sem base (deve recusar e registrar lacuna)");
  const before = await ask(orgId, assistant.id, QUESTION);
  check("recusou por falta de contexto", before.usedContext === false, before.answer.slice(0, 60));
  const gapsAfterAsk = await api<{ question_normalized: string }[]>(`/organizations/${orgId}/gaps`);
  check(
    "lacuna registrada",
    gapsAfterAsk.some((g) => g.question_normalized.includes(run)),
  );

  console.log("\n2. Cadastra a fonte que responde");
  const source = await api<Source>(`/organizations/${orgId}/sources`, {
    method: "POST",
    body: JSON.stringify({ topicId: topic.id, title: `Rastreio ${UNIT}`, kind: "texto", content: SECRET_FACT }),
  });
  if (source.status === "aguardando_ativacao") {
    throw new Error("fonte ficou em aguardando_ativacao: configure uma chave OpenAI valida no tenant antes de rodar");
  }
  const indexed = await waitIndexed(orgId, topic.id, source.id);
  check("fonte indexada", indexed.status === "pronta", `status=${indexed.status} chunks=${indexed.chunk_count}`);

  console.log("\n3. Mesma pergunta, agora com a base (deve responder)");
  const after = await ask(orgId, assistant.id, QUESTION);
  check("respondeu usando a base", after.usedContext === true);
  check("resposta traz o dado da fonte", after.answer.includes(`ZK-${run}`), after.answer.slice(0, 80));

  console.log("\n4. Responder uma lacuna cria fonte de conhecimento");
  await ask(orgId, assistant.id, GAP_QUESTION); // gera a lacuna
  const gaps = await api<{ id: string; question_normalized: string; status: string }[]>(
    `/organizations/${orgId}/gaps`,
  );
  const gap = gaps.find((g) => g.question_normalized.includes(run) && g.question_normalized.includes("garantia"));
  if (!gap) throw new Error("lacuna da pergunta de garantia nao foi registrada");

  const fromGap = await api<Source>(`/organizations/${orgId}/gaps/${gap.id}/answer`, {
    method: "POST",
    body: JSON.stringify({ topicId: topic.id, content: GAP_ANSWER }),
  });
  const gapIndexed = await waitIndexed(orgId, topic.id, fromGap.id);
  check("resposta da lacuna virou fonte indexada", gapIndexed.status === "pronta");
  const gapsNow = await api<{ id: string; status: string }[]>(`/organizations/${orgId}/gaps`);
  check("lacuna marcada como resolvida", gapsNow.find((g) => g.id === gap.id)?.status === "resolvida");

  console.log("\n5. Pergunta o que foi respondido na lacuna (deve responder)");
  const gapAnswer = await ask(orgId, assistant.id, GAP_QUESTION);
  check("respondeu usando a base", gapAnswer.usedContext === true);
  check("resposta traz o prazo informado", gapAnswer.answer.includes("730"), gapAnswer.answer.slice(0, 80));

  console.log("\n6. Pergunta fora do escopo (deve recusar, sem alucinar)");
  const off = await ask(orgId, assistant.id, OFF_TOPIC);
  check("recusou pergunta fora da base", off.usedContext === false);
  check("nao respondeu 'Paris'", !off.answer.toLowerCase().includes("paris"), off.answer.slice(0, 60));

  if (widgetKey) {
    console.log("\n7. Mesmo fluxo pelo widget publico (chat externo, sem sessao)");
    await widget("/widget/config", { key: widgetKey });
    const conv = await widget<{ conversationId: string }>("/widget/conversations", {
      key: widgetKey,
      externalUserId: `e2e-${run}`,
      visitorName: "Visitante E2E",
      context: { origem: "script e2e", execucao: run },
    });
    const widgetAnswer = await widget<{ answer: string }>(
      `/widget/conversations/${conv.conversationId}/messages`,
      { key: widgetKey, message: QUESTION },
    );
    check("widget respondeu a partir da base", widgetAnswer.answer.includes(`ZK-${run}`), widgetAnswer.answer.slice(0, 80));

    await widget(`/widget/conversations/${conv.conversationId}/feedback`, { key: widgetKey, rating: "positivo" });
    check("widget registrou feedback", true);

    const conversations = await api<{ id: string; channel: string }[]>(`/organizations/${orgId}/conversations`);
    check(
      "conversa do widget aparece no painel",
      conversations.some((c) => c.id === conv.conversationId && c.channel === "widget"),
    );
  } else {
    console.log("\n7. (pulado) passe --widget-key pk_test_... para testar tambem o chat externo");
  }

  console.log(`\n${failures === 0 ? "TUDO PASSOU" : `${failures} VERIFICACAO(OES) FALHARAM`}`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((err) => {
  console.error(`\nERRO: ${err instanceof Error ? err.message : err}`);
  process.exitCode = 1;
});
