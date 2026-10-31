# Especificacao do backend

## Estrutura e fronteiras (ADR-002)

Cada modulo abaixo expoe apenas uma interface publica (servico do modulo); nenhum modulo acessa repositorio, tabela ou tipo interno de outro modulo diretamente. Import entre modulos so alcanca a interface publica; violacao e bloqueada por lint de dependencias (ex.: dependency-cruiser ou regra de import restrito). Cada modulo organiza sua propria pasta com subpastas por responsabilidade (rotas, servico, repositorio, tipos) em vez de um arquivo unico.

Nenhum arquivo de codigo deve ultrapassar ~300 linhas como sinal de alerta; ao se aproximar do limite, divide-se por sub-responsabilidade (ex.: `knowledge/sources.repository.ts` e `knowledge/topics.repository.ts` em vez de um `knowledge.repository.ts` unico). Convencao observada em revisao de codigo, nao teste automatizado obrigatorio no MVP.

## Modulos

- `identity`: login proprio, sessoes, usuarios e papeis, verificacao em duas etapas (TOTP) e limite de tentativas de login.
- `privacy`: exportacao dos dados da organizacao (LGPD).
- `public-api`: API REST publica (ADR-006, etapa 8) — tokens por organizacao com escopos, revogacao e limite por minuto, rotas `/api/v1`.
- `webhooks`: webhooks de saida (ADR-006, etapa 8) — eventos assinados com HMAC, entregues pela fila `webhooks` com novas tentativas e protecao contra SSRF.
- `organizations`: tenant, configuracoes, limites e credencial de provedor de IA.
- `assistants`: instrucoes, comportamento, colecoes, widget e encaminhamento.
- `knowledge`: topicos, fontes, versoes futuras, extracao e publicacao.
- `rag`: recuperacao, montagem de contexto, chamada do provedor e politicas de resposta.
- `conversations`: sessoes, mensagens, visitantes, feedback e lacunas.
- `embed`: chaves, dominios, configuracao publica e validacao de origem.
- `analytics`: agregados de uso, custo estimado e qualidade.
- `audit`: eventos administrativos e de seguranca.
- `automations`: automacoes (ADR-006, etapa 7) — regras "quando / se / entao" sem IA, com historico de execucoes.
- `campaigns`: campanhas (ADR-006, etapa 6) — publico por segmento com opt-in, modelo (WhatsApp) ou texto (Telegram), agendamento, ritmo e metricas.
- `channels`: canais oficiais (ADR-006, etapas 4 e 5) — WhatsApp, Telegram, Instagram e Messenger do tenant, webhook autenticado, fila de entrada e envio, recibos e modelos (WhatsApp).
- `contacts`: CRM de contatos (ADR-006, etapa 3) — contatos, identidades por canal, etiquetas, campos personalizados, segmentos, importacao e exportacao CSV.
- `inbox`: caixa de entrada (ADR-006, etapa 2) — status da conversa (aberta, pendente, resolvida), atribuicao a um usuario, resposta humana, notas internas e respostas prontas.

Todos os modulos do ADR-006 ja existem no codigo, com as mesmas regras de fronteira:

`conversations` continua dono de conversa e mensagem e registra o autor de cada mensagem (visitante, assistente ou atendente, com o usuario que respondeu).

## Verificacao em duas etapas e exportacao LGPD (ADR-006, etapa 8)

- **TOTP (RFC 6238):** HMAC-SHA1, 6 digitos, passo de 30 segundos, tolerancia de um passo para cada lado; implementado em `identity/totp.ts` e testado com os vetores da RFC. O segredo fica num envelope cifrado (`src/crypto/envelope.ts`); ativar exige confirmar um codigo e gera 10 codigos de recuperacao, mostrados uma vez e guardados em hash (cada um vale uma vez).
- **Login:** com 2FA ativo, `POST /auth/login` sem `code` responde 401 com `twoFactorRequired: true`; o painel pede o codigo e reenvia. O mesmo codigo nao vale duas vezes (passo usado guardado no Redis por 2 minutos). Entrar com codigo de recuperacao fica na auditoria.
- **Limite de tentativas:** 10 erros (senha ou codigo) em 15 minutos para o mesmo e-mail bloqueiam o login com 429 ate a janela passar. Acerto zera a contagem.
- **Master:** com `MASTER_2FA_REQUIRED=true` (recomendado em producao; padrao `false` para dev e seed), o Master sem 2FA ativo recebe 403 com `twoFactorSetupRequired` nas rotas de plataforma e no acesso de suporte.
- **Exportacao LGPD:** `GET /organizations/:id/export` (so Administrador) devolve um JSON com a organizacao, quem acessa o painel, contatos (com canais e etiquetas), conversas com as mensagens e notas internas (a midia recebida pelos canais nao entra: so o texto das mensagens). Cada parte vem do modulo dono pela interface publica; segredos nunca entram; a exportacao vai para a auditoria como evento de seguranca.

## API publica, webhooks e metricas por atendente (ADR-006, etapa 8)

Detalhes de uso em `docs/integrations/api-e-webhooks.md`.

- **Tokens:** `crg_` + 32 bytes aleatorios; o banco guarda o sha256 e um prefixo. `requireApiScope` (em `public-api/api-auth.ts`) autentica, confere escopo, organizacao suspensa e o limite de 120 chamadas por minuto por token (contador no Redis). A organizacao vem do token, nunca de quem chama.
- **Rotas v1** montam a resposta com formato proprio (camelCase) a partir das interfaces publicas de `contacts` e `conversations`; escrita exige que o token ainda tenha a pessoa responsavel e vai para a auditoria com o nome do token.
- **Webhooks:** `webhooksService.emit` (best effort) e chamado por `contacts` (todo contato novo passa por `contacts/created.ts`), `conversations` (mensagem do visitante) e `inbox` (conversa resolvida). Grava uma linha em `webhook_deliveries` por webhook que assina o evento e poe na fila `webhooks`; o worker entrega (`webhooks/delivery.ts`), assina `t=,v1=` com HMAC-SHA256 e repete com espera exponencial ate 6 tentativas. Sem seguir redirecionamento, timeout de 10 segundos e destino conferido contra rede interna a cada tentativa (`webhooks/url-guard.ts`; `WEBHOOKS_ALLOW_PRIVATE_NETWORK` so para teste e dev).
- **Metricas por atendente:** `inbox/metrics.service.ts` cruza `conversation_assignments` (pedidos e resolucoes do periodo) com as respostas de atendente que `conversations` agrega por conversa e autor (`agent-stats.repository.ts`).

## Automacoes (ADR-006, etapa 7)

Regras em formulario ("quando / se / entao"), nao fluxo em grafo: mais simples de montar, testar e auditar. Nada e decidido pela IA (ADR-006 #4); a regra faz exatamente o que esta nela.

- **Gatilhos:** _mensagem recebida_ (roda antes do assistente, so em conversa sem humano) e _sem resposta_ (conversa com humano em que o cliente falou por ultimo ha X minutos; varredura `automations` no worker a cada minuto).
- **Condicoes** (todas precisam valer): canal; mensagem contem palavra (sem diferenca de acento ou maiuscula); contato tem etiqueta; primeira mensagem da conversa; fora do horario de atendimento (inicio/fim e dias, no fuso de Sao Paulo, inclusive virando a meia-noite); minutos sem resposta.
- **Acoes:** responder com texto, adicionar etiqueta, passar para a fila, atribuir a alguem, nota interna (sem autor; o painel mostra "automacao") e, no "sem resposta", devolver para a fila. O que vale para cada gatilho e validado na API (`rules.ts`), e o painel so oferece o que vale.
- **Assistente quieto:** se alguma regra respondeu ou passou para humano, o assistente nao responde aquela mensagem. Varias regras podem casar; todas rodam, em ordem de criacao, mas so a primeira que responde manda texto.
- **Quem entrega:** a regra devolve o texto e quem recebeu a mensagem (widget ou canal) grava e entrega pelo proprio caminho; assim `automations` nao depende de `channels` nem de `embed` e nao ha ciclo.
- **Sem laco:** a resposta da regra e mensagem do assistente, que nao dispara regra. O "sem resposta" roda uma vez por silencio: so de novo depois de uma mensagem nova do cliente.
- **Versao e historico:** editar sobe a versao; cada execucao guarda a versao que rodou, a conversa e o que fez (ou o erro). Ligar, desligar, editar e excluir vao para a auditoria com quem fez, que e quem responde pela regra.
- **Papeis:** so Administrador cria, edita, liga e exclui; Analista ve as regras e o historico.
- **Ainda nao:** gatilho "etiqueta adicionada" (hoje a etiqueta e condicao), chamar a IA como acao, enviar modelo do WhatsApp como acao, editor em grafo.

## Campanhas (ADR-006, etapa 6)

- **Canais:** WhatsApp (so modelo aprovado da mesma conexao, com todas as variaveis) e Telegram (texto, para quem ja conversou com o bot). Instagram e Messenger ficam de fora pela janela de 24 horas.
- **Publico:** o segmento filtrado para quem tem opt-in valido e endereco no canal. No WhatsApp, sem identidade do canal, o endereco e o telefone do contato (contato importado por planilha recebe antes de escrever). O preview mostra quantos ficam de fora por falta de opt-in ou de canal. Ao agendar, o publico e fixado (foto do filtro em `audience_filter` e uma linha por destinatario).
- **Envio:** fila `campaigns` no worker; cada lote envia ate o ritmo da campanha (padrao 30/min) e agenda o proximo para um minuto depois. O teto da organizacao e 120 envios/minuto somando todas as campanhas (contador por minuto no Redis). O opt-in e conferido de novo na hora de cada envio (quem saiu depois do agendamento vira "ignorada"). Cancelar para no lote seguinte.
- **Mensagem:** cada envio vira uma mensagem de atendente (autor = quem criou a campanha, ADR-006 #3) na conversa do contato naquele canal, entao a resposta cai na caixa de entrada no mesmo lugar. Nas variaveis, `{{nome}}` vira o primeiro nome do contato.
- **Falhas:** erro temporario do provedor deixa o destinatario pendente com a mesma mensagem para o proximo lote tentar uma vez mais; na segunda falha, ou em erro de dado, vira "falhou" com o motivo. Erro ao gravar o recibo nunca marca falha nem reenvia.
- **Metricas:** enviadas, falhas e ignoradas vem da propria campanha; entregues, lidas e respostas (mensagem do cliente depois do envio, na mesma conversa) vem do modulo `conversations` (`messageOutcomes`), sem a campanha ler a tabela de mensagens.
- **Sair:** responder so "SAIR" (ou "parar", "stop", "descadastrar") em qualquer canal registra o opt-out e confirma para o cliente.
- **Papeis:** so Administrador cria, agenda e cancela; Analista ve.

## Camada de canais (ADR-006, etapa 5)

Cada provedor e um adaptador em `channels/providers.ts` com quatro coisas: autenticar o webhook (assinatura da Meta ou token secreto do Telegram), ler mensagens e recibos so da propria conta da conexao, enviar texto e dizer se o canal revela telefone. Conexao (`connect.ts`), webhook (`POST /webhooks/:provider/:connectionId`), entrada e envio sao os mesmos para todos; so o WhatsApp tem modelos. Detalhes de Telegram, Instagram e Messenger em `integrations/telegram-instagram-messenger.md`.

- **Ids de job:** o id do provedor vai como hash no `jobId` do BullMQ (que nao aceita `:`, e o Telegram usa `chat:mensagem`).
- **Validacao:** dado invalido em qualquer rota (zod) responde **400** com o motivo do primeiro problema (`app.ts`, `setErrorHandler`); antes virava 500.

## WhatsApp (ADR-006, etapa 4)

Detalhes de comportamento e configuracao na Meta em `integrations/whatsapp.md`. No backend:

- **Webhook so valida e enfileira:** `POST /webhooks/whatsapp/:connectionId` le o corpo cru (parser JSON proprio, so dentro desse plugin), confere `X-Hub-Signature-256` com a chave secreta do app do tenant e poe cada mensagem e recibo na fila `channel-messages` (`src/queue/`). A organizacao vem da conexao, nunca do corpo; mudancas de outro `phone_number_id` sao ignoradas.
- **Worker:** `processChannelJob` (modulo `channels`) trata entrada, recibo e envio. Entrada nao tem nova tentativa (a mensagem ja foi gravada; repetir mandaria a resposta duas vezes); envio tem 3, so em erro temporario.
- **Idempotencia:** o job de entrada usa o id da mensagem como `jobId` e o processamento confere `provider_message_id` antes de gravar. As buscas por id do provedor sao escopadas pela organizacao da conexao: um tenant controla o proprio app na Meta e poderia assinar um evento citando a mensagem de outro tenant.
- **Resposta da IA:** `answerService.answer` recebe `providerMessageId` e `handoff: "automatico"` (sem botao no WhatsApp: sem resposta na base e com caixa de entrada ligada, a propria resposta avisa e a conversa vai para a fila) e devolve o id da mensagem gravada, que e enviada pela Graph API com as fontes no fim do texto.
- **Janela de 24 horas:** a regra fica no modulo `inbox` (`reply.ts`), para WhatsApp, Instagram e Messenger; o detalhe da conversa traz `replyWindowEndsAt`. Quantas horas vale a janela de cada conexao quem diz e o modulo `channels` (`replyWindowHours`: 168 no Messenger/Instagram com a tag "Agente humano" ligada), registrado no inbox pelo `app.ts` com `setReplyWindowPolicy`, para o inbox nao ler a tabela de conexoes. No envio, `deliverMessage` poe a tag so em resposta de atendente com mais de 24 horas. Fora da janela, so `POST .../inbox/:id/template` (modulo `channels`), que exige modelo `APPROVED` da mesma conexao com todas as variaveis.
- **Segredos:** token e chave secreta do app num unico envelope (`src/crypto/envelope.ts`, o mesmo da chave de IA, agora fora do modulo `organizations` para os dois usarem); o painel so ve o final do token.
- **Midia recebida:** o parser de cada canal devolve a referencia do arquivo (`media` no job de entrada); depois de responder, o worker baixa (`channels/media.ts`, teto `CHANNEL_MEDIA_MAX_BYTES`) e entrega os bytes ao modulo `conversations`, que guarda no storage (`media/<organizacao>/<anexo>`) e registra em `message_attachments` (pendente > pronto ou falhou). O painel baixa por `GET .../conversations/:id/attachments/:attachmentId`, sempre como `attachment` com `nosniff` (o arquivo vem de fora e pode ter script). Retencao e exclusao de contato apagam os arquivos no storage antes das linhas.
- **Ainda nao:** Embedded Signup (conectar sem copiar ids e token), estado do canal na tela do Master.

## Contatos (ADR-006, etapa 3)

- **Visitante vira contato:** ao abrir conversa no widget com e-mail ou id externo, o visitante e ligado a um contato: pela identidade `widget` ja conhecida, por um contato com o mesmo e-mail ou por um contato novo. Visitante anonimo continua anonimo; na caixa de entrada, "Salvar como contato" cria o contato (ou liga a um existente com o mesmo e-mail/telefone) e leva junto todas as conversas daquele visitante.
- **Unicidade:** e-mail (minusculo) e telefone (E.164; numero brasileiro sem DDI ganha +55) sao unicos por organizacao. Cadastro duplicado da 409; valor invalido, 422.
- **Opt-in:** marcar registra data e origem (`painel` ou `importacao`); desmarcar registra o opt-out, que vence o opt-in. A importacao so marca opt-in, nunca desfaz um opt-out.
- **Filtro e segmento:** busca (nome, e-mail, telefone), etiquetas (todas ou qualquer uma), opt-in e campos personalizados por igualdade. O segmento guarda o filtro, nao a lista: e recalculado a cada uso (base das campanhas da etapa 6).
- **Importacao CSV:** ate 5 mil linhas por arquivo, enviada como texto no corpo (o painel le o arquivo). Reconhece `nome`, `email`, `telefone`, `etiquetas` (separadas por `|`), `opt_in` e os campos personalizados pela chave ou rotulo; `;` ou `,` como separador. Atualiza por e-mail e depois por telefone; cada linha com problema volta no relatorio com o numero da linha e o resto segue.
- **Exportacao CSV:** `;` e BOM (Excel em portugues), com celulas que comecam com `=`, `+`, `-` ou `@` prefixadas por apostrofo contra injecao de formula. So administrador; auditada como evento de seguranca.
- **Exclusao (LGPD):** so administrador; apaga o contato, identidades, etiquetas e as conversas dele. A auditoria guarda o id, nunca nome ou e-mail.
- **Papeis:** Administrador e Atendente criam e editam contatos; Analista so le. Importar, exportar, excluir e gerir etiquetas, campos e segmentos e so do Administrador.

## Caixa de entrada (ADR-006, etapa 2)

- **Entrada na fila:** com `assistants.human_inbox_enabled`, o botao "Falar com atendente" do widget chama a mesma rota de encaminhamento, que cria a linha em `conversation_assignments` (status aberta, sem responsavel) em vez de devolver o link do WhatsApp. Um atendente tambem pode assumir qualquer conversa do widget pela aba "Com o assistente".
- **IA calada com humano:** enquanto a conversa tem linha nao resolvida, a mensagem do visitante e gravada e avisada ao painel, mas o assistente nao responde (`answer: null, humanHandling: true`). Resolvida, o assistente volta a responder. Visitante que escreve numa conversa "pendente" (aguardando cliente) a devolve para "aberta".
- **Quem responde:** Administrador e Atendente. Responder assume a conversa se ela estiver livre; se outra pessoa ja a assumiu, a resposta e recusada (409), para nao haver duas respostas ao mesmo visitante. Atendente so assume para si ou devolve a fila uma conversa sua; so o Administrador atribui a outra pessoa, e so a quem atende (Administrador ou Atendente). Analista so le.
- **Master em suporte** le a caixa de entrada com sessao de suporte ativa, mas nao responde, nao atribui e nao escreve nota em nome do tenant (403).
- **Auditoria:** responder, atribuir e mudar status gravam `audit_events` com quem fez e a conversa, nunca o conteudo da mensagem. Respostas prontas criadas ou removidas tambem.
- **Tempo real:** SSE (`text/event-stream`), escolhido por ser so servidor -> cliente, passar por proxy HTTP comum e reconectar sozinho no `EventSource` do navegador. Os eventos passam pelo Redis (pub/sub, um canal por organizacao, `src/realtime/events.ts`) para chegar a qualquer instancia da API. O painel recebe so "a conversa X mudou" e recarrega pelas rotas normais, com as mesmas permissoes; o widget recebe a resposta do atendente e o status da propria conversa. Nota interna nunca vira evento com conteudo. Publicar e melhor esforco: falha do Redis nao derruba a resposta ao visitante, o banco continua sendo a fonte de verdade.
- **Setores:** o Administrador cria setores (`inbox_sectors`) e escolhe quem atende em cada um (`inbox_sector_members`, so Administrador ou Atendente). A conversa na fila pode ter um setor (`conversation_assignments.sector_id`). Na aba "Aguardando", quem e Atendente ve as conversas sem setor e as dos seus setores; Administrador e Analista veem todas; qualquer aba aceita filtro por setor. Excluir um setor devolve as conversas dele a fila geral. Nao confundir com o setor do encaminhamento para WhatsApp (`handoff_configs`).
- **Transferencia:** `POST .../inbox/:id/transfer` muda a pessoa e/ou o setor. So setor: a conversa vai para a fila daquele setor sem responsavel. Atendente transfere conversa que e dele ou que esta livre; Administrador, qualquer uma. O motivo vira nota interna (com quem transferiu e para onde) e a transferencia vai para a auditoria. O tempo real publica `{ kind: "transfer", conversationId, byUserId, toUserId, toSectorId }` (so ids, nunca o motivo), e o painel de quem recebe (a pessoa, ou quem esta no setor quando vai para a fila dele) mostra um aviso com atalho para abrir a conversa.
- **Codigo:** `inbox.service.ts` ficou so com as acoes; a leitura (filas e detalhe) esta em `inbox-views.ts`, setores em `sectors.*` e transferencia em `transfer.ts`.
- **Ainda nao:** SLA/tempo de primeira resposta e notificacao fora do painel (som, e-mail).

## Processamento de fonte

1. Validar tipo, tamanho, permissao e associacao com organizacao/topico.
2. Persistir o arquivo ou conteudo bruto, mesmo se o tenant ainda nao tiver chave de IA.
3. Sem chave valida, marcar como `aguardando_ativacao` e informar claramente que a fonte nao esta pesquisavel.
4. Com chave valida, enfileirar extracao. A fila aplica limite de jobs de indexacao simultaneos por tenant (concorrencia maxima configuravel), para que um upload em massa de um tenant nao esgote a fila de outros (ver ADR-002).
5. Normalizar texto e dividir em trechos com metadados.
6. Gerar embeddings e persistir vetores com `organization_id`, `assistant_id`/colecao e fonte.
7. Marcar a fonte como pronta ou com erro detalhado.

## Politica de resposta

A mensagem de "nao sei responder" e escrita para o visitante, nao para diagnostico: nao menciona "base de conhecimento" nem outro jargao do produto, e so oferece atendente quando o assistente realmente tem WhatsApp configurado — do contrario sugere reformular a pergunta, em vez de prometer um caminho que o widget nao tem como abrir.

Saudacao e cortesia ("oi", "bom dia", "obrigado") nao passam pela base: recebem resposta cordial e **nao** geram lacuna. Antes, um "oi" respondia "nao encontrei essa informacao na base" — como se o produto estivesse quebrado — e entrava na lista de lacunas do tenant, que deveria mostrar o que falta na base. A deteccao (`rag/smalltalk.ts`) e conservadora de proposito: so trata como cortesia a mensagem que e _inteiramente_ cortesia; "oi, qual o horario?" segue o fluxo normal.

As ultimas mensagens da conversa acompanham a pergunta enviada ao modelo, e uma pergunta curta de continuidade herda a anterior para efeito de busca vetorial e de registro de lacuna. Sem isso, "e o CPF?" nao tinha como saber de quem: o visitante recebia "nao encontrei na base" com o dado indexado, e a lacuna registrada ("e o salario dele?") era inutil para quem fosse melhorar a base depois.

O backend busca apenas chunks acessiveis ao assistente e organizacao. Se a relevancia nao atingir o limiar configurado, nao deve usar conhecimento geral quando o modo estrito estiver ativo: registra lacuna e oferece encaminhamento.

O limiar e distancia cosine do pgvector (`RELEVANCE_DISTANCE_THRESHOLD` em `rag/retrieval.service.ts`), hoje `0.65` e global. Foi calibrado com medicao numa base real (`backend/scripts/debug-retrieval.ts`) e nao por estimativa: com `text-embedding-3-small`, perguntas legitimas sobre o conteudo indexado ficaram entre 0.42 e 0.56, e perguntas fora do escopo entre 0.70 e 0.83. O valor anterior (`0.45`) recusava pergunta cuja resposta estava literalmente na base. Ao trocar de modelo de embedding, o limiar precisa ser remedido — a escala de distancia muda com o modelo. Torna-lo configuravel por assistente continua sendo trabalho futuro.

O limiar e o primeiro filtro, nao a unica protecao: o prompt do modo estrito instrui o modelo a devolver uma sentinela (`__SEM_RESPOSTA_NA_BASE__`) quando o contexto recuperado nao contem a resposta. Essa sentinela cai no mesmo caminho de "sem contexto": resposta padrao ao visitante **e lacuna registrada**. Sem isso, uma pergunta que recuperava trechos mas nao tinha resposta na base sumia do radar do tenant — o `usage_event` de `no_context` grava `reason` (`sem_recuperacao` ou `modelo_nao_respondeu`) para diferenciar os dois casos no diagnostico.

## Provedor de IA

Uma interface interna deve separar chat, embeddings e moderacao do fornecedor. OpenAI e a implementacao inicial. Cada tenant configura sua propria chave (BYOK), usada para chat, embeddings e moderacao daquele tenant; ela permanece apenas no servidor, criptografada em repouso e nunca e devolvida pela API. O sistema armazena somente metadados seguros de diagnostico, como provedor, estado, data de atualizacao e sufixo mascarado.

Uma validacao controlada deve testar a chave antes de ativa-la. O tenant pode configurar uma chave para teste e outra para producao, ou optar explicitamente por reutilizar a mesma credencial nos dois ambientes. A substituicao e a remocao invalidam o uso posterior e geram evento de auditoria. O Master pode verificar o estado e remover uma chave em suporte, mas nunca visualizar seu valor.

O Master gerencia uma lista curta de modelos OpenAI aprovados. O tenant escolhe o modelo de cada assistente somente dentro de sua lista permitida; nao ha campo livre para nome de modelo no MVP. Sem lista explicita em `tenant_allowed_models`, valem todos os modelos ativos do catalogo (ADR-004) — um modelo desativado no catalogo nunca e permitido, com ou sem lista.
