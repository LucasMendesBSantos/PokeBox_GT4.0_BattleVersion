import PropTypes from 'prop-types';
import './Layout.css';

const MENU = [
  { tela: 'pokemons', nome: 'Pokédex' },
  { tela: 'meusPokemons', nome: 'Meus Pokémon' },
  { tela: 'loja', nome: 'Loja' },
  { tela: 'time', nome: 'Time' },
  { tela: 'vitrine', nome: 'Vitrine' },
  { tela: 'trocas', nome: 'Trocas' },
  { tela: 'batalhas', nome: 'Batalhas' },
];

// Barra vermelha da Pokédex com o menu, usada por todas as telas depois do login
function Layout({
  usuario,
  telaAtual,
  onNavegar,
  onSair,
  children,
}) {
  return (
    <div className="layout-page">
      <header className="layout-topo">
        <div className="layout-topo-conteudo">
          <div className="layout-marca">
            <span className="layout-lente" aria-hidden="true" />
            <span className="layout-titulo">PokeBox</span>
          </div>

          <nav className="layout-menu" aria-label="Menu">
            {MENU.map(({ tela, nome }) => (
              <button
                key={tela}
                type="button"
                className="layout-menu-item"
                aria-current={telaAtual === tela ? 'page' : undefined}
                onClick={() => onNavegar(tela)}
              >
                {nome}
              </button>
            ))}
          </nav>

          <div className="layout-usuario">
            <span>{usuario.login}</span>
            <span className="layout-moedas" title="Pokécoins">
              <span className="layout-moeda" aria-hidden="true" />
              {`${usuario.pokecoins} Pokécoins`}
            </span>
            <button type="button" className="layout-sair" onClick={() => onSair()}>
              Sair
            </button>
          </div>
        </div>
      </header>

      <main className="layout-conteudo">{children}</main>
    </div>
  );
}

Layout.propTypes = {
  usuario: PropTypes.shape({
    login: PropTypes.string.isRequired,
    pokecoins: PropTypes.number.isRequired,
  }).isRequired,
  telaAtual: PropTypes.string.isRequired,
  onNavegar: PropTypes.func.isRequired,
  onSair: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

export default Layout;
