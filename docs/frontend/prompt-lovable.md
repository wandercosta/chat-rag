# Prompt para o Lovable - painel administrativo do ChatRAG

Este prompt traduz `docs/frontend/painel-administrativo.md` em um prompt pronto para colar no Lovable. Qualquer mudanca de navegacao, tela ou perfil deve ser feita primeiro naquele documento e depois refletida aqui (ver `CLAUDE.md`).

---

## Prompt (copiar a partir daqui)

Crie um painel administrativo web em React + TypeScript para um produto SaaS multi-tenant chamado ChatRAG, que fornece assistentes de IA baseados em base de conhecimento privada, integraveis a sites externos via widget.

Este e apenas o frontend visual. Nao implemente logica de RAG, nao gere nem manipule segredos/chaves administrativas, e nao tome nenhuma decisao de autorizacao no cliente — todo acesso e permissao vem de uma API que ainda sera integrada depois. Use dados mockados/estaticos por enquanto, deixando claro nos comentarios onde cada tela consumira a API real.

### Dois escopos de acesso

1. **Master (plataforma):** enxerga todas as organizacoes/tenants, usuarios, auditoria e configuracoes globais. Nao pertence a nenhuma organizacao especifica.
2. **Tenant (organizacao):** cada usuario de tenant esta associado a uma unica organizacao na sessao ativa e so vê recursos dela.

Simule um seletor/estado de "sessao atual" que alterna entre "Master" e um tenant de exemplo, so para navegar o protótipo — isso nao existe no produto final (o escopo vem do login real).

### Navegacao principal (sidebar)

- Visao geral do tenant
- Organizacoes/tenants (visivel somente para Master)
- Visao geral da plataforma (visivel somente para Master)
- Assistentes
- Base de conhecimento (topicos e fontes)
- Conversas
- Lacunas e feedbacks
- Integracoes e widget
- Usuarios e permissoes
- Configuracoes
- Auditoria e uso

### Telas a construir

1. **Master - lista de tenants:** tabela com nome, status (ativo/suspenso), limites e data de criacao. Botao "Criar tenant" abrindo formulario com nome, identificacao, status inicial, configuracoes padrao e dados do usuario administrador inicial (nome, e-mail).
2. **Master - detalhe do tenant:** abas para uso/consumo, auditoria, e uma acao de "Acesso de suporte" que exige preencher justificativa e mostra um aviso permanente de "Modo de suporte ativo" com tempo restante enquanto simulado como ativo. Botoes de suspender/reativar tenant.
3. **Lista de assistentes:** cards ou tabela com nome, status, modelo selecionado. Botao "Novo assistente".
4. **Detalhe do assistente:** formulario com identidade (nome, avatar), instrucoes opcionais em texto livre, selecao de colecoes de conhecimento, modo de resposta (estrita vs. permite conhecimento geral - mockar como toggle desabilitado com nota "disponivel em fase futura"), privacidade do visitante, retencao de historico, configuracao de encaminhamento WhatsApp e aparencia do widget (cor, tema claro/escuro/sincronizado, logo, posicao, modo flutuante/embutido).
5. **Base de conhecimento:** lista de topicos, e dentro de cada topico lista de fontes com tipo (texto/PDF/DOCX/URL), status (rascunho, aguardando revisao, na fila, processando, pronta, erro, arquivada) e acao de reindexar. Exiba um aviso quando a fonte estiver como "aguardando ativacao" (sem chave de IA configurada).
6. **Playground de conversa:** interface de chat simples para testar um assistente sem expor publicamente, com indicador visual de "modo teste".
7. **Integracoes e widget:** exibe o script de instalacao (`<script src="..." data-key="..." data-mode="floating" async>`), lista de chaves por ambiente (teste/producao) com dominios permitidos, botao de revogar chave, e preview da aparencia do widget.
8. **Conversas:** tabela filtravel por assistente, visitante e periodo; ao abrir uma conversa, mostra historico de mensagens e feedback recebido.
9. **Lacunas:** tabela com pergunta sem resposta, frequencia, assistente de origem e status (pendente/resolvida), com acao de marcar como resolvida.
10. **Configuracoes do tenant:** formulario para chave OpenAI de teste e producao (ou reutilizada entre ambientes), exibindo apenas estado da conexao (nao configurada / valida / invalida / substituida) — o valor da chave nunca aparece apos salvo, so um campo para colar um novo valor. Lista de modelos permitidos (somente leitura, vem do Master). Secao de privacidade/retencao e configuracao de WhatsApp.
11. **Estado de ativacao da base:** um banner/alerta reutilizavel, mostrado em varias telas, avisando que indexacao, playground e widget ficam indisponiveis ate existir uma chave de IA valida.
12. **Usuarios e permissoes:** lista de usuarios do tenant com perfil (Administrador, Editor de base, Analista), botao de convidar usuario por e-mail ou por senha provisoria com troca obrigatoria no primeiro acesso. Nenhuma tela de cadastro publico deve existir em lugar nenhum do produto.
13. **Auditoria e uso:** tabela de eventos administrativos e de seguranca (quem, o que, quando), com filtro por tipo de evento e periodo.

### Perfis e visibilidade condicional

| Perfil | O que ve |
|---|---|
| Master | Tudo: todas as organizacoes, usuarios, auditoria e configuracoes globais |
| Administrador (tenant) | Todos os recursos da propria organizacao |
| Editor de base (tenant) | Somente topicos e fontes; sem acesso a chaves ou usuarios |
| Analista (tenant) | Somente conversas, feedbacks, lacunas e metricas, em modo leitura |

Ajuste a sidebar e os botoes de acao visiveis conforme o perfil simulado selecionado no protótipo.

### Estilo visual

Painel de SaaS B2B, limpo e profissional, tons neutros com um accent color, boa hierarquia tipografica, componentes de tabela/formulario consistentes, suporte a tema claro e escuro. Priorize clareza sobre densidade — os usuarios sao administradores configurando um produto, nao consumidores finais.

---

## Observacoes de uso

- Depois que o Lovable gerar o protótipo, o frontend real deve substituir os dados mockados por chamadas aos contratos descritos em `docs/apis/contratos-planejados.md`, sem adicionar logica de negocio no cliente.
- Qualquer tela ou campo novo decidido durante o uso do Lovable deve voltar para `docs/frontend/painel-administrativo.md` antes de ser considerado definitivo, e este prompt deve ser atualizado junto.
