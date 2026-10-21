# ADR-005: Provedor de IA da plataforma configuravel por .env

**Status:** Aceita

## Contexto

Ate aqui a unica fonte de IA era a chave BYOK da OpenAI cadastrada por cada
tenant (ADR-002 #1). Isso deixava duas lacunas:

- Sem chave cadastrada, nada funcionava: fontes ficavam em
  `aguardando_ativacao`, o playground e o widget respondiam "nao consigo
  responder". Quem clona o projeto para avaliar nao tinha como ver o fluxo de
  RAG sem antes conseguir uma chave paga.
- O catalogo de modelos ja listava modelos da Anthropic, mas o unico adapter
  era o da OpenAI. Escolher um Claude no assistente quebrava o chat.

A Anthropic nao oferece API de embeddings, entao "trocar de provedor" nao pode
significar trocar chat e embeddings juntos.

## Decisao

1. **Chat e embeddings sao resolvidos separadamente** (`ChatProvider` e
   `EmbeddingProvider` em `backend/src/modules/rag/provider.types.ts`).
2. **Chat** (`AI_PROVIDER`):
   - `openai` — `OPENAI_API_KEY`, modelo `OPENAI_CHAT_MODEL`;
   - `anthropic` — `ANTHROPIC_API_KEY`, modelo `ANTHROPIC_MODEL`;
   - `local` — sem LLM: a resposta e o trecho mais relevante, com a citacao.
     Existe para demonstracao e desenvolvimento sem chave.
   A chave BYOK do tenant continua tendo prioridade quando o assistente usa um
   modelo da OpenAI.
3. **Embeddings** (`EMBEDDING_PROVIDER`) sao do deploy inteiro, nunca do tenant:
   vetores de modelos diferentes na mesma coluna tornam a busca sem sentido.
   - `openai` — `text-embedding-3-small` (1536 dimensoes);
   - `local` — `Xenova/multilingual-e5-small` via transformers.js, rodando no
     container (384 dimensoes, completadas com zeros ate 1536 — zeros nao
     alteram a distancia cosine);
   - `hash` — hashing de termos, deterministico e offline, para testes e CI.
   Sem valor explicito: `openai` quando ha `OPENAI_API_KEY`, senao `local`.
4. Cada provedor de embeddings tem seu proprio limiar de relevancia: as
   distancias cosine se distribuem em faixas diferentes por modelo.
5. Nenhuma chave fica no codigo nem no Git: so no `.env`, documentado com
   valores ficticios em `.env.example`.

## Consequencias

- `docker compose up` funciona sem nenhuma chave (modo `local`), e com uma
  chave da OpenAI ou da Anthropic o mesmo deploy passa a gerar respostas.
- Trocar `EMBEDDING_PROVIDER` depois de indexar exige reindexar as fontes.
- A chave da plataforma e cobrada de quem opera o deploy, nao do tenant; em
  um SaaS real isso pede limite de uso por tenant (fora do escopo deste ADR).
