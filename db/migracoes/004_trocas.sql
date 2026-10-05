-- Mercado de trocas, para bancos criados antes destas tabelas existirem.
-- Aplicar: docker compose exec -T db psql -U pokebox -d pokebox < db/migracoes/004_trocas.sql
BEGIN;

-- ---------------------------------------------------------------------------
-- Trocas entre jogadores
-- ---------------------------------------------------------------------------

-- Pokémon anunciado no mercado: à venda por Pokécoins (preco), aberto a propostas, ou os dois.
-- Pokémon do time de batalha não podem ser anunciados.
CREATE TABLE IF NOT EXISTS anuncios (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pokemon_id        BIGINT NOT NULL REFERENCES pokemons(id),
  vendedor_id       BIGINT NOT NULL REFERENCES usuarios(id),
  preco             INTEGER CHECK (preco > 0),       -- NULL = não vende direto, só aceita propostas
  aceita_propostas  BOOLEAN NOT NULL DEFAULT false,
  status            TEXT NOT NULL DEFAULT 'ativo'
                    CHECK (status IN ('ativo', 'vendido', 'trocado', 'cancelado')),
  comprador_id      BIGINT REFERENCES usuarios(id),  -- quem ficou com o Pokémon (vendido/trocado)
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em     TIMESTAMPTZ,
  CHECK (preco IS NOT NULL OR aceita_propostas)
);
-- Um Pokémon só pode ter um anúncio ativo por vez
CREATE UNIQUE INDEX IF NOT EXISTS anuncios_pokemon_ativo_idx ON anuncios (pokemon_id) WHERE status = 'ativo';
CREATE INDEX IF NOT EXISTS anuncios_vendedor_idx ON anuncios (vendedor_id) WHERE status = 'ativo';

-- Proposta de troca num anúncio: Pokémon e/ou Pokécoins oferecidos pelo proponente.
-- Nada fica reservado: na hora de aceitar, tudo é conferido de novo.
CREATE TABLE IF NOT EXISTS propostas (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anuncio_id     BIGINT NOT NULL REFERENCES anuncios(id),
  proponente_id  BIGINT NOT NULL REFERENCES usuarios(id),
  pokecoins      INTEGER NOT NULL DEFAULT 0 CHECK (pokecoins >= 0),
  -- encerrada = o sistema fechou (o anúncio acabou ou um Pokémon oferecido mudou de dono)
  status         TEXT NOT NULL DEFAULT 'pendente'
                 CHECK (status IN ('pendente', 'aceita', 'recusada', 'cancelada', 'encerrada')),
  criada_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  respondida_em  TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS propostas_anuncio_idx ON propostas (anuncio_id) WHERE status = 'pendente';
CREATE INDEX IF NOT EXISTS propostas_proponente_idx ON propostas (proponente_id, id DESC);

CREATE TABLE IF NOT EXISTS proposta_pokemons (
  proposta_id  BIGINT NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
  pokemon_id   BIGINT NOT NULL REFERENCES pokemons(id),
  PRIMARY KEY (proposta_id, pokemon_id)
);
CREATE INDEX IF NOT EXISTS proposta_pokemons_pokemon_idx ON proposta_pokemons (pokemon_id);

ALTER TABLE transacoes_pokecoins ADD COLUMN IF NOT EXISTS anuncio_id BIGINT REFERENCES anuncios(id);
ALTER TABLE transacoes_pokecoins DROP CONSTRAINT IF EXISTS transacoes_pokecoins_motivo_check;
ALTER TABLE transacoes_pokecoins ADD CONSTRAINT transacoes_pokecoins_motivo_check
  CHECK (motivo IN ('bonus_cadastro', 'compra_loja', 'recompensa_batalha', 'compra_mercado', 'venda_mercado', 'troca'));

COMMIT;
