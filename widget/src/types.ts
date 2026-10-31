export type Theme = "light" | "dark" | "sync";
export type Mode = "floating" | "embedded";
export type Position = "bottom-right" | "bottom-left";

export interface WidgetOptions {
  key: string;
  apiBaseUrl: string;
  mode: Mode;
  position: Position;
  theme: Theme;
  title: string;
  greeting: string;
  accentColor: string | null;
  avatarUrl: string | null;
  showOnlineBadge: boolean;
  mountSelector: string | null;
  identityToken: string | null;
  /** Id estavel do atendimento/cliente no sistema hospedeiro (ex.:
   * "pedido-4821"). Mantem o mesmo visitante entre recargas da pagina, para
   * o painel distinguir esse atendimento dos demais em vez de uma sessao
   * anonima generica. */
  externalUserId: string | null;
  visitorName: string | null;
  visitorEmail: string | null;
  /** Dados livres (ex.: {"plano":"Pro","pedido":"4821"}) que o hospedeiro
   * quer que o assistente considere ao responder, alem da base. */
  context: Record<string, unknown> | null;
  /** Vem da config do assistente: pedido de atendente cai na caixa de
   * entrada do painel em vez do WhatsApp. */
  humanInbox: boolean;
}

/** Aparencia configurada no painel (assistente > Widget). */
export interface Appearance {
  title?: string;
  greeting?: string;
  accentColor?: string;
  position?: Position;
  theme?: Theme;
  /** Logo do cabecalho (https), padrao da organizacao ou do assistente. */
  logoUrl?: string;
}

export interface ConfigResponse {
  assistantId: string;
  environment: "teste" | "producao";
  appearance?: Appearance;
  humanInbox?: boolean;
}

/** Trecho e documento de origem que embasaram uma resposta. */
export interface Citation {
  index: number;
  sourceId: string;
  sourceTitle: string;
  excerpt: string;
}

export interface HandoffSector {
  id: string;
  name: string;
}

export type HandoffResponse =
  | { needsSectorSelection: true; sectors: HandoffSector[] }
  | { needsSectorSelection: false; whatsappUrl: string; sectorName: string }
  | { inbox: true; status: "aberta" | "pendente" | "resolvida" };

/** Eventos de tempo real da conversa (so os que o visitante pode ver). */
export type InboxEvent =
  | { kind: "agent_message"; conversationId: string; content: string; createdAt: string }
  | { kind: "status"; conversationId: string; status: "aberta" | "pendente" | "resolvida" };

export interface ChatMessage {
  role: "visitante" | "assistente" | "atendente";
  content: string;
  citations?: Citation[];
}
