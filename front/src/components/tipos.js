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
