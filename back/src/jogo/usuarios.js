// Contas (cadastro, login, senha), escolha do inicial, loja e montagem do time
const crypto = require('node:crypto');
const { promisify } = require('node:util');
const { pool, transacao } = require('../db');
const config = require('./config');
const { garantirEspecie } = require('./especies');
const { mintarPokemon, buscarCard } = require('./pokemons');
const { ErroJogo } = require('./erros');
const { rngSeguro, inteiroEntre } = require('./aleatorio');

const scrypt = promisify(crypto.scrypt);
const SESSAO_DURACAO_MS = 30 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Senha e sessão
// ---------------------------------------------------------------------------

// "sal:hash" em hex. scrypt já vem no Node, sem precisar de bcrypt.
async function gerarHashSenha(senha) {
  const sal = crypto.randomBytes(16).toString('hex');
  const hash = await scrypt(senha, sal, 64);
  return `${sal}:${hash.toString('hex')}`;
}

async function conferirSenha(senha, salvo) {
  const [sal, hashHex] = salvo.split(':');
  const hash = await scrypt(senha, sal, 64);
  return crypto.timingSafeEqual(hash, Buffer.from(hashHex, 'hex'));
}

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/** Cria uma sessão e devolve o token (só o hash vai para o banco) */
async function criarSessao(usuarioId) {
  const token = crypto.randomBytes(32).toString('hex');
  await pool.query(
    'INSERT INTO sessoes (token_hash, usuario_id, expira_em) VALUES ($1, $2, $3)',
    [hashToken(token), usuarioId, new Date(Date.now() + SESSAO_DURACAO_MS)],
  );
  return token;
}

/** Usuário dono do token, ou null se o token não existe ou expirou */
async function usuarioDaSessao(token) {
  const { rows } = await pool.query(
    `SELECT u.id, u.login, u.pokecoins
       FROM sessoes s JOIN usuarios u ON u.id = s.usuario_id
      WHERE s.token_hash = $1 AND s.expira_em > now()`,
    [hashToken(token)],
  );
  return rows[0] ?? null;
}

async function encerrarSessao(token) {
  await pool.query('DELETE FROM sessoes WHERE token_hash = $1', [hashToken(token)]);
}

// ---------------------------------------------------------------------------
// Conta
// ---------------------------------------------------------------------------

/**
 * Cria a conta com o bônus de Pokécoins. O inicial é escolhido depois, na tela
 * "Meus Pokémon" (escolherInicial), como o front já faz hoje.
 * @param {{ login: string, celular: string, senha: string }} dados
 */
async function cadastrarUsuario({ login, celular, senha }) {
  const senhaHash = await gerarHashSenha(senha);

  const usuario = await transacao(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO usuarios (login, celular, senha_hash, pokecoins)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT DO NOTHING
       RETURNING id, login, pokecoins`,
      [login, celular, senhaHash, config.POKECOINS_CADASTRO],
    );
    if (!rows[0]) throw new ErroJogo('Esse login já está em uso.');

    await client.query(
      "INSERT INTO transacoes_pokecoins (usuario_id, valor, motivo) VALUES ($1, $2, 'bonus_cadastro')",
      [rows[0].id, config.POKECOINS_CADASTRO],
    );
    return rows[0];
  });
  return { usuario, token: await criarSessao(usuario.id) };
}

/** Devolve { usuario, token } ou lança erro com mensagem genérica (não revela se o login existe) */
async function entrar(login, senha) {
  const { rows } = await pool.query(
    'SELECT id, login, pokecoins, senha_hash FROM usuarios WHERE lower(login) = lower($1)',
    [login],
  );
  const encontrado = rows[0];
  if (!encontrado || !(await conferirSenha(senha, encontrado.senha_hash))) {
    throw new ErroJogo('Usuário ou senha incorretos.');
  }
  const { senha_hash: _, ...usuario } = encontrado;
  return { usuario, token: await criarSessao(usuario.id) };
}

async function existeUsuario(login, celular) {
  const { rowCount } = await pool.query(
    'SELECT 1 FROM usuarios WHERE lower(login) = lower($1) AND celular = $2',
    [login, celular],
  );
  return rowCount > 0;
}

/** Troca a senha e derruba todas as sessões abertas daquele usuário */
async function redefinirSenha({ login, celular, senha }) {
  const senhaHash = await gerarHashSenha(senha);
  return transacao(async (client) => {
    const { rows } = await client.query(
      `UPDATE usuarios SET senha_hash = $3
        WHERE lower(login) = lower($1) AND celular = $2
        RETURNING id`,
      [login, celular, senhaHash],
    );
    if (!rows[0]) throw new ErroJogo('Não encontramos um treinador com esse usuário e celular.');
    await client.query('DELETE FROM sessoes WHERE usuario_id = $1', [rows[0].id]);
  });
}

async function buscarTreinadores(usuarioId, busca) {
  const { rows } = await pool.query(
    `SELECT login FROM usuarios
      WHERE id <> $1 AND login ILIKE $2
      ORDER BY lower(login)
      LIMIT 10`,
    // Escapa % e _ para a busca ser literal
    [usuarioId, `${busca.replace(/[\\%_]/g, '\\$&')}%`],
  );
  return rows.map((r) => r.login);
}

// ---------------------------------------------------------------------------
// Pokémon inicial, loja e time
// ---------------------------------------------------------------------------

/** O inicial só pode ser escolhido uma vez, por quem ainda não tem nenhum Pokémon */
async function escolherInicial(usuarioId, especieId) {
  if (!config.INICIAIS.includes(especieId)) throw new ErroJogo('Pokémon inicial inválido.');
  await garantirEspecie(especieId);

  return transacao(async (client) => {
    // Trava o usuário para dois cliques não criarem dois iniciais
    await client.query('SELECT 1 FROM usuarios WHERE id = $1 FOR UPDATE', [usuarioId]);
    const { rowCount } = await client.query('SELECT 1 FROM pokemons WHERE dono_id = $1 LIMIT 1', [usuarioId]);
    if (rowCount > 0) throw new ErroJogo('Você já escolheu seu Pokémon inicial.');

    const id = await mintarPokemon(client, {
      donoId: usuarioId, especieId, origem: 'inicial', posicaoTime: 1,
    });
    return buscarCard(client, id);
  });
}

/**
 * Sorteia a espécie da loja. Cada sorteio é aceito com a chance da raridade
 * (PESO_RARIDADE): quase sempre um comum sai de primeira, lendários e míticos
 * costumam ser recusados e sorteados de novo.
 */
async function sortearEspecieDaLoja(rng) {
  for (let tentativa = 0; tentativa < 100; tentativa += 1) {
    const especie = await garantirEspecie(inteiroEntre(rng, 1, config.ULTIMA_ESPECIE));
    if (rng() < config.PESO_RARIDADE[especie.raridade]) return especie;
  }
  throw new Error('A loja não conseguiu sortear um Pokémon.');
}

/**
 * Compra um Pokémon aleatório. Se ainda houver vaga no time, ele já entra.
 * @param {number} usuarioId
 */
async function comprarPokemonAleatorio(usuarioId, rng = rngSeguro) {
  // Confere o saldo antes de gastar tempo com a PokeAPI (o débito de verdade é conferido de novo abaixo)
  const { rows } = await pool.query('SELECT pokecoins FROM usuarios WHERE id = $1', [usuarioId]);
  if (!rows[0] || rows[0].pokecoins < config.PRECO_POKEMON_LOJA) throw new ErroJogo('Pokécoins insuficientes.');

  // Sorteia e busca a espécie antes da transação (a PokeAPI pode demorar)
  const especie = await sortearEspecieDaLoja(rng);

  return transacao(async (client) => {
    // Débito condicional: se o saldo não cobre, nenhuma linha é alterada.
    // Isso é atômico, então dois cliques rápidos não compram dois com saldo de um.
    const debito = await client.query(
      `UPDATE usuarios SET pokecoins = pokecoins - $2
        WHERE id = $1 AND pokecoins >= $2
        RETURNING pokecoins`,
      [usuarioId, config.PRECO_POKEMON_LOJA],
    );
    if (!debito.rows[0]) throw new ErroJogo('Pokécoins insuficientes.');

    await client.query(
      "INSERT INTO transacoes_pokecoins (usuario_id, valor, motivo) VALUES ($1, $2, 'compra_loja')",
      [usuarioId, -config.PRECO_POKEMON_LOJA],
    );

    // Primeira posição livre do time (1 a 5), ou null se o time está cheio
    const vaga = await client.query(
      `SELECT MIN(pos) AS posicao
         FROM generate_series(1, $2::int) AS pos
        WHERE pos NOT IN (SELECT posicao_time FROM pokemons WHERE dono_id = $1 AND posicao_time IS NOT NULL)`,
      [usuarioId, config.TAMANHO_TIME],
    );

    const id = await mintarPokemon(client, {
      donoId: usuarioId, especieId: especie.id, origem: 'loja', posicaoTime: vaga.rows[0].posicao, rng,
    });
    return { pokemon: await buscarCard(client, id), saldo: debito.rows[0].pokecoins };
  });
}

/**
 * Define o time de batalha na ordem recebida (o primeiro abre a batalha).
 * @param {number} usuarioId
 * @param {number[]} pokemonIds  exatamente TAMANHO_TIME ids diferentes
 */
async function definirTime(usuarioId, pokemonIds) {
  if (pokemonIds.length !== config.TAMANHO_TIME || new Set(pokemonIds).size !== pokemonIds.length) {
    throw new ErroJogo(`O time precisa de ${config.TAMANHO_TIME} Pokémon diferentes.`);
  }

  return transacao(async (client) => {
    // Trava o usuário, como a compra (no débito) e o inicial fazem: assim uma compra
    // simultânea não ocupa uma posição do time no meio da troca
    await client.query('SELECT 1 FROM usuarios WHERE id = $1 FOR UPDATE', [usuarioId]);
    const { rowCount } = await client.query(
      'SELECT 1 FROM pokemons WHERE id = ANY($1) AND dono_id = $2',
      [pokemonIds, usuarioId],
    );
    if (rowCount !== pokemonIds.length) throw new ErroJogo('Algum desses Pokémon não é seu.');

    // Limpa antes de gravar para não esbarrar no UNIQUE (dono_id, posicao_time)
    await client.query('UPDATE pokemons SET posicao_time = NULL WHERE dono_id = $1', [usuarioId]);
    for (const [i, id] of pokemonIds.entries()) {
      await client.query('UPDATE pokemons SET posicao_time = $2 WHERE id = $1', [id, i + 1]);
    }
  });
}

module.exports = {
  cadastrarUsuario,
  entrar,
  existeUsuario,
  redefinirSenha,
  buscarTreinadores,
  usuarioDaSessao,
  encerrarSessao,
  escolherInicial,
  comprarPokemonAleatorio,
  definirTime,
};
