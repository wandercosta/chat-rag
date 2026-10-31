(function(){"use strict";class u extends Error{constructor(t,e){super(e),this.status=t}}async function h(a,t,e){const n=await fetch(`${a}${t}`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(e)}),r=await n.json().catch(()=>({}));if(!n.ok)throw new u(n.status,r.error??"erro inesperado");return r}function x(a){return{getConfig(t){return h(a,"/widget/config",{key:t})},startConversation(t,e){return h(a,"/widget/conversations",{key:t,...e!=null&&e.externalUserId?{externalUserId:e.externalUserId}:{},...e!=null&&e.visitorName?{visitorName:e.visitorName}:{},...e!=null&&e.visitorEmail?{visitorEmail:e.visitorEmail}:{},...e!=null&&e.context?{context:e.context}:{},...e!=null&&e.identityToken?{identityToken:e.identityToken}:{}})},sendMessage(t,e,n){return h(a,`/widget/conversations/${e}/messages`,{key:t,message:n})},sendFeedback(t,e,n){return h(a,`/widget/conversations/${e}/feedback`,{key:t,rating:n})},eventsUrl(t,e){return`${a}/widget/conversations/${e}/events?key=${encodeURIComponent(t)}`},requestHandoff(t,e,n){return h(a,`/widget/conversations/${e}/handoff`,{key:t,sectorId:n})}}}function p(a){if(a instanceof u){if(a.status===429)return"Muitas mensagens em pouco tempo. Tente novamente em instantes.";if(a.status===409)return"Este assistente esta temporariamente indisponivel.";if(a.status===401||a.status===403)return"Este atendimento nao esta disponivel neste site."}return"Nao foi possivel enviar sua mensagem agora. Tente novamente."}function w(a){if(a instanceof u){if(a.status===409)return"O encaminhamento para atendente nao esta disponivel neste atendimento.";if(a.status===422)return"Nao consegui identificar o setor escolhido. Tente novamente."}return p(a)}function s(a,t={},e=[]){const n=document.createElement(a);for(const[r,c]of Object.entries(t))r==="html"?n.innerHTML=c:r==="class"?n.className=c:n.setAttribute(r,c);for(const r of e)n.append(r);return n}const k='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>',C='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>';function m(a){return s("div",{class:"chatrag-citations"},[s("span",{class:"chatrag-citations-label"},["Fontes"]),...a.map(t=>s("details",{class:"chatrag-citation"},[s("summary",{},[`[${t.index}] ${t.sourceTitle}`]),s("p",{},[t.excerpt])]))])}function v(a,t,e){const n=s("button",{"data-active":String(a.feedback==="positivo")},["👍"]);n.addEventListener("click",()=>e.onFeedback(t,"positivo"));const r=s("button",{"data-active":String(a.feedback==="negativo")},["👎"]);return r.addEventListener("click",()=>e.onFeedback(t,"negativo")),s("div",{class:"chatrag-feedback"},[n,r])}function E(a,t,e){a.innerHTML="",t.forEach((n,r)=>{var f,l;if(n.role==="aviso"){a.append(s("div",{class:"chatrag-notice"},[n.content]));return}const c=s("div",{class:`chatrag-msg ${n.role}`},[n.content]);if(n.role==="atendente"){a.append(s("span",{class:"chatrag-author"},["Atendente"]),c);return}if(n.role==="assistente"&&e.avatarUrl){const b=s("img",{src:e.avatarUrl,class:"chatrag-msg-avatar",alt:"Avatar"}),d=s("div",{style:"display: flex; flex-direction: column; max-width: 82%;"},[c]);(f=n.citations)!=null&&f.length&&d.append(m(n.citations)),r>0&&d.append(v(n,r,e)),a.append(s("div",{class:"chatrag-msg-row assistente"},[b,d]));return}a.append(c),n.role==="assistente"&&((l=n.citations)!=null&&l.length)&&a.append(m(n.citations)),n.role==="assistente"&&r>0&&a.append(v(n,r,e))}),a.scrollTop=a.scrollHeight}function I(a){const t=a.position==="bottom-left"?"left":"right",e=a.accentColor||"#5B4FE9";return`
    :host { all: initial; }
    * { box-sizing: border-box; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }

    :root, .chatrag-root {
      --chatrag-accent: ${e};
      --chatrag-bg: #ffffff;
      --chatrag-fg: #1a1a1a;
      --chatrag-muted: #6b7280;
      --chatrag-border: #e5e7eb;
      --chatrag-bubble-visitor: ${e};
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
      ${t}: 20px;
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
      ${t}: 20px;
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
    .chatrag-msg.atendente { align-self: flex-start; background: var(--chatrag-bubble-assistant); color: var(--chatrag-bubble-assistant-fg); border-bottom-left-radius: 4px; border-left: 3px solid var(--chatrag-accent); }
    .chatrag-author { align-self: flex-start; font-size: 11px; color: var(--chatrag-muted); margin-bottom: -4px; }
    .chatrag-notice { align-self: center; font-size: 12px; color: var(--chatrag-muted); text-align: center; padding: 2px 8px; }
    .chatrag-msg.pending { opacity: .6; }

    .chatrag-feedback { display: flex; gap: 6px; margin-top: 2px; }
    .chatrag-feedback button { background: none; border: 1px solid var(--chatrag-border); border-radius: 8px; cursor: pointer; font-size: 12px; padding: 2px 8px; color: var(--chatrag-muted); }
    .chatrag-feedback button[data-active="true"] { border-color: var(--chatrag-accent); color: var(--chatrag-accent); }

    .chatrag-citations { align-self: flex-start; max-width: 82%; display: flex; flex-direction: column; gap: 4px; margin-top: -2px; }
    .chatrag-citations-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .04em; color: var(--chatrag-muted); }
    .chatrag-citation { border: 1px solid var(--chatrag-border); border-radius: 8px; padding: 4px 8px; font-size: 12px; color: var(--chatrag-fg); }
    .chatrag-citation summary { cursor: pointer; color: var(--chatrag-accent); font-weight: 600; }
    .chatrag-citation p { margin: 6px 0 2px; color: var(--chatrag-muted); line-height: 1.45; white-space: pre-wrap; }

    .chatrag-sectors { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 4px; }
    .chatrag-sectors button { border: 1px solid var(--chatrag-accent); color: var(--chatrag-accent); background: none; border-radius: 999px; padding: 4px 10px; font-size: 12px; cursor: pointer; }

    .chatrag-footer { border-top: 1px solid var(--chatrag-border); padding: 10px; display: flex; gap: 8px; }
    .chatrag-input { flex: 1; border: 1px solid var(--chatrag-border); border-radius: 10px; padding: 9px 12px; font-size: 13.5px; background: var(--chatrag-bg); color: var(--chatrag-fg); resize: none; }
    .chatrag-send { background: var(--chatrag-accent); color: #fff; border: none; border-radius: 10px; padding: 0 14px; cursor: pointer; font-size: 13px; font-weight: 600; }
    .chatrag-send:disabled { opacity: .5; cursor: default; }

    .chatrag-handoff { background: none; border: 1px solid var(--chatrag-border); color: var(--chatrag-muted); border-radius: 10px; padding: 0 10px; cursor: pointer; font-size: 12px; }
  `}class S{constructor(t){this.options=t,this.conversationId=null,this.messages=[],this.open=!1,this.sending=!1,this.events=null,this.api=x(t.apiBaseUrl)}mount(t=null){const e=s("div",{id:"chatrag-widget-host"}),n=e.attachShadow({mode:"open"}),r=document.createElement("style");r.textContent=I(this.options),n.append(r),this.root=s("div",{class:"chatrag-root","data-theme":this.options.theme}),n.append(this.root),this.buildPanel(),this.options.mode==="embedded"?(this.panel.classList.add("chatrag-embedded"),this.open=!0,this.panel.hidden=!1):(this.buildLauncher(),this.panel.hidden=!0),((this.options.mountSelector?document.querySelector(this.options.mountSelector):null)??document.body).append(e),this.renderGreeting(),this.afterConfig(t)}afterConfig(t){if(t){this.messages=[{role:"assistente",content:p(t)}],this.sendBtn.disabled=!0,this.input.disabled=!0,this.renderMessages();return}(this.options.externalUserId||this.options.identityToken)&&this.ensureConversation()}buildLauncher(){const t=s("button",{class:"chatrag-launcher","aria-label":this.options.title,html:k});t.addEventListener("click",()=>this.toggle()),this.root.append(t)}buildPanel(){const t=s("button",{class:"chatrag-close","aria-label":"Fechar",html:C});t.addEventListener("click",()=>this.toggle());const n=[s("h1",{},[this.options.title])];if(this.options.showOnlineBadge){const g=s("span",{class:"chatrag-online-dot"}),O=s("span",{},["Online"]);n.push(s("div",{class:"chatrag-online-badge"},[g,O]))}const r=s("div",{class:"chatrag-header-text"},n),c=[];this.options.avatarUrl&&c.push(s("img",{src:this.options.avatarUrl,class:"chatrag-avatar-img",alt:this.options.title})),c.push(r);const l=[s("div",{class:"chatrag-header-info"},c)];this.options.mode==="floating"&&l.push(t);const b=s("div",{class:"chatrag-header"},l);this.messagesEl=s("div",{class:"chatrag-messages"}),this.input=s("textarea",{class:"chatrag-input",rows:"1",placeholder:"Escreva sua mensagem..."}),this.input.addEventListener("keydown",g=>{g.key==="Enter"&&!g.shiftKey&&(g.preventDefault(),this.handleSend())}),this.sendBtn=s("button",{class:"chatrag-send"},["Enviar"]),this.sendBtn.addEventListener("click",()=>this.handleSend());const d=s("button",{class:"chatrag-handoff"},[this.options.humanInbox?"Falar com atendente":"WhatsApp"]);d.addEventListener("click",()=>this.handleHandoff());const z=s("div",{class:"chatrag-footer"},[this.input,d,this.sendBtn]);this.panel=s("div",{class:"chatrag-panel"},[b,this.messagesEl,z]),this.root.append(this.panel)}toggle(){this.open=!this.open,this.panel.hidden=!this.open}renderGreeting(){this.options.greeting&&(this.messages.push({role:"assistente",content:this.options.greeting}),this.renderMessages())}async ensureConversation(){if(this.conversationId)return this.conversationId;const t=await this.api.startConversation(this.options.key,{externalUserId:this.options.externalUserId,visitorName:this.options.visitorName,visitorEmail:this.options.visitorEmail,context:this.options.context,identityToken:this.options.identityToken});return this.conversationId=t.conversationId,this.connectEvents(),t.isResumed&&t.messages&&t.messages.length>0&&(this.messages=t.messages.map(e=>({role:e.role,content:e.content,citations:e.citations})),this.renderMessages()),t.conversationId}async handleSend(){const t=this.input.value.trim();if(!(!t||this.sending)){this.input.value="",this.messages.push({role:"visitante",content:t}),this.renderMessages(),this.setSending(!0);try{const e=await this.ensureConversation(),{answer:n,citations:r}=await this.api.sendMessage(this.options.key,e,t);n!==null&&this.messages.push({role:"assistente",content:n,citations:r})}catch(e){this.messages.push({role:"assistente",content:p(e)})}finally{this.setSending(!1),this.renderMessages()}}}async handleFeedback(t,e){if(this.conversationId){this.messages[t].feedback=e,this.renderMessages();try{await this.api.sendFeedback(this.options.key,this.conversationId,e)}catch{}}}async handleHandoff(){try{const t=await this.ensureConversation(),e=await this.api.requestHandoff(this.options.key,t);"inbox"in e?(this.messages.push({role:"aviso",content:"Pedido enviado. Um atendente vai continuar a conversa aqui."}),this.renderMessages()):e.needsSectorSelection?this.renderSectorChoice(e.sectors):window.open(e.whatsappUrl,"_blank","noopener,noreferrer")}catch(t){this.messages.push({role:"assistente",content:w(t)}),this.renderMessages()}}async chooseSector(t){if(this.conversationId)try{const e=await this.api.requestHandoff(this.options.key,this.conversationId,t);!("inbox"in e)&&!e.needsSectorSelection&&window.open(e.whatsappUrl,"_blank","noopener,noreferrer")}catch(e){this.messages.push({role:"assistente",content:p(e)}),this.renderMessages()}}renderSectorChoice(t){var n;(n=this.messagesEl.querySelector(".chatrag-sectors"))==null||n.remove();const e=s("div",{class:"chatrag-sectors"},t.map(r=>{const c=s("button",{},[r.name]);return c.addEventListener("click",()=>this.chooseSector(r.id)),c}));this.messagesEl.append(e),this.messagesEl.scrollTop=this.messagesEl.scrollHeight}setSending(t){this.sending=t,this.sendBtn.disabled=t}connectEvents(){!this.options.humanInbox||!this.conversationId||this.events||(this.events=new EventSource(this.api.eventsUrl(this.options.key,this.conversationId)),this.events.onmessage=t=>{let e;try{e=JSON.parse(t.data)}catch{return}this.handleInboxEvent(e)})}handleInboxEvent(t){if(t.kind==="agent_message")this.messages.push({role:"atendente",content:t.content});else if(t.status==="resolvida")this.messages.push({role:"aviso",content:"Atendimento encerrado. Obrigado pelo contato!"});else return;this.renderMessages()}renderMessages(){E(this.messagesEl,this.messages,{avatarUrl:this.options.avatarUrl,onFeedback:(t,e)=>this.handleFeedback(t,e)})}}const i=document.currentScript;function o(a,t=""){return(i==null?void 0:i.getAttribute(a))??t}function U(){const a=o("data-context");if(!a)return null;try{const t=JSON.parse(a);if(t&&typeof t=="object"&&!Array.isArray(t))return t;console.error(`[chatrag-widget] data-context precisa ser um objeto JSON, ex.: '{"plano":"Pro"}'`)}catch{console.error("[chatrag-widget] data-context nao e um JSON valido")}return null}function T(){const a=o("data-key");return a?{key:a,apiBaseUrl:o("data-api","http://localhost:3333"),mode:o("data-mode","floating")==="embedded"?"embedded":"floating",position:o("data-position","bottom-right")==="bottom-left"?"bottom-left":"bottom-right",theme:["light","dark","sync"].includes(o("data-theme"))?o("data-theme"):"light",title:o("data-title","Fale com a gente"),greeting:o("data-greeting","Ola! Como posso ajudar?"),accentColor:o("data-accent")||o("data-color")||null,avatarUrl:o("data-avatar")||null,showOnlineBadge:o("data-online","true")!=="false",mountSelector:o("data-mount")||null,identityToken:o("data-identity-token")||null,externalUserId:o("data-external-user-id")||null,visitorName:o("data-visitor-name")||null,visitorEmail:o("data-visitor-email")||null,context:U(),humanInbox:!1}:(console.error("[chatrag-widget] atributo data-key e obrigatorio no <script>"),null)}function M(a,t){t&&(t.title&&!(i!=null&&i.hasAttribute("data-title"))&&(a.title=t.title),t.greeting&&!(i!=null&&i.hasAttribute("data-greeting"))&&(a.greeting=t.greeting),t.accentColor&&!a.accentColor&&(a.accentColor=t.accentColor),t.position&&!(i!=null&&i.hasAttribute("data-position"))&&(a.position=t.position),t.theme&&!(i!=null&&i.hasAttribute("data-theme"))&&(a.theme=t.theme),t.logoUrl&&!a.avatarUrl&&(a.avatarUrl=t.logoUrl))}async function y(){const a=T();if(!a)return;let t=null,e=null;try{t=await x(a.apiBaseUrl).getConfig(a.key),M(a,t.appearance),a.humanInbox=t.humanInbox===!0}catch(n){e=n}new S(a).mount(e)}document.readyState==="loading"?document.addEventListener("DOMContentLoaded",()=>void y()):y()})();
