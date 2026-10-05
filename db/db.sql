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
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Última vez que usou o jogo (atualizado no máximo a cada 5 min). Alimenta a lista de treinadores ativos.
  ultimo_acesso_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);
-- "Ash" e "ash" são o mesmo treinador
CREATE UNIQUE INDEX usuarios_login_idx ON usuarios (lower(login));
CREATE INDEX usuarios_ultimo_acesso_idx ON usuarios (ultimo_acesso_em DESC);

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
  posicao_time         SMALLINT CHECK (posicao_time BETWEEN 1 AND 3),

  -- Pontos de afeto com o dono (carinho, brincar, alimentar). 100 pontos = 1 coração.
  -- Fica no card, então é mantido ao evoluir.
  afeto                SMALLINT NOT NULL DEFAULT 0 CHECK (afeto BETWEEN 0 AND 500),
  -- Humor e energia (0 a 100) no momento bem_estar_em; caem com o tempo (config.DESGASTE_POR_HORA),
  -- então o valor de agora é calculado na leitura
  humor                SMALLINT NOT NULL DEFAULT 50 CHECK (humor BETWEEN 0 AND 100),
  energia              SMALLINT NOT NULL DEFAULT 50 CHECK (energia BETWEEN 0 AND 100),
  bem_estar_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Posição entre os destaques da vitrine (1 a 6) ou NULL se não está exposto
  posicao_vitrine      SMALLINT CHECK (posicao_vitrine BETWEEN 1 AND 6),

  criado_em            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (dono_id, posicao_time),
  UNIQUE (dono_id, posicao_vitrine)
);
CREATE INDEX pokemons_dono_idx ON pokemons (dono_id);

-- Histórico de cuidados: dá a espera de cada cuidado e o "hoje" do cantinho de cuidado
CREATE TABLE cuidados (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pokemon_id  BIGINT NOT NULL REFERENCES pokemons(id) ON DELETE CASCADE,
  tipo        TEXT NOT NULL CHECK (tipo IN ('carinho', 'brincar', 'alimentar')),
  afeto       SMALLINT NOT NULL,              -- quanto afeto este cuidado deu de verdade (0 no máximo)
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX cuidados_pokemon_idx ON cuidados (pokemon_id, tipo, criado_em DESC);

-- ---------------------------------------------------------------------------
-- Vitrine (perfil público do treinador)
-- ---------------------------------------------------------------------------

-- Criada na primeira vez que o treinador edita a vitrine; sem linha, a vitrine usa os padrões.
-- Os Pokémon em destaque ficam em pokemons.posicao_vitrine.
CREATE TABLE vitrines (
  usuario_id     BIGINT PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  bio            TEXT NOT NULL DEFAULT '' CHECK (length(bio) <= 160),
  -- 'palco' destaca os Pokémon escolhidos; 'album' destaca a coleção de espécies
  estilo         TEXT NOT NULL DEFAULT 'palco' CHECK (estilo IN ('palco', 'album')),
  visitas        INTEGER NOT NULL DEFAULT 0,  -- visitas de outros treinadores
  atualizada_em  TIMESTAMPTZ NOT NULL DEFAULT now()
);

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

-- ---------------------------------------------------------------------------
-- Trocas entre jogadores
-- ---------------------------------------------------------------------------

-- Pokémon anunciado no mercado: à venda por Pokécoins (preco), aberto a propostas, ou os dois.
-- Pokémon do time de batalha não podem ser anunciados.
CREATE TABLE anuncios (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  pokemon_id        BIGINT NOT NULL REFERENCES pokemons(id),
  vendedor_id       BIGINT NOT NULL REFERENCES usuarios(id),
  preco             INTEGER CHECK (preco > 0),       -- NULL = não vende direto, só aceita propostas
  aceita_propostas  BOOLEAN NOT NULL DEFAULT false,
  status            TEXT NOT NULL DEFAULT 'ativo'
                    CHECK (status IN ('ativo', 'vendido', 'trocado', 'cancelado')),
  comprador_id      BIGINT REFERENCES usuarios(id),  -- quem ficou com o Pokémon (vendido/trocado)
  criado_em         TIMESTAMPTZ NOT NULL DEFAULT now(),
  finalizado_em     TIMESTAMPTZ,
  CHECK (preco IS NOT NULL OR aceita_propostas)
);
-- Um Pokémon só pode ter um anúncio ativo por vez
CREATE UNIQUE INDEX anuncios_pokemon_ativo_idx ON anuncios (pokemon_id) WHERE status = 'ativo';
CREATE INDEX anuncios_vendedor_idx ON anuncios (vendedor_id) WHERE status = 'ativo';

-- Proposta de troca num anúncio: Pokémon e/ou Pokécoins oferecidos pelo proponente.
-- Nada fica reservado: na hora de aceitar, tudo é conferido de novo.
CREATE TABLE propostas (
  id             BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  anuncio_id     BIGINT NOT NULL REFERENCES anuncios(id),
  proponente_id  BIGINT NOT NULL REFERENCES usuarios(id),
  pokecoins      INTEGER NOT NULL DEFAULT 0 CHECK (pokecoins >= 0),
  -- encerrada = o sistema fechou (o anúncio acabou ou um Pokémon oferecido mudou de dono)
  status         TEXT NOT NULL DEFAULT 'pendente'
                 CHECK (status IN ('pendente', 'aceita', 'recusada', 'cancelada', 'encerrada')),
  criada_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  respondida_em  TIMESTAMPTZ
);
CREATE INDEX propostas_anuncio_idx ON propostas (anuncio_id) WHERE status = 'pendente';
CREATE INDEX propostas_proponente_idx ON propostas (proponente_id, id DESC);

CREATE TABLE proposta_pokemons (
  proposta_id  BIGINT NOT NULL REFERENCES propostas(id) ON DELETE CASCADE,
  pokemon_id   BIGINT NOT NULL REFERENCES pokemons(id),
  PRIMARY KEY (proposta_id, pokemon_id)
);
CREATE INDEX proposta_pokemons_pokemon_idx ON proposta_pokemons (pokemon_id);

-- Extrato: toda entrada/saída de Pokécoins fica registrada (auditoria e limites anti-farm)
CREATE TABLE transacoes_pokecoins (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  usuario_id  BIGINT NOT NULL REFERENCES usuarios(id),
  valor       INTEGER NOT NULL,              -- positivo = ganho, negativo = gasto
  motivo      TEXT NOT NULL CHECK (motivo IN ('bonus_cadastro', 'compra_loja', 'recompensa_batalha', 'compra_mercado', 'venda_mercado', 'troca')),
  batalha_id  BIGINT REFERENCES batalhas(id), -- preenchido quando motivo = recompensa_batalha
  anuncio_id  BIGINT REFERENCES anuncios(id), -- preenchido nas compras e trocas do mercado
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX transacoes_usuario_idx ON transacoes_pokecoins (usuario_id, motivo, criado_em DESC);
