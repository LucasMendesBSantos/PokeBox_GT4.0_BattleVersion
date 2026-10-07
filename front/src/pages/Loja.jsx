import { useState } from 'react';
import PropTypes from 'prop-types';
import CartaPokemon from '../components/CartaPokemon';
import { formatarNome, formatarNumero } from '../components/tipos';
import './Loja.css';

const PRECO = 100;
// Mesmo valor do back (config.PRECO_POKEBOLA)
const PRECO_POKEBOLA = 10;
const PACOTES_POKEBOLA = [1, 5, 10];

// Uma loja por geração, cada uma sorteia só entre as espécies do seu intervalo.
// Mesma lista do back (back/src/jogo/config.js, GERACOES)
const GERACOES = [
  { numero: 1, regiao: 'Kanto', primeira: 1, ultima: 151 },
  { numero: 2, regiao: 'Johto', primeira: 152, ultima: 251 },
  { numero: 3, regiao: 'Hoenn', primeira: 252, ultima: 386 },
  { numero: 4, regiao: 'Sinnoh', primeira: 387, ultima: 493 },
  { numero: 5, regiao: 'Unova', primeira: 494, ultima: 649 },
  { numero: 6, regiao: 'Kalos', primeira: 650, ultima: 721 },
  { numero: 7, regiao: 'Alola', primeira: 722, ultima: 809 },
  { numero: 8, regiao: 'Galar', primeira: 810, ultima: 905 },
  { numero: 9, regiao: 'Paldea', primeira: 906, ultima: 1025 },
];

// Pokébolas: usadas para capturar os Pokémon derrotados na história
function LojaPokebolas({ usuario, onComprarPokebolas }) {
  const [comprando, setComprando] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const pokebolas = usuario.pokebolas ?? 0;

  const handleComprar = async (quantidade) => {
    setComprando(quantidade);
    setErro(null);
    setAviso(null);
    try {
      await onComprarPokebolas(quantidade);
      setAviso(`${quantidade} Pokébola${quantidade === 1 ? '' : 's'} na mochila!`);
    } catch (e) {
      setErro(e.message);
    } finally {
      setComprando(null);
    }
  };

  return (
    <div className="loja-pokebolas jogo-painel">
      <div className="loja-pokebola" aria-hidden="true" data-girando={comprando !== null} />
      <div className="loja-pokebolas-info">
        <h2 className="loja-nome">Pokébolas</h2>
        <p className="loja-intervalo">
          {`${PRECO_POKEBOLA} Pokécoins cada. Use na História para tentar capturar os Pokémon que você derrotar (15% de chance). `}
          <strong>{`Você tem ${pokebolas}.`}</strong>
        </p>
        <div className="loja-pokebolas-botoes">
          {PACOTES_POKEBOLA.map((quantidade) => (
            <button
              key={quantidade}
              type="button"
              className="jogo-botao jogo-botao--azul"
              disabled={comprando !== null || usuario.pokecoins < quantidade * PRECO_POKEBOLA}
              onClick={() => handleComprar(quantidade)}
            >
              {`${quantidade}x · ${quantidade * PRECO_POKEBOLA}`}
            </button>
          ))}
        </div>
        {erro && <p className="jogo-erro" role="alert">{erro}</p>}
        {aviso && <p className="loja-dica" role="status">{aviso}</p>}
      </div>
    </div>
  );
}

LojaPokebolas.propTypes = {
  usuario: PropTypes.shape({ pokecoins: PropTypes.number.isRequired, pokebolas: PropTypes.number }).isRequired,
  onComprarPokebolas: PropTypes.func.isRequired,
};

function Loja({ usuario, onComprar, onComprarPokebolas }) {
  // Número da geração em sorteio agora (null quando nenhuma)
  const [comprando, setComprando] = useState(null);
  const [erro, setErro] = useState(null);
  // Os cards comprados nesta visita, do mais novo para o mais antigo
  const [comprados, setComprados] = useState([]);

  const podeComprar = usuario.pokecoins >= PRECO;

  const handleComprar = async (numeroGeracao) => {
    setComprando(numeroGeracao);
    setErro(null);
    try {
      const { pokemon } = await onComprar(numeroGeracao);
      setComprados((atual) => [pokemon, ...atual]);
    } catch (e) {
      setErro(e.message);
    } finally {
      setComprando(null);
    }
  };

  const [ultimo, ...anteriores] = comprados;

  return (
    <section className="loja">
      <h1 className="jogo-titulo">Loja</h1>
      <p className="jogo-texto">
        Uma loja por geração: cada uma sorteia só entre os Pokémon dela.
        Cada Pokémon é sorteado na hora e é único: IVs, altura, peso e a chance de 1% de ser shiny.
        Lendários e míticos também podem aparecer, mas são bem mais raros.
      </p>

      <div className="loja-resumo">
        <p className="loja-preco">{`Cada Pokémon: ${PRECO} Pokécoins`}</p>
        <p className="loja-saldo">{`Seu saldo: ${usuario.pokecoins} Pokécoins`}</p>
        {!podeComprar && (
          <p className="loja-dica">
            Sem Pokécoins suficientes. Batalhe para ganhar mais: +40 na vitória e +10 na derrota.
          </p>
        )}
      </div>

      <LojaPokebolas usuario={usuario} onComprarPokebolas={onComprarPokebolas} />

      <ul className="loja-geracoes">
        {GERACOES.map((g) => {
          const sorteando = comprando === g.numero;
          return (
            <li key={g.numero} className="loja-geracao jogo-painel">
              <div className="loja-pokebola" aria-hidden="true" data-girando={sorteando} />
              <p className="loja-geracao-numero">{`Geração ${g.numero}`}</p>
              <h2 className="loja-nome">{g.regiao}</h2>
              <p className="loja-intervalo">{`${formatarNumero(g.primeira)} a ${formatarNumero(g.ultima)}`}</p>
              <button
                type="button"
                className="jogo-botao"
                onClick={() => handleComprar(g.numero)}
                disabled={!podeComprar || comprando !== null}
                aria-label={`Comprar Pokémon da geração ${g.numero} (${g.regiao})`}
              >
                {sorteando ? 'Sorteando...' : 'Comprar'}
              </button>
            </li>
          );
        })}
      </ul>

      {erro && <p className="jogo-erro" role="alert">{erro}</p>}

      {ultimo && (
        <div className="loja-revelado" role="status">
          <p className="loja-revelado-titulo">
            {`Você recebeu ${formatarNome(ultimo.nome)} ${formatarNumero(ultimo.mintNumero)}!`}
            {ultimo.shiny && ' É shiny!'}
            {ultimo.posicaoTime ? ` Ele entrou no seu time na posição ${ultimo.posicaoTime}.` : ' Ele foi para a sua coleção.'}
          </p>
          <div className="loja-revelado-carta">
            <CartaPokemon pokemon={ultimo} />
          </div>
        </div>
      )}

      {anteriores.length > 0 && (
        <>
          <h2 className="loja-subtitulo">Compras anteriores</h2>
          <ul className="loja-grade">
            {anteriores.map((pokemon) => (
              <li key={pokemon.id}><CartaPokemon pokemon={pokemon} compacto /></li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

Loja.propTypes = {
  usuario: PropTypes.shape({ pokecoins: PropTypes.number.isRequired, pokebolas: PropTypes.number }).isRequired,
  onComprar: PropTypes.func.isRequired,
  onComprarPokebolas: PropTypes.func.isRequired,
};

export default Loja;
