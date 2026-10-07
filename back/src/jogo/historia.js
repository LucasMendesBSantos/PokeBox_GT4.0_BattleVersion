// História: trilhas de pontos, cada ponto um Pokémon selvagem sorteado quando o treinador o encontra.
// O treinador batalha com o time de 3 contra o selvagem (que joga sozinho logo depois de cada jogada)
// e, se vencer, ganha Pokécoins e XP e pode tentar capturá-lo com Pokébolas.
//
// A trilha é linear: só existe um encontro aberto por vez, sempre o próximo ponto depois dos vencidos.
// Cada linha de historia_encontros é um Pokémon encontrado; o que vale para a tela é o último de cada ponto.
// Depois de vencido, o ponto tem até TENTATIVAS_CAPTURA_MAXIMO tentativas de captura (ou o treinador pode
// ignorar o Pokémon); capturado, fugido ou ignorado, o ponto pode ser refeito (revanche) contra um novo
// Pokémon aleatório, pagando CUSTO_REFAZER_HISTORIA.
// Toda mudança num encontro acontece com a linha travada (SELECT ... FOR UPDATE),
// então dois cliques nunca aplicam a mesma jogada ou captura duas vezes.
const { pool, transacao } = require('../db');
const config = require('./config');
const motor = require('./motor');
const {
  sortearAtributos, forcaDoPonto, proximoPonto, nivelSelvagem, statusSelvagem, xpDaHistoria, chanceDeCaptura,
} = require('./regras');
const { garantirTaxaCaptura } = require('./especies');
const { mintarPokemon, buscarCard, darXp } = require('./pokemons');
const { carregarTime } = require('./batalhas');
const { sortearEspecieDaLoja } = require('./usuarios');
const { ErroJogo } = require('./erros');
const { rngSeguro } = require('./aleatorio');

const TREINADOR = 0; // índices dos lados no estado da batalha
const SELVAGEM = 1;
// Os selvagens podem ser de qualquer geração (lendários e míticos com a mesma raridade da loja)
const TODAS_AS_ESPECIES = { primeira: 1, ultima: config.GERACOES.at(-1).ultima };

const SELECT_ENCONTRO = `
  SELECT h.*, e.nome, e.tipos, e.raridade, e.taxa_captura, e.hp_base, e.ataque_base, e.defesa_base, e.velocidade_base
    FROM historia_encontros h JOIN especies e ON e.id = h.especie_id`;

const atributosDe = (linha) => ({
  shiny: linha.shiny,
  iv_hp: linha.iv_hp,
  iv_ataque: linha.iv_ataque,
  iv_defesa: linha.iv_defesa,
  iv_velocidade: linha.iv_velocidade,
  mult_altura: linha.mult_altura,
  mult_peso: linha.mult_peso,
});

/** Encontro no formato do front */
function descreverEncontro(linha) {
  return {
    id: linha.id,
    trilha: linha.trilha,
    ponto: linha.ponto,
    forca: linha.forca,
    especieId: linha.especie_id,
    nome: linha.nome,
    tipos: linha.tipos,
    raridade: linha.raridade,
    shiny: linha.shiny,
    nivel: linha.nivel,
    status: statusSelvagem(linha, atributosDe(linha), linha.forca),
    situacao: linha.status,
    // Revanche: batalha extra num ponto que já foi vencido (não conta para a trilha)
    revanche: linha.revanche,
    pontoVencido: linha.revanche || linha.status !== 'encontrado',
    // Batalha em andamento (null fora dela)
    batalha: linha.estado ? { estado: linha.estado, log: linha.log, fim: null } : null,
    recompensa: linha.recompensa,
    // Depende da espécie (capture_rate da PokeAPI); null só enquanto a espécie antiga não foi completada
    chanceCaptura: linha.taxa_captura == null ? null : chanceDeCaptura(linha.taxa_captura),
    tentativasCaptura: linha.tentativas_captura,
    tentativasRestantes: Math.max(0, config.TENTATIVAS_CAPTURA_MAXIMO - linha.tentativas_captura),
    pokemonCapturadoId: linha.pokemon_id,
  };
}

async function buscarEncontro(client, encontroId) {
  const { rows } = await client.query(`${SELECT_ENCONTRO} WHERE h.id = $1`, [encontroId]);
  return descreverEncontro(rows[0]);
}

async function travarEncontro(client, usuarioId, encontroId) {
  const { rows } = await client.query(`${SELECT_ENCONTRO} WHERE h.id = $1 FOR UPDATE OF h`, [encontroId]);
  if (!rows[0] || rows[0].usuario_id !== usuarioId) throw new ErroJogo('Encontro não encontrado.');
  return rows[0];
}

/** O encontro do próximo ponto da trilha, se já foi explorado e ainda não foi vencido */
async function encontroAberto(clientOuPool, usuarioId) {
  const { rows } = await clientOuPool.query(
    `${SELECT_ENCONTRO} WHERE h.usuario_id = $1 AND h.status = 'encontrado' AND NOT h.revanche`,
    [usuarioId],
  );
  return rows[0] ?? null;
}

async function contarVencidos(clientOuPool, usuarioId) {
  const { rows } = await clientOuPool.query(
    "SELECT count(*) AS total FROM historia_encontros WHERE usuario_id = $1 AND status <> 'encontrado' AND NOT revanche",
    [usuarioId],
  );
  return rows[0].total;
}

/** Último Pokémon encontrado num ponto (o que aparece na trilha) */
async function ultimoDoPonto(clientOuPool, usuarioId, trilha, ponto) {
  const { rows } = await clientOuPool.query(
    `${SELECT_ENCONTRO} WHERE h.usuario_id = $1 AND h.trilha = $2 AND h.ponto = $3 ORDER BY h.id DESC LIMIT 1`,
    [usuarioId, trilha, ponto],
  );
  return rows[0] ?? null;
}

/** Insere o Pokémon selvagem sorteado num ponto e devolve a linha (travada) */
async function inserirEncontro(client, usuarioId, { trilha, ponto }, especie, revanche, rng) {
  const forca = forcaDoPonto(trilha, ponto);
  const a = sortearAtributos(rng);
  const { rows } = await client.query(
    `INSERT INTO historia_encontros (usuario_id, trilha, ponto, especie_id, forca, nivel, shiny,
                                     iv_hp, iv_ataque, iv_defesa, iv_velocidade, mult_altura, mult_peso, revanche)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
     RETURNING id`,
    [usuarioId, trilha, ponto, especie.id, forca, nivelSelvagem(forca), a.shiny,
      a.iv_hp, a.iv_ataque, a.iv_defesa, a.iv_velocidade, a.mult_altura, a.mult_peso, revanche],
  );
  return travarEncontro(client, usuarioId, rows[0].id);
}

// ---------------------------------------------------------------------------
// Trilha
// ---------------------------------------------------------------------------

/** Tudo o que a tela da história precisa: regras, o último encontro de cada ponto e o próximo ponto */
async function obterHistoria(usuarioId) {
  const { rows } = await pool.query(
    `SELECT DISTINCT ON (h.trilha, h.ponto)
            h.*, e.nome, e.tipos, e.raridade, e.taxa_captura, e.hp_base, e.ataque_base, e.defesa_base, e.velocidade_base
       FROM historia_encontros h JOIN especies e ON e.id = h.especie_id
      WHERE h.usuario_id = $1
      ORDER BY h.trilha, h.ponto, h.id DESC`,
    [usuarioId],
  );
  // Espécies salvas antes da taxa de captura existir: completa uma vez (cada espécie só vai à PokeAPI uma vez)
  for (const linha of rows) {
    if (linha.taxa_captura == null) linha.taxa_captura = await garantirTaxaCaptura(linha.especie_id);
  }
  const { rows: [totais] } = await pool.query(
    `SELECT count(*) FILTER (WHERE status <> 'encontrado' AND NOT revanche) AS vencidos,
            count(*) FILTER (WHERE status = 'capturado') AS capturados
       FROM historia_encontros WHERE usuario_id = $1`,
    [usuarioId],
  );
  const proximo = proximoPonto(totais.vencidos);
  return {
    trilhas: config.HISTORIA_TRILHAS,
    pontosPorTrilha: config.HISTORIA_PONTOS_POR_TRILHA,
    tentativasCaptura: config.TENTATIVAS_CAPTURA_MAXIMO,
    custoRefazer: config.CUSTO_REFAZER_HISTORIA,
    vencidos: totais.vencidos,
    capturados: totais.capturados,
    proximo: proximo && { ...proximo, forca: forcaDoPonto(proximo.trilha, proximo.ponto) },
    encontros: rows.map(descreverEncontro),
  };
}

/**
 * Encontra o Pokémon selvagem do próximo ponto. Se ele já foi encontrado (e ainda não
 * foi vencido), devolve o mesmo: perder ou fugir não sorteia outro.
 */
async function explorar(usuarioId, rng = rngSeguro) {
  const aberto = await encontroAberto(pool, usuarioId);
  if (aberto) return descreverEncontro(aberto);
  if (!proximoPonto(await contarVencidos(pool, usuarioId))) throw new ErroJogo('Você já completou toda a história!');

  // Fora da transação: pode precisar ir à PokeAPI
  const especie = await sortearEspecieDaLoja(TODAS_AS_ESPECIES, rng);

  return transacao(async (client) => {
    // Trava o treinador e confere de novo: dois cliques não criam dois encontros
    await client.query('SELECT 1 FROM usuarios WHERE id = $1 FOR UPDATE', [usuarioId]);
    const jaAberto = await encontroAberto(client, usuarioId);
    if (jaAberto) return descreverEncontro(jaAberto);
    const ponto = proximoPonto(await contarVencidos(client, usuarioId));
    if (!ponto) throw new ErroJogo('Você já completou toda a história!');
    return descreverEncontro(await inserirEncontro(client, usuarioId, ponto, especie, false, rng));
  });
}

// ---------------------------------------------------------------------------
// Batalha
// ---------------------------------------------------------------------------

/** Lado do Pokémon selvagem no formato do motor (pokemonId 0: não é um card de ninguém) */
function montarSelvagem(linha) {
  const status = statusSelvagem(linha, atributosDe(linha), linha.forca);
  return {
    usuarioId: null,
    login: 'Selvagem',
    ativo: 0,
    timeoutsSeguidos: 0,
    pokemons: [{
      pokemonId: 0,
      mintNumero: null,
      especieId: linha.especie_id,
      nome: linha.nome,
      shiny: linha.shiny,
      nivel: linha.nivel,
      hpMax: status.hp,
      hp: status.hp,
      ataque: status.ataque,
      defesa: status.defesa,
      velocidade: status.velocidade,
      afetoMaximo: false,
      resistiu: false,
      tipos: linha.tipos, // o selvagem só usa o ataque básico, mas recebe a vantagem de tipo dos golpes
      golpes: [],
    }],
  };
}

/** O selvagem sempre ataca */
function turnoDoSelvagem(estado, log, rng) {
  const resultado = motor.aplicarAcao(estado, SELVAGEM, { tipo: 'atacar' }, rng);
  log.push({ lado: SELVAGEM, eventos: resultado.eventos });
  return resultado;
}

/** Jogada do treinador seguida da resposta do selvagem (se a batalha não acabou) */
function jogarTurno(estado, acao, log, rng) {
  const resultado = motor.aplicarAcao(estado, TREINADOR, acao, rng);
  log.push({ lado: TREINADOR, eventos: resultado.eventos });
  if (resultado.fim || resultado.estado.vez !== SELVAGEM) return resultado;
  return turnoDoSelvagem(resultado.estado, log, rng);
}

/** Pokécoins para o treinador e XP para todos os Pokémon do time, tendo lutado ou não */
async function premiar(client, usuarioId, estado, forca) {
  const { pokecoins } = config.HISTORIA_RECOMPENSA;
  await client.query('UPDATE usuarios SET pokecoins = pokecoins + $2 WHERE id = $1', [usuarioId, pokecoins]);
  await client.query(
    "INSERT INTO transacoes_pokecoins (usuario_id, valor, motivo) VALUES ($1, $2, 'recompensa_historia')",
    [usuarioId, pokecoins],
  );
  const xp = xpDaHistoria(forca);
  const ids = estado.lados[TREINADOR].pokemons.map((p) => p.pokemonId);
  const subiram = await darXp(client, usuarioId, ids, xp);
  return { pokecoins, xp, subiram };
}

/**
 * Grava o turno. Vitória: o Pokémon fica vencido (pode ser capturado) e o prêmio é pago na mesma
 * transação (com a linha travada e a batalha sumindo aqui, nunca paga duas vezes).
 * Derrota ou fuga: na primeira vez o mesmo Pokémon continua esperando no ponto;
 * numa revanche ele foge e a próxima revanche sorteia outro.
 */
async function concluirTurno(client, encontro, usuarioId, { estado, log, fim }) {
  const logJson = JSON.stringify(log); // o pg converteria um array JS num array do PostgreSQL
  let recompensa = null;

  if (!fim) {
    await client.query(
      'UPDATE historia_encontros SET estado = $2, log = $3 WHERE id = $1',
      [encontro.id, estado, logJson],
    );
  } else if (fim.vencedor === TREINADOR) {
    recompensa = await premiar(client, usuarioId, estado, encontro.forca);
    await client.query(
      `UPDATE historia_encontros
          SET status = CASE WHEN status = 'encontrado' THEN 'vencido' ELSE status END,
              vencido_em = COALESCE(vencido_em, now()),
              estado = NULL, log = $2, recompensa = $3
        WHERE id = $1`,
      [encontro.id, logJson, recompensa],
    );
  } else {
    await client.query(
      `UPDATE historia_encontros
          SET estado = NULL, log = $2, status = CASE WHEN revanche THEN 'fugiu' ELSE status END
        WHERE id = $1`,
      [encontro.id, logJson],
    );
  }

  return {
    encontro: await buscarEncontro(client, encontro.id),
    // O estado final vai na resposta mesmo quando a batalha acabou, para o front mostrar o desfecho
    batalha: { estado, log, fim, recompensa },
  };
}

const retomar = (linha) => ({
  encontro: descreverEncontro(linha),
  batalha: { estado: linha.estado, log: linha.log, fim: null },
});

/** Monta a batalha com o time atual congelado; selvagem mais rápido ataca primeiro */
async function comecarBatalha(client, usuarioId, encontro, rng) {
  const time = await carregarTime(client, usuarioId);
  if (time.length !== config.TAMANHO_TIME) {
    throw new ErroJogo(`Monte um time com ${config.TAMANHO_TIME} Pokémon antes de batalhar.`);
  }
  const { rows: [usuario] } = await client.query('SELECT id, login FROM usuarios WHERE id = $1', [usuarioId]);

  const estado = motor.criarEstado(motor.montarLado(usuario, time), montarSelvagem(encontro), rng);
  estado.revanche = encontro.revanche; // o front usa para não pular para o próximo ponto no fim
  const log = [];
  const resultado = estado.vez === SELVAGEM ? turnoDoSelvagem(estado, log, rng) : { estado, fim: null };
  return concluirTurno(client, encontro, usuarioId, { ...resultado, log });
}

/**
 * Começa a batalha contra o Pokémon do próximo ponto da trilha.
 * Se a batalha (de qualquer encontro) já estava em andamento, só a devolve.
 */
async function iniciarBatalha(usuarioId, encontroId, rng = rngSeguro) {
  return transacao(async (client) => {
    const encontro = await travarEncontro(client, usuarioId, encontroId);
    if (encontro.estado) return retomar(encontro);
    if (encontro.revanche || encontro.status !== 'encontrado') {
      throw new ErroJogo('Esse Pokémon já foi vencido. Use "Refazer" para batalhar de novo neste ponto.');
    }
    return comecarBatalha(client, usuarioId, encontro, rng);
  });
}

/** Erro se o último Pokémon do ponto ainda não deixa refazer (ponto não vencido ou captura pendente) */
function conferirSePodeRefazer(ultimo) {
  if (!ultimo || (!ultimo.revanche && ultimo.status === 'encontrado')) {
    throw new ErroJogo('Vença este ponto antes de refazê-lo.');
  }
  if (ultimo.status === 'vencido') {
    const restantes = config.TENTATIVAS_CAPTURA_MAXIMO - ultimo.tentativas_captura;
    throw new ErroJogo(`Tente capturar ou ignore o Pokémon deste ponto antes: ainda restam ${restantes} tentativas.`);
  }
}

/**
 * Revanche num ponto já vencido contra um novo Pokémon aleatório (mesma força do ponto).
 * Só depois que o último Pokémon do ponto foi capturado, fugiu ou foi ignorado. Custa CUSTO_REFAZER_HISTORIA.
 */
async function refazerPonto(usuarioId, trilha, ponto, rng = rngSeguro) {
  const atual = await ultimoDoPonto(pool, usuarioId, trilha, ponto);
  if (atual?.estado) return retomar(atual);
  conferirSePodeRefazer(atual);

  // Fora da transação: pode precisar ir à PokeAPI
  const especie = await sortearEspecieDaLoja(TODAS_AS_ESPECIES, rng);

  return transacao(async (client) => {
    // Trava o treinador e confere de novo: dois cliques não cobram nem sorteiam duas vezes
    await client.query('SELECT 1 FROM usuarios WHERE id = $1 FOR UPDATE', [usuarioId]);
    const ultimo = await ultimoDoPonto(client, usuarioId, trilha, ponto);
    if (ultimo?.estado) return retomar(ultimo);
    conferirSePodeRefazer(ultimo);

    // Débito condicional: se o saldo não cobre, nenhuma linha é alterada
    const debito = await client.query(
      'UPDATE usuarios SET pokecoins = pokecoins - $2 WHERE id = $1 AND pokecoins >= $2 RETURNING id',
      [usuarioId, config.CUSTO_REFAZER_HISTORIA],
    );
    if (!debito.rows[0]) {
      throw new ErroJogo(`Refazer um ponto custa ${config.CUSTO_REFAZER_HISTORIA} Pokécoins e você não tem o suficiente.`);
    }
    await client.query(
      "INSERT INTO transacoes_pokecoins (usuario_id, valor, motivo) VALUES ($1, $2, 'refazer_historia')",
      [usuarioId, -config.CUSTO_REFAZER_HISTORIA],
    );

    const encontro = await inserirEncontro(client, usuarioId, { trilha, ponto }, especie, true, rng);
    return comecarBatalha(client, usuarioId, encontro, rng);
  });
}

/**
 * Jogada do treinador: atacar, trocar ou desistir (fugir).
 * @param {number} usuarioId
 * @param {number} encontroId
 * @param {import('./motor').Acao} acao
 */
async function jogar(usuarioId, encontroId, acao, rng = rngSeguro) {
  return transacao(async (client) => {
    const encontro = await travarEncontro(client, usuarioId, encontroId);
    if (!encontro.estado) throw new ErroJogo('Você não está batalhando com esse Pokémon.');
    const log = [...encontro.log];
    const resultado = jogarTurno(encontro.estado, acao, log, rng);
    return concluirTurno(client, encontro, usuarioId, { ...resultado, log });
  });
}

// ---------------------------------------------------------------------------
// Captura
// ---------------------------------------------------------------------------

/**
 * Gasta uma Pokébola tentando capturar um Pokémon já derrotado (chance pela espécie: chanceDeCaptura).
 * O capturado vira um card com os mesmos IVs, shiny e nível do selvagem.
 * Depois de TENTATIVAS_CAPTURA_MAXIMO erros ele foge, e o ponto fica livre para refazer.
 */
async function capturar(usuarioId, encontroId, rng = rngSeguro) {
  // Fora da transação: espécies antigas podem precisar ir à PokeAPI buscar a taxa de captura
  const { rows: [alvo] } = await pool.query(
    'SELECT especie_id FROM historia_encontros WHERE id = $1 AND usuario_id = $2',
    [encontroId, usuarioId],
  );
  const taxaCaptura = alvo ? await garantirTaxaCaptura(alvo.especie_id) : null;

  return transacao(async (client) => {
    const encontro = await travarEncontro(client, usuarioId, encontroId);
    if (encontro.status === 'capturado') throw new ErroJogo('Esse Pokémon já foi capturado.');
    if (encontro.status !== 'vencido') throw new ErroJogo('Vença a batalha antes de tentar capturar.');
    if (encontro.estado) throw new ErroJogo('Termine a batalha antes de tentar capturar.');

    const { rows } = await client.query(
      'UPDATE usuarios SET pokebolas = pokebolas - 1 WHERE id = $1 AND pokebolas > 0 RETURNING pokebolas',
      [usuarioId],
    );
    if (!rows[0]) throw new ErroJogo('Você não tem Pokébolas. Compre na loja.');

    const capturou = rng() < chanceDeCaptura(taxaCaptura);
    let pokemon = null;
    if (capturou) {
      const id = await mintarPokemon(client, {
        donoId: usuarioId,
        especieId: encontro.especie_id,
        origem: 'captura',
        atributos: atributosDe(encontro),
        nivel: encontro.nivel,
      });
      pokemon = await buscarCard(client, id);
    }
    const tentativas = encontro.tentativas_captura + 1;
    const fugiu = !capturou && tentativas >= config.TENTATIVAS_CAPTURA_MAXIMO;
    let status = encontro.status;
    if (capturou) status = 'capturado';
    else if (fugiu) status = 'fugiu';
    await client.query(
      'UPDATE historia_encontros SET tentativas_captura = $2, status = $3, pokemon_id = $4 WHERE id = $1',
      [encontroId, tentativas, status, pokemon?.id ?? null],
    );
    return {
      capturou, fugiu, pokemon, pokebolas: rows[0].pokebolas, encontro: await buscarEncontro(client, encontroId),
    };
  });
}

/**
 * Desiste de capturar um Pokémon derrotado: ele vai embora e o ponto fica livre para refazer.
 * Não dá para desfazer.
 */
async function ignorar(usuarioId, encontroId) {
  return transacao(async (client) => {
    const encontro = await travarEncontro(client, usuarioId, encontroId);
    if (encontro.status !== 'vencido' || encontro.estado) throw new ErroJogo('Só dá para ignorar um Pokémon derrotado que ainda pode ser capturado.');
    await client.query("UPDATE historia_encontros SET status = 'ignorado' WHERE id = $1", [encontroId]);
    return buscarEncontro(client, encontroId);
  });
}

module.exports = {
  obterHistoria, explorar, iniciarBatalha, refazerPonto, jogar, capturar, ignorar,
};
