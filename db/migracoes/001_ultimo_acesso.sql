-- Para bancos criados antes desta coluna existir (o db.sql só roda quando o banco é criado).
-- Aplicar: docker compose exec -T db psql -U pokebox -d pokebox < db/migracoes/001_ultimo_acesso.sql
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS ultimo_acesso_em TIMESTAMPTZ NOT NULL DEFAULT now();
CREATE INDEX IF NOT EXISTS usuarios_ultimo_acesso_idx ON usuarios (ultimo_acesso_em DESC);
