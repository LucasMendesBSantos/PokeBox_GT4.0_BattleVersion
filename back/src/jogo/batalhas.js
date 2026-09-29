// Batalhas assíncronas: desafio, jogadas, prazo de 4h e recompensas.
//
// O prazo é conferido de dois jeitos, e os dois chamam resolverPrazo:
//   1. agendador.js roda a cada minuto e processa as batalhas vencidas;
//   2. toda leitura/jogada confere o prazo antes, então o jogo continua certo
//      mesmo se o agendador estiver parado ou atrasado.
// Toda mudança numa batalha acontece com a linha travada (SELECT ... FOR UPDATE),
// então uma jogada e o timeout nunca são aplicados ao mesmo tempo.
const { pool, transacao } = require('../db');
const config = require('./config');
const motor = require('./motor');
const { darXp } = require('./pokemons');
const { ErroJogo } = require('./erros');

const depoisDe = (agora, ms) => new Date(agora.getTime() + ms);

/** Time de batalha do usuário, na ordem das posições, com os dados da espécie */
async function carregarTime(client, usuarioId) {
  const { rows } = await client.query(
    `SELECT to_jsonb(p) AS pokemon, to_jsonb(e) AS especie
       FROM pokemons p JOIN especies e ON e.id = p.especie_id
      WHERE p.dono_id = $1 AND p.posicao_time IS NOT NULL
      ORDER BY p.posicao_time`,
    [usuarioId],
  );
  return rows;
}

async function travarBatalha(client, batalhaId) {
  const { rows } = await client.query('SELECT * FROM batalhas WHERE id = $1 FOR UPDATE', [batalhaId]);
  if (!rows[0]) throw new ErroJogo('Batalha não encontrada.');
  return rows[0];
}

const participa = (batalha, usuarioId) => batalha.desafiante_id === usuarioId || batalha.desafiado_id === usuarioId;
const indiceDo = (estado, usuarioId) => estado.lados.findIndex((lado) => lado.usuarioId === usuarioId);

// Consulta usada para devolver batalhas ao front, já com o login dos dois lados
const SELECT_BATALHA = `
  SELECT b.*, u1.login AS desafiante_login, u2.login AS desafiado_login
    FROM batalhas b
    JOIN usuarios u1 ON u1.id = b.desafiante_id
    JOIN usuarios u2 ON u2.id = b.desafiado_id`;

/** Batalha no formato do front, do ponto de vista de quem pediu */
function descreverBatalha(linha, usuarioId) {
  const souDesafiante = linha.desafiante_id === usuarioId;
  return {
    id: linha.id,
    status: linha.status,
    desafiante: { id: linha.desafiante_id, login: linha.desafiante_login },
    desafiado: { id: linha.desafiado_id, login: linha.desafiado_login },
    oponente: souDesafiante ? linha.desafiado_login : linha.desafiante_login,
    souDesafiante,
    minhaVez: linha.status === 'em_andamento' && linha.vez_de === usuarioId,
    turno: linha.turno,
    prazoEm: linha.prazo_em,
    expiraEm: linha.expira_em,
    vencedorId: linha.vencedor_id,
    venci: linha.vencedor_id === usuarioId,
    motivoFim: linha.motivo_fim,
    estado: linha.estado,
    minhasRecompensas: linha.recompensas?.[usuarioId] ?? null,
    criadaEm: linha.criada_em,
    finalizadaEm: linha.finalizada_em,
  };
}

async function buscarBatalha(client, batalhaId, usuarioId) {
  const { rows } = await client.query(`${SELECT_BATALHA} WHERE b.id = $1`, [batalhaId]);
  return descreverBatalha(rows[0], usuarioId);
}

// ---------------------------------------------------------------------------
// Desafio
// ---------------------------------------------------------------------------

/**
 * Cria um desafio. O desafiado tem PRAZO_DESAFIO_MS para aceitar, depois ele expira.
 * @param {number} desafianteId
 * @param {string} loginOponente
 */
async function desafiar(desafianteId, loginOponente) {
  return transacao(async (client) => {
    // Trava o desafiante para dois cliques não passarem juntos pelos limites abaixo
    await client.query('SELECT 1 FROM usuarios WHERE id = $1 FOR UPDATE', [desafianteId]);

    const oponente = await client.query('SELECT id FROM usuarios WHERE lower(login) = lower($1)', [loginOponente]);
    const desafiadoId = oponente.rows[0]?.id;
    if (!desafiadoId) throw new ErroJogo('Treinador não encontrado.');
    if (desafiadoId === desafianteId) throw new ErroJogo('Você não pode desafiar a si mesmo.');

    const time = await carregarTime(client, desafianteId);
    if (time.length !== config.TAMANHO_TIME) {
      throw new ErroJogo(`Monte um time com ${config.TAMANHO_TIME} Pokémon antes de desafiar.`);
    }

    const agora = new Date();
    const { rows: [pendentes] } = await client.query(
      `SELECT count(*) AS total,
              count(*) FILTER (WHERE $2 IN (desafiante_id, desafiado_id)) AS com_oponente
         FROM batalhas
        WHERE desafiante_id = $1 AND status = 'aguardando' AND expira_em > $3`,
      [desafianteId, desafiadoId, agora],
    );
    if (pendentes.com_oponente > 0) throw new ErroJogo('Você já tem um desafio esperando esse treinador.');
    if (pendentes.total >= config.DESAFIOS_PENDENTES_MAXIMO) {
      throw new ErroJogo(`Você já tem ${config.DESAFIOS_PENDENTES_MAXIMO} desafios esperando resposta.`);
    }

    const { rows } = await client.query(
      'INSERT INTO batalhas (desafiante_id, desafiado_id, expira_em) VALUES ($1, $2, $3) RETURNING id',
      [desafianteId, desafiadoId, depoisDe(agora, config.PRAZO_DESAFIO_MS)],
    );
    return buscarBatalha(client, rows[0].id, desafianteId);
  });
}

/** Marca o desafio como expirado se o prazo para aceitar já passou */
async function expirarSeVencido(client, batalha, agora = new Date()) {
  if (batalha.status !== 'aguardando' || batalha.expira_em > agora) return false;
  await client.query("UPDATE batalhas SET status = 'expirada' WHERE id = $1", [batalha.id]);
  return true;
}

/**
 * O desafiado aceita ou recusa. Ao aceitar, os dois times são congelados no
 * estado da batalha e o relógio de 4h começa para quem joga primeiro.
 */
async function responderDesafio(usuarioId, batalhaId, aceitar) {
  // Expira numa transação própria, para ficar gravado mesmo se a resposta abaixo for recusada
  await transacao(async (client) => expirarSeVencido(client, await travarBatalha(client, batalhaId)));

  return transacao(async (client) => {
    const batalha = await travarBatalha(client, batalhaId);
    if (batalha.desafiado_id !== usuarioId) throw new ErroJogo('Esse desafio não é para você.');
    if (batalha.status === 'expirada') throw new ErroJogo('Esse desafio expirou.');
    if (batalha.status !== 'aguardando') throw new ErroJogo('Esse desafio já foi respondido.');

    if (!aceitar) {
      await client.query("UPDATE batalhas SET status = 'recusada' WHERE id = $1", [batalhaId]);
      return buscarBatalha(client, batalhaId, usuarioId);
    }

    const [timeA, timeB] = [
      await carregarTime(client, batalha.desafiante_id),
      await carregarTime(client, batalha.desafiado_id),
    ];
    if (timeA.length !== config.TAMANHO_TIME || timeB.length !== config.TAMANHO_TIME) {
      throw new ErroJogo(`Os dois jogadores precisam de um time com ${config.TAMANHO_TIME} Pokémon.`);
    }
    const { rows: usuarios } = await client.query(
      'SELECT id, login FROM usuarios WHERE id = ANY($1)',
      [[batalha.desafiante_id, batalha.desafiado_id]],
    );
    const usuario = (id) => usuarios.find((u) => u.id === id);

    const estado = motor.criarEstado(
      motor.montarLado(usuario(batalha.desafiante_id), timeA),
      motor.montarLado(usuario(batalha.desafiado_id), timeB),
    );
    const agora = new Date();
    await client.query(
      `UPDATE batalhas
          SET status = 'em_andamento', estado = $2, turno = 1, vez_de = $3,
              prazo_em = $4, ultimo_movimento_em = $5
        WHERE id = $1`,
      [batalhaId, estado, estado.lados[estado.vez].usuarioId, depoisDe(agora, config.PRAZO_JOGADA_MS), agora],
    );
    return buscarBatalha(client, batalhaId, usuarioId);
  });
}

// ---------------------------------------------------------------------------
// Recompensas
// ---------------------------------------------------------------------------

/**
 * Quanto um lado recebe, já aplicando os limites anti-farm. Sem esses limites,
 * duas contas do mesmo dono poderiam batalhar entre si só para gerar Pokécoins.
 */
async function calcularPremio(client, { usuarioId, oponenteId, base, jogadasManuais }) {
  const nada = (semRecompensa) => ({ pokecoins: 0, xp: 0, semRecompensa });
  if (base.pokecoins === 0 && base.xp === 0) return nada('Quem abandona a batalha não recebe recompensa.');
  if (jogadasManuais < config.JOGADAS_MINIMAS_PARA_RECOMPENSA) {
    return nada('A batalha terminou cedo demais para dar recompensa.');
  }

  const { rows: [recentes] } = await client.query(
    `SELECT count(*) AS total,
            count(*) FILTER (WHERE $2 IN (b.desafiante_id, b.desafiado_id)) AS contra_oponente
       FROM transacoes_pokecoins t JOIN batalhas b ON b.id = t.batalha_id
      WHERE t.usuario_id = $1 AND t.motivo = 'recompensa_batalha'
        AND t.criado_em > now() - interval '24 hours'`,
    [usuarioId, oponenteId],
  );
  if (recentes.total >= config.RECOMPENSAS_POR_DIA) {
    return nada(`Limite de ${config.RECOMPENSAS_POR_DIA} batalhas premiadas em 24h atingido.`);
  }
  if (recentes.contra_oponente >= config.RECOMPENSAS_MESMO_OPONENTE_POR_DIA) {
    return nada(`Limite de ${config.RECOMPENSAS_MESMO_OPONENTE_POR_DIA} batalhas premiadas contra o mesmo treinador em 24h atingido.`);
  }
  return { ...base, semRecompensa: null };
}

/** Pokécoins para os jogadores e XP para os 5 Pokémon de cada time */
async function distribuirRecompensas(client, batalhaId, estado, fim) {
  const { rows: [{ total: jogadasManuais }] } = await client.query(
    `SELECT count(*) AS total FROM batalha_acoes
      WHERE batalha_id = $1 AND NOT automatica AND tipo IN ('atacar', 'trocar')`,
    [batalhaId],
  );

  const perdedor = fim.vencedor === 0 ? 1 : 0;
  const lados = [
    { lado: estado.lados[fim.vencedor], oponente: estado.lados[perdedor], base: config.RECOMPENSA_VENCEDOR },
    {
      lado: estado.lados[perdedor],
      oponente: estado.lados[fim.vencedor],
      base: fim.motivo === 'nocaute' ? config.RECOMPENSA_PERDEDOR : config.RECOMPENSA_ABANDONO,
    },
  ];

  const recompensas = {};
  for (const { lado, oponente, base } of lados) {
    const premio = await calcularPremio(client, {
      usuarioId: lado.usuarioId, oponenteId: oponente.usuarioId, base, jogadasManuais,
    });
    if (premio.pokecoins > 0) {
      await client.query('UPDATE usuarios SET pokecoins = pokecoins + $2 WHERE id = $1', [lado.usuarioId, premio.pokecoins]);
      await client.query(
        `INSERT INTO transacoes_pokecoins (usuario_id, valor, motivo, batalha_id)
         VALUES ($1, $2, 'recompensa_batalha', $3)`,
        [lado.usuarioId, premio.pokecoins, batalhaId],
      );
    }
    const subiram = await darXp(client, lado.usuarioId, lado.pokemons.map((p) => p.pokemonId), premio.xp);
    recompensas[lado.usuarioId] = { ...premio, subiram };
  }
  return recompensas;
}

// ---------------------------------------------------------------------------
// Jogadas
// ---------------------------------------------------------------------------

/**
 * Salva o resultado de uma ação (do jogador ou automática) e, se a batalha
 * acabou, entrega as recompensas na mesma transação: ou tudo é gravado ou nada.
 * Como a linha está travada e o status vira 'finalizada' aqui, a recompensa
 * nunca é paga duas vezes.
 */
async function registrarResultado(client, batalha, { indiceJogador, tipo, automatica, resultado, agora }) {
  const { estado, eventos, fim } = resultado;

  await client.query(
    `INSERT INTO batalha_acoes (batalha_id, turno, jogador_id, tipo, automatica, eventos)
     VALUES ($1, $2, $3, $4, $5, $6)`,
    [batalha.id, batalha.turno, estado.lados[indiceJogador].usuarioId, tipo, automatica, JSON.stringify(eventos)],
  );

  if (!fim) {
    await client.query(
      `UPDATE batalhas
          SET estado = $2, turno = turno + 1, vez_de = $3, prazo_em = $4, ultimo_movimento_em = $5
        WHERE id = $1`,
      [batalha.id, estado, estado.lados[estado.vez].usuarioId, depoisDe(agora, config.PRAZO_JOGADA_MS), agora],
    );
    return;
  }

  const vencedor = estado.lados[fim.vencedor];
  await client.query(
    `UPDATE batalhas
        SET status = 'finalizada', estado = $2, vencedor_id = $3, motivo_fim = $4,
            vez_de = NULL, prazo_em = NULL, ultimo_movimento_em = $5, finalizada_em = $5
      WHERE id = $1`,
    [batalha.id, estado, vencedor.usuarioId, fim.motivo, agora],
  );
  const recompensas = await distribuirRecompensas(client, batalha.id, estado, fim);
  await client.query('UPDATE batalhas SET recompensas = $2 WHERE id = $1', [batalha.id, recompensas]);
}

/**
 * Se o prazo da jogada atual já venceu, aplica o timeout (passa a vez ou W.O.).
 * O novo prazo conta a partir de agora, então no máximo um timeout vence por vez.
 * @returns {Promise<boolean>} true se aplicou um timeout
 */
async function resolverPrazo(client, batalha, agora = new Date()) {
  if (batalha.status !== 'em_andamento' || batalha.prazo_em > agora) return false;
  const resultado = motor.aplicarTimeout(batalha.estado);
  await registrarResultado(client, batalha, {
    indiceJogador: batalha.estado.vez, tipo: 'passar', automatica: true, resultado, agora,
  });
  return true;
}

/** Aplica timeout/expiração pendentes numa transação própria (fica gravado mesmo se o que vem depois falhar) */
async function atualizarPrazos(batalhaId) {
  await transacao(async (client) => {
    const batalha = await travarBatalha(client, batalhaId);
    await expirarSeVencido(client, batalha);
    await resolverPrazo(client, batalha);
  });
}

/**
 * Jogada do usuário.
 * @param {number} usuarioId
 * @param {number} batalhaId
 * @param {import('./motor').Acao} acao
 */
async function jogar(usuarioId, batalhaId, acao) {
  await atualizarPrazos(batalhaId);

  return transacao(async (client) => {
    const batalha = await travarBatalha(client, batalhaId);
    if (!participa(batalha, usuarioId)) throw new ErroJogo('Batalha não encontrada.');
    if (batalha.status !== 'em_andamento') throw new ErroJogo('Essa batalha não está em andamento.');

    const indice = indiceDo(batalha.estado, usuarioId);
    const resultado = motor.aplicarAcao(batalha.estado, indice, acao);
    await registrarResultado(client, batalha, {
      indiceJogador: indice, tipo: acao.tipo, automatica: false, resultado, agora: new Date(),
    });
    return buscarBatalha(client, batalhaId, usuarioId);
  });
}

/** Batalha com histórico, já com prazos conferidos */
async function obterBatalha(usuarioId, batalhaId) {
  await atualizarPrazos(batalhaId);

  const { rows } = await pool.query(`${SELECT_BATALHA} WHERE b.id = $1`, [batalhaId]);
  if (!rows[0] || !participa(rows[0], usuarioId)) throw new ErroJogo('Batalha não encontrada.');

  const { rows: acoes } = await pool.query(
    `SELECT turno, jogador_id AS "jogadorId", tipo, automatica, eventos, criada_em AS "criadaEm"
       FROM batalha_acoes WHERE batalha_id = $1 ORDER BY id`,
    [batalhaId],
  );
  return { batalha: descreverBatalha(rows[0], usuarioId), acoes };
}

/** Batalhas do usuário: pendentes e em andamento primeiro, depois as últimas 20 encerradas */
async function listarBatalhas(usuarioId) {
  // Resolve prazos vencidos antes de listar, para a lista não mostrar estado velho
  const { rows: vencidas } = await pool.query(
    `SELECT id FROM batalhas
      WHERE $1 IN (desafiante_id, desafiado_id)
        AND ((status = 'em_andamento' AND prazo_em <= now()) OR (status = 'aguardando' AND expira_em <= now()))`,
    [usuarioId],
  );
  for (const { id } of vencidas) await atualizarPrazos(id);

  const { rows } = await pool.query(
    `(${SELECT_BATALHA}
       WHERE $1 IN (b.desafiante_id, b.desafiado_id) AND b.status IN ('aguardando', 'em_andamento'))
     UNION ALL
     (${SELECT_BATALHA}
       WHERE $1 IN (b.desafiante_id, b.desafiado_id) AND b.status NOT IN ('aguardando', 'em_andamento')
       ORDER BY b.criada_em DESC LIMIT 20)`,
    [usuarioId],
  );
  return rows.map((linha) => descreverBatalha(linha, usuarioId));
}

// ---------------------------------------------------------------------------
// Agendador
// ---------------------------------------------------------------------------

/**
 * Processa as batalhas com prazo vencido. Cada batalha tem a própria transação,
 * então um erro numa não trava as outras. SKIP LOCKED pula a batalha que está
 * recebendo uma jogada agora (ela mesma resolve o prazo) e permite rodar o
 * agendador em mais de uma instância do back.
 * @returns {Promise<number>} quantas batalhas foram processadas
 */
async function processarPrazosVencidos(limite = 100) {
  const agora = new Date();
  const { rows } = await pool.query(
    `SELECT id FROM batalhas
      WHERE status = 'em_andamento' AND prazo_em <= $1
      ORDER BY prazo_em
      LIMIT $2`,
    [agora, limite],
  );

  let processadas = 0;
  for (const { id } of rows) {
    try {
      await transacao(async (client) => {
        const travada = await client.query('SELECT * FROM batalhas WHERE id = $1 FOR UPDATE SKIP LOCKED', [id]);
        if (travada.rows[0] && (await resolverPrazo(client, travada.rows[0], agora))) processadas += 1;
      });
    } catch (erro) {
      console.error(`Erro ao processar o prazo da batalha ${id}:`, erro);
    }
  }
  return processadas;
}

/** Desafios que ninguém respondeu no prazo viram 'expirada' (um único UPDATE, sem estado para calcular) */
async function expirarDesafios() {
  const { rowCount } = await pool.query(
    "UPDATE batalhas SET status = 'expirada' WHERE status = 'aguardando' AND expira_em <= now()",
  );
  return rowCount;
}

module.exports = {
  desafiar,
  responderDesafio,
  jogar,
  obterBatalha,
  listarBatalhas,
  processarPrazosVencidos,
  expirarDesafios,
};
