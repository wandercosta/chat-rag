# ADR-006: Atendimento omnichannel com CRM de contatos

**Status:** Aceita em planejamento

## Contexto

O ChatRAG nasceu como assistente de IA ancorado em base privada, instalado em
sites por um widget, com encaminhamento ao humano por link `wa.me`
(ADR-001 #11). Duas decisoes do ADR-001 e do roadmap limitam o produto a isso:

- ADR-001 #12: "Nenhuma acao externa e executada no MVP".
- `planning/escopo-mvp-e-roadmap.md`: "Atendimento humano nativo" fica fora do
  MVP, e canais so aparecem na Fase 4.

Uma analise de produtos de atendimento do mercado (ex.: Dizzi, em
30/10/2026) mostrou que o assistente RAG e uma parte do que o cliente compra.
O resto e: caixa de entrada compartilhada em tempo real, canais oficiais
(WhatsApp, Instagram, Messenger, Telegram), CRM de contatos, campanhas e
automacoes. Sem isso, o tenant precisa de outra ferramenta para atender o que
a IA nao resolve, e o ChatRAG vira um componente dela.

A alternativa de recomecar um produto novo foi descartada: o que ja existe
(isolamento por organizacao, BYOK com envelope encryption, sessao de suporte
do Master, auditoria append-only, worker com fila, RAG com citacoes, widget) e
justamente o mais caro de refazer, e o monolito modular (ADR-002 #2) foi
desenhado para receber modulos novos.

## Decisao

1. **Reposicionamento.** O ChatRAG passa a ser uma plataforma de atendimento
   omnichannel com CRM de contatos, em que o assistente RAG e a primeira linha
   de resposta e o humano assume pela caixa de entrada. A evolucao acontece
   neste repositorio, sem fork e sem produto paralelo.

2. **Principios mantidos.** Continuam valendo sem excecao: isolamento por
   `organization_id` como fronteira de seguranca; resposta do assistente
   ancorada na base; produto independente; comportamento por configuracao;
   Master e Tenant como escopos distintos; segredos de tenant nunca devolvidos
   por API, log ou auditoria.

3. **Substitui o ADR-001 #12 em parte.** Passam a ser permitidas acoes de
   **comunicacao** por canais que o proprio tenant conectou: resposta de
   atendente, resposta do assistente no canal, mensagem de template, campanha
   agendada e acao de automacao publicada. Toda acao dessas tem um responsavel
   humano identificavel (quem respondeu, quem publicou o fluxo, quem disparou a
   campanha) e gera auditoria. Continua proibido o assistente consultar ou
   alterar dados em sistemas externos do cliente (pedidos, cadastros, bancos);
   isso segue como conector futuro, fora deste ADR.

4. **O assistente nao decide acoes.** O LLM so gera resposta ancorada na base.
   Etiquetar, atribuir, enviar template ou disparar campanha vem de humano ou de
   fluxo deterministico publicado por humano. Um fluxo pode usar "responder com
   o assistente" como acao, nunca o contrario.

5. **Atendimento humano nativo.** Substitui a linha "Atendimento humano nativo"
   da lista "Fora do MVP": a conversa tem status (aberta, pendente, resolvida),
   atribuicao a usuario ou setor, notas internas e respostas prontas. Enquanto
   ha humano atribuido, o assistente nao responde naquela conversa. O
   encaminhamento por link `wa.me` continua como alternativa para tenant sem
   canal conectado.

6. **Canais apenas por API oficial.** WhatsApp pela Cloud API da Meta;
   Instagram Direct e Messenger pela Graph API; Telegram pela Bot API. Nao se
   usa biblioteca nao oficial de WhatsApp Web (risco de banimento do numero do
   tenant e de violar os termos da Meta). E-mail e SMS ficam para depois, sem
   fase definida.

7. **Conta do canal e do tenant.** O tenant conecta a propria conta (WhatsApp
   Business, Pagina/Instagram, bot do Telegram), no mesmo espirito do BYOK: o
   custo cobrado pela Meta fica com o tenant. Token de canal segue as regras da
   chave de IA (ADR-002 #1): envelope encryption, nunca devolvido por API, log
   ou auditoria, Master ve so o estado. Webhook de entrada valida a assinatura
   do provedor antes de qualquer processamento e e idempotente pelo id da
   mensagem no provedor.

8. **Contato e diferente de visitante.** `visitors` continua sendo quem abriu o
   widget. Contato e a pessoa no CRM da organizacao, com identidades por canal
   (telefone, id do Instagram, id do Telegram, visitante do widget) unicas por
   organizacao e canal. Uma conversa pertence a um contato quando ele e
   identificado. Etiquetas, campos personalizados e segmentos sao por
   organizacao.

9. **Campanha exige consentimento.** So recebe campanha o contato com opt-in
   registrado (origem e data) e sem opt-out. Fora da janela de 24 horas do
   WhatsApp, so template aprovado. O envio passa pela fila com ritmo por
   organizacao, para respeitar o limite do provedor e nao esgotar a fila de
   outros tenants (mesmo raciocinio do ADR-002 #4).

10. **Tempo real.** O painel recebe eventos da caixa de entrada sem recarregar,
    com a mesma autenticacao da rota HTTP equivalente e assinatura escopada por
    organizacao; nenhum evento atravessa tenant. Entre instancias da API, os
    eventos passam pelo Redis (pub/sub), que ja faz parte da stack. O widget
    recebe a resposta humana com a mesma autenticacao das rotas publicas da
    conversa. O transporte (WebSocket, SSE ou polling curto) e escolhido na
    implementacao, desde que cumpra essas regras.

11. **Modulos novos** (estendem a lista do ADR-002 #2, com as mesmas regras de
    fronteira):
    - `inbox`: status, atribuicao, notas internas, respostas prontas e fila;
    - `channels`: conexoes por tenant, webhooks de entrada, envio, templates e
      status de entrega;
    - `contacts`: contatos, identidades por canal, etiquetas, campos,
      segmentos, importacao e exportacao;
    - `campaigns`: campanhas, publico, agendamento, ritmo e metricas;
    - `automations`: fluxos (gatilho, condicoes, acoes), versoes e execucoes.
      `conversations` continua dono de conversa e mensagem, e ganha canal de
      origem e autor da mensagem (contato, assistente, atendente).

12. **Fora do escopo deste ADR:** integracao com e-commerce (Shopify,
    WooCommerce), agendamento de posts em redes sociais, cobranca e
    assinatura (seguem na governanca SaaS do roadmap) e acoes do assistente em
    sistemas externos (item 3).

## Consequencias

- O produto deixa de ser "assistente que encaminha" e passa a ser "atendimento
  com IA na frente". Roadmap, visao geral e especificacao do backend mudam
  junto com este ADR.
- Entram dependencias externas que o tenant controla: conta e aprovacao na
  Meta, verificacao de empresa e revisao de app. O cronograma dos canais
  depende delas, nao so de codigo.
- A superficie de ataque cresce: webhooks publicos de entrada, tokens de canal
  e envio em massa. Cada modulo novo precisa de teste de isolamento entre
  organizacoes antes de ser considerado pronto (ADR-002 #9).
- Retencao e privacidade passam a cobrir contatos e mensagens de canal; a
  exclusao de um contato remove suas identidades e conversas, e a exportacao
  de dados da organizacao vira requisito.
- O nome "ChatRAG" deixa de descrever o produto inteiro. Renomear nao faz
  parte desta decisao.
