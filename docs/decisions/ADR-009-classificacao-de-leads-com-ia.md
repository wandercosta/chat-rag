# ADR-009: Classificacao de leads com IA (sugestao revisada por humano)

**Status:** Aceita

## Contexto

Com o funil de vendas (ADR-008), o tenant quer saber quais contatos estao
mais perto de comprar sem ler todas as conversas. Ate aqui a IA so responde
ao visitante a partir da base de conhecimento (ADR-001, ADR-005) e nao decide
acoes (ADR-006 #3). Classificar uma pessoa a partir do que ela escreveu e um
uso novo: e tratamento de dado pessoal para perfilamento, e a LGPD (art. 20)
garante revisao de decisao tomada so por tratamento automatizado.

## Decisao

1. **Opt-in por organizacao:** a classificacao vem desligada. So o
   Administrador liga, em Configuracoes; desligada, nenhuma conversa e enviada
   ao modelo para isso.
2. **Sob demanda:** Administrador ou Atendente pede "Classificar com IA" no
   contato (ou a partir de um negocio dele). Nada roda sozinho em segundo
   plano nesta versao.
3. **Entrada minima:** so o texto das conversas recentes do contato (ultimas
   mensagens, com teto de caracteres), sem e-mail, telefone ou campos do CRM.
   O texto vai num bloco delimitado e o modelo e instruido a tratar o conteudo
   como dado, nunca como instrucao (injecao de prompt).
4. **Saida fechada:** JSON validado com esquema: temperatura (`quente`,
   `morno`, `frio`), confianca (`baixa`, `media`, `alta`), interesse, proximo
   passo sugerido e resumo, cada texto com limite de tamanho. Resposta fora do
   esquema e descartada, nao corrigida.
5. **Sugestao, nunca decisao:** o resultado fica como `sugerida` ate alguem
   aceitar ou descartar (`lead_insights`, com quem revisou e quando). Aceita,
   vira a classificacao atual do contato. A IA nao move negocio, nao muda
   contato, etiqueta ou campanha e nao fala com o cliente por causa disso.
6. **Modelo e custo:** usa a mesma resolucao de provedor das respostas
   (chave BYOK do tenant se houver, senao a da plataforma) e o consumo entra
   no limite mensal da IA da plataforma (ADR-007). Com o limite atingido ou o
   provedor em modo local (sem LLM), a classificacao fica indisponivel (409).
7. **Retencao e exclusao:** a classificacao guarda um resumo da conversa,
   entao segue o prazo de retencao da organizacao e sai junto com o contato.
   Entra na exportacao LGPD. A auditoria registra quem classificou, aceitou ou
   descartou, com o id, nunca o conteudo.
8. **Papeis:** Administrador e Atendente classificam e revisam; Analista ve;
   Master nao classifica (so le com sessao de suporte).

## Consequencias

- O funil ganha um sinal de prioridade sem tirar a decisao das pessoas.
- Classificar em lote ou automaticamente ao resolver conversa fica para um
  ADR futuro, se o uso mostrar que vale o custo.
