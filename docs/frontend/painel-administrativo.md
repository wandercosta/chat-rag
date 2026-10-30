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

## Telas planejadas (ADR-006)

12. **Caixa de entrada** (`/atendimento`, ja existe para o widget): abas Aguardando, Minhas, Todas abertas, Resolvidas e Com o assistente; assumir, devolver, atribuir (administrador), mudar status, responder, nota interna (visualmente distinta da resposta) e respostas prontas; atualiza sem recarregar. O detalhe do assistente ganhou o interruptor "Atendimento humano pelo painel". Falta: filtro por canal, que chega com os canais.
13. **Contatos** (`/contatos` e `/contatos/:id`, ja existem): busca, filtro por etiqueta, opt-in e segmento, salvar segmento, importar e exportar CSV, etiquetas e campos personalizados; detalhe com dados, etiquetas, opt-in, canais e conversas, e exclusao (LGPD). Na caixa de entrada, o nome do contato aparece na fila e ha "Salvar como contato" para visitante anonimo.
14. **Canais** (`/canais`, ja existe para WhatsApp, Instagram, Messenger e Telegram; so Administrador): conectar com conferencia das credenciais no provedor, URL de retorno e token de verificacao para copiar, testar conexao, sincronizar e listar modelos, desconectar. Na caixa de entrada, conversas de WhatsApp mostram o canal, o recibo de cada mensagem e, fora da janela de 24 horas, o envio de modelo no lugar da resposta livre. No Telegram o webhook e registrado sozinho (sem dados para copiar); modelos so no WhatsApp; fora da janela de 24 horas no Instagram/Messenger, o painel so avisa.
15. **Campanhas:** publico por segmento (so contatos com opt-in), template, agendamento e metricas de entrega.
16. **Automacoes:** editor visual de fluxo, publicar/despublicar e log de execucoes.

O papel de quem atende e o **Atendente** (tabela abaixo).

## Perfis iniciais

| Perfil         | Alcance                                                                                              |
| -------------- | ---------------------------------------------------------------------------------------------------- |
| Master         | Todas as organizacoes, usuarios, auditoria e configuracoes globais                                   |
| Administrador  | Todos os recursos da propria organizacao                                                             |
| Editor de base | Topicos e fontes autorizados; nao gerencia chaves ou usuarios                                        |
| Analista       | Consulta conversas, feedbacks, lacunas e metricas                                                    |
| Atendente      | Caixa de entrada: assume, responde, anota e resolve conversas; nao gerencia base, chaves ou usuarios |

Permissoes granulares poderao evoluir depois; nenhuma verificacao de seguranca pode depender apenas do frontend.

O Master e um papel de plataforma, sem `organization_id`. Perfis de tenant sempre sao associados a uma unica organizacao na sessao ativa.

O acesso de suporte do Master exige justificativa, tempo de expiracao e evento de auditoria com Master, tenant, inicio, fim e acoes relevantes. A interface deve deixar claro que o Master esta em modo de suporte.

Na criacao de usuario, Master e administrador do tenant podem escolher convite por e-mail ou senha provisoria com troca obrigatoria no primeiro acesso.

Nao deve existir tela, rota ou link de cadastro publico. Apenas Master cria tenant; Master e administradores autorizados de um tenant criam usuarios no respectivo tenant.
