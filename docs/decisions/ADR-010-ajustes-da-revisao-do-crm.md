# ADR-010: Ajustes da revisao do CRM (funil padrao e retencao das classificacoes)

**Status:** Aceita

## Contexto

A revisao de codigo dos PRs do funil, das tarefas, da classificacao de leads
e do envio de arquivo (#25 a #28) achou duas regras escritas nos ADRs que se
contradiziam com outras regras dos mesmos ADRs:

- O ADR-008 #2 diz que o primeiro funil "nasce na primeira leitura". O
  ADR-008 #5 diz que o Master nao cria nada em nome do tenant, e o Analista so
  le. Na pratica, a leitura do Master em sessao de suporte (ou do Analista)
  criava o funil "Vendas" e as seis etapas no tenant, sem auditoria.
- O ADR-009 #7 diz que a classificacao "segue o prazo de retencao da
  organizacao" porque guarda um resumo da conversa. Mas a conversa pode ter
  prazo menor, definido no assistente. Com o prazo da organizacao, o resumo
  ficava depois de a conversa ja ter sido apagada.

## Decisao

1. **Funil padrao:** nasce na primeira leitura de quem pode usar o funil
   (Administrador ou Atendente membro). Leitura do Analista ou do Master em
   sessao de suporte devolve a lista como esta, vazia se o tenant nunca usou o
   funil; o painel mostra que o funil ainda nao foi criado. Substitui a frase
   do ADR-008 #2.
2. **Retencao da classificacao:** sai pelo menor prazo entre o da organizacao
   e o dos assistentes dela, ou seja, nunca depois da conversa mais curta de
   onde pode ter vindo. Substitui a regra de prazo do ADR-009 #7; o resto do
   item continua (sai junto com o contato).

## Consequencias

- O Master continua so lendo o funil (ADR-008 #5), agora sem efeito colateral.
- Um tenant com assistente de prazo curto perde as classificacoes antigas mais
  cedo. E o comportamento esperado para um resumo de conversa (minimizacao).
- Os outros ajustes da mesma revisao sao correcoes de implementacao, sem
  mudar decisao; estao na especificacao do backend e nos contratos.
