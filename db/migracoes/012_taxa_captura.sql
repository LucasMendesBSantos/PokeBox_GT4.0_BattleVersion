-- capture_rate da PokeAPI em cada espécie: a chance de captura na história passa a depender dela.
-- As espécies que já estão no banco ficam com NULL e são completadas pelo back na primeira vez que forem usadas.
-- Aplicar depois da 011: docker compose exec -T db psql -U pokebox -d pokebox < db/migracoes/012_taxa_captura.sql
BEGIN;
ALTER TABLE especies ADD COLUMN IF NOT EXISTS taxa_captura SMALLINT CHECK (taxa_captura BETWEEN 0 AND 255);
COMMIT;
