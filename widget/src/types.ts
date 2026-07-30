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
}

export interface ConfigResponse {
  assistantId: string;
  environment: "teste" | "producao";
}

export interface HandoffSector {
  id: string;
  name: string;
}

export type HandoffResponse =
  | { needsSectorSelection: true; sectors: HandoffSector[] }
  | { needsSectorSelection: false; whatsappUrl: string; sectorName: string };

export interface ChatMessage {
  role: "visitante" | "assistente";
  content: string;
}
