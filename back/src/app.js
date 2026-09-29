// App Express sem o listen, para os testes de integração poderem subir o servidor numa porta qualquer
const express = require('express');
const rotas = require('./rotas');

const POKEAPI_URL = 'https://pokeapi.co/api/v2';

// Aceita só "/recurso" ou "/recurso/id-ou-nome" (ex.: /pokemon, /type/fire)
const CAMINHO_VALIDO = /^\/[a-z0-9-]+(\/[a-z0-9-]+)?\/?$/i;
const PARAMETROS_PERMITIDOS = ['limit', 'offset'];

const app = express();

// O front roda em outra porta, então precisa de CORS. Como o login usa o
// cabeçalho Authorization (e não cookie), liberar qualquer origem é seguro.
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  if (req.method === 'OPTIONS') {
    res.sendStatus(204);
    return;
  }
  next();
});

// Repassa GET /api/pokeapi/<caminho> para https://pokeapi.co/api/v2/<caminho>
app.use('/api/pokeapi', async (req, res) => {
  if (req.method !== 'GET') {
    res.sendStatus(405);
    return;
  }
  if (!CAMINHO_VALIDO.test(req.path)) {
    res.status(400).json({ erro: 'Caminho inválido.' });
    return;
  }

  const url = new URL(`${POKEAPI_URL}${req.path}`);
  PARAMETROS_PERMITIDOS.forEach((parametro) => {
    if (req.query[parametro]) url.searchParams.set(parametro, String(req.query[parametro]));
  });

  try {
    const resposta = await fetch(url);
    const corpo = await resposta.text();
    res.status(resposta.status).type('application/json').send(corpo);
  } catch {
    res.status(502).json({ erro: 'Não foi possível acessar a PokeAPI.' });
  }
});

// Endpoints do jogo (precisam do banco)
app.use('/api', rotas);

module.exports = app;
