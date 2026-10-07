-- Pontos extras de status sorteados ao evoluir.
-- Aplicar depois da 010: docker compose exec -T db psql -U pokebox -d pokebox < db/migracoes/011_bonus_evolucao.sql
BEGIN;
ALTER TABLE pokemons ADD COLUMN IF NOT EXISTS bonus_hp SMALLINT NOT NULL DEFAULT 0 CHECK (bonus_hp >= 0);
ALTER TABLE pokemons ADD COLUMN IF NOT EXISTS bonus_ataque SMALLINT NOT NULL DEFAULT 0 CHECK (bonus_ataque >= 0);
ALTER TABLE pokemons ADD COLUMN IF NOT EXISTS bonus_defesa SMALLINT NOT NULL DEFAULT 0 CHECK (bonus_defesa >= 0);
ALTER TABLE pokemons ADD COLUMN IF NOT EXISTS bonus_velocidade SMALLINT NOT NULL DEFAULT 0 CHECK (bonus_velocidade >= 0);
COMMIT;
