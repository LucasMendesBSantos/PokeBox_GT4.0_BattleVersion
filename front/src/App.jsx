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
import Historia from './pages/Historia';
import Tutorial from './components/Tutorial';
import { PASSOS_TUTORIAL, passoSalvo, salvarPasso } from './components/passosTutorial';
import * as api from './services/api';

const TAMANHO_TIME = 3;
// Com o jogo aberto, avisa o back que o treinador está online (ele considera online por 1 min)
const PRESENCA_MS = 20 * 1000;

function App() {
  const [tela, setTela] = useState('login');
  // { id, login, pokecoins, pokemons } ou null se não está logado
  const [usuario, setUsuario] = useState(null);
  // Enquanto confere se o token salvo ainda vale, não mostra o login para não "piscar"
  const [conferindoSessao, setConferindoSessao] = useState(api.temSessao);
  const [batalhaId, setBatalhaId] = useState(null);
  // Passo do tutorial de primeiro acesso, ou null quando fechado
  const [passoTutorial, setPassoTutorial] = useState(null);
  // O card do inicial some enquanto o treinador escolhe o parceiro
  const [esperandoInicial, setEsperandoInicial] = useState(false);

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

  const comecarSessao = useCallback(({ usuario: dados, pokemons }) => {
    setUsuario({ ...dados, pokemons });
    // No primeiro acesso (ou se recarregou no meio) o tutorial abre na tela do passo
    const passo = passoSalvo(dados.id, pokemons);
    setPassoTutorial(passo);
    setEsperandoInicial(false);
    if (passo !== null) setTela(PASSOS_TUTORIAL[passo].tela);
    // Quem ainda não tem Pokémon cai direto na escolha do inicial
    else setTela(pokemons.length === 0 ? 'meusPokemons' : 'batalhas');
  }, []);

  const usuarioId = usuario?.id;
  useEffect(() => {
    if (!usuarioId) return undefined;
    const timer = setInterval(() => api.marcarPresenca().catch(() => {}), PRESENCA_MS);
    return () => clearInterval(timer);
  }, [usuarioId]);

  // Login salvo de uma visita anterior
  useEffect(() => {
    if (!api.temSessao()) return;
    // Se o token não vale mais, o api.js o apaga e o usuário cai no login
    api.buscarEu()
      .then(comecarSessao, () => {})
      .finally(() => setConferindoSessao(false));
  }, [comecarSessao]);

  const entrarNoJogo = async () => {
    comecarSessao(await api.buscarEu());
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
    setPassoTutorial(null);
    setEsperandoInicial(false);
    setTela('login');
  };

  const handleNavegar = (destino) => {
    setTela(destino);
    atualizarUsuario();
  };

  const irParaPassoTutorial = (passo) => {
    const fim = passo >= PASSOS_TUTORIAL.length;
    salvarPasso(usuario.id, fim ? null : passo);
    setPassoTutorial(fim ? null : passo);
    setEsperandoInicial(false);
    if (!fim) handleNavegar(PASSOS_TUTORIAL[passo].tela);
  };

  const handleProximoTutorial = () => {
    if (PASSOS_TUTORIAL[passoTutorial].esperaInicial && usuario.pokemons.length === 0) {
      setEsperandoInicial(true);
      return;
    }
    irParaPassoTutorial(passoTutorial + 1);
  };

  const handlePularTutorial = () => {
    salvarPasso(usuario.id, null);
    setPassoTutorial(null);
    setEsperandoInicial(false);
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
        tutorialGeralAberto={passoTutorial !== null}
        onEscolherInicial={async (especieId) => {
          await api.escolherInicial(especieId);
          await recarregarUsuario();
          if (esperandoInicial) irParaPassoTutorial(passoTutorial + 1);
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
        onRoletarGolpes={async (pokemonId) => {
          const roleta = await api.roletarGolpes(pokemonId);
          await recarregarUsuario();
          return roleta;
        }}
        onDesbloquearGolpes={async (pokemonId) => {
          const desbloqueio = await api.desbloquearGolpes(pokemonId);
          await recarregarUsuario();
          return desbloqueio;
        }}
      />
    ),
    vitrine: () => <Vitrine usuario={usuario} />,
    trocas: () => <Trocas usuario={usuario} onAtualizarUsuario={recarregarUsuario} />,
    loja: () => (
      <Loja
        usuario={usuario}
        onComprar={async (geracao) => {
          const compra = await api.comprarPokemon(geracao);
          await recarregarUsuario();
          return compra;
        }}
        onComprarPokebolas={async (quantidade) => {
          await api.comprarPokebolas(quantidade);
          await recarregarUsuario();
        }}
        onIrParaTime={() => handleNavegar('time')}
      />
    ),
    historia: () => (
      <Historia usuario={usuario} onAtualizarUsuario={recarregarUsuario} onIrPara={handleNavegar} />
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
      {passoTutorial !== null && !esperandoInicial && (
        <Tutorial
          key={passoTutorial}
          passos={PASSOS_TUTORIAL}
          passo={passoTutorial}
          onProximo={handleProximoTutorial}
          onPular={handlePularTutorial}
        />
      )}
    </Layout>
  );
}

export default App;
