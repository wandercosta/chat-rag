// Autogerado / empacotado: Script auto-embarcável do widget ChatRAG
export const WIDGET_SCRIPT_CONTENT = `(function(){"use strict";class d extends Error{constructor(e,t){super(t),this.status=e}}async function c(s,e,t){const a=await fetch(\`\${s}\${e}\`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(t)}),r=await a.json().catch(()=>({}));if(!a.ok)throw new d(a.status,r.error??"erro inesperado");return r}function p(s){return{getConfig(e){return c(s,"/widget/config",{key:e})},startConversation(e,t){return c(s,"/widget/conversations",{key:e,...t!=null&&t.externalUserId?{externalUserId:t.externalUserId}:{},...t!=null&&t.visitorName?{visitorName:t.visitorName}:{},...t!=null&&t.visitorEmail?{visitorEmail:t.visitorEmail}:{},...t!=null&&t.context?{context:t.context}:{}})},sendMessage(e,t,a){return c(s,\`/widget/conversations/\${t}/messages\`,{key:e,message:a})},sendFeedback(e,t,a){return c(s,\`/widget/conversations/\${t}/feedback\`,{key:e,rating:a})},requestHandoff(e,t,a){return c(s,\`/widget/conversations/\${t}/handoff\`,{key:e,sectorId:a})}}}function n(s,e={},t=[]){const a=document.createElement(s);for(const[r,i]of Object.entries(e))r==="html"?a.innerHTML=i:r==="class"?a.className=i:a.setAttribute(r,i);for(const r of t)a.append(r);return a}const u='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',f='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';function b(s){const e=s==="bottom-left"?"left":"right";return\`
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }

    :root, .chatrag-root {
      --chatrag-accent: #5B4FE9;
      --chatrag-bg: #ffffff;
      --chatrag-fg: #1a1a1a;
      --chatrag-muted: #6b7280;
      --chatrag-border: #e5e7eb;
      --chatrag-bubble-visitor: #5B4FE9;
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
      \${e}: 20px;
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
      \${e}: 20px;
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
      padding: 14px 16px;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .chatrag-header h1 { font-size: 15px; font-weight: 600; margin: 0; }
    .chatrag-close { background: none; border: none; color: #fff; cursor: pointer; font-size: 18px; line-height: 1; padding: 4px; }

    .chatrag-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 10px;
    }
    .chatrag-msg { max-width: 82%; padding: 9px 12px; border-radius: 14px; font-size: 13.5px; line-height: 1.4; white-space: pre-wrap; }
    .chatrag-msg.visitante { align-self: flex-end; background: var(--chatrag-bubble-visitor); color: var(--chatrag-bubble-visitor-fg); border-bottom-right-radius: 4px; }
    .chatrag-msg.assistente { align-self: flex-start; background: var(--chatrag-bubble-assistant); color: var(--chatrag-bubble-assistant-fg); border-bottom-left-radius: 4px; }
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
  \`}class m{constructor(e){this.options=e,this.conversationId=null,this.messages=[],this.open=!1,this.sending=!1,this.api=p(e.apiBaseUrl)}mount(){const e=n("div",{id:"chatrag-widget-host"}),t=e.attachShadow({mode:"open"}),a=document.createElement("style");a.textContent=b(this.options.position),t.append(a),this.root=n("div",{class:"chatrag-root","data-theme":this.options.theme}),t.append(this.root),this.buildPanel(),this.options.mode==="embedded"?(this.panel.classList.add("chatrag-embedded"),this.open=!0,this.panel.hidden=!1):(this.buildLauncher(),this.panel.hidden=!0),((this.options.mountSelector?document.querySelector(this.options.mountSelector):null)??document.body).append(e),this.renderGreeting(),this.preflight()}async preflight(){try{await this.api.getConfig(this.options.key)}catch(e){this.messages=[{role:"assistente",content:this.describeError(e)}],this.sendBtn.disabled=!0,this.input.disabled=!0,this.renderMessages()}}buildLauncher(){const e=n("button",{class:"chatrag-launcher","aria-label":this.options.title,html:u});e.addEventListener("click",()=>this.toggle()),this.root.append(e)}buildPanel(){const e=n("button",{class:"chatrag-close","aria-label":"Fechar",html:f});e.addEventListener("click",()=>this.toggle());const t=[n("h1",{},[this.options.title])];this.options.mode==="floating"&&t.push(e);const a=n("div",{class:"chatrag-header"},t);this.messagesEl=n("div",{class:"chatrag-messages"}),this.input=n("textarea",{class:"chatrag-input",rows:"1",placeholder:"Escreva sua mensagem..."}),this.input.addEventListener("keydown",l=>{l.key==="Enter"&&!l.shiftKey&&(l.preventDefault(),this.handleSend())}),this.sendBtn=n("button",{class:"chatrag-send"},["Enviar"]),this.sendBtn.addEventListener("click",()=>this.handleSend());const r=n("button",{class:"chatrag-handoff"},["WhatsApp"]);r.addEventListener("click",()=>this.handleHandoff());const i=n("div",{class:"chatrag-footer"},[this.input,r,this.sendBtn]);this.panel=n("div",{class:"chatrag-panel"},[a,this.messagesEl,i]),this.root.append(this.panel)}toggle(){this.open=!this.open,this.panel.hidden=!this.open}renderGreeting(){this.options.greeting&&(this.messages.push({role:"assistente",content:this.options.greeting}),this.renderMessages())}async ensureConversation(){if(this.conversationId)return this.conversationId;const{conversationId:e}=await this.api.startConversation(this.options.key,{externalUserId:this.options.externalUserId,visitorName:this.options.visitorName,visitorEmail:this.options.visitorEmail,context:this.options.context});return this.conversationId=e,e}async handleSend(){const e=this.input.value.trim();if(!(!e||this.sending)){this.input.value="",this.messages.push({role:"visitante",content:e}),this.renderMessages(),this.setSending(!0);try{const t=await this.ensureConversation(),{answer:a}=await this.api.sendMessage(this.options.key,t,e);this.messages.push({role:"assistente",content:a})}catch(t){this.messages.push({role:"assistente",content:this.describeError(t)})}finally{this.setSending(!1),this.renderMessages()}}}async handleFeedback(e,t){if(this.conversationId){this.messages[e].feedback=t,this.renderMessages();try{await this.api.sendFeedback(this.options.key,this.conversationId,t)}catch{}}}async handleHandoff(){try{const e=await this.ensureConversation(),t=await this.api.requestHandoff(this.options.key,e);t.needsSectorSelection?this.renderSectorChoice(t.sectors):window.open(t.whatsappUrl,"_blank","noopener,noreferrer")}catch(e){this.messages.push({role:"assistente",content:this.describeHandoffError(e)}),this.renderMessages()}}describeHandoffError(e){if(e instanceof d){if(e.status===409)return"O encaminhamento para atendente nao esta disponivel neste atendimento.";if(e.status===422)return"Nao consegui identificar o setor escolhido. Tente novamente."}return this.describeError(e)}async chooseSector(e){if(this.conversationId)try{const t=await this.api.requestHandoff(this.options.key,this.conversationId,e);t.needsSectorSelection||window.open(t.whatsappUrl,"_blank","noopener,noreferrer")}catch(t){this.messages.push({role:"assistente",content:this.describeError(t)}),this.renderMessages()}}renderSectorChoice(e){var a;(a=this.messagesEl.querySelector(".chatrag-sectors"))==null||a.remove();const t=n("div",{class:"chatrag-sectors"},e.map(r=>{const i=n("button",{},[r.name]);return i.addEventListener("click",()=>this.chooseSector(r.id)),i}));this.messagesEl.append(t),this.messagesEl.scrollTop=this.messagesEl.scrollHeight}setSending(e){this.sending=e,this.sendBtn.disabled=e}describeError(e){if(e instanceof d){if(e.status===429)return"Muitas mensagens em pouco tempo. Tente novamente em instantes.";if(e.status===409)return"Este assistente esta temporariamente indisponivel.";if(e.status===401||e.status===403)return"Este atendimento nao esta disponivel neste site."}return"Nao foi possivel enviar sua mensagem agora. Tente novamente."}renderMessages(){this.messagesEl.innerHTML="",this.messages.forEach((e,t)=>{const a=n("div",{class:\`chatrag-msg \${e.role}\`},[e.content]);if(this.messagesEl.append(a),e.role==="assistente"&&t>0){const r=n("button",{"data-active":String(e.feedback==="positivo")},["👍"]);r.addEventListener("click",()=>this.handleFeedback(t,"positivo"));const i=n("button",{"data-active":String(e.feedback==="negativo")},["👎"]);i.addEventListener("click",()=>this.handleFeedback(t,"negativo")),this.messagesEl.append(n("div",{class:"chatrag-feedback"},[r,i]))}}),this.messagesEl.scrollTop=this.messagesEl.scrollHeight}}const h=document.currentScript;function o(s,e=""){return(h==null?void 0:h.getAttribute(s))??e}function x(){const s=o("data-context");if(!s)return null;try{const e=JSON.parse(s);if(e&&typeof e=="object"&&!Array.isArray(e))return e;console.error(\`[chatrag-widget] data-context precisa ser um objeto JSON, ex.: '{"plano":"Pro"}'\`)}catch{console.error("[chatrag-widget] data-context nao e um JSON valido")}return null}function v(){const s=o("data-key");return s?{key:s,apiBaseUrl:o("data-api","http://localhost:3333"),mode:o("data-mode","floating")==="embedded"?"embedded":"floating",position:o("data-position","bottom-right")==="bottom-left"?"bottom-left":"bottom-right",theme:["light","dark","sync"].includes(o("data-theme"))?o("data-theme"):"light",title:o("data-title","Fale com a gente"),greeting:o("data-greeting","Ola! Como posso ajudar?"),mountSelector:o("data-mount")||null,identityToken:o("data-identity-token")||null,externalUserId:o("data-external-user-id")||null,visitorName:o("data-visitor-name")||null,visitorEmail:o("data-visitor-email")||null,context:x()}:(console.error("[chatrag-widget] atributo data-key e obrigatorio no <script>"),null)}function g(){const s=v();s&&new m(s).mount()}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",g):g()})();
`;
