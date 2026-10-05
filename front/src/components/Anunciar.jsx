import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { formatoPokemon } from './formatos';
import { dadosTipo, formatarNome, formatarNumero } from './tipos';
import { urlArtwork, urlSprite } from '../services/pokeapi';
import * as api from '../services/api';

// Mesmo limite de back/src/jogo/config.js (PRECO_MAXIMO_ANUNCIO)
const PRECO_MAXIMO = 100000;

const somaIvs = (ivs) => Object.values(ivs).reduce((soma, iv) => soma + iv, 0);

function Anunciar({ usuario, onAtualizarUsuario, onVerPropostas }) {
  const [escolhidoId, setEscolhidoId] = useState(null);
  const [vender, setVender] = useState(true);
  const [preco, setPreco] = useState('');
  const [aceitaPropostas, setAceitaPropostas] = useState(true);
  const [meus, setMeus] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  // Muda para buscar "Meus anúncios" de novo
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    api.listarMeusAnuncios().then((lista) => {
      if (ativo) setMeus(lista);
    }, (e) => {
      if (ativo) setErro(e.message);
    });
    return () => {
      ativo = false;
    };
  }, [versao]);

  // Fora do time de batalha e ainda não anunciados
  const disponiveis = usuario.pokemons.filter((p) => !p.posicaoTime && !p.anunciado);
  const escolhido = disponiveis.find((p) => p.id === escolhidoId) ?? null;
  const valor = Number(preco);
  const precoValido = Number.isInteger(valor) && valor >= 1 && valor <= PRECO_MAXIMO;
  const podeAnunciar = escolhido && (vender || aceitaPropostas) && (!vender || precoValido);

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
      setVersao((v) => v + 1);
    }
  };

  const handleAnunciar = (evento) => {
    evento.preventDefault();
    executar(async () => {
      await api.criarAnuncio({ pokemonId: escolhido.id, preco: vender ? valor : null, aceitaPropostas });
      setAviso(`${formatarNome(escolhido.nome)} foi anunciado! Ele já aparece no mercado para outros treinadores.`);
      setEscolhidoId(null);
      setPreco('');
      await onAtualizarUsuario();
    });
  };

  const handleCancelar = (anuncio) => executar(async () => {
    await api.cancelarAnuncio(anuncio.id);
    setAviso(`O anúncio de ${formatarNome(anuncio.pokemon.nome)} foi cancelado.`);
    await onAtualizarUsuario();
  });

  return (
    <>
      {erro && <p className="jogo-erro" role="alert">{erro}</p>}
      {aviso && <p className="jogo-aviso" role="status">{aviso}</p>}

      <div className="trocas-anunciar">
        <section className="trocas-painel" aria-labelledby="anunciar-escolha">
          <h2 id="anunciar-escolha" className="trocas-subtitulo">1. Escolha o Pokémon</h2>
          {disponiveis.length === 0 ? (
            <p className="trocas-dica">
              Nenhum Pokémon disponível. Os do time de batalha não podem ser anunciados: compre mais na Loja
              ou troque o time para liberar algum.
            </p>
          ) : (
            <ul className="trocas-escolha">
              {disponiveis.map((pokemon) => (
                <li key={pokemon.id}>
                  <button
                    type="button"
                    className="trocas-escolha-item"
                    aria-pressed={pokemon.id === escolhidoId}
                    onClick={() => setEscolhidoId(pokemon.id)}
                  >
                    <img src={urlSprite(pokemon.especieId, pokemon.shiny)} alt="" loading="lazy" />
                    <strong>{`${formatarNome(pokemon.nome)}${pokemon.shiny ? ' ★' : ''}`}</strong>
                    <span>{`Nv. ${pokemon.nivel} · IVs ${somaIvs(pokemon.ivs)}`}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <form className="trocas-painel" onSubmit={handleAnunciar} aria-labelledby="anunciar-como">
          <h2 id="anunciar-como" className="trocas-subtitulo">2. Como quer negociar</h2>
          {escolhido ? (
            <div className="trocas-escolhido" style={{ '--trocas-cor': dadosTipo(escolhido.tipos[0]).cor }}>
              <img src={urlArtwork(escolhido.especieId, escolhido.shiny)} alt="" />
              <div>
                <strong>{formatarNome(escolhido.nome)}</strong>
                <span>{`${formatarNumero(escolhido.mintNumero)} · Nv. ${escolhido.nivel} · IVs ${somaIvs(escolhido.ivs)}/124`}</span>
              </div>
            </div>
          ) : (
            <p className="trocas-dica">Escolha um Pokémon ao lado.</p>
          )}

          <label className="trocas-opcao">
            <input type="checkbox" checked={vender} onChange={(e) => setVender(e.target.checked)} />
            <span>
              <strong>Vender por Pokécoins</strong>
              <span>Quem pagar o preço leva na hora.</span>
            </span>
          </label>
          {vender && (
            <label className="trocas-campo">
              <span>Preço em Pokécoins</span>
              <input
                type="number"
                min={1}
                max={PRECO_MAXIMO}
                step={1}
                inputMode="numeric"
                placeholder="Ex.: 150"
                value={preco}
                onChange={(e) => setPreco(e.target.value)}
              />
            </label>
          )}

          <label className="trocas-opcao">
            <input type="checkbox" checked={aceitaPropostas} onChange={(e) => setAceitaPropostas(e.target.checked)} />
            <span>
              <strong>Receber propostas de troca</strong>
              <span>Outros treinadores podem oferecer Pokémon e/ou Pokécoins. Você decide se aceita.</span>
            </span>
          </label>

          <p className="trocas-dica">
            Ao trocar de dono, o afeto do Pokémon volta a zero: ele vai precisar criar laços com o novo treinador.
          </p>

          <button type="submit" className="trocas-botao" disabled={!podeAnunciar || enviando}>
            {enviando ? 'Anunciando...' : 'Anunciar'}
          </button>
        </form>
      </div>

      <section className="trocas-meus" aria-labelledby="anunciar-meus">
        <h2 id="anunciar-meus" className="trocas-subtitulo">Meus anúncios</h2>
        {meus === null && !erro && <p aria-busy="true">Carregando...</p>}
        {meus?.length === 0 && <p className="trocas-dica">Você não tem anúncios ativos.</p>}
        <ul className="trocas-lista">
          {meus?.map((anuncio) => (
            <li key={anuncio.id} className="trocas-linha">
              <img src={urlSprite(anuncio.pokemon.especieId, anuncio.pokemon.shiny)} alt="" />
              <span className="trocas-linha-texto">
                <strong>{`${formatarNome(anuncio.pokemon.nome)} ${formatarNumero(anuncio.pokemon.mintNumero)}`}</strong>
                <span>
                  {[
                    anuncio.preco !== null && `${anuncio.preco.toLocaleString('pt-BR')} Pokécoins`,
                    anuncio.aceitaPropostas && 'aceita propostas',
                  ].filter(Boolean).join(' · ')}
                </span>
              </span>
              {anuncio.propostasPendentes > 0 && (
                <button type="button" className="trocas-selo" onClick={onVerPropostas}>
                  {`${anuncio.propostasPendentes} ${anuncio.propostasPendentes === 1 ? 'proposta' : 'propostas'}`}
                </button>
              )}
              <button
                type="button"
                className="trocas-botao trocas-botao--secundario"
                disabled={enviando}
                onClick={() => handleCancelar(anuncio)}
              >
                Cancelar
              </button>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}

Anunciar.propTypes = {
  usuario: PropTypes.shape({
    pokemons: PropTypes.arrayOf(formatoPokemon).isRequired,
  }).isRequired,
  onAtualizarUsuario: PropTypes.func.isRequired,
  onVerPropostas: PropTypes.func.isRequired,
};

export default Anunciar;
