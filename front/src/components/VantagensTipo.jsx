import PropTypes from 'prop-types';
import { dadosTipo, fraquezasDe, vantagensDe } from './tipos';
import './VantagensTipo.css';

// Linhas "Forte contra" e "Fraco contra" dos cards, calculadas pelos tipos do Pokémon
function VantagensTipo({ tipos }) {
  const linhas = [
    { rotulo: 'Forte contra', lista: vantagensDe(tipos) },
    { rotulo: 'Fraco contra', lista: fraquezasDe(tipos) },
  ];

  return (
    <dl className="vantagens-tipo">
      {linhas.map(({ rotulo, lista }) => (
        <div key={rotulo}>
          <dt>{rotulo}</dt>
          <dd>
            {lista.length > 0 ? (
              <ul>
                {lista.map((tipo) => (
                  <li key={tipo} style={{ background: dadosTipo(tipo).cor }}>{dadosTipo(tipo).nome}</li>
                ))}
              </ul>
            ) : (
              <span className="vantagens-tipo-nenhum">Nenhum</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

VantagensTipo.propTypes = {
  tipos: PropTypes.arrayOf(PropTypes.string).isRequired,
};

export default VantagensTipo;
