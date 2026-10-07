// Golpes especiais: cache local dos golpes da PokeAPI e a roleta que dá golpes a um Pokémon com afeto máximo.
// Como a Pokédex (especies.js), cada golpe e cada lista de golpes de uma espécie é buscada uma vez só,
// assim as batalhas não dependem da PokeAPI.
const { pool, transacao } = require('../db');
const config = require('./config');
const { buscarCard } = require('./pokemons');
const { afetoMaximo } = require('./regras');
const { ErroJogo } = require('./erros');
const { rngSeguro } = require('./aleatorio');

const POKEAPI_URL = 'https://pokeapi.co/api/v2';

async function buscarJson(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`PokeAPI respondeu ${resposta.status} para ${url}`);
  return resposta.json();
}

// ".../move/75/" -> 75
const extrairId = (url) => Number(url.split('/').filter(Boolean).pop());

/**
 * Ids de todos os golpes que a espécie aprende (por nível, TM, ovo, tutor...), guardados em especies.movimentos.
 * Chame fora de transação: pode ir à PokeAPI.
 */
async function garantirMovimentos(especieId) {
  const { rows } = await pool.query('SELECT movimentos FROM especies WHERE id = $1', [especieId]);
  if (rows[0]?.movimentos) return rows[0].movimentos;

  const pokemon = await buscarJson(`${POKEAPI_URL}/pokemon/${especieId}`);
  const movimentos = pokemon.moves.map((m) => extrairId(m.move.url));
  await pool.query('UPDATE especies SET movimentos = $2 WHERE id = $1', [especieId, movimentos]);
  return movimentos;
}

/**
 * Dados de um golpe, guardados na tabela golpes. Golpes sem dano (Light Screen, Growl...) também
 * ficam no cache, com poder null, para não serem buscados de novo.
 * Chame fora de transação: pode ir à PokeAPI.
 */
async function garantirGolpe(id) {
  const { rows } = await pool.query('SELECT * FROM golpes WHERE id = $1', [id]);
  if (rows[0]) return rows[0];

  const g = await buscarJson(`${POKEAPI_URL}/move/${id}`);
  const golpe = {
    id,
    nome: g.name,
    tipo: g.type.name,
    classe: g.damage_class.name,
    poder: g.power,
    precisao: g.accuracy,
    pp: g.pp ?? 1,
  };
  await pool.query(
    `INSERT INTO golpes (id, nome, tipo, classe, poder, precisao, pp)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (id) DO NOTHING`,
    [golpe.id, golpe.nome, golpe.tipo, golpe.classe, golpe.poder, golpe.precisao, golpe.pp],
  );
  return golpe;
}

/** Golpe que dá para usar em batalha: precisa causar dano */
const causaDano = (golpe) => golpe.classe !== 'status' && golpe.poder !== null && golpe.poder > 0;

/**
 * Sorteia GOLPES_POR_POKEMON golpes de dano diferentes da lista da espécie. A lista é embaralhada
 * e os golpes são buscados um por um até achar os de dano, então só os sorteados vão à PokeAPI.
 */
async function sortearGolpes(especieId, rng) {
  const lista = [...new Set(await garantirMovimentos(especieId))];
  // Fisher-Yates
  for (let i = lista.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [lista[i], lista[j]] = [lista[j], lista[i]];
  }
  const escolhidos = [];
  for (const id of lista) {
    if (escolhidos.length === config.GOLPES_POR_POKEMON) break;
    const golpe = await garantirGolpe(id);
    if (causaDano(golpe)) escolhidos.push(golpe.id);
  }
  return escolhidos;
}

async function conferirPokemon(clientOuPool, usuarioId, pokemonId, { travar = false } = {}) {
  const { rows } = await clientOuPool.query(
    `SELECT dono_id, especie_id, afeto, golpes FROM pokemons WHERE id = $1${travar ? ' FOR UPDATE' : ''}`,
    [pokemonId],
  );
  const pokemon = rows[0];
  if (!pokemon || pokemon.dono_id !== usuarioId) throw new ErroJogo('Pokémon não encontrado.');
  if (!afetoMaximo(pokemon.afeto)) {
    throw new ErroJogo('Os golpes especiais só são liberados com o afeto máximo (5 corações).');
  }
  return pokemon;
}

/**
 * Roleta de golpes: troca os golpes do Pokémon por GOLPES_POR_POKEMON golpes de dano sorteados entre
 * os que a espécie atual aprende. Só com afeto máximo; a primeira é grátis e as outras custam CUSTO_ROLETA_GOLPES.
 * @param {number} usuarioId
 * @param {number} pokemonId
 */
async function roletarGolpes(usuarioId, pokemonId, rng = rngSeguro) {
  const antes = await conferirPokemon(pool, usuarioId, pokemonId);
  const custo = antes.golpes.length > 0 ? config.CUSTO_ROLETA_GOLPES : 0;
  if (custo > 0) {
    const { rows } = await pool.query('SELECT pokecoins FROM usuarios WHERE id = $1', [usuarioId]);
    if (rows[0].pokecoins < custo) throw new ErroJogo(`Roletar de novo custa ${custo} Pokécoins.`);
  }

  // Fora da transação: pode precisar ir à PokeAPI
  const golpes = await sortearGolpes(antes.especie_id, rng);
  if (golpes.length === 0) throw new ErroJogo('Esse Pokémon não aprende nenhum golpe que cause dano.');

  return transacao(async (client) => {
    // Confere de novo com o card travado: pode ter evoluído, sido trocado ou roletado em outra aba
    const pokemon = await conferirPokemon(client, usuarioId, pokemonId, { travar: true });
    if (pokemon.especie_id !== antes.especie_id || pokemon.golpes.join() !== antes.golpes.join()) {
      throw new ErroJogo('Esse Pokémon mudou enquanto a roleta girava. Tente de novo.');
    }
    if (custo > 0) {
      const debito = await client.query(
        'UPDATE usuarios SET pokecoins = pokecoins - $2 WHERE id = $1 AND pokecoins >= $2 RETURNING id',
        [usuarioId, custo],
      );
      if (!debito.rows[0]) throw new ErroJogo(`Roletar de novo custa ${custo} Pokécoins.`);
      await client.query(
        "INSERT INTO transacoes_pokecoins (usuario_id, valor, motivo) VALUES ($1, $2, 'roleta_golpes')",
        [usuarioId, -custo],
      );
    }
    await client.query('UPDATE pokemons SET golpes = $2 WHERE id = $1', [pokemonId, golpes]);
    return { pokemon: await buscarCard(client, pokemonId), custo };
  });
}

module.exports = {
  garantirGolpe, garantirMovimentos, roletarGolpes, causaDano,
};
