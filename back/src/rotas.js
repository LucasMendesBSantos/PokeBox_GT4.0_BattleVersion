// Endpoints do jogo. Todos respondem JSON; erros de regra voltam como 400 { erro: "mensagem" }.
const express = require('express');
const usuarios = require('./jogo/usuarios');
const pokemons = require('./jogo/pokemons');
const batalhas = require('./jogo/batalhas');
const { ErroJogo } = require('./jogo/erros');

const LOGIN_MAXIMO = 20;
const SENHA_MINIMA = 8;
const CELULAR = /^\d{11}$/;

const router = express.Router();
// Aqui dentro (e não no app) para o erro de JSON inválido cair no tratamento de erros deste router
router.use(express.json({ limit: '10kb' }));

// ---------------------------------------------------------------------------
// Validação e autenticação
// ---------------------------------------------------------------------------

function texto(valor, nome) {
  if (typeof valor !== 'string' || !valor.trim()) throw new ErroJogo(`Informe ${nome}.`);
  return valor.trim();
}

function inteiro(valor, nome) {
  const numero = Number(valor);
  if (!Number.isSafeInteger(numero) || numero <= 0) throw new ErroJogo(`${nome} inválido.`);
  return numero;
}

function dadosConta(corpo, { comSenha = true } = {}) {
  const login = texto(corpo.login, 'o usuário');
  if (login.length > LOGIN_MAXIMO) throw new ErroJogo(`O usuário pode ter no máximo ${LOGIN_MAXIMO} caracteres.`);
  const celular = texto(corpo.celular, 'o celular');
  if (!CELULAR.test(celular)) throw new ErroJogo('Informe um celular válido com DDD.');
  if (!comSenha) return { login, celular };
  if (typeof corpo.senha !== 'string' || corpo.senha.length < SENHA_MINIMA) {
    throw new ErroJogo(`A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`);
  }
  return { login, celular, senha: corpo.senha };
}

/**
 * Limite simples por IP para as rotas de conta: dificulta testar senhas
 * ou celulares em massa. Fica em memória (zera quando o back reinicia).
 */
function limitarTentativas({ maximo, janelaMs }) {
  const tentativas = new Map();
  return (req, res, next) => {
    const agora = Date.now();
    const chave = `${req.ip}:${req.path}`;
    const registro = tentativas.get(chave);
    if (!registro || registro.inicio + janelaMs < agora) {
      tentativas.set(chave, { inicio: agora, total: 1 });
      next();
      return;
    }
    registro.total += 1;
    if (registro.total > maximo) {
      res.status(429).json({ erro: 'Muitas tentativas. Espere alguns minutos e tente de novo.' });
      return;
    }
    next();
  };
}

const tokenDe = (req) => req.get('authorization')?.match(/^Bearer (\w+)$/)?.[1] ?? null;

async function autenticar(req, res, next) {
  const token = tokenDe(req);
  const usuario = token && (await usuarios.usuarioDaSessao(token));
  if (!usuario) {
    res.status(401).json({ erro: 'Faça login para continuar.' });
    return;
  }
  req.usuario = usuario;
  next();
}

// ---------------------------------------------------------------------------
// Conta
// ---------------------------------------------------------------------------

const conta = express.Router();
conta.use(limitarTentativas({ maximo: 20, janelaMs: 15 * 60 * 1000 }));

conta.post('/cadastro', async (req, res) => {
  res.status(201).json(await usuarios.cadastrarUsuario(dadosConta(req.body)));
});

conta.post('/login', async (req, res) => {
  res.json(await usuarios.entrar(texto(req.body.login, 'o usuário'), texto(req.body.senha, 'a senha')));
});

conta.post('/verificar', async (req, res) => {
  const { login, celular } = dadosConta(req.body, { comSenha: false });
  res.json({ encontrado: await usuarios.existeUsuario(login, celular) });
});

conta.post('/redefinir-senha', async (req, res) => {
  await usuarios.redefinirSenha(dadosConta(req.body));
  res.status(204).end();
});

router.use('/auth', conta);

router.post('/auth/sair', autenticar, async (req, res) => {
  await usuarios.encerrarSessao(tokenDe(req));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Coleção, loja e time
// ---------------------------------------------------------------------------

router.get('/eu', autenticar, async (req, res) => {
  res.json({ usuario: req.usuario, pokemons: await pokemons.listarColecao(req.usuario.id) });
});

router.post('/eu/inicial', autenticar, async (req, res) => {
  res.status(201).json(await usuarios.escolherInicial(req.usuario.id, inteiro(req.body.especieId, 'Pokémon')));
});

router.post('/loja/comprar', autenticar, async (req, res) => {
  res.status(201).json(await usuarios.comprarPokemonAleatorio(req.usuario.id));
});

router.put('/time', autenticar, async (req, res) => {
  if (!Array.isArray(req.body.pokemonIds)) throw new ErroJogo('Envie a lista pokemonIds.');
  await usuarios.definirTime(req.usuario.id, req.body.pokemonIds.map((id) => inteiro(id, 'Pokémon')));
  res.status(204).end();
});

router.post('/pokemons/:id/evoluir', autenticar, async (req, res) => {
  res.json(await pokemons.evoluir(
    req.usuario.id,
    inteiro(req.params.id, 'Pokémon'),
    inteiro(req.body.especieId, 'Espécie'),
  ));
});

router.get('/treinadores', autenticar, async (req, res) => {
  const busca = typeof req.query.busca === 'string' ? req.query.busca.trim().slice(0, LOGIN_MAXIMO) : '';
  res.json(busca ? await usuarios.buscarTreinadores(req.usuario.id, busca) : []);
});

// ---------------------------------------------------------------------------
// Batalhas
// ---------------------------------------------------------------------------

router.get('/batalhas', autenticar, async (req, res) => {
  res.json(await batalhas.listarBatalhas(req.usuario.id));
});

router.post('/batalhas', autenticar, async (req, res) => {
  res.status(201).json(await batalhas.desafiar(req.usuario.id, texto(req.body.oponente, 'o treinador')));
});

router.get('/batalhas/:id', autenticar, async (req, res) => {
  res.json(await batalhas.obterBatalha(req.usuario.id, inteiro(req.params.id, 'Batalha')));
});

router.post('/batalhas/:id/responder', autenticar, async (req, res) => {
  res.json(await batalhas.responderDesafio(
    req.usuario.id,
    inteiro(req.params.id, 'Batalha'),
    req.body.aceitar === true,
  ));
});

router.post('/batalhas/:id/jogadas', autenticar, async (req, res) => {
  const { tipo } = req.body;
  let acao;
  if (tipo === 'atacar' || tipo === 'desistir') acao = { tipo };
  else if (tipo === 'trocar') acao = { tipo, indice: Number(req.body.indice) };
  else throw new ErroJogo('Jogada inválida.');
  res.json(await batalhas.jogar(req.usuario.id, inteiro(req.params.id, 'Batalha'), acao));
});

// ---------------------------------------------------------------------------
// Erros (Express 5 já encaminha para cá os erros lançados nas funções async)
// ---------------------------------------------------------------------------

// eslint-disable-next-line no-unused-vars
router.use((erro, req, res, next) => {
  if (erro instanceof ErroJogo) {
    res.status(400).json({ erro: erro.message });
    return;
  }
  if (erro.type === 'entity.parse.failed') {
    res.status(400).json({ erro: 'JSON inválido.' });
    return;
  }
  console.error(erro);
  res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
});

module.exports = router;
