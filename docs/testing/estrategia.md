# Estrategia de testes

Antes de publicar qualquer modulo, cobrir:

- isolamento de organizacao e autorizacao;
- revogacao de chave e restricao de dominio;
- RAG sem vazamento entre colecoes/assistentes;
- comportamento sem contexto e criacao de lacuna;
- ingestao, reindexacao e falha de extracao;
- token de contexto assinado e expirado;
- configuracao de privacidade e retencao;
- widget em modo flutuante e embutido.

Testes de contrato devem proteger API do painel e widget. Testes de avaliacao RAG usarao conjunto pequeno, versionado e sem dados sensiveis para medir relevancia, ausencia de alucinacao e encaminhamento correto.

## Gate de CI (ADR-002)

Testes de isolamento de organizacao e testes de contrato (painel/widget) sao bloqueio obrigatorio de merge/deploy. O conjunto de avaliacao RAG roda em cadencia mais espacada (agendado ou pre-release), nao em cada PR, para manter o CI do MVP rapido sem abrir mao da avaliacao periodica.
