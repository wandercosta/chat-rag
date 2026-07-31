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

## Processamento de fonte

1. Validar tipo, tamanho, permissao e associacao com organizacao/topico.
2. Persistir o arquivo ou conteudo bruto, mesmo se o tenant ainda nao tiver chave de IA.
3. Sem chave valida, marcar como `aguardando_ativacao` e informar claramente que a fonte nao esta pesquisavel.
4. Com chave valida, enfileirar extracao. A fila aplica limite de jobs de indexacao simultaneos por tenant (concorrencia maxima configuravel), para que um upload em massa de um tenant nao esgote a fila de outros (ver ADR-002).
5. Normalizar texto e dividir em trechos com metadados.
6. Gerar embeddings e persistir vetores com `organization_id`, `assistant_id`/colecao e fonte.
7. Marcar a fonte como pronta ou com erro detalhado.

## Politica de resposta

O backend busca apenas chunks acessiveis ao assistente e organizacao. Se a relevancia nao atingir o limiar configurado, nao deve usar conhecimento geral quando o modo estrito estiver ativo: registra lacuna e oferece encaminhamento.

O limiar e distancia cosine do pgvector (`RELEVANCE_DISTANCE_THRESHOLD` em `rag/retrieval.service.ts`), hoje `0.65` e global. Foi calibrado com medicao numa base real (`backend/scripts/debug-retrieval.ts`) e nao por estimativa: com `text-embedding-3-small`, perguntas legitimas sobre o conteudo indexado ficaram entre 0.42 e 0.56, e perguntas fora do escopo entre 0.70 e 0.83. O valor anterior (`0.45`) recusava pergunta cuja resposta estava literalmente na base. Ao trocar de modelo de embedding, o limiar precisa ser remedido — a escala de distancia muda com o modelo. Torna-lo configuravel por assistente continua sendo trabalho futuro.

O limiar e o primeiro filtro, nao a unica protecao: o prompt do modo estrito instrui o modelo a dizer que nao encontrou quando o contexto recuperado nao contem a resposta.

## Provedor de IA

Uma interface interna deve separar chat, embeddings e moderacao do fornecedor. OpenAI e a implementacao inicial. Cada tenant configura sua propria chave (BYOK), usada para chat, embeddings e moderacao daquele tenant; ela permanece apenas no servidor, criptografada em repouso e nunca e devolvida pela API. O sistema armazena somente metadados seguros de diagnostico, como provedor, estado, data de atualizacao e sufixo mascarado.

Uma validacao controlada deve testar a chave antes de ativa-la. O tenant pode configurar uma chave para teste e outra para producao, ou optar explicitamente por reutilizar a mesma credencial nos dois ambientes. A substituicao e a remocao invalidam o uso posterior e geram evento de auditoria. O Master pode verificar o estado e remover uma chave em suporte, mas nunca visualizar seu valor.

O Master gerencia uma lista curta de modelos OpenAI aprovados. O tenant escolhe o modelo de cada assistente somente dentro de sua lista permitida; nao ha campo livre para nome de modelo no MVP.
