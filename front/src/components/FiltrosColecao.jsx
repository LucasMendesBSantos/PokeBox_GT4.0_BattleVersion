import PropTypes from 'prop-types';
import { CRITERIOS, FILTROS_INICIAIS } from './colecao';
import { dadosTipo } from './tipos';
import './FiltrosColecao.css';

// Barra de busca, filtros e ordenação da coleção (Meus Pokémon)
function FiltrosColecao({
  filtros, onMudar, tipos, mostrando, total,
}) {
  const mudar = (campo, valor) => onMudar({ ...filtros, [campo]: valor });
  const alterado = JSON.stringify(filtros) !== JSON.stringify(FILTROS_INICIAIS);
  const decrescente = filtros.direcao === 'desc';

  return (
    <div className="filtros-colecao jogo-painel">
      <label className="filtros-colecao-campo filtros-colecao-busca">
        <span>Buscar</span>
        <input
          type="search"
          value={filtros.busca}
          placeholder="Nome ou número do card"
          onChange={(e) => mudar('busca', e.target.value)}
        />
      </label>

      <label className="filtros-colecao-campo">
        <span>Tipo</span>
        <select value={filtros.tipo} onChange={(e) => mudar('tipo', e.target.value)}>
          <option value="">Todos</option>
          {[...tipos]
            .sort((a, b) => dadosTipo(a).nome.localeCompare(dadosTipo(b).nome, 'pt-BR'))
            .map((tipo) => <option key={tipo} value={tipo}>{dadosTipo(tipo).nome}</option>)}
        </select>
      </label>

      <label className="filtros-colecao-campo">
        <span>Ordenar por</span>
        <select
          value={filtros.ordem}
          // Cada critério já começa na direção mais útil (nome A–Z, status do maior para o menor)
          onChange={(e) => onMudar({ ...filtros, ordem: e.target.value, direcao: CRITERIOS[e.target.value].direcao })}
        >
          {Object.entries(CRITERIOS).map(([chave, { rotulo }]) => <option key={chave} value={chave}>{rotulo}</option>)}
        </select>
      </label>

      <button
        type="button"
        className="filtros-colecao-direcao"
        onClick={() => mudar('direcao', decrescente ? 'asc' : 'desc')}
        aria-label={decrescente ? 'Ordem decrescente. Clique para inverter' : 'Ordem crescente. Clique para inverter'}
        title="Inverter a ordem"
      >
        {decrescente ? '↓ Maior primeiro' : '↑ Menor primeiro'}
      </button>

      <div className="filtros-colecao-marcar">
        <label>
          <input type="checkbox" checked={filtros.soShiny} onChange={(e) => mudar('soShiny', e.target.checked)} />
          Só shiny
        </label>
        <label>
          <input type="checkbox" checked={filtros.soTime} onChange={(e) => mudar('soTime', e.target.checked)} />
          Só do time
        </label>
      </div>

      <p className="filtros-colecao-resumo" role="status">
        {mostrando === total ? `${total} Pokémon` : `Mostrando ${mostrando} de ${total}`}
        {alterado && (
          <button type="button" className="filtros-colecao-limpar" onClick={() => onMudar(FILTROS_INICIAIS)}>
            Limpar filtros
          </button>
        )}
      </p>
    </div>
  );
}

FiltrosColecao.propTypes = {
  filtros: PropTypes.shape({
    busca: PropTypes.string.isRequired,
    tipo: PropTypes.string.isRequired,
    ordem: PropTypes.string.isRequired,
    direcao: PropTypes.oneOf(['asc', 'desc']).isRequired,
    soShiny: PropTypes.bool.isRequired,
    soTime: PropTypes.bool.isRequired,
  }).isRequired,
  onMudar: PropTypes.func.isRequired,
  tipos: PropTypes.arrayOf(PropTypes.string).isRequired,
  mostrando: PropTypes.number.isRequired,
  total: PropTypes.number.isRequired,
};

export default FiltrosColecao;
