-- Ativa a extensao pgvector no banco local assim que o container sobe pela primeira vez.
-- Docker so roda arquivos desta pasta na PRIMEIRA inicializacao do volume de dados.
CREATE EXTENSION IF NOT EXISTS vector;
