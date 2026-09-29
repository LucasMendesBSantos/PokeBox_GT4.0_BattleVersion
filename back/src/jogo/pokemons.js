// Cards no banco: mint, coleção, XP pós-batalha e evolução
const { pool, transacao } = require('../db');
const {
  sortearAtributos, aplicarXp, evolucoesDisponiveis, descreverPokemon,
} = require('./regras');
const { garantirEspecie } = require('./especies');
const { ErroJogo } = require('./erros');
const { rngSeguro } = require('./aleatorio');

// Os campos de especies vêm depois de p.* e sobrescreveriam o "id" do card, então listamos só os necessários
const CAMPOS_CARD = `p.*, e.nome, e.tipos, e.raridade, e.hp_base, e.ataque_base, e.defesa_base,
  e.velocidade_base, e.altura_base, e.peso_base, e.evolucoes`;

/**
 * Cria um card único. A espécie já precisa estar no cache (garantirEspecie).
 * O mint_numero vem da sequence global no DEFAULT da coluna.
 * @param {import('pg').PoolClient} client  transação aberta por quem chamou
 * @param {{ donoId: number, especieId: number, origem: 'inicial' | 'loja', posicaoTime?: number | null, rng?: import('./aleatorio').Rng }} dados
 * @returns {Promise<number>} id do card
 */
async function mintarPokemon(client, { donoId, especieId, origem, posicaoTime = null, rng = rngSeguro }) {
  const a = sortearAtributos(rng);
  const { rows } = await client.query(
    `INSERT INTO pokemons (dono_id, especie_id, especie_original_id, origem, shiny,
                           iv_hp, iv_ataque, iv_defesa, iv_velocidade, mult_altura, mult_peso, posicao_time)
     VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
     RETURNING id`,
    [donoId, especieId, origem, a.shiny, a.iv_hp, a.iv_ataque, a.iv_defesa, a.iv_velocidade,
      a.mult_altura, a.mult_peso, posicaoTime],
  );
  return rows[0].id;
}

/** Um card já no formato do front */
async function buscarCard(clientOuPool, pokemonId) {
  const { rows } = await clientOuPool.query(
    `SELECT ${CAMPOS_CARD} FROM pokemons p JOIN especies e ON e.id = p.especie_id WHERE p.id = $1`,
    [pokemonId],
  );
  return rows[0] ? descreverPokemon(rows[0]) : null;
}

/** Coleção do usuário: primeiro o time (na ordem), depois o resto do mais novo para o mais antigo */
async function listarColecao(usuarioId) {
  const { rows } = await pool.query(
    `SELECT ${CAMPOS_CARD}
       FROM pokemons p JOIN especies e ON e.id = p.especie_id
      WHERE p.dono_id = $1
      ORDER BY p.posicao_time NULLS LAST, p.id DESC`,
    [usuarioId],
  );
  return rows.map(descreverPokemon);
}

/**
 * Dá XP a cada Pokémon e sobe os níveis. Devolve quem subiu, para o front avisar
 * ("Pikachu #0042 subiu para o nível 12!" / "pode evoluir!").
 * @param {import('pg').PoolClient} client
 * @param {number} donoId    só dá XP a cards que ainda são dele
 * @param {number[]} pokemonIds
 * @param {number} xpGanho
 */
async function darXp(client, donoId, pokemonIds, xpGanho) {
  if (xpGanho <= 0) return [];
  const { rows } = await client.query(
    `SELECT p.id, p.mint_numero, p.nivel, p.xp, e.nome, e.evolucoes
       FROM pokemons p JOIN especies e ON e.id = p.especie_id
      WHERE p.id = ANY($1) AND p.dono_id = $2
        FOR UPDATE OF p`,
    [pokemonIds, donoId],
  );

  const subiram = [];
  for (const pokemon of rows) {
    const novo = aplicarXp(pokemon, xpGanho);
    await client.query('UPDATE pokemons SET nivel = $2, xp = $3 WHERE id = $1', [pokemon.id, novo.nivel, novo.xp]);
    if (novo.niveisGanhos > 0) {
      subiram.push({
        pokemonId: pokemon.id,
        mintNumero: pokemon.mint_numero,
        nome: pokemon.nome,
        nivel: novo.nivel,
        podeEvoluir: evolucoesDisponiveis(pokemon, novo).length > 0,
      });
    }
  }
  return subiram;
}

/**
 * Troca a espécie do card. Mint, shiny, IVs, multiplicadores e nível ficam iguais;
 * os status mudam porque calcularStatus usa a base da nova espécie.
 * @param {number} usuarioId
 * @param {number} pokemonId
 * @param {number} especieDestinoId  necessário porque algumas espécies têm várias evoluções (Eevee)
 */
async function evoluir(usuarioId, pokemonId, especieDestinoId) {
  // Fora da transação: pode precisar ir à PokeAPI
  const destino = await garantirEspecie(especieDestinoId);

  return transacao(async (client) => {
    const { rows } = await client.query(
      `SELECT p.dono_id, p.nivel, e.evolucoes
         FROM pokemons p JOIN especies e ON e.id = p.especie_id
        WHERE p.id = $1
          FOR UPDATE OF p`,
      [pokemonId],
    );
    const pokemon = rows[0];
    if (!pokemon || pokemon.dono_id !== usuarioId) throw new ErroJogo('Pokémon não encontrado.');

    const evolucao = pokemon.evolucoes.find((e) => e.especieId === destino.id);
    if (!evolucao) throw new ErroJogo('Este Pokémon não evolui para essa espécie.');
    if (!evolucoesDisponiveis(pokemon, pokemon).includes(evolucao)) {
      throw new ErroJogo(`Só é possível evoluir no nível ${evolucao.nivel}.`);
    }

    await client.query('UPDATE pokemons SET especie_id = $2 WHERE id = $1', [pokemonId, destino.id]);
    return buscarCard(client, pokemonId);
  });
}

module.exports = {
  mintarPokemon, buscarCard, listarColecao, darXp, evoluir,
};
