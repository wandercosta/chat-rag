# WhatsApp (Cloud API oficial)

Etapa 4 da Fase 3 (ADR-006). O tenant conecta um numero da **propria** conta do WhatsApp Business na API oficial da Meta; as conversas sao cobradas pela Meta nessa conta. Nao ha automacao de WhatsApp Web.

## Como funciona

- **Entrada:** a Meta chama `POST /webhooks/whatsapp/:connectionId`. A API confere a assinatura `X-Hub-Signature-256` com a chave secreta do app do tenant, le so as mudancas do proprio numero da conexao e enfileira cada mensagem e cada recibo. O worker faz o resto, entao a Meta recebe o 200 rapido.
- **Contato e conversa:** o remetente vira (ou reaproveita) um contato do CRM pela identidade `whatsapp` (o `wa_id`) ou pelo telefone. A conversa continua a mesma enquanto houver mensagem nas ultimas 24 horas ou um humano cuidando dela; depois disso, a proxima mensagem abre outra.
- **Resposta:** sem humano na conversa, o assistente responde pela base, com as fontes listadas no fim do texto (no WhatsApp nao ha painel de fontes). Sem resposta na base e com a caixa de entrada ligada no assistente, a resposta avisa que um atendente vai assumir e a conversa entra na fila. Pedir explicitamente ("quero falar com um atendente", "humano") tambem poe na fila.
- **Atendente:** responde pela caixa de entrada; o envio vai pela fila, com ate 3 tentativas em erro temporario (5xx ou limite da Meta). Erro de dado (numero invalido etc.) fica marcado na mensagem.
- **Janela de 24 horas:** depois de 24 horas sem mensagem do cliente, texto livre e recusado (422) e o painel troca a caixa de resposta pelo envio de **modelo aprovado**, com as variaveis `{{1}}`, `{{2}}`... preenchidas pelo atendente.
- **Recibos:** enviada, entregue, lida ou falhou, mostrados embaixo de cada mensagem e atualizados em tempo real. Um recibo atrasado nunca rebaixa o status (lida nao volta para entregue).
- **Midia:** imagem, audio, video, documento e localizacao aparecem como `[imagem recebida]` etc.; o arquivo ainda nao e baixado.

## Configurar na Meta (uma vez por numero)

1. Em [developers.facebook.com](https://developers.facebook.com), crie um app do tipo **Empresa** e adicione o produto **WhatsApp**.
2. Em **WhatsApp › Configuracao da API**, anote o **ID do numero de telefone** e o **ID da conta do WhatsApp Business**. Para producao, adicione e verifique o numero real da empresa (a verificacao da empresa pela Meta pode levar dias).
3. No **Gerenciador de Negocios › Usuarios do sistema**, crie um usuario do sistema, de a ele acesso ao app e a conta do WhatsApp e gere um **token permanente** com `whatsapp_business_messaging` e `whatsapp_business_management`.
4. Em **Configuracoes do app › Basico**, copie a **Chave secreta do app**.
5. No painel do ChatRAG, em **Canais › Conectar WhatsApp**, informe os quatro dados e o assistente que vai responder. O painel confere o token na Meta antes de salvar; token e chave secreta ficam cifrados e nao aparecem de novo.
6. De volta a Meta, em **WhatsApp › Configuracao › Webhook**, cole a **URL de retorno** e o **token de verificacao** mostrados no card do canal e assine o campo **messages**. A URL precisa ser publica e com HTTPS: defina `PUBLIC_API_URL` no `.env` da API.
7. Em **Canais**, use **Sincronizar modelos** para trazer os modelos aprovados (necessarios fora da janela de 24 horas).

## Checklist de validacao com conta real

Os testes automaticos rodam contra uma API da Meta simulada (`backend/src/test/fake-graph-api.ts`). Com um numero de teste da Meta, confira manualmente:

- [ ] Conectar com token errado mostra o erro da Meta; com o certo, o card fica **ativo** com o numero exibido.
- [ ] A Meta aceita a URL de retorno e o token de verificacao.
- [ ] Mensagem enviada do celular chega como contato novo e recebe resposta da base com as fontes.
- [ ] "Quero falar com um atendente" coloca a conversa na fila; a resposta do atendente chega no celular e o status passa a **lida** quando a mensagem e aberta.
- [ ] Depois de 24 horas sem mensagem do cliente, o painel so oferece modelo; o modelo chega com as variaveis preenchidas.
- [ ] Desconectar o canal faz a Meta parar de entregar (o webhook responde 404).
