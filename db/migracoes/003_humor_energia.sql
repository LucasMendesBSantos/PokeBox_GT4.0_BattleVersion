-- Humor e energia dos Pokémon, para bancos criados antes destas colunas existirem.
-- Aplicar: docker compose exec -T db psql -U pokebox -d pokebox < db/migracoes/003_humor_energia.sql
ALTER TABLE pokemons ADD COLUMN IF NOT EXISTS humor SMALLINT NOT NULL DEFAULT 50 CHECK (humor BETWEEN 0 AND 100);
ALTER TABLE pokemons ADD COLUMN IF NOT EXISTS energia SMALLINT NOT NULL DEFAULT 50 CHECK (energia BETWEEN 0 AND 100);
ALTER TABLE pokemons ADD COLUMN IF NOT EXISTS bem_estar_em TIMESTAMPTZ NOT NULL DEFAULT now();
