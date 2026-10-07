// Cache local da Pokédex: cada espécie é buscada na PokeAPI uma única vez e salva na tabela especies
const { pool } = require('../db');
const config = require('./config');

const POKEAPI_URL = 'https://pokeapi.co/api/v2';

async function buscarJson(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) throw new Error(`PokeAPI respondeu ${resposta.status} para ${url}`);
  return resposta.json();
}

// ".../pokemon-species/25/" -> 25
function extrairId(url) {
  return Number(url.split('/').filter(Boolean).pop());
}

/**
 * Percorre a cadeia evolutiva a partir da raiz e anota, para cada espécie, as
 * próximas evoluções com o nível pedido. O min_level da PokeAPI é usado quando
 * existe; sem ele (pedra, troca, amizade) o nível é o de entrada + NIVEIS_EVOLUCAO_SEM_NIVEL.
 * @param {object} no           nó de /evolution-chain
 * @param {number} nivelEntrada nível em que essa espécie é alcançada (1 na raiz)
 * @param {Map<string, object[]>} mapa  nome da espécie -> evoluções
 */
function mapearCadeia(no, nivelEntrada, mapa) {
  const evolucoes = no.evolves_to.map((filho) => {
    const niveis = filho.evolution_details.map((d) => d.min_level).filter((n) => n != null);
    const nivel = Math.min(
      config.NIVEL_MAXIMO,
      niveis.length > 0 ? Math.min(...niveis) : nivelEntrada + config.NIVEIS_EVOLUCAO_SEM_NIVEL,
    );
    mapearCadeia(filho, nivel, mapa);
    return { especieId: extrairId(filho.species.url), nome: filho.species.name, nivel };
  });
  mapa.set(no.species.name, evolucoes);
  return mapa;
}

function raridadeDe(especie) {
  if (especie.is_mythical) return 'mitico';
  if (especie.is_legendary) return 'lendario';
  return 'comum';
}

/** Busca na PokeAPI tudo o que a tabela especies precisa */
async function buscarNaPokeApi(id) {
  const [pokemon, especie] = await Promise.all([
    buscarJson(`${POKEAPI_URL}/pokemon/${id}`),
    buscarJson(`${POKEAPI_URL}/pokemon-species/${id}`),
  ]);
  const cadeia = await buscarJson(especie.evolution_chain.url);
  const evolucoes = mapearCadeia(cadeia.chain, 1, new Map()).get(especie.name) ?? [];
  const stat = (nome) => pokemon.stats.find((s) => s.stat.name === nome).base_stat;

  return {
    id,
    nome: especie.name,
    tipos: pokemon.types.map((t) => t.type.name),
    raridade: raridadeDe(especie),
    taxa_captura: especie.capture_rate,
    hp_base: stat('hp'),
    ataque_base: stat('attack'),
    defesa_base: stat('defense'),
    velocidade_base: stat('speed'),
    altura_base: pokemon.height,
    peso_base: pokemon.weight,
    evolucoes,
  };
}

/**
 * Garante que a espécie está no banco e a devolve.
 * Chame ANTES de abrir uma transação: esperar a PokeAPI com uma transação
 * aberta seguraria locks de outros jogadores.
 * @param {number} id
 * @returns {Promise<import('./regras').Especie>}
 */
async function garantirEspecie(id) {
  const { rows } = await pool.query('SELECT * FROM especies WHERE id = $1', [id]);
  if (rows[0]) {
    if (rows[0].taxa_captura == null) rows[0].taxa_captura = await garantirTaxaCaptura(id);
    return rows[0];
  }

  const e = await buscarNaPokeApi(id);
  // ON CONFLICT: duas pessoas podem mintar a mesma espécie nova ao mesmo tempo
  await pool.query(
    `INSERT INTO especies (id, nome, tipos, raridade, taxa_captura, hp_base, ataque_base, defesa_base, velocidade_base,
                           altura_base, peso_base, evolucoes)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     ON CONFLICT (id) DO NOTHING`,
    [e.id, e.nome, e.tipos, e.raridade, e.taxa_captura, e.hp_base, e.ataque_base, e.defesa_base, e.velocidade_base,
      e.altura_base, e.peso_base, JSON.stringify(e.evolucoes)],
  );
  return e;
}

/**
 * capture_rate da espécie (especies.taxa_captura). Espécies salvas antes dessa coluna existir
 * ficam com NULL e são completadas aqui na primeira vez. Chame fora de transação: pode ir à PokeAPI.
 * @param {number} id
 */
async function garantirTaxaCaptura(id) {
  const { rows } = await pool.query('SELECT taxa_captura FROM especies WHERE id = $1', [id]);
  if (rows[0]?.taxa_captura != null) return rows[0].taxa_captura;

  const especie = await buscarJson(`${POKEAPI_URL}/pokemon-species/${id}`);
  await pool.query('UPDATE especies SET taxa_captura = $2 WHERE id = $1', [id, especie.capture_rate]);
  return especie.capture_rate;
}

module.exports = { garantirEspecie, garantirTaxaCaptura, mapearCadeia };
