import { env } from "../../config/env.js";
import { assistantsService } from "../assistants/index.js";
import { aiQuotaService, usageService } from "../analytics/index.js";
import { auditService } from "../audit/index.js";
import { contactsService } from "../contacts/index.js";
import { conversationsService } from "../conversations/index.js";
import { membersService } from "../identity/index.js";
import { organizationsService } from "../organizations/index.js";
import { NoActiveCredentialError, resolveChatProvider } from "../rag/index.js";
import {
  buildTranscript,
  classificationMessages,
  parseClassification,
  type TranscriptMessage,
} from "./classifier.js";
import {
  LeadsUnavailableError,
  LeadInsightNotFoundError,
  LeadModelError,
  LeadAlreadyReviewedError,
} from "./errors.js";
import { leadsRepository, type InsightRow } from "./leads.repository.js";

/** Conversas recentes do contato que entram na classificacao. */
const RECENT_CONVERSATIONS = 5;
/** Mesmo padrao das conversas (assistants.service): 90 dias sem politica propria. */
const PLATFORM_DEFAULT_RETENTION_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

async function recentMessages(organizationId: string, contactId: string) {
  const summaries = await conversationsService.listSummaries(organizationId, {
    contactId,
    limit: RECENT_CONVERSATIONS,
  });
  const messages: (TranscriptMessage & { at: number })[] = [];
  for (const summary of summaries) {
    const conversation = await conversationsService.getWithMessages(organizationId, summary.id);
    for (const m of conversation?.messages ?? []) {
      messages.push({ role: m.role, content: m.content, at: new Date(m.created_at).getTime() });
    }
  }
  return messages.sort((a, b) => a.at - b.at);
}

async function present(organizationId: string, rows: InsightRow[]) {
  const members = await membersService.list(organizationId);
  const emails = new Map(members.map((m) => [m.user_id, m.email]));
  const email = (id: string | null) => (id ? (emails.get(id) ?? null) : null);
  return rows.map((r) => ({
    id: r.id,
    contactId: r.contact_id,
    temperature: r.temperature,
    confidence: r.confidence,
    interest: r.interest,
    nextStep: r.next_step,
    summary: r.summary,
    model: r.model,
    status: r.status,
    createdByEmail: email(r.created_by),
    createdAt: r.created_at,
    reviewedByEmail: email(r.reviewed_by),
    reviewedAt: r.reviewed_at,
  }));
}

/**
 * Classificacao de leads com IA (ADR-009): sob demanda, ligada pelo
 * Administrador, so com o texto das conversas e sempre como sugestao que uma
 * pessoa aceita ou descarta. A IA nao muda contato, negocio ou campanha.
 */
export const leadsService = {
  async settings(organizationId: string) {
    return { enabled: await leadsRepository.isEnabled(organizationId) };
  },

  async setEnabled(actorUserId: string, organizationId: string, enabled: boolean) {
    await leadsRepository.setEnabled(organizationId, enabled, actorUserId);
    await auditService.record({
      actorUserId,
      organizationId,
      action: enabled
        ? "Ligou a classificacao de leads com IA"
        : "Desligou a classificacao de leads com IA",
      type: "configuracao",
      target: organizationId,
    });
    return { enabled };
  },

  async classify(actorUserId: string, organizationId: string, contactId: string) {
    if (!(await leadsRepository.isEnabled(organizationId))) {
      throw new LeadsUnavailableError("a classificacao de leads com IA esta desligada");
    }
    const labels = await contactsService.labelsFor(organizationId, [contactId]);
    if (!labels.has(contactId)) throw new LeadInsightNotFoundError();

    const messages = await recentMessages(organizationId, contactId);
    if (!messages.some((m) => m.role === "visitante")) {
      throw new LeadsUnavailableError("o contato ainda nao tem conversa para classificar");
    }

    let provider;
    try {
      provider = await resolveChatProvider(organizationId, "producao", env.OPENAI_CHAT_MODEL);
    } catch (err) {
      if (err instanceof NoActiveCredentialError) {
        throw new LeadsUnavailableError("nenhum modelo de IA disponivel para classificar");
      }
      throw err;
    }
    if (provider.kind === "extractive") {
      throw new LeadsUnavailableError("a classificacao precisa de um modelo de IA (modo local)");
    }
    if (provider.keySource === "plataforma" && (await aiQuotaService.isExhausted(organizationId))) {
      throw new LeadsUnavailableError("limite mensal da IA da plataforma atingido");
    }

    const result = await provider.chat(
      classificationMessages(buildTranscript(messages)),
      env.OPENAI_CHAT_MODEL,
    );
    // O consumo conta mesmo quando a resposta e descartada: o modelo cobrou.
    if (result.usage) {
      await usageService.record({
        organizationId,
        type: "lead_classification",
        payload: {
          model: result.usage.model,
          inputTokens: result.usage.inputTokens,
          outputTokens: result.usage.outputTokens,
          keySource: provider.keySource ?? "plataforma",
        },
      });
    }
    const classification = parseClassification(result.text);
    if (!classification) throw new LeadModelError();

    await leadsRepository.supersedePending(organizationId, contactId, actorUserId);
    const insight = await leadsRepository.insertInsight(
      organizationId,
      contactId,
      classification,
      result.usage?.model ?? null,
      actorUserId,
    );
    await auditService.record({
      actorUserId,
      organizationId,
      action: "Classificou lead com IA",
      type: "conteudo",
      target: insight.id,
    });
    return (await present(organizationId, [insight]))[0];
  },

  /**
   * Classificacao atual (a ultima aceita, pela hora do aceite, a mesma regra
   * do selo no funil), sugestao pendente e historico do contato.
   */
  async forContact(organizationId: string, contactId: string) {
    const rows = await present(
      organizationId,
      await leadsRepository.listForContact(organizationId, contactId),
    );
    const accepted = rows
      .filter((r) => r.status === "aceita")
      .sort((a, b) => +new Date(b.reviewedAt ?? 0) - +new Date(a.reviewedAt ?? 0));
    return {
      current: accepted[0] ?? null,
      pending: rows.find((r) => r.status === "sugerida") ?? null,
      history: rows,
    };
  },

  async review(actorUserId: string, organizationId: string, insightId: string, accepted: boolean) {
    const insight = await leadsRepository.findInsight(organizationId, insightId);
    if (!insight) throw new LeadInsightNotFoundError();
    const status = accepted ? "aceita" : "descartada";
    const result = await leadsRepository.review(organizationId, insightId, status, actorUserId);
    if (Number(result.numUpdatedRows) === 0) throw new LeadAlreadyReviewedError();
    await auditService.record({
      actorUserId,
      organizationId,
      action: accepted ? "Aceitou classificacao de lead" : "Descartou classificacao de lead",
      type: "conteudo",
      target: insightId,
    });
    const reviewed = await leadsRepository.findInsight(organizationId, insightId);
    return (await present(organizationId, [reviewed!]))[0];
  },

  /** Temperatura aceita de varios contatos (kanban do funil, lista de contatos). */
  async current(organizationId: string, contactIds: string[]) {
    const rows = await leadsRepository.currentFor(organizationId, [...new Set(contactIds)]);
    return Object.fromEntries(
      rows.map((r) => [r.contact_id, { temperature: r.temperature, confidence: r.confidence }]),
    );
  },

  /**
   * Worker de retencao: o resumo vem das conversas, entao sai junto com a
   * mais curta delas (o menor prazo entre a organizacao e seus assistentes).
   */
  async purgeExpired() {
    const shortest = new Map<string, number>();
    for (const a of await assistantsService.listAllWithEffectiveRetention()) {
      shortest.set(
        a.organizationId,
        Math.min(shortest.get(a.organizationId) ?? Infinity, a.retentionDays),
      );
    }
    const summary: { organizationId: string; deleted: number }[] = [];
    for (const organizationId of await leadsRepository.organizationsWithInsights()) {
      const { days } = await organizationsService.getRetentionPolicy(organizationId);
      const orgDays = days ?? PLATFORM_DEFAULT_RETENTION_DAYS;
      const effective = Math.min(orgDays, shortest.get(organizationId) ?? orgDays);
      const cutoff = new Date(Date.now() - effective * DAY_MS);
      const deleted = await leadsRepository.deleteOlderThan(organizationId, cutoff);
      if (deleted > 0) summary.push({ organizationId, deleted });
    }
    return summary;
  },

  async exportAll(organizationId: string) {
    return present(organizationId, await leadsRepository.exportAll(organizationId));
  },
};
