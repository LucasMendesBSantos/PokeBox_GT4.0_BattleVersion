// Vantagens de tipo dos jogos principais (geração 6 em diante), com os nomes da PokeAPI.
// Fica no código, e não na PokeAPI, para as batalhas não dependerem dela estar no ar.
// Para cada tipo de golpe: contra quem ele é super efetivo (2x), pouco efetivo (0,5x) ou não tem efeito (0x).
const TABELA = {
  normal: { forte: [], fraco: ['rock', 'steel'], nulo: ['ghost'] },
  fire: { forte: ['grass', 'ice', 'bug', 'steel'], fraco: ['fire', 'water', 'rock', 'dragon'], nulo: [] },
  water: { forte: ['fire', 'ground', 'rock'], fraco: ['water', 'grass', 'dragon'], nulo: [] },
  electric: { forte: ['water', 'flying'], fraco: ['electric', 'grass', 'dragon'], nulo: ['ground'] },
  grass: {
    forte: ['water', 'ground', 'rock'],
    fraco: ['fire', 'grass', 'poison', 'flying', 'bug', 'dragon', 'steel'],
    nulo: [],
  },
  ice: { forte: ['grass', 'ground', 'flying', 'dragon'], fraco: ['fire', 'water', 'ice', 'steel'], nulo: [] },
  fighting: {
    forte: ['normal', 'ice', 'rock', 'dark', 'steel'],
    fraco: ['poison', 'flying', 'psychic', 'bug', 'fairy'],
    nulo: ['ghost'],
  },
  poison: { forte: ['grass', 'fairy'], fraco: ['poison', 'ground', 'rock', 'ghost'], nulo: ['steel'] },
  ground: { forte: ['fire', 'electric', 'poison', 'rock', 'steel'], fraco: ['grass', 'bug'], nulo: ['flying'] },
  flying: { forte: ['grass', 'fighting', 'bug'], fraco: ['electric', 'rock', 'steel'], nulo: [] },
  psychic: { forte: ['fighting', 'poison'], fraco: ['psychic', 'steel'], nulo: ['dark'] },
  bug: {
    forte: ['grass', 'psychic', 'dark'],
    fraco: ['fire', 'fighting', 'poison', 'flying', 'ghost', 'steel', 'fairy'],
    nulo: [],
  },
  rock: { forte: ['fire', 'ice', 'flying', 'bug'], fraco: ['fighting', 'ground', 'steel'], nulo: [] },
  ghost: { forte: ['psychic', 'ghost'], fraco: ['dark'], nulo: ['normal'] },
  dragon: { forte: ['dragon'], fraco: ['steel'], nulo: ['fairy'] },
  dark: { forte: ['psychic', 'ghost'], fraco: ['fighting', 'dark', 'fairy'], nulo: [] },
  steel: { forte: ['ice', 'rock', 'fairy'], fraco: ['fire', 'water', 'electric', 'steel'], nulo: [] },
  fairy: { forte: ['fighting', 'dragon', 'dark'], fraco: ['fire', 'poison', 'steel'], nulo: [] },
};

/**
 * Multiplicador de um golpe do tipo `tipoGolpe` contra um Pokémon com `tiposAlvo`
 * (os dois tipos se multiplicam: 4x, 2x, 1x, 0,5x, 0,25x ou 0x). Tipo desconhecido conta como neutro.
 * @param {string} tipoGolpe
 * @param {string[]} tiposAlvo
 */
function efetividade(tipoGolpe, tiposAlvo = []) {
  const linha = TABELA[tipoGolpe];
  if (!linha) return 1;
  return tiposAlvo.reduce((total, tipo) => {
    if (linha.nulo.includes(tipo)) return 0;
    if (linha.forte.includes(tipo)) return total * 2;
    if (linha.fraco.includes(tipo)) return total * 0.5;
    return total;
  }, 1);
}

module.exports = { efetividade };
