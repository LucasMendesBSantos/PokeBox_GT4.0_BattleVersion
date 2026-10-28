// Cada passo abre uma tela e, se tiver `alvo`, aponta a seta para o elemento
// com data-tutorial={alvo} (no menu do Layout). Sem alvo, o card fica no centro.
export const PASSOS_TUTORIAL = [
  {
    tela: 'meusPokemons',
    titulo: 'Saudações, treinador!',
    texto:
      'Bem-vindo ao PokeBox do GT4.0! Muito obrigado por fazer parte do nosso jogo. '
      + 'Qualquer dúvida, entre em contato com Alberto, Aberto, O bom, O ruim e o..... Bom jogo!',
    botao: 'Seguir para o tutorial',
  },
  {
    tela: 'meusPokemons',
    titulo: 'Escolha seu inicial',
    texto: 'Para iniciar sua jornada, escolha seu parceiro dentre 3 de cada uma das Gerações.',
    botao: 'Escolher meu parceiro',
    // O card some até o inicial ser escolhido; o App avança o tutorial depois
    esperaInicial: true,
  },
  {
    tela: 'meusPokemons',
    alvo: 'menu',
    titulo: 'A interface',
    texto:
      'Este é o menu: daqui você chega em todas as áreas do jogo. '
      + 'Agora que você já escolheu seu parceiro, siga para a loja.',
  },
  {
    tela: 'meusPokemons',
    alvo: 'saldo',
    titulo: 'Seu saldo',
    texto:
      'Aqui ficam suas Pokécoins e Pokébolas. Você ganha Pokécoins vencendo batalhas, na história '
      + 'e completando corações de afeto dos seus Pokémon, '
      + 'e gasta na loja.',
  },
  {
    tela: 'loja',
    alvo: 'loja',
    titulo: 'Loja',
    texto:
      'Na loja, você pode comprar Pokébolas por 10 Pokécoins ou pode comprar os Pokémon diretamente '
      + 'da loja por 100 Pokécoins. Cada geração tem a sua loja, e cada Pokémon sorteado é único.',
  },
  {
    tela: 'meusPokemons',
    alvo: 'meusPokemons',
    titulo: 'Meus Pokémon',
    texto:
      'Aqui fica a sua coleção. Dê carinho, brinque e alimente seus Pokémon para ganhar corações de afeto, '
      + 'evolua quando chegarem ao nível e libere golpes especiais.',
  },
  {
    tela: 'time',
    alvo: 'time',
    titulo: 'Time',
    texto:
      'Monte um time de 3 Pokémon da sua coleção. O primeiro abre a batalha e, quando um é nocauteado, '
      + 'o próximo da fila entra. Sem time você não batalha!',
  },
  {
    tela: 'historia',
    alvo: 'historia',
    titulo: 'História',
    texto:
      'Siga as trilhas e enfrente Pokémon selvagens, cada ponto mais forte que o anterior. '
      + 'Vencendo você ganha Pokécoins e XP, e pode tentar capturar o Pokémon derrotado com uma Pokébola.',
  },
  {
    tela: 'batalhas',
    alvo: 'batalhas',
    titulo: 'Batalhas',
    texto:
      'Desafie outros treinadores. As batalhas são por turnos e cada jogador tem 1 min para jogar: '
      + 'perder o prazo passa a vez, e perder duas vezes seguidas é derrota por W.O.',
  },
  {
    tela: 'pokemons',
    alvo: 'pokemons',
    titulo: 'Pokédex',
    texto: 'Consulte todos os Pokémon que existem, com tipos e status, para planejar suas compras e seu time.',
  },
  {
    tela: 'vitrine',
    alvo: 'vitrine',
    titulo: 'Vitrine',
    texto:
      'Sua vitrine é o seu perfil: escolha os Pokémon em destaque e visite a vitrine de outros treinadores.',
  },
  {
    tela: 'trocas',
    alvo: 'trocas',
    titulo: 'Trocas',
    texto: 'Compre, venda e troque Pokémon com outros treinadores.',
  },
  {
    tela: 'meusPokemons',
    titulo: 'Tudo pronto!',
    texto: 'Agora é com você: compre seus Pokémon, monte seu time e comece a jornada. Bom jogo!',
    botao: 'Começar a jogar',
  },
];

// Progresso salvo por usuário neste navegador: número do passo ou 'fim'
const chave = (usuarioId) => `pokebox-tutorial:${usuarioId}`;

/**
 * Passo em que o tutorial deve abrir, ou null se não deve abrir.
 * Começa só para quem ainda não tem Pokémon (primeiro acesso) e retoma se a página recarregou no meio.
 */
export function passoSalvo(usuarioId, pokemons) {
  let salvo = null;
  try {
    salvo = localStorage.getItem(chave(usuarioId));
  } catch {
    // sem localStorage: decide só pela coleção
  }
  if (salvo === 'fim') return null;

  const passo = Number.parseInt(salvo, 10);
  if (passo >= 0 && passo < PASSOS_TUTORIAL.length) {
    // Escolheu o inicial e recarregou antes de o tutorial avançar
    return PASSOS_TUTORIAL[passo].esperaInicial && pokemons.length > 0 ? passo + 1 : passo;
  }
  return pokemons.length === 0 ? 0 : null;
}

/** Guarda o passo atual, ou null quando o tutorial terminou ou foi pulado */
export function salvarPasso(usuarioId, passo) {
  try {
    localStorage.setItem(chave(usuarioId), passo === null ? 'fim' : String(passo));
  } catch {
    // sem localStorage: o tutorial pode reaparecer no próximo acesso
  }
}

// Tutorial de cuidados da tela "Meus Pokémon". Mesmos valores de back/src/jogo/config.js
// (CUIDADOS, DESGASTE_POR_HORA, BONUS_STATUS_POR_CORACAO, RECOMPENSA_POR_CORACAO, CHANCE_RESISTIR_AFETO_MAXIMO).
// Os alvos ficam no primeiro card da coleção (CartaPokemon).
export const PASSOS_CUIDADOS = [
  {
    titulo: 'Cuidando dos seus Pokémon',
    texto:
      'Pokémon bem cuidados ficam mais fortes! Cada um tem afeto, humor e energia, '
      + 'e tudo isso depende de quanto você cuida dele.',
    botao: 'Ver como funciona',
  },
  {
    alvo: 'afeto',
    titulo: 'Corações de afeto',
    texto:
      'Cada 100 pontos de afeto viram um coração, até 5. '
      + 'Cada coração completo dá 100 Pokécoins para você e +2% em todos os status do Pokémon: com 5 ♥ são +10%.',
  },
  {
    alvo: 'cuidar',
    titulo: 'Cantinho de cuidados',
    texto: 'Clique aqui para abrir o cantinho do Pokémon, ver o humor e a energia dele e cuidar dele.',
  },
  {
    titulo: 'Os cuidados',
    texto:
      '🤲 Carinho: +10 afeto e +15 humor. Pode repetir a cada 2h.\n'
      + '🎾 Brincar: +20 afeto e +25 humor, mas gasta 25 de energia. A cada 4h.\n'
      + '🍓 Alimentar: +20 afeto e +35 energia. A cada 4h.\n\n'
      + 'A espera é de cada Pokémon: dá para cuidar de todos ao mesmo tempo.',
  },
  {
    titulo: 'Humor e energia',
    texto:
      'Sem cuidados, o humor cai 2 pontos por hora e a energia 1. '
      + 'Sem energia, o Pokémon fica cansado demais para brincar: alimente-o antes.',
  },
  {
    titulo: 'Afeto máximo',
    texto:
      'Com 5 ♥, o Pokémon libera os golpes especiais (a primeira roleta é grátis) e ganha 30% de chance '
      + 'de aguentar com 1 PS um golpe que o nocautearia, uma vez por batalha.',
    botao: 'Entendi!',
  },
];

const chaveCuidados = (usuarioId) => `pokebox-tutorial-cuidados:${usuarioId}`;

/** Se o treinador já viu (ou pulou) o tutorial de cuidados neste navegador */
export function cuidadosVistos(usuarioId) {
  try {
    return localStorage.getItem(chaveCuidados(usuarioId)) === 'fim';
  } catch {
    // sem localStorage: não abre sozinho, para não aparecer em toda visita
    return true;
  }
}

export function marcarCuidadosVistos(usuarioId) {
  try {
    localStorage.setItem(chaveCuidados(usuarioId), 'fim');
  } catch {
    // sem localStorage: nada a guardar
  }
}
