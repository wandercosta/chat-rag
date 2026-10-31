import nodemailer, { type Transporter } from "nodemailer";
import { env } from "../config/env.js";

let transport: Transporter | null | undefined;

function transportOrNull() {
  if (transport === undefined) {
    transport = env.SMTP_URL
      ? nodemailer.createTransport(env.SMTP_URL, {
          connectionTimeout: 10_000,
          greetingTimeout: 10_000,
        })
      : null;
  }
  return transport;
}

/**
 * E-mail da plataforma (avisos da caixa de entrada). Credencial so no
 * `.env` (SMTP_URL), nunca em log. Sem SMTP configurado, `send` nao faz nada.
 */
export const mailer = {
  enabled: () => !!env.SMTP_URL,

  async send(message: { to: string; subject: string; text: string }): Promise<boolean> {
    const t = transportOrNull();
    if (!t) return false;
    await t.sendMail({ from: env.SMTP_FROM, ...message });
    return true;
  },
};

/** Link de uma tela do painel (PANEL_URL ou a origem do CORS). */
export function panelLink(path: string) {
  const base = env.PANEL_URL ?? env.CORS_ORIGIN.split(",")[0].trim();
  return `${base.replace(/\/$/, "")}${path}`;
}
