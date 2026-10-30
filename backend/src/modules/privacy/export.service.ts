import { auditService } from "../audit/index.js";
import { contactsService } from "../contacts/index.js";
import { conversationsService } from "../conversations/index.js";
import { membersService } from "../identity/index.js";
import { inboxService } from "../inbox/index.js";
import { organizationsService } from "../organizations/index.js";

/**
 * Exportacao dos dados da organizacao (LGPD, etapa 8 da Fase 3): o que a
 * plataforma guarda sobre pessoas — quem acessa o painel, contatos com canais
 * e etiquetas, conversas com as mensagens e notas internas. Cada parte vem do
 * modulo dono, pela interface publica (ADR-002 #2). Segredos nunca entram.
 */
export async function exportOrganization(actorUserId: string, organizationId: string) {
  const [organization, members, contacts, conversations, notes] = await Promise.all([
    organizationsService.getById(organizationId),
    membersService.list(organizationId),
    contactsService.exportAll(organizationId),
    conversationsService.exportAll(organizationId),
    inboxService.exportNotes(organizationId),
  ]);

  await auditService.record({
    actorUserId,
    organizationId,
    action: `Exportou dados da organizacao (${contacts.length} contatos, ${conversations.length} conversas)`,
    type: "seguranca",
    target: organization?.slug ?? organizationId,
  });

  return {
    exportedAt: new Date().toISOString(),
    organization: organization
      ? {
          id: organization.id,
          name: organization.name,
          slug: organization.slug,
          created_at: organization.created_at,
        }
      : null,
    members: members.map((m) => ({ email: m.email, role: m.role, since: m.created_at })),
    contacts,
    conversations,
    notes,
  };
}
