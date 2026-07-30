import type { MigrationBuilder } from "node-pg-migrate";

export async function up(pgm: MigrationBuilder): Promise<void> {
  pgm.createExtension("pgcrypto", { ifNotExists: true });
  pgm.createExtension("vector", { ifNotExists: true });

  pgm.createTable("organizations", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    name: { type: "text", notNull: true },
    slug: { type: "text", notNull: true, unique: true },
    status: { type: "text", notNull: true, default: "ativo" },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("organizations", "organizations_status_check", {
    check: "status in ('ativo', 'suspenso')",
  });

  pgm.createTable("users", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    email: { type: "citext", notNull: true, unique: true },
    password_hash: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.createExtension("citext", { ifNotExists: true });

  pgm.createTable("memberships", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    user_id: {
      type: "uuid",
      notNull: true,
      references: "users",
      onDelete: "cascade",
    },
    organization_id: {
      type: "uuid",
      notNull: true,
      references: "organizations",
      onDelete: "cascade",
    },
    role: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("memberships", "memberships_role_check", {
    check: "role in ('Administrador', 'Editor de base', 'Analista')",
  });
  pgm.addConstraint("memberships", "memberships_user_org_unique", {
    unique: ["user_id", "organization_id"],
  });
  pgm.createIndex("memberships", "organization_id");

  // Papel de plataforma (Master). Nao tem organization_id: acesso global,
  // nunca herda automaticamente acesso de tenant (ver ADR-001 decisao 14).
  pgm.createTable("platform_roles", {
    user_id: {
      type: "uuid",
      primaryKey: true,
      references: "users",
      onDelete: "cascade",
    },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });

  // Append-only por decisao (ADR-002 #7): a role de aplicacao so tem INSERT/SELECT.
  pgm.createTable("audit_events", {
    id: { type: "uuid", primaryKey: true, default: pgm.func("gen_random_uuid()") },
    actor_user_id: { type: "uuid", references: "users", onDelete: "set null" },
    organization_id: { type: "uuid", references: "organizations", onDelete: "cascade" },
    action: { type: "text", notNull: true },
    type: { type: "text", notNull: true },
    target: { type: "text", notNull: true },
    created_at: { type: "timestamptz", notNull: true, default: pgm.func("now()") },
  });
  pgm.addConstraint("audit_events", "audit_events_type_check", {
    check: "type in ('acesso', 'configuracao', 'conteudo', 'seguranca')",
  });
  pgm.createIndex("audit_events", "organization_id");
  pgm.createIndex("audit_events", "created_at");
}

export async function down(pgm: MigrationBuilder): Promise<void> {
  pgm.dropTable("audit_events");
  pgm.dropTable("platform_roles");
  pgm.dropTable("memberships");
  pgm.dropTable("users");
  pgm.dropTable("organizations");
}
