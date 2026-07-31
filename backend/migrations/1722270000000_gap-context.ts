import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumns("knowledge_gaps", {
    // O que o visitante digitou. `question_normalized` continua sendo a chave
    // de agrupamento (e, em pergunta de continuidade, carrega a anterior junto
    // para nao agrupar "e o CPF?" de conversas sem relacao nenhuma).
    original_question: { type: "text" },
    // Turnos anteriores, para quem for responder entender "quantos filhos ele
    // tem?" sem precisar abrir a conversa.
    context_snippet: { type: "text" },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropColumns("knowledge_gaps", ["original_question", "context_snippet"]);
}
