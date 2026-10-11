// Filtros e ordenação da coleção (Meus Pokémon e Time). Tudo no navegador, sobre os cards que o back já mandou.
import { formatarNome } from './tipos';

const PESO_RARIDADE = { mitico: 3, lendario: 2, comum: 1 };

// Cada critério: rótulo, como ler o valor do card e a direção que faz mais sentido ao escolher
export const CRITERIOS = {
  padrao: { rotulo: 'Padrão (time primeiro, depois os mais novos)', valor: null, direcao: 'asc' },
  nome: { rotulo: 'Nome', valor: (p) => formatarNome(p.nome), direcao: 'asc' },
  nivel: { rotulo: 'Nível', valor: (p) => p.nivel * 100000 + p.xp, direcao: 'desc' },
  hp: { rotulo: 'PS (vida)', valor: (p) => p.status.hp, direcao: 'desc' },
  ataque: { rotulo: 'Ataque', valor: (p) => p.status.ataque, direcao: 'desc' },
  defesa: { rotulo: 'Defesa', valor: (p) => p.status.defesa, direcao: 'desc' },
  velocidade: { rotulo: 'Velocidade', valor: (p) => p.status.velocidade, direcao: 'desc' },
  total: {
    rotulo: 'Total de status',
    valor: (p) => p.status.hp + p.status.ataque + p.status.defesa + p.status.velocidade,
    direcao: 'desc',
  },
  ivs: {
    rotulo: 'Total de IVs',
    valor: (p) => p.ivs.hp + p.ivs.ataque + p.ivs.defesa + p.ivs.velocidade,
    direcao: 'desc',
  },
  afeto: { rotulo: 'Afeto', valor: (p) => p.afeto.pontos, direcao: 'desc' },
  tipo: { rotulo: 'Tipo', valor: (p) => p.tipos[0], direcao: 'asc' },
  raridade: { rotulo: 'Raridade', valor: (p) => PESO_RARIDADE[p.raridade] ?? 0, direcao: 'desc' },
  mint: { rotulo: 'Número do card (#)', valor: (p) => p.mintNumero, direcao: 'asc' },
  pokedex: { rotulo: 'Número da Pokédex', valor: (p) => p.especieId, direcao: 'asc' },
};

export const FILTROS_INICIAIS = {
  busca: '',
  tipo: '',
  ordem: 'padrao',
  direcao: 'asc',
  soShiny: false,
  soTime: false,
};

/** Filtros salvos neste navegador (cada tela usa a sua chave), ou os iniciais */
export function lerFiltros(chave) {
  try {
    return { ...FILTROS_INICIAIS, ...JSON.parse(localStorage.getItem(chave)) };
  } catch {
    return FILTROS_INICIAIS;
  }
}

export function salvarFiltros(chave, filtros) {
  try {
    localStorage.setItem(chave, JSON.stringify(filtros));
  } catch {
    // sem localStorage: os filtros valem só até sair da tela
  }
}

const comparar = (a, b) => (typeof a === 'string' ? a.localeCompare(b, 'pt-BR') : a - b);

/**
 * Cards que passam nos filtros, na ordem escolhida. Empates ficam na ordem padrão.
 * @param {object[]} pokemons  na ordem padrão do back
 * @param {typeof FILTROS_INICIAIS} filtros
 */
export function filtrarEOrdenar(pokemons, filtros) {
  const busca = filtros.busca.trim().toLowerCase();
  const lista = pokemons.filter((p) => {
    if (busca && !formatarNome(p.nome).toLowerCase().includes(busca) && !String(p.mintNumero).includes(busca)) {
      return false;
    }
    if (filtros.tipo && !p.tipos.includes(filtros.tipo)) return false;
    if (filtros.soShiny && !p.shiny) return false;
    if (filtros.soTime && !p.posicaoTime) return false;
    return true;
  });

  const { valor } = CRITERIOS[filtros.ordem] ?? CRITERIOS.padrao;
  if (!valor) return filtros.direcao === 'desc' ? lista.reverse() : lista;
  const sinal = filtros.direcao === 'desc' ? -1 : 1;
  // sort é estável: com o mesmo valor, mantém a ordem padrão
  return lista.sort((a, b) => sinal * comparar(valor(a), valor(b)));
}

/** Tipos presentes na coleção, para o filtro de tipo não oferecer opções vazias */
export function tiposDaColecao(pokemons) {
  return [...new Set(pokemons.flatMap((p) => p.tipos))];
}
