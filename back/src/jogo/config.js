// Todas as regras de balanceamento ficam aqui para poderem ser ajustadas sem mexer na lógica

const HORA_MS = 60 * 60 * 1000;

module.exports = {
  // Economia
  POKECOINS_CADASTRO: 400,
  PRECO_POKEMON_LOJA: 100,
  TAMANHO_TIME: 5,

  // Espécies que a loja pode sortear (ids da PokeAPI: 1 = Bulbasaur ... 1025 = Pecharunt)
  ULTIMA_ESPECIE: 1025,
  // A loja sorteia uma espécie e aceita com esta chance; se recusar, sorteia de novo.
  // Na prática lendários saem ~10x menos que um comum e míticos ~20x menos.
  PESO_RARIDADE: { comum: 1, lendario: 0.1, mitico: 0.05 },

  // Mesma lista da tela de escolha do inicial (front/src/pages/MeusPokemons.jsx)
  INICIAIS: [
    1, 4, 7, 152, 155, 158, 252, 255, 258, 387, 390, 393, 495, 498, 501,
    650, 653, 656, 722, 725, 728, 810, 813, 816, 906, 909, 912,
  ],

  // Mint
  CHANCE_SHINY: 0.01,
  IV_MAXIMO: 31,
  IV_MINIMO_SHINY: 20, // shiny sorteia IVs entre 20 e 31
  MULT_MINIMO: 0.8,
  MULT_MAXIMO: 1.2,

  // Progressão
  NIVEL_MAXIMO: 100,
  xpParaSubir: (nivel) => nivel * 100,
  // O nível de evolução vem da PokeAPI (Charmander 16, Charmeleon 36). Evoluções por
  // pedra, troca ou amizade não têm nível lá: usamos o nível em que a espécie atual
  // foi alcançada + este valor (Pichu -> Pikachu no 1 + 20 = 21, Pikachu -> Raichu no 21 + 20 = 41).
  NIVEIS_EVOLUCAO_SEM_NIVEL: 20,

  // Batalha
  PRAZO_JOGADA_MS: 4 * HORA_MS,
  PRAZO_DESAFIO_MS: 24 * HORA_MS,
  DESAFIOS_PENDENTES_MAXIMO: 5,
  TIMEOUTS_PARA_WO: 2,
  PODER_ATAQUE: 50,
  CHANCE_CRITICO: 1 / 16,
  CHANCE_CRITICO_MAIS_RAPIDO: 1 / 8, // quem é mais rápido que o alvo acerta crítico com mais frequência
  MULT_CRITICO: 1.5,

  // Recompensas
  RECOMPENSA_VENCEDOR: { pokecoins: 40, xp: 150 },
  RECOMPENSA_PERDEDOR: { pokecoins: 10, xp: 50 },
  // Quem perde por W.O. ou desistência não ganha nada, senão abandonar partidas vira forma de farmar Pokécoins
  RECOMPENSA_ABANDONO: { pokecoins: 0, xp: 0 },

  // Anti-farm (contra criar contas falsas para ganhar de si mesmo)
  JOGADAS_MINIMAS_PARA_RECOMPENSA: 6, // ataques/trocas feitos de verdade, somando os dois jogadores
  RECOMPENSAS_POR_DIA: 10, // batalhas premiadas por jogador a cada 24h
  RECOMPENSAS_MESMO_OPONENTE_POR_DIA: 3,
};
