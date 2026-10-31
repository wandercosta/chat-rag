import type { ColumnType, Generated } from "kysely";

export type TenantStatus = "ativo" | "suspenso";
export type TenantRole = "Administrador" | "Editor de base" | "Analista" | "Atendente";
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
export type ConversationChannel =
  "widget" | "whatsapp" | "playground" | "telegram" | "instagram" | "messenger";
export type ChannelProvider = "whatsapp" | "telegram" | "instagram" | "messenger";
export type DeliveryStatus = "enviando" | "enviada" | "entregue" | "lida" | "falhou";
export type MessageRole = "visitante" | "assistente" | "atendente";
export type InboxStatus = "aberta" | "pendente" | "resolvida";
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
  totp_secret: ColumnType<
    import("../crypto/envelope.js").SerializedEnvelope | null,
    string | null | undefined,
    string | null
  >;
  totp_pending: ColumnType<
    import("../crypto/envelope.js").SerializedEnvelope | null,
    string | null | undefined,
    string | null
  >;
  totp_enabled_at: Date | null;
  recovery_codes: ColumnType<
    string[],
    string | undefined,
    string | import("kysely").RawBuilder<unknown>
  >;
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
  widget_settings: ColumnType<WidgetSettings, string | undefined, string>;
  human_inbox_enabled: Generated<boolean>;
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
  contact_id: string | null;
  channel_connection_id: string | null;
  channel: ConversationChannel;
  started_at: ColumnType<Date, string | undefined, never>;
}

export interface MessagesTable {
  id: Generated<string>;
  conversation_id: string;
  role: MessageRole;
  content: string;
  citations: ColumnType<MessageCitation[], string | undefined, string>;
  author_user_id: string | null;
  provider_message_id: string | null;
  delivery_status: DeliveryStatus | null;
  delivery_error: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
}

export type AttachmentKind = "imagem" | "audio" | "video" | "documento" | "figurinha";
export type AttachmentStatus = "pendente" | "pronto" | "falhou";

export interface MessageAttachmentsTable {
  id: Generated<string>;
  organization_id: string;
  message_id: string;
  kind: AttachmentKind;
  mime_type: string | null;
  file_name: string | null;
  size_bytes: number | null;
  storage_key: string | null;
  status: ColumnType<AttachmentStatus, AttachmentStatus | undefined>;
  error: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface ChannelConnectionsTable {
  id: Generated<string>;
  organization_id: string;
  assistant_id: string;
  provider: ChannelProvider;
  name: string;
  external_id: string;
  config: ColumnType<Record<string, string>, string | undefined, string>;
  secret: ColumnType<import("../crypto/envelope.js").SerializedEnvelope, string, string>;
  secret_hint: string;
  verify_token: string;
  status: ColumnType<"ativo" | "erro" | "inativo", "ativo" | "erro" | "inativo" | undefined>;
  status_detail: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export interface ChannelTemplatesTable {
  id: Generated<string>;
  organization_id: string;
  connection_id: string;
  name: string;
  language: string;
  category: string | null;
  status: string;
  body: string;
  variables: number;
  synced_at: ColumnType<Date, string | undefined, string>;
}

export interface ConversationAssignmentsTable {
  conversation_id: string;
  organization_id: string;
  status: InboxStatus;
  assigned_user_id: string | null;
  sector_id: string | null;
  requested_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export interface InboxSectorsTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface InboxSectorMembersTable {
  sector_id: string;
  user_id: string;
  organization_id: string;
}

export interface ConversationNotesTable {
  id: Generated<string>;
  organization_id: string;
  conversation_id: string;
  author_user_id: string | null;
  content: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export type ContactChannel = "widget" | "whatsapp" | "telegram" | "instagram" | "messenger";
export type ContactFieldType = "texto" | "numero" | "data";

export interface ContactsTable {
  id: Generated<string>;
  organization_id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  custom_fields: ColumnType<Record<string, string>, string | undefined, string>;
  opt_in_at: Date | null;
  opt_in_source: string | null;
  opted_out_at: Date | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export interface ContactIdentitiesTable {
  id: Generated<string>;
  organization_id: string;
  contact_id: string;
  channel: ContactChannel;
  value: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface ContactTagsTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  color: Generated<string>;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface ContactTagLinksTable {
  contact_id: string;
  tag_id: string;
}

export interface ContactFieldsTable {
  id: Generated<string>;
  organization_id: string;
  key: string;
  label: string;
  type: ContactFieldType;
  created_at: ColumnType<Date, string | undefined, never>;
}

/** Filtro salvo de contatos. Todos os criterios presentes precisam valer. */
export interface ContactFilter {
  search?: string;
  tagIds?: string[];
  tagMatch?: "any" | "all";
  optIn?: boolean;
  fields?: { key: string; value: string }[];
}

export interface ContactSegmentsTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  filter: ColumnType<ContactFilter, string, string>;
  created_at: ColumnType<Date, string | undefined, never>;
}

export type CampaignStatus = "rascunho" | "agendada" | "enviando" | "concluida" | "cancelada";
export type RecipientStatus = "pendente" | "enviada" | "falhou" | "ignorada";

export interface CampaignsTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  connection_id: string | null;
  segment_id: string | null;
  audience_filter: ColumnType<ContactFilter | null, string | null | undefined, string | null>;
  template_id: string | null;
  template_params: ColumnType<string[], string | undefined, string>;
  text: string | null;
  status: ColumnType<CampaignStatus, CampaignStatus | undefined, CampaignStatus>;
  rate_per_minute: ColumnType<number, number | undefined, number>;
  scheduled_at: Date | null;
  started_at: Date | null;
  finished_at: Date | null;
  created_by: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface CampaignRecipientsTable {
  id: Generated<string>;
  organization_id: string;
  campaign_id: string;
  contact_id: string;
  address: string;
  status: ColumnType<RecipientStatus, RecipientStatus | undefined, RecipientStatus>;
  message_id: string | null;
  error: string | null;
  sent_at: Date | null;
}

export interface AutomationRulesTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  enabled: ColumnType<boolean, boolean | undefined, boolean>;
  trigger: "mensagem_recebida" | "sem_resposta";
  conditions: ColumnType<import("../modules/automations/rules.js").Condition[], string, string>;
  actions: ColumnType<import("../modules/automations/rules.js").Action[], string, string>;
  version: ColumnType<number, number | undefined, number>;
  updated_by: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export interface AutomationRunsTable {
  id: Generated<string>;
  organization_id: string;
  rule_id: string;
  rule_version: number;
  conversation_id: string | null;
  status: "ok" | "erro";
  detail: ColumnType<string, string | undefined, string>;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface CannedResponsesTable {
  id: Generated<string>;
  organization_id: string;
  title: string;
  content: string;
  created_at: ColumnType<Date, string | undefined, never>;
}

export interface MessageCitation {
  index: number;
  sourceId: string;
  sourceTitle: string;
  excerpt: string;
}

export interface WidgetSettings {
  title?: string;
  greeting?: string;
  accentColor?: string;
  position?: "bottom-right" | "bottom-left";
  theme?: "light" | "dark" | "sync";
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

export interface ApiTokensTable {
  id: Generated<string>;
  organization_id: string;
  name: string;
  token_prefix: string;
  token_hash: string;
  scopes: ColumnType<string[], string, string>;
  created_by: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  last_used_at: Date | null;
  revoked_at: Date | null;
}

export interface WebhookEndpointsTable {
  id: Generated<string>;
  organization_id: string;
  url: string;
  events: ColumnType<string[], string, string>;
  secret: ColumnType<import("../crypto/envelope.js").SerializedEnvelope, string, string>;
  enabled: Generated<boolean>;
  created_by: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  updated_at: ColumnType<Date, string | undefined, string>;
}

export type WebhookDeliveryStatus = "pendente" | "entregue" | "falhou";

export interface WebhookDeliveriesTable {
  id: Generated<string>;
  organization_id: string;
  endpoint_id: string;
  event: string;
  payload: ColumnType<Record<string, unknown>, string, string>;
  status: Generated<WebhookDeliveryStatus>;
  attempts: Generated<number>;
  last_status_code: number | null;
  last_error: string | null;
  created_at: ColumnType<Date, string | undefined, never>;
  delivered_at: Date | null;
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
  message_attachments: MessageAttachmentsTable;
  feedbacks: FeedbacksTable;
  knowledge_gaps: KnowledgeGapsTable;
  source_chunks: SourceChunksTable;
  embed_keys: EmbedKeysTable;
  allowed_domains: AllowedDomainsTable;
  support_access_sessions: SupportAccessSessionsTable;
  handoff_configs: HandoffConfigsTable;
  usage_events: UsageEventsTable;
  conversation_assignments: ConversationAssignmentsTable;
  inbox_sectors: InboxSectorsTable;
  inbox_sector_members: InboxSectorMembersTable;
  conversation_notes: ConversationNotesTable;
  canned_responses: CannedResponsesTable;
  contacts: ContactsTable;
  contact_identities: ContactIdentitiesTable;
  contact_tags: ContactTagsTable;
  contact_tag_links: ContactTagLinksTable;
  contact_fields: ContactFieldsTable;
  contact_segments: ContactSegmentsTable;
  channel_connections: ChannelConnectionsTable;
  channel_templates: ChannelTemplatesTable;
  campaigns: CampaignsTable;
  campaign_recipients: CampaignRecipientsTable;
  automation_rules: AutomationRulesTable;
  automation_runs: AutomationRunsTable;
  api_tokens: ApiTokensTable;
  webhook_endpoints: WebhookEndpointsTable;
  webhook_deliveries: WebhookDeliveriesTable;
}
