# ADR-008: Funil de vendas (negocios em kanban) e tarefas

**Status:** Aceita

## Contexto

O ADR-006 levou o produto a atendimento omnichannel com CRM de contatos:
contato unico por pessoa, etiquetas, campos, segmentos, campanhas e
automacoes. Faltava a parte comercial que se espera de um CRM: acompanhar uma
oportunidade de venda do primeiro contato ao fechamento e lembrar quem precisa
fazer o que e quando. Sem isso, o tenant usa uma planilha ou outro sistema ao
lado e o historico da conversa fica separado do negocio.

## Decisao

1. **Negocio (`deals`)** e uma oportunidade ligada a um contato da
   organizacao: titulo, valor opcional (centavos, BRL), responsavel, previsao
   de fechamento, etapa e posicao dentro da etapa. O contato e opcional so
   para nao perder o negocio quando o contato e excluido (LGPD): a exclusao do
   contato desliga o negocio dele, nao apaga.
2. **Funis e etapas** sao configuracao da organizacao (`pipelines`,
   `pipeline_stages`), nao codigo. O primeiro funil nasce na primeira leitura
   com etapas padrao (Novo, Qualificado, Proposta, Negociacao, Ganho, Perdido).
   Toda etapa tem um tipo: `aberta`, `ganho` ou `perdido`; mover para uma
   etapa de ganho ou perda fecha o negocio (data de fechamento; perda pede
   motivo opcional). Cada funil tem ao menos uma etapa de cada tipo.
3. **Kanban:** o painel mostra as etapas como colunas e o negocio e arrastado
   entre elas. Cada mudanca de etapa fica no historico do negocio
   (`deal_stage_changes`: de, para, quem, quando), base para conversao e tempo
   por etapa.
4. **Tarefas (`tasks`)**: titulo, prazo, responsavel e ligacao opcional com um
   contato e/ou um negocio. Concluir registra quem e quando. No prazo, o
   worker avisa o responsavel uma vez (tempo real no painel e e-mail se houver
   SMTP), sem conteudo do contato no e-mail.
5. **Papeis:** Administrador e Atendente criam, editam e movem negocios e
   tarefas; Analista so le; Editor de base nao ve. Funis e etapas so o
   Administrador. O Master nao ve nada disso sem sessao de suporte, e com ela
   so le (como a caixa de entrada).
6. **Isolamento e auditoria:** tudo tem `organization_id`; contato, etapa,
   responsavel e negocio citados numa escrita precisam ser da mesma
   organizacao (senao 422). Criar, mover, ganhar, perder e excluir negocio
   vao para a auditoria com o id, nunca com nome do contato ou valor.
7. **Fora deste ADR:** previsao de receita, metas por vendedor, produtos e
   orcamentos. Integracao com e-commerce continua fora (ADR-006 #12).

## Consequencias

- O contato passa a mostrar negocios e tarefas ao lado das conversas; o
  atendente cria o negocio de dentro da conversa.
- A classificacao de leads com IA (ADR-009) pode sugerir etapa ou
  temperatura de um negocio sem que a IA mova nada sozinha.
- Exportacao LGPD da organizacao passa a incluir negocios e tarefas.
