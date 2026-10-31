import { type VisitorProfileInput, visitorsRepository } from "./visitors.repository.js";

export const visitorsService = {
  /**
   * Um data-external-user-id estavel no widget (ex.: id do atendimento no
   * sistema hospedeiro) identifica sempre o mesmo visitante, para que o
   * painel consiga distinguir conversas por cliente/atendimento em vez de
   * uma massa de sessoes anonimas. Sem external_user_id, cada carregamento
   * do widget e um visitante novo (comportamento anterior, preservado).
   */
  async resolve(organizationId: string, input: VisitorProfileInput) {
    if (!input.externalUserId && !input.name && !input.email && !input.context) return null;

    if (input.externalUserId) {
      const existing = await visitorsRepository.findByExternalId(
        organizationId,
        input.externalUserId,
      );
      if (existing) {
        // Identidade sem assinatura nunca mexe num visitante verificado: quem
        // adivinhou o id fica anonimo (nem le nem altera o cadastro dele).
        if (existing.identity_verified && !input.verified) return null;
        if (
          input.name === undefined &&
          input.email === undefined &&
          input.context === undefined &&
          !input.verified
        ) {
          return existing;
        }
        return visitorsRepository.updateProfile(existing.id, input);
      }
    }

    return visitorsRepository.create(organizationId, input);
  },

  findById(id: string) {
    return visitorsRepository.findById(id);
  },
};
