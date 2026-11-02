import { membersService } from "../identity/index.js";
import { mailer, panelLink } from "../../mail/mailer.js";

/**
 * E-mail aos administradores quando o tenant atinge o teto mensal da IA da
 * plataforma (ADR-007). Sem conteudo de conversa: so o aviso e o link.
 */
export async function notifyAdminsLimitReached(organizationId: string) {
  if (!mailer.enabled()) return;
  const members = await membersService.list(organizationId);
  const admins = members.filter((m) => m.role === "Administrador");
  for (const admin of admins) {
    await mailer.send({
      to: admin.email,
      subject: "O limite mensal de IA da sua organizacao foi atingido",
      text: [
        "Sua organizacao atingiu o limite mensal de uso da IA incluida na plataforma.",
        "",
        "O assistente continua respondendo, mas no modo simples: devolve o trecho mais",
        "relevante da base, com a fonte, sem gerar texto. O limite volta no dia 1.",
        "",
        "Para voltar ao normal antes disso, cadastre a chave da OpenAI da organizacao",
        "ou peca um limite maior ao suporte da plataforma.",
        "",
        `Ver o consumo: ${panelLink("/")}`,
      ].join("\n"),
    });
  }
}
