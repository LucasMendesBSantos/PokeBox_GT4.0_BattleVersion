import PropTypes from 'prop-types';
import { urlArtwork } from '../services/pokeapi';
import Coracoes from './Coracoes';
import { formatoPokemon, resumoEvolucao } from './formatos';
import { dadosTipo, formatarNome, formatarNumero } from './tipos';
import './CartaPokemon.css';

const STATUS = [
  { chave: 'hp', nome: 'PS' },
  { chave: 'ataque', nome: 'Ataque' },
  { chave: 'defesa', nome: 'Defesa' },
  { chave: 'velocidade', nome: 'Velocidade' },
];

const RARIDADES = { lendario: 'Lendário', mitico: 'Mítico' };

// IV a partir do qual o valor ganha destaque dourado
const IV_ALTO = 25;

/**
 * Card de um Pokémon do jogador (objeto único, com Mint ID, IVs e nível).
 * O card da Pokédex (dados da PokeAPI) é o PokemonCard.
 */
function CartaPokemon({
  pokemon,
  compacto = false,
  onEvoluir = null,
  evoluindo = false,
  onCuidar = null,
  children = null,
}) {
  const cor = dadosTipo(pokemon.tipos[0]).cor;
  const porcentagemXp = pokemon.xpParaSubir ? Math.min(pokemon.xp / pokemon.xpParaSubir, 1) * 100 : 100;
  const nome = formatarNome(pokemon.nome);
  const evolucao = resumoEvolucao(pokemon);

  return (
    <article
      className={`carta${pokemon.shiny ? ' carta--shiny' : ''}${compacto ? ' carta--compacta' : ''}`}
      style={{ '--carta-cor': cor }}
    >
      <header className="carta-topo">
        <span className="carta-mint" title="Mint ID: número único deste card">{formatarNumero(pokemon.mintNumero)}</span>
        <h3 className="carta-nome">{nome}</h3>
        <div className="carta-selos">
          {pokemon.shiny && <span className="carta-selo carta-selo--shiny">★ Shiny</span>}
          {RARIDADES[pokemon.raridade] && (
            <span className="carta-selo carta-selo--raro">{RARIDADES[pokemon.raridade]}</span>
          )}
          {pokemon.posicaoTime && <span className="carta-selo">{`Time #${pokemon.posicaoTime}`}</span>}
          {pokemon.anunciado && <span className="carta-selo carta-selo--anunciado">Nas trocas</span>}
        </div>
      </header>

      <div className="carta-imagem">
        <img src={urlArtwork(pokemon.especieId, pokemon.shiny)} alt={`${nome}${pokemon.shiny ? ' shiny' : ''}`} loading="lazy" />
      </div>

      <ul className="carta-tipos">
        {pokemon.tipos.map((tipo) => (
          <li key={tipo} style={{ background: dadosTipo(tipo).cor }}>{dadosTipo(tipo).nome}</li>
        ))}
      </ul>

      <div className="carta-nivel">
        <span>{`Nível ${pokemon.nivel}`}</span>
        <span className="carta-xp-texto">
          {pokemon.xpParaSubir ? `${pokemon.xp} / ${pokemon.xpParaSubir} XP` : 'Nível máximo'}
        </span>
        <span
          className="carta-xp"
          role="progressbar"
          aria-label="Experiência"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(porcentagemXp)}
        >
          <span style={{ width: `${porcentagemXp}%` }} />
        </span>
      </div>

      {compacto && evolucao && (
        <p className="carta-evolucao-resumo" data-pronto={evolucao.pronto}>{evolucao.texto}</p>
      )}

      <div className="carta-afeto">
        <Coracoes quantidade={pokemon.afeto.coracoes} tamanho={compacto ? 'pequeno' : 'normal'} />
        {pokemon.afeto.bonusStatus > 0 && (
          <span className="carta-afeto-bonus" title="Bônus do afeto em todos os status">
            {`+${Math.round(pokemon.afeto.bonusStatus * 100)}% status`}
          </span>
        )}
      </div>

      {onCuidar && (
        <button type="button" className="carta-cuidar" onClick={() => onCuidar(pokemon)}>
          {`Cuidar de ${nome}`}
        </button>
      )}

      {!compacto && (
        <>
          <dl className="carta-status">
            {STATUS.map(({ chave, nome: rotulo }) => (
              <div key={chave}>
                <dt>{rotulo}</dt>
                <dd>
                  {pokemon.status[chave]}
                  {pokemon.bonusEvolucao?.[chave] > 0 && (
                    <span className="carta-bonus-evolucao" title="Pontos extras ganhos ao evoluir (já somados)">
                      {`+${pokemon.bonusEvolucao[chave]} evo`}
                    </span>
                  )}
                  <span className={`carta-iv${pokemon.ivs[chave] >= IV_ALTO ? ' carta-iv--alto' : ''}`}>
                    {`IV ${pokemon.ivs[chave]}`}
                  </span>
                </dd>
              </div>
            ))}
          </dl>

          <dl className="carta-medidas">
            <div>
              <dt>Altura</dt>
              <dd>{`${pokemon.alturaM.toLocaleString('pt-BR')} m`}</dd>
            </div>
            <div>
              <dt>Peso</dt>
              <dd>{`${pokemon.pesoKg.toLocaleString('pt-BR')} kg`}</dd>
            </div>
          </dl>

          {pokemon.evolucoes.length > 0 && (
            <ul className="carta-evolucoes">
              {pokemon.evolucoes.map((evolucao) => (
                <li key={evolucao.especieId}>
                  {evolucao.disponivel && onEvoluir ? (
                    <button
                      type="button"
                      className="carta-evoluir"
                      disabled={evoluindo}
                      onClick={() => onEvoluir(pokemon, evolucao)}
                    >
                      {`Evoluir para ${formatarNome(evolucao.nome)}`}
                    </button>
                  ) : (
                    <span className="carta-evolucao-futura">
                      {`Evolui para ${formatarNome(evolucao.nome)} no nível ${evolucao.nivel}`}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {children}
    </article>
  );
}

CartaPokemon.propTypes = {
  pokemon: formatoPokemon.isRequired,
  compacto: PropTypes.bool,
  onEvoluir: PropTypes.func,
  evoluindo: PropTypes.bool,
  onCuidar: PropTypes.func,
  children: PropTypes.node,
};

export default CartaPokemon;
