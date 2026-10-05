// Regras puras (sem banco): mint, status e XP. Por não dependerem de nada externo, são testadas em regras.test.js
const config = require('./config');
const { rngSeguro, inteiroEntre, decimalEntre } = require('./aleatorio');
const { ErroJogo } = require('./erros');

/**
 * @typedef {object} Especie
 * @property {number} id
 * @property {string} nome
 * @property {string[]} tipos
 * @property {number} hp_base
 * @property {number} ataque_base
 * @property {number} defesa_base
 * @property {number} velocidade_base
 * @property {number} altura_base   decímetros
 * @property {number} peso_base     hectogramas
 * @property {'comum' | 'lendario' | 'mitico'} raridade
 * @property {Evolucao[]} evolucoes
 *
 * @typedef {object} Evolucao
 * @property {number} especieId
 * @property {string} nome
 * @property {number} nivel   nível mínimo para evoluir
 *
 * @typedef {object} AtributosSorteados
 * @property {boolean} shiny
 * @property {number} iv_hp
 * @property {number} iv_ataque
 * @property {number} iv_defesa
 * @property {number} iv_velocidade
 * @property {number} mult_altura
 * @property {number} mult_peso
 *
 * @typedef {AtributosSorteados & { especie_id: number, nivel: number, xp: number }} Pokemon
 *
 * @typedef {object} Status
 * @property {number} hp
 * @property {number} ataque
 * @property {number} defesa
 * @property {number} velocidade
 */

// ---------------------------------------------------------------------------
// Mint
// ---------------------------------------------------------------------------

/**
 * Sorteia o que torna o card único. O shiny é sorteado primeiro porque ele
 * aumenta o mínimo dos IVs.
 * @param {import('./aleatorio').Rng} [rng]
 * @returns {AtributosSorteados}
 */
function sortearAtributos(rng = rngSeguro) {
  const shiny = rng() < config.CHANCE_SHINY;
  const ivMinimo = shiny ? config.IV_MINIMO_SHINY : 0;
  const iv = () => inteiroEntre(rng, ivMinimo, config.IV_MAXIMO);

  return {
    shiny,
    iv_hp: iv(),
    iv_ataque: iv(),
    iv_defesa: iv(),
    iv_velocidade: iv(),
    mult_altura: decimalEntre(rng, config.MULT_MINIMO, config.MULT_MAXIMO),
    mult_peso: decimalEntre(rng, config.MULT_MINIMO, config.MULT_MAXIMO),
  };
}

/** Altura (m) e peso (kg) do card, calculados a partir da espécie atual */
function medidas(especie, pokemon) {
  return {
    alturaM: Math.round(especie.altura_base * pokemon.mult_altura * 10) / 100,
    pesoKg: Math.round(especie.peso_base * pokemon.mult_peso * 10) / 100,
  };
}

// ---------------------------------------------------------------------------
// Status
// ---------------------------------------------------------------------------

/**
 * Fórmula dos jogos principais (sem EVs e natureza):
 *   HP     = (2 * base + IV) * nível / 100 + nível + 10
 *   outros = (2 * base + IV) * nível / 100 + 5
 * Depois soma o bônus do afeto (+2% por coração).
 * @param {Especie} especie
 * @param {Pokemon & { afeto?: number }} pokemon
 * @returns {Status}
 */
function calcularStatus(especie, pokemon) {
  const escala = (base, iv) => Math.floor(((2 * base + iv) * pokemon.nivel) / 100);
  const bonus = 1 + bonusAfeto(pokemon.afeto);
  const comBonus = (valor) => Math.floor(valor * bonus);
  return {
    hp: comBonus(escala(especie.hp_base, pokemon.iv_hp) + pokemon.nivel + 10),
    ataque: comBonus(escala(especie.ataque_base, pokemon.iv_ataque) + 5),
    defesa: comBonus(escala(especie.defesa_base, pokemon.iv_defesa) + 5),
    velocidade: comBonus(escala(especie.velocidade_base, pokemon.iv_velocidade) + 5),
  };
}

// ---------------------------------------------------------------------------
// Afeto
// ---------------------------------------------------------------------------

/** Corações cheios (0 a 5) */
function coracoes(afeto = 0) {
  return Math.floor(Math.min(afeto, config.AFETO_MAXIMO) / config.AFETO_POR_CORACAO);
}

/** Bônus de status do afeto, em fração (0.06 = +6%) */
function bonusAfeto(afeto = 0) {
  return Math.round(coracoes(afeto) * config.BONUS_STATUS_POR_CORACAO * 1000) / 1000;
}

const afetoMaximo = (afeto = 0) => afeto >= config.AFETO_MAXIMO;

const limitarBemEstar = (valor) => Math.max(0, Math.min(config.BEM_ESTAR_MAXIMO, valor));

/**
 * Humor e energia de agora: o banco guarda o valor no momento bem_estar_em e eles caem com o tempo.
 * @param {{ humor?: number, energia?: number, bem_estar_em?: Date | string }} pokemon
 * @param {Date} [agora]
 * @returns {{ humor: number, energia: number }}
 */
function bemEstarAtual(pokemon, agora = new Date()) {
  const { humor = config.BEM_ESTAR_INICIAL, energia = config.BEM_ESTAR_INICIAL, bem_estar_em: desde } = pokemon;
  const horas = desde ? Math.max(0, agora.getTime() - new Date(desde).getTime()) / (60 * 60 * 1000) : 0;
  return {
    humor: limitarBemEstar(Math.round(humor - horas * config.DESGASTE_POR_HORA.humor)),
    energia: limitarBemEstar(Math.round(energia - horas * config.DESGASTE_POR_HORA.energia)),
  };
}

/**
 * Aplica um cuidado (carinho, brincar, alimentar), respeitando a espera desde o último do mesmo tipo.
 * Brincar gasta energia: sem energia suficiente, o Pokémon está cansado demais.
 * @param {{ afeto: number, humor: number, energia: number }} atual  humor e energia já com o desgaste
 * @param {'carinho' | 'brincar' | 'alimentar'} tipo
 * @param {Date | null} ultimoEm    último cuidado desse tipo neste Pokémon
 * @param {Date} [agora]
 * @returns {{ afeto: number, humor: number, energia: number, ganho: number }}
 */
function aplicarCuidado(atual, tipo, ultimoEm, agora = new Date()) {
  const cuidado = config.CUIDADOS[tipo];
  if (!cuidado) throw new ErroJogo('Cuidado inválido.');
  if (ultimoEm && agora.getTime() - ultimoEm.getTime() < cuidado.esperaMs) {
    throw new ErroJogo('Esse cuidado ainda não está disponível. Espere um pouco e tente de novo.');
  }
  if (atual.energia + cuidado.energia < 0) {
    throw new ErroJogo('Seu Pokémon está cansado demais para brincar. Alimente-o primeiro.');
  }
  const afeto = Math.min(config.AFETO_MAXIMO, atual.afeto + cuidado.afeto);
  return {
    afeto,
    humor: limitarBemEstar(atual.humor + cuidado.humor),
    energia: limitarBemEstar(atual.energia + cuidado.energia),
    ganho: afeto - atual.afeto,
  };
}

/** Afeto no formato do front */
function descreverAfeto(afeto = 0) {
  const cheios = coracoes(afeto);
  return {
    pontos: afeto,
    coracoes: cheios,
    maximo: afetoMaximo(afeto),
    // Pontos que faltam para o próximo coração (null no máximo)
    faltamParaProximo: afetoMaximo(afeto) ? null : (cheios + 1) * config.AFETO_POR_CORACAO - afeto,
    bonusStatus: bonusAfeto(afeto),
  };
}

/**
 * Quando cada cuidado volta a ficar disponível (null = já está)
 * @param {Record<string, string | Date> | null} ultimos  último cuidado de cada tipo
 */
function disponibilidadeCuidados(ultimos) {
  return Object.fromEntries(Object.entries(config.CUIDADOS).map(([tipo, { esperaMs }]) => {
    const ultimo = ultimos?.[tipo];
    const disponivelEm = ultimo ? new Date(new Date(ultimo).getTime() + esperaMs) : null;
    return [tipo, disponivelEm && disponivelEm > new Date() ? disponivelEm : null];
  }));
}

// ---------------------------------------------------------------------------
// XP e evolução
// ---------------------------------------------------------------------------

/**
 * Soma XP e sobe quantos níveis couberem (uma vitória pode subir mais de um).
 * O campo xp guarda só o que sobrou dentro do nível atual; no nível máximo ele zera.
 * @param {{ nivel: number, xp: number }} pokemon
 * @param {number} xpGanho
 * @returns {{ nivel: number, xp: number, niveisGanhos: number }}
 */
function aplicarXp({ nivel, xp }, xpGanho) {
  const nivelInicial = nivel;
  let restante = xp + xpGanho;

  while (nivel < config.NIVEL_MAXIMO && restante >= config.xpParaSubir(nivel)) {
    restante -= config.xpParaSubir(nivel);
    nivel += 1;
  }
  if (nivel === config.NIVEL_MAXIMO) restante = 0;

  return { nivel, xp: restante, niveisGanhos: nivel - nivelInicial };
}

/**
 * Evoluções liberadas no nível atual (vazio = botão "Evoluir" escondido)
 * @returns {Evolucao[]}
 */
function evolucoesDisponiveis(especie, pokemon) {
  return especie.evolucoes.filter((evolucao) => pokemon.nivel >= evolucao.nivel);
}

/**
 * Card pronto para o front, a partir de uma linha de pokemons + especies (SELECT p.*, e.*)
 * @param {Pokemon & Especie & { id: number, mint_numero: number, posicao_time: number | null }} linha
 */
function descreverPokemon(linha) {
  const especie = linha;
  return {
    id: linha.id,
    mintNumero: linha.mint_numero,
    especieId: linha.especie_id,
    especieOriginalId: linha.especie_original_id,
    nome: especie.nome,
    tipos: especie.tipos,
    raridade: especie.raridade,
    shiny: linha.shiny,
    nivel: linha.nivel,
    xp: linha.xp,
    xpParaSubir: linha.nivel < config.NIVEL_MAXIMO ? config.xpParaSubir(linha.nivel) : null,
    ivs: {
      hp: linha.iv_hp, ataque: linha.iv_ataque, defesa: linha.iv_defesa, velocidade: linha.iv_velocidade,
    },
    status: calcularStatus(especie, linha),
    ...medidas(especie, linha),
    posicaoTime: linha.posicao_time,
    posicaoVitrine: linha.posicao_vitrine,
    anunciado: Boolean(linha.anunciado),
    afeto: descreverAfeto(linha.afeto),
    ...bemEstarAtual(linha),
    cuidadosDisponiveisEm: disponibilidadeCuidados(linha.ultimos_cuidados),
    evolucoes: especie.evolucoes.map((evolucao) => ({
      ...evolucao,
      disponivel: linha.nivel >= evolucao.nivel,
    })),
  };
}

module.exports = {
  sortearAtributos,
  medidas,
  calcularStatus,
  coracoes,
  afetoMaximo,
  aplicarCuidado,
  bemEstarAtual,
  descreverAfeto,
  aplicarXp,
  evolucoesDisponiveis,
  descreverPokemon,
};
