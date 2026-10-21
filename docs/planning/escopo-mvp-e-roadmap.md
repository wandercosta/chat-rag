# Escopo do MVP e roadmap

## MVP

1. Login proprio, painel Master e base multi-tenant desde o primeiro release.
2. Provisionamento manual de tenants pelo Master, com usuario administrador inicial, status, limites e permissoes.
3. Sem auto cadastro publico: usuarios entram somente por convite ou criacao administrativa.
4. Topicos, texto manual, PDF, DOCX e URL como fontes.
5. Extracao, divisao em trechos, embeddings, indexacao e reindexacao automatica.
6. Chat de teste no painel e respostas estritamente baseadas na base por padrao.
7. Widget flutuante e embutivel, com chave por ambiente e dominio permitido.
8. Configuracao visual, privacidade, identificacao do visitante, retencao e encaminhamento.
9. Lacunas, feedback, historico limitado, metricas e auditoria.
10. Chave OpenAI por tenant, com teste, criptografia, reutilizacao opcional entre ambientes, substituicao e uso/custo segregados.
11. Catalogo curto de modelos administrado pelo Master; cada tenant escolhe apenas entre modelos liberados.

## Fora do MVP

- Execucao de acoes ou leitura de dados de sistemas externos.
- Cobranca, assinatura e autoatendimento comercial.
- Audio, video, imagem, planilha e sincronizacao de APIs.
- Login integrado a sistemas externos (SSO).
- Atendimento humano nativo; o primeiro canal sera WhatsApp.

## Evolucao

| Fase | Entrega                                                                                 |
| ---- | --------------------------------------------------------------------------------------- |
| 0    | Documentacao, Docker local, painel Master, fundacao multi-tenant e autenticacao propria |
| 1    | Base de conhecimento, RAG e chat de teste interno                                       |
| 2    | Widget externo, chaves, dominios e identificacao opcional                               |
| 3    | Governanca SaaS: planos, limites, autoatendimento e SSO                                 |
| 4    | Canais, acoes autorizadas e conectores de dados                                         |

## Criterio de sucesso do MVP

Um administrador cria uma organizacao, um assistente e fontes; a base fica indexada; o assistente responde somente com aquele contexto; e o widget pode ser instalado em um dominio autorizado com uma chave revogavel.
