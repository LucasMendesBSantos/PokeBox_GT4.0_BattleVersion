-- Golpes especiais: cache dos golpes da PokeAPI, lista de golpes de cada espécie e os golpes de cada card.
-- Aplicar depois da 009: docker compose exec -T db psql -U pokebox -d pokebox < db/migracoes/010_golpes.sql
BEGIN;

CREATE TABLE IF NOT EXISTS golpes (
  id        INTEGER PRIMARY KEY,
  nome      TEXT NOT NULL,
  tipo      TEXT NOT NULL,
  classe    TEXT NOT NULL CHECK (classe IN ('physical', 'special', 'status')),
  poder     SMALLINT,
  precisao  SMALLINT,
  pp        SMALLINT NOT NULL
);

ALTER TABLE especies ADD COLUMN IF NOT EXISTS movimentos INTEGER[];
ALTER TABLE pokemons ADD COLUMN IF NOT EXISTS golpes INTEGER[] NOT NULL DEFAULT '{}';

ALTER TABLE batalha_acoes DROP CONSTRAINT IF EXISTS batalha_acoes_tipo_check;
ALTER TABLE batalha_acoes ADD CONSTRAINT batalha_acoes_tipo_check
  CHECK (tipo IN ('atacar', 'golpe', 'trocar', 'passar', 'desistir'));

ALTER TABLE transacoes_pokecoins DROP CONSTRAINT IF EXISTS transacoes_pokecoins_motivo_check;
ALTER TABLE transacoes_pokecoins ADD CONSTRAINT transacoes_pokecoins_motivo_check
  CHECK (motivo IN ('bonus_cadastro', 'compra_loja', 'recompensa_batalha', 'compra_mercado', 'venda_mercado', 'troca',
                    'compra_pokebola', 'recompensa_historia', 'refazer_historia', 'roleta_golpes'));

COMMIT;
