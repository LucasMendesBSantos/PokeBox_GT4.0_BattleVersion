-- Banco de dados do PokeBox TCG (PostgreSQL 14+)

-- ---------------------------------------------------------------------------
-- Usuários, login e economia
-- ---------------------------------------------------------------------------

CREATE TABLE usuarios (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  login       TEXT NOT NULL,
  celular     TEXT NOT NULL,
  senha_hash  TEXT NOT NULL,
  -- O CHECK impede saldo negativo mesmo se duas compras concorrerem
  pokecoins   INTEGER NOT NULL DEFAULT 0 CHECK (pokecoins >= 0),
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- "Ash" e "ash" são o mesmo treinador
CREATE UNIQUE INDEX usuarios_login_idx ON usuarios (lower(login));

-- Sessões de login. Guardamos só o hash do token: quem ler o banco não consegue se passar pelo usuário.
CREATE TABLE sessoes (
  token_hash  TEXT PRIMARY KEY,
  usuario_id  BIGINT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  expira_em   TIMESTAMPTZ NOT NULL,
  criada_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX sessoes_usuario_idx ON sessoes (usuario_id);

-- ---------------------------------------------------------------------------
-- Pokédex (cache local da PokeAPI)
-- ---------------------------------------------------------------------------

-- Dados base de cada espécie. É preenchida sob demanda na primeira vez que a
-- espécie é mintada, assim batalhas e evoluções não dependem da PokeAPI estar no ar.
CREATE TABLE especies (
  id               INTEGER PRIMARY KEY,       -- mesmo id da PokeAPI
  nome             TEXT NOT NULL,
  tipos            TEXT[] NOT NULL,
  raridade         TEXT NOT NULL CHECK (raridade IN ('comum', 'lendario', 'mitico')),
  hp_base          SMALLINT NOT NULL,
  ataque_base      SMALLINT NOT NULL,
  defesa_base      SMALLINT NOT NULL,
  velocidade_base  SMALLINT NOT NULL,
  altura_base      INTEGER NOT NULL,          -- decímetros (unidade da PokeAPI)
  peso_base        INTEGER NOT NULL,          -- hectogramas (unidade da PokeAPI)
  -- Próximas espécies e o nível pedido para cada uma (Eevee tem várias):
  -- [{ "especieId": 5, "nome": "charmeleon", "nivel": 16 }]
  evolucoes        JSONB NOT NULL DEFAULT '[]',
  atualizado_em    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Cards (cada Pokémon é um objeto único)
-- ---------------------------------------------------------------------------

-- Número público do card ("Pikachu #0042"). É global e não por espécie: quando
-- Pikachu #0042 evolui para Raichu, o número continua único sem colidir com
-- um Raichu #0042 já existente.
CREATE SEQUENCE mint_numero_seq;

CREATE TABLE pokemons (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  mint_numero          BIGINT NOT NULL UNIQUE DEFAULT nextval('mint_numero_seq'),
  dono_id              BIGINT NOT NULL REFERENCES usuarios(id),
  especie_id           INTEGER NOT NULL REFERENCES especies(id),  -- muda ao evoluir
  especie_original_id  INTEGER NOT NULL REFERENCES especies(id),  -- espécie em que foi mintado
  origem               TEXT NOT NULL CHECK (origem IN ('inicial', 'loja')),

  -- Atributos sorteados no mint: nunca mudam, nem ao evoluir
  shiny                BOOLEAN NOT NULL,
  iv_hp                SMALLINT NOT NULL CHECK (iv_hp BETWEEN 0 AND 31),
  iv_ataque            SMALLINT NOT NULL CHECK (iv_ataque BETWEEN 0 AND 31),
  iv_defesa            SMALLINT NOT NULL CHECK (iv_defesa BETWEEN 0 AND 31),
  iv_velocidade        SMALLINT NOT NULL CHECK (iv_velocidade BETWEEN 0 AND 31),
  -- Guardamos o multiplicador, não o valor final: depois de evoluir,
  -- altura = altura_base da nova espécie * mult_altura
  mult_altura          NUMERIC(4, 3) NOT NULL CHECK (mult_altura BETWEEN 0.8 AND 1.2),
  mult_peso            NUMERIC(4, 3) NOT NULL CHECK (mult_peso BETWEEN 0.8 AND 1.2),

  -- Progressão
  nivel                SMALLINT NOT NULL DEFAULT 1 CHECK (nivel BETWEEN 1 AND 100),
  xp                   INTEGER NOT NULL DEFAULT 0 CHECK (xp >= 0),  -- XP acumulado dentro do nível atual

  -- Posição no time de batalha (1 a 5) ou NULL se está só na coleção
  posicao_time         SMALLINT CHECK (posicao_time BETWEEN 1 AND 5),

  criado_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dono_id, posicao_time)
);
CREATE INDEX pokemons_dono_idx ON pokemons (dono_id);

-- ---------------------------------------------------------------------------
-- Batalhas assíncronas
-- ---------------------------------------------------------------------------

CREATE TABLE batalhas (
  id                   BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  desafiante_id        BIGINT NOT NULL REFERENCES usuarios(id),
  desafiado_id         BIGINT NOT NULL REFERENCES usuarios(id),
  status               TEXT NOT NULL DEFAULT 'aguardando'
                       CHECK (status IN ('aguardando', 'em_andamento', 'finalizada', 'recusada', 'expirada')),
  expira_em            TIMESTAMPTZ NOT NULL,             -- prazo para o desafiado aceitar

  -- Estado do tabuleiro (times, HP atual, Pokémon ativo, turnos perdidos...).
  -- Os status dos Pokémon são congelados no início: subir de nível no meio
  -- de outra batalha não altera esta.
  estado               JSONB,
  turno                INTEGER NOT NULL DEFAULT 0,
  vez_de               BIGINT REFERENCES usuarios(id),   -- de quem é a jogada agora
  prazo_em             TIMESTAMPTZ,                      -- limite da jogada atual (4h)
  ultimo_movimento_em  TIMESTAMPTZ,

  vencedor_id          BIGINT REFERENCES usuarios(id),
  motivo_fim           TEXT CHECK (motivo_fim IN ('nocaute', 'wo', 'desistencia')),
  -- O que cada jogador recebeu: { "<usuarioId>": { pokecoins, xp, subiram, semRecompensa } }
  recompensas          JSONB,

  criada_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizada_em        TIMESTAMPTZ,
  CHECK (desafiante_id <> desafiado_id)
);
-- O agendador procura só batalhas em andamento com prazo vencido e desafios vencidos
CREATE INDEX batalhas_prazo_idx ON batalhas (prazo_em) WHERE status = 'em_andamento';
CREATE INDEX batalhas_expira_idx ON batalhas (expira_em) WHERE status = 'aguardando';
CREATE INDEX batalhas_desafiante_idx ON batalhas (desafiante_id, criada_em DESC);
CREATE INDEX batalhas_desafiado_idx ON batalhas (desafiado_id, criada_em DESC);

-- Histórico de ações (replay da batalha e auditoria)
CREATE TABLE batalha_acoes (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  batalha_id  BIGINT NOT NULL REFERENCES batalhas(id),
  turno       INTEGER NOT NULL,
  jogador_id  BIGINT NOT NULL REFERENCES usuarios(id),
  tipo        TEXT NOT NULL CHECK (tipo IN ('atacar', 'trocar', 'passar', 'desistir')),
  automatica  BOOLEAN NOT NULL DEFAULT false,   -- true = feita pelo sistema por timeout
  eventos     JSONB NOT NULL,                   -- dano, crítico, nocautes... para a animação no front
  criada_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX batalha_acoes_batalha_idx ON batalha_acoes (batalha_id, id);

-- Extrato: toda entrada/saída de Pokécoins fica registrada (auditoria e limites anti-farm)
CREATE TABLE transacoes_pokecoins (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  BIGINT NOT NULL REFERENCES usuarios(id),
  valor       INTEGER NOT NULL,              -- positivo = ganho, negativo = gasto
  motivo      TEXT NOT NULL CHECK (motivo IN ('bonus_cadastro', 'compra_loja', 'recompensa_batalha')),
  batalha_id  BIGINT REFERENCES batalhas(id), -- preenchido quando motivo = recompensa_batalha
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transacoes_usuario_idx ON transacoes_pokecoins (usuario_id, motivo, criado_em DESC);
