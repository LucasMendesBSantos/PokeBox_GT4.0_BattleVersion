-- Refazer pontos já vencidos da história custa Pokécoins (motivo 'refazer_historia' no extrato).
-- Aplicar depois da 006: docker compose exec -T db psql -U pokebox -d pokebox < db/migracoes/007_refazer_historia.sql
BEGIN;
ALTER TABLE transacoes_pokecoins DROP CONSTRAINT IF EXISTS transacoes_pokecoins_motivo_check;
ALTER TABLE transacoes_pokecoins ADD CONSTRAINT transacoes_pokecoins_motivo_check
  CHECK (motivo IN ('bonus_cadastro', 'compra_loja', 'recompensa_batalha', 'compra_mercado', 'venda_mercado', 'troca',
                    'compra_pokebola', 'recompensa_historia', 'refazer_historia'));
COMMIT;
