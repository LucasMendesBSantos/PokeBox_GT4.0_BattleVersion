// Vitrine: o perfil público de cada treinador, com os Pokémon em destaque e o álbum de espécies
const { pool, transacao } = require('../db');
const config = require('./config');
const { coracoes } = require('./regras');
const { ErroJogo } = require('./erros');

const ESTILOS = ['palco', 'album'];

/** Só o que outro treinador pode ver de um card (sem IVs, que entregariam os status de batalha) */
function descreverDestaque(linha) {
  return {
    id: linha.id,
    mintNumero: linha.mint_numero,
    especieId: linha.especie_id,
    nome: linha.nome,
    tipos: linha.tipos,
    raridade: linha.raridade,
    shiny: linha.shiny,
    nivel: linha.nivel,
    coracoes: coracoes(linha.afeto),
  };
}

/**
 * Pokémon em destaque, na ordem escolhida. Quem ainda não escolheu destaques
 * mostra o time de batalha, para a vitrine nunca começar vazia.
 */
async function buscarDestaques(clientOuPool, donoId) {
  const { rows } = await clientOuPool.query(
    `SELECT p.id, p.mint_numero, p.especie_id, p.shiny, p.nivel, p.afeto, e.nome, e.tipos, e.raridade
       FROM pokemons p JOIN especies e ON e.id = p.especie_id
      WHERE p.dono_id = $1
        AND (p.posicao_vitrine IS NOT NULL
             OR (p.posicao_time IS NOT NULL
                 AND NOT EXISTS (SELECT 1 FROM pokemons WHERE dono_id = $1 AND posicao_vitrine IS NOT NULL)))
      ORDER BY coalesce(p.posicao_vitrine, p.posicao_time)`,
    [donoId],
  );
  return rows.map(descreverDestaque);
}

/**
 * Vitrine de um treinador. A visita de outro treinador soma no contador.
 * @param {number} visitanteId
 * @param {string} login  dono da vitrine
 */
async function obterVitrine(visitanteId, login) {
  const { rows: [dono] } = await pool.query(
    'SELECT id, login, criado_em FROM usuarios WHERE lower(login) = lower($1)',
    [login],
  );
  if (!dono) throw new ErroJogo('Treinador não encontrado.');
  const souDono = dono.id === visitanteId;

  // Sem linha em vitrines, a vitrine usa os padrões; a primeira visita já cria a linha
  const { rows: [vitrine = { bio: '', estilo: 'palco', visitas: 0 }] } = souDono
    ? await pool.query('SELECT bio, estilo, visitas FROM vitrines WHERE usuario_id = $1', [dono.id])
    : await pool.query(
      `INSERT INTO vitrines (usuario_id, visitas) VALUES ($1, 1)
       ON CONFLICT (usuario_id) DO UPDATE SET visitas = vitrines.visitas + 1
       RETURNING bio, estilo, visitas`,
      [dono.id],
    );

  const [{ rows: [numeros] }, { rows: especies }, { rows: [{ vitorias }] }, destaques] = await Promise.all([
    pool.query(
      `SELECT count(*) AS pokemons,
              count(DISTINCT especie_id) AS especies,
              count(*) FILTER (WHERE shiny) AS shinies,
              avg(afeto) FILTER (WHERE posicao_time IS NOT NULL) AS afeto_time
         FROM pokemons WHERE dono_id = $1`,
      [dono.id],
    ),
    pool.query(
      `SELECT especie_id AS id, bool_or(shiny) AS shiny
         FROM pokemons WHERE dono_id = $1
        GROUP BY especie_id ORDER BY especie_id`,
      [dono.id],
    ),
    pool.query('SELECT count(*) AS vitorias FROM batalhas WHERE vencedor_id = $1', [dono.id]),
    buscarDestaques(pool, dono.id),
  ]);

  return {
    treinador: { login: dono.login, desde: dono.criado_em },
    souDono,
    bio: vitrine.bio,
    estilo: vitrine.estilo,
    visitas: vitrine.visitas,
    estatisticas: {
      pokemons: numeros.pokemons,
      especies: numeros.especies,
      shinies: numeros.shinies,
      vitorias,
      // Média de corações do time, com uma casa (4,2 ♥)
      afetoTime: numeros.afeto_time === null
        ? 0
        : Math.round((numeros.afeto_time / config.AFETO_POR_CORACAO) * 10) / 10,
    },
    destaques,
    // Espécies que o treinador tem hoje, para o álbum
    colecao: especies,
  };
}

/**
 * Salva bio, estilo e os Pokémon em destaque (na ordem recebida).
 * @param {number} usuarioId
 * @param {{ bio: string, estilo: string, pokemonIds: number[] }} dados
 */
async function salvarVitrine(usuarioId, { bio, estilo, pokemonIds }) {
  if (bio.length > config.BIO_VITRINE_MAXIMO) {
    throw new ErroJogo(`A apresentação pode ter no máximo ${config.BIO_VITRINE_MAXIMO} caracteres.`);
  }
  if (!ESTILOS.includes(estilo)) throw new ErroJogo('Estilo de vitrine inválido.');
  if (pokemonIds.length > config.DESTAQUES_VITRINE || new Set(pokemonIds).size !== pokemonIds.length) {
    throw new ErroJogo(`Escolha até ${config.DESTAQUES_VITRINE} Pokémon diferentes para a vitrine.`);
  }

  await transacao(async (client) => {
    // Trava o usuário, como definirTime, para dois salvamentos não se misturarem
    await client.query('SELECT 1 FROM usuarios WHERE id = $1 FOR UPDATE', [usuarioId]);
    const { rowCount } = await client.query(
      'SELECT 1 FROM pokemons WHERE id = ANY($1) AND dono_id = $2',
      [pokemonIds, usuarioId],
    );
    if (rowCount !== pokemonIds.length) throw new ErroJogo('Algum desses Pokémon não é seu.');

    await client.query(
      `INSERT INTO vitrines (usuario_id, bio, estilo) VALUES ($1, $2, $3)
       ON CONFLICT (usuario_id) DO UPDATE SET bio = $2, estilo = $3, atualizada_em = now()`,
      [usuarioId, bio, estilo],
    );
    // Limpa antes de gravar para não esbarrar no UNIQUE (dono_id, posicao_vitrine)
    await client.query('UPDATE pokemons SET posicao_vitrine = NULL WHERE dono_id = $1', [usuarioId]);
    for (const [i, id] of pokemonIds.entries()) {
      await client.query('UPDATE pokemons SET posicao_vitrine = $2 WHERE id = $1', [id, i + 1]);
    }
  });
}

/**
 * Vitrines de outros treinadores para visitar: as mais visitadas primeiro.
 * Cada uma traz até 3 destaques como prévia.
 * @param {number} usuarioId  fica fora da lista
 * @param {string} busca      começo do login (vazio = todos)
 */
async function listarVitrines(usuarioId, busca) {
  const { rows } = await pool.query(
    `SELECT u.login,
            coalesce(v.visitas, 0) AS visitas,
            v.bio,
            (SELECT count(DISTINCT especie_id) FROM pokemons WHERE dono_id = u.id) AS especies,
            (SELECT json_agg(json_build_object('especieId', d.especie_id, 'shiny', d.shiny))
               FROM (SELECT especie_id, shiny FROM pokemons
                      WHERE dono_id = u.id AND (posicao_vitrine IS NOT NULL OR posicao_time IS NOT NULL)
                      ORDER BY posicao_vitrine NULLS LAST, posicao_time
                      LIMIT 3) d) AS previa
       FROM usuarios u
       LEFT JOIN vitrines v ON v.usuario_id = u.id
      WHERE u.id <> $1
        AND u.login ILIKE $2
        AND EXISTS (SELECT 1 FROM pokemons WHERE dono_id = u.id)
      ORDER BY coalesce(v.visitas, 0) DESC, u.ultimo_acesso_em DESC
      LIMIT 30`,
    // Escapa % e _ para a busca ser literal
    [usuarioId, `${busca.replace(/[\\%_]/g, '\\$&')}%`],
  );
  return rows.map((linha) => ({ ...linha, bio: linha.bio ?? '', previa: linha.previa ?? [] }));
}

module.exports = { obterVitrine, salvarVitrine, listarVitrines };
