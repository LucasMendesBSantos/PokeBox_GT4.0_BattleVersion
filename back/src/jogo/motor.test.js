const test = require('node:test');
const assert = require('node:assert/strict');
const { montarLado, criarEstado, aplicarAcao, aplicarTimeout } = require('./motor');

// Rng fixo sem crítico e com dano máximo
const semSorte = () => 0.99;

function lado(usuarioId, velocidadeBase = 50, afeto = 0) {
  const especie = {
    id: 1, nome: 'teste', hp_base: 50, ataque_base: 50, defesa_base: 50, velocidade_base: velocidadeBase,
  };
  const time = [1, 2, 3, 4, 5].map((i) => ({
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
  const { estado: novo } = aplicarAcao(estado, 0, { tipo: 'trocar', indice: 3 });
  assert.equal(novo.lados[0].ativo, 3);
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
