# RAG e base de conhecimento

## Hierarquia

`organizacao -> assistente -> colecoes -> topicos -> fontes -> chunks`

Uma fonte pode pertencer a colecoes reutilizaveis. O acesso efetivo e sempre a intersecao das permissoes da organizacao, do assistente, da colecao/fonte e do usuario administrativo.

Colecao e um filtro **opcional** de restricao, nao um pre-requisito (ADR-003): um assistente sem nenhuma colecao vinculada consulta toda a base da propria organizacao; com colecoes vinculadas, consulta apenas os topicos delas. `organization_id` continua sendo a unica fronteira de seguranca.

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

Uma pergunta sem contexto suficiente cria/atualiza uma lacuna normalizada, com contador, assistente, organizacao e status. A equipe pode marcar como resolvida apos melhorar a base, ou responder direto pelo painel — a resposta vira fonte de texto no topico escolhido e a lacuna e resolvida na mesma acao.

A lacuna guarda tres coisas diferentes de proposito: `question_normalized` (chave de agrupamento — numa pergunta de continuidade carrega a anterior junto, senao "e o CPF?" de conversas sem relacao alguma cairia tudo na mesma lacuna), `original_question` (o que o visitante digitou, que e o que a tela mostra) e `context_snippet` (os turnos anteriores). Sem o contexto, uma lacuna como "quantos filhos ele tem?" chega solta e quem for responder nao tem como saber de quem se falava.
