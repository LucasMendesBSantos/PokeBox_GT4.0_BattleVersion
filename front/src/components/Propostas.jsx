import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Avatar from './Avatar';
import { formatarNome, formatarNumero } from './tipos';
import { tempoDesde } from './tempo';
import { urlArtwork } from '../services/pokeapi';
import * as api from '../services/api';

const STATUS = {
  pendente: 'Pendente',
  aceita: 'Aceita',
  recusada: 'Recusada',
  cancelada: 'Cancelada',
  encerrada: 'Encerrada',
};

const formatoResumo = PropTypes.shape({
  id: PropTypes.number.isRequired,
  mintNumero: PropTypes.number.isRequired,
  especieId: PropTypes.number.isRequired,
  nome: PropTypes.string.isRequired,
  shiny: PropTypes.bool.isRequired,
  nivel: PropTypes.number.isRequired,
  ivTotal: PropTypes.number.isRequired,
});

function MiniCard({ pokemon, grande = false }) {
  const nome = formatarNome(pokemon.nome);
  return (
    <figure className={`trocas-mini${grande ? ' trocas-mini--grande' : ''}`}>
      <img src={urlArtwork(pokemon.especieId, pokemon.shiny)} alt={`${nome}${pokemon.shiny ? ' shiny' : ''}`} loading="lazy" />
      <figcaption>
        <strong>{`${nome}${pokemon.shiny ? ' ★' : ''}`}</strong>
        <span>{`${formatarNumero(pokemon.mintNumero)} · Nv. ${pokemon.nivel}`}</span>
        <span>{`IVs ${pokemon.ivTotal}/124`}</span>
      </figcaption>
    </figure>
  );
}

MiniCard.propTypes = { pokemon: formatoResumo.isRequired, grande: PropTypes.bool };

// "1 Pikachu + 1 Froakie + 50 Pokécoins → Charizard"
function resumo(proposta) {
  const contagem = new Map();
  proposta.oferta.forEach((p) => contagem.set(p.nome, (contagem.get(p.nome) ?? 0) + 1));
  const partes = [...contagem].map(([nome, n]) => `${n} ${formatarNome(nome)}`);
  if (proposta.pokecoins > 0) partes.push(`${proposta.pokecoins.toLocaleString('pt-BR')} Pokécoins`);
  return `${partes.join(' + ')} → ${formatarNome(proposta.alvo.nome)}`;
}

function CardProposta({ proposta, recebida, enviando, onAceitar, onRecusar, onCancelar }) {
  const [confirmando, setConfirmando] = useState(false);
  const outro = recebida ? proposta.proponente : proposta.vendedor;
  const alvo = formatarNome(proposta.alvo.nome);

  return (
    <article className="trocas-proposta" data-status={proposta.status}>
      <header className="trocas-proposta-topo">
        <Avatar login={outro} tamanho="pequeno" />
        <span>
          {recebida ? (
            <>
              <strong>{outro}</strong>
              {` quer o seu ${alvo}`}
            </>
          ) : (
            <>
              {`Você quer o ${alvo} de `}
              <strong>{outro}</strong>
            </>
          )}
        </span>
        <span className="trocas-proposta-status">{STATUS[proposta.status]}</span>
      </header>

      <div className="trocas-proposta-corpo">
        <section>
          <h3>Interessado em</h3>
          <MiniCard pokemon={proposta.alvo} grande />
        </section>
        <section>
          <h3>Oferece em troca</h3>
          <div className="trocas-proposta-oferta">
            {proposta.oferta.map((p, i) => (
              <span key={p.id} className="trocas-proposta-item">
                {i > 0 && <span className="trocas-mais" aria-hidden="true">+</span>}
                <MiniCard pokemon={p} />
              </span>
            ))}
            {proposta.pokecoins > 0 && (
              <span className="trocas-proposta-item">
                {proposta.oferta.length > 0 && <span className="trocas-mais" aria-hidden="true">+</span>}
                <span className="trocas-moedas trocas-moedas--grande">
                  {proposta.pokecoins.toLocaleString('pt-BR')}
                  <small>Pokécoins</small>
                </span>
              </span>
            )}
          </div>
        </section>
      </div>

      <footer className="trocas-proposta-rodape">
        <span className="trocas-proposta-resumo">{resumo(proposta)}</span>
        <time dateTime={proposta.criadaEm}>{tempoDesde(proposta.criadaEm)}</time>
        {proposta.status === 'pendente' && (
          <div className="trocas-acoes">
            {recebida && !confirmando && (
              <>
                <button type="button" className="trocas-botao trocas-botao--secundario" disabled={enviando} onClick={() => onRecusar(proposta)}>
                  Recusar
                </button>
                <button type="button" className="trocas-botao trocas-botao--comprar" disabled={enviando} onClick={() => setConfirmando(true)}>
                  Aceitar
                </button>
              </>
            )}
            {recebida && confirmando && (
              <>
                <button type="button" className="trocas-botao trocas-botao--secundario" onClick={() => setConfirmando(false)}>Voltar</button>
                <button type="button" className="trocas-botao trocas-botao--comprar" disabled={enviando} onClick={() => onAceitar(proposta)}>
                  {`Confirmar: trocar ${alvo}`}
                </button>
              </>
            )}
            {!recebida && (
              <button type="button" className="trocas-botao trocas-botao--secundario" disabled={enviando} onClick={() => onCancelar(proposta)}>
                Cancelar proposta
              </button>
            )}
          </div>
        )}
      </footer>
    </article>
  );
}

CardProposta.propTypes = {
  proposta: PropTypes.shape({
    id: PropTypes.number.isRequired,
    status: PropTypes.string.isRequired,
    pokecoins: PropTypes.number.isRequired,
    criadaEm: PropTypes.string.isRequired,
    vendedor: PropTypes.string.isRequired,
    proponente: PropTypes.string.isRequired,
    alvo: formatoResumo.isRequired,
    oferta: PropTypes.arrayOf(formatoResumo).isRequired,
  }).isRequired,
  recebida: PropTypes.bool.isRequired,
  enviando: PropTypes.bool.isRequired,
  onAceitar: PropTypes.func.isRequired,
  onRecusar: PropTypes.func.isRequired,
  onCancelar: PropTypes.func.isRequired,
};

function Propostas({ onAtualizarUsuario, onMudou }) {
  const [lado, setLado] = useState('recebidas');
  const [dados, setDados] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    api.listarPropostas().then((resposta) => {
      if (ativo) setDados(resposta);
    }, (e) => {
      if (ativo) setErro(e.message);
    });
    return () => {
      ativo = false;
    };
  }, [versao]);

  const executar = async (acao, mensagem) => {
    setEnviando(true);
    setErro(null);
    setAviso(null);
    try {
      await acao();
      setAviso(mensagem);
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
      setVersao((v) => v + 1);
      onMudou();
    }
  };

  const pendentes = (lista) => lista.filter((p) => p.status === 'pendente').length;
  const lista = dados?.[lado] ?? [];

  return (
    <>
      <div className="trocas-subabas" role="tablist" aria-label="Propostas">
        {[['recebidas', 'Recebidas'], ['enviadas', 'Enviadas']].map(([valor, nome]) => (
          <button
            key={valor}
            type="button"
            role="tab"
            aria-selected={lado === valor}
            className="trocas-subaba"
            onClick={() => setLado(valor)}
          >
            {nome}
            {dados && pendentes(dados[valor]) > 0 && <span className="trocas-contador">{pendentes(dados[valor])}</span>}
          </button>
        ))}
      </div>

      {erro && <p className="jogo-erro" role="alert">{erro}</p>}
      {aviso && <p className="jogo-aviso" role="status">{aviso}</p>}
      {dados === null && !erro && <p aria-busy="true">Carregando propostas...</p>}
      {dados && lista.length === 0 && (
        <p className="trocas-vazio">
          {lado === 'recebidas'
            ? 'Nenhuma proposta recebida. Anuncie um Pokémon aceitando propostas para receber ofertas.'
            : 'Você ainda não mandou propostas. Encontre um Pokémon no Mercado e clique em "Propor troca".'}
        </p>
      )}

      <ul className="trocas-propostas">
        {lista.map((proposta) => (
          <li key={proposta.id}>
            <CardProposta
              proposta={proposta}
              recebida={lado === 'recebidas'}
              enviando={enviando}
              onAceitar={(p) => executar(async () => {
                await api.aceitarProposta(p.id);
                await onAtualizarUsuario();
              }, `Troca feita! ${formatarNome(p.alvo.nome)} foi para ${p.proponente} e a oferta já está com você.`)}
              onRecusar={(p) => executar(() => api.recusarProposta(p.id), `Proposta de ${p.proponente} recusada.`)}
              onCancelar={(p) => executar(() => api.cancelarProposta(p.id), 'Proposta cancelada.')}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

Propostas.propTypes = {
  onAtualizarUsuario: PropTypes.func.isRequired,
  onMudou: PropTypes.func.isRequired,
};

export default Propostas;
