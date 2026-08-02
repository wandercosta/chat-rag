# Guia e Padronização de Contêineres (Docker)

Este documento estabelece o padrão oficial de contêineres para o **ChatRAG**, detalhando como subir os serviços locais, construir as imagens da aplicação e operar a infraestrutura contêinerizada.

---

## Visão Geral da Arquitetura de Contêineres

O ChatRAG pode ser executado em duas modalidades com Docker:

1. **Modo Desenvolvimento (Infraestrutura apenas - padrão)**:
   - Subimos apenas os serviços de infraestrutura (PostgreSQL + pgvector, Redis e MinIO) via Docker.
   - O backend Fastify, o worker BullMQ e o painel web rodam diretamente na máquina host via Node.js (`npm run dev`).
   - Arquivo responsável: `docker-compose.yml` (raiz).

2. **Modo Full Containerizado (Stack completa)**:
   - Toda a aplicação (banco de dados, Redis, MinIO, API Fastify, Worker de indexação e Frontend Painel) roda dentro de contêineres Docker isolados.
   - Recomendado para homologação, testes integrados de ambiente e padronização total.
   - Arquivo responsável: `docker-compose.full.yml` (raiz).

---

## 1. Modo Desenvolvimento (Infraestrutura)

### Subindo os Serviços de Infraestrutura

Na raiz do repositório, execute:

```bash
docker compose up -d
```

### Serviços Inicializados:

- **`db`** (`pgvector/pgvector:pg16`):
  - Porta mapeada no host: `5433:5432` (mapeada em `5433` para evitar conflito com instâncias nativas de PostgreSQL rodando na porta padrão `5432`).
  - Banco inicial: `chatrag` (usuário: `chatrag`, senha: `chatrag`).
  - Script de inicialização automática: cria extensão `pgvector` (`infra/postgres-init/001-pgvector.sql`).
  - Volume persistente: `chatrag_postgres_data`.

- **`redis`** (`redis:7-alpine`):
  - Porta mapeada no host: `6379:6379`.
  - Usado por: gerenciamento de sessões de usuário, limite de requisições (rate limiting) e filas do BullMQ.
  - Volume persistente: `chatrag_redis_data`.

- **`minio`** (`minio/minio:latest`):
  - Porta S3 API no host: `9000:9000`.
  - Porta Painel Web Console: `9001:9001` (Acesse `http://localhost:9001` com usuário `chatrag` e senha `chatrag123`).
  - Usado por: armazenamento de arquivos de conhecimento (PDF/DOCX).
  - Volume persistente: `chatrag_minio_data`.

### Comandos Úteis do Docker Compose Infra:

```bash
# Verificar status dos contêineres
docker compose ps

# Acompanhar logs de um serviço específico (ex: banco)
docker compose logs -f db

# Parar contêineres mantendo os dados salvos
docker compose down

# Parar contêineres e APAGAR todos os dados armazenados nos volumes
docker compose down -v
```

---

## 2. Preparando a Aplicação no Modo Desenvolvimento

Após subir os contêineres de infraestrutura, siga a sequência padrão de inicialização:

1. **Configurar variáveis de ambiente do Backend**:

   ```bash
   cd backend
   cp .env.example .env
   ```

2. **Instalar dependências e executar migrações no banco do Docker**:

   ```bash
   npm install
   npm run migrate:up
   ```

3. **Criar o bucket do MinIO**:

   ```bash
   npm run bucket:create
   ```

4. **Criar usuário Master inicial**:

   ```bash
   npx tsx scripts/create-master.ts admin@chatrag.local "SenhaForte123!"
   ```

5. **Iniciar a API e o Worker**:
   ```bash
   npm run dev      # Em um terminal
   npm run worker   # Em outro terminal
   ```

---

## 3. Modo Full Containerizado (Stack Completa)

Para subir **todos** os componentes em contêineres Docker (incluindo API, Worker e Frontend):

### Imagens Docker Disponíveis:

- **Backend Dockerfile** (`backend/Dockerfile`): Imagem Node.js multi-estágio. Pode rodar tanto como API (`npm start`) quanto como Worker (`npm run worker`).
- **Frontend Dockerfile** (`Dockerfile` na raiz): Imagem Node.js multi-estágio compilando o aplicativo React / TanStack Start com Vite.

### Executando a Stack Completa:

```bash
docker compose -f docker-compose.full.yml up -d --build
```

---

## 4. Banco de Dados para Testes de Integração em Contêiner

Os testes de integração do backend exigem um banco separado denominado `chatrag_test` para garantir que dados de dev não sejam apagados durante a limpeza de fixtures (`resetDatabase()`).

Para preparar o banco de testes no container PostgreSQL já rodando:

```bash
# Criar o banco de teste dentro do container db
docker exec -e PGPASSWORD=chatrag chatrag-db-1 psql -U chatrag -d postgres -c "CREATE DATABASE chatrag_test OWNER chatrag;"

# Rodar as migrações no banco de teste
cd backend
npx cross-env DATABASE_URL="postgres://chatrag:chatrag@localhost:5433/chatrag_test" node-pg-migrate up -j ts --migrations-dir migrations
```

Para rodar os testes de integração:

```bash
npm run test:integration
```

---

## 5. Resolução de Problemas Comuns

- **Erro de porta em uso (`port is already allocated`)**:
  Se a porta 5433, 6379, 9000 ou 9001 estiver ocupada, você pode alterar a porta utilizada ajustando o arquivo `.env` na raiz ou no arquivo `docker-compose.yml`.
- **Banco não aceita conexões no início**:
  O PostgreSQL realiza verificações de saúde (`healthcheck`). Se o backend tentar conectar antes do banco estar pronto, aguarde alguns segundos ou verifique com `docker compose ps`.
- **Extensão pgvector não encontrada**:
  O arquivo `infra/postgres-init/001-pgvector.sql` cria a extensão automaticamente ao subir o volume do PostgreSQL pela primeira vez. Caso utilize um volume antigo pré-existente, rode manualmente no banco: `CREATE EXTENSION IF NOT EXISTS vector;`.
