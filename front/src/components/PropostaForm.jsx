import { useState } from 'react';
import PropTypes from 'prop-types';
import Avatar from './Avatar';
import { formatoPokemon } from './formatos';
import { formatarNome, formatarNumero } from './tipos';
import { urlArtwork, urlSprite } from '../services/pokeapi';
import * as api from '../services/api';

// Mesmo limite de back/src/jogo/config.js (POKEMONS_POR_PROPOSTA)
const POKEMONS_MAXIMO = 6;

const somaIvs = (ivs) => Object.values(ivs).reduce((soma, iv) => soma + iv, 0);

// Monta a oferta (Pokémon da coleção + Pokécoins) para um anúncio que aceita propostas
function PropostaForm({ anuncio, usuario, onCancelar, onEnviada }) {
  const [selecionados, setSelecionados] = useState([]);
  const [pokecoins, setPokecoins] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);

  // Pokémon do time de batalha não podem ser trocados
  const disponiveis = usuario.pokemons.filter((p) => !p.posicaoTime);
  const oferecidos = disponiveis.filter((p) => selecionados.includes(p.id));
  const moedas = Number(pokecoins) || 0;
  const alvo = anuncio.pokemon;
  const nomeAlvo = formatarNome(alvo.nome);

  const alternar = (id) => {
    setSelecionados((atual) => {
      if (atual.includes(id)) return atual.filter((outro) => outro !== id);
      return atual.length < POKEMONS_MAXIMO ? [...atual, id] : atual;
    });
  };

  const handleSubmit = async (evento) => {
    evento.preventDefault();
    setEnviando(true);
    setErro(null);
    try {
      await api.proporTroca(anuncio.id, { pokemonIds: selecionados, pokecoins: moedas });
      onEnviada();
    } catch (e) {
      setErro(e.message);
      setEnviando(false);
    }
  };

  return (
    <form className="trocas-proposta-form" onSubmit={handleSubmit}>
      <button type="button" className="trocas-voltar" onClick={onCancelar}>← Voltar aos anúncios</button>
      <h2 className="trocas-titulo">{`Propor troca por ${nomeAlvo}`}</h2>
      <p className="trocas-vendedor">
        <Avatar login={anuncio.vendedor} tamanho="pequeno" />
        <span>
          Anúncio de
          {' '}
          <strong>{anuncio.vendedor}</strong>
          {` · ${formatarNumero(alvo.mintNumero)} · Nv. ${alvo.nivel} · IVs ${alvo.ivTotal}/124`}
        </span>
      </p>

      {erro && <p className="jogo-erro" role="alert">{erro}</p>}

      {/* Resumo: oferta -> Pokémon do anúncio */}
      <div className="trocas-resumo" aria-label="Resumo da proposta">
        <div className="trocas-resumo-oferta">
          {oferecidos.length === 0 && moedas === 0 && <span className="trocas-dica">Escolha o que oferecer abaixo</span>}
          {oferecidos.map((p, i) => (
            <span key={p.id} className="trocas-resumo-item">
              {i > 0 && <span className="trocas-mais" aria-hidden="true">+</span>}
              <img src={urlArtwork(p.especieId, p.shiny)} alt="" />
              <span>{formatarNome(p.nome)}</span>
            </span>
          ))}
          {moedas > 0 && (
            <span className="trocas-resumo-item">
              {oferecidos.length > 0 && <span className="trocas-mais" aria-hidden="true">+</span>}
              <span className="trocas-moedas">{moedas.toLocaleString('pt-BR')}</span>
              <span>Pokécoins</span>
            </span>
          )}
        </div>
        <span className="trocas-seta" aria-hidden="true">→</span>
        <span className="trocas-resumo-item trocas-resumo-alvo">
          <img src={urlArtwork(alvo.especieId, alvo.shiny)} alt="" />
          <span>{nomeAlvo}</span>
        </span>
      </div>

      <fieldset className="trocas-campo">
        <legend>{`Seus Pokémon (${selecionados.length}/${POKEMONS_MAXIMO})`}</legend>
        {disponiveis.length === 0 ? (
          <p className="trocas-dica">Todos os seus Pokémon estão no time de batalha, e eles não podem ser trocados. Você ainda pode oferecer Pokécoins.</p>
        ) : (
          <>
            <p className="trocas-dica">Só aparecem os que estão fora do time de batalha.</p>
            <ul className="trocas-escolha">
              {disponiveis.map((pokemon) => (
                <li key={pokemon.id}>
                  <button
                    type="button"
                    className="trocas-escolha-item"
                    aria-pressed={selecionados.includes(pokemon.id)}
                    disabled={!selecionados.includes(pokemon.id) && selecionados.length >= POKEMONS_MAXIMO}
                    onClick={() => alternar(pokemon.id)}
                  >
                    <img src={urlSprite(pokemon.especieId, pokemon.shiny)} alt="" loading="lazy" />
                    <strong>{`${formatarNome(pokemon.nome)}${pokemon.shiny ? ' ★' : ''}`}</strong>
                    <span>{`Nv. ${pokemon.nivel} · IVs ${somaIvs(pokemon.ivs)}`}</span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </fieldset>

      <label className="trocas-campo">
        <span>{`Pokécoins (você tem ${usuario.pokecoins.toLocaleString('pt-BR')})`}</span>
        <input
          type="number"
          min={0}
          max={usuario.pokecoins}
          step={1}
          inputMode="numeric"
          placeholder="0"
          value={pokecoins}
          onChange={(e) => setPokecoins(e.target.value)}
        />
      </label>

      <p className="trocas-dica">
        {`Nada fica reservado: se ${anuncio.vendedor} aceitar, a troca acontece na hora, desde que você ainda tenha o que ofereceu.`}
      </p>

      <div className="trocas-form-botoes">
        <button type="button" className="trocas-botao trocas-botao--secundario" onClick={onCancelar} disabled={enviando}>Cancelar</button>
        <button
          type="submit"
          className="trocas-botao"
          disabled={enviando || (oferecidos.length === 0 && moedas === 0) || moedas > usuario.pokecoins}
        >
          {enviando ? 'Enviando...' : 'Enviar proposta'}
        </button>
      </div>
    </form>
  );
}

PropostaForm.propTypes = {
  anuncio: PropTypes.shape({
    id: PropTypes.number.isRequired,
    vendedor: PropTypes.string.isRequired,
    pokemon: PropTypes.shape({
      especieId: PropTypes.number.isRequired,
      nome: PropTypes.string.isRequired,
      shiny: PropTypes.bool.isRequired,
      mintNumero: PropTypes.number.isRequired,
      nivel: PropTypes.number.isRequired,
      ivTotal: PropTypes.number.isRequired,
    }).isRequired,
  }).isRequired,
  usuario: PropTypes.shape({
    pokecoins: PropTypes.number.isRequired,
    pokemons: PropTypes.arrayOf(formatoPokemon).isRequired,
  }).isRequired,
  onCancelar: PropTypes.func.isRequired,
  onEnviada: PropTypes.func.isRequired,
};

export default PropostaForm;
