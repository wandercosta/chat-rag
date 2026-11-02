import type { MigrationBuilder } from "node-pg-migrate";

const ROLES: [string, string, number][] = [
  [
    "Administrador",
    "Gerencia a organizacao inteira: pessoas, assistentes, canais e configuracoes.",
    1,
  ],
  ["Editor de base", "Cuida da base de conhecimento: colecoes, topicos, fontes e lacunas.", 2],
  ["Analista", "Le conversas, lacunas, desempenho e relatorios; nao altera nada.", 3],
  ["Atendente", "Atende a caixa de entrada: assume, responde, transfere e anota conversas.", 4],
];

/**
 * - organizations.retention_mode: o que a retencao faz ao vencer o prazo:
 *   "excluir" (padrao, como antes) ou "anonimizar" (mantem a conversa para
 *   metricas, sem conteudo nem ligacao com visitante ou contato).
 * - conversations.anonymized_at: quando a conversa foi anonimizada (a
 *   varredura nao repete; o painel mostra).
 * - roles: tabela de papeis do tenant. `memberships.role` passa a ser chave
 *   estrangeira para ela em vez de uma lista fixa num CHECK. As permissoes de
 *   cada papel continuam no codigo (requireOrgRole); a tabela guarda o nome,
 *   a descricao mostrada no painel e a ordem.
 */
export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.addColumn("organizations", {
    retention_mode: { type: "text", notNull: true, default: "excluir" },
  });
  pgm.addConstraint("organizations", "organizations_retention_mode_check", {
    check: "retention_mode in ('excluir', 'anonimizar')",
  });
  pgm.addColumn("conversations", { anonymized_at: { type: "timestamptz" } });

  pgm.createTable("roles", {
    name: { type: "text", primaryKey: true },
    description: { type: "text", notNull: true },
    position: { type: "integer", notNull: true },
  });
  // Textos fixos, sem aspas: entram direto no SQL.
  const values = ROLES.map(([name, text, position]) => `('${name}', '${text}', ${position})`);
  pgm.sql(`INSERT INTO roles (name, description, position) VALUES ${values.join(", ")}`);
  pgm.dropConstraint("memberships", "memberships_role_check");
  pgm.addConstraint("memberships", "memberships_role_fkey", {
    foreignKeys: { columns: "role", references: "roles(name)", onUpdate: "CASCADE" },
  });
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropConstraint("memberships", "memberships_role_fkey");
  pgm.addConstraint("memberships", "memberships_role_check", {
    check: "role in ('Administrador', 'Editor de base', 'Analista', 'Atendente')",
  });
  pgm.dropTable("roles");
  pgm.dropColumn("conversations", "anonymized_at");
  pgm.dropConstraint("organizations", "organizations_retention_mode_check");
  pgm.dropColumn("organizations", "retention_mode");
}
