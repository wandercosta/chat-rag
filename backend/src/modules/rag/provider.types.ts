/**
 * Interface interna que separa chat/embeddings/moderacao do fornecedor
 * (docs/backend/especificacao-backend.md - Provedor de IA). OpenAI e a
 * implementacao inicial; trocar de provedor significa so escrever um novo
 * adapter deste tipo.
 */
export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ProviderAdapter {
  embed(texts: string[]): Promise<number[][]>;
  chat(messages: ChatMessage[], model: string): Promise<string>;
  moderate(text: string): Promise<boolean>;
}
