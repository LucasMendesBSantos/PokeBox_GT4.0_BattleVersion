// Chamadas aos endpoints do jogo no back (/api/...)
const BACK_URL = import.meta.env.VITE_BACK_URL ?? 'http://localhost:8080';
const CHAVE_TOKEN = 'pokebox-token';

// O token fica no localStorage para o login sobreviver a um F5.
// Em aba anônima ou com armazenamento bloqueado, o login dura só até fechar a aba.
let tokenEmMemoria = null;

function lerToken() {
  try {
    return localStorage.getItem(CHAVE_TOKEN) ?? tokenEmMemoria;
  } catch {
    return tokenEmMemoria;
  }
}

function salvarToken(token) {
  tokenEmMemoria = token;
  try {
    if (token) localStorage.setItem(CHAVE_TOKEN, token);
    else localStorage.removeItem(CHAVE_TOKEN);
  } catch {
    // sem localStorage: fica só em memória
  }
}

export const temSessao = () => Boolean(lerToken());

// Erro com a mensagem que o back mandou ({ erro: "..." }) e o status HTTP
export class ErroApi extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

async function chamar(metodo, caminho, corpo) {
  const token = lerToken();
  let resposta;
  try {
    resposta = await fetch(`${BACK_URL}/api${caminho}`, {
      method: metodo,
      headers: {
        ...(corpo ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: corpo ? JSON.stringify(corpo) : undefined,
    });
  } catch {
    throw new ErroApi('Não foi possível falar com o servidor. Verifique sua conexão.', 0);
  }

  const texto = await resposta.text();
  let dados;
  try {
    dados = texto ? JSON.parse(texto) : null;
  } catch {
    // Ex.: página HTML de 404 quando o back está rodando uma versão antiga, sem esta rota
    throw new ErroApi('O servidor respondeu algo inesperado. Ele pode estar desatualizado; reinicie o back.', resposta.status);
  }
  if (!resposta.ok) {
    if (resposta.status === 401) salvarToken(null);
    throw new ErroApi(dados?.erro ?? 'Algo deu errado. Tente novamente.', resposta.status);
  }
  return dados;
}

// Conta
export async function cadastrar(dados) {
  const resposta = await chamar('POST', '/auth/cadastro', dados);
  salvarToken(resposta.token);
  return resposta.usuario;
}

export async function entrar(login, senha) {
  const resposta = await chamar('POST', '/auth/login', { login, senha });
  salvarToken(resposta.token);
  return resposta.usuario;
}

export async function sair() {
  try {
    await chamar('POST', '/auth/sair');
  } finally {
    salvarToken(null);
  }
}

export const verificarUsuario = async (dados) => (await chamar('POST', '/auth/verificar', dados)).encontrado;
export const redefinirSenha = (dados) => chamar('POST', '/auth/redefinir-senha', dados);

// Coleção, loja e time
export const buscarEu = () => chamar('GET', '/eu');
export const escolherInicial = (especieId) => chamar('POST', '/eu/inicial', { especieId });
export const comprarPokemon = (geracao) => chamar('POST', '/loja/comprar', { geracao });
export const comprarPokebolas = (quantidade) => chamar('POST', '/loja/pokebolas', { quantidade });
export const salvarTime = (pokemonIds) => chamar('PUT', '/time', { pokemonIds });
export const evoluir = (pokemonId, especieId) => chamar('POST', `/pokemons/${pokemonId}/evoluir`, { especieId });
export const cuidar = (pokemonId, tipo) => chamar('POST', `/pokemons/${pokemonId}/cuidar`, { tipo });
export const listarCuidados = (pokemonId) => chamar('GET', `/pokemons/${pokemonId}/cuidados`);
export const roletarGolpes = (pokemonId) => chamar('POST', `/pokemons/${pokemonId}/golpes/roletar`);
export const buscarTreinadores = (busca) => chamar('GET', `/treinadores?busca=${encodeURIComponent(busca)}`);
export const listarTreinadoresAtivos = () => chamar('GET', '/treinadores/ativos');

// Batalhas
export const listarBatalhas = () => chamar('GET', '/batalhas');
export const desafiar = (oponente) => chamar('POST', '/batalhas', { oponente });
export const buscarBatalha = (id) => chamar('GET', `/batalhas/${id}`);
export const responderDesafio = (id, aceitar) => chamar('POST', `/batalhas/${id}/responder`, { aceitar });
export const jogar = (id, jogada) => chamar('POST', `/batalhas/${id}/jogadas`, jogada);

// História
export const buscarHistoria = () => chamar('GET', '/historia');
export const explorarHistoria = () => chamar('POST', '/historia/explorar');
export const batalharNaHistoria = (encontroId) => chamar('POST', `/historia/encontros/${encontroId}/batalha`);
export const refazerPonto = (trilha, ponto) => chamar('POST', `/historia/trilhas/${trilha}/pontos/${ponto}/refazer`);
export const jogarNaHistoria = (encontroId, jogada) => chamar('POST', `/historia/encontros/${encontroId}/jogadas`, jogada);
export const capturar = (encontroId) => chamar('POST', `/historia/encontros/${encontroId}/capturar`);
export const ignorarPokemon = (encontroId) => chamar('POST', `/historia/encontros/${encontroId}/ignorar`);

// Vitrine
export const listarVitrines = (busca = '') => chamar('GET', `/vitrines?busca=${encodeURIComponent(busca)}`);
export const buscarVitrine = (login) => chamar('GET', `/vitrines/${encodeURIComponent(login)}`);
export const salvarVitrine = (dados) => chamar('PUT', '/vitrine', dados);

// Trocas
export const listarMercado = (busca, ordem) => chamar('GET', `/mercado?busca=${encodeURIComponent(busca)}&ordem=${ordem}`);
export const listarAnunciosDaEspecie = (especieId, ordem) => chamar('GET', `/mercado/${especieId}?ordem=${ordem}`);
export const listarMeusAnuncios = () => chamar('GET', '/anuncios/meus');
export const criarAnuncio = (dados) => chamar('POST', '/anuncios', dados);
export const cancelarAnuncio = (id) => chamar('DELETE', `/anuncios/${id}`);
export const comprarAnuncio = (id) => chamar('POST', `/anuncios/${id}/comprar`);
export const proporTroca = (anuncioId, oferta) => chamar('POST', `/anuncios/${anuncioId}/propostas`, oferta);
export const listarPropostas = () => chamar('GET', '/propostas');
export const aceitarProposta = (id) => chamar('POST', `/propostas/${id}/aceitar`);
export const recusarProposta = (id) => chamar('POST', `/propostas/${id}/recusar`);
export const cancelarProposta = (id) => chamar('DELETE', `/propostas/${id}`);
