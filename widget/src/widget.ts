import { createApiClient, ChatRagApiError, type ApiClient } from "./api.js";
import { el } from "./dom.js";
import { CHAT_ICON, CLOSE_ICON } from "./icons.js";
import { buildStyles } from "./styles.js";
import type { ChatMessage, WidgetOptions } from "./types.js";

interface RenderedMessage extends ChatMessage {
  feedback?: "positivo" | "negativo";
}

export class ChatRagWidget {
  private readonly api: ApiClient;
  private conversationId: string | null = null;
  private messages: RenderedMessage[] = [];
  private open = false;
  private sending = false;

  private root!: HTMLElement;
  private panel!: HTMLDivElement;
  private messagesEl!: HTMLDivElement;
  private input!: HTMLTextAreaElement;
  private sendBtn!: HTMLButtonElement;

  constructor(private readonly options: WidgetOptions) {
    this.api = createApiClient(options.apiBaseUrl);
  }

  mount() {
    const host = el("div", { id: "chatrag-widget-host" });
    const shadow = host.attachShadow({ mode: "open" });

    const style = document.createElement("style");
    style.textContent = buildStyles(this.options.position);
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
    void this.preflight();
  }

  /** Primeira chamada publica (docs/apis/contratos-planejados.md - Widget
   * publico): valida chave + origem antes do visitante tentar conversar,
   * para falhar cedo com uma mensagem clara em vez de um erro so no envio. */
  private async preflight() {
    try {
      await this.api.getConfig(this.options.key);
    } catch (err) {
      this.messages = [{ role: "assistente", content: this.describeError(err) }];
      this.sendBtn.disabled = true;
      this.input.disabled = true;
      this.renderMessages();
    }
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

    const headerChildren: (Node | string)[] = [el("h1", {}, [this.options.title])];
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

    const handoffBtn = el("button", { class: "chatrag-handoff" }, ["WhatsApp"]);
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
    const { conversationId } = await this.api.startConversation(this.options.key, {
      externalUserId: this.options.externalUserId,
      visitorName: this.options.visitorName,
      visitorEmail: this.options.visitorEmail,
      context: this.options.context,
    });
    this.conversationId = conversationId;
    return conversationId;
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
      const { answer } = await this.api.sendMessage(this.options.key, conversationId, text);
      this.messages.push({ role: "assistente", content: answer });
    } catch (err) {
      this.messages.push({ role: "assistente", content: this.describeError(err) });
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
      if (result.needsSectorSelection) {
        this.renderSectorChoice(result.sectors);
      } else {
        window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      this.messages.push({ role: "assistente", content: this.describeHandoffError(err) });
      this.renderMessages();
    }
  }

  /** O 409 aqui significa "sem WhatsApp configurado", nao "assistente fora do
   * ar" como em /messages. Reusar describeError diria ao visitante que o
   * atendimento quebrou, quando o chat esta funcionando normalmente. */
  private describeHandoffError(err: unknown): string {
    if (err instanceof ChatRagApiError) {
      if (err.status === 409)
        return "O encaminhamento para atendente nao esta disponivel neste atendimento.";
      if (err.status === 422) return "Nao consegui identificar o setor escolhido. Tente novamente.";
    }
    return this.describeError(err);
  }

  private async chooseSector(sectorId: string) {
    if (!this.conversationId) return;
    try {
      const result = await this.api.requestHandoff(this.options.key, this.conversationId, sectorId);
      if (!result.needsSectorSelection)
        window.open(result.whatsappUrl, "_blank", "noopener,noreferrer");
    } catch (err) {
      this.messages.push({ role: "assistente", content: this.describeError(err) });
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

  private describeError(err: unknown): string {
    if (err instanceof ChatRagApiError) {
      if (err.status === 429)
        return "Muitas mensagens em pouco tempo. Tente novamente em instantes.";
      if (err.status === 409) return "Este assistente esta temporariamente indisponivel.";
      if (err.status === 401 || err.status === 403)
        return "Este atendimento nao esta disponivel neste site.";
    }
    return "Nao foi possivel enviar sua mensagem agora. Tente novamente.";
  }

  private renderMessages() {
    this.messagesEl.innerHTML = "";
    this.messages.forEach((msg, index) => {
      const bubble = el("div", { class: `chatrag-msg ${msg.role}` }, [msg.content]);
      this.messagesEl.append(bubble);

      if (msg.role === "assistente" && index > 0) {
        const up = el("button", { "data-active": String(msg.feedback === "positivo") }, ["👍"]);
        up.addEventListener("click", () => this.handleFeedback(index, "positivo"));
        const down = el("button", { "data-active": String(msg.feedback === "negativo") }, ["👎"]);
        down.addEventListener("click", () => this.handleFeedback(index, "negativo"));
        this.messagesEl.append(el("div", { class: "chatrag-feedback" }, [up, down]));
      }
    });
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }
}
