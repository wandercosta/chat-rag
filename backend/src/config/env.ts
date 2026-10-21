import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  PORT: z.coerce.number().default(3333),
  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),
  APP_MASTER_KEY: z.string().min(32, "APP_MASTER_KEY precisa ter pelo menos 32 caracteres"),
  SESSION_COOKIE_NAME: z.string().default("chatrag_session"),
  SESSION_TTL_HOURS: z.coerce.number().default(12),
  // Origem(ns) do painel autorizadas a mandar cookie de sessao entre portas
  // diferentes em dev (localhost:8080 -> localhost:3333). Lista separada por
  // virgula; nunca usar "*" aqui porque a rota usa credentials/cookie.
  CORS_ORIGIN: z.string().default("http://localhost:8080"),
  S3_ENDPOINT: z.string().min(1),
  S3_REGION: z.string().default("us-east-1"),
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_FORCE_PATH_STYLE: z.coerce.boolean().default(true),

  // Provedor de IA da plataforma (docs/decisions/ADR-005). A chave BYOK do
  // tenant, quando cadastrada no painel, continua tendo prioridade para chat.
  //   openai    -> chat via OpenAI (OPENAI_API_KEY)
  //   anthropic -> chat via Claude (ANTHROPIC_API_KEY)
  //   local     -> sem LLM: responde com o trecho mais relevante (demo sem chave)
  AI_PROVIDER: z.enum(["openai", "anthropic", "local"]).default("local"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().default("gpt-4o-mini"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-5-5"),
  // Embeddings sao globais do deploy (trocar exige reindexar as fontes).
  //   openai -> text-embedding-3-small
  //   local  -> modelo multilingue rodando no proprio container (sem chave)
  //   hash   -> vetor deterministico por hashing de termos (testes/CI, offline)
  EMBEDDING_PROVIDER: z.enum(["openai", "local", "hash"]).optional(),
  LOCAL_EMBEDDING_MODEL: z.string().default("Xenova/multilingual-e5-small"),

  // Pagina de demonstracao do widget (GET /demo) com a chave criada pelo seed.
  DEMO_WIDGET_KEY: z.string().optional(),
});

export const env = schema.parse(process.env);
