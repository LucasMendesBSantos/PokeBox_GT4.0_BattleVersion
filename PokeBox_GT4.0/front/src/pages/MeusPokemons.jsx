import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import PokemonCard from '../components/PokemonCard';
import { buscarPokemon, urlArtwork } from '../services/pokeapi';
import './MeusPokemons.css';

// Em todas as gerações os iniciais vêm na ordem planta, fogo e água
const TIPOS_INICIAIS = [
  { nome: 'Planta', cor: '#7ac74c' },
  { nome: 'Fogo', cor: '#ee8130' },
  { nome: 'Água', cor: '#6390f0' },
];

const INICIAIS = [
  {
    geracao: '1ª Geração',
    regiao: 'Kanto',
    pokemons: [{ id: 1, nome: 'Bulbasaur' }, { id: 4, nome: 'Charmander' }, { id: 7, nome: 'Squirtle' }],
  },
  {
    geracao: '2ª Geração',
    regiao: 'Johto',
    pokemons: [{ id: 152, nome: 'Chikorita' }, { id: 155, nome: 'Cyndaquil' }, { id: 158, nome: 'Totodile' }],
  },
  {
    geracao: '3ª Geração',
    regiao: 'Hoenn',
    pokemons: [{ id: 252, nome: 'Treecko' }, { id: 255, nome: 'Torchic' }, { id: 258, nome: 'Mudkip' }],
  },
  {
    geracao: '4ª Geração',
    regiao: 'Sinnoh',
    pokemons: [{ id: 387, nome: 'Turtwig' }, { id: 390, nome: 'Chimchar' }, { id: 393, nome: 'Piplup' }],
  },
  {
    geracao: '5ª Geração',
    regiao: 'Unova',
    pokemons: [{ id: 495, nome: 'Snivy' }, { id: 498, nome: 'Tepig' }, { id: 501, nome: 'Oshawott' }],
  },
  {
    geracao: '6ª Geração',
    regiao: 'Kalos',
    pokemons: [{ id: 650, nome: 'Chespin' }, { id: 653, nome: 'Fennekin' }, { id: 656, nome: 'Froakie' }],
  },
  {
    geracao: '7ª Geração',
    regiao: 'Alola',
    pokemons: [{ id: 722, nome: 'Rowlet' }, { id: 725, nome: 'Litten' }, { id: 728, nome: 'Popplio' }],
  },
  {
    geracao: '8ª Geração',
    regiao: 'Galar',
    pokemons: [{ id: 810, nome: 'Grookey' }, { id: 813, nome: 'Scorbunny' }, { id: 816, nome: 'Sobble' }],
  },
  {
    geracao: '9ª Geração',
    regiao: 'Paldea',
    pokemons: [{ id: 906, nome: 'Sprigatito' }, { id: 909, nome: 'Fuecoco' }, { id: 912, nome: 'Quaxly' }],
  },
];

function encontrarInicial(id) {
  return INICIAIS.flatMap(({ pokemons }) => pokemons).find((pokemon) => pokemon.id === id) ?? null;
}

function MeusPokemons({
  usuario,
  onEscolherInicial,
  onTodosPokemons,
  onSair,
}) {
  const [escolhido, setEscolhido] = useState(null);
  // id -> dados do Pokémon, ou false quando a requisição falhou
  const [detalhes, setDetalhes] = useState({});

  useEffect(() => {
    let ativo = true;
    usuario.box.forEach((id) => {
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
  }, [usuario.box]);

  const inicialEscolhido = encontrarInicial(escolhido);

  const handleConfirmar = () => {
    onEscolherInicial(escolhido);
    setEscolhido(null);
  };

  const renderEscolhaInicial = () => (
    <section className="meus-pokemons-inicial">
      <h2 className="meus-pokemons-titulo-secao">Escolha seu Pokémon inicial</h2>
      <p className="meus-pokemons-texto">
        Todo treinador começa a jornada com um parceiro. Escolha um dos Pokémon abaixo.
      </p>

      {INICIAIS.map(({ geracao, regiao, pokemons }) => (
        <section key={geracao} className="meus-pokemons-geracao">
          <h3>{`${geracao} (${regiao})`}</h3>
          <ul className="meus-pokemons-opcoes">
            {pokemons.map(({ id, nome }, posicao) => (
              <li key={id}>
                <button
                  type="button"
                  className="meus-pokemons-opcao"
                  aria-pressed={escolhido === id}
                  style={{ '--meus-pokemons-cor': TIPOS_INICIAIS[posicao].cor }}
                  onClick={() => setEscolhido(id)}
                >
                  <img src={urlArtwork(id)} alt="" loading="lazy" />
                  <span className="meus-pokemons-opcao-nome">{nome}</span>
                  <span className="meus-pokemons-opcao-tipo">{TIPOS_INICIAIS[posicao].nome}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {inicialEscolhido && (
        <div className="meus-pokemons-confirmar" role="status">
          <span>{`Você escolheu ${inicialEscolhido.nome}!`}</span>
          <button type="button" className="meus-pokemons-botao" onClick={handleConfirmar}>
            Confirmar
          </button>
        </div>
      )}
    </section>
  );

  const renderBox = () => (
    <section>
      <h2 className="meus-pokemons-titulo-secao">Meus Pokémon</h2>
      <p className="meus-pokemons-texto">
        {usuario.box.length === 1 ? '1 Pokémon' : `${usuario.box.length} Pokémon`}
      </p>

      <ul className="meus-pokemons-grade">
        {usuario.box.map((id) => (
          <li key={id}>
            {detalhes[id] ? (
              <PokemonCard pokemon={detalhes[id]} />
            ) : (
              <div className="meus-pokemons-card-carregando" aria-busy={detalhes[id] !== false}>
                {detalhes[id] === false ? 'Não foi possível carregar.' : 'Carregando...'}
              </div>
            )}
          </li>
        ))}
      </ul>
    </section>
  );

  return (
    <div className="meus-pokemons-page">
      <header className="meus-pokemons-topo">
        <div className="meus-pokemons-topo-conteudo">
          <div className="meus-pokemons-marca">
            <span className="meus-pokemons-lente" aria-hidden="true" />
            <h1 className="meus-pokemons-titulo">PokeBox</h1>
          </div>

          <div className="meus-pokemons-usuario">
            <span>{`Olá, ${usuario.login}!`}</span>
            <button type="button" className="meus-pokemons-todos" onClick={() => onTodosPokemons()}>
              Todos os Pokémon
            </button>
            <button type="button" className="meus-pokemons-sair" onClick={() => onSair()}>
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="meus-pokemons-conteudo">
        {usuario.box.length === 0 ? renderEscolhaInicial() : renderBox()}
      </main>
    </div>
  );
}

MeusPokemons.propTypes = {
  usuario: PropTypes.shape({
    login: PropTypes.string.isRequired,
    box: PropTypes.arrayOf(PropTypes.number).isRequired,
  }).isRequired,
  onEscolherInicial: PropTypes.func.isRequired,
  onTodosPokemons: PropTypes.func.isRequired,
  onSair: PropTypes.func.isRequired,
};

export default MeusPokemons;
