import PropTypes from 'prop-types';
import './Coracoes.css';

const CORACOES_MAXIMO = 5;

// Corações de afeto (cheios e vazios), usados no card, no cantinho de cuidado e na vitrine
function Coracoes({ quantidade, tamanho = 'normal' }) {
  return (
    <span
      className="coracoes"
      data-tamanho={tamanho}
      role="img"
      aria-label={`Afeto: ${quantidade} de ${CORACOES_MAXIMO} corações`}
    >
      {Array.from({ length: CORACOES_MAXIMO }, (_, i) => (
        <span key={i} className={`coracao${i < quantidade ? ' coracao--cheio' : ''}`} aria-hidden="true">♥</span>
      ))}
    </span>
  );
}

Coracoes.propTypes = {
  quantidade: PropTypes.number.isRequired,
  tamanho: PropTypes.oneOf(['pequeno', 'normal', 'grande']),
};

export default Coracoes;
