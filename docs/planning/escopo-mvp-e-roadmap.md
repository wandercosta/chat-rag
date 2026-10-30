# Escopo do MVP e roadmap

## MVP

1. Login proprio, painel Master e base multi-tenant desde o primeiro release.
2. Provisionamento manual de tenants pelo Master, com usuario administrador inicial, status, limites e permissoes.
3. Sem auto cadastro publico: usuarios entram somente por convite ou criacao administrativa.
4. Topicos, texto manual, PDF, DOCX e URL como fontes.
5. Extracao, divisao em trechos, embeddings, indexacao e reindexacao automatica.
6. Chat de teste no painel e respostas estritamente baseadas na base por padrao.
7. Widget flutuante e embutivel, com chave por ambiente e dominio permitido.
8. Configuracao visual, privacidade, identificacao do visitante, retencao e encaminhamento.
9. Lacunas, feedback, historico limitado, metricas e auditoria.
10. Chave OpenAI por tenant, com teste, criptografia, reutilizacao opcional entre ambientes, substituicao e uso/custo segregados.
11. Catalogo curto de modelos administrado pelo Master; cada tenant escolhe apenas entre modelos liberados.

## Fora do MVP

- Execucao de acoes ou leitura de dados de sistemas externos.
- Cobranca, assinatura e autoatendimento comercial.
- Audio, video, imagem, planilha e sincronizacao de APIs.
- Login integrado a sistemas externos (SSO).
- Atendimento humano nativo e canais de mensagem: entram depois do MVP, na Fase 3 (ADR-006).

## Evolucao

| Fase | Entrega                                                                                 |
| ---- | --------------------------------------------------------------------------------------- |
| 0    | Documentacao, Docker local, painel Master, fundacao multi-tenant e autenticacao propria |
| 1    | Base de conhecimento, RAG e chat de teste interno                                       |
| 2    | Widget externo, chaves, dominios e identificacao opcional                               |
| 3    | Atendimento omnichannel e CRM de contatos (ADR-006), em etapas — ver abaixo             |
| 4    | Governanca SaaS: planos, limites, autoatendimento, cobranca e SSO                       |
| 5    | Acoes autorizadas do assistente e conectores de dados de sistemas externos              |

A Fase 3 era "Governanca SaaS" e os canais estavam na antiga Fase 4; o ADR-006 trouxe os canais para antes da governanca, porque sem atendimento humano e canais o tenant precisa de outra ferramenta para atender o que a IA nao resolve.

## Fase 3: atendimento omnichannel e CRM (ADR-006)

| Etapa | Entrega                                                                                              | Depende de |
| ----- | ---------------------------------------------------------------------------------------------------- | ---------- |
| 1     | ADR-006 e documentacao do novo escopo                                                                | —          |
| 2     | Tempo real e caixa de entrada compartilhada: status, atribuicao, notas internas e respostas prontas  | 1          |
| 3     | CRM de contatos: identidades por canal, etiquetas, campos personalizados, segmentos e importacao CSV | 1          |
| 4     | WhatsApp pela Cloud API oficial: conexao do tenant, webhook, templates, janela de 24h e recibos      | 2 e 3      |
| 5     | Telegram, Instagram Direct e Messenger, sobre a mesma camada de canal                                | 4          |
| 6     | Campanhas: publico por segmento, opt-in, agendamento, ritmo por organizacao e metricas               | 3 e 4      |
| 7     | Automacao sem codigo: fluxos deterministicos publicados por humano, com log de execucao              | 2 e 3      |
| 8     | Verificacao em duas etapas, exportacao de dados (LGPD), API publica com token e webhooks de saida    | —          |

Fora da Fase 3: e-commerce (Shopify, WooCommerce), agendamento de posts em redes sociais, e-mail e SMS como canal, e acoes do assistente em sistemas externos.

Etapas 4 e 5 dependem de passos que so o tenant (ou quem opera o deploy) pode fazer na Meta: criar o app, verificar a empresa e passar pela revisao de permissoes. Esses prazos nao sao controlados pelo codigo.

## Criterio de sucesso do MVP

Um administrador cria uma organizacao, um assistente e fontes; a base fica indexada; o assistente responde somente com aquele contexto; e o widget pode ser instalado em um dominio autorizado com uma chave revogavel.
