-- Recompensa de Pokécoins a cada coração de afeto completado (motivo 'recompensa_afeto' no extrato).
-- Os corações que os cards já têm contam como pagos, para não sair uma recompensa retroativa de uma vez.
-- Aplicar depois da 012: docker compose exec -T db psql -U pokebox -d pokebox < db/migracoes/013_recompensa_afeto.sql
BEGIN;
ALTER TABLE pokemons ADD COLUMN IF NOT EXISTS coracoes_premiados SMALLINT NOT NULL DEFAULT 0
  CHECK (coracoes_premiados BETWEEN 0 AND 5);
UPDATE pokemons SET coracoes_premiados = afeto / 100 WHERE coracoes_premiados < afeto / 100;
ALTER TABLE transacoes_pokecoins DROP CONSTRAINT IF EXISTS transacoes_pokecoins_motivo_check;
ALTER TABLE transacoes_pokecoins ADD CONSTRAINT transacoes_pokecoins_motivo_check
  CHECK (motivo IN ('bonus_cadastro', 'compra_loja', 'recompensa_batalha', 'compra_mercado', 'venda_mercado', 'troca',
                    'compra_pokebola', 'recompensa_historia', 'refazer_historia', 'roleta_golpes', 'desbloqueio_golpes',
                    'recompensa_afeto'));
COMMIT;
