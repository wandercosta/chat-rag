import { contactsService } from "../contacts/index.js";
import { conversationsService } from "../conversations/index.js";
import { inboxService } from "../inbox/index.js";
import { automationsRepository } from "./automations.repository.js";
import { matches } from "./conditions.js";
import type { Action } from "./rules.js";
import { sendTemplate } from "./template-sender.js";

export type RuleRow = Awaited<ReturnType<typeof automationsRepository.enabled>>[number];

export interface IncomingMessage {
  conversationId: string;
  contactId: string | null;
  channel: string;
  text: string;
  isFirstMessage: boolean;
}

/**
 * O que quem recebeu a mensagem (widget ou canal) faz depois das regras.
 * A automacao nao envia nada sozinha: devolve o texto da resposta e quem
 * recebeu grava e entrega pelo proprio caminho (evita ciclo entre modulos).
 */
export interface MessageOutcome {
  reply: string | null;
  /** Alguma regra respondeu ou passou para humano: o assistente fica quieto. */
  suppressAssistant: boolean;
  handedOff: boolean;
}

/**
 * Executa as acoes de uma regra; `reply` volta para quem chamou. Sem conversa
 * (gatilho de etiqueta), o validador de regras so deixa acoes sobre o contato.
 */
export async function runActions(
  organizationId: string,
  conversationId: string | null,
  contactId: string | null,
  actions: Action[],
  responsibleUserId: string | null = null,
  contactName: string | null = null,
) {
  const done: string[] = [];
  let reply: string | null = null;
  let handedOff = false;
  for (const action of actions) {
    switch (action.type) {
      case "responder":
        reply = action.text;
        done.push("respondeu");
        break;
      case "adicionar_etiqueta":
        if (contactId && (await contactsService.addTag(organizationId, contactId, action.tagId))) {
          done.push("etiquetou o contato");
        } else {
          done.push("etiqueta ignorada (sem contato ou etiqueta removida)");
        }
        break;
      case "enviar_modelo":
        if (!contactId) {
          done.push("modelo ignorado (sem contato)");
          break;
        }
        await sendTemplate({
          organizationId,
          contactId,
          responsibleUserId,
          connectionId: action.connectionId,
          templateId: action.templateId,
          params: action.params,
          contactName,
        });
        done.push("enviou o modelo");
        break;
      case "encaminhar_humano":
        if (!conversationId) break;
        await inboxService.requestHuman(organizationId, conversationId);
        handedOff = true;
        done.push("passou para a fila");
        break;
      case "atribuir":
        if (!conversationId) break;
        await inboxService.assignBySystem(organizationId, conversationId, action.userId);
        handedOff = true;
        done.push("atribuiu a conversa");
        break;
      case "devolver_fila":
        if (!conversationId) break;
        await inboxService.assignBySystem(organizationId, conversationId, null);
        done.push("devolveu para a fila");
        break;
      case "nota_interna":
        if (!conversationId) break;
        await inboxService.addSystemNote(organizationId, conversationId, action.text);
        done.push("anotou");
        break;
    }
  }
  return { reply, handedOff, detail: done.join(", ") };
}

export async function runLogged(
  organizationId: string,
  rule: RuleRow,
  conversationId: string | null,
  run: () => Promise<string>,
) {
  try {
    const detail = await run();
    await automationsRepository.logRun({
      organizationId,
      ruleId: rule.id,
      ruleVersion: rule.version,
      conversationId,
      status: "ok",
      detail,
    });
  } catch (err) {
    await automationsRepository.logRun({
      organizationId,
      ruleId: rule.id,
      ruleVersion: rule.version,
      conversationId,
      status: "erro",
      detail: err instanceof Error ? err.message : "erro desconhecido",
    });
  }
}

/**
 * Gatilho "mensagem recebida": roda antes do assistente, so em conversa sem
 * humano. Todas as regras que casam rodam, na ordem de criacao; so a primeira
 * que responde manda texto (uma resposta por mensagem).
 */
export async function onIncomingMessage(
  organizationId: string,
  message: IncomingMessage,
): Promise<MessageOutcome> {
  const outcome: MessageOutcome = { reply: null, suppressAssistant: false, handedOff: false };
  const rules = await automationsRepository.enabled(organizationId, "mensagem_recebida");
  if (rules.length === 0) return outcome;

  const ctx = {
    channel: message.channel,
    text: message.text,
    isFirstMessage: message.isFirstMessage,
    contactTagIds: message.contactId ? await contactsService.tagIdsOf(message.contactId) : [],
    now: new Date(),
  };
  for (const rule of rules) {
    if (!matches(rule.conditions, ctx)) continue;
    // So a primeira regra que responde manda texto; as outras ainda etiquetam etc.
    const actions = outcome.reply
      ? rule.actions.filter((a) => a.type !== "responder")
      : rule.actions;
    await runLogged(organizationId, rule, message.conversationId, async () => {
      const result = await runActions(
        organizationId,
        message.conversationId,
        message.contactId,
        actions,
      );
      if (result.reply) outcome.reply = result.reply;
      if (result.handedOff) outcome.handedOff = true;
      return result.detail;
    });
  }
  outcome.suppressAssistant = !!outcome.reply || outcome.handedOff;
  return outcome;
}

/**
 * Gatilho "sem resposta" (varredura do worker a cada minuto): conversa com
 * humano em que o cliente falou por ultimo ha mais de X minutos. Roda uma vez
 * por silencio: so de novo depois de uma mensagem nova do cliente.
 */
export async function scanNoReply(organizationId: string, now = new Date()) {
  const rules = await automationsRepository.enabled(organizationId, "sem_resposta");
  if (rules.length === 0) return 0;

  const active = await inboxService.activeAssignments(organizationId);
  const last = await conversationsService.lastMessageOf(active.map((a) => a.conversation_id));
  let executed = 0;

  for (const assignment of active) {
    const lastMessage = last.get(assignment.conversation_id);
    if (!lastMessage || lastMessage.role !== "visitante") continue;
    const silentMinutes = (now.getTime() - new Date(lastMessage.at).getTime()) / 60_000;

    const conversation = await conversationsService.get(organizationId, assignment.conversation_id);
    if (!conversation) continue;
    const ctx = {
      channel: conversation.channel,
      text: "",
      isFirstMessage: false,
      contactTagIds: conversation.contact_id
        ? await contactsService.tagIdsOf(conversation.contact_id)
        : [],
      now,
    };

    for (const rule of rules) {
      const wait = rule.conditions.find((c) => c.type === "sem_resposta_ha");
      if (!wait || wait.type !== "sem_resposta_ha" || silentMinutes < wait.minutes) continue;
      if (!matches(rule.conditions, ctx)) continue;
      const lastRun = await automationsRepository.lastRunAt(rule.id, conversation.id);
      if (lastRun && lastRun > new Date(lastMessage.at)) continue;

      await runLogged(organizationId, rule, conversation.id, async () => {
        const result = await runActions(
          organizationId,
          conversation.id,
          conversation.contact_id,
          rule.actions,
        );
        return result.detail;
      });
      executed++;
    }
  }
  return executed;
}

/** Todas as organizacoes com regra de "sem resposta" ligada. */
export async function scanAllNoReply() {
  for (const organizationId of await automationsRepository.organizationsWith("sem_resposta")) {
    await scanNoReply(organizationId);
  }
}
