import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { listarOpcoesFiltro } from '../services/pokeapi';
import './FiltrosPokemons.css';

// "lightning-rod" -> "Lightning Rod"
function formatarNome(nome) {
  return nome
    .split('-')
    .map((parte) => parte.charAt(0).toUpperCase() + parte.slice(1))
    .join(' ');
}

const REGIOES = {
  'generation-i': '1ª Geração (Kanto)',
  'generation-ii': '2ª Geração (Johto)',
  'generation-iii': '3ª Geração (Hoenn)',
  'generation-iv': '4ª Geração (Sinnoh)',
  'generation-v': '5ª Geração (Unova)',
  'generation-vi': '6ª Geração (Kalos)',
  'generation-vii': '7ª Geração (Alola)',
  'generation-viii': '8ª Geração (Galar)',
  'generation-ix': '9ª Geração (Paldea)',
};

// Um filtro por recurso da PokeAPI, com os nomes traduzidos
const FILTROS = [
  {
    recurso: 'type',
    rotulo: 'Tipo',
    // Tipos que não têm nenhum Pokémon
    ignorar: ['stellar', 'unknown', 'shadow'],
    traducoes: {
      normal: 'Normal',
      fire: 'Fogo',
      water: 'Água',
      grass: 'Planta',
      electric: 'Elétrico',
      ice: 'Gelo',
      fighting: 'Lutador',
      poison: 'Venenoso',
      ground: 'Terrestre',
      flying: 'Voador',
      psychic: 'Psíquico',
      bug: 'Inseto',
      rock: 'Pedra',
      ghost: 'Fantasma',
      dragon: 'Dragão',
      dark: 'Sombrio',
      steel: 'Aço',
      fairy: 'Fada',
    },
  },
  { recurso: 'generation', rotulo: 'Geração / Região', traducoes: REGIOES },
];

function FiltrosPokemons({ filtros, onAlterar, onLimpar }) {
  const [aberto, setAberto] = useState(false);
  // recurso -> lista de opções, ou false quando a requisição falhou
  const [opcoes, setOpcoes] = useState({});

  useEffect(() => {
    let ativo = true;
    FILTROS.forEach(({ recurso, ignorar = [] }) => {
      listarOpcoesFiltro(recurso)
        .then((nomes) => nomes.filter((nome) => !ignorar.includes(nome)), () => false)
        .then((resultado) => {
          if (ativo) setOpcoes((atual) => ({ ...atual, [recurso]: resultado }));
        });
    });
    return () => {
      ativo = false;
    };
  }, []);

  const quantidadeAtivos = Object.keys(filtros).length;

  const renderOpcoes = (recurso, traducoes) => {
    if (!opcoes[recurso]) return null;

    return opcoes[recurso]
      .map((nome) => ({ nome, rotulo: traducoes?.[nome] ?? formatarNome(nome) }))
      .sort((a, b) => (traducoes === REGIOES ? 0 : a.rotulo.localeCompare(b.rotulo, 'pt-BR')))
      .map(({ nome, rotulo }) => (
        <option key={nome} value={nome}>{rotulo}</option>
      ));
  };

  const textoVazio = (recurso) => {
    if (opcoes[recurso] === false) return 'Não foi possível carregar';
    if (!opcoes[recurso]) return 'Carregando...';
    return 'Todos';
  };

  return (
    <section className="filtros">
      <div className="filtros-acoes">
        <button
          type="button"
          className="filtros-alternar"
          aria-expanded={aberto}
          aria-controls="filtros-painel"
          onClick={() => setAberto((valor) => !valor)}
        >
          {quantidadeAtivos > 0 ? `Filtros (${quantidadeAtivos})` : 'Filtros'}
          <span aria-hidden="true">{aberto ? ' ▲' : ' ▼'}</span>
        </button>

        {quantidadeAtivos > 0 && (
          <button type="button" className="filtros-limpar" onClick={() => onLimpar()}>
            Limpar filtros
          </button>
        )}
      </div>

      {aberto && (
        <div id="filtros-painel" className="filtros-painel">
          {FILTROS.map(({ recurso, rotulo, traducoes }) => (
            <label key={recurso} className="filtros-campo" htmlFor={`filtros-${recurso}`}>
              <span>{rotulo}</span>
              <select
                id={`filtros-${recurso}`}
                value={filtros[recurso] ?? ''}
                disabled={!opcoes[recurso]}
                onChange={(e) => onAlterar(recurso, e.target.value || null)}
              >
                <option value="">{textoVazio(recurso)}</option>
                {renderOpcoes(recurso, traducoes)}
              </select>
            </label>
          ))}
        </div>
      )}
    </section>
  );
}

FiltrosPokemons.propTypes = {
  filtros: PropTypes.objectOf(PropTypes.string).isRequired,
  onAlterar: PropTypes.func.isRequired,
  onLimpar: PropTypes.func.isRequired,
};

export default FiltrosPokemons;
