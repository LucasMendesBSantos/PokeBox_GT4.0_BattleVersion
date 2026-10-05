// Mercado de trocas: anúncios (venda por Pokécoins e/ou propostas), compra direta e propostas de troca.
//
// Nada fica reservado enquanto um anúncio ou proposta está aberto: na hora de comprar ou aceitar,
// tudo é travado e conferido de novo (dono, fora do time, saldo). Os usuários são sempre travados
// primeiro e em ordem de id, depois o anúncio, para duas operações cruzadas não se travarem.
const { pool, transacao } = require('../db');
const config = require('./config');
const { descreverPokemon } = require('./regras');
const { CAMPOS_CARD, buscarCard } = require('./pokemons');
const { ErroJogo } = require('./erros');

const ORDENS_MERCADO = {
  popularidade: 'anuncios DESC, e.nome',
  preco: '"menorPreco" ASC NULLS LAST, e.nome',
  nome: 'e.nome',
};

const ORDENS_ANUNCIOS = {
  preco: 'a.preco ASC NULLS LAST, a.id',
  nivel: 'p.nivel DESC, a.id',
  ivs: '(p.iv_hp + p.iv_ataque + p.iv_defesa + p.iv_velocidade) DESC, a.id',
  recentes: 'a.id DESC',
};

const escaparBusca = (busca) => busca.replace(/[\\%_]/g, '\\$&');

/**
 * O que qualquer treinador vê de um card anunciado. O afeto fica de fora (ele zera na troca),
 * então os status também são mostrados sem o bônus do afeto.
 */
function cardPublico(linha) {
  const card = descreverPokemon({ ...linha, afeto: 0 });
  return {
    id: card.id,
    mintNumero: card.mintNumero,
    especieId: card.especieId,
    nome: card.nome,
    tipos: card.tipos,
    raridade: card.raridade,
    shiny: card.shiny,
    nivel: card.nivel,
    ivs: card.ivs,
    ivTotal: Object.values(card.ivs).reduce((soma, iv) => soma + iv, 0),
    status: card.status,
    alturaM: card.alturaM,
    pesoKg: card.pesoKg,
  };
}

// ---------------------------------------------------------------------------
// Consultas do mercado
// ---------------------------------------------------------------------------

/**
 * Espécies com anúncios ativos (a primeira tela do mercado)
 * @param {string} busca  parte do nome
 * @param {keyof ORDENS_MERCADO} ordem
 */
async function listarMercado(busca, ordem) {
  const { rows } = await pool.query(
    `SELECT e.id AS "especieId", e.nome, e.tipos,
            count(*) AS anuncios,
            min(a.preco) AS "menorPreco",
            count(*) FILTER (WHERE a.aceita_propostas) AS "aceitamPropostas",
            count(*) FILTER (WHERE p.shiny) AS shinies
       FROM anuncios a
       JOIN pokemons p ON p.id = a.pokemon_id
       JOIN especies e ON e.id = p.especie_id
      WHERE a.status = 'ativo' AND e.nome ILIKE $1
      GROUP BY e.id
      ORDER BY ${ORDENS_MERCADO[ordem] ?? ORDENS_MERCADO.popularidade}
      LIMIT 120`,
    [`%${escaparBusca(busca)}%`],
  );
  return rows;
}

/** Linha de anúncio (anuncios + card) no formato do front */
function descreverAnuncio(linha, usuarioId) {
  return {
    id: linha.anuncio_id,
    preco: linha.preco,
    aceitaPropostas: linha.aceita_propostas,
    anunciadoEm: linha.anunciado_em,
    vendedor: linha.vendedor_login,
    meu: linha.vendedor_id === usuarioId,
    propostasPendentes: linha.propostas_pendentes ?? 0,
    pokemon: cardPublico(linha),
  };
}

const SELECT_ANUNCIO = `
  SELECT ${CAMPOS_CARD}, a.id AS anuncio_id, a.preco, a.aceita_propostas, a.criado_em AS anunciado_em,
         a.vendedor_id, u.login AS vendedor_login,
         (SELECT count(*) FROM propostas WHERE anuncio_id = a.id AND status = 'pendente') AS propostas_pendentes
    FROM anuncios a
    JOIN pokemons p ON p.id = a.pokemon_id
    JOIN especies e ON e.id = p.especie_id
    JOIN usuarios u ON u.id = a.vendedor_id`;

/** Todos os anúncios ativos de uma espécie, cada um com o card e quem anunciou */
async function listarAnunciosDaEspecie(usuarioId, especieId, ordem) {
  const { rows } = await pool.query(
    `${SELECT_ANUNCIO}
      WHERE a.status = 'ativo' AND p.especie_id = $1
      ORDER BY ${ORDENS_ANUNCIOS[ordem] ?? ORDENS_ANUNCIOS.preco}
      LIMIT 100`,
    [especieId],
  );
  return rows.map((linha) => descreverAnuncio(linha, usuarioId));
}

async function listarMeusAnuncios(usuarioId) {
  const { rows } = await pool.query(
    `${SELECT_ANUNCIO} WHERE a.status = 'ativo' AND a.vendedor_id = $1 ORDER BY a.id DESC`,
    [usuarioId],
  );
  return rows.map((linha) => descreverAnuncio(linha, usuarioId));
}

// ---------------------------------------------------------------------------
// Travas e transferências
// ---------------------------------------------------------------------------

async function travarUsuarios(client, ids) {
  await client.query('SELECT 1 FROM usuarios WHERE id = ANY($1) ORDER BY id FOR UPDATE', [ids]);
}

async function lerAnuncio(clientOuPool, anuncioId, { travar = false } = {}) {
  const { rows } = await clientOuPool.query(
    `SELECT * FROM anuncios WHERE id = $1${travar ? ' FOR UPDATE' : ''}`,
    [anuncioId],
  );
  if (!rows[0]) throw new ErroJogo('Anúncio não encontrado.');
  return rows[0];
}

async function travarAnuncioAtivo(client, anuncioId) {
  const anuncio = await lerAnuncio(client, anuncioId, { travar: true });
  if (anuncio.status !== 'ativo') throw new ErroJogo('Esse anúncio não está mais disponível.');
  return anuncio;
}

/** Trava os cards e confere que ainda são do dono e estão fora do time de batalha */
async function travarCardsLivres(client, pokemonIds, donoId, mensagem = 'Algum desses Pokémon não está mais disponível.') {
  if (pokemonIds.length === 0) return;
  const { rows } = await client.query(
    'SELECT id, dono_id, posicao_time FROM pokemons WHERE id = ANY($1) ORDER BY id FOR UPDATE',
    [pokemonIds],
  );
  if (rows.length !== pokemonIds.length || rows.some((p) => p.dono_id !== donoId)) throw new ErroJogo(mensagem);
  if (rows.some((p) => p.posicao_time !== null)) {
    throw new ErroJogo('Pokémon do time de batalha não podem ser trocados. Tire-os do time antes.');
  }
}

/** Passa Pokécoins de um treinador para outro, com o extrato dos dois lados */
async function moverPokecoins(client, { deId, paraId, valor, anuncioId, motivoSaida, motivoEntrada }) {
  if (valor <= 0) return;
  const debito = await client.query(
    'UPDATE usuarios SET pokecoins = pokecoins - $2 WHERE id = $1 AND pokecoins >= $2 RETURNING id',
    [deId, valor],
  );
  if (!debito.rows[0]) throw new ErroJogo('Pokécoins insuficientes para fechar essa troca.');
  await client.query('UPDATE usuarios SET pokecoins = pokecoins + $2 WHERE id = $1', [paraId, valor]);
  await client.query(
    `INSERT INTO transacoes_pokecoins (usuario_id, valor, motivo, anuncio_id)
     VALUES ($1, $2, $3, $5), ($4, $6, $7, $5)`,
    [deId, -valor, motivoSaida, paraId, anuncioId, valor, motivoEntrada],
  );
}

/**
 * Passa os cards para o novo dono. O afeto é com o treinador, então zera (e o histórico de
 * cuidados vai junto). Anúncios e propostas pendentes que envolviam esses cards são encerrados.
 * Quem chamou já deve ter finalizado o próprio anúncio/proposta, para eles não entrarem aqui.
 */
async function transferirCards(client, pokemonIds, novoDonoId) {
  if (pokemonIds.length === 0) return;
  await client.query(
    'UPDATE pokemons SET dono_id = $2, posicao_time = NULL, posicao_vitrine = NULL, afeto = 0 WHERE id = ANY($1)',
    [pokemonIds, novoDonoId],
  );
  await client.query('DELETE FROM cuidados WHERE pokemon_id = ANY($1)', [pokemonIds]);
  await client.query(
    "UPDATE anuncios SET status = 'cancelado', finalizado_em = now() WHERE pokemon_id = ANY($1) AND status = 'ativo'",
    [pokemonIds],
  );
  await client.query(
    `UPDATE propostas SET status = 'encerrada', respondida_em = now()
      WHERE status = 'pendente'
        AND (anuncio_id IN (SELECT id FROM anuncios WHERE pokemon_id = ANY($1))
             OR EXISTS (SELECT 1 FROM proposta_pokemons pp
                         WHERE pp.proposta_id = propostas.id AND pp.pokemon_id = ANY($1)))`,
    [pokemonIds],
  );
}

// ---------------------------------------------------------------------------
// Anúncios
// ---------------------------------------------------------------------------

/**
 * Anuncia um Pokémon da coleção (fora do time).
 * @param {number} usuarioId
 * @param {{ pokemonId: number, preco: number | null, aceitaPropostas: boolean }} dados
 */
async function criarAnuncio(usuarioId, { pokemonId, preco, aceitaPropostas }) {
  if (preco === null && !aceitaPropostas) {
    throw new ErroJogo('Defina um preço em Pokécoins, aceite propostas de troca, ou os dois.');
  }
  if (preco !== null && (!Number.isSafeInteger(preco) || preco < 1 || preco > config.PRECO_MAXIMO_ANUNCIO)) {
    throw new ErroJogo(`O preço precisa ser entre 1 e ${config.PRECO_MAXIMO_ANUNCIO} Pokécoins.`);
  }

  return transacao(async (client) => {
    await travarUsuarios(client, [usuarioId]);
    await travarCardsLivres(client, [pokemonId], usuarioId, 'Pokémon não encontrado.');

    const { rows: [{ ativos, jaAnunciado }] } = await client.query(
      `SELECT count(*) FILTER (WHERE vendedor_id = $1) AS ativos,
              bool_or(pokemon_id = $2) AS "jaAnunciado"
         FROM anuncios WHERE status = 'ativo' AND (vendedor_id = $1 OR pokemon_id = $2)`,
      [usuarioId, pokemonId],
    );
    if (jaAnunciado) throw new ErroJogo('Esse Pokémon já está anunciado.');
    if (ativos >= config.ANUNCIOS_ATIVOS_MAXIMO) {
      throw new ErroJogo(`Você já tem ${config.ANUNCIOS_ATIVOS_MAXIMO} anúncios ativos.`);
    }

    const { rows } = await client.query(
      `INSERT INTO anuncios (pokemon_id, vendedor_id, preco, aceita_propostas)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [pokemonId, usuarioId, preco, aceitaPropostas],
    );
    const { rows: [linha] } = await client.query(`${SELECT_ANUNCIO} WHERE a.id = $1`, [rows[0].id]);
    return descreverAnuncio(linha, usuarioId);
  });
}

/** O vendedor tira o anúncio do ar; as propostas pendentes são encerradas */
async function cancelarAnuncio(usuarioId, anuncioId) {
  await transacao(async (client) => {
    const anuncio = await lerAnuncio(client, anuncioId, { travar: true });
    if (anuncio.vendedor_id !== usuarioId) throw new ErroJogo('Anúncio não encontrado.');
    if (anuncio.status !== 'ativo') throw new ErroJogo('Esse anúncio já foi encerrado.');
    await client.query("UPDATE anuncios SET status = 'cancelado', finalizado_em = now() WHERE id = $1", [anuncioId]);
    await client.query(
      "UPDATE propostas SET status = 'encerrada', respondida_em = now() WHERE anuncio_id = $1 AND status = 'pendente'",
      [anuncioId],
    );
  });
}

/** Compra direta pelo preço do anúncio. Devolve o card, já do comprador. */
async function comprar(usuarioId, anuncioId) {
  const previa = await lerAnuncio(pool, anuncioId);
  if (previa.vendedor_id === usuarioId) throw new ErroJogo('Você não pode comprar o próprio anúncio.');

  return transacao(async (client) => {
    await travarUsuarios(client, [usuarioId, previa.vendedor_id]);
    const anuncio = await travarAnuncioAtivo(client, anuncioId);
    if (anuncio.preco === null) throw new ErroJogo('Esse anúncio só aceita propostas de troca.');
    await travarCardsLivres(client, [anuncio.pokemon_id], anuncio.vendedor_id, 'Esse Pokémon não está mais disponível.');

    const { rows: [comprador] } = await client.query('SELECT pokecoins FROM usuarios WHERE id = $1', [usuarioId]);
    if (comprador.pokecoins < anuncio.preco) throw new ErroJogo('Pokécoins insuficientes.');
    await moverPokecoins(client, {
      deId: usuarioId,
      paraId: anuncio.vendedor_id,
      valor: anuncio.preco,
      anuncioId,
      motivoSaida: 'compra_mercado',
      motivoEntrada: 'venda_mercado',
    });

    await client.query(
      "UPDATE anuncios SET status = 'vendido', comprador_id = $2, finalizado_em = now() WHERE id = $1",
      [anuncioId, usuarioId],
    );
    await transferirCards(client, [anuncio.pokemon_id], usuarioId);
    return buscarCard(client, anuncio.pokemon_id);
  });
}

// ---------------------------------------------------------------------------
// Propostas
// ---------------------------------------------------------------------------

/**
 * Oferece Pokémon e/ou Pokécoins por um anúncio que aceita propostas.
 * @param {number} usuarioId
 * @param {number} anuncioId
 * @param {{ pokemonIds: number[], pokecoins: number }} oferta
 */
async function proporTroca(usuarioId, anuncioId, { pokemonIds, pokecoins }) {
  if (!Number.isSafeInteger(pokecoins) || pokecoins < 0 || pokecoins > config.PRECO_MAXIMO_ANUNCIO) {
    throw new ErroJogo(`Ofereça entre 0 e ${config.PRECO_MAXIMO_ANUNCIO} Pokécoins.`);
  }
  if (pokemonIds.length > config.POKEMONS_POR_PROPOSTA || new Set(pokemonIds).size !== pokemonIds.length) {
    throw new ErroJogo(`Ofereça até ${config.POKEMONS_POR_PROPOSTA} Pokémon diferentes.`);
  }
  if (pokemonIds.length === 0 && pokecoins === 0) throw new ErroJogo('Ofereça pelo menos um Pokémon ou Pokécoins.');

  return transacao(async (client) => {
    await travarUsuarios(client, [usuarioId]);
    const anuncio = await travarAnuncioAtivo(client, anuncioId);
    if (anuncio.vendedor_id === usuarioId) throw new ErroJogo('Você não pode fazer proposta no próprio anúncio.');
    if (!anuncio.aceita_propostas) throw new ErroJogo('Esse anúncio não aceita propostas, só a compra direta.');
    await travarCardsLivres(client, pokemonIds, usuarioId, 'Algum desses Pokémon não é seu.');

    const { rows: [{ pokecoins: saldo }] } = await client.query('SELECT pokecoins FROM usuarios WHERE id = $1', [usuarioId]);
    if (pokecoins > saldo) throw new ErroJogo('Você não tem essa quantidade de Pokécoins.');

    const { rows: [pendentes] } = await client.query(
      `SELECT count(*) AS total, count(*) FILTER (WHERE anuncio_id = $2) AS neste
         FROM propostas WHERE proponente_id = $1 AND status = 'pendente'`,
      [usuarioId, anuncioId],
    );
    if (pendentes.neste > 0) throw new ErroJogo('Você já tem uma proposta pendente nesse anúncio. Cancele-a para mandar outra.');
    if (pendentes.total >= config.PROPOSTAS_PENDENTES_MAXIMO) {
      throw new ErroJogo(`Você já tem ${config.PROPOSTAS_PENDENTES_MAXIMO} propostas esperando resposta.`);
    }

    const { rows } = await client.query(
      'INSERT INTO propostas (anuncio_id, proponente_id, pokecoins) VALUES ($1, $2, $3) RETURNING id',
      [anuncioId, usuarioId, pokecoins],
    );
    const propostaId = rows[0].id;
    for (const pokemonId of pokemonIds) {
      await client.query('INSERT INTO proposta_pokemons (proposta_id, pokemon_id) VALUES ($1, $2)', [propostaId, pokemonId]);
    }
    return { id: propostaId };
  });
}

// Resumo de um card para os cards de proposta (foto, nome, nível, IVs)
const RESUMO_CARD = (p, e) => `jsonb_build_object(
  'id', ${p}.id, 'mintNumero', ${p}.mint_numero, 'especieId', ${p}.especie_id, 'nome', ${e}.nome,
  'shiny', ${p}.shiny, 'nivel', ${p}.nivel, 'tipos', ${e}.tipos,
  'ivTotal', ${p}.iv_hp + ${p}.iv_ataque + ${p}.iv_defesa + ${p}.iv_velocidade)`;

/** Propostas recebidas (nos meus anúncios) e enviadas: pendentes primeiro, depois as mais recentes */
async function listarPropostas(usuarioId) {
  const { rows } = await pool.query(
    `SELECT pr.id, pr.status, pr.pokecoins, pr.criada_em AS "criadaEm", pr.respondida_em AS "respondidaEm",
            a.id AS "anuncioId", a.preco, a.vendedor_id, pr.proponente_id,
            uv.login AS vendedor, up.login AS proponente,
            ${RESUMO_CARD('pa', 'ea')} AS alvo,
            (SELECT coalesce(jsonb_agg(${RESUMO_CARD('po', 'eo')} ORDER BY po.id), '[]')
               FROM proposta_pokemons pp
               JOIN pokemons po ON po.id = pp.pokemon_id
               JOIN especies eo ON eo.id = po.especie_id
              WHERE pp.proposta_id = pr.id) AS oferta
       FROM propostas pr
       JOIN anuncios a ON a.id = pr.anuncio_id
       JOIN pokemons pa ON pa.id = a.pokemon_id
       JOIN especies ea ON ea.id = pa.especie_id
       JOIN usuarios uv ON uv.id = a.vendedor_id
       JOIN usuarios up ON up.id = pr.proponente_id
      WHERE a.vendedor_id = $1 OR pr.proponente_id = $1
      ORDER BY (pr.status = 'pendente') DESC, pr.id DESC
      LIMIT 60`,
    [usuarioId],
  );
  const semIds = ({ vendedor_id: _v, proponente_id: _p, ...proposta }) => proposta;
  return {
    recebidas: rows.filter((r) => r.vendedor_id === usuarioId).map(semIds),
    enviadas: rows.filter((r) => r.proponente_id === usuarioId).map(semIds),
  };
}

/** Lê a proposta (sem travar) e confere o papel de quem está respondendo */
async function lerProposta(propostaId, usuarioId, papel) {
  const { rows } = await pool.query(
    `SELECT pr.*, a.vendedor_id FROM propostas pr JOIN anuncios a ON a.id = pr.anuncio_id WHERE pr.id = $1`,
    [propostaId],
  );
  const proposta = rows[0];
  const dono = papel === 'vendedor' ? proposta?.vendedor_id : proposta?.proponente_id;
  if (!proposta || dono !== usuarioId) throw new ErroJogo('Proposta não encontrada.');
  return proposta;
}

async function travarPropostaPendente(client, propostaId) {
  const { rows } = await client.query('SELECT * FROM propostas WHERE id = $1 FOR UPDATE', [propostaId]);
  if (rows[0].status !== 'pendente') throw new ErroJogo('Essa proposta já foi respondida.');
  return rows[0];
}

/**
 * O dono do anúncio aceita: o Pokémon anunciado vai para o proponente e a oferta
 * (Pokémon + Pokécoins) vai para o dono do anúncio, tudo na mesma transação.
 */
async function aceitarProposta(usuarioId, propostaId) {
  const previa = await lerProposta(propostaId, usuarioId, 'vendedor');

  await transacao(async (client) => {
    await travarUsuarios(client, [usuarioId, previa.proponente_id]);
    const anuncio = await travarAnuncioAtivo(client, previa.anuncio_id);
    const proposta = await travarPropostaPendente(client, propostaId);
    const { rows } = await client.query('SELECT pokemon_id FROM proposta_pokemons WHERE proposta_id = $1', [propostaId]);
    const oferta = rows.map((r) => r.pokemon_id);

    await travarCardsLivres(client, [anuncio.pokemon_id], usuarioId, 'Seu Pokémon anunciado não está mais disponível.');
    await travarCardsLivres(
      client,
      oferta,
      proposta.proponente_id,
      'Algum Pokémon oferecido não está mais com esse treinador. Recuse a proposta.',
    );
    await moverPokecoins(client, {
      deId: proposta.proponente_id,
      paraId: usuarioId,
      valor: proposta.pokecoins,
      anuncioId: anuncio.id,
      motivoSaida: 'troca',
      motivoEntrada: 'troca',
    });

    await client.query("UPDATE propostas SET status = 'aceita', respondida_em = now() WHERE id = $1", [propostaId]);
    await client.query(
      "UPDATE anuncios SET status = 'trocado', comprador_id = $2, finalizado_em = now() WHERE id = $1",
      [anuncio.id, proposta.proponente_id],
    );
    await transferirCards(client, [anuncio.pokemon_id], proposta.proponente_id);
    await transferirCards(client, oferta, usuarioId);
  });
}

/** Recusar (dono do anúncio) ou cancelar (quem mandou) uma proposta pendente */
async function encerrarProposta(usuarioId, propostaId, papel) {
  await lerProposta(propostaId, usuarioId, papel);
  await transacao(async (client) => {
    await travarPropostaPendente(client, propostaId);
    await client.query(
      'UPDATE propostas SET status = $2, respondida_em = now() WHERE id = $1',
      [propostaId, papel === 'vendedor' ? 'recusada' : 'cancelada'],
    );
  });
}

module.exports = {
  ORDENS_MERCADO,
  ORDENS_ANUNCIOS,
  listarMercado,
  listarAnunciosDaEspecie,
  listarMeusAnuncios,
  criarAnuncio,
  cancelarAnuncio,
  comprar,
  proporTroca,
  listarPropostas,
  aceitarProposta,
  recusarProposta: (usuarioId, propostaId) => encerrarProposta(usuarioId, propostaId, 'vendedor'),
  cancelarProposta: (usuarioId, propostaId) => encerrarProposta(usuarioId, propostaId, 'proponente'),
};
