# ADR-001: Fundacoes do ChatRAG

**Status:** Aceita em planejamento. O item 12 foi substituido em parte pelo ADR-006 (acoes de comunicacao por canais do tenant passam a ser permitidas).

## Decisoes

1. Produto inicialmente interno, mas multi-tenant desde o primeiro release. Um painel Master cria tenants e seus usuarios administradores iniciais; nao ha auto cadastro nem cobranca no MVP.
2. O produto nao depende de sistemas externos para login e dados; integracoes futuras sao opcionais.
3. PostgreSQL + pgvector e a base de dados recomendada, em vez de MySQL, por adequacao ao RAG.
4. OpenAI e o provedor inicial por adaptador intercambiavel. Cada tenant fornece e controla sua propria chave OpenAI (BYOK), o que separa uso e custo por tenant. Ele pode cadastrar a base antes de ativar chave; indexacao e chat ficam bloqueados/alertados ate a ativacao.
5. React/TypeScript no painel, Node.js/TypeScript na API/workers e widget JavaScript independente.
6. Docker Compose fornece PostgreSQL, Redis e MinIO localmente.
7. O MVP aceita texto, PDF, DOCX e URL; indexacao/revisao sao configuraveis.
8. Resposta baseada apenas na base e o padrao, com opcao futura por assistente para permitir conhecimento geral.
9. Chaves do widget sao geridas/revogadas pelo painel e separadas por ambiente; dominios autorizados sao obrigatorios.
10. Historico e identificacao do visitante sao configuraveis; usuarios integrados usam contexto futuro assinado, visitantes externos podem fornecer e-mail.
11. WhatsApp e o primeiro encaminhamento, com selecao de setor quando a classificacao nao for conclusiva.
12. Nenhuma acao externa e executada no MVP.
13. Tenant possui status operacional. Suspensao bloqueia uso sem apagar dados; exclusao definitiva requer fluxo posterior de retencao e privacidade.
14. O administrador inicial de tenant acessa seu painel desde o MVP. Suporte Master exige sessao temporaria, justificativa e auditoria; o Master nunca visualiza chaves OpenAI de tenant.
15. O tenant decide entre uma chave OpenAI reutilizada nos ambientes ou chaves distintas de teste/producao. O Master governa catalogo curto de modelos e o tenant seleciona somente opcoes liberadas.
16. Nao existe auto cadastro publico de tenant ou usuario no MVP; criacao ocorre por Master ou convite administrativo controlado.

## Consequencias

O projeto exige infraestrutura adicional ao MySQL local, mas ganha busca vetorial madura, isolamento mais seguro e caminho limpo para escala. O frontend gerado no Lovable precisa aderir a esta documentacao e nao determinar contratos ou seguranca.
