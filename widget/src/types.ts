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
