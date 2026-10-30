# Especificacao do backend

## Estrutura e fronteiras (ADR-002)

Cada modulo abaixo expoe apenas uma interface publica (servico do modulo); nenhum modulo acessa repositorio, tabela ou tipo interno de outro modulo diretamente. Import entre modulos so alcanca a interface publica; violacao e bloqueada por lint de dependencias (ex.: dependency-cruiser ou regra de import restrito). Cada modulo organiza sua propria pasta com subpastas por responsabilidade (rotas, servico, repositorio, tipos) em vez de um arquivo unico.

Nenhum arquivo de codigo deve ultrapassar ~300 linhas como sinal de alerta; ao se aproximar do limite, divide-se por sub-responsabilidade (ex.: `knowledge/sources.repository.ts` e `knowledge/topics.repository.ts` em vez de um `knowledge.repository.ts` unico). Convencao observada em revisao de codigo, nao teste automatizado obrigatorio no MVP.

## Modulos

- `identity`: login proprio, sessoes, usuarios e papeis.
- `organizations`: tenant, configuracoes, limites e credencial de provedor de IA.
- `assistants`: instrucoes, comportamento, colecoes, widget e encaminhamento.
- `knowledge`: topicos, fontes, versoes futuras, extracao e publicacao.
- `rag`: recuperacao, montagem de contexto, chamada do provedor e politicas de resposta.
- `conversations`: sessoes, mensagens, visitantes, feedback e lacunas.
- `embed`: chaves, dominios, configuracao publica e validacao de origem.
- `analytics`: agregados de uso, custo estimado e qualidade.
- `audit`: eventos administrativos e de seguranca.
- `inbox`: caixa de entrada (ADR-006, etapa 2) — status da conversa (aberta, pendente, resolvida), atribuicao a um usuario, resposta humana, notas internas e respostas prontas.

Planejados pelo ADR-006 (ainda nao existem no codigo), com as mesmas regras de fronteira:

- `channels`: conexao de canal por tenant (WhatsApp Cloud API, Instagram/Messenger pela Graph API, Telegram Bot API), webhooks de entrada com validacao de assinatura e idempotencia pelo id do provedor, envio, templates e status de entrega. Token de canal com envelope encryption, como a chave de IA.
- `contacts`: contatos, identidades por canal (unicas por organizacao e canal), etiquetas, campos personalizados, segmentos, importacao e exportacao.
- `campaigns`: publico por segmento com opt-in, agendamento, envio pela fila com ritmo por organizacao e metricas de entrega.
- `automations`: fluxos deterministicos (gatilho, condicoes, acoes) publicados por humano, versionados, executados no worker com log e protecao contra laco.

`conversations` continua dono de conversa e mensagem e registra o autor de cada mensagem (visitante, assistente ou atendente, com o usuario que respondeu).

## Caixa de entrada (ADR-006, etapa 2)

- **Entrada na fila:** com `assistants.human_inbox_enabled`, o botao "Falar com atendente" do widget chama a mesma rota de encaminhamento, que cria a linha em `conversation_assignments` (status aberta, sem responsavel) em vez de devolver o link do WhatsApp. Um atendente tambem pode assumir qualquer conversa do widget pela aba "Com o assistente".
- **IA calada com humano:** enquanto a conversa tem linha nao resolvida, a mensagem do visitante e gravada e avisada ao painel, mas o assistente nao responde (`answer: null, humanHandling: true`). Resolvida, o assistente volta a responder. Visitante que escreve numa conversa "pendente" (aguardando cliente) a devolve para "aberta".
- **Quem responde:** Administrador e Atendente. Responder assume a conversa se ela estiver livre; se outra pessoa ja a assumiu, a resposta e recusada (409), para nao haver duas respostas ao mesmo visitante. Atendente so assume para si ou devolve a fila uma conversa sua; so o Administrador atribui a outra pessoa, e so a quem atende (Administrador ou Atendente). Analista so le.
- **Master em suporte** le a caixa de entrada com sessao de suporte ativa, mas nao responde, nao atribui e nao escreve nota em nome do tenant (403).
- **Auditoria:** responder, atribuir e mudar status gravam `audit_events` com quem fez e a conversa, nunca o conteudo da mensagem. Respostas prontas criadas ou removidas tambem.
- **Tempo real:** SSE (`text/event-stream`), escolhido por ser so servidor -> cliente, passar por proxy HTTP comum e reconectar sozinho no `EventSource` do navegador. Os eventos passam pelo Redis (pub/sub, um canal por organizacao, `src/realtime/events.ts`) para chegar a qualquer instancia da API. O painel recebe so "a conversa X mudou" e recarrega pelas rotas normais, com as mesmas permissoes; o widget recebe a resposta do atendente e o status da propria conversa. Nota interna nunca vira evento com conteudo. Publicar e melhor esforco: falha do Redis nao derruba a resposta ao visitante, o banco continua sendo a fonte de verdade.
- **Ainda nao:** atribuicao a setor, transferencia com aviso, SLA/tempo de primeira resposta e notificacao fora do painel (som, e-mail).

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
