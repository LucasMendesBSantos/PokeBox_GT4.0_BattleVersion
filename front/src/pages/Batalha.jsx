import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { formatarNome, formatarNumero } from '../components/tipos';
import { tempoRestante } from '../components/tempo';
import { LadoCampo } from '../components/CampoBatalha';
import { BotoesGolpes } from '../components/Golpes';
import { descreverEventos } from '../components/eventosBatalha';
import { urlArtwork } from '../services/pokeapi';
import * as api from '../services/api';
import './Batalha.css';

// Enquanto espera o oponente, confere a cada 15s se ele já jogou
const ATUALIZAR_MS = 15 * 1000;

const MOTIVOS = { nocaute: 'por nocaute', wo: 'por W.O.', desistencia: 'por desistência' };

function Batalha({ batalhaId, onVoltar, onAtualizarUsuario }) {
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [trocando, setTrocando] = useState(false);
  const [confirmarDesistencia, setConfirmarDesistencia] = useState(false);

  const aplicar = useCallback((resposta) => {
    setDados(resposta);
    // Acabou: saldo e níveis mudaram, então o topo (Pokécoins) precisa atualizar
    if (resposta.batalha.status === 'finalizada') onAtualizarUsuario();
  }, [onAtualizarUsuario]);

  const carregar = useCallback(
    () => api.buscarBatalha(batalhaId).then(aplicar, (e) => setErro(e.message)),
    [batalhaId, aplicar],
  );

  useEffect(() => {
    let ativo = true;
    api.buscarBatalha(batalhaId).then(
      (resposta) => {
        if (ativo) aplicar(resposta);
      },
      (e) => {
        if (ativo) setErro(e.message);
      },
    );
    return () => {
      ativo = false;
    };
  }, [batalhaId, aplicar]);

  const batalha = dados?.batalha;
  const esperandoOponente = batalha?.status === 'em_andamento' && !batalha.minhaVez;

  useEffect(() => {
    if (!esperandoOponente) return undefined;
    const timer = setInterval(carregar, ATUALIZAR_MS);
    return () => clearInterval(timer);
  }, [esperandoOponente, carregar]);

  const enviarJogada = async (jogada) => {
    setEnviando(true);
    setErro(null);
    try {
      await api.jogar(batalhaId, jogada);
      setTrocando(false);
      setConfirmarDesistencia(false);
      await carregar();
    } catch (e) {
      setErro(e.message);
      await carregar();
    } finally {
      setEnviando(false);
    }
  };

  if (!dados) {
    return erro ? <p className="jogo-erro" role="alert">{erro}</p> : <p aria-busy="true">Carregando batalha...</p>;
  }

  const voltar = (
    <button type="button" className="jogo-botao jogo-botao--claro" onClick={() => onVoltar()}>
      ← Batalhas
    </button>
  );

  if (!batalha.estado) {
    return (
      <section>
        {voltar}
        <p className="jogo-texto">Essa batalha ainda não começou.</p>
      </section>
    );
  }

  const { estado } = batalha;
  const meuIndice = batalha.souDesafiante ? 0 : 1;
  const eu = estado.lados[meuIndice];
  const oponente = estado.lados[1 - meuIndice];
  const recompensas = batalha.minhasRecompensas;
  const reservas = eu.pokemons
    .map((pokemon, indice) => ({ pokemon, indice }))
    .filter(({ pokemon, indice }) => indice !== eu.ativo && pokemon.hp > 0);

  return (
    <section className="batalha">
      <div className="batalha-cabecalho">
        {voltar}
        <h1 className="jogo-titulo">{`vs ${batalha.oponente}`}</h1>
        {batalha.status === 'em_andamento' && (
          <p className="batalha-turno" role="status">
            {batalha.minhaVez
              ? `Turno ${batalha.turno} · Sua vez! Faltam ${tempoRestante(batalha.prazoEm)}.`
              : `Turno ${batalha.turno} · Vez de ${batalha.oponente} (${tempoRestante(batalha.prazoEm)} restantes). Você pode fechar a página.`}
          </p>
        )}
      </div>

      {batalha.status === 'finalizada' && (
        <div className="batalha-resultado" data-venci={batalha.venci} role="status">
          <strong>{`${batalha.venci ? 'Você venceu' : 'Você perdeu'} ${MOTIVOS[batalha.motivoFim]}!`}</strong>
          {recompensas && (recompensas.semRecompensa ? (
            <span>{recompensas.semRecompensa}</span>
          ) : (
            <span>{`+${recompensas.pokecoins} Pokécoins e +${recompensas.xp} XP para cada Pokémon do time.`}</span>
          ))}
          {recompensas?.subiram?.length > 0 && (
            <ul>
              {recompensas.subiram.map((s) => (
                <li key={s.pokemonId}>
                  {`${formatarNome(s.nome)} ${formatarNumero(s.mintNumero)} subiu para o nível ${s.nivel}${s.podeEvoluir ? ' e já pode evoluir!' : '.'}`}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <div className="batalha-campo">
        <LadoCampo lado={oponente} meu={false} />
        <LadoCampo lado={eu} meu />
      </div>

      {erro && <p className="jogo-erro" role="alert">{erro}</p>}

      {batalha.minhaVez && (
        <div className="batalha-acoes jogo-painel">
          <BotoesGolpes
            pokemon={eu.pokemons[eu.ativo]}
            desabilitado={enviando}
            onUsar={(indice) => enviarJogada({ tipo: 'golpe', indice })}
          />
          <button type="button" className="jogo-botao" disabled={enviando} onClick={() => enviarJogada({ tipo: 'atacar' })}>
            Atacar
          </button>
          <button
            type="button"
            className="jogo-botao jogo-botao--azul"
            disabled={enviando || reservas.length === 0}
            aria-expanded={trocando}
            onClick={() => setTrocando((v) => !v)}
          >
            Trocar Pokémon
          </button>
          {trocando && (
            <ul className="batalha-trocas">
              {reservas.map(({ pokemon, indice }) => (
                <li key={pokemon.pokemonId}>
                  <button type="button" disabled={enviando} onClick={() => enviarJogada({ tipo: 'trocar', indice })}>
                    <img src={urlArtwork(pokemon.especieId, pokemon.shiny)} alt="" />
                    <span>{formatarNome(pokemon.nome)}</span>
                    <span>{`${pokemon.hp}/${pokemon.hpMax} PS`}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {batalha.status === 'em_andamento' && (
        <div className="batalha-desistir">
          {confirmarDesistencia ? (
            <>
              <span>Desistir conta como derrota e não dá recompensa.</span>
              <button type="button" className="jogo-botao" disabled={enviando} onClick={() => enviarJogada({ tipo: 'desistir' })}>
                Confirmar desistência
              </button>
              <button type="button" className="jogo-botao jogo-botao--claro" onClick={() => setConfirmarDesistencia(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" className="batalha-link" onClick={() => setConfirmarDesistencia(true)}>
              Desistir da batalha
            </button>
          )}
        </div>
      )}

      <section className="batalha-historico">
        <h2>Histórico</h2>
        {dados.acoes.length === 0 ? (
          <p className="jogo-texto">Nenhuma jogada ainda.</p>
        ) : (
          <ol reversed>
            {[...dados.acoes].reverse().map((acao) => (
              <li key={`${acao.turno}-${acao.criadaEm}`} data-automatica={acao.automatica}>
                <span className="batalha-historico-turno">{`Turno ${acao.turno}`}</span>
                {descreverEventos(acao.eventos, estado).map((frase) => <span key={frase}>{frase}</span>)}
              </li>
            ))}
          </ol>
        )}
      </section>
    </section>
  );
}

Batalha.propTypes = {
  batalhaId: PropTypes.number.isRequired,
  onVoltar: PropTypes.func.isRequired,
  onAtualizarUsuario: PropTypes.func.isRequired,
};

export default Batalha;
