import PropTypes from 'prop-types';
import { formatarNome } from './tipos';

/**
 * Resumo da evolução para cards e o time: "Evolui no Nv. 36 (faltam 4)", "Pode evoluir!" ou null se não evolui.
 * Com várias evoluções (Eevee), vale a de menor nível.
 */
export function resumoEvolucao(pokemon) {
  if (pokemon.evolucoes.length === 0) return null;
  const disponivel = pokemon.evolucoes.find((e) => e.disponivel);
  if (disponivel) return { pronto: true, texto: `Pode evoluir para ${formatarNome(disponivel.nome)}!` };
  const proxima = pokemon.evolucoes.reduce((menor, e) => (e.nivel < menor.nivel ? e : menor));
  const faltam = proxima.nivel - pokemon.nivel;
  return {
    pronto: false,
    texto: `Evolui para ${formatarNome(proxima.nome)} no Nv. ${proxima.nivel} (falta${faltam === 1 ? '' : 'm'} ${faltam})`,
  };
}

// Formato de um card do jogador como o back devolve (GET /api/eu)
export const formatoPokemon = PropTypes.shape({
  id: PropTypes.number.isRequired,
  mintNumero: PropTypes.number.isRequired,
  especieId: PropTypes.number.isRequired,
  nome: PropTypes.string.isRequired,
  tipos: PropTypes.arrayOf(PropTypes.string).isRequired,
  raridade: PropTypes.string.isRequired,
  shiny: PropTypes.bool.isRequired,
  nivel: PropTypes.number.isRequired,
  xp: PropTypes.number.isRequired,
  xpParaSubir: PropTypes.number,
  ivs: PropTypes.objectOf(PropTypes.number).isRequired,
  status: PropTypes.objectOf(PropTypes.number).isRequired,
  // Pontos extras ganhos nas evoluções (já somados em status)
  bonusEvolucao: PropTypes.objectOf(PropTypes.number),
  alturaM: PropTypes.number.isRequired,
  pesoKg: PropTypes.number.isRequired,
  posicaoTime: PropTypes.number,
  posicaoVitrine: PropTypes.number,
  anunciado: PropTypes.bool.isRequired,
  afeto: PropTypes.shape({
    pontos: PropTypes.number.isRequired,
    coracoes: PropTypes.number.isRequired,
    maximo: PropTypes.bool.isRequired,
    faltamParaProximo: PropTypes.number,
    bonusStatus: PropTypes.number.isRequired,
  }).isRequired,
  humor: PropTypes.number.isRequired,
  energia: PropTypes.number.isRequired,
  // Quando cada cuidado volta (data ISO) ou null se já está disponível
  cuidadosDisponiveisEm: PropTypes.objectOf(PropTypes.string).isRequired,
  // Golpes especiais sorteados com o afeto máximo
  golpes: PropTypes.arrayOf(PropTypes.shape({
    id: PropTypes.number.isRequired,
    nome: PropTypes.string.isRequired,
    tipo: PropTypes.string.isRequired,
    classe: PropTypes.string.isRequired,
    poder: PropTypes.number.isRequired,
    precisao: PropTypes.number,
    pp: PropTypes.number.isRequired,
  })),
  custoRoletaGolpes: PropTypes.number,
  evolucoes: PropTypes.arrayOf(PropTypes.shape({
    especieId: PropTypes.number.isRequired,
    nome: PropTypes.string.isRequired,
    nivel: PropTypes.number.isRequired,
    disponivel: PropTypes.bool.isRequired,
  })).isRequired,
});
