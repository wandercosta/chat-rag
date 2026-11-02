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
- `deals`: funil de vendas (ADR-008) — funis e etapas por organizacao, negocios em kanban com historico de etapa (ver "Funil de vendas" abaixo).
- `leads`: classificacao de leads com IA (ADR-009) — sugestao de temperatura, interesse e proximo passo que uma pessoa aceita ou descarta (ver "Classificacao de leads com IA" abaixo).
- `tasks`: tarefas com prazo, responsavel e lembrete (ADR-008 #4), ligadas a contato e/ou negocio (ver "Tarefas" abaixo).
- `team-chat`: chat interno da equipe do tenant — canal Geral da organizacao e conversas diretas entre duas pessoas, com nao lidas e tempo real (ver "Chat interno da equipe" abaixo).
- `inbox`: caixa de entrada (ADR-006, etapa 2) — status da conversa (aberta, pendente, resolvida), atribuicao a um usuario, resposta humana, notas internas e respostas prontas.

Todos os modulos do ADR-006 ja existem no codigo, com as mesmas regras de fronteira:

`conversations` continua dono de conversa e mensagem e registra o autor de cada mensagem (visitante, assistente ou atendente, com o usuario que respondeu).

## Verificacao em duas etapas e exportacao LGPD (ADR-006, etapa 8)

- **TOTP (RFC 6238):** HMAC-SHA1, 6 digitos, passo de 30 segundos, tolerancia de um passo para cada lado; implementado em `identity/totp.ts` e testado com os vetores da RFC. O segredo fica num envelope cifrado (`src/crypto/envelope.ts`); ativar exige confirmar um codigo e gera 10 codigos de recuperacao, mostrados uma vez e guardados em hash (cada um vale uma vez).
- **Login:** com 2FA ativo, `POST /auth/login` sem `code` responde 401 com `twoFactorRequired: true`; o painel pede o codigo e reenvia. O mesmo codigo nao vale duas vezes (passo usado guardado no Redis por 2 minutos). Entrar com codigo de recuperacao fica na auditoria.
- **Limite de tentativas:** 10 erros (senha ou codigo) em 15 minutos para o mesmo e-mail bloqueiam o login com 429 ate a janela passar. Acerto zera a contagem.
- **Master:** com `MASTER_2FA_REQUIRED=true` (recomendado em producao; padrao `false` para dev e seed), o Master sem 2FA ativo recebe 403 com `twoFactorSetupRequired` nas rotas de plataforma e no acesso de suporte.
- **Exportacao LGPD:** `GET /organizations/:id/export` (so Administrador) devolve um JSON com a organizacao, quem acessa o painel, contatos (com canais e etiquetas), negocios do funil, tarefas, classificacoes de leads, conversas com as mensagens e notas internas (a midia recebida pelos canais nao entra: so o texto das mensagens). Cada parte vem do modulo dono pela interface publica; segredos nunca entram; a exportacao vai para a auditoria como evento de seguranca.

## API publica, webhooks e metricas por atendente (ADR-006, etapa 8)

Detalhes de uso em `docs/integrations/api-e-webhooks.md`.

- **Tokens:** `crg_` + 32 bytes aleatorios; o banco guarda o sha256 e um prefixo. `requireApiScope` (em `public-api/api-auth.ts`) autentica, confere escopo, organizacao suspensa e o limite de 120 chamadas por minuto por token (contador no Redis). A organizacao vem do token, nunca de quem chama.
- **Rotas v1** montam a resposta com formato proprio (camelCase) a partir das interfaces publicas de `contacts` e `conversations`; escrita exige que o token ainda tenha a pessoa responsavel e vai para a auditoria com o nome do token.
- **Webhooks:** `webhooksService.emit` (best effort) e chamado por `contacts` (todo contato novo passa por `contacts/created.ts`), `conversations` (mensagem do visitante) e `inbox` (conversa resolvida). Grava uma linha em `webhook_deliveries` por webhook que assina o evento e poe na fila `webhooks`; o worker entrega (`webhooks/delivery.ts`), assina `t=,v1=` com HMAC-SHA256 e repete com espera exponencial ate 6 tentativas. Sem seguir redirecionamento, timeout de 10 segundos e destino conferido contra rede interna a cada tentativa (`webhooks/url-guard.ts`; `WEBHOOKS_ALLOW_PRIVATE_NETWORK` so para teste e dev).
- **Metricas por atendente:** `inbox/metrics.service.ts` cruza `conversation_assignments` (pedidos e resolucoes do periodo) com as respostas de atendente que `conversations` agrega por conversa e autor (`agent-stats.repository.ts`).

## Automacoes (ADR-006, etapa 7)

Regras em formulario ("quando / se / entao"), nao fluxo em grafo: mais simples de montar, testar e auditar. Nada e decidido pela IA (ADR-006 #4); a regra faz exatamente o que esta nela.

- **Gatilhos:** _mensagem recebida_ (roda antes do assistente, so em conversa sem humano), _sem resposta_ (conversa com humano em que o cliente falou por ultimo ha X minutos; varredura `automations` no worker a cada minuto) e _etiqueta adicionada_ (o contato ganhou uma etiqueta pelo painel, pela importacao, pela API ou por outra regra; o modulo `contacts` poe o job `etiqueta-adicionada` na fila `automations` e o worker roda as regras, sem `contacts` depender de `automations`). So etiqueta nova dispara: salvar de novo a mesma etiqueta nao, e por isso uma regra que etiqueta nao entra em laco.
- **Condicoes** (todas precisam valer): canal; mensagem contem palavra (sem diferenca de acento ou maiuscula); contato tem etiqueta; primeira mensagem da conversa; fora do horario de atendimento (inicio/fim e dias, no fuso de Sao Paulo, inclusive virando a meia-noite); minutos sem resposta; qual etiqueta foi adicionada (obrigatoria no gatilho de etiqueta).
- **Acoes:** responder com texto, adicionar etiqueta, passar para a fila, atribuir a alguem, nota interna (sem autor; o painel mostra "automacao"), no "sem resposta", devolver para a fila, e, na "etiqueta adicionada", **enviar modelo do WhatsApp** (numero, modelo aprovado daquele numero e variaveis; `{nome}` vira o nome do contato). O modelo sai pelo mesmo caminho da campanha (`sendToContact`): vira mensagem de atendente na conversa do contato naquele numero, com quem publicou a regra como responsavel (ADR-006 #3). Quem envia e o modulo `channels`, que o worker registra em `automations` (`setTemplateSender`), porque `channels` ja depende de `automations`. Falha (contato sem telefone, modelo de outro numero ou nao aprovado) fica como erro no historico da regra. O que vale para cada gatilho e validado na API (`rules.ts`), e o painel so oferece o que vale.
- **Assistente quieto:** se alguma regra respondeu ou passou para humano, o assistente nao responde aquela mensagem. Varias regras podem casar; todas rodam, em ordem de criacao, mas so a primeira que responde manda texto.
- **Quem entrega:** a regra devolve o texto e quem recebeu a mensagem (widget ou canal) grava e entrega pelo proprio caminho; assim `automations` nao depende de `channels` nem de `embed` e nao ha ciclo.
- **Sem laco:** a resposta da regra e mensagem do assistente, que nao dispara regra. O "sem resposta" roda uma vez por silencio: so de novo depois de uma mensagem nova do cliente.
- **Versao e historico:** editar sobe a versao; cada execucao guarda a versao que rodou, a conversa e o que fez (ou o erro). Ligar, desligar, editar e excluir vao para a auditoria com quem fez, que e quem responde pela regra.
- **Papeis:** so Administrador cria, edita, liga e exclui; Analista ve as regras e o historico.
- **Ainda nao:** chamar a IA como acao (depende de decisao, ADR-006 #4) e editor em grafo.

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
- **Cadastro integrado da Meta:** `channels/embedded-signup.ts` troca o `code` pelo token (app da plataforma, `META_APP_*` no `.env`), cria a conexao pelo mesmo caminho da manual e assina os webhooks da conta; o webhook unico `POST /webhooks/whatsapp` roteia pelo `phone_number_id` (ver `integrations/whatsapp.md`).
- **Canais na tela do Master:** `GET /master/tenants/:id/channels` devolve provedor, nome, numero/Pagina, estado e motivo do erro, sem token, chave secreta nem token de verificacao; exige sessao de suporte ativa, como o estado da chave de IA.

## Contatos (ADR-006, etapa 3)

- **Visitante vira contato:** ao abrir conversa no widget com e-mail ou id externo, o visitante e ligado a um contato: pela identidade `widget` ja conhecida, por um contato com o mesmo e-mail ou por um contato novo. Visitante anonimo continua anonimo; na caixa de entrada, "Salvar como contato" cria o contato (ou liga a um existente com o mesmo e-mail/telefone) e leva junto todas as conversas daquele visitante.
- **Unicidade:** e-mail (minusculo) e telefone (E.164; numero brasileiro sem DDI ganha +55) sao unicos por organizacao. Cadastro duplicado da 409; valor invalido, 422.
- **Opt-in:** marcar registra data e origem (`painel` ou `importacao`); desmarcar registra o opt-out, que vence o opt-in. A importacao so marca opt-in, nunca desfaz um opt-out.
- **Filtro e segmento:** busca (nome, e-mail, telefone), etiquetas (todas ou qualquer uma), opt-in e campos personalizados por igualdade. O segmento guarda o filtro, nao a lista: e recalculado a cada uso (base das campanhas da etapa 6).
- **Importacao CSV:** ate 5 mil linhas por arquivo, enviada como texto no corpo (o painel le o arquivo). Reconhece `nome`, `email`, `telefone`, `etiquetas` (separadas por `|`), `opt_in` e os campos personalizados pela chave ou rotulo; `;` ou `,` como separador. Atualiza por e-mail e depois por telefone; cada linha com problema volta no relatorio com o numero da linha e o resto segue.
- **Exportacao CSV:** `;` e BOM (Excel em portugues), com celulas que comecam com `=`, `+`, `-` ou `@` prefixadas por apostrofo contra injecao de formula. So administrador; auditada como evento de seguranca.
- **Exclusao (LGPD):** so administrador; apaga o contato, identidades, etiquetas e as conversas dele. A auditoria guarda o id, nunca nome ou e-mail.
- **Papeis:** Administrador e Atendente criam e editam contatos; Analista so le. Importar, exportar, excluir e gerir etiquetas, campos e segmentos e so do Administrador.

## Funil de vendas (ADR-008)

- **Funis e etapas:** configuracao da organizacao (`pipelines`, `pipeline_stages`). O primeiro funil ("Vendas") nasce na primeira leitura de Administrador ou Atendente (Analista e Master em suporte so leem, sem criar nada; ADR-010), com Novo, Qualificado, Proposta, Negociacao, Ganho e Perdido; a criacao usa trava (`pg_advisory_xact_lock`) para duas leituras simultaneas nao criarem dois. Etapa tem tipo `aberta`, `ganho` ou `perdido`, e todo funil mantem ao menos uma de cada. So o Administrador cria funil, renomeia, adiciona, reordena e exclui etapa; etapa com negocio, ultima do seu tipo, funil com negocio e o ultimo funil nao saem (409).
- **Negocio:** titulo, valor em centavos (BRL), contato, responsavel (Administrador ou Atendente da organizacao; sem informar, quem criou), previsao de fechamento (`AAAA-MM-DD`), etapa e posicao. O status (`aberto`, `ganho`, `perdido`) vem do tipo da etapa; entrar em ganho ou perdido grava `closed_at`, e perdido aceita motivo. Excluir o contato desliga o negocio (`contact_id` vira null).
- **Kanban:** `POST .../deals/:id/move` com etapa (do mesmo funil) e posicao; o servidor renumera a coluna na mesma transacao. Criar, mover e excluir etapa ou funil travam o funil (`pg_advisory_xact_lock` por funil) ate o fim da transacao: dois movimentos ao mesmo tempo nao duplicam posicao nem se travam, e a exclusao confere "sem negocios" e "ultima etapa do tipo" dentro da trava. Na edicao, contato e responsavel so sao conferidos quando mudam (responsavel que virou Analista nao trava o negocio). Data de previsao impossivel (ex.: 30/02): 400. Toda mudanca de etapa vai para `deal_stage_changes` (de, para, quem, quando).
- **Referencias:** contato, responsavel, funil e etapa de outra organizacao dao 422, nunca 404 de outro tenant. Nome do contato e e-mail do responsavel vem das interfaces publicas de `contacts` e `identity`.
- **Papeis:** Administrador e Atendente criam, editam e movem; Analista le; Editor de base nao ve; excluir negocio e so do Administrador. Master com sessao de suporte le, mas nao escreve (o guard das escritas exige membership).
- **Auditoria e webhooks:** criar, editar, mover, ganhar, perder e excluir gravam `audit_events` com o id do negocio, sem nome do contato nem valor. Webhooks `negocio.criado` e `negocio.etapa_alterada`. A exportacao LGPD da organizacao inclui os negocios.

## Classificacao de leads com IA (ADR-009)

- **Ligar:** `lead_settings.enabled` por organizacao, desligada por padrao; so o Administrador liga (auditado). Desligada, nenhuma conversa vai ao modelo para isso (409).
- **Entrada:** texto das ultimas mensagens das 5 conversas mais recentes do contato (ate 40 mensagens e 8 mil caracteres), com e-mail (inclusive com acento) e telefone digitados (inclusive com travessao ou barra) trocados por `[e-mail]`/`[telefone]` e sem `<` e `>`, para o cliente nao fechar o bloco da conversa (`leads/classifier.ts`). Nada do CRM (nome, campos, etiquetas) vai junto. O texto vai entre `<conversa>` e `</conversa>` e o prompt manda tratar o conteudo como dado, nunca como instrucao.
- **Saida:** JSON com `temperatura` (quente, morno, frio), `confianca` (baixa, media, alta), `interesse` (ate 200), `proximo_passo` (ate 200) e `resumo` (ate 600). Enum fora do esperado, campo vazio ou texto que nao e JSON: descartado (502) e nada e gravado.
- **Modelo e custo:** mesma resolucao das respostas (`resolveChatProvider` com `OPENAI_CHAT_MODEL`: BYOK do tenant se houver, senao a chave da plataforma). Modo local (sem LLM), sem chave ou limite mensal atingido (ADR-007): 409. O consumo vai para `usage_events` com tipo `lead_classification` (mesmo descartado, porque o modelo cobrou) e entra no limite e no custo estimado.
- **Revisao:** cada pedido grava uma sugestao (`lead_insights.status = sugerida`) e descarta a que estava pendente, entao so uma espera revisao; aceitar ou descartar grava quem e quando e so vale uma vez (409 depois). A classificacao atual do contato e a ultima aceita, pela hora do aceite (a mesma regra no contato e no selo do kanban); `GET .../lead-insights/current` devolve a de varios contatos (selo no kanban). A IA nao muda contato, negocio, etiqueta nem campanha.
- **Papeis:** Administrador e Atendente classificam e revisam; Analista ve; Master nao classifica (com sessao de suporte so le).
- **Retencao e LGPD:** a sugestao guarda um resumo da conversa, entao o worker de retencao apaga as mais antigas que o menor prazo entre a organizacao e os assistentes dela (ADR-010); sai junto com o contato (cascade) e entra na exportacao LGPD. A auditoria guarda o id, nunca o conteudo.

## Tarefas (ADR-008 #4)

- **Tarefa:** titulo, observacoes, prazo (data e hora), responsavel (Administrador ou Atendente; sem informar, quem criou) e ligacao opcional com um contato e/ou um negocio da organizacao (de fora: 422). Excluir o contato ou o negocio desliga a tarefa, nao apaga.
- **Listas:** "minhas" (do responsavel logado) ou "da equipe", em abertas (prazo mais proximo primeiro), atrasadas ou concluidas; por contato ou negocio lista todas as deles.
- **Concluir e reabrir:** `PATCH` com `done` grava ou limpa `done_at`/`done_by` e vai para a auditoria. Prazo novo zera o aviso (`reminded_at`), para avisar de novo.
- **Lembrete:** fila `tasks` no worker, varredura a cada minuto. A tarefa vencida e aberta e marcada na mesma instrucao (`for update skip locked`), entao avisa uma vez mesmo com varios workers: evento `task_due` em tempo real (so o painel do responsavel recebe, pela rota `.../tasks/events`) e e-mail ao responsavel se houver SMTP, sem titulo nem contato no e-mail. So entra na varredura tarefa com responsavel. Salvar a tarefa com o mesmo prazo nao repete o aviso; prazo diferente ou outro responsavel volta a avisar. Concluir o que ja esta concluido (lista desatualizada) devolve 200. O aviso em tempo real so chega a quem esta com o painel aberto; ao abrir o painel, quem tem tarefa atrasada ve um aviso com a quantidade.
- **Papeis:** Administrador e Atendente criam, editam e concluem; Analista le; exclui quem criou ou o Administrador. Master com sessao de suporte so le. A exportacao LGPD inclui as tarefas.

## Chat interno da equipe

- **O que e:** conversa entre as pessoas da organizacao no painel (`/equipe`). Um canal **Geral** por organizacao (criado na primeira leitura) e **conversas diretas** entre duas pessoas (`team_threads`, par ordenado `user_a < user_b`, unico por organizacao). Nada daqui vai para cliente, canal ou assistente.
- **Quem usa:** todo membro da organizacao, em qualquer papel. O Master nao entra, nem com sessao de suporte: o guard do modulo exige membership, nao so `requireOrgRole` (conversa entre colegas nao e dado de suporte). Conversa direta so e lida pelas duas pessoas; terceiros recebem 404. Conversa direta so abre com quem e membro da organizacao.
- **Nao lidas:** `team_thread_reads` guarda ate quando cada pessoa leu cada thread. Ler a pagina mais recente marca como lida; mensagem da propria pessoa nao conta.
- **Tempo real:** mesmo SSE + Redis da caixa de entrada, evento `team_message` so com ids (`threadId`, `authorUserId`). Em conversa direta o evento leva os dois participantes e a rota `.../team-chat/events` so entrega a eles; as rotas da caixa de entrada e do widget ignoram esse evento.
- **Autor que saiu:** a mensagem fica, sem e-mail ("ex-membro"); responder numa conversa direta com quem saiu e recusado (400).
- **Retencao:** o worker de retencao apaga mensagens do chat alem do prazo da organizacao (`organizations.retention_days`, padrao 90 dias).

## Caixa de entrada (ADR-006, etapa 2)

- **Entrada na fila:** com `assistants.human_inbox_enabled`, o botao "Falar com atendente" do widget chama a mesma rota de encaminhamento, que cria a linha em `conversation_assignments` (status aberta, sem responsavel) em vez de devolver o link do WhatsApp. Um atendente tambem pode assumir qualquer conversa do widget pela aba "Com o assistente".
- **IA calada com humano:** enquanto a conversa tem linha nao resolvida, a mensagem do visitante e gravada e avisada ao painel, mas o assistente nao responde (`answer: null, humanHandling: true`). Resolvida, o assistente volta a responder. Visitante que escreve numa conversa "pendente" (aguardando cliente) a devolve para "aberta".
- **Quem responde:** Administrador e Atendente. Responder assume a conversa se ela estiver livre; se outra pessoa ja a assumiu, a resposta e recusada (409), para nao haver duas respostas ao mesmo visitante. Atendente so assume para si ou devolve a fila uma conversa sua; so o Administrador atribui a outra pessoa, e so a quem atende (Administrador ou Atendente). Analista so le.
- **Master em suporte** le a caixa de entrada com sessao de suporte ativa, mas nao responde, nao atribui e nao escreve nota em nome do tenant (403).
- **Auditoria:** responder, atribuir e mudar status gravam `audit_events` com quem fez e a conversa, nunca o conteudo da mensagem. Respostas prontas criadas ou removidas tambem.
- **Tempo real:** SSE (`text/event-stream`), escolhido por ser so servidor -> cliente, passar por proxy HTTP comum e reconectar sozinho no `EventSource` do navegador. Os eventos passam pelo Redis (pub/sub, um canal por organizacao, `src/realtime/events.ts`) para chegar a qualquer instancia da API. O painel recebe so "a conversa X mudou" e recarrega pelas rotas normais, com as mesmas permissoes; o widget recebe a resposta do atendente e o status da propria conversa. Nota interna nunca vira evento com conteudo. Publicar e melhor esforco: falha do Redis nao derruba a resposta ao visitante, o banco continua sendo a fonte de verdade.
- **Setores:** o Administrador cria setores (`inbox_sectors`) e escolhe quem atende em cada um (`inbox_sector_members`, so Administrador ou Atendente). A conversa na fila pode ter um setor (`conversation_assignments.sector_id`). Na aba "Aguardando", quem e Atendente ve as conversas sem setor e as dos seus setores; Administrador e Analista veem todas; qualquer aba aceita filtro por setor. Excluir um setor devolve as conversas dele a fila geral. Nao confundir com o setor do encaminhamento para WhatsApp (`handoff_configs`).
- **Transferencia:** `POST .../inbox/:id/transfer` muda a pessoa e/ou o setor. So setor: a conversa vai para a fila daquele setor sem responsavel. Atendente transfere conversa que e dele ou que esta livre; Administrador, qualquer uma. O motivo vira nota interna (com quem transferiu e para onde) e a transferencia vai para a auditoria. O tempo real publica `{ kind: "transfer", conversationId, byUserId, toUserId, toSectorId }` (so ids, nunca o motivo), e o painel de quem recebe (a pessoa, ou quem esta no setor quando vai para a fila dele) mostra um aviso com atalho para abrir a conversa.
- **Arquivo do atendente:** `POST .../inbox/:id/files` (multipart `file` + `caption` opcional; Administrador e Atendente; teto `OUTBOUND_MEDIA_MAX_BYTES`, padrao 16 MB) segue as regras da resposta em texto (assume a conversa, janela de 24 horas). Lista fechada de tipos: JPG/PNG, MP4, MP3/OGG/M4A, PDF, Word, Excel, CSV e TXT; o Instagram so recebe imagem, video e audio, e o WhatsApp nao recebe CSV. Teto por canal, abaixo do geral (422 na hora, em vez de falha depois): WhatsApp imagem 5 MB, audio e video 16 MB; Instagram imagem 8 MB, audio e video 25 MB; Messenger 25 MB; Telegram foto 10 MB, o resto 50 MB. O arquivo vai para o storage antes de a mensagem existir: storage fora do ar da 500 e nao deixa mensagem sem arquivo. O nome do arquivo perde o caminho. O texto da mensagem e a legenda (ou o nome). O arquivo vai para o storage como anexo da mensagem e sai pelo worker: WhatsApp sobe em `/{numero}/media` e manda pelo id; Messenger sobe em `message_attachments` e manda pelo `attachment_id` (legenda como texto logo depois; se so a legenda falhar, o arquivo conta como enviado, para a fila nao mandar o arquivo de novo); Telegram manda no proprio pedido (`sendPhoto`/`sendVideo`/`sendAudio`/`sendDocument`); Instagram e widget recebem um **link publico assinado e temporario** (`GET /media/:attachmentId?exp=&sig=`, 24 horas, HMAC com chave derivada de `APP_MASTER_KEY`), que so serve arquivo de mensagem de atendente: arquivo recebido do cliente nunca sai por ali. Imagem abre no navegador; o resto baixa como anexo, com `nosniff` e CSP sem script. O link sai em stream e aceita ate 30 downloads por IP e arquivo em 10 minutos (429 depois). Na entrega, o worker le o arquivo do storage antes de chamar o provedor: falha do storage marca "falhou" com texto generico e a fila tenta de novo. No Instagram o link precisa de `PUBLIC_API_URL`.
- **Codigo:** `inbox.service.ts` ficou so com as acoes; a leitura (filas e detalhe) esta em `inbox-views.ts`, setores em `sectors.*` e transferencia em `transfer.ts`.
- **Prazo de primeira resposta (SLA):** `inbox_settings.first_response_minutes` por organizacao (vazio = sem prazo). Na fila, conversa com humano ainda sem resposta de atendente depois do pedido traz `firstResponseDueAt` e `firstResponseLate`. No desempenho, `team.sla = { met, total }` conta os pedidos do periodo ja respondidos ou com prazo vencido e quantos foram respondidos dentro dele.
- **Avisos no painel:** alem de `conversation_changed` e `transfer`, o tempo real publica `queued` (pedido de atendente, com o setor) e `visitor_message` (cliente escreveu numa conversa com humano, com quem esta com ela) — so ids. O painel de quem atende mostra aviso, toca um bipe e, se a pessoa ligou, mostra o aviso do sistema com a aba em segundo plano (preferencia guardada no navegador).
- **E-mail:** com `inbox_settings.email_on_assignment` ligado e SMTP na plataforma (`SMTP_URL`, `SMTP_FROM`, `PANEL_URL` no `.env`, `src/mail/mailer.ts`), quem recebe uma conversa atribuida ou transferida por outra pessoa ganha um e-mail com o link `/atendimento?conversa=<id>`. Sem dado do cliente no e-mail. O envio nao segura a resposta da rota e falha de SMTP nao derruba a atribuicao. Sem `SMTP_URL`, nada sai e o painel mostra a opcao como indisponivel.

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

**Streaming da resposta.** O `ChatProvider` tem `stream` alem de `chat` (OpenAI com `stream: true`; Claude com `messages.stream`, inclusive no caminho com fallback de recusa). `answerService.answer` recebe `onDelta` e manda cada pedaco por um filtro (`rag/stream-guard.ts`) que segura o comeco do texto enquanto ele ainda pode ser a marca de "sem resposta na base", para ela nunca aparecer para o visitante. As rotas de mensagem do widget e do playground respondem em Server-Sent Events quando o pedido traz `Accept: text/event-stream` (`streamReply` em `src/realtime/sse.ts`): eventos `delta` e um `done` com a resposta final, que e a que vale e substitui o texto parcial (muda quando a base nao tinha a resposta, quando um fallback de recusa trocou de modelo no meio ou quando so as fontes realmente citadas ficam). Erro depois de comecar vira `error`. Sem o cabecalho, as rotas respondem JSON como antes. Modo local (extrativo), cortesias, automacoes e conversa com humano nao tem pedacos: so o `done`.

Uma interface interna deve separar chat, embeddings e moderacao do fornecedor. OpenAI e a implementacao inicial. Cada tenant configura sua propria chave (BYOK), usada para chat, embeddings e moderacao daquele tenant; ela permanece apenas no servidor, criptografada em repouso e nunca e devolvida pela API. O sistema armazena somente metadados seguros de diagnostico, como provedor, estado, data de atualizacao e sufixo mascarado.

Uma validacao controlada deve testar a chave antes de ativa-la. O tenant pode configurar uma chave para teste e outra para producao, ou optar explicitamente por reutilizar a mesma credencial nos dois ambientes. A substituicao e a remocao invalidam o uso posterior e geram evento de auditoria. O Master pode verificar o estado e remover uma chave em suporte, mas nunca visualizar seu valor.

O Master gerencia uma lista curta de modelos OpenAI aprovados. O tenant escolhe o modelo de cada assistente somente dentro de sua lista permitida; nao ha campo livre para nome de modelo no MVP. Sem lista explicita em `tenant_allowed_models`, valem todos os modelos ativos do catalogo (ADR-004) — um modelo desativado no catalogo nunca e permitido, com ou sem lista.
