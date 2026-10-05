import { useState } from 'react';
import PropTypes from 'prop-types';
import CartaPokemon from '../components/CartaPokemon';
import CantinhoCuidado from '../components/CantinhoCuidado';
import { formatoPokemon } from '../components/formatos';
import { formatarNome, formatarNumero } from '../components/tipos';
import { urlArtwork } from '../services/pokeapi';
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
  usuario, onEscolherInicial, onEvoluir, onCuidar,
}) {
  const [escolhido, setEscolhido] = useState(null);
  // Id do Pokémon aberto no cantinho de cuidado
  const [cuidandoId, setCuidandoId] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);

  const inicialEscolhido = encontrarInicial(escolhido);
  const cuidando = usuario.pokemons.find((pokemon) => pokemon.id === cuidandoId);

  // As duas ações seguem o mesmo roteiro: trava os botões, mostra erro ou aviso
  const executar = async (acao) => {
    setEnviando(true);
    setErro(null);
    setAviso(null);
    try {
      await acao();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const handleConfirmar = () => executar(async () => {
    await onEscolherInicial(escolhido);
    setEscolhido(null);
  });

  const handleEvoluir = (pokemon, evolucao) => executar(async () => {
    const evoluido = await onEvoluir(pokemon.id, evolucao.especieId);
    setAviso(`${formatarNome(pokemon.nome)} ${formatarNumero(pokemon.mintNumero)} evoluiu para ${formatarNome(evoluido.nome)}!`);
  });

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
          <button type="button" className="meus-pokemons-botao" onClick={handleConfirmar} disabled={enviando}>
            {enviando ? 'Enviando...' : 'Confirmar'}
          </button>
        </div>
      )}
    </section>
  );

  const renderColecao = () => (
    <section>
      <h2 className="meus-pokemons-titulo-secao">Meus Pokémon</h2>
      <p className="meus-pokemons-texto">
        {`${usuario.pokemons.length === 1 ? '1 Pokémon' : `${usuario.pokemons.length} Pokémon`}. `}
        Cada card é único: IVs, altura, peso e shiny foram sorteados quando ele chegou até você.
        Dê carinho, brinque e alimente seus Pokémon para ganhar corações de afeto.
      </p>

      <ul className="meus-pokemons-grade">
        {usuario.pokemons.map((pokemon) => (
          <li key={pokemon.id}>
            <CartaPokemon
              pokemon={pokemon}
              onEvoluir={handleEvoluir}
              evoluindo={enviando}
              onCuidar={() => {
                setAviso(null);
                setCuidandoId(pokemon.id);
                window.scrollTo(0, 0);
              }}
            />
          </li>
        ))}
      </ul>
    </section>
  );

  if (cuidando) {
    return <CantinhoCuidado pokemon={cuidando} onCuidar={onCuidar} onVoltar={() => setCuidandoId(null)} />;
  }

  return (
    <>
      {erro && <p className="jogo-erro" role="alert">{erro}</p>}
      {aviso && <p className="jogo-aviso" role="status">{aviso}</p>}
      {usuario.pokemons.length === 0 ? renderEscolhaInicial() : renderColecao()}
    </>
  );
}

MeusPokemons.propTypes = {
  usuario: PropTypes.shape({
    pokemons: PropTypes.arrayOf(formatoPokemon).isRequired,
  }).isRequired,
  onEscolherInicial: PropTypes.func.isRequired,
  onEvoluir: PropTypes.func.isRequired,
  onCuidar: PropTypes.func.isRequired,
};

export default MeusPokemons;
