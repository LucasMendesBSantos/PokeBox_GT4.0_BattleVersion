const test = require('node:test');
const assert = require('node:assert/strict');
const { montarLado, criarEstado, aplicarAcao, aplicarTimeout } = require('./motor');

// Rng fixo sem crítico e com dano máximo
const semSorte = () => 0.99;

function lado(usuarioId, velocidadeBase = 50, afeto = 0) {
  const especie = {
    id: 1, nome: 'teste', hp_base: 50, ataque_base: 50, defesa_base: 50, velocidade_base: velocidadeBase,
  };
  const time = [1, 2, 3].map((i) => ({
    especie,
    pokemon: {
      id: usuarioId * 10 + i, mint_numero: i, shiny: false, nivel: 50,
      iv_hp: 0, iv_ataque: 0, iv_defesa: 0, iv_velocidade: 0, afeto,
    },
  }));
  return montarLado({ id: usuarioId, login: `treinador${usuarioId}` }, time);
}

test('começa quem tem o primeiro Pokémon mais rápido', () => {
  assert.equal(criarEstado(lado(1, 50), lado(2, 90)).vez, 1);
  assert.equal(criarEstado(lado(1, 90), lado(2, 50)).vez, 0);
});

test('atacar causa dano e passa a vez', () => {
  const estado = criarEstado(lado(1, 90), lado(2));
  const { estado: novo, eventos, fim } = aplicarAcao(estado, 0, { tipo: 'atacar' }, semSorte);
  assert.equal(fim, null);
  assert.equal(novo.vez, 1);
  assert.equal(eventos[0].tipo, 'dano');
  assert.ok(novo.lados[1].pokemons[0].hp < estado.lados[1].pokemons[0].hp);
  // O estado original não é alterado
  assert.equal(estado.lados[1].pokemons[0].hp, estado.lados[1].pokemons[0].hpMax);
});

test('não pode jogar fora da sua vez', () => {
  const estado = criarEstado(lado(1, 90), lado(2));
  assert.throws(() => aplicarAcao(estado, 1, { tipo: 'atacar' }), /Não é a sua vez/);
});

test('nocaute coloca o próximo em campo e o último nocaute termina a batalha', () => {
  let estado = criarEstado(lado(1, 90), lado(2));
  let resultado;
  let jogadas = 0;
  // Os dois atacam alternadamente até alguém ficar sem Pokémon
  do {
    resultado = aplicarAcao(estado, estado.vez, { tipo: 'atacar' }, semSorte);
    estado = resultado.estado;
    jogadas += 1;
  } while (!resultado.fim && jogadas < 1000);

  assert.equal(resultado.fim.motivo, 'nocaute');
  assert.equal(resultado.fim.vencedor, 0); // mesmos status, quem começou vence
  assert.ok(estado.lados[1].pokemons.every((p) => p.hp === 0));
  assert.ok(resultado.eventos.some((e) => e.tipo === 'nocaute'));
});

test('trocar valida o Pokémon escolhido', () => {
  const estado = criarEstado(lado(1, 90), lado(2));
  assert.throws(() => aplicarAcao(estado, 0, { tipo: 'trocar', indice: 0 }), /já está em campo/);
  assert.throws(() => aplicarAcao(estado, 0, { tipo: 'trocar', indice: 9 }), /inválido/);
  const { estado: novo } = aplicarAcao(estado, 0, { tipo: 'trocar', indice: 2 });
  assert.equal(novo.lados[0].ativo, 2);
});

test('desistir funciona fora da vez e dá a vitória ao oponente', () => {
  const estado = criarEstado(lado(1, 90), lado(2));
  const { fim } = aplicarAcao(estado, 1, { tipo: 'desistir' });
  assert.deepEqual(fim, { vencedor: 0, motivo: 'desistencia' });
});

test('2 timeouts seguidos do mesmo jogador dão W.O.', () => {
  let estado = criarEstado(lado(1, 90), lado(2));
  let r = aplicarTimeout(estado); // jogador 0 perde a vez (1º timeout)
  assert.equal(r.fim, null);
  r = aplicarAcao(r.estado, 1, { tipo: 'atacar' }, semSorte);
  r = aplicarTimeout(r.estado); // jogador 0 de novo (2º seguido)
  assert.deepEqual(r.fim, { vencedor: 1, motivo: 'wo' });
});

test('jogar de verdade zera a contagem de timeouts', () => {
  let r = aplicarTimeout(criarEstado(lado(1, 90), lado(2))); // 0: 1 timeout
  r = aplicarAcao(r.estado, 1, { tipo: 'atacar' }, semSorte);
  r = aplicarAcao(r.estado, 0, { tipo: 'atacar' }, semSorte); // 0 joga: zera
  assert.equal(r.estado.lados[0].timeoutsSeguidos, 0);
  r = aplicarAcao(r.estado, 1, { tipo: 'atacar' }, semSorte);
  r = aplicarTimeout(r.estado); // 0: 1 timeout de novo, sem W.O.
  assert.equal(r.fim, null);
});

// Ataque que sempre nocauteia: o defensor está com 1 PS
function quaseNocauteado(afetoDefensor) {
  const estado = criarEstado(lado(1, 90), lado(2, 50, afetoDefensor));
  estado.lados[1].pokemons[0].hp = 1;
  return estado;
}

test('afeto máximo: 30% de chance de aguentar um golpe letal com 1 PS', () => {
  // rng: crítico, variação do dano, e por último o sorteio da resistência
  const resiste = () => 0.1;
  const { estado, eventos } = aplicarAcao(quaseNocauteado(500), 0, { tipo: 'atacar' }, resiste);
  assert.equal(estado.lados[1].pokemons[0].hp, 1);
  assert.equal(estado.lados[1].ativo, 0);
  assert.ok(eventos.some((e) => e.tipo === 'resistiu' && e.lado === 1));
  assert.ok(!eventos.some((e) => e.tipo === 'nocaute'));

  // Sorteio acima de 30%: nocauteia normalmente
  const { eventos: semSorteNoSorteio } = aplicarAcao(quaseNocauteado(500), 0, { tipo: 'atacar' }, semSorte);
  assert.ok(semSorteNoSorteio.some((e) => e.tipo === 'nocaute'));
});

test('a resistência do afeto só acontece uma vez por batalha e só com afeto máximo', () => {
  const resiste = () => 0.1;
  const primeira = aplicarAcao(quaseNocauteado(500), 0, { tipo: 'atacar' }, resiste);
  const vezDoOutro = aplicarAcao(primeira.estado, 1, { tipo: 'trocar', indice: 2 }, resiste);
  const deVolta = aplicarAcao(vezDoOutro.estado, 0, { tipo: 'atacar' }, resiste);
  const voltou = aplicarAcao(deVolta.estado, 1, { tipo: 'trocar', indice: 0 }, resiste);
  const segunda = aplicarAcao(voltou.estado, 0, { tipo: 'atacar' }, resiste);
  assert.ok(segunda.eventos.some((e) => e.tipo === 'nocaute'));

  const { eventos } = aplicarAcao(quaseNocauteado(499), 0, { tipo: 'atacar' }, resiste);
  assert.ok(eventos.some((e) => e.tipo === 'nocaute'));
});

// --- Golpes especiais --------------------------------------------------------

const { efetividade } = require('./tipos');

const RAZOR_LEAF = {
  id: 75, nome: 'razor-leaf', tipo: 'grass', classe: 'physical', poder: 55, precisao: 95, pp: 2,
};

function ladoComGolpes(usuarioId, tipos, golpes, velocidadeBase = 50) {
  const especie = {
    id: 1, nome: 'teste', tipos, hp_base: 50, ataque_base: 50, defesa_base: 50, velocidade_base: velocidadeBase,
  };
  const time = [1, 2, 3].map((i) => ({
    especie,
    golpes,
    pokemon: {
      id: usuarioId * 10 + i, mint_numero: i, shiny: false, nivel: 50,
      iv_hp: 0, iv_ataque: 0, iv_defesa: 0, iv_velocidade: 0, afeto: 0,
    },
  }));
  return montarLado({ id: usuarioId, login: `treinador${usuarioId}` }, time);
}

test('vantagem de tipo: os dois tipos do alvo se multiplicam', () => {
  assert.equal(efetividade('grass', ['water', 'ground']), 4);
  assert.equal(efetividade('fire', ['grass']), 2);
  assert.equal(efetividade('fire', ['water', 'rock']), 0.25);
  assert.equal(efetividade('electric', ['ground', 'flying']), 0);
  assert.equal(efetividade('normal', ['ghost']), 0);
  assert.equal(efetividade('dragon', ['fairy']), 0);
  assert.equal(efetividade('fighting', ['normal', 'dark']), 4);
  assert.equal(efetividade('water', ['normal']), 1);
  assert.equal(efetividade('stellar', ['normal']), 1);
});

test('golpe gasta PP, ganha STAB e vantagem de tipo', () => {
  const estado = criarEstado(ladoComGolpes(1, ['grass'], [RAZOR_LEAF], 90), ladoComGolpes(2, ['water', 'ground'], []));
  // 0,5: acerta (50 < 95), sem crítico e com a mesma variação nos dois
  const meio = () => 0.5;
  const basico = aplicarAcao(estado, 0, { tipo: 'atacar' }, meio).eventos[0];
  const { estado: novo, eventos } = aplicarAcao(estado, 0, { tipo: 'golpe', indice: 0 }, meio);
  const dano = eventos[0];
  assert.equal(dano.tipo, 'dano');
  assert.equal(dano.golpe, 'razor-leaf');
  assert.equal(dano.efetividade, 4);
  // Poder 55 com STAB (1,5x) e 4x contra água/terra bate muito mais forte que o básico (poder 50, sem tipo)
  assert.ok(dano.dano > basico.dano * 5);
  assert.equal(novo.lados[0].pokemons[0].golpes[0].pp, 1);
  assert.equal(estado.lados[0].pokemons[0].golpes[0].pp, 2);
});

test('golpe pode errar pela precisão e não pode ser usado sem PP', () => {
  const estado = criarEstado(ladoComGolpes(1, ['grass'], [RAZOR_LEAF], 90), ladoComGolpes(2, ['water'], []));
  // rng 0,99 * 100 = 99 >= 95 de precisão: errou, mas gastou o PP e passou a vez
  const errou = aplicarAcao(estado, 0, { tipo: 'golpe', indice: 0 }, () => 0.99);
  assert.equal(errou.eventos[0].tipo, 'errou');
  assert.equal(errou.estado.vez, 1);
  assert.equal(errou.estado.lados[1].pokemons[0].hp, estado.lados[1].pokemons[0].hpMax);

  const semPp = structuredClone(estado);
  semPp.lados[0].pokemons[0].golpes[0].pp = 0;
  assert.throws(() => aplicarAcao(semPp, 0, { tipo: 'golpe', indice: 0 }, semSorte), /PP/);
  assert.throws(() => aplicarAcao(estado, 0, { tipo: 'golpe', indice: 1 }, semSorte), /Golpe inválido/);
});

test('golpe sem efeito não causa dano', () => {
  const choque = { ...RAZOR_LEAF, nome: 'thunderbolt', tipo: 'electric', precisao: null };
  const estado = criarEstado(ladoComGolpes(1, ['electric'], [choque], 90), ladoComGolpes(2, ['ground'], []));
  const { estado: novo, eventos } = aplicarAcao(estado, 0, { tipo: 'golpe', indice: 0 }, semSorte);
  assert.equal(eventos[0].dano, 0);
  assert.equal(eventos[0].efetividade, 0);
  assert.equal(novo.lados[1].pokemons[0].hp, estado.lados[1].pokemons[0].hpMax);
});
