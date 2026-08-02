# Painel administrativo

## Diretriz

O painel sera inicialmente criado visualmente no Lovable. O resultado deve ser um frontend React/TypeScript que consume contratos documentados e nao incorpora regras de RAG, segredo, chave administrativa ou decisao de autorizacao.

## Navegacao prevista

- Visao geral do tenant
- Organizacoes/tenants (somente master)
- Visao geral da plataforma (somente master)
- Assistentes
- Base de conhecimento: topicos e fontes
- Conversas
- Lacunas e feedbacks
- Integracoes e widget
- Usuarios e permissoes
- Configuracoes
- Auditoria e uso

## Telas essenciais

1. **Master - tenants:** lista, criacao, status, limites, configuracoes iniciais e usuario administrador inicial.
2. **Master - detalhe do tenant:** uso, auditoria, suporte, suspensao/reativacao e acesso de suporte explicito, temporario e auditado ao contexto do tenant.
3. Lista/criacao de assistentes.
4. Detalhe do assistente: identidade, instrucoes opcionais, colecoes, modo de resposta, privacidade, retencao, WhatsApp e aparencia.
5. Base: topicos, fontes, status de indexacao, erros e reindexacao.
6. Playground de conversa para testar sem expor o assistente.
7. Integracao: script de instalacao, chave por ambiente, dominios permitidos, revogacao e aparencia.
8. Conversas: filtro por assistente, visitante e periodo; historico e feedback.
9. Lacunas: pergunta, frequencia, status de tratamento e origem.
10. Configuracoes do tenant: chave OpenAI de teste/producao ou reutilizada, estado da conexao, modelos permitidos, limites, privacidade e WhatsApp. O valor da chave nao pode ser exibido apos ser salvo.
11. Estado de ativacao da base: fontes podem ser cadastradas sem chave; o painel alerta que indexacao, playground e widget permanecem indisponiveis ate existir chave valida.

## Perfis iniciais

| Perfil         | Alcance                                                            |
| -------------- | ------------------------------------------------------------------ |
| Master         | Todas as organizacoes, usuarios, auditoria e configuracoes globais |
| Administrador  | Todos os recursos da propria organizacao                           |
| Editor de base | Topicos e fontes autorizados; nao gerencia chaves ou usuarios      |
| Analista       | Consulta conversas, feedbacks, lacunas e metricas                  |

Permissoes granulares poderao evoluir depois; nenhuma verificacao de seguranca pode depender apenas do frontend.

O Master e um papel de plataforma, sem `organization_id`. Perfis de tenant sempre sao associados a uma unica organizacao na sessao ativa.

O acesso de suporte do Master exige justificativa, tempo de expiracao e evento de auditoria com Master, tenant, inicio, fim e acoes relevantes. A interface deve deixar claro que o Master esta em modo de suporte.

Na criacao de usuario, Master e administrador do tenant podem escolher convite por e-mail ou senha provisoria com troca obrigatoria no primeiro acesso.

Nao deve existir tela, rota ou link de cadastro publico. Apenas Master cria tenant; Master e administradores autorizados de um tenant criam usuarios no respectivo tenant.
