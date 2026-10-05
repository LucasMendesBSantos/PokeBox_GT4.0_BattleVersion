-- O time passa de 5 para 3 Pokémon (batalhas 3x3). Quem estava nas posições 4 e 5 volta para a coleção.
-- Aplicar: docker compose exec -T db psql -U pokebox -d pokebox < db/migracoes/005_time_de_3.sql
BEGIN;
UPDATE pokemons SET posicao_time = NULL WHERE posicao_time > 3;
ALTER TABLE pokemons DROP CONSTRAINT IF EXISTS pokemons_posicao_time_check;
ALTER TABLE pokemons ADD CONSTRAINT pokemons_posicao_time_check CHECK (posicao_time BETWEEN 1 AND 3);
COMMIT;
