const crypto = require('node:crypto');

/**
 * Função que devolve um número em [0, 1). As funções do jogo recebem uma
 * dessas por parâmetro para os testes poderem usar sorteios fixos.
 * @typedef {() => number} Rng
 */

// crypto em vez de Math.random: o sorteio de shiny/IVs vale Pokécoins, então não pode ser previsível
/** @type {Rng} */
const rngSeguro = () => crypto.randomInt(0, 2 ** 32) / 2 ** 32;

/** Inteiro entre min e max, incluindo os dois */
function inteiroEntre(rng, min, max) {
  return min + Math.floor(rng() * (max - min + 1));
}

/** Decimal entre min e max com 3 casas (o mesmo que a coluna NUMERIC(4, 3) guarda) */
function decimalEntre(rng, min, max) {
  return Math.round((min + rng() * (max - min)) * 1000) / 1000;
}

module.exports = { rngSeguro, inteiroEntre, decimalEntre };
