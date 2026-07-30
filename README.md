# ChatRAG Admin Hub

> Este arquivo e o prompt original que gerou o protótipo no Lovable — mantido como histórico. Para o estado real do projeto (o que já está ligado ao backend, o que ainda é mockado, como rodar tudo), ver `docs/README.md`, `backend/README.md` e `widget/README.md`.
>
> Resumo rápido: login/logout/sessão, lista+criação de tenants (Master) e lista+criação de assistentes (tenant) já falam com a API real em `backend/` (precisa de `docker compose up -d` na raiz — ver `backend/README.md`). O resto das telas abaixo ainda usa `src/lib/mock-data.ts`. `.env` na raiz define `VITE_API_BASE_URL` (padrão `http://localhost:3333`).

Crie um painel administrativo web em React + TypeScript para um produto SaaS multi-tenant chamado ChatRAG, que fornece assistentes de IA baseados em base de conhecimento privada, integraveis a sites externos via widget.

Este e apenas o frontend visual. Nao implemente logica de RAG, nao gere nem manipule segredos/chaves administrativas, e nao tome nenhuma decisao de autorizacao no cliente — todo acesso e permissao vem de uma API que ainda sera integrada depois. Use dados mockados/estaticos por enquanto, deixando claro nos comentarios onde cada tela consumira a API real.

Dois escopos de acesso

Master (plataforma): enxerga todas as organizacoes/tenants, usuarios, auditoria e configuracoes globais. Nao pertence a nenhuma organizacao especifica.

Tenant (organizacao): cada usuario de tenant esta associado a uma unica organizacao na sessao ativa e so vê recursos dela.

Simule um seletor/estado de "sessao atual" que alterna entre "Master" e um tenant de exemplo, so para navegar o protótipo — isso nao existe no produto final (o escopo vem do login real).

Navegacao principal (sidebar)

Visao geral do tenant

Organizacoes/tenants (visivel somente para Master)

Visao geral da plataforma (visivel somente para Master)

Assistentes

Base de conhecimento (topicos e fontes)

Conversas

Lacunas e feedbacks

Integracoes e widget

Usuarios e permissoes

Configuracoes

Auditoria e uso

Telas a construir

Master - lista de tenants: tabela com nome, status (ativo/suspenso), limites e data de criacao. Botao "Criar tenant" abrindo formulario com nome, identificacao, status inicial, configuracoes padrao e dados do usuario administrador inicial (nome, e-mail).

Master - detalhe do tenant: abas para uso/consumo, auditoria, e uma acao de "Acesso de suporte" que exige preencher justificativa e mostra um aviso permanente de "Modo de suporte ativo" com tempo restante enquanto simulado como ativo. Botoes de suspender/reativar tenant.

Lista de assistentes: cards ou tabela com nome, status, modelo selecionado. Botao "Novo assistente".

Detalhe do assistente: formulario com identidade (nome, avatar), instrucoes opcionais em texto livre, selecao de colecoes de conhecimento, modo de resposta (estrita vs. permite conhecimento geral - mockar como toggle desabilitado com nota "disponivel em fase futura"), privacidade do visitante, retencao de historico, configuracao de encaminhamento WhatsApp e aparencia do widget (cor, tema claro/escuro/sincronizado, logo, posicao, modo flutuante/embutido).

Base de conhecimento: lista de topicos, e dentro de cada topico lista de fontes com tipo (texto/PDF/DOCX/URL), status (rascunho, aguardando revisao, na fila, processando, pronta, erro, arquivada) e acao de reindexar. Exiba um aviso quando a fonte estiver como "aguardando ativacao" (sem chave de IA configurada).

Playground de conversa: interface de chat simples para testar um assistente sem expor publicamente, com indicador visual de "modo teste".

Integracoes e widget: exibe o script de instalacao (<script src="..." data-key="..." data-mode="floating" async>), lista de chaves por ambiente (teste/producao) com dominios permitidos, botao de revogar chave, e preview da aparencia do widget.

Conversas: tabela filtravel por assistente, visitante e periodo; ao abrir uma conversa, mostra historico de mensagens e feedback recebido.

Lacunas: tabela com pergunta sem resposta, frequencia, assistente de origem e status (pendente/resolvida), com acao de marcar como resolvida.

Configuracoes do tenant: formulario para chave OpenAI de teste e producao (ou reutilizada entre ambientes), exibindo apenas estado da conexao (nao configurada / valida / invalida / substituida) — o valor da chave nunca aparece apos salvo, so um campo para colar um novo valor. Lista de modelos permitidos (somente leitura, vem do Master). Secao de privacidade/retencao e configuracao de WhatsApp.

Estado de ativacao da base: um banner/alerta reutilizavel, mostrado em varias telas, avisando que indexacao, playground e widget ficam indisponiveis ate existir uma chave de IA valida.

Usuarios e permissoes: lista de usuarios do tenant com perfil (Administrador, Editor de base, Analista), botao de convidar usuario por e-mail ou por senha provisoria com troca obrigatoria no primeiro acesso. Nenhuma tela de cadastro publico deve existir em lugar nenhum do produto.

Auditoria e uso: tabela de eventos administrativos e de seguranca (quem, o que, quando), com filtro por tipo de evento e periodo.

Perfis e visibilidade condicional

PerfilO que veMasterTudo: todas as organizacoes, usuarios, auditoria e configuracoes globaisAdministrador (tenant)Todos os recursos da propria organizacaoEditor de base (tenant)Somente topicos e fontes; sem acesso a chaves ou usuariosAnalista (tenant)Somente conversas, feedbacks, lacunas e metricas, em modo leitura

Ajuste a sidebar e os botoes de acao visiveis conforme o perfil simulado selecionado no protótipo.

Estilo visual

Painel de SaaS B2B, limpo e profissional, tons neutros com um accent color, boa hierarquia tipografica, componentes de tabela/formulario consistentes, suporte a tema claro e escuro. Priorize clareza sobre densidade — os usuarios sao administradores configurando um produto, nao consumidores finais.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/c2a120e5-06c0-417c-a38d-62ce99e6b8e4).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
