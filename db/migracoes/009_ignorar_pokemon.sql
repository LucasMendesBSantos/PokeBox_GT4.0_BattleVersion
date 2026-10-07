-- Ignorar o Pokémon derrotado na história (desiste da captura e libera o ponto para refazer).
-- Aplicar depois da 008: docker compose exec -T db psql -U pokebox -d pokebox < db/migracoes/009_ignorar_pokemon.sql
BEGIN;
ALTER TABLE historia_encontros DROP CONSTRAINT IF EXISTS historia_encontros_status_check;
ALTER TABLE historia_encontros ADD CONSTRAINT historia_encontros_status_check
  CHECK (status IN ('encontrado', 'vencido', 'capturado', 'fugiu', 'ignorado'));
COMMIT;
