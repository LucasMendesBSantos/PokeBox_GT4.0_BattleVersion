-- Desbloqueio pago dos golpes especiais (sem precisar do afeto máximo).
-- Aplicar depois da 011: docker compose exec -T db psql -U pokebox -d pokebox < db/migracoes/012_desbloqueio_golpes.sql
BEGIN;
ALTER TABLE pokemons ADD COLUMN IF NOT EXISTS golpes_desbloqueados BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE transacoes_pokecoins DROP CONSTRAINT IF EXISTS transacoes_pokecoins_motivo_check;
ALTER TABLE transacoes_pokecoins ADD CONSTRAINT transacoes_pokecoins_motivo_check
  CHECK (motivo IN ('bonus_cadastro', 'compra_loja', 'recompensa_batalha', 'compra_mercado', 'venda_mercado', 'troca',
                    'compra_pokebola', 'recompensa_historia', 'refazer_historia', 'roleta_golpes', 'desbloqueio_golpes'));
COMMIT;
