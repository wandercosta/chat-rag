# Operacao e observabilidade

## Eventos minimos

- upload, inicio/fim/erro de indexacao;
- consulta RAG, latencia, modelo, tokens e custo estimado;
- resposta sem contexto e lacuna criada;
- widget carregado, chave/dominio rejeitado e rate limit;
- feedback, encaminhamento e revogacao de chave;
- execucao do job de retencao (organizacao, quantidade expurgada/anonimizada, timestamp), sem conteudo de conversa (ver ADR-002).

## Painel de metricas

Exibir por organizacao e assistente: conversas, mensagens, avaliacoes, lacunas, fontes consultadas, indexacoes com erro, latencia e consumo estimado.

Na plataforma (Master, `/plataforma`): conversas por canal, mensagens recebidas, perguntas ao assistente, respostas sem contexto, respostas de atendentes e latencia media, no total e por organizacao. Custo estimado em dolar (total e a parte paga pela plataforma), pelos tokens de cada resposta e o preco por modelo definido pelo Master; modelos sem preco aparecem listados e ficam fora da conta. Tokens de embeddings ainda nao entram.

Limite mensal da IA da plataforma por tenant (ADR-007): `PLATFORM_AI_MONTHLY_TOKENS` no `.env` e o padrao (vazio = sem limite), e o Master ajusta por tenant no detalhe da organizacao. Acima do teto, a resposta vira extrativa (trecho da base com a fonte, sem chamar o modelo) e o evento `rag_query` grava `limitReached: true`; os administradores do tenant recebem um e-mail na primeira vez no mes (se houver SMTP).

## Alertas futuros

Falha recorrente de indexacao, erro do provedor, uso anormal, chave abusada e indisponibilidade do widget. Canais de alerta serao configuraveis; o MVP mantem fila no painel como destino minimo para lacunas/feedbacks.
