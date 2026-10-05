import PropTypes from 'prop-types';

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
  evolucoes: PropTypes.arrayOf(PropTypes.shape({
    especieId: PropTypes.number.isRequired,
    nome: PropTypes.string.isRequired,
    nivel: PropTypes.number.isRequired,
    disponivel: PropTypes.bool.isRequired,
  })).isRequired,
});
