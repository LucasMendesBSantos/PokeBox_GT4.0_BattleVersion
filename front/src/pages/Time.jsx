import { useState } from 'react';
import PropTypes from 'prop-types';
import CartaPokemon from '../components/CartaPokemon';
import { formatoPokemon, resumoEvolucao } from '../components/formatos';
import { formatarNome, formatarNumero } from '../components/tipos';
import { urlArtwork } from '../services/pokeapi';
import './Time.css';

const TAMANHO_TIME = 3;

const timeAtual = (pokemons) => pokemons
  .filter((p) => p.posicaoTime)
  .sort((a, b) => a.posicaoTime - b.posicaoTime)
  .map((p) => p.id);

function Time({ usuario, onSalvar, onIrParaLoja }) {
  // Ids na ordem escolhida (o primeiro abre a batalha)
  const [selecionados, setSelecionados] = useState(() => timeAtual(usuario.pokemons));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);

  const porId = new Map(usuario.pokemons.map((p) => [p.id, p]));
  const salvo = timeAtual(usuario.pokemons);
  const mudou = selecionados.join() !== salvo.join();

  const alternar = (id) => {
    setAviso(null);
    setSelecionados((atual) => {
      if (atual.includes(id)) return atual.filter((x) => x !== id);
      if (atual.length >= TAMANHO_TIME) return atual;
      return [...atual, id];
    });
  };

  const mover = (indice, direcao) => {
    setAviso(null);
    setSelecionados((atual) => {
      const novo = [...atual];
      const destino = indice + direcao;
      [novo[indice], novo[destino]] = [novo[destino], novo[indice]];
      return novo;
    });
  };

  const handleSalvar = async () => {
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar(selecionados);
      setAviso('Time salvo! Ele vale para os próximos desafios que você aceitar ou enviar.');
    } catch (e) {
      setErro(e.message);
    } finally {
      setSalvando(false);
    }
  };

  if (usuario.pokemons.length < TAMANHO_TIME) {
    return (
      <section>
        <h1 className="jogo-titulo">Time</h1>
        <p className="jogo-texto">
          {`Para batalhar você precisa de ${TAMANHO_TIME} Pokémon. Você tem ${usuario.pokemons.length}.`}
        </p>
        <button type="button" className="jogo-botao" onClick={() => onIrParaLoja()}>
          Ir para a loja
        </button>
      </section>
    );
  }

  return (
    <section className="time">
      <h1 className="jogo-titulo">Time</h1>
      <p className="jogo-texto">
        {`Escolha ${TAMANHO_TIME} Pokémon da coleção. O primeiro abre a batalha, e quando um é nocauteado o próximo da fila entra.`}
      </p>

      <ol className="time-slots">
        {Array.from({ length: TAMANHO_TIME }, (_, i) => {
          const pokemon = porId.get(selecionados[i]);
          const evolucao = pokemon && resumoEvolucao(pokemon);
          return (
            <li key={i} className="time-slot" data-vazio={!pokemon}>
              <span className="time-slot-numero">{i + 1}</span>
              {pokemon ? (
                <>
                  <img src={urlArtwork(pokemon.especieId, pokemon.shiny)} alt="" />
                  <span className="time-slot-nome">{formatarNome(pokemon.nome)}</span>
                  <span className="time-slot-nivel">{`Nv. ${pokemon.nivel}`}</span>
                  <span className="time-slot-evolucao" data-pronto={evolucao?.pronto ?? false}>
                    {evolucao ? evolucao.texto : 'Não evolui mais'}
                  </span>
                  <span className="time-slot-acoes">
                    <button type="button" aria-label="Mover para a esquerda" disabled={i === 0} onClick={() => mover(i, -1)}>◀</button>
                    <button type="button" aria-label={`Tirar ${formatarNome(pokemon.nome)} do time`} onClick={() => alternar(pokemon.id)}>✕</button>
                    <button type="button" aria-label="Mover para a direita" disabled={i === selecionados.length - 1} onClick={() => mover(i, 1)}>▶</button>
                  </span>
                </>
              ) : (
                <span className="time-slot-vazio">Vazio</span>
              )}
            </li>
          );
        })}
      </ol>

      <div className="time-salvar">
        <button
          type="button"
          className="jogo-botao"
          disabled={selecionados.length !== TAMANHO_TIME || !mudou || salvando}
          onClick={handleSalvar}
        >
          {salvando ? 'Salvando...' : 'Salvar time'}
        </button>
        {selecionados.length !== TAMANHO_TIME && (
          <span>{`Faltam ${TAMANHO_TIME - selecionados.length}.`}</span>
        )}
      </div>

      {erro && <p className="jogo-erro" role="alert">{erro}</p>}
      {aviso && <p className="jogo-aviso" role="status">{aviso}</p>}

      <h2 className="time-subtitulo">Coleção</h2>
      <ul className="time-grade">
        {usuario.pokemons.map((pokemon) => {
          const posicao = selecionados.indexOf(pokemon.id);
          const cheio = posicao === -1 && selecionados.length >= TAMANHO_TIME;
          return (
            <li key={pokemon.id} className="time-opcao" data-no-time={posicao !== -1}>
              <CartaPokemon pokemon={{ ...pokemon, posicaoTime: posicao === -1 ? null : posicao + 1 }} compacto>
                <button
                  type="button"
                  className="jogo-botao jogo-botao--claro time-escolher"
                  disabled={cheio}
                  onClick={() => alternar(pokemon.id)}
                  aria-label={`${posicao === -1 ? 'Colocar no time' : 'Tirar do time'}: ${formatarNome(pokemon.nome)} ${formatarNumero(pokemon.mintNumero)}`}
                >
                  {posicao === -1 ? 'Colocar no time' : 'Tirar do time'}
                </button>
              </CartaPokemon>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

Time.propTypes = {
  usuario: PropTypes.shape({
    pokemons: PropTypes.arrayOf(formatoPokemon).isRequired,
  }).isRequired,
  onSalvar: PropTypes.func.isRequired,
  onIrParaLoja: PropTypes.func.isRequired,
};

export default Time;
