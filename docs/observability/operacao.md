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

Na plataforma (Master, `/plataforma`): conversas por canal, mensagens recebidas, perguntas ao assistente, respostas sem contexto, respostas de atendentes e latencia media, no total e por organizacao. Custo estimado entra quando houver tabela de precos por modelo.

## Alertas futuros

Falha recorrente de indexacao, erro do provedor, uso anormal, chave abusada e indisponibilidade do widget. Canais de alerta serao configuraveis; o MVP mantem fila no painel como destino minimo para lacunas/feedbacks.
