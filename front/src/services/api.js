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
  const dados = texto ? JSON.parse(texto) : null;
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
export const comprarPokemon = () => chamar('POST', '/loja/comprar');
export const salvarTime = (pokemonIds) => chamar('PUT', '/time', { pokemonIds });
export const evoluir = (pokemonId, especieId) => chamar('POST', `/pokemons/${pokemonId}/evoluir`, { especieId });
export const buscarTreinadores = (busca) => chamar('GET', `/treinadores?busca=${encodeURIComponent(busca)}`);

// Batalhas
export const listarBatalhas = () => chamar('GET', '/batalhas');
export const desafiar = (oponente) => chamar('POST', '/batalhas', { oponente });
export const buscarBatalha = (id) => chamar('GET', `/batalhas/${id}`);
export const responderDesafio = (id, aceitar) => chamar('POST', `/batalhas/${id}/responder`, { aceitar });
export const jogar = (id, jogada) => chamar('POST', `/batalhas/${id}/jogadas`, jogada);
