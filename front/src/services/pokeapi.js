// As chamadas passam pelo back, que repassa para https://pokeapi.co/api/v2
const BACK_URL = import.meta.env.VITE_BACK_URL ?? 'http://localhost:8080';
const API_URL = `${BACK_URL}/api/pokeapi`;
const ARTWORK_URL = 'https://raw.githubusercontent.com/PokeAPI/sprites/master/sprites/pokemon/other/official-artwork';

// Guarda a promessa de cada requisição para não repetir a mesma chamada
const cache = new Map();

async function buscarJson(url) {
  const resposta = await fetch(url);
  if (!resposta.ok) {
    throw new Error(`PokeAPI respondeu ${resposta.status} para ${url}`);
  }
  return resposta.json();
}

function buscarComCache(caminho) {
  if (!cache.has(caminho)) {
    const promessa = buscarJson(`${API_URL}/${caminho}`).catch((erro) => {
      // Tira do cache para permitir uma nova tentativa depois
      cache.delete(caminho);
      throw erro;
    });
    cache.set(caminho, promessa);
  }
  return cache.get(caminho);
}

// ".../api/v2/pokemon/25/" -> 25
function extrairId(url) {
  return Number(url.split('/').filter(Boolean).pop());
}

// Formas alternativas (id > 10000, ex.: "charizard-mega-x") não dizem a espécie na lista;
// ela é o maior nome de espécie que prefixa o nome da forma.
function encontrarEspecie(nome, especies) {
  let melhor = null;
  especies.forEach((especie) => {
    const combina = nome === especie.name || nome.startsWith(`${especie.name}-`);
    if (combina && (!melhor || especie.name.length > melhor.name.length)) {
      melhor = especie;
    }
  });
  return melhor?.id ?? null;
}

// Lista leve com todos os Pokémon disponíveis (id, nome e id da espécie)
export async function listarPokemons() {
  const [pokemons, especies] = await Promise.all([
    buscarComCache('pokemon?limit=100000'),
    buscarComCache('pokemon-species?limit=100000'),
  ]);
  const listaEspecies = especies.results.map(({ name, url }) => ({ id: extrairId(url), name }));
  const idsEspecies = new Set(listaEspecies.map(({ id }) => id));

  return pokemons.results.map(({ name, url }) => {
    const id = extrairId(url);
    // A forma padrão de cada espécie tem o mesmo id da espécie
    const especieId = idsEspecies.has(id) ? id : encontrarEspecie(name, listaEspecies);
    return { id, name, especieId };
  });
}

// Arte oficial pelo número, sem precisar buscar o Pokémon inteiro
export function urlArtwork(id) {
  return `${ARTWORK_URL}/${id}.png`;
}

// Dados completos de um Pokémon (/pokemon/{id})
export function buscarPokemon(id) {
  return buscarComCache(`pokemon/${id}`);
}

// Como tirar da resposta de cada filtro os ids de Pokémon (type) ou de espécie (generation)
const RECURSOS_FILTRO = {
  type: { alvo: 'pokemon', urls: (dados) => dados.pokemon.map(({ pokemon }) => pokemon.url) },
  generation: { alvo: 'especie', urls: (dados) => dados.pokemon_species.map(({ url }) => url) },
};

// Nomes das opções de um filtro (ex.: todos os tipos)
export async function listarOpcoesFiltro(recurso) {
  const dados = await buscarComCache(`${recurso}?limit=100000`);
  return dados.results.map(({ name }) => name);
}

// Ids que passam num filtro. "alvo" diz se são ids de Pokémon ou de espécie.
export async function buscarFiltro(recurso, nome) {
  const { alvo, urls } = RECURSOS_FILTRO[recurso];
  const dados = await buscarComCache(`${recurso}/${nome}`);
  return { alvo, ids: new Set(urls(dados).map(extrairId)) };
}
