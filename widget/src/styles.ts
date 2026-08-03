import type { WidgetOptions } from "./types.js";

/** Isolado no shadow root (ADR-002 #8): nada daqui vaza para o site
 * hospedeiro nem sofre com o CSS dele. Variaveis customizaveis via atributos
 * do script (cor de destaque) ficam em --chatrag-accent. */
export function buildStyles(options: WidgetOptions): string {
  const side = options.position === "bottom-left" ? "left" : "right";
  const accent = options.accentColor || "#5B4FE9";

  return `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }

    :root, .chatrag-root {
      --chatrag-accent: ${accent};
      --chatrag-bg: #ffffff;
      --chatrag-fg: #1a1a1a;
      --chatrag-muted: #6b7280;
      --chatrag-border: #e5e7eb;
      --chatrag-bubble-visitor: ${accent};
      --chatrag-bubble-visitor-fg: #ffffff;
      --chatrag-bubble-assistant: #f3f4f6;
      --chatrag-bubble-assistant-fg: #1a1a1a;
    }
    .chatrag-root[data-theme="dark"] {
      --chatrag-bg: #1f2023;
      --chatrag-fg: #f5f5f5;
      --chatrag-muted: #9ca3af;
      --chatrag-border: #33343a;
      --chatrag-bubble-assistant: #2c2d31;
      --chatrag-bubble-assistant-fg: #f5f5f5;
    }
    @media (prefers-color-scheme: dark) {
      .chatrag-root[data-theme="sync"] {
        --chatrag-bg: #1f2023;
        --chatrag-fg: #f5f5f5;
        --chatrag-muted: #9ca3af;
        --chatrag-border: #33343a;
        --chatrag-bubble-assistant: #2c2d31;
        --chatrag-bubble-assistant-fg: #f5f5f5;
      }
    }

    .chatrag-launcher {
      position: fixed;
      bottom: 20px;
      ${side}: 20px;
      width: 56px;
      height: 56px;
      border-radius: 999px;
      background: var(--chatrag-accent);
      color: #fff;
      border: none;
      cursor: pointer;
      box-shadow: 0 8px 24px rgba(0,0,0,.18);
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 2147483000;
    }
    .chatrag-launcher svg { width: 26px; height: 26px; }

    .chatrag-panel {
      position: fixed;
      bottom: 88px;
      ${side}: 20px;
      width: 360px;
      max-width: calc(100vw - 40px);
      height: 520px;
      max-height: calc(100vh - 120px);
      background: var(--chatrag-bg);
      color: var(--chatrag-fg);
      border-radius: 16px;
      box-shadow: 0 12px 40px rgba(0,0,0,.22);
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 2147483000;
    }
    .chatrag-panel.chatrag-embedded {
      position: static;
      width: 100%;
      height: 100%;
      max-width: none;
      max-height: none;
      box-shadow: none;
      border: 1px solid var(--chatrag-border);
    }
    .chatrag-panel[hidden] { display: none; }

    .chatrag-header {
      background: var(--chatrag-accent);
      color: #fff;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 10px;
    }
    .chatrag-header-info {
      display: flex;
      align-items: center;
      gap: 10px;
      overflow: hidden;
    }
    .chatrag-header-text {
      display: flex;
      flex-direction: column;
    }
    .chatrag-header h1 { font-size: 15px; font-weight: 600; margin: 0; line-height: 1.2; }
    .chatrag-online-badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      font-size: 11px;
      opacity: 0.9;
      margin-top: 2px;
    }
    .chatrag-online-dot {
      width: 7px;
      height: 7px;
      background-color: #22c55e;
      border-radius: 50%;
      box-shadow: 0 0 6px rgba(34, 197, 94, 0.9);
    }
    .chatrag-avatar-img {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      object-fit: cover;
      border: 2px solid rgba(255, 255, 255, 0.8);
      flex-shrink: 0;
    }
    .chatrag-close { background: none; border: none; color: #fff; cursor: pointer; font-size: 18px; line-height: 1; padding: 4px; }

    .chatrag-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
    }
    .chatrag-msg-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
    }
    .chatrag-msg-row.visitante {
      justify-content: flex-end;
    }
    .chatrag-msg-row.assistente {
      justify-content: flex-start;
    }
    .chatrag-msg-avatar {
      width: 26px;
      height: 26px;
      border-radius: 50%;
      object-fit: cover;
      flex-shrink: 0;
      margin-bottom: 2px;
    }
    .chatrag-msg { max-width: 82%; padding: 9px 12px; border-radius: 14px; font-size: 13.5px; line-height: 1.4; white-space: pre-wrap; }
    .chatrag-msg.visitante { background: var(--chatrag-bubble-visitor); color: var(--chatrag-bubble-visitor-fg); border-bottom-right-radius: 4px; }
    .chatrag-msg.assistente { background: var(--chatrag-bubble-assistant); color: var(--chatrag-bubble-assistant-fg); border-bottom-left-radius: 4px; }
    .chatrag-msg.pending { opacity: .6; }

    .chatrag-feedback { display: flex; gap: 6px; margin-top: 2px; }
    .chatrag-feedback button { background: none; border: 1px solid var(--chatrag-border); border-radius: 8px; cursor: pointer; font-size: 12px; padding: 2px 8px; color: var(--chatrag-muted); }
    .chatrag-feedback button[data-active="true"] { border-color: var(--chatrag-accent); color: var(--chatrag-accent); }

    .chatrag-sectors { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .chatrag-sectors button { border: 1px solid var(--chatrag-accent); color: var(--chatrag-accent); background: none; border-radius: 999px; padding: 4px 10px; font-size: 12px; cursor: pointer; }

    .chatrag-footer { border-top: 1px solid var(--chatrag-border); padding: 10px; display: flex; gap: 8px; }
    .chatrag-input { flex: 1; border: 1px solid var(--chatrag-border); border-radius: 10px; padding: 9px 12px; font-size: 13.5px; background: var(--chatrag-bg); color: var(--chatrag-fg); resize: none; }
    .chatrag-send { background: var(--chatrag-accent); color: #fff; border: none; border-radius: 10px; padding: 0 14px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .chatrag-send:disabled { opacity: .5; cursor: default; }

    .chatrag-handoff { background: none; border: 1px solid var(--chatrag-border); color: var(--chatrag-muted); border-radius: 10px; padding: 0 10px; cursor: pointer; font-size: 12px; }
  `;
}
