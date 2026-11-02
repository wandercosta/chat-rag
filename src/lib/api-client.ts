/**
 * Cliente do backend real (ver backend/README.md e docs/apis/contratos-planejados.md).
 * So cobre o que ja esta ligado no painel — mais rotas existem no backend e
 * podem ser adicionadas aqui seguindo o mesmo padrao conforme mais telas
 * saem do mock.
 */
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3333";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
    /** Corpo da resposta de erro (ex.: `twoFactorRequired` no login). */
    public body: Record<string, unknown> | null = null,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  // So manda Content-Type quando ha corpo JSON: Fastify rejeita (400) uma
  // requisicao com esse header e corpo vazio (ex.: POST /auth/logout), e num
  // upload multipart quem define o header (com boundary) tem que ser o browser.
  const headers =
    init.body && !(init.body instanceof FormData)
      ? { "Content-Type": "application/json", ...init.headers }
      : init.headers;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: "include",
    headers,
  });

  const isJson = response.headers.get("content-type")?.includes("application/json");
  const body = isJson ? await response.json().catch(() => null) : null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      body?.error ?? body?.message ?? `erro HTTP ${response.status}`,
      body,
    );
  }
  return body as T;
}

const get = <T>(path: string) => apiFetch<T>(path);
const post = <T>(path: string, body?: unknown) =>
  apiFetch<T>(path, { method: "POST", body: body ? JSON.stringify(body) : undefined });

// --- auth -------------------------------------------------------------

export interface AuthContext {
  userId: string;
  email: string;
  twoFactorEnabled: boolean;
  isPlatform: boolean;
  memberships: { organizationId: string; role: TenantRole }[];
}

export const authApi = {
  login: (email: string, password: string, code?: string) =>
    post<{ ok: true }>("/auth/login", { email, password, ...(code ? { code } : {}) }),
  logout: () => post<{ ok: true }>("/auth/logout"),
  me: () => get<{ auth: AuthContext }>("/auth/me"),
};

// --- organizations ------------------------------------------------------

export interface Organization {
  id: string;
  name: string;
  slug: string;
  status: "ativo" | "suspenso";
  retention_days: number | null;
  /** O que a retencao faz ao vencer o prazo. */
  retention_mode: "excluir" | "anonimizar";
  created_at: string;
}

export const organizationsApi = {
  getMine: (organizationId: string) => get<Organization>(`/organizations/${organizationId}`),
  setRetention: (
    organizationId: string,
    days: number | null,
    mode?: Organization["retention_mode"],
  ) =>
    apiFetch<{ ok: true }>(`/organizations/${organizationId}/retention`, {
      method: "PUT",
      body: JSON.stringify({ days, mode }),
    }),
};

// --- master: tenants ------------------------------------------------------

export interface CreateTenantInput {
  name: string;
  slug: string;
  adminEmail: string;
  adminPassword: string;
}

export interface SupportSession {
  id: string;
  master_user_id: string;
  organization_id: string;
  justification: string;
  started_at: string;
  expires_at: string;
  ended_at: string | null;
}

export const masterApi = {
  listTenants: () => get<Organization[]>("/master/tenants"),
  createTenant: (input: CreateTenantInput) =>
    apiFetch<{ organization: Organization; adminUser: { id: string; email: string } }>(
      "/master/tenants",
      {
        method: "POST",
        body: JSON.stringify(input),
      },
    ),
  setStatus: (organizationId: string, status: "ativo" | "suspenso") =>
    post<{ ok: true }>(`/master/tenants/${organizationId}/status`, { status }),
  listSupportSessions: (organizationId: string) =>
    get<SupportSession[]>(`/master/tenants/${organizationId}/support-sessions`),
  startSupportSession: (organizationId: string, justification: string, minutes: number) =>
    post<SupportSession>(`/master/tenants/${organizationId}/support-sessions`, {
      justification,
      minutes,
    }),
  endSupportSession: (organizationId: string, sessionId: string) =>
    post<{ ok: true }>(`/master/tenants/${organizationId}/support-sessions/${sessionId}/end`),
  /** Estado da chave de IA do tenant visto pelo Master: exige sessao de
   * suporte ativa e nunca devolve o valor da chave. */
  getTenantCredentials: (organizationId: string) =>
    get<CredentialStatus[]>(`/master/tenants/${organizationId}/ai-credentials`),
  listModelCatalog: () => get<CatalogModel[]>("/master/model-catalog"),
  /** Preco do modelo (US$ por 1M tokens); null tira o preco. */
  setModelPrice: (modelId: string, inputPerMTok: number | null, outputPerMTok: number | null) =>
    apiFetch<CatalogModel>(`/master/model-catalog/${encodeURIComponent(modelId)}/price`, {
      method: "PUT",
      body: JSON.stringify({ inputPerMTok, outputPerMTok }),
    }),
  listTenantModels: (organizationId: string) =>
    get<AllowedModel[]>(`/master/tenants/${organizationId}/allowed-models`),
  /** Lista vazia volta a valer o padrao da plataforma (catalogo ativo, ADR-004),
   * nao "nenhum modelo liberado". */
  setTenantModels: (organizationId: string, modelIds: string[]) =>
    apiFetch<{ ok: true }>(`/master/tenants/${organizationId}/allowed-models`, {
      method: "PUT",
      body: JSON.stringify({ modelIds }),
    }),
};

export interface CatalogModel {
  id: string;
  label: string;
  note: string | null;
  enabled: boolean;
  /** US$ por 1M tokens (texto decimal), ou null sem preco. */
  input_price_per_mtok?: string | null;
  output_price_per_mtok?: string | null;
}

// --- assistants ------------------------------------------------------

export interface Assistant {
  id: string;
  organization_id: string;
  name: string;
  status: "publicado" | "rascunho" | "pausado";
  model_id: string;
  response_mode: "estrita";
  instructions: string | null;
  retention_days: number | null;
  widget_settings: WidgetSettings;
  /** Pedido de atendente no widget cai na caixa de entrada do painel. */
  human_inbox_enabled: boolean;
  /** So responde com trechos de fontes revisadas. */
  reviewed_sources_only: boolean;
  created_at: string;
  updated_at: string;
}

/** Aparencia do widget definida no painel (atributos data-* do <script>
 * ainda podem sobrescrever cada campo no site hospedeiro). */
export interface WidgetSettings {
  title?: string;
  greeting?: string;
  accentColor?: string;
  position?: "bottom-right" | "bottom-left";
  theme?: "light" | "dark" | "sync";
  /** Logo do cabecalho (https). */
  logoUrl?: string;
}

export interface CreateAssistantInput {
  name: string;
  modelId: string;
  instructions?: string | null;
}

export interface UpdateAssistantInput {
  name?: string;
  status?: Assistant["status"];
  modelId?: string;
  instructions?: string | null;
  retentionDays?: number | null;
  widgetSettings?: WidgetSettings;
  humanInboxEnabled?: boolean;
  reviewedSourcesOnly?: boolean;
}

export const assistantsApi = {
  list: (organizationId: string) => get<Assistant[]>(`/organizations/${organizationId}/assistants`),
  get: (organizationId: string, assistantId: string) =>
    get<Assistant>(`/organizations/${organizationId}/assistants/${assistantId}`),
  create: (organizationId: string, input: CreateAssistantInput) =>
    post<Assistant>(`/organizations/${organizationId}/assistants`, input),
  update: (organizationId: string, assistantId: string, input: UpdateAssistantInput) =>
    apiFetch<Assistant>(`/organizations/${organizationId}/assistants/${assistantId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
};

export interface AllowedModel {
  id: string;
  label: string;
  note: string | null;
}

export const modelsApi = {
  listAllowed: (organizationId: string) =>
    get<AllowedModel[]>(`/organizations/${organizationId}/allowed-models`),
};

// --- handoff: whatsapp ------------------------------------------------

export interface HandoffConfig {
  id: string;
  organization_id: string;
  assistant_id: string;
  sector_name: string;
  phone_number: string;
  created_at: string;
}

export const handoffApi = {
  list: (organizationId: string, assistantId: string) =>
    get<HandoffConfig[]>(
      `/organizations/${organizationId}/assistants/${assistantId}/handoff-configs`,
    ),
  create: (
    organizationId: string,
    assistantId: string,
    input: { sectorName: string; phoneNumber: string },
  ) =>
    post<HandoffConfig>(
      `/organizations/${organizationId}/assistants/${assistantId}/handoff-configs`,
      input,
    ),
  remove: (organizationId: string, assistantId: string, configId: string) =>
    apiFetch<{ ok: true }>(
      `/organizations/${organizationId}/assistants/${assistantId}/handoff-configs/${configId}`,
      { method: "DELETE" },
    ),
};

// --- rag: playground ------------------------------------------------

/** Trecho e documento de origem que embasaram uma resposta do assistente. */
export interface Citation {
  index: number;
  sourceId: string;
  sourceTitle: string;
  excerpt: string;
}

export interface PlaygroundAnswer {
  conversationId: string;
  answer: string;
  usedContext: boolean;
  citations: Citation[];
}

export const playgroundApi = {
  send: (
    organizationId: string,
    assistantId: string,
    input: { message: string; conversationId?: string },
  ) =>
    post<PlaygroundAnswer>(
      `/organizations/${organizationId}/assistants/${assistantId}/playground-messages`,
      { ...input, environment: "teste" },
    ),
};

// --- knowledge: topics ------------------------------------------------

export interface Topic {
  id: string;
  organization_id: string;
  collection_id: string | null;
  name: string;
  description: string | null;
  created_at: string;
}

export interface CreateTopicInput {
  name: string;
  description?: string | null;
  collectionId?: string | null;
}

export const topicsApi = {
  list: (organizationId: string) => get<Topic[]>(`/organizations/${organizationId}/topics`),
  create: (organizationId: string, input: CreateTopicInput) =>
    post<Topic>(`/organizations/${organizationId}/topics`, input),
  update: (organizationId: string, topicId: string, input: Partial<CreateTopicInput>) =>
    apiFetch<Topic>(`/organizations/${organizationId}/topics/${topicId}`, {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
};

// --- knowledge: colecoes ------------------------------------------------

export interface Collection {
  id: string;
  name: string;
  description: string | null;
}

export interface CreateCollectionInput {
  name: string;
  description?: string | null;
  requiresReview?: boolean;
}

export const collectionsApi = {
  list: (organizationId: string) =>
    get<Collection[]>(`/organizations/${organizationId}/collections`),
  create: (organizationId: string, input: CreateCollectionInput) =>
    post<Collection>(`/organizations/${organizationId}/collections`, input),
  listForAssistant: (organizationId: string, assistantId: string) =>
    get<Collection[]>(`/organizations/${organizationId}/assistants/${assistantId}/collections`),
  link: (organizationId: string, assistantId: string, collectionId: string) =>
    apiFetch<{ ok: true }>(
      `/organizations/${organizationId}/assistants/${assistantId}/collections/${collectionId}`,
      { method: "PUT" },
    ),
  unlink: (organizationId: string, assistantId: string, collectionId: string) =>
    apiFetch<{ ok: true }>(
      `/organizations/${organizationId}/assistants/${assistantId}/collections/${collectionId}`,
      { method: "DELETE" },
    ),
};

// --- knowledge: sources ------------------------------------------------

export interface Source {
  id: string;
  organization_id: string;
  topic_id: string;
  title: string;
  kind: "texto" | "URL" | "PDF" | "DOCX";
  status:
    | "rascunho"
    | "aguardando_revisao"
    | "aguardando_ativacao"
    | "fila"
    | "processando"
    | "pronta"
    | "erro"
    | "arquivada";
  origin_url: string | null;
  error_message: string | null;
  chunk_count: number;
  /** Quando alguem revisou (aprovou ou marcou como revisada). */
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface CreateSourceInput {
  topicId: string;
  title: string;
  kind: "texto" | "URL";
  content: string;
}

export const sourcesApi = {
  list: (organizationId: string, topicId: string) =>
    get<Source[]>(`/organizations/${organizationId}/topics/${topicId}/sources`),
  createTextOrUrl: (organizationId: string, input: CreateSourceInput) =>
    post<Source>(`/organizations/${organizationId}/sources`, input),
  // multipart: o browser precisa definir o boundary sozinho, por isso nao
  // passa por apiFetch (que forcaria Content-Type: application/json).
  upload: (organizationId: string, topicId: string, title: string, file: File) => {
    const form = new FormData();
    form.append("topicId", topicId);
    form.append("title", title);
    form.append("file", file);
    return apiFetch<Source>(`/organizations/${organizationId}/sources/upload`, {
      method: "POST",
      body: form,
    });
  },
  approve: (organizationId: string, sourceId: string) =>
    post<Source>(`/organizations/${organizationId}/sources/${sourceId}/approve`),
  reindex: (organizationId: string, sourceId: string) =>
    post<Source>(`/organizations/${organizationId}/sources/${sourceId}/reindex`),
  /** Marca ou desmarca a fonte como revisada (assistentes "so fontes revisadas"). */
  review: (organizationId: string, sourceId: string, reviewed: boolean) =>
    post<Source>(`/organizations/${organizationId}/sources/${sourceId}/review`, { reviewed }),
  archive: (organizationId: string, sourceId: string) =>
    post<Source>(`/organizations/${organizationId}/sources/${sourceId}/archive`),
  /** Destrava fontes presas em "aguardando ativação" depois que uma chave de
   * IA válida passa a existir. */
  activatePending: (organizationId: string) =>
    post<{ activated: number }>(`/organizations/${organizationId}/sources/activate-pending`),
};

// --- identity: membros do tenant ------------------------------------------------

export type TenantRole = "Administrador" | "Editor de base" | "Analista" | "Atendente";

export interface Member {
  id: string;
  user_id: string;
  email: string;
  role: TenantRole;
  created_at: string;
}

export interface CreateMemberInput {
  email: string;
  password: string;
  role: TenantRole;
}

export const membersApi = {
  list: (organizationId: string) => get<Member[]>(`/organizations/${organizationId}/members`),
  /** Papeis da tabela `roles`, com o que cada um faz. */
  roles: (organizationId: string) =>
    get<{ name: TenantRole; description: string }[]>(`/organizations/${organizationId}/roles`),
  create: (organizationId: string, input: CreateMemberInput) =>
    post<Member>(`/organizations/${organizationId}/members`, input),
  updateRole: (organizationId: string, membershipId: string, role: TenantRole) =>
    apiFetch<Member>(`/organizations/${organizationId}/members/${membershipId}`, {
      method: "PATCH",
      body: JSON.stringify({ role }),
    }),
  remove: (organizationId: string, membershipId: string) =>
    apiFetch<{ ok: true }>(`/organizations/${organizationId}/members/${membershipId}`, {
      method: "DELETE",
    }),
};

// --- embed: widget keys ------------------------------------------------

export interface WidgetKey {
  id: string;
  organization_id: string;
  assistant_id: string;
  environment: "teste" | "producao";
  masked: string;
  revoked_at: string | null;
  created_at: string;
  /** Final do segredo de identidade (o texto nunca volta da API). */
  identity_secret_hint: string | null;
  require_signed_identity: boolean;
}

export interface AllowedDomain {
  id: string;
  embed_key_id: string;
  domain: string;
  created_at: string;
}

export interface CreateWidgetKeyInput {
  assistantId: string;
  environment: "teste" | "producao";
  domains: string[];
}

export const widgetKeysApi = {
  list: (organizationId: string) =>
    get<WidgetKey[]>(`/organizations/${organizationId}/widget-keys`),
  /** O `plaintext` so existe nesta resposta — nunca fica recuperavel depois. */
  create: (organizationId: string, input: CreateWidgetKeyInput) =>
    post<{ id: string; environment: string; masked: string; plaintext: string }>(
      `/organizations/${organizationId}/widget-keys`,
      input,
    ),
  revoke: (organizationId: string, keyId: string) =>
    post<{ ok: true }>(`/organizations/${organizationId}/widget-keys/${keyId}/revoke`),
  /** Segredo de identidade: o texto so existe nesta resposta. */
  rotateIdentitySecret: (organizationId: string, keyId: string) =>
    post<{ secret: string; hint: string }>(
      `/organizations/${organizationId}/widget-keys/${keyId}/identity-secret`,
    ),
  removeIdentitySecret: (organizationId: string, keyId: string) =>
    apiFetch<void>(`/organizations/${organizationId}/widget-keys/${keyId}/identity-secret`, {
      method: "DELETE",
    }),
  setRequireSignedIdentity: (organizationId: string, keyId: string, on: boolean) =>
    apiFetch<{ requireSignedIdentity: boolean }>(
      `/organizations/${organizationId}/widget-keys/${keyId}`,
      { method: "PATCH", body: JSON.stringify({ requireSignedIdentity: on }) },
    ),
};

/** Aparencia padrao do widget da organizacao (o assistente sobrescreve). */
export const widgetDefaultsApi = {
  get: (organizationId: string) =>
    get<WidgetSettings>(`/organizations/${organizationId}/widget-defaults`),
  save: (organizationId: string, settings: WidgetSettings) =>
    apiFetch<WidgetSettings>(`/organizations/${organizationId}/widget-defaults`, {
      method: "PUT",
      body: JSON.stringify(settings),
    }),
};

// --- audit ------------------------------------------------

export interface AuditEvent {
  id: string;
  organization_id: string | null;
  actor_user_id: string | null;
  action: string;
  type: string;
  target: string | null;
  created_at: string;
}

export const auditApi = {
  list: (organizationId: string) => get<AuditEvent[]>(`/organizations/${organizationId}/audit`),
};

// --- analytics ------------------------------------------------

export interface UsageSummary {
  periodDays: number;
  eventCounts: Record<string, number>;
  avgRagLatencyMs: number | null;
  openGaps: number;
}

export const usageApi = {
  getSummary: (organizationId: string) =>
    get<UsageSummary>(`/organizations/${organizationId}/usage`),
};

// --- conversations ------------------------------------------------

export interface Conversation {
  id: string;
  organization_id: string;
  assistant_id: string;
  visitor_id: string | null;
  channel: "widget" | "whatsapp" | "playground" | "telegram" | "instagram" | "messenger";
  started_at: string;
  /** Retencao em modo "anonimizar": sem texto, anexos nem visitante. */
  anonymized_at?: string | null;
}

export interface ConversationMessage {
  id: string;
  conversation_id: string;
  role: "visitante" | "assistente" | "atendente";
  content: string;
  citations: Citation[];
  /** Canais externos: recibo do provedor (WhatsApp...). */
  delivery_status?: "enviando" | "enviada" | "entregue" | "lida" | "falhou" | null;
  delivery_error?: string | null;
  provider_message_id?: string | null;
  /** Midia recebida pelos canais (o arquivo e baixado a parte). */
  attachments?: MessageAttachment[];
  created_at: string;
}

export interface MessageAttachment {
  id: string;
  kind: "imagem" | "audio" | "video" | "documento" | "figurinha";
  mime_type: string | null;
  file_name: string | null;
  size_bytes: number | null;
  status: "pendente" | "pronto" | "falhou";
  error: string | null;
}

export const conversationsApi = {
  list: (organizationId: string) =>
    get<Conversation[]>(`/organizations/${organizationId}/conversations`),
  get: (organizationId: string, conversationId: string) =>
    get<Conversation & { messages: ConversationMessage[] }>(
      `/organizations/${organizationId}/conversations/${conversationId}`,
    ),
  /** O arquivo vem sempre como download; o painel monta a pre-visualizacao. */
  async attachment(organizationId: string, conversationId: string, attachmentId: string) {
    const response = await fetch(
      `${API_BASE_URL}/organizations/${organizationId}/conversations/${conversationId}/attachments/${attachmentId}`,
      { credentials: "include" },
    );
    if (!response.ok) throw new ApiError(response.status, "não foi possível abrir o arquivo");
    return response.blob();
  },
};

// --- organizations: AI credentials ------------------------------------------------

export type CredentialEnvironment = "teste" | "producao" | "ambos";

export interface CredentialStatus {
  environment: CredentialEnvironment;
  status: "ausente" | "valida" | "invalida" | "substituida" | "removida";
  masked: string | null;
  updatedAt: string | null;
}

/** IA oferecida pela plataforma via .env, sem chave do tenant (ADR-005). */
export interface PlatformAi {
  chatProvider: "openai" | "anthropic" | "local";
  chatModel: string | null;
  embeddingProvider: "openai" | "local" | "hash";
  available: boolean;
}

export const platformApi = {
  ai: () => get<PlatformAi>("/platform/ai"),
};

export const aiCredentialsApi = {
  getStatus: (organizationId: string) =>
    get<CredentialStatus[]>(`/organizations/${organizationId}/ai-credentials`),
  configure: (organizationId: string, environment: CredentialEnvironment, apiKey: string) =>
    apiFetch<{
      environment: CredentialEnvironment;
      status: CredentialStatus["status"];
      masked: string;
    }>(`/organizations/${organizationId}/ai-credentials`, {
      method: "POST",
      body: JSON.stringify({ environment, apiKey }),
    }),
  remove: (organizationId: string, environment: CredentialEnvironment) =>
    apiFetch<{ ok: true }>(`/organizations/${organizationId}/ai-credentials/${environment}`, {
      method: "DELETE",
    }),
};

// --- conversations: gaps ------------------------------------------------

export interface KnowledgeGap {
  id: string;
  organization_id: string;
  assistant_id: string;
  /** Chave de agrupamento; numa pergunta de continuidade carrega a anterior. */
  question_normalized: string;
  /** O que o visitante digitou, quando disponivel. */
  original_question: string | null;
  /** Turnos anteriores, para responder sem abrir a conversa. */
  context_snippet: string | null;
  frequency: number;
  status: "pendente" | "resolvida";
  last_seen_at: string;
}

export interface AnswerGapInput {
  topicId: string;
  content: string;
}

export const gapsApi = {
  list: (organizationId: string) => get<KnowledgeGap[]>(`/organizations/${organizationId}/gaps`),
  resolve: (organizationId: string, gapId: string) =>
    post<{ ok: true }>(`/organizations/${organizationId}/gaps/${gapId}/resolve`),
  answer: (organizationId: string, gapId: string, input: AnswerGapInput) =>
    post<{ id: string }>(`/organizations/${organizationId}/gaps/${gapId}/answer`, input),
};
