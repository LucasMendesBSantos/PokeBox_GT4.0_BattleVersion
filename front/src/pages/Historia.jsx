import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import { LadoCampo } from '../components/CampoBatalha';
import { BotoesGolpes } from '../components/Golpes';
import { descreverEventos } from '../components/eventosBatalha';
import { formatarNome, formatarNumero } from '../components/tipos';
import { urlArtwork, urlSprite } from '../services/pokeapi';
import * as api from '../services/api';
import './Historia.css';

const TAMANHO_TIME = 3;
// A Pokébola balança um pouco antes de mostrar o resultado da captura
const SUSPENSE_CAPTURA_MS = 900;

const esperar = (ms) => new Promise((resolver) => { setTimeout(resolver, ms); });
const formatarForca = (forca) => `${forca.toLocaleString('pt-BR', { minimumFractionDigits: 1 })}x`;
// Mesma conta do back (regras.forcaDoPonto): trilha 1 vai de 0,1x a 1,0x, trilha 2 de 1,1x a 2,0x...
const forcaDoPonto = (trilha, ponto, pontosPorTrilha) => ((trilha - 1) * pontosPorTrilha + ponto) / 10;

// Posição de cada ponto na trilha em "S": 5 por linha, a segunda linha volta da direita para a esquerda
function posicaoNaTrilha(ponto, porLinha = 5) {
  const linha = Math.floor((ponto - 1) / porLinha);
  const coluna = (ponto - 1) % porLinha;
  return { gridRow: linha + 1, gridColumn: linha % 2 === 0 ? coluna + 1 : porLinha - coluna };
}

function Pokebola({ balancando = false }) {
  return <span className="historia-pokebola" aria-hidden="true" data-balancando={balancando} />;
}

Pokebola.propTypes = { balancando: PropTypes.bool };

// ---------------------------------------------------------------------------
// Batalha contra o selvagem
// ---------------------------------------------------------------------------

function BatalhaSelvagem({
  encontro, batalha, enviando, onJogar, onVoltar, captura,
}) {
  const [trocando, setTrocando] = useState(false);
  const { estado, log, fim, recompensa } = batalha;
  const [eu, selvagem] = estado.lados;
  const reservas = eu.pokemons
    .map((pokemon, indice) => ({ pokemon, indice }))
    .filter(({ pokemon, indice }) => indice !== eu.ativo && pokemon.hp > 0);
  const venci = fim?.vencedor === 0;

  const jogar = async (jogada) => {
    setTrocando(false);
    await onJogar(jogada);
  };

  let resultado = null;
  if (fim) {
    resultado = venci ? 'Você venceu!' : 'Você perdeu...';
    if (venci && estado.revanche) resultado = 'Você venceu a revanche!';
    if (fim.motivo === 'desistencia') resultado = 'Você fugiu da batalha.';
  }

  return (
    <section className="historia-batalha" aria-label="Batalha contra Pokémon selvagem">
      <p className="historia-batalha-titulo">
        {`Trilha ${encontro.trilha} · Ponto ${encontro.ponto} · Força ${formatarForca(encontro.forca)}`}
      </p>

      {fim && (
        <div className="batalha-resultado" data-venci={venci} role="status">
          <strong>{resultado}</strong>
          {venci && recompensa && (
            <span>{`+${recompensa.pokecoins} Pokécoins e +${recompensa.xp} XP para cada Pokémon do time.`}</span>
          )}
          {venci && recompensa?.subiram?.length > 0 && (
            <ul>
              {recompensa.subiram.map((s) => (
                <li key={s.pokemonId}>
                  {`${formatarNome(s.nome)} ${formatarNumero(s.mintNumero)} subiu para o nível ${s.nivel}${s.podeEvoluir ? ' e já pode evoluir!' : '.'}`}
                </li>
              ))}
            </ul>
          )}
          {!venci && (
            <span>
              {estado.revanche
                ? `${formatarNome(encontro.nome)} fugiu. Refaça o ponto para encontrar outro Pokémon.`
                : `${formatarNome(encontro.nome)} continua esperando neste ponto. Fortaleça seu time e tente de novo!`}
            </span>
          )}
        </div>
      )}

      <div className="batalha-campo">
        <LadoCampo lado={selvagem} meu={false} />
        <LadoCampo lado={eu} meu />
      </div>

      {!fim && (
        <div className="batalha-acoes jogo-painel">
          <BotoesGolpes
            pokemon={eu.pokemons[eu.ativo]}
            desabilitado={enviando}
            onUsar={(indice) => jogar({ tipo: 'golpe', indice })}
          />
          <button type="button" className="jogo-botao" disabled={enviando} onClick={() => jogar({ tipo: 'atacar' })}>
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
          <button type="button" className="jogo-botao jogo-botao--claro" disabled={enviando} onClick={() => jogar({ tipo: 'desistir' })}>
            Fugir
          </button>
          {trocando && (
            <ul className="batalha-trocas">
              {reservas.map(({ pokemon, indice }) => (
                <li key={pokemon.pokemonId}>
                  <button type="button" disabled={enviando} onClick={() => jogar({ tipo: 'trocar', indice })}>
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

      {fim && (
        <div className="historia-batalha-fim">
          {venci && captura}
          <button type="button" className="jogo-botao jogo-botao--claro" onClick={() => onVoltar()}>
            Voltar à trilha
          </button>
        </div>
      )}

      {log.length > 0 && (
        <section className="batalha-historico">
          <h2>Histórico</h2>
          <ol reversed>
            {log.map((turno, i) => ({ turno, numero: i + 1 })).reverse().map(({ turno, numero }) => (
              <li key={numero} data-automatica={turno.lado === 1}>
                <span className="batalha-historico-turno">{turno.lado === 0 ? 'Você' : 'Pokémon selvagem'}</span>
                {descreverEventos(turno.eventos, estado).map((frase) => <span key={frase}>{frase}</span>)}
              </li>
            ))}
          </ol>
        </section>
      )}
    </section>
  );
}

const formatoEncontro = PropTypes.shape({
  id: PropTypes.number.isRequired,
  trilha: PropTypes.number.isRequired,
  ponto: PropTypes.number.isRequired,
  forca: PropTypes.number.isRequired,
  especieId: PropTypes.number.isRequired,
  nome: PropTypes.string.isRequired,
  tipos: PropTypes.arrayOf(PropTypes.string).isRequired,
  shiny: PropTypes.bool.isRequired,
  nivel: PropTypes.number.isRequired,
  status: PropTypes.shape({
    hp: PropTypes.number, ataque: PropTypes.number, defesa: PropTypes.number, velocidade: PropTypes.number,
  }).isRequired,
  situacao: PropTypes.oneOf(['encontrado', 'vencido', 'capturado', 'fugiu', 'ignorado']).isRequired,
  revanche: PropTypes.bool,
  tentativasCaptura: PropTypes.number.isRequired,
  tentativasRestantes: PropTypes.number,
});

BatalhaSelvagem.propTypes = {
  encontro: formatoEncontro.isRequired,
  batalha: PropTypes.shape({
    estado: PropTypes.shape({ lados: PropTypes.array.isRequired }).isRequired,
    log: PropTypes.array.isRequired,
    fim: PropTypes.shape({ vencedor: PropTypes.number, motivo: PropTypes.string }),
    recompensa: PropTypes.shape({ pokecoins: PropTypes.number, xp: PropTypes.number, subiram: PropTypes.array }),
  }).isRequired,
  enviando: PropTypes.bool.isRequired,
  onJogar: PropTypes.func.isRequired,
  onVoltar: PropTypes.func.isRequired,
  captura: PropTypes.node,
};

// ---------------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------------

function Historia({ usuario, onAtualizarUsuario, onIrPara }) {
  const [historia, setHistoria] = useState(null);
  const [trilha, setTrilha] = useState(1);
  const [pontoSelecionado, setPontoSelecionado] = useState(null);
  // Batalha mostrada na tela (a em andamento ou a que acabou de terminar)
  const [batalha, setBatalha] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [capturando, setCapturando] = useState(false);
  const [mensagemCaptura, setMensagemCaptura] = useState(null);
  // Ignorar não tem volta, então pede uma confirmação antes
  const [confirmarIgnorar, setConfirmarIgnorar] = useState(false);
  const [erro, setErro] = useState(null);

  const temTime = usuario.pokemons.filter((p) => p.posicaoTime).length === TAMANHO_TIME;
  const pokebolas = usuario.pokebolas ?? 0;

  // Atualiza o encontro do ponto sem buscar a história inteira (cada ponto mostra só o último encontro)
  const mesmoPonto = (a, b) => a.trilha === b.trilha && a.ponto === b.ponto;
  const guardarEncontro = (encontro) => setHistoria((atual) => ({
    ...atual,
    encontros: atual.encontros.some((e) => mesmoPonto(e, encontro))
      ? atual.encontros.map((e) => (mesmoPonto(e, encontro) ? encontro : e))
      : [...atual.encontros, encontro],
  }));

  const recarregar = () => api.buscarHistoria().then(setHistoria);

  useEffect(() => {
    let ativo = true;
    api.buscarHistoria().then(
      (dados) => {
        if (!ativo) return;
        setHistoria(dados);
        // Abre numa batalha que ficou pela metade (inclusive revanche) ou no ponto em que o treinador parou
        const emBatalha = dados.encontros.find((e) => e.batalha);
        const aberto = dados.encontros.find((e) => e.situacao === 'encontrado' && !e.revanche);
        const atual = emBatalha ?? aberto ?? dados.proximo ?? dados.encontros.at(-1);
        if (atual) {
          setTrilha(atual.trilha);
          setPontoSelecionado(atual.ponto);
        }
        if (emBatalha) setBatalha(emBatalha.batalha);
      },
      (e) => {
        if (ativo) setErro(e.message);
      },
    );
    return () => {
      ativo = false;
    };
  }, []);

  if (!historia) {
    return erro ? <p className="jogo-erro" role="alert">{erro}</p> : <p aria-busy="true">Carregando história...</p>;
  }

  const {
    proximo, pontosPorTrilha, custoRefazer, tentativasCaptura,
  } = historia;
  const encontroDe = (t, p) => historia.encontros.find((e) => e.trilha === t && e.ponto === p) ?? null;
  const trilhaLiberada = (t) => historia.encontros.some((e) => e.trilha === t) || proximo?.trilha === t;
  const ehProximo = (t, p) => proximo?.trilha === t && proximo?.ponto === p;
  const selecionado = pontoSelecionado ? encontroDe(trilha, pontoSelecionado) : null;
  const historiaCompleta = historia.vencidos === historia.trilhas * pontosPorTrilha;

  const executar = async (acao) => {
    setEnviando(true);
    setErro(null);
    try {
      await acao();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const handleExplorar = () => executar(async () => {
    const encontro = await api.explorarHistoria();
    guardarEncontro(encontro);
    setMensagemCaptura(null);
  });

  const aplicarBatalha = async ({ encontro, batalha: resultado }) => {
    guardarEncontro(encontro);
    setBatalha(resultado);
    if (resultado.fim) {
      setMensagemCaptura(null);
      // Vitória: o próximo ponto foi liberado e o saldo/XP mudaram
      await Promise.all([recarregar(), onAtualizarUsuario()]);
    }
  };

  // Primeira batalha do ponto (ou continuar uma que ficou pela metade)
  const handleBatalhar = () => executar(async () => {
    await aplicarBatalha(await api.batalharNaHistoria(selecionado.id));
    setMensagemCaptura(null);
  });

  // Revanche contra um novo Pokémon aleatório: cobra Pokécoins, então atualiza o saldo no topo
  const handleRefazer = () => executar(async () => {
    await aplicarBatalha(await api.refazerPonto(trilha, pontoSelecionado));
    setMensagemCaptura(null);
    await onAtualizarUsuario();
  });

  const handleJogar = (jogada) => executar(async () => {
    await aplicarBatalha(await api.jogarNaHistoria(selecionado.id, jogada));
  });

  const handleCapturar = async () => {
    setCapturando(true);
    setErro(null);
    setMensagemCaptura(null);
    try {
      const [resultado] = await Promise.all([api.capturar(selecionado.id), esperar(SUSPENSE_CAPTURA_MS)]);
      guardarEncontro(resultado.encontro);
      const nome = formatarNome(selecionado.nome);
      const { tentativasRestantes } = resultado.encontro;
      let texto = `${nome} escapou da Pokébola! Restam ${tentativasRestantes} tentativa${tentativasRestantes === 1 ? '' : 's'}.`;
      if (resultado.capturou) {
        texto = `Gotcha! ${formatarNome(resultado.pokemon.nome)} ${formatarNumero(resultado.pokemon.mintNumero)} foi capturado e está na sua coleção!`;
      } else if (resultado.fugiu) {
        texto = `${nome} escapou e fugiu depois de ${tentativasCaptura} tentativas! Agora você pode refazer este ponto contra um novo Pokémon.`;
      }
      setMensagemCaptura({ sucesso: resultado.capturou, texto });
      await Promise.all([recarregar(), onAtualizarUsuario()]);
    } catch (e) {
      setErro(e.message);
    } finally {
      setCapturando(false);
    }
  };

  const handleIgnorar = () => executar(async () => {
    const nome = formatarNome(selecionado.nome);
    guardarEncontro(await api.ignorarPokemon(selecionado.id));
    setConfirmarIgnorar(false);
    setMensagemCaptura({ sucesso: false, texto: `Você deixou ${nome} ir embora. Agora pode refazer este ponto contra um novo Pokémon.` });
  });

  const handleVoltarATrilha = () => {
    setBatalha(null);
    // Depois de vencer um ponto novo, já deixa o próximo selecionado (mudando de trilha se for o caso)
    if (selecionado?.situacao !== 'encontrado' && proximo && !batalha?.estado.revanche) {
      setTrilha(proximo.trilha);
      setPontoSelecionado(proximo.ponto);
    }
    setMensagemCaptura(null);
  };

  const selecionarPonto = (p) => {
    setPontoSelecionado(p);
    setConfirmarIgnorar(false);
    setMensagemCaptura(null);
    setErro(null);
  };

  // Bloco de captura: aparece no fim da batalha vencida e no painel de um ponto vencido
  const blocoCaptura = selecionado && (selecionado.situacao === 'vencido' || mensagemCaptura) && (
    <div className="historia-captura" aria-live="polite">
      <Pokebola balancando={capturando} />
      <div className="historia-captura-texto">
        {mensagemCaptura && (
          <p className="historia-captura-resultado" data-sucesso={mensagemCaptura.sucesso}>{mensagemCaptura.texto}</p>
        )}
        {selecionado.situacao === 'vencido' && (
          <>
            <p>
              {selecionado.chanceCaptura != null && `Chance de captura: ${Math.round(selecionado.chanceCaptura * 100)}% · `}
              {`Tentativas restantes: ${selecionado.tentativasRestantes} de ${tentativasCaptura}`}
              {` · Você tem ${pokebolas} Pokébola${pokebolas === 1 ? '' : 's'}.`}
            </p>
            <div className="historia-captura-botoes">
              <button type="button" className="jogo-botao" disabled={capturando || pokebolas === 0} onClick={handleCapturar}>
                {capturando ? 'Balançando...' : 'Jogar Pokébola'}
              </button>
              {pokebolas === 0 && (
                <button type="button" className="jogo-botao jogo-botao--azul" onClick={() => onIrPara('loja')}>
                  Comprar Pokébolas
                </button>
              )}
              {!confirmarIgnorar && (
                <button
                  type="button"
                  className="jogo-botao jogo-botao--claro"
                  disabled={capturando || enviando}
                  onClick={() => setConfirmarIgnorar(true)}
                >
                  Ignorar Pokémon
                </button>
              )}
            </div>
            {confirmarIgnorar && (
              <div className="historia-ignorar">
                <span>{`${formatarNome(selecionado.nome)} vai embora e não poderá mais ser capturado. Para batalhar de novo neste ponto, refaça por ${custoRefazer} Pokécoins.`}</span>
                <div className="historia-captura-botoes">
                  <button type="button" className="jogo-botao" disabled={enviando} onClick={handleIgnorar}>
                    Confirmar
                  </button>
                  <button type="button" className="jogo-botao jogo-botao--claro" onClick={() => setConfirmarIgnorar(false)}>
                    Cancelar
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );

  if (batalha && selecionado) {
    return (
      <section className="historia">
        <h1 className="jogo-titulo">História</h1>
        {erro && <p className="jogo-erro" role="alert">{erro}</p>}
        <BatalhaSelvagem
          encontro={selecionado}
          batalha={batalha}
          enviando={enviando}
          onJogar={handleJogar}
          onVoltar={handleVoltarATrilha}
          captura={blocoCaptura}
        />
      </section>
    );
  }

  // Painel do ponto selecionado
  let painel = null;
  if (pontoSelecionado) {
    const forca = forcaDoPonto(trilha, pontoSelecionado, pontosPorTrilha);
    const cabecalho = `Ponto ${pontoSelecionado} · Força ${formatarForca(forca)}`;
    if (selecionado) {
      const { status } = selecionado;
      painel = (
        <div className="historia-painel jogo-painel" data-situacao={selecionado.situacao}>
          <img
            className="historia-painel-arte"
            src={urlArtwork(selecionado.especieId, selecionado.shiny)}
            alt={formatarNome(selecionado.nome)}
          />
          <div className="historia-painel-info">
            <p className="historia-painel-ponto">{cabecalho}</p>
            <h2>
              {formatarNome(selecionado.nome)}
              {selecionado.shiny && ' ★'}
            </h2>
            <p className="historia-painel-detalhe">
              {`Nv. ${selecionado.nivel} · ${status.hp} PS · Atq ${status.ataque} · Def ${status.defesa} · Vel ${status.velocidade}`}
            </p>
            {selecionado.situacao === 'encontrado' && (
              <>
                <p>
                  {selecionado.batalha
                    ? 'Você deixou uma batalha pela metade aqui.'
                    : `Um ${formatarNome(selecionado.nome)} selvagem apareceu!`}
                </p>
                {!temTime && (
                  <p className="jogo-aviso">
                    {`Monte um time com ${TAMANHO_TIME} Pokémon para batalhar. `}
                    <button type="button" className="historia-link" onClick={() => onIrPara('time')}>Ir para o time</button>
                  </p>
                )}
                <button
                  type="button"
                  className="jogo-botao"
                  disabled={(!temTime && !selecionado.batalha) || enviando}
                  onClick={handleBatalhar}
                >
                  {selecionado.batalha ? 'Continuar batalha' : 'Batalhar'}
                </button>
              </>
            )}
            {selecionado.situacao === 'vencido' && <p>Derrotado! Tente capturá-lo antes que ele fuja.</p>}
            {selecionado.situacao === 'fugiu' && !mensagemCaptura && <p>{`${formatarNome(selecionado.nome)} fugiu.`}</p>}
            {selecionado.situacao === 'ignorado' && !mensagemCaptura && (
              <p>{`Você deixou ${formatarNome(selecionado.nome)} ir embora.`}</p>
            )}
            {selecionado.situacao === 'capturado' && !mensagemCaptura && (
              <p className="historia-painel-capturado">Capturado! Ele está na sua coleção.</p>
            )}
            {blocoCaptura}
            {selecionado.situacao === 'vencido' && (
              <p className="historia-refazer-dica">
                {`Para refazer este ponto contra um novo Pokémon, capture-o, ignore-o ou use as ${selecionado.tentativasRestantes} tentativas restantes.`}
              </p>
            )}
            {['capturado', 'fugiu', 'ignorado'].includes(selecionado.situacao) && (
              <div className="historia-refazer">
                <p>{`Refaça este ponto contra um novo Pokémon aleatório por ${custoRefazer} Pokécoins. A vitória paga a recompensa de novo e você pode tentar capturá-lo.`}</p>
                {!temTime && <p className="jogo-aviso">{`Monte um time com ${TAMANHO_TIME} Pokémon para batalhar.`}</p>}
                <button
                  type="button"
                  className="jogo-botao jogo-botao--azul"
                  disabled={!temTime || enviando || capturando || usuario.pokecoins < custoRefazer}
                  onClick={handleRefazer}
                >
                  {enviando ? 'Procurando...' : `Refazer · ${custoRefazer} Pokécoins`}
                </button>
              </div>
            )}
          </div>
        </div>
      );
    } else if (ehProximo(trilha, pontoSelecionado)) {
      painel = (
        <div className="historia-painel jogo-painel" data-situacao="inexplorado">
          <span className="historia-painel-misterio" aria-hidden="true">?</span>
          <div className="historia-painel-info">
            <p className="historia-painel-ponto">{cabecalho}</p>
            <h2>Mato alto</h2>
            <p>Alguma coisa está se mexendo por aqui... Explore para encontrar o Pokémon selvagem deste ponto.</p>
            <button type="button" className="jogo-botao" disabled={enviando} onClick={handleExplorar}>
              {enviando ? 'Explorando...' : 'Explorar'}
            </button>
          </div>
        </div>
      );
    } else {
      painel = (
        <div className="historia-painel jogo-painel" data-situacao="bloqueado">
          <span className="historia-painel-misterio" aria-hidden="true">?</span>
          <div className="historia-painel-info">
            <p className="historia-painel-ponto">{cabecalho}</p>
            <h2>Caminho bloqueado</h2>
            <p>Vença os pontos anteriores para chegar até aqui.</p>
          </div>
        </div>
      );
    }
  }

  return (
    <section className="historia">
      <h1 className="jogo-titulo">História</h1>
      <p className="jogo-texto">
        {`Siga as trilhas e encontre Pokémon selvagens. Cada ponto é mais forte que o anterior: a trilha 1 vai de 0,1x a 1,0x
        da força normal, a trilha 2 de 1,1x a 2,0x, e assim por diante. Vença com seu time de ${TAMANHO_TIME} para ganhar
        Pokécoins e XP, e tente capturar o Pokémon derrotado com uma Pokébola.`}
      </p>

      <div className="historia-resumo">
        <span className="historia-resumo-item">
          <Pokebola />
          {`${pokebolas} Pokébola${pokebolas === 1 ? '' : 's'}`}
        </span>
        <span className="historia-resumo-item">{`${historia.vencidos} de ${historia.trilhas * pontosPorTrilha} pontos vencidos`}</span>
        <span className="historia-resumo-item">{`${historia.capturados} capturados`}</span>
      </div>

      {historiaCompleta && <p className="jogo-aviso">Você completou toda a história. Parabéns, treinador!</p>}

      <div className="historia-trilhas" role="tablist" aria-label="Trilhas">
        {Array.from({ length: historia.trilhas }, (_, i) => i + 1).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            className="historia-trilha-aba"
            aria-selected={trilha === t}
            disabled={!trilhaLiberada(t)}
            onClick={() => {
              setTrilha(t);
              selecionarPonto(ehProximo(t, proximo?.ponto) ? proximo.ponto : 1);
            }}
          >
            <strong>{`Trilha ${t}`}</strong>
            <span>{`${formatarForca(forcaDoPonto(t, 1, pontosPorTrilha))} a ${formatarForca(forcaDoPonto(t, pontosPorTrilha, pontosPorTrilha))}`}</span>
          </button>
        ))}
      </div>

      <ol className="historia-mapa" aria-label={`Pontos da trilha ${trilha}`}>
        {Array.from({ length: pontosPorTrilha }, (_, i) => i + 1).map((p) => {
          const encontro = encontroDe(trilha, p);
          let situacao = 'bloqueado';
          if (encontro) situacao = encontro.situacao;
          else if (ehProximo(trilha, p)) situacao = 'inexplorado';
          const rotulo = encontro ? `${formatarNome(encontro.nome)} (${situacao})` : situacao;
          return (
            <li key={p} style={posicaoNaTrilha(p)}>
              <button
                type="button"
                className="historia-ponto"
                data-situacao={situacao}
                aria-pressed={pontoSelecionado === p}
                aria-label={`Ponto ${p}: ${rotulo}`}
                onClick={() => selecionarPonto(p)}
              >
                {encontro ? <img src={urlSprite(encontro.especieId, encontro.shiny)} alt="" /> : <span aria-hidden="true">{situacao === 'inexplorado' ? '?' : p}</span>}
              </button>
              <span className="historia-ponto-forca">{formatarForca(forcaDoPonto(trilha, p, pontosPorTrilha))}</span>
            </li>
          );
        })}
      </ol>

      {erro && <p className="jogo-erro" role="alert">{erro}</p>}
      {painel}
    </section>
  );
}

Historia.propTypes = {
  usuario: PropTypes.shape({
    pokecoins: PropTypes.number.isRequired,
    pokebolas: PropTypes.number,
    pokemons: PropTypes.arrayOf(PropTypes.shape({ posicaoTime: PropTypes.number })).isRequired,
  }).isRequired,
  onAtualizarUsuario: PropTypes.func.isRequired,
  onIrPara: PropTypes.func.isRequired,
};

export default Historia;
