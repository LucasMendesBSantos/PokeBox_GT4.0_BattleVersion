const express = require('express');

const PORTA = process.env.PORT || 8080;
const POKEAPI_URL = 'https://pokeapi.co/api/v2';

// Aceita só "/recurso" ou "/recurso/id-ou-nome" (ex.: /pokemon, /type/fire)
const CAMINHO_VALIDO = /^\/[a-z0-9-]+(\/[a-z0-9-]+)?\/?$/i;
const PARAMETROS_PERMITIDOS = ['limit', 'offset'];

const app = express();

// O front roda em outra porta, então precisa de CORS
app.use((req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
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

app.listen(PORTA, () => {
  console.log(`Back do PokeBox rodando na porta ${PORTA}`);
});
