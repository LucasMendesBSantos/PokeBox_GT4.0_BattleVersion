import { useState } from 'react';
import PropTypes from 'prop-types';
import './PokemonCard.css';

const TIPOS = {
  normal: { nome: 'Normal', cor: '#a8a77a' },
  fire: { nome: 'Fogo', cor: '#ee8130' },
  water: { nome: 'Água', cor: '#6390f0' },
  grass: { nome: 'Planta', cor: '#7ac74c' },
  electric: { nome: 'Elétrico', cor: '#f7d02c' },
  ice: { nome: 'Gelo', cor: '#96d9d6' },
  fighting: { nome: 'Lutador', cor: '#c22e28' },
  poison: { nome: 'Venenoso', cor: '#a33ea1' },
  ground: { nome: 'Terrestre', cor: '#e2bf65' },
  flying: { nome: 'Voador', cor: '#a98ff3' },
  psychic: { nome: 'Psíquico', cor: '#f95587' },
  bug: { nome: 'Inseto', cor: '#a6b91a' },
  rock: { nome: 'Pedra', cor: '#b6a136' },
  ghost: { nome: 'Fantasma', cor: '#735797' },
  dragon: { nome: 'Dragão', cor: '#6f35fc' },
  dark: { nome: 'Sombrio', cor: '#705746' },
  steel: { nome: 'Aço', cor: '#b7b7ce' },
  fairy: { nome: 'Fada', cor: '#d685ad' },
};

const TIPO_DESCONHECIDO = { nome: '???', cor: '#68a090' };

const STATS = {
  hp: 'PS',
  attack: 'Ataque',
  defense: 'Defesa',
  'special-attack': 'Ataque Esp.',
  'special-defense': 'Defesa Esp.',
  speed: 'Velocidade',
};

// Maior valor base possível de um atributo (Blissey tem 255 de PS)
const STAT_MAXIMO = 255;

// "lightning-rod" -> "Lightning Rod"
function formatarNome(nome) {
  return nome
    .split('-')
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(' ');
}

function formatarNumero(id) {
  return `#${String(id).padStart(4, '0')}`;
}

function PokemonCard({ pokemon }) {
  const [shiny, setShiny] = useState(false);

  const tipos = pokemon.types.map(({ type }) => ({
    id: type.name,
    ...(TIPOS[type.name] ?? TIPO_DESCONHECIDO),
  }));
  const corPrincipal = tipos[0]?.cor ?? TIPO_DESCONHECIDO.cor;

  const artwork = pokemon.sprites.other?.['official-artwork'];
  const imagem = shiny
    ? artwork?.front_shiny ?? pokemon.sprites.front_shiny
    : artwork?.front_default ?? pokemon.sprites.front_default;

  const abilities = pokemon.abilities ?? [];
  const stats = pokemon.stats ?? [];
  const moves = pokemon.moves ?? [];
  const heldItems = pokemon.held_items ?? [];
  const gameIndices = pokemon.game_indices ?? [];
  const forms = pokemon.forms ?? [];
  const grito = pokemon.cries?.latest ?? pokemon.cries?.legacy ?? null;
  const totalStats = stats.reduce((soma, { base_stat: valor }) => soma + valor, 0);

  const handleOuvirGrito = () => {
    new Audio(grito).play().catch(() => {});
  };

  return (
    <article className="pokemon-card" style={{ '--pokemon-card-cor': corPrincipal }}>
      <header className="pokemon-card-topo">
        <span className="pokemon-card-numero">{formatarNumero(pokemon.id)}</span>
        <h2 className="pokemon-card-nome">{formatarNome(pokemon.name)}</h2>
        <ul className="pokemon-card-tipos">
          {tipos.map((tipo) => (
            <li key={tipo.id} className="pokemon-card-tipo" style={{ background: tipo.cor }}>
              {tipo.nome}
            </li>
          ))}
        </ul>
      </header>

      <div className="pokemon-card-imagem">
        {imagem && (
          <img
            src={imagem}
            alt={`${formatarNome(pokemon.name)}${shiny ? ' shiny' : ''}`}
            loading="lazy"
          />
        )}
        <button
          type="button"
          className="pokemon-card-shiny"
          aria-pressed={shiny}
          onClick={() => setShiny((valor) => !valor)}
        >
          {shiny ? '★ Shiny' : '☆ Normal'}
        </button>
      </div>

      <dl className="pokemon-card-medidas">
        <div>
          <dt>Altura</dt>
          <dd>{`${(pokemon.height / 10).toLocaleString('pt-BR')} m`}</dd>
        </div>
        <div>
          <dt>Peso</dt>
          <dd>{`${(pokemon.weight / 10).toLocaleString('pt-BR')} kg`}</dd>
        </div>
        <div>
          <dt>Exp. base</dt>
          <dd>{pokemon.base_experience ?? '—'}</dd>
        </div>
      </dl>

      <section className="pokemon-card-secao">
        <h3>Habilidades</h3>
        <ul className="pokemon-card-habilidades">
          {abilities.map(({ ability, is_hidden: oculta }) => (
            <li key={ability.name}>
              {formatarNome(ability.name)}
              {oculta && <span className="pokemon-card-oculta">oculta</span>}
            </li>
          ))}
        </ul>
      </section>

      <section className="pokemon-card-secao">
        <h3>Atributos base</h3>
        <ul className="pokemon-card-stats">
          {stats.map(({ stat, base_stat: valor }) => (
            <li key={stat.name}>
              <span className="pokemon-card-stat-nome">{STATS[stat.name] ?? formatarNome(stat.name)}</span>
              <span className="pokemon-card-stat-valor">{valor}</span>
              <span className="pokemon-card-stat-barra">
                <span style={{ width: `${Math.min(valor / STAT_MAXIMO, 1) * 100}%` }} />
              </span>
            </li>
          ))}
          <li className="pokemon-card-stat-total">
            <span className="pokemon-card-stat-nome">Total</span>
            <span className="pokemon-card-stat-valor">{totalStats}</span>
          </li>
        </ul>
      </section>

      <details className="pokemon-card-detalhes">
        <summary>Mais informações</summary>

        <section className="pokemon-card-secao">
          <h3>{`Movimentos (${moves.length})`}</h3>
          <ul className="pokemon-card-chips">
            {moves.map(({ move }) => (
              <li key={move.name}>{formatarNome(move.name)}</li>
            ))}
          </ul>
        </section>

        <section className="pokemon-card-secao">
          <h3>Itens que pode carregar</h3>
          {heldItems.length > 0 ? (
            <ul className="pokemon-card-chips">
              {heldItems.map(({ item }) => (
                <li key={item.name}>{formatarNome(item.name)}</li>
              ))}
            </ul>
          ) : (
            <p className="pokemon-card-vazio">Nenhum</p>
          )}
        </section>

        <section className="pokemon-card-secao">
          <h3>{`Jogos (${gameIndices.length})`}</h3>
          {gameIndices.length > 0 ? (
            <ul className="pokemon-card-chips">
              {gameIndices.map(({ version }) => (
                <li key={version.name}>{formatarNome(version.name)}</li>
              ))}
            </ul>
          ) : (
            <p className="pokemon-card-vazio">Nenhum</p>
          )}
        </section>

        <dl className="pokemon-card-extras">
          <div>
            <dt>Espécie</dt>
            <dd>{formatarNome(pokemon.species?.name ?? pokemon.name)}</dd>
          </div>
          <div>
            <dt>Formas</dt>
            <dd>{forms.map(({ name }) => formatarNome(name)).join(', ') || '—'}</dd>
          </div>
        </dl>

        {grito && (
          <button type="button" className="pokemon-card-grito" onClick={handleOuvirGrito}>
            ♪ Ouvir grito
          </button>
        )}
      </details>
    </article>
  );
}

const nomeApi = PropTypes.shape({ name: PropTypes.string.isRequired });

PokemonCard.propTypes = {
  pokemon: PropTypes.shape({
    id: PropTypes.number.isRequired,
    name: PropTypes.string.isRequired,
    height: PropTypes.number.isRequired,
    weight: PropTypes.number.isRequired,
    base_experience: PropTypes.number,
    types: PropTypes.arrayOf(PropTypes.shape({ type: nomeApi.isRequired })).isRequired,
    abilities: PropTypes.arrayOf(PropTypes.shape({
      is_hidden: PropTypes.bool,
      ability: nomeApi.isRequired,
    })),
    stats: PropTypes.arrayOf(PropTypes.shape({
      base_stat: PropTypes.number.isRequired,
      stat: nomeApi.isRequired,
    })),
    sprites: PropTypes.shape({
      front_default: PropTypes.string,
      front_shiny: PropTypes.string,
      other: PropTypes.shape({
        'official-artwork': PropTypes.shape({
          front_default: PropTypes.string,
          front_shiny: PropTypes.string,
        }),
      }),
    }).isRequired,
    cries: PropTypes.shape({
      latest: PropTypes.string,
      legacy: PropTypes.string,
    }),
    species: nomeApi,
    forms: PropTypes.arrayOf(nomeApi),
    moves: PropTypes.arrayOf(PropTypes.shape({ move: nomeApi.isRequired })),
    held_items: PropTypes.arrayOf(PropTypes.shape({ item: nomeApi.isRequired })),
    game_indices: PropTypes.arrayOf(PropTypes.shape({ version: nomeApi.isRequired })),
  }).isRequired,
};

export default PokemonCard;
