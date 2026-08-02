# ADR-002: Seguranca de segredos, estrutura de modulos e limites operacionais

**Status:** Aceita em planejamento

## Contexto

Complementa o ADR-001 com decisoes levantadas em revisao de arquitetura anterior ao inicio da Fase 0: gestao da chave mestra de criptografia, fronteiras internas do monolito, isolamento de carga entre tenants no banco vetorial, limites de abuso do widget, ciclo de vida da retencao, imutabilidade de auditoria, isolamento do widget no DOM hospedeiro e proporcao do gate de CI para o tamanho do MVP.

## Decisoes

1. **Criptografia de segredos por envelope.** A chave OpenAI de cada tenant e protegida por envelope encryption: uma Key Encryption Key (KEK) gerenciada por um KMS (ex.: KMS do provedor de nuvem em producao; Vault em modo dev ou arquivo de chave local cifrado no Docker Compose) protege uma ou mais Data Encryption Keys (DEK) por ambiente; as DEKs cifram o segredo do tenant no banco. A interface de KMS e abstraida, no mesmo padrao adotado para o provedor de IA, permitindo trocar de implementacao sem migrar segredos. Rotacao de KEK e barata (re-envelopa so a DEK); rotacao de DEK exige job de re-criptografia em lote dos segredos de tenant, agendado e auditado, sem expor valor em claro fora do processo do backend.

2. **Fronteiras internas do monolito modular.** Cada modulo (`identity`, `organizations`, `assistants`, `knowledge`, `rag`, `conversations`, `embed`, `analytics`, `audit`) expoe apenas uma interface publica (servico do modulo); nenhum modulo acessa repositorio, tabela ou tipo interno de outro modulo diretamente. Import entre modulos so pode alcancar a interface publica; a checagem e automatizada por lint de dependencias (ex.: dependency-cruiser ou regra de import restrito no linter), quebrando o build quando violada. Cada modulo organiza sua propria pasta com subpastas por responsabilidade (rotas, servico, repositorio, tipos).

3. **Limite de tamanho de arquivo.** Nenhum arquivo de codigo deve ultrapassar ~300 linhas como sinal de alerta. Ao se aproximar do limite, o arquivo e dividido por sub-responsabilidade (ex.: `knowledge/sources.repository.ts` e `knowledge/topics.repository.ts` em vez de um `knowledge.repository.ts` unico cobrindo tudo). E convencao de estrutura observada em revisao de codigo, nao um teste automatizado obrigatorio no MVP.

4. **Indice vetorial e isolamento de carga entre tenants.** pgvector usa indice HNSW por padrao (melhor tempo de consulta; custo de construcao aceito). Particionamento fisico da tabela de chunks por `organization_id` nao entra no MVP, mas fica definido como gatilho documentado: adotar quando um unico tenant ultrapassar uma fracao relevante do volume total de chunks, ou quando o volume total tornar a manutencao do indice mais cara que o aceitavel. O enfileiramento de indexacao aplica limite de jobs simultaneos por tenant (concorrencia maxima configuravel), para que um upload em massa de um tenant nao esgote a fila de indexacao de outros tenants.

5. **Rate limit padrao do widget desde o MVP.** Limites default aplicados por combinacao de chave + dominio + IP, configuraveis futuramente por tenant/plano:
   - 60 requisicoes/minuto por chave+IP;
   - 30 novas conversas/hora por chave+dominio;
   - 60 mensagens/hora por conversa.
     Mecanismo: janela deslizante ou token bucket no Redis. CAPTCHA ou desafio antiautomacao continua como camada adicional futura, conforme telemetria de abuso (ver `security/privacidade-e-acesso.md`), mas o rate limit numerico acima nao depende dessa telemetria para existir.

6. **Job de retencao.** Um worker agendado (job recorrente na mesma infraestrutura de fila) executa a expurgacao/anonimizacao de conversas alem da politica de retencao efetiva de cada organizacao/assistente. Cada execucao gera um `audit_event` agregado (organizacao, quantidade afetada, timestamp), sem registrar conteudo de conversa. Criado junto com a funcionalidade de retencao configuravel; nao bloqueia a Fase 0.

7. **Auditoria append-only.** A tabela `audit_events` e gravada apenas por INSERT pela role de aplicacao; UPDATE e DELETE nao sao permitidos a essa role no banco (restricao de permissao de banco, nao so regra de aplicacao). Correcao ou expurgacao legal segue caminho administrativo separado (migracao ou acesso privilegiado fora do fluxo normal da API), nunca via endpoint da aplicacao.

8. **Isolamento de DOM do widget.** O widget monta sua interface em Shadow DOM (`mode: 'open'`, para permitir depuracao), evitando colisao de CSS com o site hospedeiro e reduzindo risco de quebra por CSP restritivo do hospedeiro. Customizacao visual (cores, tema, logo) e aplicada via CSS custom properties que atravessam a fronteira do shadow root.

9. **Gate de CI proporcional ao tamanho do MVP.** O pipeline de CI roda testes de isolamento de organizacao e testes de contrato (painel/widget) como bloqueio obrigatorio de merge/deploy. O conjunto de avaliacao RAG (relevancia, alucinacao, encaminhamento correto) roda em cadencia mais espacada (agendado ou pre-release), nao em cada PR, para manter o CI do MVP rapido sem abrir mao da avaliacao periodica.

## Consequencias

Adiciona uma dependencia de KMS/gestao de chave mestra alem do banco; disciplina de lint para fronteiras de modulo e tamanho de arquivo; um gatilho documentado (nao imediato) para particionamento fisico de chunks; limites de taxa e concorrencia desde o primeiro release; e um job de retencao a ser criado junto da funcionalidade de retencao. Nenhuma decisao exige infraestrutura alem da ja prevista (Redis, fila, Postgres, KMS abstraido).
