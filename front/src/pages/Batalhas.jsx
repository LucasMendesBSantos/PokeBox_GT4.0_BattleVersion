import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { tempoDesde, tempoRestante } from '../components/tempo';
import { formatarNome } from '../components/tipos';
import { urlArtwork } from '../services/pokeapi';
import * as api from '../services/api';
import './Batalhas.css';

// De quanto em quanto tempo a lista se atualiza sozinha (o oponente pode jogar a qualquer momento)
const ATUALIZAR_MS = 30 * 1000;

const MOTIVOS = { nocaute: 'por nocaute', wo: 'por W.O.', desistencia: 'por desistência' };

function resumoEncerrada(batalha) {
  if (batalha.status === 'recusada') return 'Desafio recusado';
  if (batalha.status === 'expirada') return 'Desafio expirou sem resposta';
  return `${batalha.venci ? 'Vitória' : 'Derrota'} ${MOTIVOS[batalha.motivoFim]}`;
}

// Por que um treinador ativo não pode ser desafiado agora (null = pode)
function bloqueioDesafio(treinador) {
  if (treinador.emBatalha) return 'Em batalha com você';
  if (treinador.desafioEnviado) return 'Desafio enviado';
  if (treinador.desafioRecebido) return 'Desafiou você';
  return null;
}

// Busca as batalhas e os treinadores ativos juntos (as duas listas mudam com as mesmas ações)
const buscarTudo = () => Promise.all([api.listarBatalhas(), api.listarTreinadoresAtivos()]);

function Batalhas({ temTime, onAbrir, onAtualizarUsuario }) {
  const [batalhas, setBatalhas] = useState(null);
  const [ativos, setAtivos] = useState([]);
  const [erro, setErro] = useState(null);
  const [oponente, setOponente] = useState('');
  const [sugestoes, setSugestoes] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState(null);

  // Recarrega depois de desafiar/responder
  const carregar = async () => {
    try {
      const [lista, treinadores] = await buscarTudo();
      setBatalhas(lista);
      setAtivos(treinadores);
    } catch (e) {
      setErro(e.message);
    }
  };

  useEffect(() => {
    let ativo = true;
    const buscar = () => buscarTudo().then(
      ([lista, treinadores]) => {
        if (!ativo) return;
        setBatalhas(lista);
        setAtivos(treinadores);
      },
      (e) => {
        if (ativo) setErro(e.message);
      },
    );
    buscar();
    const timer = setInterval(buscar, ATUALIZAR_MS);
    return () => {
      ativo = false;
      clearInterval(timer);
    };
  }, []);

  // Sugestões de treinadores enquanto digita (espera 300ms parado para não chamar a cada tecla)
  useEffect(() => {
    const busca = oponente.trim();
    if (!busca) return undefined;
    let ativo = true;
    const timer = setTimeout(() => {
      api.buscarTreinadores(busca).then((lista) => {
        if (ativo) setSugestoes(lista);
      }, () => {});
    }, 300);
    return () => {
      ativo = false;
      clearTimeout(timer);
    };
  }, [oponente]);

  const executar = async (acao, mensagem) => {
    setEnviando(true);
    setErro(null);
    setAviso(null);
    try {
      await acao();
      setAviso(mensagem);
      await carregar();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const desafiar = (nome) => executar(async () => {
    await api.desafiar(nome);
    setOponente('');
  }, `Desafio enviado para ${nome}! O convite fica aberto por 24h.`);

  const handleDesafiar = (e) => {
    e.preventDefault();
    const nome = oponente.trim();
    if (nome) desafiar(nome);
  };

  const handleResponder = (batalha, aceitar) => executar(async () => {
    const resposta = await api.responderDesafio(batalha.id, aceitar);
    if (aceitar) onAbrir(resposta.id);
  }, aceitar ? null : 'Desafio recusado.');

  if (!batalhas) {
    return erro ? <p className="jogo-erro" role="alert">{erro}</p> : <p aria-busy="true">Carregando batalhas...</p>;
  }

  const minhaVez = batalhas.filter((b) => b.minhaVez);
  const esperando = batalhas.filter((b) => b.status === 'em_andamento' && !b.minhaVez);
  const recebidos = batalhas.filter((b) => b.status === 'aguardando' && !b.souDesafiante);
  const enviados = batalhas.filter((b) => b.status === 'aguardando' && b.souDesafiante);
  const encerradas = batalhas.filter((b) => !['aguardando', 'em_andamento'].includes(b.status));

  // O texto digitado no campo também filtra a lista de treinadores ativos
  const termo = oponente.trim().toLowerCase();
  const ativosFiltrados = termo ? ativos.filter((t) => t.login.toLowerCase().includes(termo)) : ativos;

  const secao = (titulo, lista, renderItem) => lista.length > 0 && (
    <section className="batalhas-secao">
      <h2>{`${titulo} (${lista.length})`}</h2>
      <ul className="batalhas-lista">{lista.map(renderItem)}</ul>
    </section>
  );

  const botaoAbrir = (batalha, texto = 'Abrir') => (
    <button type="button" className="jogo-botao jogo-botao--claro" onClick={() => { onAtualizarUsuario(); onAbrir(batalha.id); }}>
      {texto}
    </button>
  );

  return (
    <section className="batalhas">
      <h1 className="jogo-titulo">Batalhas</h1>
      <p className="jogo-texto">
        As batalhas são por turnos e ninguém precisa estar online ao mesmo tempo: cada jogador tem 4h para jogar.
        Perder o prazo passa a vez; perder duas vezes seguidas é derrota por W.O.
      </p>

      <form className="batalhas-desafiar jogo-painel" onSubmit={handleDesafiar}>
        <label htmlFor="batalhas-oponente">Procurar treinador</label>
        <div className="batalhas-desafiar-linha">
          <input
            id="batalhas-oponente"
            list="batalhas-sugestoes"
            placeholder="Login do treinador"
            maxLength={20}
            autoComplete="off"
            value={oponente}
            onChange={(e) => setOponente(e.target.value)}
          />
          <datalist id="batalhas-sugestoes">
            {sugestoes.map((nome) => <option key={nome} value={nome} />)}
          </datalist>
          <button type="submit" className="jogo-botao" disabled={enviando || !temTime || !oponente.trim()}>
            Desafiar
          </button>
        </div>
        {!temTime && <p className="batalhas-dica">Monte um time com 5 Pokémon para poder desafiar.</p>}
      </form>

      {erro && <p className="jogo-erro" role="alert">{erro}</p>}
      {aviso && <p className="jogo-aviso" role="status">{aviso}</p>}

      <section className="batalhas-secao" aria-labelledby="batalhas-ativos-titulo">
        <h2 id="batalhas-ativos-titulo">
          {`Treinadores ativos nas últimas 24h (${ativosFiltrados.length})`}
        </h2>
        {ativosFiltrados.length === 0 ? (
          <p className="batalhas-dica">
            {termo
              ? `Nenhum treinador ativo com "${oponente.trim()}". Você ainda pode desafiar pelo login exato no campo acima.`
              : 'Ninguém com time completo entrou no jogo nas últimas 24h.'}
          </p>
        ) : (
          <ul className="batalhas-ativos">
            {ativosFiltrados.map((treinador) => {
              const bloqueio = bloqueioDesafio(treinador);
              return (
                <li key={treinador.login} className="batalhas-ativo">
                  <div className="batalhas-ativo-info">
                    <strong>{treinador.login}</strong>
                    <span>{`Visto ${tempoDesde(treinador.ultimoAcessoEm)} · nível médio ${treinador.nivelMedio}`}</span>
                  </div>
                  <ul className="batalhas-ativo-time" aria-label={`Time de ${treinador.login}`}>
                    {treinador.time.map((pokemon, i) => (
                      // Posição na chave: o time pode ter duas vezes a mesma espécie
                      <li key={`${i}-${pokemon.especieId}`} title={`${formatarNome(pokemon.nome)} · Nv. ${pokemon.nivel}${pokemon.shiny ? ' · shiny' : ''}`}>
                        <img src={urlArtwork(pokemon.especieId, pokemon.shiny)} alt={formatarNome(pokemon.nome)} loading="lazy" />
                      </li>
                    ))}
                  </ul>
                  {bloqueio ? (
                    <span className="batalhas-ativo-status">{bloqueio}</span>
                  ) : (
                    <button
                      type="button"
                      className="jogo-botao"
                      disabled={enviando || !temTime}
                      onClick={() => desafiar(treinador.login)}
                    >
                      Desafiar
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {secao('Sua vez', minhaVez, (b) => (
        <li key={b.id} className="batalhas-item batalhas-item--vez">
          <div>
            <strong>{`vs ${b.oponente}`}</strong>
            <span>{`Turno ${b.turno} · faltam ${tempoRestante(b.prazoEm)} para jogar`}</span>
          </div>
          {botaoAbrir(b, 'Jogar')}
        </li>
      ))}

      {secao('Desafios recebidos', recebidos, (b) => (
        <li key={b.id} className="batalhas-item">
          <div>
            <strong>{`${b.oponente} desafiou você`}</strong>
            <span>{`Expira em ${tempoRestante(b.expiraEm)}`}</span>
          </div>
          <div className="batalhas-botoes">
            <button type="button" className="jogo-botao" disabled={enviando || !temTime} onClick={() => handleResponder(b, true)}>
              Aceitar
            </button>
            <button type="button" className="jogo-botao jogo-botao--claro" disabled={enviando} onClick={() => handleResponder(b, false)}>
              Recusar
            </button>
          </div>
        </li>
      ))}

      {secao('Esperando o oponente', esperando, (b) => (
        <li key={b.id} className="batalhas-item">
          <div>
            <strong>{`vs ${b.oponente}`}</strong>
            <span>{`Turno ${b.turno} · ${b.oponente} tem ${tempoRestante(b.prazoEm)} para jogar`}</span>
          </div>
          {botaoAbrir(b)}
        </li>
      ))}

      {secao('Desafios enviados', enviados, (b) => (
        <li key={b.id} className="batalhas-item">
          <div>
            <strong>{`Você desafiou ${b.oponente}`}</strong>
            <span>{`Esperando resposta · expira em ${tempoRestante(b.expiraEm)}`}</span>
          </div>
        </li>
      ))}

      {secao('Encerradas', encerradas, (b) => (
        <li key={b.id} className="batalhas-item" data-resultado={b.status === 'finalizada' ? (b.venci ? 'vitoria' : 'derrota') : 'nenhum'}>
          <div>
            <strong>{`vs ${b.oponente}`}</strong>
            <span>{resumoEncerrada(b)}</span>
          </div>
          {b.status === 'finalizada' && botaoAbrir(b, 'Ver')}
        </li>
      ))}

      {batalhas.length === 0 && <p className="jogo-texto">Nenhuma batalha ainda. Desafie alguém!</p>}
    </section>
  );
}

Batalhas.propTypes = {
  temTime: PropTypes.bool.isRequired,
  onAbrir: PropTypes.func.isRequired,
  onAtualizarUsuario: PropTypes.func.isRequired,
};

export default Batalhas;
