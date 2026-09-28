import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import PropTypes from 'prop-types';
import FiltrosPokemons from '../components/FiltrosPokemons';
import PokemonCard from '../components/PokemonCard';
import { buscarFiltro, buscarPokemon, listarPokemons } from '../services/pokeapi';
import './Pokemons.css';

// Quantos cards são carregados por vez ao rolar a página
const PAGINA = 24;

// Busca pelo nome ("pika") ou pelo número ("25" ou "#0025")
function filtrarPokemons(pokemons, busca) {
  const termo = busca.trim().toLowerCase().replace(/^#0*/, '');
  if (!termo) return pokemons;

  return pokemons.filter(
    (pokemon) => pokemon.name.includes(termo) || String(pokemon.id) === termo,
  );
}

// Mantém só quem aparece em todos os filtros ativos
function aplicarFiltros(pokemons, conjuntos) {
  if (conjuntos.length === 0) return pokemons;

  return pokemons.filter((pokemon) => conjuntos.every(({ alvo, ids }) => (
    ids.has(alvo === 'pokemon' ? pokemon.id : pokemon.especieId)
  )));
}

const chaveFiltro = (recurso, nome) => `${recurso}/${nome}`;

function Pokemons({ usuario, onMeusPokemons, onSair }) {
  const [lista, setLista] = useState(null);
  const [erroLista, setErroLista] = useState(null);
  const [tentativa, setTentativa] = useState(0);
  // id -> dados do Pokémon, ou false quando a requisição falhou
  const [detalhes, setDetalhes] = useState({});
  const [busca, setBusca] = useState('');
  // recurso -> opção escolhida (ex.: { type: 'fire' }); filtro sem opção não entra aqui
  const [filtros, setFiltros] = useState({});
  // "recurso/nome" -> { alvo, ids }, ou false quando a requisição falhou
  const [conjuntos, setConjuntos] = useState({});
  const [quantidade, setQuantidade] = useState(PAGINA);
  const sentinelaRef = useRef(null);

  useEffect(() => {
    let ativo = true;
    listarPokemons()
      .then((pokemons) => {
        if (ativo) setLista(pokemons);
      })
      .catch(() => {
        if (ativo) setErroLista('Não foi possível carregar a Pokédex. Verifique sua conexão.');
      });
    return () => {
      ativo = false;
    };
  }, [tentativa]);

  // Busca na PokeAPI quem passa em cada filtro escolhido
  useEffect(() => {
    let ativo = true;
    Object.entries(filtros).forEach(([recurso, nome]) => {
      const chave = chaveFiltro(recurso, nome);
      buscarFiltro(recurso, nome)
        .then((conjunto) => conjunto, () => false)
        .then((resultado) => {
          if (ativo) setConjuntos((atual) => ({ ...atual, [chave]: resultado }));
        });
    });
    return () => {
      ativo = false;
    };
  }, [filtros]);

  const { filtrados, erroFiltro, aplicandoFiltros } = useMemo(() => {
    const ativos = Object.entries(filtros).map(
      ([recurso, nome]) => conjuntos[chaveFiltro(recurso, nome)],
    );
    const erro = ativos.includes(false);
    const aplicando = ativos.includes(undefined);

    if (!lista || erro || aplicando) {
      return { filtrados: [], erroFiltro: erro, aplicandoFiltros: aplicando };
    }
    return {
      filtrados: aplicarFiltros(filtrarPokemons(lista, busca), ativos),
      erroFiltro: false,
      aplicandoFiltros: false,
    };
  }, [lista, busca, filtros, conjuntos]);
  const visiveis = useMemo(() => filtrados.slice(0, quantidade), [filtrados, quantidade]);
  const temMais = visiveis.length < filtrados.length;

  // Busca os detalhes dos cards visíveis (o service evita requisições repetidas)
  useEffect(() => {
    let ativo = true;
    visiveis.forEach(({ id }) => {
      buscarPokemon(id)
        .then((pokemon) => pokemon, () => false)
        .then((resultado) => {
          if (!ativo) return;
          setDetalhes((atual) => (atual[id] === resultado ? atual : { ...atual, [id]: resultado }));
        });
    });
    return () => {
      ativo = false;
    };
  }, [visiveis]);

  // Carrega mais cards quando o fim da lista aparece na tela
  useEffect(() => {
    const sentinela = sentinelaRef.current;
    if (!sentinela || !temMais) return undefined;

    const observador = new IntersectionObserver((entradas) => {
      if (entradas[0].isIntersecting) {
        setQuantidade((atual) => atual + PAGINA);
      }
    }, { rootMargin: '400px' });
    observador.observe(sentinela);

    return () => observador.disconnect();
  }, [temMais, visiveis.length]);

  const handleBusca = (e) => {
    setBusca(e.target.value);
    setQuantidade(PAGINA);
  };

  const handleAlterarFiltro = (recurso, nome) => {
    setFiltros((atual) => {
      const novos = { ...atual };
      if (nome) {
        novos[recurso] = nome;
      } else {
        delete novos[recurso];
      }
      return novos;
    });
    setQuantidade(PAGINA);
  };

  const handleLimparFiltros = () => {
    setFiltros({});
    setQuantidade(PAGINA);
  };

  const renderVazio = () => {
    if (erroFiltro) {
      return (
        <p className="pokemons-status" role="alert">
          Não foi possível aplicar os filtros. Tente escolher de novo.
        </p>
      );
    }
    if (aplicandoFiltros) {
      return (
        <p className="pokemons-status" aria-busy="true">
          Aplicando filtros...
        </p>
      );
    }
    return (
      <p className="pokemons-status">
        {busca.trim()
          ? `Nenhum Pokémon encontrado para "${busca.trim()}" com esses filtros.`
          : 'Nenhum Pokémon encontrado com esses filtros.'}
      </p>
    );
  };

  const handleTentarNovamente = () => {
    setErroLista(null);
    setTentativa((atual) => atual + 1);
  };

  const renderConteudo = () => {
    if (erroLista) {
      return (
        <div className="pokemons-status" role="alert">
          <p>{erroLista}</p>
          <button type="button" className="pokemons-botao" onClick={handleTentarNovamente}>
            Tentar novamente
          </button>
        </div>
      );
    }

    if (!lista) {
      return (
        <p className="pokemons-status" aria-busy="true">
          Carregando a Pokédex...
        </p>
      );
    }

    return (
      <>
        <div className="pokemons-barra">
          <label className="pokemons-busca" htmlFor="pokemons-busca">
            <span>Buscar Pokémon</span>
            <input
              id="pokemons-busca"
              type="search"
              placeholder="Nome ou número"
              value={busca}
              onChange={handleBusca}
            />
          </label>
          <p className="pokemons-contagem" aria-live="polite">
            {`${filtrados.length} de ${lista.length} Pokémon`}
          </p>
        </div>

        <FiltrosPokemons
          filtros={filtros}
          onAlterar={handleAlterarFiltro}
          onLimpar={handleLimparFiltros}
        />

        {filtrados.length > 0 ? (
          <ul className="pokemons-grade">
            {visiveis.map(({ id, name }) => (
              <li key={id}>
                {detalhes[id] ? (
                  <PokemonCard pokemon={detalhes[id]} />
                ) : (
                  <div className="pokemons-card-carregando" aria-busy={detalhes[id] !== false}>
                    <span className="pokemons-card-carregando-numero">{`#${String(id).padStart(4, '0')}`}</span>
                    <span className="pokemons-card-carregando-nome">{name.replace(/-/g, ' ')}</span>
                    <span>
                      {detalhes[id] === false ? 'Não foi possível carregar.' : 'Carregando...'}
                    </span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : renderVazio()}

        {temMais && (
          <div ref={sentinelaRef} className="pokemons-mais">
            <button
              type="button"
              className="pokemons-botao"
              onClick={() => setQuantidade((atual) => atual + PAGINA)}
            >
              Carregar mais
            </button>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="pokemons-page">
      <header className="pokemons-topo">
        <div className="pokemons-topo-conteudo">
          <div className="pokemons-marca">
            <span className="pokemons-lente" aria-hidden="true" />
            <h1 className="pokemons-titulo">PokeBox</h1>
          </div>

          <div className="pokemons-usuario">
            <span>{`Olá, ${usuario.login}!`}</span>
            <button type="button" className="pokemons-meus" onClick={() => onMeusPokemons()}>
              Meus Pokémon
            </button>
            <button type="button" className="pokemons-sair" onClick={() => onSair()}>
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="pokemons-conteudo">
        {renderConteudo()}
      </main>
    </div>
  );
}

Pokemons.propTypes = {
  usuario: PropTypes.shape({
    login: PropTypes.string.isRequired,
  }).isRequired,
  onMeusPokemons: PropTypes.func.isRequired,
  onSair: PropTypes.func.isRequired,
};

export default Pokemons;
