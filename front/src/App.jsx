import { useCallback, useEffect, useState } from 'react';
import Layout from './components/Layout';
import Login from './pages/Login';
import Cadastro from './pages/Cadastro';
import RecuperarSenha from './pages/RecuperarSenha';
import Pokemons from './pages/Pokemons';
import MeusPokemons from './pages/MeusPokemons';
import Loja from './pages/Loja';
import Time from './pages/Time';
import Batalhas from './pages/Batalhas';
import Batalha from './pages/Batalha';
import Vitrine from './pages/Vitrine';
import Trocas from './pages/Trocas';
import * as api from './services/api';

const TAMANHO_TIME = 5;

function App() {
  const [tela, setTela] = useState('login');
  // { id, login, pokecoins, pokemons } ou null se não está logado
  const [usuario, setUsuario] = useState(null);
  // Enquanto confere se o token salvo ainda vale, não mostra o login para não "piscar"
  const [conferindoSessao, setConferindoSessao] = useState(api.temSessao);
  const [batalhaId, setBatalhaId] = useState(null);

  // Busca saldo e coleção de novo (depois de comprar, evoluir, batalhar...)
  const recarregarUsuario = useCallback(async () => {
    try {
      const { usuario: dados, pokemons } = await api.buscarEu();
      setUsuario({ ...dados, pokemons });
      return pokemons;
    } catch (erro) {
      // Sessão expirou ou a senha foi trocada em outro lugar
      if (erro.status === 401) {
        setUsuario(null);
        setTela('login');
      }
      throw erro;
    }
  }, []);

  // Recarrega sem deixar o erro escapar (usado em atualizações de fundo)
  const atualizarUsuario = useCallback(() => {
    recarregarUsuario().catch(() => {});
  }, [recarregarUsuario]);

  // Login salvo de uma visita anterior
  useEffect(() => {
    if (!api.temSessao()) return;
    // Se o token não vale mais, o api.js o apaga e o usuário cai no login
    api.buscarEu()
      .then(({ usuario: dados, pokemons }) => {
        setUsuario({ ...dados, pokemons });
        setTela(pokemons.length === 0 ? 'meusPokemons' : 'batalhas');
      }, () => {})
      .finally(() => setConferindoSessao(false));
  }, []);

  const entrarNoJogo = async () => {
    const pokemons = await recarregarUsuario();
    // Quem ainda não tem Pokémon cai direto na escolha do inicial
    setTela(pokemons.length === 0 ? 'meusPokemons' : 'batalhas');
  };

  const handleLogin = async ({ login, senha }) => {
    await api.entrar(login, senha);
    await entrarNoJogo();
  };

  const handleCadastrar = async (dados) => {
    await api.cadastrar(dados);
    await entrarNoJogo();
  };

  const handleRedefinirSenha = async (dados) => {
    await api.redefinirSenha(dados);
    setTela('login');
  };

  const handleSair = async () => {
    await api.sair().catch(() => {});
    setUsuario(null);
    setTela('login');
  };

  const handleNavegar = (destino) => {
    setTela(destino);
    atualizarUsuario();
  };

  const handleAbrirBatalha = (id) => {
    setBatalhaId(id);
    setTela('batalha');
  };

  if (conferindoSessao) return null;

  if (!usuario) {
    if (tela === 'cadastro') {
      return <Cadastro onCadastrar={handleCadastrar} onVoltar={() => setTela('login')} />;
    }
    if (tela === 'recuperarSenha') {
      return (
        <RecuperarSenha
          onVerificar={api.verificarUsuario}
          onRedefinir={handleRedefinirSenha}
          onVoltar={() => setTela('login')}
        />
      );
    }
    return (
      <Login
        onLogin={handleLogin}
        onCadastro={() => setTela('cadastro')}
        onEsqueciSenha={() => setTela('recuperarSenha')}
      />
    );
  }

  const telas = {
    pokemons: () => <Pokemons />,
    meusPokemons: () => (
      <MeusPokemons
        usuario={usuario}
        onEscolherInicial={async (especieId) => {
          await api.escolherInicial(especieId);
          await recarregarUsuario();
        }}
        onEvoluir={async (pokemonId, especieId) => {
          const evoluido = await api.evoluir(pokemonId, especieId);
          await recarregarUsuario();
          return evoluido;
        }}
        onCuidar={async (pokemonId, tipo) => {
          const cuidado = await api.cuidar(pokemonId, tipo);
          await recarregarUsuario();
          return cuidado;
        }}
      />
    ),
    vitrine: () => <Vitrine usuario={usuario} />,
    trocas: () => <Trocas usuario={usuario} onAtualizarUsuario={recarregarUsuario} />,
    loja: () => (
      <Loja
        usuario={usuario}
        onComprar={async () => {
          const compra = await api.comprarPokemon();
          await recarregarUsuario();
          return compra;
        }}
      />
    ),
    time: () => (
      <Time
        // key: remonta com a seleção salva quando a coleção muda (ex.: depois de salvar)
        key={usuario.pokemons.map((p) => `${p.id}:${p.posicaoTime}`).join()}
        usuario={usuario}
        onSalvar={async (ids) => {
          await api.salvarTime(ids);
          await recarregarUsuario();
        }}
        onIrParaLoja={() => handleNavegar('loja')}
      />
    ),
    batalhas: () => (
      <Batalhas
        temTime={usuario.pokemons.filter((p) => p.posicaoTime).length === TAMANHO_TIME}
        onAbrir={handleAbrirBatalha}
        onAtualizarUsuario={atualizarUsuario}
      />
    ),
    batalha: () => (
      <Batalha
        key={batalhaId}
        batalhaId={batalhaId}
        onVoltar={() => handleNavegar('batalhas')}
        onAtualizarUsuario={atualizarUsuario}
      />
    ),
  };
  const renderTela = telas[tela] ?? telas.batalhas;

  return (
    <Layout
      usuario={usuario}
      telaAtual={tela === 'batalha' ? 'batalhas' : tela}
      onNavegar={handleNavegar}
      onSair={handleSair}
    >
      {renderTela()}
    </Layout>
  );
}

export default App;
