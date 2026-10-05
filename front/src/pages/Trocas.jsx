import { useCallback, useEffect, useState } from 'react';
import PropTypes from 'prop-types';
import Mercado from '../components/Mercado';
import Anunciar from '../components/Anunciar';
import Propostas from '../components/Propostas';
import { formatoPokemon } from '../components/formatos';
import * as api from '../services/api';
import './Trocas.css';

const ABAS = [
  { valor: 'mercado', nome: 'Mercado' },
  { valor: 'anunciar', nome: 'Anunciar' },
  { valor: 'propostas', nome: 'Propostas' },
];

// Mercado entre jogadores: comprar/propor (Mercado), anunciar (Anunciar) e responder (Propostas)
function Trocas({ usuario, onAtualizarUsuario }) {
  const [aba, setAba] = useState('mercado');
  // Propostas recebidas esperando resposta (o número na aba)
  const [pendentes, setPendentes] = useState(0);

  const contarPendentes = useCallback(() => {
    api.listarPropostas().then(
      ({ recebidas }) => setPendentes(recebidas.filter((p) => p.status === 'pendente').length),
      () => {},
    );
  }, []);

  useEffect(() => {
    contarPendentes();
  }, [contarPendentes]);

  return (
    <section className="trocas">
      <header className="trocas-cabecalho">
        <div>
          <h1 className="trocas-titulo-pagina">Trocas</h1>
          <p className="trocas-dica">Compre, venda e troque Pokémon com outros treinadores.</p>
        </div>
        <div className="trocas-abas" role="tablist" aria-label="Trocas">
          {ABAS.map(({ valor, nome }) => (
            <button
              key={valor}
              type="button"
              role="tab"
              aria-selected={aba === valor}
              className="trocas-aba"
              onClick={() => setAba(valor)}
            >
              {nome}
              {valor === 'propostas' && pendentes > 0 && <span className="trocas-contador">{pendentes}</span>}
            </button>
          ))}
        </div>
      </header>

      {aba === 'mercado' && <Mercado usuario={usuario} onAtualizarUsuario={onAtualizarUsuario} />}
      {aba === 'anunciar' && (
        <Anunciar usuario={usuario} onAtualizarUsuario={onAtualizarUsuario} onVerPropostas={() => setAba('propostas')} />
      )}
      {aba === 'propostas' && <Propostas onAtualizarUsuario={onAtualizarUsuario} onMudou={contarPendentes} />}
    </section>
  );
}

Trocas.propTypes = {
  usuario: PropTypes.shape({
    pokecoins: PropTypes.number.isRequired,
    pokemons: PropTypes.arrayOf(formatoPokemon).isRequired,
  }).isRequired,
  onAtualizarUsuario: PropTypes.func.isRequired,
};

export default Trocas;
