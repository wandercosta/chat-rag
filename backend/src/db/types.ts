import type { ColumnType, Generated } from "kysely";

export type TenantStatus = "ativo" | "suspenso";
export type TenantRole = "Administrador" | "Editor de base" | "Analista";
export type AuditType = "acesso" | "configuracao" | "conteudo" | "seguranca";
export type CredentialEnvironment = "teste" | "producao" | "ambos";
export type CredentialStatus = "valida" | "invalida" | "substituida" | "removida";
export type AssistantStatus = "publicado" | "rascunho" | "pausado";
export type ResponseMode = "estrita";
export type SourceKind = "texto" | "PDF" | "DOCX" | "URL";
export type SourceStatus =
  | "rascunho"
  | "aguardando_revisao"
  | "aguardando_ativacao"
  | "fila"
  | "processando"
  | "pronta"
  | "erro"
  | "arquivada";
export type ConversationChannel = "widget" | "whatsapp" | "playground";
export type MessageRole = "visitante" | "assistente";
export type FeedbackRating = "positivo" | "negativo";
export type GapStatus = "pendente" | "resolvida";
export type EmbedKeyStatus = "ativa" | "revogada";

export interface OrganizationsTable {
  id: Generated<string>;
  name: string;
  slug: string;
  status: TenantStatus;
  retention_days: number | null;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface UsersTable {
  id: Generated<string>;
  email: string;
  password_hash: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface MembershipsTable {
  id: Generated<string>;
  user_id: string;
  organization_id: string;
  role: TenantRole;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface PlatformRolesTable {
  user_id: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface AuditEventsTable {
  id: Generated<string>;
  actor_user_id: string | null;
  organization_id: string | null;
  action: string;
  type: AuditType;
  target: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface TenantAiCredentialsTable {
  id: Generated<string>;
  organization_id: string;
  environment: CredentialEnvironment;
  status: CredentialStatus;
  masked: string;
  ciphertext: Buffer;
  iv: Buffer;
  auth_tag: Buffer;
  wrapped_dek: Buffer;
  dek_iv: Buffer;
  dek_auth_tag: Buffer;
  kek_version: number;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export interface AiModelCatalogTable {
  id: string;
  label: string;
  note: string | null;
  enabled: boolean;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface TenantAllowedModelsTable {
  organization_id: string;
  model_id: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface AssistantsTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  status: AssistantStatus;
  model_id: string;
  response_mode: ResponseMode;
  instructions: string | null;
  retention_days: number | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export interface KnowledgeCollectionsTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  description: string | null;
  requires_review: boolean;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface AssistantCollectionsTable {
  assistant_id: string;
  collection_id: string;
}

export interface TopicsTable {
  id: Generated<string>;
  organization_id: string;
  collection_id: string | null;
  name: string;
  description: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface SourcesTable {
  id: Generated<string>;
  organization_id: string;
  topic_id: string;
  title: string;
  kind: SourceKind;
  status: SourceStatus;
  origin_url: string | null;
  raw_text: string | null;
  storage_key: string | null;
  error_message: string | null;
  chunk_count: Generated<number>;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export interface VisitorsTable {
  id: Generated<string>;
  organization_id: string;
  external_user_id: string | null;
  name: string | null;
  email: string | null;
  context: unknown;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface ConversationsTable {
  id: Generated<string>;
  organization_id: string;
  assistant_id: string;
  visitor_id: string | null;
  channel: ConversationChannel;
  started_at: ColumnType<Date, string | undefined, never>;
}

export interface MessagesTable {
  id: Generated<string>;
  conversation_id: string;
  role: MessageRole;
  content: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface FeedbacksTable {
  id: Generated<string>;
  conversation_id: string;
  rating: FeedbackRating;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface KnowledgeGapsTable {
  id: Generated<string>;
  organization_id: string;
  assistant_id: string;
  question_normalized: string;
  original_question: string | null;
  context_snippet: string | null;
  frequency: Generated<number>;
  status: GapStatus;
  last_seen_at: ColumnType<Date, string | undefined, string>;
}

export interface SourceChunksTable {
  id: Generated<string>;
  organization_id: string;
  source_id: string;
  topic_id: string;
  content: string;
  // Coluna pgvector; manipulada via sql`` com cast ::vector nas queries que
  // escrevem/comparam embeddings (Kysely nao tem suporte nativo ao tipo).
  embedding: string;
  metadata: unknown;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface EmbedKeysTable {
  id: Generated<string>;
  organization_id: string;
  assistant_id: string;
  environment: "teste" | "producao";
  key_hash: string;
  masked: string;
  status: EmbedKeyStatus;
  created_at: ColumnType<Date, string | undefined, never>;
  revoked_at: ColumnType<Date, string | undefined, string> | null;
}

export interface AllowedDomainsTable {
  id: Generated<string>;
  embed_key_id: string;
  domain: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface SupportAccessSessionsTable {
  id: Generated<string>;
  master_user_id: string;
  organization_id: string;
  justification: string;
  started_at: ColumnType<Date, string | undefined, never>;
  expires_at: ColumnType<Date, string, never>;
  ended_at: ColumnType<Date, string | undefined, string> | null;
}

export interface HandoffConfigsTable {
  id: Generated<string>;
  organization_id: string;
  assistant_id: string;
  sector_name: string;
  phone_number: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export type UsageEventType =
  | "rag_query"
  | "no_context"
  | "indexing_completed"
  | "indexing_failed"
  | "widget_loaded"
  | "widget_rate_limited";

export interface UsageEventsTable {
  id: Generated<string>;
  organization_id: string;
  assistant_id: string | null;
  type: UsageEventType;
  payload: unknown;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface Database {
  organizations: OrganizationsTable;
  users: UsersTable;
  memberships: MembershipsTable;
  platform_roles: PlatformRolesTable;
  audit_events: AuditEventsTable;
  tenant_ai_credentials: TenantAiCredentialsTable;
  ai_model_catalog: AiModelCatalogTable;
  tenant_allowed_models: TenantAllowedModelsTable;
  assistants: AssistantsTable;
  knowledge_collections: KnowledgeCollectionsTable;
  assistant_collections: AssistantCollectionsTable;
  topics: TopicsTable;
  sources: SourcesTable;
  visitors: VisitorsTable;
  conversations: ConversationsTable;
  messages: MessagesTable;
  feedbacks: FeedbacksTable;
  knowledge_gaps: KnowledgeGapsTable;
  source_chunks: SourceChunksTable;
  embed_keys: EmbedKeysTable;
  allowed_domains: AllowedDomainsTable;
  support_access_sessions: SupportAccessSessionsTable;
  handoff_configs: HandoffConfigsTable;
  usage_events: UsageEventsTable;
}
