# RAG e base de conhecimento

## Hierarquia

`organizacao -> assistente -> colecoes -> topicos -> fontes -> chunks`

Uma fonte pode pertencer a colecoes reutilizaveis. O acesso efetivo e sempre a intersecao das permissoes da organizacao, do assistente, da colecao/fonte e do usuario administrativo.

## Fontes do MVP

- Texto manual.
- PDF.
- DOCX.
- URL de pagina.

Cada fonte tem titulo, topico, origem, estado de indexacao, metadados, visibilidade e data de atualizacao.

## Estados

`rascunho -> aguardando_revisao? -> fila -> processando -> pronta | erro | arquivada`

A exigencia de revisao antes de publicar e configuravel por assistente. Alteracoes em fonte publicada criam nova indexacao; a versao formal do documento fica fora do MVP, mas os eventos de auditoria devem permitir rastrear a mudanca.

## Conversa natural

O visitante nao ve chunks, scores ou citacoes no MVP. O sistema guarda internamente referencias da resposta para auditoria e diagnostico.

## Lacunas

Uma pergunta sem contexto suficiente cria/atualiza uma lacuna normalizada, com contador, assistente, organizacao e status. A equipe pode marcar como resolvida apos melhorar a base.
