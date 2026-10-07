import PropTypes from 'prop-types';
import { formatarNome, formatarNumero } from './tipos';
import { urlArtwork } from '../services/pokeapi';
import '../pages/Batalha.css';

// Peças do campo de batalha, usadas nas batalhas entre treinadores e na história

export function BarraHp({ pokemon }) {
  const porcentagem = (pokemon.hp / pokemon.hpMax) * 100;
  let nivel = 'alto';
  if (porcentagem <= 20) nivel = 'baixo';
  else if (porcentagem <= 50) nivel = 'medio';
  return (
    <div className="batalha-hp">
      <span className="batalha-hp-barra" data-nivel={nivel}>
        <span style={{ width: `${porcentagem}%` }} />
      </span>
      <span className="batalha-hp-texto">{`${pokemon.hp} / ${pokemon.hpMax} PS`}</span>
    </div>
  );
}

const formatoPokemonBatalha = PropTypes.shape({
  pokemonId: PropTypes.number.isRequired,
  mintNumero: PropTypes.number, // null no Pokémon selvagem da história
  especieId: PropTypes.number.isRequired,
  nome: PropTypes.string.isRequired,
  shiny: PropTypes.bool.isRequired,
  nivel: PropTypes.number.isRequired,
  hp: PropTypes.number.isRequired,
  hpMax: PropTypes.number.isRequired,
});

BarraHp.propTypes = { pokemon: formatoPokemonBatalha.isRequired };

// Um lado do campo: o Pokémon ativo grande e o banco de reserva
export function LadoCampo({ lado, meu }) {
  const ativo = lado.pokemons[lado.ativo];
  const selvagem = lado.usuarioId === null;
  let treinador = lado.login;
  if (meu) treinador = 'Você';
  else if (selvagem) treinador = 'Pokémon selvagem';
  return (
    <section className={`batalha-lado${meu ? ' batalha-lado--meu' : ''}`} aria-label={meu ? 'Seu time' : `Time de ${treinador}`}>
      <div className="batalha-ativo">
        <img src={urlArtwork(ativo.especieId, ativo.shiny)} alt={formatarNome(ativo.nome)} />
        <div className="batalha-ativo-info">
          <span className="batalha-treinador">{treinador}</span>
          <strong>
            {formatarNome(ativo.nome)}
            {ativo.shiny && ' ★'}
          </strong>
          <span className="batalha-detalhe">
            {ativo.mintNumero ? `${formatarNumero(ativo.mintNumero)} · Nv. ${ativo.nivel}` : `Nv. ${ativo.nivel}`}
          </span>
          <BarraHp pokemon={ativo} />
        </div>
      </div>
      {!selvagem && (
        <ul className="batalha-banco">
          {lado.pokemons.map((pokemon, i) => (
            <li
              key={pokemon.pokemonId}
              data-ativo={i === lado.ativo}
              data-nocauteado={pokemon.hp === 0}
              title={`${formatarNome(pokemon.nome)}: ${pokemon.hp}/${pokemon.hpMax} PS`}
            >
              <img src={urlArtwork(pokemon.especieId, pokemon.shiny)} alt={formatarNome(pokemon.nome)} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

LadoCampo.propTypes = {
  lado: PropTypes.shape({
    usuarioId: PropTypes.number,
    login: PropTypes.string.isRequired,
    ativo: PropTypes.number.isRequired,
    pokemons: PropTypes.arrayOf(formatoPokemonBatalha).isRequired,
  }).isRequired,
  meu: PropTypes.bool.isRequired,
};
