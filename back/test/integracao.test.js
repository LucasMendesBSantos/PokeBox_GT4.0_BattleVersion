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
    assert.equal(cadastro.dados.usuario.pokecoins, 600);
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

  await s.test('loja: 2 compras com 200 Pokécoins e o time se completa', async () => {
    // Saldo para exatamente 2 compras: o inicial + 2 fecham o time de 3
    await pool.query("UPDATE usuarios SET pokecoins = 200 WHERE lower(login) IN ('ash', 'gary')");
    // Geração inexistente ou ausente: recusa sem cobrar
    for (const corpo of [{ geracao: 10 }, { geracao: 0 }, {}]) {
      assert.equal((await api('POST', '/loja/comprar', { token: t.ash.token, corpo })).status, 400);
    }
    assert.equal(await saldo(t.ash.token), 200);

    // Ash compra 3 ao mesmo tempo na loja 1: o débito atômico só deixa passar 2
    const compras = await Promise.all(
      [1, 2, 3].map(() => api('POST', '/loja/comprar', { token: t.ash.token, corpo: { geracao: 1 } })),
    );
    assert.deepEqual(compras.map((c) => c.status).sort(), [201, 201, 400]);
    assert.equal(await saldo(t.ash.token), 0);
    for (const c of compras.filter((x) => x.status === 201)) {
      assert.ok(c.dados.pokemon.especieId >= 1 && c.dados.pokemon.especieId <= 151, 'loja 1 só sorteia Kanto');
    }

    // Gary compra na loja 9 (Paldea)
    for (let i = 0; i < 2; i += 1) {
      const compra = await api('POST', '/loja/comprar', { token: t.gary.token, corpo: { geracao: 9 } });
      assert.equal(compra.status, 201);
      assert.ok(compra.dados.pokemon.especieId >= 906 && compra.dados.pokemon.especieId <= 1025, 'loja 9 só sorteia Paldea');
    }

    const { dados } = await api('GET', '/eu', { token: t.ash.token });
    assert.equal(dados.pokemons.length, 3);
    assert.deepEqual(dados.pokemons.map((p) => p.posicaoTime).sort(), [1, 2, 3]);
    assert.equal(new Set(dados.pokemons.map((p) => p.mintNumero)).size, 3);
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

  await s.test('cuidados: afeto sobe e cada cuidado tem espera', async () => {
    const id = t.charmander.id;
    const carinho = await api('POST', `/pokemons/${id}/cuidar`, { token: t.ash.token, corpo: { tipo: 'carinho' } });
    assert.equal(carinho.status, 200, JSON.stringify(carinho.dados));
    assert.equal(carinho.dados.ganho, 10);
    assert.equal(carinho.dados.pokemon.afeto.pontos, 10);
    assert.ok(new Date(carinho.dados.pokemon.cuidadosDisponiveisEm.carinho) > new Date());
    assert.equal(carinho.dados.pokemon.cuidadosDisponiveisEm.brincar, null);
    assert.equal(carinho.dados.pokemon.humor, 65);
    assert.equal(carinho.dados.pokemon.energia, 50);

    // Dois cliques seguidos: o segundo esbarra na espera
    const repetido = await api('POST', `/pokemons/${id}/cuidar`, { token: t.ash.token, corpo: { tipo: 'carinho' } });
    assert.equal(repetido.status, 400);
    const brincar = await api('POST', `/pokemons/${id}/cuidar`, { token: t.ash.token, corpo: { tipo: 'brincar' } });
    assert.equal(brincar.status, 200);
    assert.deepEqual([brincar.dados.pokemon.humor, brincar.dados.pokemon.energia], [90, 25]);
    assert.equal((await api('POST', `/pokemons/${id}/cuidar`, { token: t.ash.token, corpo: { tipo: 'dormir' } })).status, 400);
    assert.equal((await api('POST', `/pokemons/${id}/cuidar`, { token: t.gary.token, corpo: { tipo: 'alimentar' } })).status, 400);

    const historico = await api('GET', `/pokemons/${id}/cuidados`, { token: t.ash.token });
    assert.deepEqual(historico.dados.map((c) => c.tipo), ['brincar', 'carinho']);
    assert.deepEqual((await api('GET', `/pokemons/${id}/cuidados`, { token: t.gary.token })).dados, []);

    const { dados } = await api('GET', '/eu', { token: t.ash.token });
    assert.equal(dados.pokemons.find((p) => p.id === id).afeto.pontos, 30);
  });

  await s.test('vitrine: destaques, visitas e álbum', async () => {
    // Sem destaques escolhidos, a vitrine mostra o time
    let { dados } = await api('GET', '/vitrines/ash', { token: t.ash.token });
    assert.equal(dados.souDono, true);
    assert.equal(dados.destaques.length, 3);
    assert.equal(dados.estatisticas.pokemons, 3);
    assert.ok(dados.colecao.length >= 1);

    const ids = t.ashPokemons.map((p) => p.id).slice(0, 2);
    const salvar = await api('PUT', '/vitrine', {
      token: t.ash.token, corpo: { bio: 'Fã de tipo fogo', estilo: 'album', pokemonIds: ids },
    });
    assert.equal(salvar.status, 204);

    // Gary visita: conta a visita e não vê IVs
    ({ dados } = await api('GET', '/vitrines/ASH', { token: t.gary.token }));
    assert.equal(dados.souDono, false);
    assert.equal(dados.bio, 'Fã de tipo fogo');
    assert.equal(dados.estilo, 'album');
    assert.equal(dados.visitas, 1);
    assert.deepEqual(dados.destaques.map((p) => p.id), ids);
    assert.equal(dados.destaques[0].ivs, undefined);

    const lista = await api('GET', '/vitrines', { token: t.gary.token });
    assert.deepEqual(lista.dados.map((v) => v.login), ['Ash']);

    const doGary = (await api('GET', '/eu', { token: t.gary.token })).dados.pokemons[0].id;
    assert.equal((await api('PUT', '/vitrine', { token: t.ash.token, corpo: { estilo: 'palco', pokemonIds: [doGary] } })).status, 400);
    assert.equal((await api('PUT', '/vitrine', { token: t.ash.token, corpo: { estilo: 'neon', pokemonIds: [] } })).status, 400);
    assert.equal((await api('GET', '/vitrines/ninguem', { token: t.ash.token })).status, 400);
  });

  await s.test('treinadores ativos nas últimas 24h', async () => {
    // Sem time completo não aparece
    await api('POST', '/auth/cadastro', { corpo: { login: 'misty', celular: '11777777777', senha: 'agua12345' } });

    let { dados } = await api('GET', '/treinadores/ativos', { token: t.gary.token });
    assert.deepEqual(dados.map((d) => d.login), ['Ash']);
    assert.equal(dados[0].time.length, 3);
    assert.equal(dados[0].nivelMedio, 1);
    assert.equal(dados[0].desafioEnviado, false);

    // Quem não entra há mais de 24h some da lista
    await pool.query("UPDATE usuarios SET ultimo_acesso_em = now() - interval '25 hours' WHERE login = 'Ash'");
    ({ dados } = await api('GET', '/treinadores/ativos', { token: t.gary.token }));
    assert.deepEqual(dados, []);

    // ...e volta assim que usa o jogo de novo
    await api('GET', '/eu', { token: t.ash.token });
    ({ dados } = await api('GET', '/treinadores/ativos', { token: t.gary.token }));
    assert.deepEqual(dados.map((d) => d.login), ['Ash']);
  });

  await s.test('desafio: validações', async () => {
    assert.equal((await api('POST', '/batalhas', { token: t.ash.token, corpo: { oponente: 'ash' } })).status, 400);
    assert.equal((await api('POST', '/batalhas', { token: t.ash.token, corpo: { oponente: 'ninguem' } })).status, 400);
    const desafio = await api('POST', '/batalhas', { token: t.ash.token, corpo: { oponente: 'GARY' } });
    assert.equal(desafio.status, 201);
    assert.equal(desafio.dados.status, 'aguardando');
    assert.equal((await api('POST', '/batalhas', { token: t.ash.token, corpo: { oponente: 'gary' } })).status, 400);
    // A lista de ativos avisa dos dois lados que há um desafio pendente
    const doAsh = (await api('GET', '/treinadores/ativos', { token: t.ash.token })).dados;
    assert.equal(doAsh.find((d) => d.login === 'gary').desafioEnviado, true);
    const doGary = (await api('GET', '/treinadores/ativos', { token: t.gary.token })).dados;
    assert.equal(doGary.find((d) => d.login === 'Ash').desafioRecebido, true);
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
    assert.equal(dados.batalha.minhasRecompensas.subiram.length, 3);
    assert.ok(dados.acoes.length >= 6);

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
    // Pontos extras sorteados: o que esta evolução deu fica no card e entra nos status
    const { bonusGanho } = evoluiu.dados;
    assert.ok(Object.values(bonusGanho).every((v) => v >= 0 && v <= 5));
    assert.deepEqual(evoluiu.dados.bonusEvolucao, bonusGanho);
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

  await s.test('trocas: anúncio, compra direta e proposta', async () => {
    const ash = { token: t.ash.token };
    const gary = { token: t.gary.token };
    // Pokémon fora do time para trocar: cada um compra mais 2 na loja (o time já está cheio)
    await pool.query("UPDATE usuarios SET pokecoins = 1000 WHERE lower(login) IN ('ash', 'gary')");
    const comprarDois = async (token) => {
      const ids = [];
      for (let i = 0; i < 2; i += 1) ids.push((await api('POST', '/loja/comprar', { token, corpo: { geracao: 2 } })).dados.pokemon.id);
      return ids;
    };
    const [a1, a2] = await comprarDois(ash.token);
    const [g1, g2] = await comprarDois(gary.token);
    const timeDoAsh = (await api('GET', '/eu', ash)).dados.pokemons.filter((p) => p.posicaoTime).map((p) => p.id);

    // Validações do anúncio
    assert.equal((await api('POST', '/anuncios', { ...ash, corpo: { pokemonId: timeDoAsh[0], preco: 10 } })).status, 400);
    assert.equal((await api('POST', '/anuncios', { ...ash, corpo: { pokemonId: a1 } })).status, 400);
    assert.equal((await api('POST', '/anuncios', { ...ash, corpo: { pokemonId: g1, preco: 10 } })).status, 400);
    const anuncio = await api('POST', '/anuncios', { ...ash, corpo: { pokemonId: a1, preco: 50, aceitaPropostas: true } });
    assert.equal(anuncio.status, 201, JSON.stringify(anuncio.dados));
    assert.equal((await api('POST', '/anuncios', { ...ash, corpo: { pokemonId: a1, preco: 60 } })).status, 400);

    // Anunciado não entra no time
    const time = await api('PUT', '/time', { ...ash, corpo: { pokemonIds: [...timeDoAsh.slice(1), a1] } });
    assert.equal(time.status, 400);
    assert.match(time.dados.erro, /anunciado/);

    // Mercado: espécie agrupada e o anúncio com o login de quem vende
    const { especieId } = anuncio.dados.pokemon;
    const mercado = (await api('GET', '/mercado', gary)).dados;
    assert.ok(mercado.find((m) => m.especieId === especieId).anuncios >= 1);
    const lista = (await api('GET', `/mercado/${especieId}`, gary)).dados;
    const doAsh = lista.find((a) => a.id === anuncio.dados.id);
    assert.equal(doAsh.vendedor, 'Ash');
    assert.equal(doAsh.meu, false);
    assert.equal(doAsh.preco, 50);

    // Compra direta
    assert.equal((await api('POST', `/anuncios/${anuncio.dados.id}/comprar`, ash)).status, 400);
    const compra = await api('POST', `/anuncios/${anuncio.dados.id}/comprar`, gary);
    assert.equal(compra.status, 200, JSON.stringify(compra.dados));
    assert.equal(compra.dados.id, a1);
    assert.equal(compra.dados.afeto.pontos, 0);
    assert.equal(await saldo(ash.token), 1000 - 200 + 50);
    assert.equal(await saldo(gary.token), 1000 - 200 - 50);
    assert.ok((await api('GET', '/eu', gary)).dados.pokemons.some((p) => p.id === a1));
    assert.equal((await api('POST', `/anuncios/${anuncio.dados.id}/comprar`, gary)).status, 400);

    // Proposta: Gary anuncia só para propostas, Ash oferece um Pokémon + 10 Pokécoins
    const deGary = (await api('POST', '/anuncios', { ...gary, corpo: { pokemonId: g1, aceitaPropostas: true } })).dados;
    assert.equal((await api('POST', `/anuncios/${deGary.id}/comprar`, ash)).status, 400);
    const proposta = await api('POST', `/anuncios/${deGary.id}/propostas`, { ...ash, corpo: { pokemonIds: [a2], pokecoins: 10 } });
    assert.equal(proposta.status, 201, JSON.stringify(proposta.dados));
    assert.equal((await api('POST', `/anuncios/${deGary.id}/propostas`, { ...ash, corpo: { pokecoins: 5 } })).status, 400);
    assert.equal((await api('POST', `/anuncios/${deGary.id}/propostas`, { ...ash, corpo: { pokemonIds: [g2] } })).status, 400);

    const { recebidas } = (await api('GET', '/propostas', gary)).dados;
    assert.equal(recebidas[0].alvo.id, g1);
    assert.deepEqual(recebidas[0].oferta.map((p) => p.id), [a2]);
    assert.equal(recebidas[0].pokecoins, 10);
    assert.equal(recebidas[0].proponente, 'Ash');

    const saldos = [await saldo(ash.token), await saldo(gary.token)];
    assert.equal((await api('POST', `/propostas/${proposta.dados.id}/aceitar`, ash)).status, 400);
    assert.equal((await api('POST', `/propostas/${proposta.dados.id}/aceitar`, gary)).status, 204);
    assert.ok((await api('GET', '/eu', ash)).dados.pokemons.some((p) => p.id === g1));
    assert.ok((await api('GET', '/eu', gary)).dados.pokemons.some((p) => p.id === a2));
    assert.deepEqual([await saldo(ash.token), await saldo(gary.token)], [saldos[0] - 10, saldos[1] + 10]);
    assert.equal((await api('GET', '/propostas', ash)).dados.enviadas[0].status, 'aceita');

    // Recusar
    const outro = (await api('POST', '/anuncios', { ...gary, corpo: { pokemonId: g2, aceitaPropostas: true } })).dados;
    const pedido = (await api('POST', `/anuncios/${outro.id}/propostas`, { ...ash, corpo: { pokecoins: 5 } })).dados;
    assert.equal((await api('POST', `/propostas/${pedido.id}/recusar`, gary)).status, 204);
    assert.equal((await api('GET', '/propostas', ash)).dados.enviadas[0].status, 'recusada');
    assert.equal((await api('DELETE', `/anuncios/${outro.id}`, gary)).status, 204);
    assert.equal((await api('GET', '/anuncios/meus', gary)).dados.length, 0);
  });

  await s.test('história: pokébolas, explorar, batalhar, capturar e fugir', async () => {
    const ash = { token: t.ash.token };
    const inicio = (await api('GET', '/historia', ash)).dados;
    assert.deepEqual(inicio.proximo, { trilha: 1, ponto: 1, forca: 0.1 });
    assert.equal(inicio.encontros.length, 0);

    // Pokébolas
    await pool.query("UPDATE usuarios SET pokecoins = 1000 WHERE lower(login) = 'ash'");
    assert.equal((await api('POST', '/loja/pokebolas', { ...ash, corpo: { quantidade: 0 } })).status, 400);
    const compra = await api('POST', '/loja/pokebolas', { ...ash, corpo: { quantidade: 3 } });
    assert.equal(compra.status, 201, JSON.stringify(compra.dados));
    assert.deepEqual(compra.dados, { saldo: 970, pokebolas: 3 });
    assert.equal((await api('GET', '/eu', ash)).dados.usuario.pokebolas, 3);

    // Explorar sorteia o selvagem do ponto 1 e repetir devolve o mesmo
    const encontro = (await api('POST', '/historia/explorar', ash)).dados;
    assert.equal(encontro.trilha, 1);
    assert.equal(encontro.ponto, 1);
    assert.equal(encontro.forca, 0.1);
    assert.equal(encontro.nivel, 5);
    assert.equal(encontro.situacao, 'encontrado');
    assert.equal((await api('POST', '/historia/explorar', ash)).dados.id, encontro.id);
    assert.equal((await api('POST', `/historia/encontros/${encontro.id}/capturar`, ash)).status, 400);
    assert.equal((await api('POST', `/historia/encontros/${encontro.id}/batalha`, { token: t.gary.token })).status, 400);

    // Batalha: o time forte vence o 0,1x atacando
    await pool.query("UPDATE pokemons SET nivel = 60, xp = 0 WHERE dono_id = (SELECT id FROM usuarios WHERE lower(login) = 'ash')");
    let resposta = (await api('POST', `/historia/encontros/${encontro.id}/batalha`, ash)).dados;
    for (let i = 0; i < 100 && !resposta.batalha.fim; i += 1) {
      const r = await api('POST', `/historia/encontros/${encontro.id}/jogadas`, { ...ash, corpo: { tipo: 'atacar' } });
      assert.equal(r.status, 200, JSON.stringify(r.dados));
      resposta = r.dados;
    }
    assert.equal(resposta.batalha.fim.vencedor, 0);
    assert.deepEqual(
      { pokecoins: resposta.batalha.recompensa.pokecoins, xp: resposta.batalha.recompensa.xp },
      { pokecoins: 10, xp: 100 },
    );
    assert.equal(resposta.encontro.situacao, 'vencido');
    assert.equal(resposta.encontro.batalha, null);
    // XP para os 3 do time, mesmo os que não entraram em campo
    const { rows: xpDoTime } = await pool.query(
      `SELECT xp FROM pokemons
        WHERE dono_id = (SELECT id FROM usuarios WHERE lower(login) = 'ash') AND posicao_time IS NOT NULL`,
    );
    assert.deepEqual(xpDoTime.map((p) => p.xp), [100, 100, 100]);
    assert.equal(await saldo(ash.token), 980);
    assert.equal((await api('POST', `/historia/encontros/${encontro.id}/jogadas`, { ...ash, corpo: { tipo: 'atacar' } })).status, 400);
    assert.deepEqual((await api('GET', '/historia', ash)).dados.proximo, { trilha: 1, ponto: 2, forca: 0.2 });

    // Refazer só depois de capturar ou de o Pokémon fugir
    const refazer = (ponto) => api('POST', `/historia/trilhas/1/pontos/${ponto}/refazer`, ash);
    assert.match((await refazer(1)).dados.erro, /restam 10 tentativas/);
    assert.equal((await refazer(2)).status, 400);

    // Captura (10% a 50% pela espécie, até 10 tentativas): ou captura, ou ele foge na 10ª
    const chance = (await api('GET', '/historia', ash)).dados.encontros.find((e) => e.id === encontro.id).chanceCaptura;
    assert.ok(chance >= 0.1 && chance <= 0.5, `chance ${chance}`);
    await pool.query("UPDATE usuarios SET pokebolas = 50 WHERE lower(login) = 'ash'");
    let captura;
    for (let i = 0; i < 10; i += 1) {
      captura = (await api('POST', `/historia/encontros/${encontro.id}/capturar`, ash)).dados;
      if (captura.capturou || captura.fugiu) break;
    }
    assert.equal(captura.encontro.tentativasCaptura, 50 - captura.pokebolas);
    if (captura.capturou) {
      // O card mantém nível, shiny e IVs do selvagem
      assert.equal(captura.encontro.situacao, 'capturado');
      assert.equal(captura.pokemon.especieId, encontro.especieId);
      assert.equal(captura.pokemon.nivel, encontro.nivel);
      assert.equal(captura.pokemon.shiny, encontro.shiny);
      const { rows: [card] } = await pool.query('SELECT origem FROM pokemons WHERE id = $1', [captura.pokemon.id]);
      assert.equal(card.origem, 'captura');
    } else {
      assert.equal(captura.fugiu, true);
      assert.equal(captura.encontro.situacao, 'fugiu');
      assert.equal(captura.encontro.tentativasCaptura, 10);
    }
    assert.equal((await api('POST', `/historia/encontros/${encontro.id}/capturar`, ash)).status, 400);

    // Fugir na primeira vez: o mesmo Pokémon continua no ponto 2 e não paga nada
    const segundo = (await api('POST', '/historia/explorar', ash)).dados;
    assert.equal(segundo.ponto, 2);
    await api('POST', `/historia/encontros/${segundo.id}/batalha`, ash);
    const fuga = (await api('POST', `/historia/encontros/${segundo.id}/jogadas`, { ...ash, corpo: { tipo: 'desistir' } })).dados;
    assert.equal(fuga.batalha.fim.vencedor, 1);
    assert.equal(fuga.encontro.situacao, 'encontrado');
    assert.equal(fuga.encontro.batalha, null);
    assert.equal(await saldo(ash.token), 980);
    assert.equal((await api('POST', '/historia/explorar', ash)).dados.id, segundo.id);

    // Revanche: novo Pokémon aleatório, custa 25, paga a recompensa de novo e não mexe na trilha
    await pool.query("UPDATE usuarios SET pokecoins = 20 WHERE lower(login) = 'ash'");
    const semSaldo = await refazer(1);
    assert.equal(semSaldo.status, 400);
    assert.match(semSaldo.dados.erro, /25 Pokécoins/);
    await pool.query("UPDATE usuarios SET pokecoins = 100 WHERE lower(login) = 'ash'");
    let revanche = (await refazer(1)).dados;
    assert.notEqual(revanche.encontro.id, encontro.id);
    assert.equal(revanche.encontro.revanche, true);
    assert.equal(revanche.encontro.forca, 0.1);
    assert.equal(revanche.batalha.estado.revanche, true);
    assert.equal(await saldo(ash.token), 75);
    // Pedir de novo devolve a mesma batalha sem cobrar outra vez
    assert.equal((await refazer(1)).dados.encontro.id, revanche.encontro.id);
    assert.equal(await saldo(ash.token), 75);
    const idRevanche = revanche.encontro.id;
    for (let i = 0; i < 100 && !revanche.batalha.fim; i += 1) {
      revanche = (await api('POST', `/historia/encontros/${idRevanche}/jogadas`, { ...ash, corpo: { tipo: 'atacar' } })).dados;
    }
    assert.equal(revanche.batalha.fim.vencedor, 0);
    assert.equal(revanche.encontro.situacao, 'vencido');
    assert.equal(await saldo(ash.token), 85);
    let historia = (await api('GET', '/historia', ash)).dados;
    assert.deepEqual(historia.proximo, { trilha: 1, ponto: 2, forca: 0.2 });
    assert.equal(historia.vencidos, 1);
    assert.equal(historia.encontros.find((e) => e.ponto === 1).id, idRevanche);

    // Ignorar: não dá mais para capturar e o ponto fica livre para refazer
    assert.equal((await api('POST', `/historia/encontros/${segundo.id}/ignorar`, ash)).status, 400);
    const ignorado = await api('POST', `/historia/encontros/${idRevanche}/ignorar`, ash);
    assert.equal(ignorado.status, 200, JSON.stringify(ignorado.dados));
    assert.equal(ignorado.dados.situacao, 'ignorado');
    assert.equal((await api('POST', `/historia/encontros/${idRevanche}/capturar`, ash)).status, 400);
    assert.equal((await api('POST', `/historia/encontros/${idRevanche}/ignorar`, ash)).status, 400);

    // Na última tentativa sem sucesso ele foge
    const terceira = (await refazer(1)).dados;
    for (let i = 0; i < 100 && !terceira.batalha.fim; i += 1) {
      terceira.batalha = (await api('POST', `/historia/encontros/${terceira.encontro.id}/jogadas`, {
        ...ash, corpo: { tipo: 'atacar' },
      })).dados.batalha;
    }
    await pool.query('UPDATE historia_encontros SET tentativas_captura = 9 WHERE id = $1', [terceira.encontro.id]);
    const ultima = (await api('POST', `/historia/encontros/${terceira.encontro.id}/capturar`, ash)).dados;
    assert.equal(ultima.encontro.situacao, ultima.capturou ? 'capturado' : 'fugiu');

    // Perder uma revanche também faz o Pokémon fugir
    await pool.query("UPDATE usuarios SET pokecoins = 100 WHERE lower(login) = 'ash'");
    const outraRevanche = (await refazer(1)).dados;
    const perdida = (await api('POST', `/historia/encontros/${outraRevanche.encontro.id}/jogadas`, {
      ...ash, corpo: { tipo: 'desistir' },
    })).dados;
    assert.equal(perdida.encontro.situacao, 'fugiu');
    historia = (await api('GET', '/historia', ash)).dados;
    assert.equal(historia.vencidos, 1);
    assert.equal(historia.encontros.find((e) => e.ponto === 1).situacao, 'fugiu');
  });

  await s.test('golpes especiais: roleta com afeto máximo e uso em batalha', async () => {
    const ash = { token: t.ash.token };
    const primeiro = (await api('GET', '/eu', ash)).dados.pokemons.find((p) => p.posicaoTime === 1);
    const roletar = () => api('POST', `/pokemons/${primeiro.id}/golpes/roletar`, ash);

    // Sem afeto máximo não libera
    await pool.query('UPDATE pokemons SET afeto = 400, golpes = $2 WHERE id = $1', [primeiro.id, []]);
    assert.match((await roletar()).dados.erro, /afeto máximo/);

    // Primeira roleta grátis: 2 golpes de dano da lista da espécie (PokeAPI)
    await pool.query('UPDATE pokemons SET afeto = 500 WHERE id = $1', [primeiro.id]);
    await pool.query("UPDATE usuarios SET pokecoins = 50 WHERE lower(login) = 'ash'");
    const roleta = await roletar();
    assert.equal(roleta.status, 200, JSON.stringify(roleta.dados));
    assert.equal(roleta.dados.custo, 0);
    const { golpes } = roleta.dados.pokemon;
    assert.equal(golpes.length, 2);
    assert.notEqual(golpes[0].id, golpes[1].id);
    assert.ok(golpes.every((g) => g.poder > 0 && g.classe !== 'status'));
    const { rows: [especie] } = await pool.query('SELECT movimentos FROM especies WHERE id = $1', [primeiro.especieId]);
    assert.ok(golpes.every((g) => especie.movimentos.includes(g.id)));
    assert.equal(roleta.dados.pokemon.custoRoletaGolpes, 100);

    // As próximas custam 100
    assert.match((await roletar()).dados.erro, /100 Pokécoins/);
    await pool.query("UPDATE usuarios SET pokecoins = 500 WHERE lower(login) = 'ash'");
    const outra = await roletar();
    assert.equal(outra.dados.custo, 100);
    assert.equal(await saldo(ash.token), 400);

    // Em batalha (ponto 2 da história, ainda aberto): o golpe gasta PP e aparece no histórico
    const ponto2 = (await api('POST', '/historia/explorar', ash)).dados;
    let batalha = (await api('POST', `/historia/encontros/${ponto2.id}/batalha`, ash)).dados.batalha;
    const emCampo = () => batalha.estado.lados[0].pokemons[batalha.estado.lados[0].ativo];
    assert.equal(emCampo().pokemonId, primeiro.id);
    const ppAntes = emCampo().golpes[0].pp;
    assert.equal((await api('POST', `/historia/encontros/${ponto2.id}/jogadas`, {
      ...ash, corpo: { tipo: 'golpe', indice: 5 },
    })).status, 400);
    const usou = await api('POST', `/historia/encontros/${ponto2.id}/jogadas`, { ...ash, corpo: { tipo: 'golpe', indice: 0 } });
    assert.equal(usou.status, 200, JSON.stringify(usou.dados));
    batalha = usou.dados.batalha;
    const eventoDoGolpe = batalha.log.at(batalha.fim ? -1 : -2).eventos[0];
    assert.ok(eventoDoGolpe.tipo === 'errou' || eventoDoGolpe.golpe === outra.dados.pokemon.golpes[0].nome);
    if (!batalha.fim) assert.equal(emCampo().golpes[0].pp, ppAntes - 1);
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
