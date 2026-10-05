// Motor de batalha puro: recebe o estado e uma ação, devolve o novo estado e o que aconteceu.
// Não sabe nada de banco, relógio ou prazo; quem cuida disso é batalhas.js.
const config = require('./config');
const { calcularStatus, afetoMaximo } = require('./regras');
const { rngSeguro, decimalEntre } = require('./aleatorio');
const { ErroJogo } = require('./erros');

/**
 * Status congelados no início da batalha
 * @typedef {object} PokemonEmBatalha
 * @property {number} pokemonId
 * @property {number} mintNumero
 * @property {number} especieId
 * @property {string} nome
 * @property {boolean} shiny
 * @property {number} nivel
 * @property {number} hpMax
 * @property {number} hp
 * @property {number} ataque
 * @property {number} defesa
 * @property {number} velocidade
 * @property {boolean} afetoMaximo   pode aguentar um golpe letal com 1 PS
 * @property {boolean} resistiu      já usou essa chance nesta batalha
 *
 * @typedef {object} Lado
 * @property {number} usuarioId
 * @property {string} login
 * @property {number} ativo            índice do Pokémon em campo
 * @property {PokemonEmBatalha[]} pokemons
 * @property {number} timeoutsSeguidos   zera sempre que o jogador joga de verdade
 *
 * @typedef {object} EstadoBatalha
 * @property {[Lado, Lado]} lados
 * @property {0 | 1} vez                 índice do lado que joga agora
 *
 * @typedef {{ tipo: 'atacar' } | { tipo: 'trocar', indice: number } | { tipo: 'desistir' }} Acao
 *
 * @typedef {object} Fim
 * @property {0 | 1} vencedor
 * @property {'nocaute' | 'wo' | 'desistencia'} motivo
 *
 * @typedef {object} Resultado
 * @property {EstadoBatalha} estado
 * @property {object[]} eventos          o front usa para animar a jogada
 * @property {Fim | null} fim
 */

/**
 * Monta um lado da batalha a partir do time do jogador (já na ordem das posições 1 a 5).
 * @param {{ id: number, login: string }} usuario
 * @param {{ pokemon: import('./regras').Pokemon & { id: number, mint_numero: number }, especie: import('./regras').Especie }[]} time
 * @returns {Lado}
 */
function montarLado(usuario, time) {
  return {
    usuarioId: usuario.id,
    login: usuario.login,
    ativo: 0,
    timeoutsSeguidos: 0,
    pokemons: time.map(({ pokemon, especie }) => {
      const status = calcularStatus(especie, pokemon);
      return {
        pokemonId: pokemon.id,
        mintNumero: pokemon.mint_numero,
        especieId: especie.id,
        nome: especie.nome,
        shiny: pokemon.shiny,
        nivel: pokemon.nivel,
        hpMax: status.hp,
        hp: status.hp,
        ataque: status.ataque,
        defesa: status.defesa,
        velocidade: status.velocidade,
        afetoMaximo: afetoMaximo(pokemon.afeto),
        resistiu: false,
      };
    }),
  };
}

/**
 * Começa quem tem o primeiro Pokémon do time mais rápido; empate é no sorteio.
 * @returns {EstadoBatalha}
 */
function criarEstado(ladoA, ladoB, rng = rngSeguro) {
  const velA = ladoA.pokemons[0].velocidade;
  const velB = ladoB.pokemons[0].velocidade;
  let vez;
  if (velA === velB) vez = rng() < 0.5 ? 0 : 1;
  else vez = velA > velB ? 0 : 1;
  return { lados: [ladoA, ladoB], vez };
}

/** Dano no estilo dos jogos principais, com poder fixo, variação de 85-100% e crítico */
function calcularDano(atacante, defensor, rng) {
  const chanceCritico = atacante.velocidade > defensor.velocidade
    ? config.CHANCE_CRITICO_MAIS_RAPIDO
    : config.CHANCE_CRITICO;
  const critico = rng() < chanceCritico;

  const base = Math.floor(
    (Math.floor((2 * atacante.nivel) / 5 + 2) * config.PODER_ATAQUE * atacante.ataque) / defensor.defesa / 50,
  ) + 2;
  const variacao = decimalEntre(rng, 0.85, 1);
  const dano = Math.max(1, Math.floor(base * variacao * (critico ? config.MULT_CRITICO : 1)));
  return { dano, critico };
}

const outro = (indice) => (indice === 0 ? 1 : 0);

/**
 * Aplica a jogada de um jogador.
 * @param {EstadoBatalha} estadoAtual  não é alterado
 * @param {0 | 1} indiceJogador
 * @param {Acao} acao
 * @param {import('./aleatorio').Rng} [rng]
 * @returns {Resultado}
 */
function aplicarAcao(estadoAtual, indiceJogador, acao, rng = rngSeguro) {
  const estado = structuredClone(estadoAtual);
  const eu = estado.lados[indiceJogador];
  const oponente = estado.lados[outro(indiceJogador)];
  const eventos = [];

  // Desistir pode a qualquer momento, mesmo fora da sua vez
  if (acao.tipo === 'desistir') {
    eventos.push({ tipo: 'desistiu', lado: indiceJogador });
    return { estado, eventos, fim: { vencedor: outro(indiceJogador), motivo: 'desistencia' } };
  }

  if (estado.vez !== indiceJogador) {
    throw new ErroJogo('Não é a sua vez (se o seu prazo de 4h acabou, a vez passou para o oponente).');
  }

  if (acao.tipo === 'atacar') {
    const atacante = eu.pokemons[eu.ativo];
    const defensor = oponente.pokemons[oponente.ativo];
    const { dano, critico } = calcularDano(atacante, defensor, rng);
    // Afeto máximo: chance de aguentar firme com 1 PS, uma vez por batalha (estados antigos não têm o campo)
    const resistiu = dano >= defensor.hp && defensor.afetoMaximo && !defensor.resistiu
      && rng() < config.CHANCE_RESISTIR_AFETO_MAXIMO;
    defensor.hp = resistiu ? 1 : Math.max(0, defensor.hp - dano);
    eventos.push({
      tipo: 'dano', lado: indiceJogador, atacante: atacante.pokemonId, alvo: defensor.pokemonId,
      dano, critico, hpRestante: defensor.hp,
    });
    if (resistiu) {
      defensor.resistiu = true;
      eventos.push({ tipo: 'resistiu', lado: outro(indiceJogador), pokemonId: defensor.pokemonId });
    }

    if (defensor.hp === 0) {
      eventos.push({ tipo: 'nocaute', lado: outro(indiceJogador), pokemonId: defensor.pokemonId });
      // O próximo vivo entra sozinho, para não gastar um turno (e mais 4h) só escolhendo quem entra
      const proximo = oponente.pokemons.findIndex((p) => p.hp > 0);
      if (proximo === -1) {
        return { estado, eventos, fim: { vencedor: indiceJogador, motivo: 'nocaute' } };
      }
      oponente.ativo = proximo;
      eventos.push({ tipo: 'entrou', lado: outro(indiceJogador), indice: proximo });
    }
  } else if (acao.tipo === 'trocar') {
    const escolhido = eu.pokemons[acao.indice];
    if (!escolhido) throw new ErroJogo('Pokémon inválido.');
    if (acao.indice === eu.ativo) throw new ErroJogo('Esse Pokémon já está em campo.');
    if (escolhido.hp === 0) throw new ErroJogo('Esse Pokémon foi nocauteado.');
    eu.ativo = acao.indice;
    eventos.push({ tipo: 'entrou', lado: indiceJogador, indice: acao.indice });
  } else {
    throw new ErroJogo('Ação desconhecida.');
  }

  eu.timeoutsSeguidos = 0;
  estado.vez = outro(indiceJogador);
  return { estado, eventos, fim: null };
}

/**
 * Jogada automática quando o prazo de 4h vence: passa a vez.
 * Com TIMEOUTS_PARA_WO timeouts seguidos do mesmo jogador, ele perde por W.O.
 * @param {EstadoBatalha} estadoAtual
 * @returns {Resultado}
 */
function aplicarTimeout(estadoAtual) {
  const estado = structuredClone(estadoAtual);
  const indice = estado.vez;
  const lado = estado.lados[indice];
  lado.timeoutsSeguidos += 1;

  const eventos = [{ tipo: 'timeout', lado: indice, timeoutsSeguidos: lado.timeoutsSeguidos }];
  if (lado.timeoutsSeguidos >= config.TIMEOUTS_PARA_WO) {
    return { estado, eventos, fim: { vencedor: outro(indice), motivo: 'wo' } };
  }
  estado.vez = outro(indice);
  return { estado, eventos, fim: null };
}

module.exports = { montarLado, criarEstado, aplicarAcao, aplicarTimeout, calcularDano };
