// Nome em português e cor de cada tipo (usado pelos cards da Pokédex e da coleção)
export const TIPOS = {
  normal: { nome: 'Normal', cor: '#a8a77a' },
  fire: { nome: 'Fogo', cor: '#ee8130' },
  water: { nome: 'Água', cor: '#6390f0' },
  grass: { nome: 'Planta', cor: '#7ac74c' },
  electric: { nome: 'Elétrico', cor: '#f7d02c' },
  ice: { nome: 'Gelo', cor: '#96d9d6' },
  fighting: { nome: 'Lutador', cor: '#c22e28' },
  poison: { nome: 'Venenoso', cor: '#a33ea1' },
  ground: { nome: 'Terrestre', cor: '#e2bf65' },
  flying: { nome: 'Voador', cor: '#a98ff3' },
  psychic: { nome: 'Psíquico', cor: '#f95587' },
  bug: { nome: 'Inseto', cor: '#a6b91a' },
  rock: { nome: 'Pedra', cor: '#b6a136' },
  ghost: { nome: 'Fantasma', cor: '#735797' },
  dragon: { nome: 'Dragão', cor: '#6f35fc' },
  dark: { nome: 'Sombrio', cor: '#705746' },
  steel: { nome: 'Aço', cor: '#b7b7ce' },
  fairy: { nome: 'Fada', cor: '#d685ad' },
};

export const TIPO_DESCONHECIDO = { nome: '???', cor: '#68a090' };

export const dadosTipo = (tipo) => TIPOS[tipo] ?? TIPO_DESCONHECIDO;

// Mesma tabela do back (back/src/jogo/tipos.js): para cada tipo de golpe, contra quem ele é
// super efetivo (2x), pouco efetivo (0,5x) ou não tem efeito (0x)
const EFETIVIDADE = {
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

// Multiplicador de um golpe contra um Pokémon com esses tipos (os dois tipos se multiplicam)
function efetividade(tipoGolpe, tiposAlvo) {
  const linha = EFETIVIDADE[tipoGolpe];
  return tiposAlvo.reduce((total, tipo) => {
    if (linha.nulo.includes(tipo)) return 0;
    if (linha.forte.includes(tipo)) return total * 2;
    if (linha.fraco.includes(tipo)) return total * 0.5;
    return total;
  }, 1);
}

/** Tipos contra os quais os golpes do Pokémon são super efetivos (vantagem) */
export const vantagensDe = (tipos) => Object.keys(TIPOS).filter(
  (alvo) => tipos.some((tipo) => EFETIVIDADE[tipo]?.forte.includes(alvo)),
);

/** Tipos de golpe que causam dano dobrado (ou mais) no Pokémon (desvantagem) */
export const fraquezasDe = (tipos) => Object.keys(TIPOS).filter(
  (golpe) => efetividade(golpe, tipos) >= 2,
);

// "lightning-rod" -> "Lightning Rod"
export function formatarNome(nome) {
  return nome
    .split('-')
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(' ');
}

export function formatarNumero(numero) {
  return `#${String(numero).padStart(4, '0')}`;
}
