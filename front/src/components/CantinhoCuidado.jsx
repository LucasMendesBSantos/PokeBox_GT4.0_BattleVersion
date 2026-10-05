import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Coracoes from './Coracoes';
import { formatoPokemon } from './formatos';
import { dadosTipo, formatarNome, formatarNumero } from './tipos';
import { tempoDesde, tempoRestante } from './tempo';
import { urlArtwork } from '../services/pokeapi';
import * as api from '../services/api';
import './CantinhoCuidado.css';

// Mesmos valores de back/src/jogo/config.js (CUIDADOS), para os textos dos botões
const CUIDADOS = [
  { tipo: 'carinho', nome: 'Carinho', icone: '🤲', efeitos: '+10 afeto · +15 humor', energia: 0, espera: '2h' },
  { tipo: 'brincar', nome: 'Brincar', icone: '🎾', efeitos: '+20 afeto · +25 humor · −25 energia', energia: -25, espera: '4h' },
  { tipo: 'alimentar', nome: 'Alimentar', icone: '🍓', efeitos: '+20 afeto · +35 energia', energia: 35, espera: '4h' },
];

// Barras abaixo disto ficam vermelhas
const BEM_ESTAR_BAIXO = 25;

const REACOES = {
  carinho: (nome) => `${nome} fechou os olhos e curtiu o carinho.`,
  brincar: (nome) => `${nome} correu atrás da bolinha todo animado!`,
  alimentar: (nome) => `${nome} comeu tudo e ficou te olhando, pedindo mais.`,
};

const PASSADO = { carinho: 'ganhou carinho', brincar: 'brincou com você', alimentar: 'comeu uma frutinha' };

// Como o Pokémon está com você, pelo número de corações
const HUMORES = ['está tímido', 'está curioso com você', 'está curioso com você', 'está feliz', 'está feliz', 'confia totalmente em você'];

// Cansaço e tédio falam mais alto que o afeto
function descreverHumor(pokemon) {
  if (pokemon.energia < BEM_ESTAR_BAIXO) return 'está cansado e com fome';
  if (pokemon.humor < BEM_ESTAR_BAIXO) return 'está entediado';
  return HUMORES[pokemon.afeto.coracoes];
}

function BarraBemEstar({ nome, valor }) {
  return (
    <div className="cantinho-bem-estar">
      <div className="cantinho-bem-estar-topo">
        <span>{nome}</span>
        <span>{`${valor}%`}</span>
      </div>
      <span
        className="cantinho-bem-estar-barra"
        data-baixo={valor < BEM_ESTAR_BAIXO}
        data-tipo={nome.toLowerCase()}
        role="progressbar"
        aria-label={nome}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={valor}
      >
        <span style={{ width: `${valor}%` }} />
      </span>
    </div>
  );
}

BarraBemEstar.propTypes = { nome: PropTypes.string.isRequired, valor: PropTypes.number.isRequired };

// Atualiza os contadores de espera dos botões
const RELOGIO_MS = 30 * 1000;

function CantinhoCuidado({ pokemon, onCuidar, onVoltar }) {
  const nome = formatarNome(pokemon.nome);
  const [historico, setHistorico] = useState([]);
  const [reacao, setReacao] = useState(null);
  const [erro, setErro] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [agora, setAgora] = useState(Date.now);
  // Muda a cada cuidado para reiniciar a animação dos corações subindo
  const [animacao, setAnimacao] = useState(0);

  useEffect(() => {
    let ativo = true;
    api.listarCuidados(pokemon.id).then((lista) => {
      if (ativo) setHistorico(lista);
    }, () => {});
    return () => {
      ativo = false;
    };
  }, [pokemon.id]);

  useEffect(() => {
    const relogio = setInterval(() => setAgora(Date.now()), RELOGIO_MS);
    return () => clearInterval(relogio);
  }, []);

  const handleCuidar = async (tipo) => {
    setEnviando(true);
    setErro(null);
    try {
      const coracoesAntes = pokemon.afeto.coracoes;
      const { pokemon: atualizado, ganho } = await onCuidar(pokemon.id, tipo);
      let texto = ganho > 0 ? REACOES[tipo](nome) : `${nome} já te adora o máximo possível!`;
      if (atualizado.afeto.coracoes > coracoesAntes) {
        texto += atualizado.afeto.maximo
          ? ` Afeto máximo! Agora ${nome} pode aguentar firme um golpe letal nas batalhas.`
          : ' Vocês ganharam um novo coração!';
      }
      setReacao(texto);
      setAnimacao((n) => n + 1);
      setHistorico(await api.listarCuidados(pokemon.id));
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
    }
  };

  const { afeto } = pokemon;
  const progresso = afeto.maximo ? 100 : ((afeto.pontos % 100) / 100) * 100;
  const cor = dadosTipo(pokemon.tipos[0]).cor;

  return (
    <section className="cantinho" style={{ '--cantinho-cor': cor }} aria-labelledby="cantinho-titulo">
      <header className="cantinho-topo">
        <button type="button" className="cantinho-voltar" onClick={onVoltar} aria-label="Voltar para Meus Pokémon">←</button>
        <div>
          <span className="cantinho-rotulo">Cantinho de cuidado</span>
          <h2 id="cantinho-titulo" className="cantinho-titulo">
            {nome}
            <span>{` ${formatarNumero(pokemon.mintNumero)} · Nv. ${pokemon.nivel}`}</span>
          </h2>
        </div>
      </header>

      {erro && <p className="jogo-erro" role="alert">{erro}</p>}

      <div className="cantinho-grade">
        <div className="cantinho-principal">
          <div className="cantinho-palco">
            <p className="cantinho-humor">{`${nome} ${descreverHumor(pokemon)}`}</p>
            <div className="cantinho-imagem">
              <img
                src={urlArtwork(pokemon.especieId, pokemon.shiny)}
                alt={`${nome}${pokemon.shiny ? ' shiny' : ''}`}
                key={`img-${animacao}`}
                data-animando={animacao > 0}
              />
              {animacao > 0 && (
                <span className="cantinho-coracoes-subindo" key={`coracoes-${animacao}`} aria-hidden="true">
                  <span>♥</span>
                  <span>♥</span>
                  <span>♥</span>
                </span>
              )}
            </div>
            <p className="cantinho-reacao" role="status">{reacao ?? `Que tal dar um pouco de atenção para ${nome}?`}</p>
          </div>

          <ul className="cantinho-acoes">
            {CUIDADOS.map(({ tipo, nome: rotulo, icone, efeitos, energia, espera }) => {
              const disponivelEm = pokemon.cuidadosDisponiveisEm[tipo];
              const esperando = disponivelEm && new Date(disponivelEm).getTime() > agora;
              const cansado = pokemon.energia + energia < 0;
              let detalhe = `${efeitos} · a cada ${espera}`;
              if (esperando) detalhe = `Disponível em ${tempoRestante(disponivelEm, agora)}`;
              else if (cansado) detalhe = 'Sem energia: alimente primeiro';
              return (
                <li key={tipo}>
                  <button
                    type="button"
                    className="cantinho-acao"
                    disabled={enviando || esperando || cansado}
                    onClick={() => handleCuidar(tipo)}
                  >
                    <span className="cantinho-acao-icone" aria-hidden="true">{icone}</span>
                    <span className="cantinho-acao-texto">
                      <strong>{rotulo}</strong>
                      <span>{detalhe}</span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        <aside className="cantinho-lateral">
          <section className="cantinho-cartao">
            <h3>Afeto por você</h3>
            <Coracoes quantidade={afeto.coracoes} tamanho="grande" />
            <span
              className="cantinho-barra"
              role="progressbar"
              aria-label="Progresso até o próximo coração"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(progresso)}
            >
              <span style={{ width: `${progresso}%` }} />
            </span>
            <p className="cantinho-dica">
              {afeto.maximo ? 'Afeto máximo!' : `${afeto.faltamParaProximo} pontos até o próximo ♥`}
            </p>
            <BarraBemEstar nome="Humor" valor={pokemon.humor} />
            <BarraBemEstar nome="Energia" valor={pokemon.energia} />
            <dl className="cantinho-bonus">
              <dt>Bônus de status</dt>
              <dd>{`+${Math.round(afeto.bonusStatus * 100)}%`}</dd>
            </dl>
          </section>

          <section className="cantinho-cartao">
            <h3>Últimos cuidados</h3>
            {historico.length === 0 ? (
              <p className="cantinho-dica">{`Nenhum cuidado ainda. ${nome} está esperando você!`}</p>
            ) : (
              <ul className="cantinho-historico">
                {historico.map((item) => (
                  <li key={`${item.criadoEm}-${item.tipo}`}>
                    <span>{`${nome} ${PASSADO[item.tipo]}${item.afeto > 0 ? ` (+${item.afeto})` : ''}`}</span>
                    <time dateTime={item.criadoEm}>{tempoDesde(item.criadoEm, agora)}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="cantinho-cartao cantinho-cartao--info">
            <h3>Por que cuidar?</h3>
            <p>
              Cada coração dá <strong>+2% em todos os status</strong>. Com os 5 corações,
              {` ${nome} `}
              tem <strong>30% de chance de aguentar com 1 PS</strong> um golpe que o nocautearia
              (uma vez por batalha). O afeto continua depois de evoluir.
              Humor e energia caem devagar com o tempo: brincar cansa, então alimente para recuperar a energia.
            </p>
          </section>
        </aside>
      </div>
    </section>
  );
}

CantinhoCuidado.propTypes = {
  pokemon: formatoPokemon.isRequired,
  onCuidar: PropTypes.func.isRequired,
  onVoltar: PropTypes.func.isRequired,
};

export default CantinhoCuidado;
