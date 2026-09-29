// Teste de ponta a ponta: sobe o app, chama os endpoints HTTP e confere o banco.
// Precisa de um PostgreSQL e de internet (PokeAPI). Só roda com DATABASE_URL_TESTE:
//   DATABASE_URL_TESTE=postgres://pokebox:pokebox@localhost:5432/pokebox_teste npm test
// ATENÇÃO: o banco é apagado e recriado a cada execução; o nome precisa terminar em "_teste".
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const URL_TESTE = process.env.DATABASE_URL_TESTE;
const pular = URL_TESTE ? false : 'defina DATABASE_URL_TESTE para rodar';

let base;
let servidor;
let pool;
let agendador;
const t = {}; // estado compartilhado entre os passos

async function api(metodo, caminho, { token, corpo } = {}) {
  const resposta = await fetch(`${base}/api${caminho}`, {
    method: metodo,
    headers: {
      ...(corpo ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: corpo ? JSON.stringify(corpo) : undefined,
  });
  const texto = await resposta.text();
  return { status: resposta.status, dados: texto ? JSON.parse(texto) : null };
}

/** Joga atacando até a batalha acabar (quem estiver na vez ataca) */
async function jogarAteOFim(batalhaId) {
  for (let i = 0; i < 1000; i += 1) {
    const { dados } = await api('GET', `/batalhas/${batalhaId}`, { token: t.ash.token });
    const { batalha } = dados;
    if (batalha.status === 'finalizada') return batalha;
    const token = batalha.minhaVez ? t.ash.token : t.gary.token;
    const r = await api('POST', `/batalhas/${batalhaId}/jogadas`, { token, corpo: { tipo: 'atacar' } });
    assert.equal(r.status, 200, JSON.stringify(r.dados));
  }
  throw new Error('A batalha não acabou');
}

async function criarBatalhaAceita() {
  const desafio = await api('POST', '/batalhas', { token: t.ash.token, corpo: { oponente: 'gary' } });
  assert.equal(desafio.status, 201, JSON.stringify(desafio.dados));
  const aceita = await api('POST', `/batalhas/${desafio.dados.id}/responder`, {
    token: t.gary.token, corpo: { aceitar: true },
  });
  assert.equal(aceita.status, 200, JSON.stringify(aceita.dados));
  return aceita.dados;
}

const saldo = async (token) => (await api('GET', '/eu', { token })).dados.usuario.pokecoins;

test('integração', { skip: pular, timeout: 10 * 60 * 1000 }, async (s) => {
  // --- Banco limpo -----------------------------------------------------------
  const { Client } = require('pg');
  const admin = new Client({ connectionString: URL_TESTE });
  await admin.connect();
  const { rows } = await admin.query('SELECT current_database() AS nome');
  assert.ok(rows[0].nome.endsWith('_teste'), 'o banco de teste precisa terminar em _teste');
  await admin.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await admin.query('DROP SEQUENCE IF EXISTS mint_numero_seq');
  await admin.query(fs.readFileSync(path.join(__dirname, '../../db/db.sql'), 'utf8'));
  await admin.end();

  process.env.DATABASE_URL = URL_TESTE;
  const app = require('../src/app');
  ({ pool } = require('../src/db'));
  agendador = require('../src/jogo/agendador');
  servidor = app.listen(0);
  base = `http://localhost:${servidor.address().port}`;

  s.after(async () => {
    servidor.close();
    await pool.end();
  });

  await s.test('cadastro e login', async () => {
    const conta = { login: 'Ash', celular: '11999999999', senha: 'pikachu123' };
    const cadastro = await api('POST', '/auth/cadastro', { corpo: conta });
    assert.equal(cadastro.status, 201);
    assert.equal(cadastro.dados.usuario.pokecoins, 400);
    t.ash = { token: cadastro.dados.token };

    const repetido = await api('POST', '/auth/cadastro', { corpo: { ...conta, login: 'ASH' } });
    assert.equal(repetido.status, 400, 'login não diferencia maiúsculas');

    const gary = await api('POST', '/auth/cadastro', { corpo: { login: 'gary', celular: '11888888888', senha: 'eevee1234' } });
    t.gary = { token: gary.dados.token };

    assert.equal((await api('POST', '/auth/login', { corpo: { login: 'ash', senha: 'errada123' } })).status, 400);
    assert.equal((await api('POST', '/auth/login', { corpo: { login: 'ash', senha: 'pikachu123' } })).status, 200);
    assert.equal((await api('GET', '/eu')).status, 401);
    assert.equal((await api('POST', '/auth/cadastro', { corpo: { ...conta, login: 'x', senha: '123' } })).status, 400);
  });

  await s.test('escolha do inicial', async () => {
    assert.equal((await api('POST', '/eu/inicial', { token: t.ash.token, corpo: { especieId: 25 } })).status, 400);
    const charmander = await api('POST', '/eu/inicial', { token: t.ash.token, corpo: { especieId: 4 } });
    assert.equal(charmander.status, 201);
    assert.equal(charmander.dados.nome, 'charmander');
    assert.equal(charmander.dados.posicaoTime, 1);
    assert.deepEqual(charmander.dados.evolucoes.map((e) => [e.especieId, e.nivel]), [[5, 16]]);
    t.charmander = charmander.dados;

    assert.equal((await api('POST', '/eu/inicial', { token: t.ash.token, corpo: { especieId: 7 } })).status, 400);
    assert.equal((await api('POST', '/eu/inicial', { token: t.gary.token, corpo: { especieId: 7 } })).status, 201);
  });

  await s.test('loja: 4 compras com 400 Pokécoins e o time se completa', async () => {
    // Ash compra 5 ao mesmo tempo: o débito atômico só deixa passar 4
    const compras = await Promise.all(
      [1, 2, 3, 4, 5].map(() => api('POST', '/loja/comprar', { token: t.ash.token })),
    );
    assert.deepEqual(compras.map((c) => c.status).sort(), [201, 201, 201, 201, 400]);
    assert.equal(await saldo(t.ash.token), 0);

    for (let i = 0; i < 4; i += 1) {
      assert.equal((await api('POST', '/loja/comprar', { token: t.gary.token })).status, 201);
    }

    const { dados } = await api('GET', '/eu', { token: t.ash.token });
    assert.equal(dados.pokemons.length, 5);
    assert.deepEqual(dados.pokemons.map((p) => p.posicaoTime).sort(), [1, 2, 3, 4, 5]);
    assert.equal(new Set(dados.pokemons.map((p) => p.mintNumero)).size, 5);
    for (const p of dados.pokemons) {
      assert.ok(Object.values(p.ivs).every((iv) => iv >= 0 && iv <= 31));
      assert.ok(['comum', 'lendario', 'mitico'].includes(p.raridade));
      assert.ok(p.status.hp > 0 && p.alturaM > 0 && p.pesoKg > 0);
    }
    t.ashPokemons = dados.pokemons;
  });

  await s.test('montar time', async () => {
    const ids = t.ashPokemons.map((p) => p.id).reverse();
    assert.equal((await api('PUT', '/time', { token: t.ash.token, corpo: { pokemonIds: ids } })).status, 204);
    const { dados } = await api('GET', '/eu', { token: t.ash.token });
    assert.deepEqual(dados.pokemons.map((p) => p.id), ids);

    assert.equal((await api('PUT', '/time', { token: t.ash.token, corpo: { pokemonIds: ids.slice(1) } })).status, 400);
    const doGary = (await api('GET', '/eu', { token: t.gary.token })).dados.pokemons[0].id;
    const comDoGary = [...ids.slice(1), doGary];
    assert.equal((await api('PUT', '/time', { token: t.ash.token, corpo: { pokemonIds: comDoGary } })).status, 400);
  });

  await s.test('desafio: validações', async () => {
    assert.equal((await api('POST', '/batalhas', { token: t.ash.token, corpo: { oponente: 'ash' } })).status, 400);
    assert.equal((await api('POST', '/batalhas', { token: t.ash.token, corpo: { oponente: 'ninguem' } })).status, 400);
    const desafio = await api('POST', '/batalhas', { token: t.ash.token, corpo: { oponente: 'GARY' } });
    assert.equal(desafio.status, 201);
    assert.equal(desafio.dados.status, 'aguardando');
    assert.equal((await api('POST', '/batalhas', { token: t.ash.token, corpo: { oponente: 'gary' } })).status, 400);
    // Só o desafiado responde
    const r = await api('POST', `/batalhas/${desafio.dados.id}/responder`, { token: t.ash.token, corpo: { aceitar: true } });
    assert.equal(r.status, 400);
    t.primeiroDesafio = desafio.dados.id;
  });

  await s.test('batalha completa por nocaute com recompensas', async () => {
    const aceita = await api('POST', `/batalhas/${t.primeiroDesafio}/responder`, {
      token: t.gary.token, corpo: { aceitar: true },
    });
    assert.equal(aceita.dados.status, 'em_andamento');
    assert.ok(new Date(aceita.dados.prazoEm) > new Date());

    // Fora da vez não joga
    const foraDaVez = aceita.dados.minhaVez ? t.ash.token : t.gary.token;
    assert.equal((await api('POST', `/batalhas/${t.primeiroDesafio}/jogadas`, { token: foraDaVez, corpo: { tipo: 'atacar' } })).status, 400);

    const fim = await jogarAteOFim(t.primeiroDesafio);
    assert.equal(fim.motivoFim, 'nocaute');

    const [vencedor, perdedor] = fim.venci ? [t.ash, t.gary] : [t.gary, t.ash];
    t.vencedorToken = vencedor.token;
    assert.equal(await saldo(vencedor.token), 40);
    assert.equal(await saldo(perdedor.token), 10);

    // XP: 150 no nível 1 (precisa de 100) -> nível 2 com 50; 50 no nível 1 -> continua no 1 com 50
    const cardsVencedor = (await api('GET', '/eu', { token: vencedor.token })).dados.pokemons;
    assert.ok(cardsVencedor.every((p) => p.nivel === 2 && p.xp === 50));
    const cardsPerdedor = (await api('GET', '/eu', { token: perdedor.token })).dados.pokemons;
    assert.ok(cardsPerdedor.every((p) => p.nivel === 1 && p.xp === 50));

    const { dados } = await api('GET', `/batalhas/${t.primeiroDesafio}`, { token: vencedor.token });
    assert.equal(dados.batalha.minhasRecompensas.pokecoins, 40);
    assert.equal(dados.batalha.minhasRecompensas.subiram.length, 5);
    assert.ok(dados.acoes.length >= 10);

    // Batalha acabada não aceita jogada
    assert.equal((await api('POST', `/batalhas/${t.primeiroDesafio}/jogadas`, { token: vencedor.token, corpo: { tipo: 'atacar' } })).status, 400);
  });

  await s.test('prazo de 4h: 2 timeouts seguidos dão W.O., sem recompensa', async () => {
    const saldos = [await saldo(t.ash.token), await saldo(t.gary.token)];
    const batalha = await criarBatalhaAceita();
    const vencer = async () => {
      await pool.query("UPDATE batalhas SET prazo_em = now() - interval '1 minute' WHERE id = $1", [batalha.id]);
      await agendador.rodarUmaVez();
    };

    const vezDoAshAntes = !batalha.minhaVez; // batalha veio da visão do Gary

    await vencer(); // 1º timeout de quem começou: a vez passa
    let { dados } = await api('GET', `/batalhas/${batalha.id}`, { token: t.ash.token });
    assert.equal(dados.batalha.status, 'em_andamento');
    assert.equal(dados.batalha.minhaVez, !vezDoAshAntes);
    assert.equal(dados.acoes[0].automatica, true);

    // O outro joga de verdade, e quem começou perde o prazo de novo
    const tokenOutro = dados.batalha.minhaVez ? t.ash.token : t.gary.token;
    await api('POST', `/batalhas/${batalha.id}/jogadas`, { token: tokenOutro, corpo: { tipo: 'atacar' } });
    await vencer();

    ({ dados } = await api('GET', `/batalhas/${batalha.id}`, { token: t.ash.token }));
    assert.equal(dados.batalha.status, 'finalizada');
    assert.equal(dados.batalha.motivoFim, 'wo');
    assert.match(dados.batalha.minhasRecompensas.semRecompensa, /abandona|cedo demais/);
    assert.deepEqual([await saldo(t.ash.token), await saldo(t.gary.token)], saldos);
  });

  await s.test('prazo vencido é resolvido ao abrir a batalha, mesmo sem o agendador', async () => {
    const batalha = await criarBatalhaAceita();
    await pool.query("UPDATE batalhas SET prazo_em = now() - interval '1 minute' WHERE id = $1", [batalha.id]);
    const { dados } = await api('GET', `/batalhas/${batalha.id}`, { token: t.ash.token });
    assert.equal(dados.acoes.length, 1);
    assert.equal(dados.acoes[0].tipo, 'passar');
    // Encerra para não atrapalhar os próximos passos
    await api('POST', `/batalhas/${batalha.id}/jogadas`, { token: t.ash.token, corpo: { tipo: 'desistir' } });
  });

  await s.test('desafio expira em 24h', async () => {
    const desafio = await api('POST', '/batalhas', { token: t.ash.token, corpo: { oponente: 'gary' } });
    await pool.query("UPDATE batalhas SET expira_em = now() - interval '1 minute' WHERE id = $1", [desafio.dados.id]);
    const r = await api('POST', `/batalhas/${desafio.dados.id}/responder`, { token: t.gary.token, corpo: { aceitar: true } });
    assert.equal(r.status, 400);
    assert.match(r.dados.erro, /expirou/);
  });

  await s.test('evolução no nível real da PokeAPI mantém mint, shiny e IVs', async () => {
    const id = t.charmander.id;
    await pool.query('UPDATE pokemons SET nivel = 15 WHERE id = $1', [id]);
    const cedo = await api('POST', `/pokemons/${id}/evoluir`, { token: t.ash.token, corpo: { especieId: 5 } });
    assert.equal(cedo.status, 400);
    assert.match(cedo.dados.erro, /nível 16/);

    await pool.query('UPDATE pokemons SET nivel = 16 WHERE id = $1', [id]);
    const { dados: antes } = await api('GET', '/eu', { token: t.ash.token });
    const card = antes.pokemons.find((p) => p.id === id);
    const evoluiu = await api('POST', `/pokemons/${id}/evoluir`, { token: t.ash.token, corpo: { especieId: 5 } });
    assert.equal(evoluiu.status, 200);
    assert.equal(evoluiu.dados.nome, 'charmeleon');
    assert.equal(evoluiu.dados.mintNumero, card.mintNumero);
    assert.equal(evoluiu.dados.shiny, card.shiny);
    assert.deepEqual(evoluiu.dados.ivs, card.ivs);
    assert.equal(evoluiu.dados.nivel, 16);
    assert.ok(evoluiu.dados.status.ataque > card.status.ataque);
    assert.deepEqual(evoluiu.dados.evolucoes.map((e) => [e.especieId, e.nivel]), [[6, 36]]);

    const charizard = await api('POST', `/pokemons/${id}/evoluir`, { token: t.ash.token, corpo: { especieId: 6 } });
    assert.equal(charizard.status, 400);
    assert.match(charizard.dados.erro, /nível 36/);
  });

  await s.test('anti-farm: no máximo 3 batalhas premiadas contra o mesmo treinador em 24h', async () => {
    // A primeira batalha já foi premiada; mais 2 ainda dão recompensa, a 4ª não
    for (let i = 0; i < 2; i += 1) {
      const b = await criarBatalhaAceita();
      const fim = await jogarAteOFim(b.id);
      assert.equal(fim.minhasRecompensas.semRecompensa, null);
    }
    const b = await criarBatalhaAceita();
    const fim = await jogarAteOFim(b.id);
    assert.equal(fim.minhasRecompensas.pokecoins, 0);
    assert.match(fim.minhasRecompensas.semRecompensa, /mesmo treinador/);
  });

  await s.test('lista de batalhas', async () => {
    const { dados } = await api('GET', '/batalhas', { token: t.gary.token });
    assert.ok(dados.length >= 7);
    assert.ok(dados.every((b) => b.oponente === 'Ash'));
  });

  await s.test('sair e redefinir senha derrubam a sessão', async () => {
    const outra = (await api('POST', '/auth/login', { corpo: { login: 'gary', senha: 'eevee1234' } })).dados.token;
    assert.equal((await api('POST', '/auth/sair', { token: outra })).status, 204);
    assert.equal((await api('GET', '/eu', { token: outra })).status, 401);

    const verificar = await api('POST', '/auth/verificar', { corpo: { login: 'gary', celular: '11888888888' } });
    assert.equal(verificar.dados.encontrado, true);
    const redefinir = await api('POST', '/auth/redefinir-senha', {
      corpo: { login: 'gary', celular: '11888888888', senha: 'novasenha1' },
    });
    assert.equal(redefinir.status, 204);
    assert.equal((await api('GET', '/eu', { token: t.gary.token })).status, 401);
    assert.equal((await api('POST', '/auth/login', { corpo: { login: 'gary', senha: 'novasenha1' } })).status, 200);
  });
});
