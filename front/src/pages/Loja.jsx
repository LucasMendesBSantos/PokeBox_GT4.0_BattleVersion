import { useState } from 'react';
import PropTypes from 'prop-types';
import CartaPokemon from '../components/CartaPokemon';
import { formatarNome, formatarNumero } from '../components/tipos';
import './Loja.css';

const PRECO = 100;

function Loja({ usuario, onComprar }) {
  const [comprando, setComprando] = useState(false);
  const [erro, setErro] = useState(null);
  // Os cards comprados nesta visita, do mais novo para o mais antigo
  const [comprados, setComprados] = useState([]);

  const podeComprar = usuario.pokecoins >= PRECO;

  const handleComprar = async () => {
    setComprando(true);
    setErro(null);
    try {
      const { pokemon } = await onComprar();
      setComprados((atual) => [pokemon, ...atual]);
    } catch (e) {
      setErro(e.message);
    } finally {
      setComprando(false);
    }
  };

  const [ultimo, ...anteriores] = comprados;

  return (
    <section className="loja">
      <h1 className="jogo-titulo">Loja</h1>
      <p className="jogo-texto">
        Cada Pokémon é sorteado na hora e é único: IVs, altura, peso e a chance de 1% de ser shiny.
        Lendários e míticos também podem aparecer, mas são bem mais raros.
      </p>

      <div className="loja-balcao jogo-painel">
        <div className="loja-pokebola" aria-hidden="true" data-girando={comprando} />
        <div className="loja-balcao-texto">
          <p className="loja-preco">{`Pokémon aleatório: ${PRECO} Pokécoins`}</p>
          <p className="loja-saldo">{`Seu saldo: ${usuario.pokecoins} Pokécoins`}</p>
          <button
            type="button"
            className="jogo-botao"
            onClick={handleComprar}
            disabled={!podeComprar || comprando}
          >
            {comprando ? 'Sorteando...' : 'Comprar'}
          </button>
          {!podeComprar && (
            <p className="loja-dica">
              Sem Pokécoins suficientes. Batalhe para ganhar mais: +40 na vitória e +10 na derrota.
            </p>
          )}
        </div>
      </div>

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
