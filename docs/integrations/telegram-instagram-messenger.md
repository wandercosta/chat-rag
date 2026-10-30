# Telegram, Instagram e Messenger

Etapa 5 da Fase 3 (ADR-006). Os tres canais usam a mesma camada do WhatsApp (`integrations/whatsapp.md`): webhook por conexao que so autentica e enfileira, contato do CRM pelo id do canal, resposta pela base com as fontes no fim do texto, passagem para humano e resposta do atendente pela fila. Diferencas abaixo.

## Telegram

- **Conexao:** so o token do bot (criado no @BotFather com `/newbot`). O painel confere o token com `getMe` e **registra o webhook sozinho** (`setWebhook`) com um token secreto aleatorio; o Telegram devolve esse token no cabecalho `X-Telegram-Bot-Api-Secret-Token` de cada entrega, e sem ele nada e processado. Desconectar apaga o webhook (`deleteWebhook`).
- **Endereco publico:** o Telegram so entrega em HTTPS publico. Sem `PUBLIC_API_URL` acessivel, o canal fica em **erro** com o motivo; corrigido o endereco, "Testar conexao" registra de novo.
- **Atendimento:** so conversas privadas com o bot (grupos e canais sao ignorados; `/start` tambem). Nao ha janela de 24 horas nem modelos. Nao ha recibo de entrega/leitura: a mensagem fica como "enviada".
- **Contato:** pelo id do chat; o nome vem do perfil do Telegram. O Telegram nao revela telefone.
- **Midia:** foto (o maior tamanho), audio, voz, video, documento e figurinha sao baixados pelo `getFile` e guardados como no WhatsApp. O link de download do Telegram leva o token do bot: nunca e gravado nem logado (o erro guardado e so a mensagem do Telegram). A Bot API so entrega arquivos de ate 20 MB.

## Messenger (Pagina do Facebook) e Instagram Direct

- **Conexao:** id da Pagina (Messenger) ou id da conta profissional do Instagram e da Pagina ligada a ela (Instagram), mais o token de acesso da Pagina e a chave secreta do app. O painel confere o token na Graph API antes de salvar.
- **Webhook:** como no WhatsApp: na Meta, cadastrar a URL de retorno e o token de verificacao mostrados no card e assinar o campo `messages`. A assinatura `X-Hub-Signature-256` e conferida com a chave secreta do app; so entram eventos da propria Pagina/conta (`entry.id`) e ecos da Pagina sao ignorados.
- **Resposta:** sai pela Pagina (`POST /{pagina}/messages`, `messaging_type: RESPONSE`), tambem no Instagram.
- **Janela de 24 horas:** vale nos dois. Fora dela o painel avisa que so da para responder quando o cliente escrever de novo.
- **Tag "Agente humano" (ate 7 dias):** no card do canal, o administrador pode ligar "Responder ate 7 dias". Com ela ligada, a janela do atendente passa a 7 dias e, depois das primeiras 24 horas, a resposta sai com `messaging_type: MESSAGE_TAG` e `tag: HUMAN_AGENT`. Resposta do assistente nunca usa a tag (a Meta so aceita para mensagem escrita por pessoa). Exige a permissao **Human Agent** aprovada pela Meta no app do tenant; sem ela a Meta recusa e a mensagem fica como "falhou". As outras tags (confirmacao de evento, pos-compra, conta) nao sao usadas: sao para avisos automaticos e nao cabem no atendimento.
- **Recibos:** o Messenger manda recibo de entrega (vira "entregue"); o de leitura nao traz os ids e e ignorado. O Instagram nao manda recibo.
- **Contato:** pelo id da pessoa na Pagina (PSID/IGSID). O nome vem da API de perfil (`first_name` e `last_name` no Messenger; `name` ou `username` no Instagram), consultada **so no primeiro contato** daquela pessoa no canal; depois disso o nome do CRM e o que vale (o administrador pode editar sem ser sobrescrito). Se o app nao tiver a permissao, o contato fica sem nome e o atendimento segue.
- **Midia:** imagem, audio, video e arquivo chegam como URL do CDN da Meta dentro do webhook. Como o webhook e assinado pelo app do proprio tenant, o worker so baixa de `*.fbcdn.net`, `*.fbsbx.com` e `*.cdninstagram.com` (ou do host da Graph configurada); qualquer outro endereco vira anexo "nao recebido", para o worker nao servir de ponte para a rede interna.

## Checklist de validacao com contas reais

Os testes automaticos rodam contra APIs simuladas (`backend/src/test/fake-graph-api.ts`). Com contas de teste:

- [ ] Telegram: conectar um bot com a API em HTTPS publico; o card fica **ativo**; mensagem privada ao bot recebe resposta da base; "quero falar com um atendente" poe na fila; a resposta do atendente chega no Telegram.
- [ ] Telegram: desconectar e conferir que o bot para de receber (webhook apagado).
- [ ] Messenger: a Meta aceita a URL e o token; mensagem para a Pagina recebe resposta; o status da resposta do atendente passa a **entregue**.
- [ ] Instagram: mensagem no Direct da conta profissional recebe resposta pela Pagina ligada.
- [ ] Messenger e Instagram: depois de 24 horas sem mensagem do cliente, o painel bloqueia a resposta livre.
