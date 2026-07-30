# chatrag-backend

API do ChatRAG (Fastify + TypeScript). Implementa: `identity` (+ sessao de
suporte do Master, justificada e auditada), `organizations` (tenants +
credencial OpenAI/BYOK com envelope encryption + politica de retencao),
`assistants` (+ catalogo de modelos + setores de encaminhamento WhatsApp),
`knowledge` (topicos/fontes/extracao/chunking), `rag` (provedor de IA,
recuperacao vetorial, politica de resposta), `conversations`
(mensagens/feedback/lacunas), `embed` (chaves de widget, dominios, rate
limit, handoff WhatsApp) e `audit` (append-only). `analytics` ainda e um
stub. Ver `docs/README.md` (Estado atual) para a lista completa do que falta.

## Passo a passo (primeira vez)

1. Na raiz do repo, suba a infraestrutura local:
   ```bash
   docker compose up -d
   ```
2. Nesta pasta (`backend/`), copie o `.env.example` para `.env` e ajuste se quiser.
3. Instale as dependencias:
   ```bash
   npm install
   ```
4. Rode as migrations (cria as tabelas no Postgres do Docker):
   ```bash
   npm run migrate:up
   ```
5. Crie o primeiro usuario Master (nao existe cadastro publico no produto):
   ```bash
   npx tsx scripts/create-master.ts admin@chatrag.local "uma-senha-forte"
   ```
6. Suba a API e, em outro terminal, o worker de indexacao/retencao:
   ```bash
   npm run dev
   npm run worker
   ```
7. Faca login e crie o primeiro tenant:
   ```bash
   curl -c cookies.txt -X POST http://localhost:3333/auth/login \
     -H "Content-Type: application/json" \
     -d '{"email":"admin@chatrag.local","password":"uma-senha-forte"}'

   curl -b cookies.txt -X POST http://localhost:3333/master/tenants \
     -H "Content-Type: application/json" \
     -d '{"name":"Acme","slug":"acme","adminEmail":"admin@acme.com","adminPassword":"outra-senha-forte"}'
   ```
8. Configure uma chave OpenAI real do tenant antes de indexar fontes ou usar o playground (sem isso, fontes ficam em `aguardando_ativacao`):
   ```bash
   curl -b cookies-tenant.txt -X POST http://localhost:3333/organizations/<id>/ai-credentials \
     -H "Content-Type: application/json" \
     -d '{"environment":"producao","apiKey":"sk-..."}'
   ```

Rotas implementadas: ver `docs/apis/contratos-planejados.md` ("Rotas implementadas").

## Testes

```bash
npm test                  # unitarios (crypto, autorizacao, envelope, chunker) - nao precisam de infra
npm run test:integration  # login, criacao atomica de tenant - precisam de docker compose up -d + migrate:up
```

## Estrutura

Cada modulo em `src/modules/<nome>/` so expoe sua `index.ts`; nenhum modulo
importa arquivo interno de outro (checado por `npm run deps:check`, ver
`.dependency-cruiser.cjs` e ADR-002). `src/worker.ts` e um processo separado
(consome a fila de indexacao) e por isso pode importar a interface publica de
varios modulos sem violar essa regra.

## O que falta antes de producao

- KMS real em vez da KEK derivada de `APP_MASTER_KEY` (a interface ja e trocavel, ver `ai-credentials.envelope.ts`).
- Particionamento fisico de `source_chunks`: ver ADR-002, gatilho documentado mas nao implementado.
- Retencao hoje so exclui (nao anonimiza) conversas vencidas.
- `analytics` (uso/custo agregado, `usage_events`) ainda nao existe.
- Bundle JS publico do widget (hoje so a API existe).
- Mais testes de isolamento e de contrato conforme o painel Lovable for ligado a esta API (ver `docs/testing/estrategia.md`).
