import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Avatar from '../components/Avatar';
import Coracoes from '../components/Coracoes';
import { formatoPokemon } from '../components/formatos';
import { dadosTipo, formatarNome, formatarNumero } from '../components/tipos';
import { urlArtwork, urlSprite } from '../services/pokeapi';
import * as api from '../services/api';
import './Vitrine.css';

// Mesmos limites de back/src/jogo/config.js
const DESTAQUES_MAXIMO = 6;
const BIO_MAXIMO = 160;

const REGIOES = [
  { nome: 'Kanto', inicio: 1, fim: 151 },
  { nome: 'Johto', inicio: 152, fim: 251 },
  { nome: 'Hoenn', inicio: 252, fim: 386 },
  { nome: 'Sinnoh', inicio: 387, fim: 493 },
  { nome: 'Unova', inicio: 494, fim: 649 },
  { nome: 'Kalos', inicio: 650, fim: 721 },
  { nome: 'Alola', inicio: 722, fim: 809 },
  { nome: 'Galar', inicio: 810, fim: 905 },
  { nome: 'Paldea', inicio: 906, fim: 1025 },
];

const ESTILOS = [
  { valor: 'palco', nome: 'Palco do time', descricao: 'Seus Pokémon em destaque, em cards grandes.' },
  { valor: 'album', nome: 'Álbum da coleção', descricao: 'O álbum com todas as espécies que você já tem.' },
];

const formatarDesde = (data) => new Date(data).toLocaleDateString('pt-BR', { month: 'short', year: 'numeric' });

const formatoDestaque = PropTypes.shape({
  id: PropTypes.number.isRequired,
  mintNumero: PropTypes.number.isRequired,
  especieId: PropTypes.number.isRequired,
  nome: PropTypes.string.isRequired,
  tipos: PropTypes.arrayOf(PropTypes.string).isRequired,
  shiny: PropTypes.bool.isRequired,
  nivel: PropTypes.number.isRequired,
  coracoes: PropTypes.number.isRequired,
});

function CardDestaque({ pokemon, compacto = false }) {
  const nome = formatarNome(pokemon.nome);
  return (
    <article
      className={`vitrine-destaque${compacto ? ' vitrine-destaque--compacto' : ''}${pokemon.shiny ? ' vitrine-destaque--shiny' : ''}`}
      style={{ '--vitrine-cor': dadosTipo(pokemon.tipos[0]).cor }}
    >
      <div className="vitrine-destaque-imagem">
        {!compacto && <span className="vitrine-destaque-nivel">{`Nv. ${pokemon.nivel}`}</span>}
        <img src={urlArtwork(pokemon.especieId, pokemon.shiny)} alt={`${nome}${pokemon.shiny ? ' shiny' : ''}`} loading="lazy" />
      </div>
      <div className="vitrine-destaque-info">
        <strong>
          {nome}
          {pokemon.shiny && ' ★'}
        </strong>
        <Coracoes quantidade={pokemon.coracoes} tamanho="pequeno" />
      </div>
      {!compacto && (
        <span className="vitrine-destaque-detalhe">
          {`${formatarNumero(pokemon.mintNumero)} · ${pokemon.tipos.map((tipo) => dadosTipo(tipo).nome).join(' / ')}`}
        </span>
      )}
    </article>
  );
}

CardDestaque.propTypes = { pokemon: formatoDestaque.isRequired, compacto: PropTypes.bool };

// Álbum de espécies por região: as que o treinador tem aparecem coloridas, as outras como silhueta
function Album({ colecao }) {
  const possuidas = new Map(colecao.map((especie) => [especie.id, especie]));
  // Abre na região onde o treinador tem mais espécies
  const [regiaoIndice, setRegiaoIndice] = useState(() => {
    const totais = REGIOES.map(({ inicio, fim }) => colecao.filter(({ id }) => id >= inicio && id <= fim).length);
    return totais.indexOf(Math.max(...totais));
  });
  const regiao = REGIOES[regiaoIndice];
  const ids = Array.from({ length: regiao.fim - regiao.inicio + 1 }, (_, i) => regiao.inicio + i);
  const naRegiao = ids.filter((id) => possuidas.has(id)).length;

  return (
    <section className="vitrine-album" aria-labelledby="vitrine-album-titulo">
      <div className="vitrine-album-topo">
        <h3 id="vitrine-album-titulo">{`${regiao.nome} · ${naRegiao} de ${ids.length}`}</h3>
        <span
          className="vitrine-album-barra"
          role="progressbar"
          aria-label={`Espécies de ${regiao.nome}`}
          aria-valuemin={0}
          aria-valuemax={ids.length}
          aria-valuenow={naRegiao}
        >
          <span style={{ width: `${(naRegiao / ids.length) * 100}%` }} />
        </span>
      </div>
      <div className="vitrine-regioes" role="tablist" aria-label="Região">
        {REGIOES.map(({ nome }, i) => (
          <button
            key={nome}
            type="button"
            role="tab"
            aria-selected={i === regiaoIndice}
            className="vitrine-regiao"
            onClick={() => setRegiaoIndice(i)}
          >
            {nome}
          </button>
        ))}
      </div>
      <ul className="vitrine-album-grade">
        {ids.map((id) => {
          const especie = possuidas.get(id);
          return (
            <li key={id} data-possui={Boolean(especie)} title={especie ? `#${id}` : `#${id} · ainda não tem`}>
              <img src={urlSprite(id, especie?.shiny)} alt={especie ? `Espécie ${id}` : ''} loading="lazy" />
              <span>{id}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

Album.propTypes = {
  colecao: PropTypes.arrayOf(PropTypes.shape({ id: PropTypes.number.isRequired, shiny: PropTypes.bool })).isRequired,
};

// Formulário do dono: apresentação, estilo e até 6 Pokémon em destaque (na ordem dos cliques)
function EditorVitrine({ vitrine, pokemons, onSalvar, onCancelar }) {
  const [bio, setBio] = useState(vitrine.bio);
  const [estilo, setEstilo] = useState(vitrine.estilo);
  const [selecionados, setSelecionados] = useState(() => vitrine.destaques.map((p) => p.id));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState(null);

  const alternar = (id) => {
    setSelecionados((atual) => {
      if (atual.includes(id)) return atual.filter((outro) => outro !== id);
      return atual.length < DESTAQUES_MAXIMO ? [...atual, id] : atual;
    });
  };

  const handleSubmit = async (evento) => {
    evento.preventDefault();
    setSalvando(true);
    setErro(null);
    try {
      await onSalvar({ bio, estilo, pokemonIds: selecionados });
    } catch (e) {
      setErro(e.message);
      setSalvando(false);
    }
  };

  return (
    <form className="vitrine-editor" onSubmit={handleSubmit}>
      <h2 className="vitrine-titulo">Editar vitrine</h2>
      {erro && <p className="jogo-erro" role="alert">{erro}</p>}

      <label className="vitrine-campo">
        <span>Apresentação</span>
        <textarea
          value={bio}
          maxLength={BIO_MAXIMO}
          rows={2}
          placeholder="Ex.: Colecionador de tipos elétricos. Aceito desafios!"
          onChange={(e) => setBio(e.target.value)}
        />
        <small>{`${bio.length}/${BIO_MAXIMO}`}</small>
      </label>

      <fieldset className="vitrine-campo">
        <legend>Estilo</legend>
        <div className="vitrine-estilos">
          {ESTILOS.map(({ valor, nome, descricao }) => (
            <label key={valor} className="vitrine-estilo" data-marcado={estilo === valor}>
              <input type="radio" name="estilo" value={valor} checked={estilo === valor} onChange={() => setEstilo(valor)} />
              <strong>{nome}</strong>
              <span>{descricao}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="vitrine-campo">
        <legend>{`Pokémon em destaque (${selecionados.length}/${DESTAQUES_MAXIMO})`}</legend>
        <p className="vitrine-dica">Clique na ordem em que eles devem aparecer. Sem nenhum escolhido, a vitrine mostra o seu time.</p>
        <ul className="vitrine-escolha">
          {pokemons.map((pokemon) => {
            const ordem = selecionados.indexOf(pokemon.id);
            return (
              <li key={pokemon.id}>
                <button
                  type="button"
                  className="vitrine-escolha-item"
                  aria-pressed={ordem !== -1}
                  disabled={ordem === -1 && selecionados.length >= DESTAQUES_MAXIMO}
                  onClick={() => alternar(pokemon.id)}
                >
                  {ordem !== -1 && <span className="vitrine-escolha-ordem">{ordem + 1}</span>}
                  <img src={urlSprite(pokemon.especieId, pokemon.shiny)} alt="" loading="lazy" />
                  <span className="vitrine-escolha-nome">{formatarNome(pokemon.nome)}</span>
                  <span className="vitrine-escolha-detalhe">{`Nv. ${pokemon.nivel}`}</span>
                  <Coracoes quantidade={pokemon.afeto.coracoes} tamanho="pequeno" />
                </button>
              </li>
            );
          })}
        </ul>
      </fieldset>

      <div className="vitrine-editor-botoes">
        <button type="button" className="vitrine-botao vitrine-botao--secundario" onClick={onCancelar} disabled={salvando}>
          Cancelar
        </button>
        <button type="submit" className="vitrine-botao" disabled={salvando}>
          {salvando ? 'Salvando...' : 'Salvar vitrine'}
        </button>
      </div>
    </form>
  );
}

EditorVitrine.propTypes = {
  vitrine: PropTypes.shape({
    bio: PropTypes.string.isRequired,
    estilo: PropTypes.string.isRequired,
    destaques: PropTypes.arrayOf(formatoDestaque).isRequired,
  }).isRequired,
  pokemons: PropTypes.arrayOf(formatoPokemon).isRequired,
  onSalvar: PropTypes.func.isRequired,
  onCancelar: PropTypes.func.isRequired,
};

function Perfil({ vitrine, onEditar }) {
  const { treinador, estatisticas } = vitrine;
  const numeros = [
    { valor: estatisticas.especies, rotulo: 'espécies' },
    { valor: estatisticas.shinies, rotulo: 'shinies' },
    { valor: `${estatisticas.afetoTime.toLocaleString('pt-BR', { minimumFractionDigits: 1 })} ♥`, rotulo: 'afeto do time' },
    { valor: estatisticas.vitorias, rotulo: 'vitórias' },
  ];
  return (
    <section className="vitrine-perfil">
      <Avatar login={treinador.login} tamanho="grande" />
      <div className="vitrine-perfil-texto">
        <h2 className="vitrine-perfil-nome">
          {vitrine.estilo === 'album' ? <>Álbum de <span>{treinador.login}</span></> : treinador.login}
        </h2>
        <span className="vitrine-desde">{`Treinador desde ${formatarDesde(treinador.desde)}`}</span>
        {vitrine.bio && <p className="vitrine-bio">{vitrine.bio}</p>}
      </div>
      <dl className="vitrine-numeros">
        {numeros.map(({ valor, rotulo }) => (
          <div key={rotulo}>
            <dt>{rotulo}</dt>
            <dd>{valor}</dd>
          </div>
        ))}
      </dl>
      <div className="vitrine-perfil-rodape">
        <span className="vitrine-visitas">{`${vitrine.visitas} ${vitrine.visitas === 1 ? 'visita' : 'visitas'}`}</span>
        {vitrine.souDono && (
          <button type="button" className="vitrine-botao vitrine-botao--secundario" onClick={onEditar}>Editar vitrine</button>
        )}
      </div>
    </section>
  );
}

Perfil.propTypes = {
  vitrine: PropTypes.shape({
    treinador: PropTypes.shape({ login: PropTypes.string.isRequired, desde: PropTypes.string.isRequired }).isRequired,
    estatisticas: PropTypes.shape({
      especies: PropTypes.number.isRequired,
      shinies: PropTypes.number.isRequired,
      afetoTime: PropTypes.number.isRequired,
      vitorias: PropTypes.number.isRequired,
    }).isRequired,
    bio: PropTypes.string.isRequired,
    estilo: PropTypes.string.isRequired,
    visitas: PropTypes.number.isRequired,
    souDono: PropTypes.bool.isRequired,
  }).isRequired,
  onEditar: PropTypes.func.isRequired,
};

// Lista de vitrines de outros treinadores, com busca por login
function OutrasVitrines({ onVisitar }) {
  const [busca, setBusca] = useState('');
  const [lista, setLista] = useState(null);

  useEffect(() => {
    let ativo = true;
    // Espera parar de digitar para não buscar a cada letra
    const espera = setTimeout(() => {
      api.listarVitrines(busca.trim()).then((resposta) => {
        if (ativo) setLista(resposta);
      }, () => {
        if (ativo) setLista([]);
      });
    }, 300);
    return () => {
      ativo = false;
      clearTimeout(espera);
    };
  }, [busca]);

  return (
    <section className="vitrine-outras" aria-labelledby="vitrine-outras-titulo">
      <h2 id="vitrine-outras-titulo" className="vitrine-titulo">Visitar vitrines</h2>
      <input
        type="search"
        className="vitrine-busca"
        placeholder="Buscar treinador"
        aria-label="Buscar treinador"
        value={busca}
        maxLength={20}
        onChange={(e) => setBusca(e.target.value)}
      />
      {lista === null && <p className="vitrine-dica" aria-busy="true">Carregando vitrines...</p>}
      {lista?.length === 0 && <p className="vitrine-dica">Nenhuma vitrine encontrada.</p>}
      <ul className="vitrine-outras-lista">
        {lista?.map((item) => (
          <li key={item.login}>
            <button type="button" className="vitrine-outra" onClick={() => onVisitar(item.login)}>
              <Avatar login={item.login} />
              <span className="vitrine-outra-texto">
                <strong>{item.login}</strong>
                <span>{`${item.especies} espécies · ${item.visitas} visitas`}</span>
              </span>
              <span className="vitrine-outra-previa" aria-hidden="true">
                {item.previa.map((p, i) => (
                  <img key={`${p.especieId}-${i}`} src={urlSprite(p.especieId, p.shiny)} alt="" loading="lazy" />
                ))}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

OutrasVitrines.propTypes = { onVisitar: PropTypes.func.isRequired };

function Vitrine({ usuario }) {
  const [login, setLogin] = useState(usuario.login);
  const [vitrine, setVitrine] = useState(null);
  const [erro, setErro] = useState(null);
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState(null);

  const carregar = useCallback(async (alvo) => {
    setErro(null);
    try {
      setVitrine(await api.buscarVitrine(alvo));
    } catch (e) {
      setErro(e.message);
    }
  }, []);

  useEffect(() => {
    let ativo = true;
    api.buscarVitrine(login).then((resposta) => {
      if (ativo) setVitrine(resposta);
    }, (e) => {
      if (ativo) setErro(e.message);
    });
    return () => {
      ativo = false;
    };
  }, [login]);

  const visitar = (alvo) => {
    setVitrine(null);
    setEditando(false);
    setAviso(null);
    setLogin(alvo);
    window.scrollTo(0, 0);
  };

  const handleSalvar = async (dados) => {
    await api.salvarVitrine(dados);
    await carregar(login);
    setEditando(false);
    setAviso('Vitrine salva! Agora outros treinadores podem ver suas mudanças.');
  };

  const souDono = login.toLowerCase() === usuario.login.toLowerCase();

  const renderVitrine = () => {
    if (!vitrine) {
      return erro ? null : <p aria-busy="true">Carregando vitrine...</p>;
    }
    if (editando) {
      return (
        <EditorVitrine
          vitrine={vitrine}
          pokemons={usuario.pokemons}
          onSalvar={handleSalvar}
          onCancelar={() => setEditando(false)}
        />
      );
    }

    const palco = vitrine.estilo === 'palco';
    const destaques = vitrine.destaques.length > 0 ? (
      <section aria-labelledby="vitrine-destaques-titulo">
        {palco && (
          <div className="vitrine-secao-topo">
            <span className="vitrine-rotulo">Vitrine</span>
            <h2 id="vitrine-destaques-titulo" className="vitrine-titulo">Time em destaque</h2>
          </div>
        )}
        {!palco && <h3 id="vitrine-destaques-titulo" className="vitrine-sr">Pokémon em destaque</h3>}
        <ul className={palco ? 'vitrine-destaques' : 'vitrine-destaques vitrine-destaques--faixa'}>
          {vitrine.destaques.map((pokemon) => (
            <li key={pokemon.id}><CardDestaque pokemon={pokemon} compacto={!palco} /></li>
          ))}
        </ul>
      </section>
    ) : (
      <p className="vitrine-dica">
        {vitrine.souDono ? 'Monte seu time ou escolha destaques em "Editar vitrine".' : 'Este treinador ainda não tem destaques.'}
      </p>
    );

    return (
      <div className={`vitrine vitrine--${vitrine.estilo}`}>
        <Perfil vitrine={vitrine} onEditar={() => setEditando(true)} />
        <div className="vitrine-conteudo">
          {destaques}
          <Album key={vitrine.treinador.login} colecao={vitrine.colecao} />
        </div>
      </div>
    );
  };

  return (
    <>
      {!souDono && (
        <button type="button" className="vitrine-voltar" onClick={() => visitar(usuario.login)}>
          ← Minha vitrine
        </button>
      )}
      {erro && <p className="jogo-erro" role="alert">{erro}</p>}
      {aviso && <p className="jogo-aviso" role="status">{aviso}</p>}
      {renderVitrine()}
      {!editando && <OutrasVitrines onVisitar={visitar} />}
    </>
  );
}

Vitrine.propTypes = {
  usuario: PropTypes.shape({
    login: PropTypes.string.isRequired,
    pokemons: PropTypes.arrayOf(formatoPokemon).isRequired,
  }).isRequired,
};

export default Vitrine;
