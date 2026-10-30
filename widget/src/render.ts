import { el } from "./dom.js";
import type { ChatMessage, Citation } from "./types.js";

/** Mensagem na tela: as da conversa e os avisos do proprio widget (ex.:
 * "pedido enviado ao atendente"), que nao existem no servidor. */
export interface RenderedMessage {
  role: ChatMessage["role"] | "aviso";
  content: string;
  citations?: Citation[];
  feedback?: "positivo" | "negativo";
}

interface RenderOptions {
  avatarUrl: string | null;
  onFeedback(index: number, rating: "positivo" | "negativo"): void;
}

/** "Fontes" abaixo da resposta: documento de origem + trecho (expansivel). */
function renderCitations(citations: Citation[]): HTMLElement {
  return el("div", { class: "chatrag-citations" }, [
    el("span", { class: "chatrag-citations-label" }, ["Fontes"]),
    ...citations.map((c) =>
      el("details", { class: "chatrag-citation" }, [
        el("summary", {}, [`[${c.index}] ${c.sourceTitle}`]),
        el("p", {}, [c.excerpt]),
      ]),
    ),
  ]);
}

function renderFeedback(msg: RenderedMessage, index: number, options: RenderOptions): HTMLElement {
  const up = el("button", { "data-active": String(msg.feedback === "positivo") }, ["👍"]);
  up.addEventListener("click", () => options.onFeedback(index, "positivo"));
  const down = el("button", { "data-active": String(msg.feedback === "negativo") }, ["👎"]);
  down.addEventListener("click", () => options.onFeedback(index, "negativo"));
  return el("div", { class: "chatrag-feedback" }, [up, down]);
}

export function renderMessages(
  container: HTMLElement,
  messages: RenderedMessage[],
  options: RenderOptions,
) {
  container.innerHTML = "";
  messages.forEach((msg, index) => {
    if (msg.role === "aviso") {
      container.append(el("div", { class: "chatrag-notice" }, [msg.content]));
      return;
    }

    const bubble = el("div", { class: `chatrag-msg ${msg.role}` }, [msg.content]);

    // A resposta humana vem identificada: o visitante sabe com quem fala.
    if (msg.role === "atendente") {
      container.append(el("span", { class: "chatrag-author" }, ["Atendente"]), bubble);
      return;
    }

    if (msg.role === "assistente" && options.avatarUrl) {
      const avatar = el("img", {
        src: options.avatarUrl,
        class: "chatrag-msg-avatar",
        alt: "Avatar",
      });
      const msgContainer = el(
        "div",
        { style: "display: flex; flex-direction: column; max-width: 82%;" },
        [bubble],
      );
      if (msg.citations?.length) msgContainer.append(renderCitations(msg.citations));
      if (index > 0) msgContainer.append(renderFeedback(msg, index, options));
      container.append(el("div", { class: "chatrag-msg-row assistente" }, [avatar, msgContainer]));
      return;
    }

    container.append(bubble);
    if (msg.role === "assistente" && msg.citations?.length) {
      container.append(renderCitations(msg.citations));
    }
    if (msg.role === "assistente" && index > 0) {
      container.append(renderFeedback(msg, index, options));
    }
  });
  container.scrollTop = container.scrollHeight;
}
