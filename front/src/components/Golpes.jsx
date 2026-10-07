import PropTypes from 'prop-types';
import { dadosTipo, formatarNome } from './tipos';
import './Golpes.css';

// Golpes especiais (sorteados na roleta com o afeto máximo): lista no cantinho e botões na batalha

const CLASSES = { physical: 'Físico', special: 'Especial' };

function detalhes(golpe, ppAtual) {
  const partes = [CLASSES[golpe.classe] ?? golpe.classe, `Poder ${golpe.poder}`];
  partes.push(golpe.precisao === null ? 'Nunca erra' : `Precisão ${golpe.precisao}%`);
  partes.push(ppAtual === undefined ? `PP ${golpe.pp}` : `PP ${ppAtual}/${golpe.ppMax}`);
  return partes.join(' · ');
}

function Golpe({ golpe, ppAtual }) {
  const tipo = dadosTipo(golpe.tipo);
  return (
    <>
      <span className="golpe-topo">
        <strong>{formatarNome(golpe.nome)}</strong>
        <span className="golpe-tipo" style={{ background: tipo.cor }}>{tipo.nome}</span>
      </span>
      <span className="golpe-detalhes">{detalhes(golpe, ppAtual)}</span>
    </>
  );
}

const formatoGolpe = PropTypes.shape({
  nome: PropTypes.string.isRequired,
  tipo: PropTypes.string.isRequired,
  classe: PropTypes.string.isRequired,
  poder: PropTypes.number.isRequired,
  precisao: PropTypes.number,
  pp: PropTypes.number.isRequired,
  ppMax: PropTypes.number,
});

Golpe.propTypes = { golpe: formatoGolpe.isRequired, ppAtual: PropTypes.number };

export function ListaGolpes({ golpes }) {
  return (
    <ul className="golpes-lista">
      {golpes.map((golpe) => (
        <li key={golpe.id} className="golpe" style={{ '--golpe-cor': dadosTipo(golpe.tipo).cor }}>
          <Golpe golpe={golpe} />
        </li>
      ))}
    </ul>
  );
}

ListaGolpes.propTypes = { golpes: PropTypes.arrayOf(formatoGolpe).isRequired };

// Botões da batalha para o Pokémon em campo (some se ele não tem golpes)
export function BotoesGolpes({ pokemon, desabilitado, onUsar }) {
  const golpes = pokemon.golpes ?? [];
  if (golpes.length === 0) return null;
  return (
    <ul className="golpes-botoes" aria-label={`Golpes especiais de ${formatarNome(pokemon.nome)}`}>
      {golpes.map((golpe, indice) => (
        <li key={golpe.id}>
          <button
            type="button"
            className="golpe"
            style={{ '--golpe-cor': dadosTipo(golpe.tipo).cor }}
            disabled={desabilitado || golpe.pp === 0}
            onClick={() => onUsar(indice)}
          >
            <Golpe golpe={golpe} ppAtual={golpe.pp} />
          </button>
        </li>
      ))}
    </ul>
  );
}

BotoesGolpes.propTypes = {
  pokemon: PropTypes.shape({
    nome: PropTypes.string.isRequired,
    golpes: PropTypes.arrayOf(formatoGolpe),
  }).isRequired,
  desabilitado: PropTypes.bool.isRequired,
  onUsar: PropTypes.func.isRequired,
};
