import { useEffect, useRef } from 'react';
import PropTypes from 'prop-types';
import './Layout.css';

const MENU = [
  { tela: 'pokemons', nome: 'Pokédex' },
  { tela: 'meusPokemons', nome: 'Meus Pokémon' },
  { tela: 'loja', nome: 'Loja' },
  { tela: 'time', nome: 'Time' },
  { tela: 'historia', nome: 'História' },
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
  const menuRef = useRef(null);

  // No celular o menu é uma faixa que rola de lado: mantém a tela atual à vista
  useEffect(() => {
    const menu = menuRef.current;
    const atual = menu?.querySelector('[aria-current="page"]');
    if (!atual || menu.scrollWidth <= menu.clientWidth) return;
    menu.scrollTo({ left: atual.offsetLeft - (menu.clientWidth - atual.offsetWidth) / 2 });
  }, [telaAtual]);

  return (
    <div className="layout-page">
      <header className="layout-topo">
        <div className="layout-topo-conteudo">
          <div className="layout-marca">
            <span className="layout-lente" aria-hidden="true" />
            <span className="layout-titulo">PokeBox</span>
          </div>

          <nav ref={menuRef} className="layout-menu" aria-label="Menu" data-tutorial="menu">
            {MENU.map(({ tela, nome }) => (
              <button
                key={tela}
                type="button"
                className="layout-menu-item"
                data-tutorial={tela}
                aria-current={telaAtual === tela ? 'page' : undefined}
                onClick={() => onNavegar(tela)}
              >
                {nome}
              </button>
            ))}
          </nav>

          <div className="layout-usuario" data-tutorial="saldo">
            <span>{usuario.login}</span>
            <span className="layout-moedas" title="Pokécoins">
              <span className="layout-moeda" aria-hidden="true" />
              {usuario.pokecoins}
              {/* No celular só o número aparece, a moeda já diz o que é */}
              <span className="layout-rotulo"> Pokécoins</span>
            </span>
            <span className="layout-moedas" title="Pokébolas para capturar Pokémon na história">
              <span className="layout-pokebola" aria-hidden="true" />
              {usuario.pokebolas ?? 0}
              <span className="layout-rotulo">{` Pokébola${usuario.pokebolas === 1 ? '' : 's'}`}</span>
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
    pokebolas: PropTypes.number,
  }).isRequired,
  telaAtual: PropTypes.string.isRequired,
  onNavegar: PropTypes.func.isRequired,
  onSair: PropTypes.func.isRequired,
  children: PropTypes.node.isRequired,
};

export default Layout;
