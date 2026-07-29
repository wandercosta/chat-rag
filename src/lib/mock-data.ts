/**
 * Dados mockados/estáticos do protótipo.
 * TODO(API): cada coleção abaixo será substituída por chamadas à API real
 * (ex.: GET /api/tenants, GET /api/assistants, ...). Nenhum dado aqui é sensível
 * e nenhuma chave/segredo é gerada ou manipulada no cliente.
 */

export type TenantStatus = "ativo" | "suspenso";
export type AssistantStatus = "publicado" | "rascunho" | "pausado";
export type SourceStatus =
  | "rascunho"
  | "aguardando revisão"
  | "na fila"
  | "processando"
  | "pronta"
  | "erro"
  | "arquivada";
export type SourceKind = "texto" | "PDF" | "DOCX" | "URL";
export type KeyState = "não configurada" | "válida" | "inválida" | "substituída";
export type TenantRole = "Administrador" | "Editor de base" | "Analista";

export interface Tenant {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  createdAt: string;
  limits: { assistants: number; sources: number; messagesMonth: number };
  usage: { assistants: number; sources: number; messagesMonth: number };
}

export const tenants: Tenant[] = [
  {
    id: "acme",
    name: "Acme Serviços Financeiros",
    slug: "acme",
    status: "ativo",
    createdAt: "2025-11-02",
    limits: { assistants: 10, sources: 500, messagesMonth: 50000 },
    usage: { assistants: 4, sources: 128, messagesMonth: 18420 },
  },
  {
    id: "nova-clinica",
    name: "Nova Clínica",
    slug: "nova-clinica",
    status: "ativo",
    createdAt: "2026-01-18",
    limits: { assistants: 5, sources: 200, messagesMonth: 15000 },
    usage: { assistants: 2, sources: 57, messagesMonth: 6210 },
  },
  {
    id: "logix",
    name: "Logix Transportes",
    slug: "logix",
    status: "suspenso",
    createdAt: "2025-08-30",
    limits: { assistants: 3, sources: 100, messagesMonth: 8000 },
    usage: { assistants: 1, sources: 22, messagesMonth: 0 },
  },
  {
    id: "editora-farol",
    name: "Editora Farol",
    slug: "editora-farol",
    status: "ativo",
    createdAt: "2026-04-11",
    limits: { assistants: 8, sources: 300, messagesMonth: 25000 },
    usage: { assistants: 3, sources: 94, messagesMonth: 9840 },
  },
];

export interface Assistant {
  id: string;
  name: string;
  status: AssistantStatus;
  model: string;
  collections: string[];
  conversations30d: number;
  updatedAt: string;
}

export const assistants: Assistant[] = [
  {
    id: "atendimento",
    name: "Atendimento Digital",
    status: "publicado",
    model: "gpt-4o-mini",
    collections: ["Produtos", "Tarifas"],
    conversations30d: 1284,
    updatedAt: "2026-07-24",
  },
  {
    id: "suporte-tecnico",
    name: "Suporte Técnico",
    status: "publicado",
    model: "gpt-4o",
    collections: ["Manuais"],
    conversations30d: 642,
    updatedAt: "2026-07-21",
  },
  {
    id: "onboarding",
    name: "Onboarding de Clientes",
    status: "rascunho",
    model: "gpt-4o-mini",
    collections: ["Políticas"],
    conversations30d: 0,
    updatedAt: "2026-07-12",
  },
  {
    id: "pos-venda",
    name: "Pós-venda",
    status: "pausado",
    model: "gpt-4.1-mini",
    collections: ["Tarifas", "Políticas"],
    conversations30d: 118,
    updatedAt: "2026-06-29",
  },
];

export interface KnowledgeSource {
  id: string;
  title: string;
  kind: SourceKind;
  status: SourceStatus;
  chunks: number;
  updatedAt: string;
}

export interface KnowledgeTopic {
  id: string;
  name: string;
  description: string;
  sources: KnowledgeSource[];
}

export const knowledgeTopics: KnowledgeTopic[] = [
  {
    id: "produtos",
    name: "Produtos",
    description: "Catálogo, elegibilidade e comparativos.",
    sources: [
      { id: "s1", title: "Catálogo 2026.pdf", kind: "PDF", status: "pronta", chunks: 214, updatedAt: "2026-07-20" },
      { id: "s2", title: "Comparativo de planos", kind: "texto", status: "processando", chunks: 0, updatedAt: "2026-07-28" },
      { id: "s3", title: "https://acme.com/produtos", kind: "URL", status: "na fila", chunks: 0, updatedAt: "2026-07-28" },
    ],
  },
  {
    id: "tarifas",
    name: "Tarifas",
    description: "Tabelas vigentes e regras de cobrança.",
    sources: [
      { id: "s4", title: "Tabela tarifária.docx", kind: "DOCX", status: "aguardando revisão", chunks: 0, updatedAt: "2026-07-26" },
      { id: "s5", title: "Regras de isenção", kind: "texto", status: "pronta", chunks: 42, updatedAt: "2026-07-10" },
      { id: "s6", title: "Tarifas legadas 2024.pdf", kind: "PDF", status: "arquivada", chunks: 88, updatedAt: "2026-02-03" },
    ],
  },
  {
    id: "politicas",
    name: "Políticas",
    description: "Privacidade, cancelamento e SLA.",
    sources: [
      { id: "s7", title: "Política de privacidade", kind: "texto", status: "pronta", chunks: 31, updatedAt: "2026-06-14" },
      { id: "s8", title: "SLA corporativo.pdf", kind: "PDF", status: "erro", chunks: 0, updatedAt: "2026-07-19" },
      { id: "s9", title: "Rascunho de cancelamento", kind: "texto", status: "rascunho", chunks: 0, updatedAt: "2026-07-27" },
    ],
  },
  {
    id: "manuais",
    name: "Manuais",
    description: "Guias operacionais de suporte técnico.",
    sources: [
      { id: "s10", title: "Manual do instalador.pdf", kind: "PDF", status: "pronta", chunks: 173, updatedAt: "2026-05-30" },
      { id: "s11", title: "https://docs.acme.com", kind: "URL", status: "pronta", chunks: 260, updatedAt: "2026-07-02" },
    ],
  },
];

export interface Conversation {
  id: string;
  assistant: string;
  visitor: string;
  startedAt: string;
  messages: number;
  feedback: "positivo" | "negativo" | "sem feedback";
  channel: "widget" | "whatsapp";
  transcript: { role: "visitante" | "assistente"; content: string; at: string }[];
}

export const conversations: Conversation[] = [
  {
    id: "c-9412",
    assistant: "Atendimento Digital",
    visitor: "visitante-8f21",
    startedAt: "2026-07-28 14:22",
    messages: 6,
    feedback: "positivo",
    channel: "widget",
    transcript: [
      { role: "visitante", content: "Qual a tarifa de transferência internacional?", at: "14:22" },
      { role: "assistente", content: "A tarifa vigente é de 1,2% sobre o valor enviado, com mínimo de R$ 24,00.", at: "14:22" },
      { role: "visitante", content: "E para clientes do plano Prime?", at: "14:24" },
      { role: "assistente", content: "Clientes Prime têm isenção nas três primeiras transferências do mês.", at: "14:24" },
    ],
  },
  {
    id: "c-9410",
    assistant: "Suporte Técnico",
    visitor: "visitante-13ba",
    startedAt: "2026-07-28 11:05",
    messages: 12,
    feedback: "negativo",
    channel: "widget",
    transcript: [
      { role: "visitante", content: "O equipamento não liga após a atualização.", at: "11:05" },
      { role: "assistente", content: "Vamos verificar o LED de status. Ele pisca em alguma cor?", at: "11:05" },
      { role: "visitante", content: "Nenhuma luz acende.", at: "11:08" },
      { role: "assistente", content: "Não encontrei esse cenário na base. Posso encaminhar para um atendente?", at: "11:08" },
    ],
  },
  {
    id: "c-9403",
    assistant: "Atendimento Digital",
    visitor: "visitante-5c07",
    startedAt: "2026-07-27 18:47",
    messages: 4,
    feedback: "sem feedback",
    channel: "whatsapp",
    transcript: [
      { role: "visitante", content: "Vocês atendem no sábado?", at: "18:47" },
      { role: "assistente", content: "Sim, das 9h às 13h pelo canal digital.", at: "18:47" },
    ],
  },
  {
    id: "c-9388",
    assistant: "Pós-venda",
    visitor: "visitante-a1d9",
    startedAt: "2026-07-26 09:31",
    messages: 8,
    feedback: "positivo",
    channel: "widget",
    transcript: [
      { role: "visitante", content: "Como solicito a segunda via do contrato?", at: "09:31" },
      { role: "assistente", content: "Pelo portal, em Documentos > Contratos, botão “Gerar segunda via”.", at: "09:31" },
    ],
  },
];

export interface Gap {
  id: string;
  question: string;
  frequency: number;
  assistant: string;
  status: "pendente" | "resolvida";
  lastSeen: string;
}

export const gaps: Gap[] = [
  { id: "g1", question: "Vocês emitem nota fiscal para clientes do exterior?", frequency: 34, assistant: "Atendimento Digital", status: "pendente", lastSeen: "2026-07-28" },
  { id: "g2", question: "Qual o prazo de portabilidade de conta?", frequency: 21, assistant: "Atendimento Digital", status: "pendente", lastSeen: "2026-07-27" },
  { id: "g3", question: "Equipamento sem LED após atualização", frequency: 18, assistant: "Suporte Técnico", status: "pendente", lastSeen: "2026-07-28" },
  { id: "g4", question: "Existe integração com ERP Protheus?", frequency: 12, assistant: "Suporte Técnico", status: "resolvida", lastSeen: "2026-07-14" },
  { id: "g5", question: "Como cancelar sem multa após 12 meses?", frequency: 9, assistant: "Pós-venda", status: "resolvida", lastSeen: "2026-07-09" },
];

export interface TenantUser {
  id: string;
  name: string;
  email: string;
  role: TenantRole;
  status: "ativo" | "convite pendente" | "senha provisória";
  lastAccess: string;
}

export const tenantUsers: TenantUser[] = [
  { id: "u1", name: "Marina Duarte", email: "marina@acme.com", role: "Administrador", status: "ativo", lastAccess: "2026-07-29 08:12" },
  { id: "u2", name: "Rafael Prado", email: "rafael@acme.com", role: "Editor de base", status: "ativo", lastAccess: "2026-07-28 17:40" },
  { id: "u3", name: "Camila Reis", email: "camila@acme.com", role: "Analista", status: "convite pendente", lastAccess: "—" },
  { id: "u4", name: "Otávio Lins", email: "otavio@acme.com", role: "Editor de base", status: "senha provisória", lastAccess: "—" },
];

export interface AuditEvent {
  id: string;
  actor: string;
  action: string;
  type: "acesso" | "configuração" | "conteúdo" | "segurança";
  target: string;
  at: string;
}

export const auditEvents: AuditEvent[] = [
  { id: "a1", actor: "marina@acme.com", action: "Revogou chave de widget", type: "segurança", target: "chave produção · wk_live_…9f2", at: "2026-07-29 08:20" },
  { id: "a2", actor: "suporte@chatrag.io", action: "Iniciou acesso de suporte", type: "acesso", target: "tenant Acme", at: "2026-07-28 16:02" },
  { id: "a3", actor: "rafael@acme.com", action: "Reindexou fonte", type: "conteúdo", target: "Catálogo 2026.pdf", at: "2026-07-28 10:44" },
  { id: "a4", actor: "marina@acme.com", action: "Atualizou chave OpenAI (produção)", type: "configuração", target: "estado: válida", at: "2026-07-27 09:15" },
  { id: "a5", actor: "marina@acme.com", action: "Convidou usuário", type: "segurança", target: "camila@acme.com · Analista", at: "2026-07-26 14:03" },
  { id: "a6", actor: "master@chatrag.io", action: "Suspendeu tenant", type: "segurança", target: "Logix Transportes", at: "2026-07-20 11:31" },
];

export const allowedModels = [
  { id: "gpt-4o-mini", label: "gpt-4o-mini", note: "Padrão · custo baixo" },
  { id: "gpt-4o", label: "gpt-4o", note: "Respostas longas" },
  { id: "gpt-4.1-mini", label: "gpt-4.1-mini", note: "Equilíbrio" },
];

export const widgetKeys = [
  { id: "k1", env: "teste" as const, masked: "wk_test_••••••••4c1a", domains: ["localhost:3000", "staging.acme.com"], createdAt: "2026-03-04" },
  { id: "k2", env: "produção" as const, masked: "wk_live_••••••••9f2b", domains: ["acme.com", "www.acme.com"], createdAt: "2026-03-04" },
];

export const usageSeries = [
  { month: "Fev", mensagens: 9200, conversas: 1720 },
  { month: "Mar", mensagens: 11840, conversas: 2140 },
  { month: "Abr", mensagens: 13010, conversas: 2380 },
  { month: "Mai", mensagens: 15220, conversas: 2710 },
  { month: "Jun", mensagens: 16980, conversas: 2960 },
  { month: "Jul", mensagens: 18420, conversas: 3180 },
];
