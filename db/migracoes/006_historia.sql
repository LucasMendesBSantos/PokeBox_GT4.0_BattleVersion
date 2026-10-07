-- História (trilhas de Pokémon selvagens) e Pokébolas, para bancos criados antes destas tabelas/colunas existirem.
-- Aplicar: docker compose exec -T db psql -U pokebox -d pokebox < db/migracoes/006_historia.sql
BEGIN;

ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS pokebolas INTEGER NOT NULL DEFAULT 0 CHECK (pokebolas >= 0);

ALTER TABLE pokemons DROP CONSTRAINT IF EXISTS pokemons_origem_check;
ALTER TABLE pokemons ADD CONSTRAINT pokemons_origem_check CHECK (origem IN ('inicial', 'loja', 'captura'));

CREATE TABLE IF NOT EXISTS historia_encontros (
  id                  BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id          BIGINT NOT NULL REFERENCES usuarios(id),
  trilha              SMALLINT NOT NULL CHECK (trilha BETWEEN 1 AND 5),
  ponto               SMALLINT NOT NULL CHECK (ponto BETWEEN 1 AND 10),
  especie_id          INTEGER NOT NULL REFERENCES especies(id),
  forca               NUMERIC(3, 1) NOT NULL,
  nivel               SMALLINT NOT NULL CHECK (nivel BETWEEN 1 AND 100),
  shiny               BOOLEAN NOT NULL,
  iv_hp               SMALLINT NOT NULL CHECK (iv_hp BETWEEN 0 AND 31),
  iv_ataque           SMALLINT NOT NULL CHECK (iv_ataque BETWEEN 0 AND 31),
  iv_defesa           SMALLINT NOT NULL CHECK (iv_defesa BETWEEN 0 AND 31),
  iv_velocidade       SMALLINT NOT NULL CHECK (iv_velocidade BETWEEN 0 AND 31),
  mult_altura         NUMERIC(4, 3) NOT NULL CHECK (mult_altura BETWEEN 0.8 AND 1.2),
  mult_peso           NUMERIC(4, 3) NOT NULL CHECK (mult_peso BETWEEN 0.8 AND 1.2),
  status              TEXT NOT NULL DEFAULT 'encontrado' CHECK (status IN ('encontrado', 'vencido', 'capturado')),
  estado              JSONB,
  log                 JSONB NOT NULL DEFAULT '[]',
  recompensa          JSONB,
  tentativas_captura  SMALLINT NOT NULL DEFAULT 0,
  pokemon_id          BIGINT REFERENCES pokemons(id),
  criado_em           TIMESTAMPTZ NOT NULL DEFAULT now(),
  vencido_em          TIMESTAMPTZ,
  UNIQUE (usuario_id, trilha, ponto)
);
CREATE UNIQUE INDEX IF NOT EXISTS historia_encontro_aberto_idx ON historia_encontros (usuario_id) WHERE status = 'encontrado';

ALTER TABLE transacoes_pokecoins DROP CONSTRAINT IF EXISTS transacoes_pokecoins_motivo_check;
ALTER TABLE transacoes_pokecoins ADD CONSTRAINT transacoes_pokecoins_motivo_check
  CHECK (motivo IN ('bonus_cadastro', 'compra_loja', 'recompensa_batalha', 'compra_mercado', 'venda_mercado', 'troca',
                    'compra_pokebola', 'recompensa_historia'));

COMMIT;
