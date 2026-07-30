# ADR-003: Colecao e filtro opcional de restricao, nao pre-requisito de acesso

**Status:** Aceita

## Contexto

A hierarquia registrada em `workflows/rag-e-conhecimento.md` e
`organizacao -> assistente -> colecoes -> topicos -> fontes -> chunks`, e a
primeira implementacao traduziu isso literalmente: `listAccessibleTopicIds`
so devolvia topicos alcancaveis por uma colecao explicitamente vinculada ao
assistente (`assistant_collections`), com o comentario "nunca a base inteira
da organizacao".

A documentacao nunca definiu o que acontece quando **nao ha colecao
nenhuma** — e esse e exatamente o estado de qualquer tenant recem-criado.
Consequencia observada rodando o produto de verdade: com chave de IA valida,
topico criado, fonte indexada e `status = pronta`, o assistente respondia
sempre "nao encontrei essa informacao na base", porque a lista de topicos
acessiveis vinha vazia. Nao havia tela para criar colecao nem para vincular
colecao a assistente, entao nao existia caminho algum — pelo painel — para
sair desse estado. Na pratica o produto nascia incapaz de responder.

As saidas possiveis eram: (a) manter a regra e construir a UI de colecoes e
de vinculo assistente-colecao como pre-requisito de qualquer resposta, ou
(b) tratar colecao como restricao opcional.

## Decisao

Colecao passa a ser um **filtro opcional de restricao**, nao um
pre-requisito de acesso:

- Assistente **sem nenhuma** linha em `assistant_collections`: consulta
  todos os topicos da propria organizacao.
- Assistente **com** colecoes vinculadas: consulta apenas os topicos dessas
  colecoes. Se as colecoes vinculadas nao contiverem topico algum, o
  resultado e vazio — vinculo existente e restricao explicita do tenant e
  nao deve ser reinterpretado como "base inteira".

`organization_id` continua sendo a unica fronteira de seguranca e nunca e
atravessado; `listAccessibleTopicIds` passou a receber `organizationId`
explicitamente para tornar esse escopo obrigatorio na assinatura, em vez de
implicito pelo caminho das colecoes.

## Consequencias

- Um tenant novo responde a partir da base assim que tiver chave de IA e uma
  fonte indexada, sem configuracao adicional.
- Colecao vira ferramenta de curadoria (restringir um assistente a um
  recorte da base), nao burocracia de ativacao.
- Contraria o comentario de codigo anterior ("nunca a base inteira da
  organizacao") — por isso este ADR, em vez de edicao silenciosa.
- A UI de colecoes e de vinculo assistente-colecao continua nao existindo e
  deixa de ser bloqueante; quando for construida, apenas passa a permitir
  restringir o que hoje ja funciona por padrao.
- Quem quiser o comportamento restritivo desde o inicio precisa criar a
  colecao e vincular explicitamente ao assistente (hoje so via API).
