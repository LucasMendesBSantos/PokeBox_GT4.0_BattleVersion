-- Revanches da história contra Pokémon aleatórios (várias linhas por ponto) e limite de 10 tentativas de captura.
-- Aplicar depois da 007: docker compose exec -T db psql -U pokebox -d pokebox < db/migracoes/008_revanche_aleatoria.sql
BEGIN;

ALTER TABLE historia_encontros ADD COLUMN IF NOT EXISTS revanche BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE historia_encontros DROP CONSTRAINT IF EXISTS historia_encontros_status_check;
ALTER TABLE historia_encontros ADD CONSTRAINT historia_encontros_status_check
  CHECK (status IN ('encontrado', 'vencido', 'capturado', 'fugiu'));

-- Um ponto passa a ter vários encontros; só o primeiro de cada ponto continua único
ALTER TABLE historia_encontros DROP CONSTRAINT IF EXISTS historia_encontros_usuario_id_trilha_ponto_key;
CREATE UNIQUE INDEX IF NOT EXISTS historia_primeiro_encontro_idx
  ON historia_encontros (usuario_id, trilha, ponto) WHERE NOT revanche;
DROP INDEX IF EXISTS historia_encontro_aberto_idx;
CREATE UNIQUE INDEX historia_encontro_aberto_idx ON historia_encontros (usuario_id)
  WHERE status = 'encontrado' AND NOT revanche;
CREATE INDEX IF NOT EXISTS historia_encontros_ponto_idx ON historia_encontros (usuario_id, trilha, ponto, id DESC);

-- Quem já errou 10 capturas no mesmo Pokémon: ele foge
UPDATE historia_encontros SET status = 'fugiu' WHERE status = 'vencido' AND tentativas_captura >= 10;

COMMIT;
