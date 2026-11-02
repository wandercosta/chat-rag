# ADR-007: Limite mensal de uso da IA da plataforma por tenant

**Status:** Aceita

## Contexto

O ADR-005 deixou a chave de IA da plataforma (`.env`) responder por qualquer
tenant sem chave propria e registrou como consequencia: "em um SaaS real isso
pede limite de uso por tenant (fora do escopo deste ADR)". Desde entao cada
resposta grava os tokens, o modelo e o dono da chave (`keySource`) no evento
`rag_query`, e o Master define o preco por modelo para o custo estimado. Ainda
assim, nada impedia um tenant de consumir sem teto a chave paga por quem opera
o deploy.

## Decisao

1. **O que conta:** so tokens de chat (entrada + saida) de respostas geradas
   com a chave da plataforma (`keySource = plataforma`). Chave BYOK do tenant
   nao conta: quem paga e o proprio tenant. Embeddings ficam fora (sao do
   deploy, ADR-005, e ja limitados pelo tamanho das fontes).
2. **Unidade e periodo:** tokens por mes civil (UTC). Tokens e nao dolares,
   porque o preco depende do catalogo e um modelo sem preco escaparia do teto.
3. **Quem define:** o Master, por tenant, em tres modos:
   - `padrao` — vale `PLATFORM_AI_MONTHLY_TOKENS` do `.env` (sem o valor, sem
     limite);
   - `personalizado` — um numero de tokens proprio do tenant;
   - `sem_limite` — explicito, para clientes que pagam por fora.
   O tenant ve o consumo e o teto, mas nao altera.
4. **Ao atingir o teto,** o assistente nao para: passa a responder no modo
   extrativo (o trecho mais relevante da base, com a citacao, ADR-005), que
   nao chama o provedor e nao custa nada. A resposta continua ancorada na base.
   Volta ao normal quando o mes vira ou o Master aumenta o limite. O evento
   `rag_query` registra `limitReached: true`.
5. **Aviso:** na primeira resposta acima do teto no mes, os administradores do
   tenant recebem um e-mail (se a plataforma tiver SMTP), sem dado de conversa.
   O painel do tenant e o detalhe do tenant no Master mostram consumo e teto.
6. **Limite brando:** a verificacao acontece antes de chamar o modelo; respostas
   simultaneas perto do teto podem passar um pouco dele. Aceito: o custo extra
   e de poucas respostas e evita trava distribuida no caminho do chat.

## Consequencias

- O Master consegue oferecer IA inclusa com teto e saber quanto cada tenant
  consome sem abrir sessao de suporte (so contagens, sem conteudo).
- Um tenant que precise de mais tem tres saidas: cadastrar a propria chave
  (BYOK), pedir aumento ao Master ou aceitar o modo extrativo ate o mes virar.
- Somar os tokens do mes a cada resposta usa o indice
  `usage_events(organization_id, created_at)`; se virar gargalo, o proximo
  passo e um contador em Redis, sem mudar esta decisao.
