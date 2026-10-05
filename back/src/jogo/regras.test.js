const test = require('node:test');
const assert = require('node:assert/strict');
const config = require('./config');
const {
  sortearAtributos, calcularStatus, aplicarXp, evolucoesDisponiveis, coracoes, aplicarCuidado, descreverAfeto, bemEstarAtual,
} = require('./regras');
const { mapearCadeia } = require('./especies');

// Rng que devolve os valores em sequência
const sequencia = (...valores) => () => valores.shift();

const RAICHU = { especieId: 26, nome: 'raichu', nivel: 41 };
const PIKACHU = {
  id: 25, nome: 'pikachu', tipos: ['electric'], raridade: 'comum', hp_base: 35, ataque_base: 55,
  defesa_base: 40, velocidade_base: 90, altura_base: 4, peso_base: 60, evolucoes: [RAICHU],
};

test('sortearAtributos respeita os limites em 10 mil sorteios', () => {
  for (let i = 0; i < 10000; i += 1) {
    const a = sortearAtributos();
    for (const iv of [a.iv_hp, a.iv_ataque, a.iv_defesa, a.iv_velocidade]) {
      assert.ok(Number.isInteger(iv) && iv >= 0 && iv <= 31);
      if (a.shiny) assert.ok(iv >= config.IV_MINIMO_SHINY);
    }
    for (const mult of [a.mult_altura, a.mult_peso]) assert.ok(mult >= 0.8 && mult <= 1.2);
  }
});

test('shiny sai com rng abaixo de 1% e garante IVs altos', () => {
  const a = sortearAtributos(sequencia(0.005, 0, 0, 0, 0, 0, 0));
  assert.equal(a.shiny, true);
  assert.equal(a.iv_hp, config.IV_MINIMO_SHINY);
  assert.equal(sortearAtributos(sequencia(0.01, 0, 0, 0, 0, 0, 0)).shiny, false);
});

test('calcularStatus usa a fórmula dos jogos', () => {
  const pokemon = { nivel: 50, iv_hp: 31, iv_ataque: 31, iv_defesa: 31, iv_velocidade: 31 };
  // Pikachu nível 50 com IVs perfeitos (sem EVs/natureza): 110 / 75 / 60 / 110
  assert.deepEqual(calcularStatus(PIKACHU, pokemon), { hp: 110, ataque: 75, defesa: 60, velocidade: 110 });
});

test('afeto máximo dá +10% em todos os status', () => {
  const pokemon = { nivel: 50, iv_hp: 31, iv_ataque: 31, iv_defesa: 31, iv_velocidade: 31 };
  assert.deepEqual(calcularStatus(PIKACHU, { ...pokemon, afeto: 99 }), { hp: 110, ataque: 75, defesa: 60, velocidade: 110 });
  assert.deepEqual(calcularStatus(PIKACHU, { ...pokemon, afeto: 500 }), { hp: 121, ataque: 82, defesa: 66, velocidade: 121 });
});

test('corações: 100 pontos cada, no máximo 5', () => {
  assert.equal(coracoes(0), 0);
  assert.equal(coracoes(199), 1);
  assert.equal(coracoes(500), 5);
  assert.deepEqual(descreverAfeto(340), {
    pontos: 340, coracoes: 3, maximo: false, faltamParaProximo: 60, bonusStatus: 0.06,
  });
  assert.equal(descreverAfeto(500).faltamParaProximo, null);
});

test('aplicarCuidado respeita a espera de cada cuidado e o afeto máximo', () => {
  const agora = new Date('2026-01-01T12:00:00Z');
  const haMinutos = (min) => new Date(agora.getTime() - min * 60000);
  const { carinho } = config.CUIDADOS;
  const pokemon = (afeto) => ({ afeto, humor: 50, energia: 50 });

  assert.equal(aplicarCuidado(pokemon(0), 'carinho', null, agora).ganho, carinho.afeto);
  assert.throws(() => aplicarCuidado(pokemon(0), 'carinho', haMinutos(carinho.esperaMs / 60000 - 1), agora), /ainda não está disponível/);
  assert.equal(aplicarCuidado(pokemon(0), 'carinho', haMinutos(carinho.esperaMs / 60000), agora).afeto, carinho.afeto);
  assert.equal(aplicarCuidado(pokemon(495), 'alimentar', null, agora).afeto, 500);
  assert.equal(aplicarCuidado(pokemon(495), 'alimentar', null, agora).ganho, 5);
  assert.throws(() => aplicarCuidado(pokemon(0), 'dormir', null, agora), /inválido/);
});

test('carinho alegra, brincar alegra e cansa, alimentar dá energia', () => {
  const atual = { afeto: 0, humor: 50, energia: 50 };
  const so = ({ humor, energia }) => ({ humor, energia });
  assert.deepEqual(so(aplicarCuidado(atual, 'carinho', null)), { humor: 65, energia: 50 });
  assert.deepEqual(so(aplicarCuidado(atual, 'brincar', null)), { humor: 75, energia: 25 });
  assert.deepEqual(so(aplicarCuidado(atual, 'alimentar', null)), { humor: 50, energia: 85 });
  // Nunca passa de 100
  assert.equal(aplicarCuidado({ ...atual, humor: 95 }, 'brincar', null).humor, 100);
  // Sem energia para brincar
  assert.throws(() => aplicarCuidado({ ...atual, energia: 24 }, 'brincar', null), /cansado demais/);
  assert.equal(aplicarCuidado({ ...atual, energia: 25 }, 'brincar', null).energia, 0);
});

test('humor e energia caem com o tempo sem cuidados', () => {
  const agora = new Date('2026-01-01T12:00:00Z');
  const haHoras = (h) => new Date(agora.getTime() - h * 60 * 60 * 1000);
  assert.deepEqual(bemEstarAtual({ humor: 80, energia: 80, bem_estar_em: haHoras(0) }, agora), { humor: 80, energia: 80 });
  assert.deepEqual(bemEstarAtual({ humor: 80, energia: 80, bem_estar_em: haHoras(10) }, agora), { humor: 60, energia: 70 });
  assert.deepEqual(bemEstarAtual({ humor: 80, energia: 80, bem_estar_em: haHoras(100) }, agora), { humor: 0, energia: 0 });
});

test('aplicarXp sobe vários níveis de uma vez e guarda o que sobra', () => {
  // Nível 1 precisa de 100, nível 2 de 200: 150 XP -> nível 2 com 50
  assert.deepEqual(aplicarXp({ nivel: 1, xp: 0 }, 150), { nivel: 2, xp: 50, niveisGanhos: 1 });
  // 100 + 200 + 300 = 600 -> nível 4 com 0
  assert.deepEqual(aplicarXp({ nivel: 1, xp: 0 }, 600), { nivel: 4, xp: 0, niveisGanhos: 3 });
  assert.deepEqual(aplicarXp({ nivel: 3, xp: 290 }, 10), { nivel: 4, xp: 0, niveisGanhos: 1 });
});

test('aplicarXp para no nível 100', () => {
  assert.deepEqual(aplicarXp({ nivel: 99, xp: 9890 }, 150), { nivel: 100, xp: 0, niveisGanhos: 1 });
  assert.deepEqual(aplicarXp({ nivel: 100, xp: 0 }, 150), { nivel: 100, xp: 0, niveisGanhos: 0 });
});

test('evolução só aparece a partir do nível da evolução', () => {
  assert.deepEqual(evolucoesDisponiveis(PIKACHU, { nivel: 40 }), []);
  assert.deepEqual(evolucoesDisponiveis(PIKACHU, { nivel: 41 }), [RAICHU]);
  assert.deepEqual(evolucoesDisponiveis({ ...PIKACHU, evolucoes: [] }, { nivel: 100 }), []);
});

// Nó no formato de /evolution-chain da PokeAPI, só com os campos usados
const no = (nome, id, detalhes, evolvesTo = []) => ({
  species: { name: nome, url: `https://pokeapi.co/api/v2/pokemon-species/${id}/` },
  evolution_details: detalhes,
  evolves_to: evolvesTo,
});

test('mapearCadeia usa o min_level da PokeAPI (Charmander 16, Charmeleon 36)', () => {
  const cadeia = no('charmander', 4, [], [
    no('charmeleon', 5, [{ min_level: 16 }], [no('charizard', 6, [{ min_level: 36 }])]),
  ]);
  const mapa = mapearCadeia(cadeia, 1, new Map());
  assert.deepEqual(mapa.get('charmander'), [{ especieId: 5, nome: 'charmeleon', nivel: 16 }]);
  assert.deepEqual(mapa.get('charmeleon'), [{ especieId: 6, nome: 'charizard', nivel: 36 }]);
  assert.deepEqual(mapa.get('charizard'), []);
});

test('mapearCadeia soma 20 níveis quando a evolução é por pedra/amizade', () => {
  const cadeia = no('pichu', 172, [], [
    no('pikachu', 25, [{ min_level: null }], [no('raichu', 26, [{ min_level: null }])]),
  ]);
  const mapa = mapearCadeia(cadeia, 1, new Map());
  assert.equal(mapa.get('pichu')[0].nivel, 21);
  assert.equal(mapa.get('pikachu')[0].nivel, 41);
});
