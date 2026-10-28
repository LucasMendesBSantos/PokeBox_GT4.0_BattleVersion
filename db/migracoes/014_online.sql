-- Presença online: último sinal de vida com o jogo aberto (POST /presenca a cada 20s).
-- Online = dentro de config.JANELA_ONLINE_MS; NULL depois de sair da conta.
-- Aplicar depois da 013: docker compose exec -T db psql -U pokebox -d pokebox < db/migracoes/014_online.sql
BEGIN;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS online_em TIMESTAMPTZ;
COMMIT;
