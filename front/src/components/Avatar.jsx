import PropTypes from 'prop-types';
import './Avatar.css';

// Cor a partir do login, para cada treinador ter sempre a sua
function corDoLogin(login) {
  const soma = [...login.toLowerCase()].reduce((total, letra) => total + letra.charCodeAt(0), 0);
  return `hsl(${(soma * 47) % 360} 65% 50%)`;
}

// Bolinha com a inicial do treinador (vitrine, mercado e propostas)
function Avatar({ login, tamanho = 'normal' }) {
  return (
    <span className="avatar" data-tamanho={tamanho} style={{ background: corDoLogin(login) }} aria-hidden="true">
      {login.charAt(0).toUpperCase()}
    </span>
  );
}

Avatar.propTypes = {
  login: PropTypes.string.isRequired,
  tamanho: PropTypes.oneOf(['pequeno', 'normal', 'grande']),
};

export default Avatar;
