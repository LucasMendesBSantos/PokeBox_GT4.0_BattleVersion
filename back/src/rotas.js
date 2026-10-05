// Endpoints do jogo. Todos respondem JSON; erros de regra voltam como 400 { erro: "mensagem" }.
const express = require('express');
const usuarios = require('./jogo/usuarios');
const pokemons = require('./jogo/pokemons');
const batalhas = require('./jogo/batalhas');
const vitrines = require('./jogo/vitrines');
const trocas = require('./jogo/trocas');
const config = require('./jogo/config');
const { ErroJogo } = require('./jogo/erros');

const LOGIN_MAXIMO = 20;
const SENHA_MINIMA = 8;
const CELULAR = /^\d{11}$/;

// Códigos de erro do Node/PostgreSQL que significam "não deu para usar o banco"
const ERROS_BANCO = new Set([
  'ECONNREFUSED', 'ENOTFOUND', 'ETIMEDOUT', // servidor não responde
  '28P01', '28000', // usuário/senha recusados
  '3D000', // banco não existe
  '42P01', // tabela não existe (db.sql não foi rodado)
]);

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
  res.status(201).json(await usuarios.comprarPokemonAleatorio(req.usuario.id, inteiro(req.body.geracao, 'Geração')));
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

router.post('/pokemons/:id/cuidar', autenticar, async (req, res) => {
  const { tipo } = req.body;
  if (!Object.hasOwn(config.CUIDADOS, tipo)) throw new ErroJogo('Cuidado inválido.');
  res.json(await pokemons.cuidar(req.usuario.id, inteiro(req.params.id, 'Pokémon'), tipo));
});

router.get('/pokemons/:id/cuidados', autenticar, async (req, res) => {
  res.json(await pokemons.listarCuidados(req.usuario.id, inteiro(req.params.id, 'Pokémon')));
});

// ---------------------------------------------------------------------------
// Trocas
// ---------------------------------------------------------------------------

const opcao = (valor, opcoes, padrao) => (Object.hasOwn(opcoes, valor) ? valor : padrao);

router.get('/mercado', autenticar, async (req, res) => {
  const busca = typeof req.query.busca === 'string' ? req.query.busca.trim().slice(0, 40) : '';
  res.json(await trocas.listarMercado(busca, opcao(req.query.ordem, trocas.ORDENS_MERCADO, 'popularidade')));
});

router.get('/mercado/:especieId', autenticar, async (req, res) => {
  res.json(await trocas.listarAnunciosDaEspecie(
    req.usuario.id,
    inteiro(req.params.especieId, 'Espécie'),
    opcao(req.query.ordem, trocas.ORDENS_ANUNCIOS, 'preco'),
  ));
});

router.get('/anuncios/meus', autenticar, async (req, res) => {
  res.json(await trocas.listarMeusAnuncios(req.usuario.id));
});

router.post('/anuncios', autenticar, async (req, res) => {
  const { preco = null, aceitaPropostas = false } = req.body;
  res.status(201).json(await trocas.criarAnuncio(req.usuario.id, {
    pokemonId: inteiro(req.body.pokemonId, 'Pokémon'),
    preco: preco === null ? null : Number(preco),
    aceitaPropostas: aceitaPropostas === true,
  }));
});

router.delete('/anuncios/:id', autenticar, async (req, res) => {
  await trocas.cancelarAnuncio(req.usuario.id, inteiro(req.params.id, 'Anúncio'));
  res.status(204).end();
});

router.post('/anuncios/:id/comprar', autenticar, async (req, res) => {
  res.json(await trocas.comprar(req.usuario.id, inteiro(req.params.id, 'Anúncio')));
});

router.post('/anuncios/:id/propostas', autenticar, async (req, res) => {
  const { pokemonIds = [], pokecoins = 0 } = req.body;
  if (!Array.isArray(pokemonIds)) throw new ErroJogo('Envie a lista pokemonIds.');
  res.status(201).json(await trocas.proporTroca(req.usuario.id, inteiro(req.params.id, 'Anúncio'), {
    pokemonIds: pokemonIds.map((id) => inteiro(id, 'Pokémon')),
    pokecoins: Number(pokecoins),
  }));
});

router.get('/propostas', autenticar, async (req, res) => {
  res.json(await trocas.listarPropostas(req.usuario.id));
});

router.post('/propostas/:id/aceitar', autenticar, async (req, res) => {
  await trocas.aceitarProposta(req.usuario.id, inteiro(req.params.id, 'Proposta'));
  res.status(204).end();
});

router.post('/propostas/:id/recusar', autenticar, async (req, res) => {
  await trocas.recusarProposta(req.usuario.id, inteiro(req.params.id, 'Proposta'));
  res.status(204).end();
});

router.delete('/propostas/:id', autenticar, async (req, res) => {
  await trocas.cancelarProposta(req.usuario.id, inteiro(req.params.id, 'Proposta'));
  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Vitrine
// ---------------------------------------------------------------------------

router.get('/vitrines', autenticar, async (req, res) => {
  const busca = typeof req.query.busca === 'string' ? req.query.busca.trim().slice(0, LOGIN_MAXIMO) : '';
  res.json(await vitrines.listarVitrines(req.usuario.id, busca));
});

router.get('/vitrines/:login', autenticar, async (req, res) => {
  res.json(await vitrines.obterVitrine(req.usuario.id, texto(req.params.login, 'o treinador').slice(0, LOGIN_MAXIMO)));
});

router.put('/vitrine', autenticar, async (req, res) => {
  const { bio = '', estilo, pokemonIds } = req.body;
  if (typeof bio !== 'string') throw new ErroJogo('Apresentação inválida.');
  if (!Array.isArray(pokemonIds)) throw new ErroJogo('Envie a lista pokemonIds.');
  await vitrines.salvarVitrine(req.usuario.id, {
    bio: bio.trim(),
    estilo,
    pokemonIds: pokemonIds.map((id) => inteiro(id, 'Pokémon')),
  });
  res.status(204).end();
});

router.get('/treinadores', autenticar, async (req, res) => {
  const busca = typeof req.query.busca === 'string' ? req.query.busca.trim().slice(0, LOGIN_MAXIMO) : '';
  res.json(busca ? await usuarios.buscarTreinadores(req.usuario.id, busca) : []);
});

// Quem entrou no jogo nas últimas 24h e pode ser desafiado (time completo)
router.get('/treinadores/ativos', autenticar, async (req, res) => {
  res.json(await usuarios.listarTreinadoresAtivos(req.usuario.id));
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
  // Banco fora do ar, DATABASE_URL faltando/errada ou db.sql não aplicado
  if (ERROS_BANCO.has(erro.code)) {
    // ECONNREFUSED chega como AggregateError, com a mensagem vazia
    console.error(`Banco de dados indisponível (${erro.code}${erro.message ? `: ${erro.message}` : ''}). `
      + 'Confira o DATABASE_URL em back/.env e se o banco está rodando (docker compose up -d db).');
    res.status(503).json({ erro: 'O banco de dados está fora do ar. Tente de novo em instantes.' });
    return;
  }
  console.error(erro);
  res.status(500).json({ erro: 'Erro interno. Tente novamente.' });
});

module.exports = router;
