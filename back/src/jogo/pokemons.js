// Cards no banco: mint, coleção, XP pós-batalha, evolução e cuidados (afeto)
const { pool, transacao } = require('../db');
const {
  sortearAtributos, aplicarXp, evolucoesDisponiveis, descreverPokemon, aplicarCuidado, bemEstarAtual,
  sortearBonusEvolucao,
} = require('./regras');
const { garantirEspecie } = require('./especies');
const { ErroJogo } = require('./erros');
const { rngSeguro } = require('./aleatorio');

// Golpes especiais de um card (p), como JSON, na ordem do array pokemons.golpes
const SELECT_GOLPES = `(SELECT coalesce(jsonb_agg(to_jsonb(g) ORDER BY array_position(p.golpes, g.id)), '[]'::jsonb)
     FROM golpes g WHERE g.id = ANY(p.golpes))`;

// Os campos de especies vêm depois de p.* e sobrescreveriam o "id" do card, então listamos só os necessários.
// ultimos_cuidados: { "carinho": <data do último>, ... }, para o front saber quando cada cuidado volta.
// golpes_detalhe: os golpes especiais do card, na ordem em que foram sorteados.
const CAMPOS_CARD = `p.*, e.nome, e.tipos, e.raridade, e.hp_base, e.ataque_base, e.defesa_base,
  e.velocidade_base, e.altura_base, e.peso_base, e.evolucoes,
  (SELECT jsonb_object_agg(c.tipo, c.ultimo)
     FROM (SELECT tipo, max(criado_em) AS ultimo FROM cuidados WHERE pokemon_id = p.id GROUP BY tipo) c
  ) AS ultimos_cuidados,
  EXISTS (SELECT 1 FROM anuncios WHERE pokemon_id = p.id AND status = 'ativo') AS anunciado,
  ${SELECT_GOLPES} AS golpes_detalhe`;

/**
 * Cria um card único. A espécie já precisa estar no cache (garantirEspecie).
 * O mint_numero vem da sequence global no DEFAULT da coluna.
 * A captura da história manda os atributos e o nível do Pokémon selvagem; os outros sorteiam na hora.
 * @param {import('pg').PoolClient} client  transação aberta por quem chamou
 * @param {{ donoId: number, especieId: number, origem: 'inicial' | 'loja' | 'captura', posicaoTime?: number | null,
 *   atributos?: import('./regras').AtributosSorteados, nivel?: number, rng?: import('./aleatorio').Rng }} dados
 * @returns {Promise<number>} id do card
 */
async function mintarPokemon(client, {
  donoId, especieId, origem, posicaoTime = null, atributos, nivel = 1, rng = rngSeguro,
}) {
  const a = atributos ?? sortearAtributos(rng);
  const { rows } = await client.query(
    `INSERT INTO pokemons (dono_id, especie_id, especie_original_id, origem, shiny,
                           iv_hp, iv_ataque, iv_defesa, iv_velocidade, mult_altura, mult_peso, posicao_time, nivel)
     VALUES ($1, $2, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     RETURNING id`,
    [donoId, especieId, origem, a.shiny, a.iv_hp, a.iv_ataque, a.iv_defesa, a.iv_velocidade,
      a.mult_altura, a.mult_peso, posicaoTime, nivel],
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
 * os status mudam porque calcularStatus usa a base da nova espécie. Cada status ainda pode
 * ganhar pontos extras sorteados (BONUS_EVOLUCAO), que ficam no card.
 * @param {number} usuarioId
 * @param {number} pokemonId
 * @param {number} especieDestinoId  necessário porque algumas espécies têm várias evoluções (Eevee)
 */
async function evoluir(usuarioId, pokemonId, especieDestinoId, rng = rngSeguro) {
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

    const bonus = sortearBonusEvolucao(rng);
    await client.query(
      `UPDATE pokemons
          SET especie_id = $2, bonus_hp = bonus_hp + $3, bonus_ataque = bonus_ataque + $4,
              bonus_defesa = bonus_defesa + $5, bonus_velocidade = bonus_velocidade + $6
        WHERE id = $1`,
      [pokemonId, destino.id, bonus.hp, bonus.ataque, bonus.defesa, bonus.velocidade],
    );
    // O card e, à parte, o que esta evolução sorteou (o front mostra "+3 PS, +5 Velocidade")
    return { ...(await buscarCard(client, pokemonId)), bonusGanho: bonus };
  });
}

/**
 * Carinho, brincar ou alimentar. Cada tipo tem a própria espera (config.CUIDADOS);
 * a linha do card fica travada para dois cliques não passarem juntos pela espera.
 * @param {number} usuarioId
 * @param {number} pokemonId
 * @param {'carinho' | 'brincar' | 'alimentar'} tipo
 */
async function cuidar(usuarioId, pokemonId, tipo) {
  return transacao(async (client) => {
    const { rows } = await client.query(
      'SELECT dono_id, afeto, humor, energia, bem_estar_em FROM pokemons WHERE id = $1 FOR UPDATE',
      [pokemonId],
    );
    const pokemon = rows[0];
    if (!pokemon || pokemon.dono_id !== usuarioId) throw new ErroJogo('Pokémon não encontrado.');

    const { rows: [ultimo] } = await client.query(
      'SELECT max(criado_em) AS em FROM cuidados WHERE pokemon_id = $1 AND tipo = $2',
      [pokemonId, tipo],
    );
    const agora = new Date();
    const novo = aplicarCuidado({ afeto: pokemon.afeto, ...bemEstarAtual(pokemon, agora) }, tipo, ultimo.em, agora);

    // Grava humor e energia já com o desgaste até agora e reinicia a contagem
    await client.query(
      'UPDATE pokemons SET afeto = $2, humor = $3, energia = $4, bem_estar_em = $5 WHERE id = $1',
      [pokemonId, novo.afeto, novo.humor, novo.energia, agora],
    );
    await client.query('INSERT INTO cuidados (pokemon_id, tipo, afeto) VALUES ($1, $2, $3)', [pokemonId, tipo, novo.ganho]);
    return { pokemon: await buscarCard(client, pokemonId), ganho: novo.ganho };
  });
}

/** Últimos cuidados do card (o "hoje" do cantinho de cuidado) */
async function listarCuidados(usuarioId, pokemonId) {
  const { rows } = await pool.query(
    `SELECT c.tipo, c.afeto, c.criado_em AS "criadoEm"
       FROM cuidados c JOIN pokemons p ON p.id = c.pokemon_id
      WHERE c.pokemon_id = $1 AND p.dono_id = $2
      ORDER BY c.id DESC
      LIMIT 10`,
    [pokemonId, usuarioId],
  );
  return rows;
}

module.exports = {
  CAMPOS_CARD,
  SELECT_GOLPES,
  mintarPokemon, buscarCard, listarColecao, darXp, evoluir, cuidar, listarCuidados,
};
