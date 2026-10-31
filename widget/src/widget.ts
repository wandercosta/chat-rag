import { createApiClient, type ApiClient } from "./api.js";
import { describeError, describeHandoffError } from "./errors.js";
import { el } from "./dom.js";
import { CHAT_ICON, CLOSE_ICON } from "./icons.js";
import { renderMessages, type RenderedMessage } from "./render.js";
import { buildStyles } from "./styles.js";
import type { InboxEvent, WidgetOptions } from "./types.js";

export class ChatRagWidget {
  private readonly api: ApiClient;
  private conversationId: string | null = null;
  private messages: RenderedMessage[] = [];
  private open = false;
  private sending = false;
  private events: EventSource | null = null;

  private root!: HTMLElement;
  private panel!: HTMLDivElement;
  private messagesEl!: HTMLDivElement;
  private input!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;

  constructor(private readonly options: WidgetOptions) {
    this.api = createApiClient(options.apiBaseUrl);
  }

  mount(configError: unknown = null) {
    const host = el("div", { id: "chatrag-widget-host" });
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = buildStyles(this.options);
    shadow.append(style);

    this.root = el("div", { class: "chatrag-root", "data-theme": this.options.theme });
    shadow.append(this.root);

    this.buildPanel();

    if (this.options.mode === "embedded") {
      this.panel.classList.add("chatrag-embedded");
      this.open = true;
      this.panel.hidden = false;
    } else {
      this.buildLauncher();
      this.panel.hidden = true;
    }

    const mountPoint = this.options.mountSelector
      ? document.querySelector(this.options.mountSelector)
      : null;
    (mountPoint ?? document.body).append(host);

    this.renderGreeting();
    this.afterConfig(configError);
  }

  /** A config publica (docs/apis/contratos-planejados.md - Widget publico) e
   * buscada antes do mount, em main.ts. Se falhou (chave ou origem invalida),
   * o widget mostra o motivo em vez de falhar so no primeiro envio. */
  private afterConfig(configError: unknown) {
    if (configError) {
      this.messages = [{ role: "assistente", content: describeError(configError) }];
      this.sendBtn.disabled = true;
      this.input.disabled = true;
      this.renderMessages();
      return;
    }
    // Visitante identificado: abre a conversa ja, para retomar o historico.
    if (this.options.externalUserId || this.options.identityToken) void this.ensureConversation();
  }

  private buildLauncher() {
    const launcher = el("button", {
      class: "chatrag-launcher",
      "aria-label": this.options.title,
      html: CHAT_ICON,
    });
    launcher.addEventListener("click", () => this.toggle());
    this.root.append(launcher);
  }

  private buildPanel() {
    const closeBtn = el("button", {
      class: "chatrag-close",
      "aria-label": "Fechar",
      html: CLOSE_ICON,
    });
    closeBtn.addEventListener("click", () => this.toggle());

    const titleEl = el("h1", {}, [this.options.title]);
    const textChildren: (Node | string)[] = [titleEl];

    if (this.options.showOnlineBadge) {
      const dot = el("span", { class: "chatrag-online-dot" });
      const onlineText = el("span", {}, ["Online"]);
      textChildren.push(el("div", { class: "chatrag-online-badge" }, [dot, onlineText]));
    }

    const headerText = el("div", { class: "chatrag-header-text" }, textChildren);
    const infoChildren: (Node | string)[] = [];

    if (this.options.avatarUrl) {
      infoChildren.push(
        el("img", {
          src: this.options.avatarUrl,
          class: "chatrag-avatar-img",
          alt: this.options.title,
        }),
      );
    }
    infoChildren.push(headerText);

    const headerInfo = el("div", { class: "chatrag-header-info" }, infoChildren);
    const headerChildren: (Node | string)[] = [headerInfo];
    if (this.options.mode === "floating") headerChildren.push(closeBtn);

    const header = el("div", { class: "chatrag-header" }, headerChildren);

    this.messagesEl = el("div", { class: "chatrag-messages" });

    this.input = el("textarea", {
      class: "chatrag-input",
      rows: "1",
      placeholder: "Escreva sua mensagem...",
    });
    this.input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        this.handleSend();
      }
    });

    this.sendBtn = el("button", { class: "chatrag-send" }, ["Enviar"]);
    this.sendBtn.addEventListener("click", () => this.handleSend());

    // Com a caixa de entrada ligada, o atendente responde aqui mesmo; senao,
    // o botao abre o WhatsApp do setor (ADR-006).
    const handoffBtn = el("button", { class: "chatrag-handoff" }, [
      this.options.humanInbox ? "Falar com atendente" : "WhatsApp",
    ]);
    handoffBtn.addEventListener("click", () => this.handleHandoff());

    const footer = el("div", { class: "chatrag-footer" }, [this.input, handoffBtn, this.sendBtn]);

    this.panel = el("div", { class: "chatrag-panel" }, [header, this.messagesEl, footer]);
    this.root.append(this.panel);
  }

  private toggle() {
    this.open = !this.open;
    this.panel.hidden = !this.open;
  }

  private renderGreeting() {
    if (this.options.greeting) {
      this.messages.push({ role: "assistente", content: this.options.greeting });
      this.renderMessages();
    }
  }

  private async ensureConversation(): Promise<string> {
    if (this.conversationId) return this.conversationId;
    const res = await this.api.startConversation(this.options.key, {
      externalUserId: this.options.externalUserId,
      visitorName: this.options.visitorName,
      visitorEmail: this.options.visitorEmail,
      context: this.options.context,
      identityToken: this.options.identityToken,
    });
    this.conversationId = res.conversationId;
    this.connectEvents();
    if (res.isResumed && res.messages && res.messages.length > 0) {
      this.messages = res.messages.map((m) => ({
        role: m.role,
        content: m.content,
        citations: m.citations,
      }));
      this.renderMessages();
    }
    return res.conversationId;
  }

  private async handleSend() {
    const text = this.input.value.trim();
    if (!text || this.sending) return;

    this.input.value = "";
    this.messages.push({ role: "visitante", content: text });
    this.renderMessages();
    this.setSending(true);

    try {
      const conversationId = await this.ensureConversation();
      // A resposta aparece enquanto o assistente escreve; no fim, a final
      // substitui o texto parcial (e leva as fontes).
      let partial: RenderedMessage | null = null;
      const { answer, citations } = await this.api.sendMessageStream(
        this.options.key,
        conversationId,
        text,
        (delta) => {
          if (!partial) {
            partial = { role: "assistente", content: "" };
            this.messages.push(partial);
          }
          partial.content += delta;
          this.renderMessages();
        },
      );
      if (partial) this.messages.splice(this.messages.indexOf(partial), 1);
      // Sem resposta = um atendente esta na conversa; a dele chega por evento.
      if (answer !== null) this.messages.push({ role: "assistente", content: answer, citations });
    } catch (err) {
      this.messages.push({ role: "assistente", content: describeError(err) });
    } finally {
      this.setSending(false);
      this.renderMessages();
    }
  }

  private async handleFeedback(index: number, rating: "positivo" | "negativo") {
    if (!this.conversationId) return;
    this.messages[index].feedback = rating;
    this.renderMessages();
    try {
      await this.api.sendFeedback(this.options.key, this.conversationId, rating);
    } catch {
      // feedback e best-effort; nao interrompe a conversa em caso de falha.
    }
  }

  private async handleHandoff() {
    try {
      const conversationId = await this.ensureConversation();
      const result = await this.api.requestHandoff(this.options.key, conversationId);
      if ("inbox" in result) {
        this.messages.push({
          role: "aviso",
          content: "Pedido enviado. Um atendente vai continuar a conversa aqui.",
        });
        this.renderMessages();
      } else if (result.needsSectorSelection) {
        this.renderSectorChoice(result.sectors);
      } else {
        window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      this.messages.push({ role: "assistente", content: describeHandoffError(err) });
      this.renderMessages();
    }
  }

  private async chooseSector(sectorId: string) {
    if (!this.conversationId) return;
    try {
      const result = await this.api.requestHandoff(this.options.key, this.conversationId, sectorId);
      if (!("inbox" in result) && !result.needsSectorSelection)
        window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      this.messages.push({ role: "assistente", content: describeError(err) });
      this.renderMessages();
    }
  }

  private renderSectorChoice(sectors: { id: string; name: string }[]) {
    this.messagesEl.querySelector(".chatrag-sectors")?.remove();
    const container = el(
      "div",
      { class: "chatrag-sectors" },
      sectors.map((sector) => {
        const btn = el("button", {}, [sector.name]);
        btn.addEventListener("click", () => this.chooseSector(sector.id));
        return btn;
      }),
    );
    this.messagesEl.append(container);
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private setSending(value: boolean) {
    this.sending = value;
    this.sendBtn.disabled = value;
  }

  /** Tempo real so com a caixa de entrada ligada: e por aqui que a resposta
   * do atendente chega. O EventSource reconecta sozinho se a rede cair. */
  private connectEvents() {
    if (!this.options.humanInbox || !this.conversationId || this.events) return;
    this.events = new EventSource(this.api.eventsUrl(this.options.key, this.conversationId));
    this.events.onmessage = (e) => {
      let event: InboxEvent;
      try {
        event = JSON.parse(e.data) as InboxEvent;
      } catch {
        return;
      }
      this.handleInboxEvent(event);
    };
  }

  private handleInboxEvent(event: InboxEvent) {
    if (event.kind === "agent_message") {
      this.messages.push({ role: "atendente", content: event.content });
    } else if (event.status === "resolvida") {
      this.messages.push({
        role: "aviso",
        content: "Atendimento encerrado. Obrigado pelo contato!",
      });
    } else {
      return;
    }
    this.renderMessages();
  }

  private renderMessages() {
    renderMessages(this.messagesEl, this.messages, {
      avatarUrl: this.options.avatarUrl,
      onFeedback: (index, rating) => this.handleFeedback(index, rating),
    });
  }
}
