import { ChatRagWidget } from "./widget.js";
import type { Mode, Position, Theme, WidgetOptions } from "./types.js";

// Capturado de imediato: document.currentScript so e confiavel enquanto o
// script esta executando de forma sincrona (funciona com async, nao apos um await).
const scriptEl = document.currentScript as HTMLScriptElement | null;

function attr(name: string, fallback = ""): string {
  return scriptEl?.getAttribute(name) ?? fallback;
}

function readOptions(): WidgetOptions | null {
  const key = attr("data-key");
  if (!key) {
    console.error("[chatrag-widget] atributo data-key e obrigatorio no <script>");
    return null;
  }

  return {
    key,
    apiBaseUrl: attr("data-api", __CHATRAG_DEFAULT_API_BASE_URL__),
    mode: (attr("data-mode", "floating") as Mode) === "embedded" ? "embedded" : "floating",
    position: (attr("data-position", "bottom-right") as Position) === "bottom-left" ? "bottom-left" : "bottom-right",
    theme: (["light", "dark", "sync"] as Theme[]).includes(attr("data-theme") as Theme)
      ? (attr("data-theme") as Theme)
      : "light",
    title: attr("data-title", "Fale com a gente"),
    greeting: attr("data-greeting", "Ola! Como posso ajudar?"),
    mountSelector: attr("data-mount") || null,
    identityToken: attr("data-identity-token") || null,
  };
}

function init() {
  const options = readOptions();
  if (!options) return;
  new ChatRagWidget(options).mount();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
