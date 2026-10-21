# chatrag-backend

API do ChatRAG (Fastify + TypeScript). Implementa: `identity` (+ sessao de
suporte do Master, justificada e auditada), `organizations` (tenants +
credencial OpenAI/BYOK com envelope encryption + politica de retencao),
`assistants` (+ catalogo de modelos + setores de encaminhamento WhatsApp),
`knowledge` (topicos/fontes/extracao/chunking), `rag` (provedor de IA,
recuperacao vetorial, politica de resposta), `conversations`
(mensagens/feedback/lacunas), `embed` (chaves de widget, dominios, rate
limit, handoff WhatsApp), `audit` (append-only) e `analytics` (usage_events +
resumo agregado por organizacao). Ver `docs/README.md` (Estado atual) para a
lista completa do que falta.

Validado ponta a ponta contra Postgres/Redis/storage S3 reais (nao so
typecheck/lint/testes) — ver "Validado ponta a ponta" em `docs/README.md`.

Para so rodar o produto, use `docker compose up --build` na raiz (ver README
principal). O passo a passo abaixo e para desenvolver a API com hot reload.

## Passo a passo (desenvolvimento)

1. Na raiz do repo, copie `.env.example` para `.env` e suba so a infraestrutura:
   ```bash
   docker compose -f docker-compose.infra.yml up -d
   ```
   O Postgres fica na porta 5433 (nao 5432) para nao colidir com um Postgres
   nativo da maquina.
2. Nesta pasta (`backend/`), copie o `.env.example` para `.env` e ajuste se quiser.
3. Instale as dependencias:
   ```bash
   npm install
   ```
4. Rode as migrations (cria as tabelas no Postgres do Docker):
   ```bash
   npm run migrate:up
   ```
5. Crie o bucket do storage S3 usado por fontes PDF/DOCX (so na primeira vez):
   ```bash
   npm run bucket:create
   ```
6. Crie o primeiro usuario Master (nao existe cadastro publico no produto):
   ```bash
   npx tsx src/bootstrap/create-master.ts admin@chatrag.local "uma-senha-forte"
   ```
7. Suba a API e, em outro terminal, o worker de indexacao/retencao:
   ```bash
   npm run dev
   npm run worker
   ```
8. Crie um tenant, assistente, topico e chave de widget de teste de uma vez com o seed (idempotente — roda de novo sem duplicar organizacao/assistente):
   ```bash
   npm run seed:demo -- --master-email admin@chatrag.local --master-password "uma-senha-forte"
   ```
   Aceita mais parametros para customizar (slug/nome da organizacao, admin,
   nome do assistente, modelo, dominio liberado) — ver o cabecalho de
   `scripts/seed-demo.ts` para a lista completa. Por padrao tambem regrava
   `widget/test/real-backend-test.html` com a chave gerada, entao a pagina de
   teste ja abre mirando o assistente criado/reaproveitado (ver "Testar o
   widget manualmente" abaixo). Para criar um tenant na mao em vez do seed:
   ```bash
   curl -c cookies.txt -X POST http://localhost:3333/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@chatrag.local","password":"uma-senha-forte"}'

   curl -b cookies.txt -X POST http://localhost:3333/master/tenants \
     -H "Content-Type: application/json" \
     -d '{"name":"Acme","slug":"acme","adminEmail":"admin@acme.com","adminPassword":"outra-senha-forte"}'
   ```
9. Configure uma chave OpenAI real do tenant antes de indexar fontes ou usar o playground (sem isso, fontes ficam em `aguardando_ativacao`):
   ```bash
   curl -b cookies-tenant.txt -X POST http://localhost:3333/organizations/<id>/ai-credentials \
     -H "Content-Type: application/json" \
     -d '{"environment":"producao","apiKey":"sk-..."}'
   ```

Rotas implementadas: ver `docs/apis/contratos-planejados.md` ("Rotas implementadas").

## Testar o widget manualmente

```bash
cd ../widget && npm run build && cd ../backend
npm run seed:demo -- --master-email admin@chatrag.local --master-password "uma-senha-forte"
python -m http.server 4174   # a partir da raiz do repo
# abrir http://localhost:4174/widget/test/real-backend-test.html
```

A pagina ja abre com o assistente do seed (chave gravada automaticamente).
Repita so o `seed:demo` (sem rebuildar o widget) para trocar de assistente —
ele reescreve a tag `<script>` inteira a cada execucao.

Para gravar tambem identidade e contexto do visitante na pagina de teste
(ver `docs/integrations/widget-embed.md`):

```bash
npm run seed:demo --   --master-email admin@chatrag.local --master-password "uma-senha-forte"   --slug acme --org-name "Acme" --admin-email admin@acme.com --admin-password "acme12345"   --assistant "Suporte Acme" --model gpt-4o-mini --domain localhost   --external-user-id pedido-4821 --visitor-name "Maria Souza"   --visitor-email maria@exemplo.com --context '{"plano":"Pro","pedido":"4821"}'
```

Atributo omitido = nao escrito no HTML. `widget/test/e2e-widget.html` traz o
roteiro manual completo (abrir, perguntar sem base, cadastrar fonte, responder
lacuna, feedback, handoff, conferir no painel).

## Teste ponta a ponta do chat

Exercita o ciclo real contra o backend de verdade, em nove passos: pergunta sem
base (recusa e cria lacuna) -> cadastra fonte -> responde -> responde a lacuna
(vira fonte, lacuna resolvida) -> pergunta fora do escopo (recusa sem alucinar)
-> saudacao (resposta cordial, sem criar lacuna) -> pergunta de continuidade
(usa o historico; a lacuna guarda pergunta original e contexto) -> e, com
`--widget-key`, o mesmo pelo chat externo. Precisa do worker rodando e do tenant
com chave OpenAI valida:

```bash
npm run e2e:chat -- --email admin@demo-widget.com --password demo12345
```

Passe tambem `--widget-key pk_test_...` (a chave que o `seed:demo` imprime) para
testar o mesmo fluxo pelo chat externo, sem sessao. Sai com codigo 1 se qualquer
verificacao falhar. Cada execucao usa um identificador proprio, entao rodar de
novo nao passa por engano com dado da rodada anterior.

## Diagnostico do RAG

Se o assistente responder "nao encontrei essa informacao" para uma pergunta cuja
resposta esta na base, meca a distancia antes de mexer em qualquer coisa:

```bash
npx tsx scripts/debug-retrieval.ts <organizationId> "a pergunta que falhou" "uma pergunta fora do escopo"
```

Mostra a distancia cosine dos chunks mais proximos e se cada um passa no limiar
atual. Se a pergunta legitima estiver perto do limiar e a irrelevante bem acima,
o limiar precisa subir (ver `docs/backend/especificacao-backend.md` - Politica de
resposta). Antes disso, confira o escopo: um assistente vinculado a colecoes so
enxerga os topicos delas (ADR-003).

## Testes

```bash
npm test                  # unitarios (crypto, autorizacao, chunker, RAG) - nao precisam de infra
npm run test:integration  # API real: auth, upload de PDF, pergunta com citacao, isolamento entre tenants - precisam da infra + banco de teste
```

Os testes usam IA em modo local (`AI_PROVIDER=local`, `EMBEDDING_PROVIDER=hash`,
definidos em `vitest.config.ts`): nao precisam de chave nem de rede. O banco de
teste vem de `TEST_DATABASE_URL` (padrao:
`postgres://chatrag:chatrag@localhost:5433/chatrag_test`):

```bash
export TEST_DATABASE_URL="postgres://chatrag:<POSTGRES_PASSWORD do .env>@localhost:5433/chatrag_test"
```

Os testes de integracao rodam sequencialmente (`fileParallelism: false` no
`vitest.config.ts`): varios arquivos compartilham o mesmo Postgres e cada um
limpa o banco no `beforeEach`, o que em paralelo e uma corrida real entre
arquivos, nao so uma preocupacao teorica.

**Banco isolado para os testes de integracao.** `resetDatabase()` apaga
`organizations`/`users`/etc. de verdade a cada `beforeEach` — ja rodou uma vez
contra o Postgres de dev e apagou um tenant de demo inteiro. Por isso
`vitest.config.ts` aponta `DATABASE_URL` para um banco `chatrag_test`
separado (mesmo Postgres do docker compose, banco diferente), e
`resetDatabase()` se recusa a rodar se o nome do banco nao contiver "test".
Crie o banco de teste uma unica vez, com o Postgres do
`docker-compose.infra.yml` ja de pe (comandos na raiz do repo e em `backend/`):

```bash
docker compose -f docker-compose.infra.yml exec db psql -U chatrag -d postgres -c "CREATE DATABASE chatrag_test OWNER chatrag;"
DATABASE_URL="$TEST_DATABASE_URL" npx node-pg-migrate up --tsx --migrations-dir migrations -d DATABASE_URL
```

Repita a segunda linha (so o `migrate up`) sempre que adicionar uma migracao nova.

## Estrutura

Cada modulo em `src/modules/<nome>/` so expoe sua `index.ts`; nenhum modulo
importa arquivo interno de outro (checado por `npm run deps:check`, ver
`.dependency-cruiser.cjs` e ADR-002). `src/app.ts` monta a aplicacao Fastify
completa (usado tanto por `src/server.ts`, que so abre a porta, quanto pelo
teste de integracao HTTP em `src/app.integration.test.ts`); `src/worker.ts` e
um processo separado (consome as filas de indexacao/retencao) e, como
`app.ts`, pode importar a interface publica de varios modulos sem violar essa
regra — nenhum dos dois esta dentro de `src/modules/`.

## O que falta antes de producao

- KMS real em vez da KEK derivada de `APP_MASTER_KEY` (a interface ja e trocavel, ver `ai-credentials.envelope.ts`).
- Particionamento fisico de `source_chunks`: ver ADR-002, gatilho documentado mas nao implementado.
- Retencao hoje so exclui (nao anonimiza) conversas vencidas.
- Resumo de uso (`analytics`) ainda nao inclui custo estimado por modelo nem conversas/mensagens/fontes-com-erro.
- Mais testes de isolamento e de contrato conforme o painel Lovable for ligado a esta API (ver `docs/testing/estrategia.md`).
