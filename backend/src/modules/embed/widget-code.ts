// Autogerado / empacotado: Script auto-embarcável do widget ChatRAG (com suporte a cor customizada, avatar e online badge)
export const WIDGET_SCRIPT_CONTENT = `(function(){"use strict";class g extends Error{constructor(t,e){super(e),this.status=t}}async function c(n,t,e){const s=await fetch(\`\${n}\${t}\`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)}),r=await s.json().catch(()=>({}));if(!s.ok)throw new g(s.status,r.error??"erro inesperado");return r}function m(n){return{getConfig(t){return c(n,"/widget/config",{key:t})},startConversation(t,e){return c(n,"/widget/conversations",{key:t,...e!=null&&e.externalUserId?{externalUserId:e.externalUserId}:{},...e!=null&&e.visitorName?{visitorName:e.visitorName}:{},...e!=null&&e.visitorEmail?{visitorEmail:e.visitorEmail}:{},...e!=null&&e.context?{context:e.context}:{}})},sendMessage(t,e,s){return c(n,\`/widget/conversations/\${e}/messages\`,{key:t,message:s})},sendFeedback(t,e,s){return c(n,\`/widget/conversations/\${e}/feedback\`,{key:t,rating:s})},requestHandoff(t,e,s){return c(n,\`/widget/conversations/\${e}/handoff\`,{key:t,sectorId:s})}}}function a(n,t={},e=[]){const s=document.createElement(n);for(const[r,i]of Object.entries(t))r==="html"?s.innerHTML=i:r==="class"?s.className=i:s.setAttribute(r,i);for(const r of e)s.append(r);return s}const x='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',v='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';function w(n){const t=n.position==="bottom-left"?"left":"right",e=n.accentColor||"#5B4FE9";return\`
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }

    :root, .chatrag-root {
      --chatrag-accent: \${e};
      --chatrag-bg: #ffffff;
      --chatrag-fg: #1a1a1a;
      --chatrag-muted: #6b7280;
      --chatrag-border: #e5e7eb;
      --chatrag-bubble-visitor: \${e};
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
      \${t}: 20px;
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
      \${t}: 20px;
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
  \`}class y{constructor(t){this.options=t,this.conversationId=null,this.messages=[],this.open=!1,this.sending=!1,this.api=m(t.apiBaseUrl)}mount(){const t=a("div",{id:"chatrag-widget-host"}),e=t.attachShadow({mode:"open"}),s=document.createElement("style");s.textContent=w(this.options),e.append(s),this.root=a("div",{class:"chatrag-root","data-theme":this.options.theme}),e.append(this.root),this.buildPanel(),this.options.mode==="embedded"?(this.panel.classList.add("chatrag-embedded"),this.open=!0,this.panel.hidden=!1):(this.buildLauncher(),this.panel.hidden=!0),((this.options.mountSelector?document.querySelector(this.options.mountSelector):null)??document.body).append(t),this.renderGreeting(),this.preflight()}async preflight(){try{await this.api.getConfig(this.options.key)}catch(t){this.messages=[{role:"assistente",content:this.describeError(t)}],this.sendBtn.disabled=!0,this.input.disabled=!0,this.renderMessages()}}buildLauncher(){const t=a("button",{class:"chatrag-launcher","aria-label":this.options.title,html:x});t.addEventListener("click",()=>this.toggle()),this.root.append(t)}buildPanel(){const t=a("button",{class:"chatrag-close","aria-label":"Fechar",html:v});t.addEventListener("click",()=>this.toggle());const s=[a("h1",{},[this.options.title])];if(this.options.showOnlineBadge){const h=a("span",{class:"chatrag-online-dot"}),C=a("span",{},["Online"]);s.push(a("div",{class:"chatrag-online-badge"},[h,C]))}const r=a("div",{class:"chatrag-header-text"},s),i=[];this.options.avatarUrl&&i.push(a("img",{src:this.options.avatarUrl,class:"chatrag-avatar-img",alt:this.options.title})),i.push(r);const d=[a("div",{class:"chatrag-header-info"},i)];this.options.mode==="floating"&&d.push(t);const l=a("div",{class:"chatrag-header"},d);this.messagesEl=a("div",{class:"chatrag-messages"}),this.input=a("textarea",{class:"chatrag-input",rows:"1",placeholder:"Escreva sua mensagem..."}),this.input.addEventListener("keydown",h=>{h.key==="Enter"&&!h.shiftKey&&(h.preventDefault(),this.handleSend())}),this.sendBtn=a("button",{class:"chatrag-send"},["Enviar"]),this.sendBtn.addEventListener("click",()=>this.handleSend());const b=a("button",{class:"chatrag-handoff"},["WhatsApp"]);b.addEventListener("click",()=>this.handleHandoff());const S=a("div",{class:"chatrag-footer"},[this.input,b,this.sendBtn]);this.panel=a("div",{class:"chatrag-panel"},[l,this.messagesEl,S]),this.root.append(this.panel)}toggle(){this.open=!this.open,this.panel.hidden=!this.open}renderGreeting(){this.options.greeting&&(this.messages.push({role:"assistente",content:this.options.greeting}),this.renderMessages())}async ensureConversation(){if(this.conversationId)return this.conversationId;const{conversationId:t}=await this.api.startConversation(this.options.key,{externalUserId:this.options.externalUserId,visitorName:this.options.visitorName,visitorEmail:this.options.visitorEmail,context:this.options.context});return this.conversationId=t,t}async handleSend(){const t=this.input.value.trim();if(!(!t||this.sending)){this.input.value="",this.messages.push({role:"visitante",content:t}),this.renderMessages(),this.setSending(!0);try{const e=await this.ensureConversation(),{answer:s}=await this.api.sendMessage(this.options.key,e,t);this.messages.push({role:"assistente",content:s})}catch(e){this.messages.push({role:"assistente",content:this.describeError(e)})}finally{this.setSending(!1),this.renderMessages()}}}async handleFeedback(t,e){if(this.conversationId){this.messages[t].feedback=e,this.renderMessages();try{await this.api.sendFeedback(this.options.key,this.conversationId,e)}catch{}}}async handleHandoff(){try{const t=await this.ensureConversation(),e=await this.api.requestHandoff(this.options.key,t);e.needsSectorSelection?this.renderSectorChoice(e.sectors):window.open(e.whatsappUrl,"_blank","noopener,noreferrer")}catch(t){this.messages.push({role:"assistente",content:this.describeHandoffError(t)}),this.renderMessages()}}describeHandoffError(t){if(t instanceof g){if(t.status===409)return"O encaminhamento para atendente nao esta disponivel neste atendimento.";if(t.status===422)return"Nao consegui identificar o setor escolhido. Tente novamente."}return this.describeError(t)}async chooseSector(t){if(this.conversationId)try{const e=await this.api.requestHandoff(this.options.key,this.conversationId,t);e.needsSectorSelection||window.open(e.whatsappUrl,"_blank","noopener,noreferrer")}catch(e){this.messages.push({role:"assistente",content:this.describeError(e)}),this.renderMessages()}}renderSectorChoice(t){var s;(s=this.messagesEl.querySelector(".chatrag-sectors"))==null||s.remove();const e=a("div",{class:"chatrag-sectors"},t.map(r=>{const i=a("button",{},[r.name]);return i.addEventListener("click",()=>this.chooseSector(r.id)),i}));this.messagesEl.append(e),this.messagesEl.scrollTop=this.messagesEl.scrollHeight}setSending(t){this.sending=t,this.sendBtn.disabled=t}describeError(t){if(t instanceof g){if(t.status===429)return"Muitas mensagens em pouco tempo. Tente novamente em instantes.";if(t.status===409)return"Este assistente esta temporariamente indisponivel.";if(t.status===401||t.status===403)return"Este atendimento nao esta disponivel neste site."}return"Nao foi possivel enviar sua mensagem agora. Tente novamente."}renderMessages(){this.messagesEl.innerHTML="",this.messages.forEach((t,e)=>{const s=a("div",{class:\`chatrag-msg \${t.role}\`},[t.content]);if(t.role==="assistente"&&this.options.avatarUrl){const r=a("img",{src:this.options.avatarUrl,class:"chatrag-msg-avatar",alt:"Avatar"}),i=a("div",{style:"display: flex; flex-direction: column; max-width: 82%;"},[s]);if(e>0){const d=a("button",{"data-active":String(t.feedback==="positivo")},["👍"]);d.addEventListener("click",()=>this.handleFeedback(e,"positivo"));const l=a("button",{"data-active":String(t.feedback==="negativo")},["👎"]);l.addEventListener("click",()=>this.handleFeedback(e,"negativo")),i.append(a("div",{class:"chatrag-feedback"},[d,l]))}const u=a("div",{class:"chatrag-msg-row assistente"},[r,i]);this.messagesEl.append(u)}else if(this.messagesEl.append(s),t.role==="assistente"&&e>0){const r=a("button",{"data-active":String(t.feedback==="positivo")},["👍"]);r.addEventListener("click",()=>this.handleFeedback(e,"positivo"));const i=a("button",{"data-active":String(t.feedback==="negativo")},["👎"]);i.addEventListener("click",()=>this.handleFeedback(e,"negativo")),this.messagesEl.append(a("div",{class:"chatrag-feedback"},[r,i]))}}),this.messagesEl.scrollTop=this.messagesEl.scrollHeight}}const p=document.currentScript;function o(n,t=""){return(p==null?void 0:p.getAttribute(n))??t}function k(){const n=o("data-context");if(!n)return null;try{const t=JSON.parse(n);if(t&&typeof t=="object"&&!Array.isArray(t))return t;console.error(\`[chatrag-widget] data-context precisa ser um objeto JSON, ex.: '{"plano":"Pro"}'\`)}catch{console.error("[chatrag-widget] data-context nao e um JSON valido")}return null}function E(){const n=o("data-key");return n?{key:n,apiBaseUrl:o("data-api","http://localhost:3333"),mode:o("data-mode","floating")==="embedded"?"embedded":"floating",position:o("data-position","bottom-right")==="bottom-left"?"bottom-left":"bottom-right",theme:["light","dark","sync"].includes(o("data-theme"))?o("data-theme"):"light",title:o("data-title","Fale com a gente"),greeting:o("data-greeting","Ola! Como posso ajudar?"),accentColor:o("data-accent")||o("data-color")||null,avatarUrl:o("data-avatar")||null,showOnlineBadge:o("data-online","true")!=="false",mountSelector:o("data-mount")||null,identityToken:o("data-identity-token")||null,externalUserId:o("data-external-user-id")||null,visitorName:o("data-visitor-name")||null,visitorEmail:o("data-visitor-email")||null,context:k()}:(console.error("[chatrag-widget] atributo data-key e obrigatorio no <script>"),null)}function f(){const n=E();n&&new y(n).mount()}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",f):f()})();
`;
