-- Afeto (cuidados) e vitrine, para bancos criados antes destas colunas/tabelas existirem.
-- Aplicar: docker compose exec -T db psql -U pokebox -d pokebox < db/migracoes/002_afeto_vitrine.sql
ALTER TABLE pokemons ADD COLUMN IF NOT EXISTS afeto SMALLINT NOT NULL DEFAULT 0 CHECK (afeto BETWEEN 0 AND 500);
ALTER TABLE pokemons ADD COLUMN IF NOT EXISTS posicao_vitrine SMALLINT CHECK (posicao_vitrine BETWEEN 1 AND 6);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'pokemons_dono_id_posicao_vitrine_key') THEN
    ALTER TABLE pokemons ADD CONSTRAINT pokemons_dono_id_posicao_vitrine_key UNIQUE (dono_id, posicao_vitrine);
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS cuidados (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pokemon_id  BIGINT NOT NULL REFERENCES pokemons(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('carinho', 'brincar', 'alimentar')),
  afeto       SMALLINT NOT NULL,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cuidados_pokemon_idx ON cuidados (pokemon_id, tipo, criado_em DESC);

CREATE TABLE IF NOT EXISTS vitrines (
  usuario_id     BIGINT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  bio            TEXT NOT NULL DEFAULT '' CHECK (length(bio) <= 160),
  estilo         TEXT NOT NULL DEFAULT 'palco' CHECK (estilo IN ('palco', 'album')),
  visitas        INTEGER NOT NULL DEFAULT 0,
  atualizada_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
