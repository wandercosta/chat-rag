# ADR-004: Sem lista explicita, valem os modelos ativos do catalogo

**Status:** Aceita

## Contexto

O ADR-001 #15 define que o Master governa um catalogo curto de modelos e que
o tenant so seleciona opcoes liberadas. `tenant_allowed_models` guarda essa
liberacao por organizacao.

A documentacao nunca definiu o que acontece quando a organizacao **nao tem
nenhuma linha** nessa tabela — e esse e o estado de todo tenant recem-criado,
porque `createTenant` nao insere nada ali. A primeira implementacao tratava
lista vazia como "nenhum modelo liberado".

Consequencia observada usando o produto: um tenant criado pelo painel nao
conseguia criar assistente nenhum (a tela mostra "Nenhum modelo foi liberado
para esta organizacao ainda. Peca ao Master...") e **nao existia tela para o
Master liberar** — as rotas `PUT /master/tenants/:id/allowed-models` existiam,
mas nada no painel as chamava. O unico caminho era `curl` ou o script de seed.
Na pratica, todo tenant novo nascia travado.

## Decisao

Lista vazia significa **sem restricao**, nao "nada liberado":

- Organizacao **sem nenhuma** linha em `tenant_allowed_models`: pode usar todos
  os modelos com `enabled = true` no catalogo.
- Organizacao **com** linhas: so os modelos dessas linhas, e ainda assim apenas
  os que estiverem ativos no catalogo.
- Um modelo desativado no catalogo nunca e permitido, nos dois casos — a
  governanca do Master sobre o catalogo continua sendo o limite superior.

A tela de detalhe do tenant (Master) passa a permitir marcar/desmarcar os
modelos. Desmarcar todos, ou marcar o catalogo inteiro, grava lista vazia e
volta ao padrao, em vez de deixar o tenant sem nenhuma opcao.

Preferiu-se essa forma a inserir os defaults na criacao do tenant porque
`organizations` teria que escrever em tabela do modulo `assistants`; importar
`assistants` de dentro de `organizations` criaria ciclo (`assistants` ja
importa `organizations`) e violaria a fronteira do ADR-002.

## Consequencias

- Tenant novo ja consegue criar assistente, sem passo manual do Master.
- Restringir modelo continua possivel e agora tem tela; deixa de ser
  pre-requisito de onboarding e vira excecao deliberada.
- Nao ha como expressar "este tenant nao pode usar modelo nenhum". Suspender a
  organizacao e o mecanismo para bloquear um tenant por inteiro.
- Mesma forma do ADR-003 (colecao como filtro opcional): ausencia de vinculo
  significa ausencia de restricao, nao ausencia de acesso.
