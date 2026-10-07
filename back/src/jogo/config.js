// Todas as regras de balanceamento ficam aqui para poderem ser ajustadas sem mexer na lógica

const HORA_MS = 60 * 60 * 1000;

module.exports = {
  // Economia
  POKECOINS_CADASTRO: 600,
  PRECO_POKEMON_LOJA: 100,
  TAMANHO_TIME: 3,

  // Uma loja por geração: cada uma sorteia entre as espécies do seu intervalo de ids da PokeAPI.
  // Mesma lista da tela da loja (front/src/pages/Loja.jsx)
  GERACOES: [
    { numero: 1, regiao: 'Kanto', primeira: 1, ultima: 151 },
    { numero: 2, regiao: 'Johto', primeira: 152, ultima: 251 },
    { numero: 3, regiao: 'Hoenn', primeira: 252, ultima: 386 },
    { numero: 4, regiao: 'Sinnoh', primeira: 387, ultima: 493 },
    { numero: 5, regiao: 'Unova', primeira: 494, ultima: 649 },
    { numero: 6, regiao: 'Kalos', primeira: 650, ultima: 721 },
    { numero: 7, regiao: 'Alola', primeira: 722, ultima: 809 },
    { numero: 8, regiao: 'Galar', primeira: 810, ultima: 905 },
    { numero: 9, regiao: 'Paldea', primeira: 906, ultima: 1025 },
  ],
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
  // Ao evoluir, cada status (PS, Ataque, Defesa, Velocidade) tem a própria chance de ganhar
  // de minimo a maximo pontos extras, que ficam no card para sempre (somam a cada evolução)
  BONUS_EVOLUCAO: { chance: 0.3, minimo: 1, maximo: 5 },

  // Batalha
  PRAZO_JOGADA_MS: 4 * HORA_MS,
  PRAZO_DESAFIO_MS: 24 * HORA_MS,
  DESAFIOS_PENDENTES_MAXIMO: 5,
  // A lista "treinadores para desafiar" mostra quem usou o jogo neste intervalo
  JANELA_TREINADORES_ATIVOS_HORAS: 24,
  TIMEOUTS_PARA_WO: 2,
  PODER_ATAQUE: 50,
  CHANCE_CRITICO: 1 / 16,
  CHANCE_CRITICO_MAIS_RAPIDO: 1 / 8, // quem é mais rápido que o alvo acerta crítico com mais frequência
  MULT_CRITICO: 1.5,
  MULT_MESMO_TIPO: 1.5, // golpe do mesmo tipo do Pokémon (STAB)

  // Golpes especiais: com o afeto máximo, o Pokémon sorteia GOLPES_POR_POKEMON golpes de dano
  // entre os que a espécie dele aprende (lista da PokeAPI). A primeira roleta é grátis; as outras custam.
  GOLPES_POR_POKEMON: 2,
  CUSTO_ROLETA_GOLPES: 100,

  // Afeto: carinho, brincar e alimentar somam pontos; cada AFETO_POR_CORACAO pontos é um coração (máx. 5)
  AFETO_MAXIMO: 500,
  AFETO_POR_CORACAO: 100,
  // Cada cuidado tem a própria espera, por Pokémon, e mexe no humor e na energia (0 a 100):
  // carinho só alegra, brincar alegra mas cansa, alimentar recupera a energia.
  // Cuidando bem várias vezes ao dia, o afeto máximo sai em ~2-3 dias.
  CUIDADOS: {
    carinho: { afeto: 10, humor: 15, energia: 0, esperaMs: 2 * HORA_MS },
    brincar: { afeto: 20, humor: 25, energia: -25, esperaMs: 4 * HORA_MS },
    alimentar: { afeto: 20, humor: 0, energia: 35, esperaMs: 4 * HORA_MS },
  },
  BEM_ESTAR_MAXIMO: 100,
  BEM_ESTAR_INICIAL: 50,
  // Sem cuidados, humor e energia caem devagar (pontos por hora)
  DESGASTE_POR_HORA: { humor: 2, energia: 1 },
  BONUS_STATUS_POR_CORACAO: 0.02, // 5 corações = +10% em todos os status
  // Com afeto máximo, o Pokémon aguenta firme com 1 PS um golpe que o nocautearia (uma vez por batalha)
  CHANCE_RESISTIR_AFETO_MAXIMO: 0.3,

  // Mercado de trocas
  PRECO_MAXIMO_ANUNCIO: 100000,
  ANUNCIOS_ATIVOS_MAXIMO: 20, // por treinador
  PROPOSTAS_PENDENTES_MAXIMO: 10, // enviadas por treinador
  POKEMONS_POR_PROPOSTA: 6,

  // Vitrine
  DESTAQUES_VITRINE: 6,
  BIO_VITRINE_MAXIMO: 160,

  // História: HISTORIA_TRILHAS trilhas de HISTORIA_PONTOS_POR_TRILHA pontos, cada ponto um Pokémon selvagem.
  // A força cresce HISTORIA_FORCA_POR_PONTO a cada ponto: trilha 1 vai de 0,1x a 1,0x,
  // trilha 2 de 1,1x a 2,0x... até 5,0x no último ponto da trilha 5.
  HISTORIA_TRILHAS: 5,
  HISTORIA_PONTOS_POR_TRILHA: 10,
  HISTORIA_FORCA_POR_PONTO: 0.1,
  // "Força normal" (1,0x) = os status da espécie neste nível. 0,1x fica parecido com um nível 1-5.
  HISTORIA_NIVEL_FORCA_NORMAL: 50,
  // Vitória: Pokécoins para o treinador e XP (proporcional à força) para todo o time.
  // A trilha só anda para a frente, então cada ponto paga uma vez só (não dá para farmar).
  HISTORIA_RECOMPENSA: { pokecoins: 10, xpPorForca: 1000 },
  // Pontos já vencidos podem ser refeitos quantas vezes quiser, sempre contra um novo Pokémon
  // aleatório (dá a mesma recompensa). Custa mais do que paga em Pokécoins: compensa pelo XP e pela captura.
  CUSTO_REFAZER_HISTORIA: 25,

  // Pokébolas: compradas na loja e usadas para capturar os Pokémon derrotados na história
  PRECO_POKEBOLA: 10,
  POKEBOLAS_POR_COMPRA_MAXIMO: 99,
  // A chance de captura vem do capture_rate da espécie na PokeAPI (3 = Mewtwo, 45 = iniciais, 255 = Caterpie).
  // Cada par é [capture_rate, chance]; entre dois pares a chance segue em linha reta,
  // e fora da faixa fica no primeiro/último valor
  CHANCE_CAPTURA: [
    [3, 0.1], // lendários: o mais difícil
    [45, 0.2], // iniciais
    [255, 0.5], // os mais fáceis
  ],
  // Depois de tantos erros o Pokémon foge e o ponto pode ser refeito contra um novo
  TENTATIVAS_CAPTURA_MAXIMO: 10,

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
