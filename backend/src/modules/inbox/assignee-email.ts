import { membersService } from "../identity/index.js";
import { mailer, panelLink } from "../../mail/mailer.js";
import { settingsRepository } from "./settings.repository.js";

/**
 * E-mail para quem recebeu uma conversa de outra pessoa (atribuicao ou
 * transferencia), se a organizacao ligou o aviso e a plataforma tem SMTP.
 * Sem dado do cliente no e-mail (minimizacao): so o aviso e o link para o
 * painel, onde a pessoa entra com o proprio login. Falha de envio nunca
 * derruba a atribuicao.
 */
export async function emailAssignee(
  organizationId: string,
  conversationId: string,
  toUserId: string | null,
  byUserId: string,
) {
  if (!toUserId || toUserId === byUserId || !mailer.enabled()) return;
  try {
    const settings = await settingsRepository.get(organizationId);
    if (!settings.emailOnAssignment) return;
    const members = await membersService.list(organizationId);
    const to = members.find((m) => m.user_id === toUserId)?.email;
    const by = members.find((m) => m.user_id === byUserId)?.email ?? "Alguem da equipe";
    if (!to) return;
    await mailer.send({
      to,
      subject: "Uma conversa foi passada para voce",
      text: [
        `${by} passou uma conversa para voce na caixa de entrada.`,
        "",
        `Abrir no painel: ${panelLink(`/atendimento?conversa=${conversationId}`)}`,
        "",
        "Voce recebe este aviso porque a sua organizacao ligou os e-mails de atribuicao.",
      ].join("\n"),
    });
  } catch {
    // Melhor esforco: o aviso no painel (tempo real) continua valendo.
  }
}
