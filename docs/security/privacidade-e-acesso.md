# Seguranca, privacidade e acesso

## Isolamento

O tenant e uma fronteira de seguranca, nao apenas filtro visual. A API deve validar organizacao e permissao em todas as rotas; buscas vetoriais devem sempre receber o filtro de organizacao e colecao/assistente autorizado.

O Master opera no escopo da plataforma e tem auditoria reforcada. Uma sessao de tenant nao pode informar ou trocar livremente `organization_id`; esse contexto vem da associacao do usuario e da selecao autorizada. Tenant suspenso nao aceita logins operacionais, indexacao ou requisicoes do widget.

Nao ha auto cadastro publico no MVP. Endpoints de provisionamento de tenant exigem Master; endpoints de usuarios exigem Master ou administrador autorizado no proprio tenant. Convites devem expirar e ser de uso unico.

## Dados

O objetivo inicial e nao armazenar bases com dados sensiveis. Ainda assim, conversas podem conter dados pessoais; aplicar minimizacao, criptografia em transito, controle de acesso, retencao configuravel e exclusao administrativa mediante solicitacao.

## Widget publico

Politicas por assistente: iniciar anonimo, solicitar nome/e-mail opcional ou obrigatorio, aviso de privacidade, retencao, dominios, limite de requisicoes e encaminhamento. Rate limit numerico padrao ja existe desde o MVP (ver `integrations/widget-embed.md` e ADR-002); CAPTCHA ou desafio antiautomacao e camada adicional futura, conforme telemetria de abuso.

## Segredos

Segredos de banco, S3 e assinatura de tokens ficam somente em variaveis de ambiente/gerenciador de segredos. A chave OpenAI e fornecida por cada tenant, protegida por envelope encryption (KEK em KMS protegendo DEK(s) por ambiente, ver ADR-002) e jamais devolvida por API, interface, log ou auditoria. Chaves administrativas nunca aparecem no widget. Eventos de auditoria nao podem registrar conteudo confidencial ou tokens em texto puro.

Rotacao de KEK e barata (re-envelopa so a DEK). Rotacao de DEK exige job de re-criptografia em lote dos segredos de tenant, agendado e auditado, sem expor valor em claro fora do processo do backend.

O Master pode consultar apenas o estado da configuracao (ausente, valida, invalida, substituida ou removida) e executar remocao/suporte auditado. Ele nao pode revelar nem copiar a chave de um tenant. O tenant escolhe se usa a mesma credencial em teste e producao ou credenciais distintas; a configuracao e auditada sem expor o segredo.

## Auditoria append-only

A tabela `audit_events` e gravada apenas por INSERT pela role de aplicacao; UPDATE e DELETE nao sao permitidos a essa role no banco (restricao de permissao de banco, nao so regra de aplicacao). Correcao ou expurgacao legal segue caminho administrativo separado, fora do fluxo normal da API. Ver ADR-002.

## Retencao

Padrao inicial: 90 dias para conversas; organizacao e assistente podem definir politica mais restritiva ou mais longa. A politica efetiva precisa ser mostrada no painel.

Um worker agendado expurga/anonimiza conversas alem da politica efetiva de cada organizacao/assistente e gera `audit_event` agregado (organizacao, quantidade, timestamp), sem conteudo de conversa. Ver ADR-002; job criado junto com a funcionalidade de retencao configuravel.
