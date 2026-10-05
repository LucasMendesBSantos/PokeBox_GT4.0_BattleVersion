import { useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Avatar from './Avatar';
import PropostaForm from './PropostaForm';
import { formatoPokemon } from './formatos';
import { dadosTipo, formatarNome, formatarNumero } from './tipos';
import { urlArtwork } from '../services/pokeapi';
import * as api from '../services/api';

const ORDENS_MERCADO = [
  { valor: 'popularidade', nome: 'Popularidade' },
  { valor: 'preco', nome: 'Preço (crescente)' },
  { valor: 'nome', nome: 'Nome' },
];

const ORDENS_ANUNCIOS = [
  { valor: 'preco', nome: 'Preço (crescente)' },
  { valor: 'ivs', nome: 'Melhores IVs' },
  { valor: 'nivel', nome: 'Maior nível' },
  { valor: 'recentes', nome: 'Mais recentes' },
];

const IV_TOTAL_MAXIMO = 124; // 4 status x 31

const STATUS = [
  { chave: 'hp', nome: 'PS' },
  { chave: 'ataque', nome: 'Atq' },
  { chave: 'defesa', nome: 'Def' },
  { chave: 'velocidade', nome: 'Vel' },
];

const plural = (n, singular, varios) => `${n.toLocaleString('pt-BR')} ${n === 1 ? singular : varios}`;

function Ordenar({ valor, opcoes, onMudar }) {
  return (
    <label className="trocas-ordenar">
      <span>Ordenar por:</span>
      <select value={valor} onChange={(e) => onMudar(e.target.value)}>
        {opcoes.map(({ valor: v, nome }) => <option key={v} value={v}>{nome}</option>)}
      </select>
    </label>
  );
}

Ordenar.propTypes = {
  valor: PropTypes.string.isRequired,
  opcoes: PropTypes.arrayOf(PropTypes.shape({ valor: PropTypes.string, nome: PropTypes.string })).isRequired,
  onMudar: PropTypes.func.isRequired,
};

// Barra de 0 a 124 com a marca da soma dos IVs (como a barra de desgaste do mercado da Steam)
function BarraIvs({ total }) {
  const posicao = (total / IV_TOTAL_MAXIMO) * 100;
  return (
    <div className="trocas-ivs">
      <span className="trocas-ivs-texto">{`IVs: ${total} / ${IV_TOTAL_MAXIMO}`}</span>
      <span className="trocas-ivs-barra" role="img" aria-label={`Soma dos IVs: ${total} de ${IV_TOTAL_MAXIMO}`}>
        <span className="trocas-ivs-marca" style={{ left: `${posicao}%` }} />
      </span>
    </div>
  );
}

BarraIvs.propTypes = { total: PropTypes.number.isRequired };

// Primeira tela: uma caixa por espécie anunciada
function ListaEspecies({ onAbrir }) {
  const [busca, setBusca] = useState('');
  const [ordem, setOrdem] = useState('popularidade');
  const [especies, setEspecies] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let ativo = true;
    // Espera parar de digitar para não buscar a cada letra
    const espera = setTimeout(() => {
      api.listarMercado(busca.trim().toLowerCase().replace(/\s+/g, '-'), ordem).then((lista) => {
        if (ativo) {
          setEspecies(lista);
          setErro(null);
        }
      }, (e) => {
        if (ativo) setErro(e.message);
      });
    }, 250);
    return () => {
      ativo = false;
      clearTimeout(espera);
    };
  }, [busca, ordem]);

  return (
    <>
      <div className="trocas-barra-topo">
        <input
          type="search"
          className="trocas-busca"
          placeholder="Buscar Pokémon (ex.: pikachu)"
          aria-label="Buscar Pokémon"
          value={busca}
          maxLength={40}
          onChange={(e) => setBusca(e.target.value)}
        />
        <Ordenar valor={ordem} opcoes={ORDENS_MERCADO} onMudar={setOrdem} />
      </div>

      {erro && <p className="jogo-erro" role="alert">{erro}</p>}
      {especies === null && !erro && <p aria-busy="true">Carregando mercado...</p>}
      {especies?.length === 0 && (
        <p className="trocas-vazio">{busca ? 'Ninguém está anunciando esse Pokémon agora.' : 'Nenhum Pokémon anunciado ainda. Que tal ser o primeiro?'}</p>
      )}
      {especies?.length > 0 && <p className="trocas-contagem">{plural(especies.length, 'espécie anunciada', 'espécies anunciadas')}</p>}

      <ul className="trocas-grade">
        {especies?.map((especie) => {
          const nome = formatarNome(especie.nome);
          return (
            <li key={especie.especieId}>
              <button
                type="button"
                className="trocas-especie"
                style={{ '--trocas-cor': dadosTipo(especie.tipos[0]).cor }}
                onClick={() => onAbrir(especie)}
              >
                <span className="trocas-especie-tipo">
                  {especie.tipos.map((tipo) => dadosTipo(tipo).nome).join(' / ')}
                  {especie.shinies > 0 && <span className="trocas-shiny">{` · ★ ${especie.shinies} shiny`}</span>}
                </span>
                <strong className="trocas-especie-nome">{nome}</strong>
                <img src={urlArtwork(especie.especieId)} alt="" loading="lazy" />
                <span className="trocas-especie-qtd">{`Anúncios: ${especie.anuncios.toLocaleString('pt-BR')}`}</span>
                <span className="trocas-especie-preco">
                  {especie.menorPreco !== null ? `A partir de ${especie.menorPreco.toLocaleString('pt-BR')} Pokécoins` : 'Só propostas de troca'}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
}

ListaEspecies.propTypes = { onAbrir: PropTypes.func.isRequired };

// Um anúncio: o card do Pokémon, quem anunciou e as ações
function CardAnuncio({ anuncio, saldo, enviando, onComprar, onPropor }) {
  const [confirmando, setConfirmando] = useState(false);
  const { pokemon } = anuncio;
  const nome = formatarNome(pokemon.nome);

  let acoes;
  if (anuncio.meu) {
    acoes = <span className="trocas-meu">Seu anúncio</span>;
  } else {
    acoes = (
      <>
        {anuncio.aceitaPropostas && (
          <button type="button" className="trocas-botao trocas-botao--secundario" disabled={enviando} onClick={() => onPropor(anuncio)}>
            Propor troca
          </button>
        )}
        {anuncio.preco !== null && (confirmando ? (
          <>
            <button type="button" className="trocas-botao trocas-botao--secundario" onClick={() => setConfirmando(false)}>Voltar</button>
            <button type="button" className="trocas-botao trocas-botao--comprar" disabled={enviando} onClick={() => onComprar(anuncio)}>
              Confirmar
            </button>
          </>
        ) : (
          <button
            type="button"
            className="trocas-botao trocas-botao--comprar"
            disabled={enviando || saldo < anuncio.preco}
            title={saldo < anuncio.preco ? 'Pokécoins insuficientes' : undefined}
            onClick={() => setConfirmando(true)}
          >
            Comprar
          </button>
        ))}
      </>
    );
  }

  return (
    <article className={`trocas-anuncio${pokemon.shiny ? ' trocas-anuncio--shiny' : ''}`} style={{ '--trocas-cor': dadosTipo(pokemon.tipos[0]).cor }}>
      <span className="trocas-especie-tipo">{`${pokemon.tipos.map((tipo) => dadosTipo(tipo).nome).join(' / ')} · Nv. ${pokemon.nivel}`}</span>
      <strong className="trocas-especie-nome">
        {`${nome} ${formatarNumero(pokemon.mintNumero)}`}
        {pokemon.shiny && <span className="trocas-shiny"> ★ Shiny</span>}
      </strong>
      <img src={urlArtwork(pokemon.especieId, pokemon.shiny)} alt={`${nome}${pokemon.shiny ? ' shiny' : ''}`} loading="lazy" />

      <span className="trocas-vendedor">
        <Avatar login={anuncio.vendedor} tamanho="pequeno" />
        <span>
          Anunciado por
          {' '}
          <strong>{anuncio.vendedor}</strong>
        </span>
      </span>

      <dl className="trocas-status">
        {STATUS.map(({ chave, nome: rotulo }) => (
          <div key={chave}>
            <dt>{rotulo}</dt>
            <dd>{pokemon.status[chave]}</dd>
            <dd className="trocas-status-iv">{`IV ${pokemon.ivs[chave]}`}</dd>
          </div>
        ))}
      </dl>
      <BarraIvs total={pokemon.ivTotal} />
      <span className="trocas-medidas">{`${pokemon.alturaM.toLocaleString('pt-BR')} m · ${pokemon.pesoKg.toLocaleString('pt-BR')} kg`}</span>

      <div className="trocas-anuncio-rodape">
        <span className="trocas-preco">
          {anuncio.preco !== null ? `${anuncio.preco.toLocaleString('pt-BR')} Pokécoins` : 'Aceita propostas'}
        </span>
        <div className="trocas-acoes">{acoes}</div>
      </div>
    </article>
  );
}

CardAnuncio.propTypes = {
  anuncio: PropTypes.shape({
    id: PropTypes.number.isRequired,
    preco: PropTypes.number,
    aceitaPropostas: PropTypes.bool.isRequired,
    vendedor: PropTypes.string.isRequired,
    meu: PropTypes.bool.isRequired,
    pokemon: PropTypes.object.isRequired,
  }).isRequired,
  saldo: PropTypes.number.isRequired,
  enviando: PropTypes.bool.isRequired,
  onComprar: PropTypes.func.isRequired,
  onPropor: PropTypes.func.isRequired,
};

// Segunda tela: todos os anúncios de uma espécie, para escolher pelos status
function AnunciosDaEspecie({ especie, usuario, onVoltar, onAtualizarUsuario }) {
  const [ordem, setOrdem] = useState('preco');
  const [anuncios, setAnuncios] = useState(null);
  const [erro, setErro] = useState(null);
  const [aviso, setAviso] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [propondo, setPropondo] = useState(null);
  // Muda para buscar a lista de novo depois de uma compra
  const [versao, setVersao] = useState(0);

  useEffect(() => {
    let ativo = true;
    api.listarAnunciosDaEspecie(especie.especieId, ordem).then((lista) => {
      if (ativo) setAnuncios(lista);
    }, (e) => {
      if (ativo) setErro(e.message);
    });
    return () => {
      ativo = false;
    };
  }, [especie.especieId, ordem, versao]);

  const handleComprar = async (anuncio) => {
    setEnviando(true);
    setErro(null);
    setAviso(null);
    try {
      const card = await api.comprarAnuncio(anuncio.id);
      setAviso(`${formatarNome(card.nome)} ${formatarNumero(card.mintNumero)} agora é seu! Ele está em Meus Pokémon.`);
      await onAtualizarUsuario();
    } catch (e) {
      setErro(e.message);
    } finally {
      setEnviando(false);
      setVersao((v) => v + 1);
    }
  };

  const nome = formatarNome(especie.nome);

  if (propondo) {
    return (
      <PropostaForm
        anuncio={propondo}
        usuario={usuario}
        onCancelar={() => setPropondo(null)}
        onEnviada={() => {
          setPropondo(null);
          setAviso(`Proposta enviada para ${propondo.vendedor}! Acompanhe na aba Propostas.`);
        }}
      />
    );
  }

  return (
    <>
      <div className="trocas-barra-topo">
        <button type="button" className="trocas-voltar" onClick={onVoltar}>← Todas as espécies</button>
        <Ordenar valor={ordem} opcoes={ORDENS_ANUNCIOS} onMudar={setOrdem} />
      </div>
      <h2 className="trocas-titulo">
        <img src={urlArtwork(especie.especieId)} alt="" />
        {nome}
      </h2>

      {erro && <p className="jogo-erro" role="alert">{erro}</p>}
      {aviso && <p className="jogo-aviso" role="status">{aviso}</p>}
      {anuncios === null && !erro && <p aria-busy="true">Carregando anúncios...</p>}
      {anuncios?.length === 0 && <p className="trocas-vazio">{`Ninguém está anunciando ${nome} agora.`}</p>}
      {anuncios?.length > 0 && <p className="trocas-contagem">{plural(anuncios.length, 'anúncio', 'anúncios')}</p>}

      <ul className="trocas-grade">
        {anuncios?.map((anuncio) => (
          <li key={anuncio.id}>
            <CardAnuncio
              anuncio={anuncio}
              saldo={usuario.pokecoins}
              enviando={enviando}
              onComprar={handleComprar}
              onPropor={(alvo) => {
                setAviso(null);
                setPropondo(alvo);
              }}
            />
          </li>
        ))}
      </ul>
    </>
  );
}

AnunciosDaEspecie.propTypes = {
  especie: PropTypes.shape({ especieId: PropTypes.number.isRequired, nome: PropTypes.string.isRequired }).isRequired,
  usuario: PropTypes.shape({
    pokecoins: PropTypes.number.isRequired,
    pokemons: PropTypes.arrayOf(formatoPokemon).isRequired,
  }).isRequired,
  onVoltar: PropTypes.func.isRequired,
  onAtualizarUsuario: PropTypes.func.isRequired,
};

function Mercado({ usuario, onAtualizarUsuario }) {
  const [especie, setEspecie] = useState(null);

  if (especie) {
    return (
      <AnunciosDaEspecie
        especie={especie}
        usuario={usuario}
        onVoltar={() => setEspecie(null)}
        onAtualizarUsuario={onAtualizarUsuario}
      />
    );
  }
  return <ListaEspecies onAbrir={setEspecie} />;
}

Mercado.propTypes = {
  usuario: AnunciosDaEspecie.propTypes.usuario,
  onAtualizarUsuario: PropTypes.func.isRequired,
};

export default Mercado;
