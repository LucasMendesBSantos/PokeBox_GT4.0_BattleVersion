import { useState } from 'react';
import PropTypes from 'prop-types';
import CartaPokemon from '../components/CartaPokemon';
import { formatarNome, formatarNumero } from '../components/tipos';
import './Loja.css';

const PRECO = 100;

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

function Loja({ usuario, onComprar }) {
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
  usuario: PropTypes.shape({ pokecoins: PropTypes.number.isRequired }).isRequired,
  onComprar: PropTypes.func.isRequired,
};

export default Loja;
