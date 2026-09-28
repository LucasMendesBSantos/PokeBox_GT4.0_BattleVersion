import { useState } from 'react';
import Login from './pages/Login';
import Cadastro from './pages/Cadastro';
import RecuperarSenha from './pages/RecuperarSenha';
import Pokemons from './pages/Pokemons';
import MeusPokemons from './pages/MeusPokemons';

function App() {
  const [tela, setTela] = useState('login');
  const [usuario, setUsuario] = useState(null);

  const handleLogin = (credenciais) => {
    // TODO: integrar com o endpoint de autenticação do back.
    // Enquanto o endpoint não existe, qualquer login entra e começa sem Pokémon.
    setUsuario({ login: credenciais.login, box: [] });
    setTela('pokemons');
  };

  const handleEscolherInicial = (id) => {
    // TODO: salvar o Pokémon inicial no back
    setUsuario((atual) => ({ ...atual, box: [id] }));
  };

  const handleSair = () => {
    setUsuario(null);
    setTela('login');
  };

  const handleCadastrar = (dados) => {
    // TODO: integrar com o endpoint de cadastro do back
    console.log('Cadastro:', dados.login, dados.celular);
  };

  const handleVerificarUsuario = async (dados) => {
    // TODO: perguntar ao back se existe um usuário com esse login e celular.
    // Enquanto o endpoint não existe, qualquer combinação é aceita.
    console.log('Verificar usuário:', dados.login, dados.celular);
    return true;
  };

  const handleRedefinirSenha = (dados) => {
    // TODO: integrar com o endpoint de redefinição de senha do back
    console.log('Redefinir senha:', dados.login);
    setTela('login');
  };

  if (usuario && tela === 'meusPokemons') {
    return (
      <MeusPokemons
        usuario={usuario}
        onEscolherInicial={handleEscolherInicial}
        onTodosPokemons={() => setTela('pokemons')}
        onSair={handleSair}
      />
    );
  }

  if (usuario) {
    return (
      <Pokemons
        usuario={usuario}
        onMeusPokemons={() => setTela('meusPokemons')}
        onSair={handleSair}
      />
    );
  }

  if (tela === 'cadastro') {
    return <Cadastro onCadastrar={handleCadastrar} onVoltar={() => setTela('login')} />;
  }

  if (tela === 'recuperarSenha') {
    return (
      <RecuperarSenha
        onVerificar={handleVerificarUsuario}
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

export default App;
