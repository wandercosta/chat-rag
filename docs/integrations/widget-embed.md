# Widget integravel

## Objetivo

O widget deve ser instalado em qualquer site com um script no footer ou montado em um elemento especifico, sem modificar o backend hospedeiro.

O widget monta sua interface em Shadow DOM (`mode: 'open'`, para permitir depuracao), evitando colisao de CSS com o site hospedeiro e reduzindo risco de quebra por CSP restritivo do hospedeiro. Customizacao visual (cores, tema, logo) e aplicada via CSS custom properties que atravessam a fronteira do shadow root (ver ADR-002).

```html
<script src="https://cdn.exemplo.com/chat-widget.js"
  data-key="pk_live_..."
  data-mode="floating"
  async></script>
```

## Chaves e ambientes

- Cada assistente tem chaves independentes para teste e producao.
- A chave publica identifica o widget, nunca autoriza o painel nem acesso administrativo.
- O painel cria, mostra uma vez quando aplicavel, restringe, desativa e revoga chaves.
- Uma chave possui dominios permitidos. A API valida origem/referer, aplica rate limit e registra uso.
- Limites padrao desde o MVP, por chave+dominio+IP (ver ADR-002): 60 requisicoes/minuto por chave+IP; 30 novas conversas/hora por chave+dominio; 60 mensagens/hora por conversa. Mecanismo: janela deslizante ou token bucket no Redis. Valores default sao configuraveis futuramente por tenant/plano.

## Configuracao

Prioridade: configuracao do assistente, depois padrao da organizacao. Inclui titulo, mensagem de abertura, logo, cores, tema claro/escuro/sincronizado, posicao e modo flutuante ou embutido.

## Identidade opcional

O widget sozinho nao deve aceitar como confiaveis `id`, nome ou permissao enviados pelo navegador. Uma futura integracao autenticada podera fornecer um token curto assinado pelo backend hospedeiro com `external_user_id`, nome e contexto autorizado.

## Encaminhamento

O WhatsApp e configurado pela organizacao. O assistente pode fornecer contexto para selecionar setor; caso a confianca seja insuficiente ou haja mais de uma opcao aplicavel, o widget mostra botoes com os setores para o visitante escolher. A primeira versao abre WhatsApp com a ultima pergunta e identificacao permitida, sem enviar automaticamente o historico completo.

## Estado da implementacao

Bundle publico em `widget/` (~12kB, sem dependencias, ver `widget/README.md`), cobrindo config/conversa/mensagem/feedback/handoff e Shadow DOM. Diferencas do desenhado acima: titulo/saudacao/tema/posicao vem hoje de atributos `data-*` no `<script>`, nao de configuracao do assistente buscada da API (a hierarquia "assistente > organizacao" ainda nao existe); sem customizacao de logo; sem token de identidade autenticada (campo existe na leitura de opcoes, mas nada e enviado/aceito ainda); resposta e request/response simples, sem streaming.
