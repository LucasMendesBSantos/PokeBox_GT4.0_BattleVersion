import { useState } from 'react';
import PropTypes from 'prop-types';
import './Login.css';

const LOGIN_MAXIMO = 20;

function Login({ onLogin, onCadastro, onEsqueciSenha }) {
  const [login, setLogin] = useState('');
  const [senha, setSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState(null);

  const handleSubmit = (e) => {
    e.preventDefault();

    if (!login.trim() || !senha) {
      setErro('Preencha usuário e senha para continuar.');
      return;
    }

    setErro(null);
    onLogin({ login: login.trim(), senha });
  };

  return (
    <main className="login-page">
      <div className="pokedex-corpo">
        <div className="pokedex-topo" aria-hidden="true">
          <span className="pokedex-lente" />
          <div className="pokedex-luzes">
            <span className="pokedex-luz pokedex-luz--vermelha" />
            <span className="pokedex-luz pokedex-luz--amarela" />
            <span className="pokedex-luz pokedex-luz--verde" />
          </div>
          <svg
            className="pokedex-linha-degrau"
            viewBox="0 0 400 40"
            preserveAspectRatio="none"
          >
            <polyline points="0,22 200,22 272,4 400,4" />
            <polyline className="fina" points="0,32 204,32 276,14 400,14" />
          </svg>
        </div>

        <div className="pokedex-tela-borda">
          <div className="pokedex-tela">
            <div className="login-pokeball" aria-hidden="true">
              <span className="login-pokeball-button" />
            </div>

            <h1 className="login-title">PokeBox</h1>
            <p className="login-subtitle">Entre para acessar sua Pokédex</p>

            <hr className="pokedex-pontilhado" />

            <form className="login-form" onSubmit={handleSubmit} noValidate>
              <label className="login-field" htmlFor="login-treinador">
                <span>Treinador</span>
                <input
                  id="login-treinador"
                  type="text"
                  name="login"
                  maxLength={LOGIN_MAXIMO}
                  placeholder="Seu usuário"
                  autoComplete="username"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                />
              </label>

              <label className="login-field" htmlFor="login-senha">
                <span>Senha</span>
                <div className="login-password">
                  <input
                    id="login-senha"
                    type={mostrarSenha ? 'text' : 'password'}
                    name="senha"
                    placeholder="Sua senha"
                    autoComplete="current-password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                  <button
                    type="button"
                    className="login-toggle"
                    onClick={() => setMostrarSenha((v) => !v)}
                    aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {mostrarSenha ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </label>

              <button
                type="button"
                className="login-forgot"
                onClick={() => onEsqueciSenha()}
              >
                Esqueci minha senha.
              </button>

              {erro && (
                <p className="login-error" role="alert">
                  {erro}
                </p>
              )}

              <button type="submit" className="login-submit">
                Eu escolho você!
              </button>
            </form>

            <hr className="pokedex-pontilhado" />

            <div className="login-register">
              <p>Ainda não é um treinador?</p>
              <button
                type="button"
                className="login-register-button"
                onClick={() => onCadastro()}
              >
                Cadastre-se
              </button>
            </div>

            <span className="pokedex-seta" aria-hidden="true" />
          </div>
        </div>
      </div>
    </main>
  );
}

Login.propTypes = {
  onLogin: PropTypes.func.isRequired,
  onCadastro: PropTypes.func.isRequired,
  onEsqueciSenha: PropTypes.func.isRequired,
};

export default Login;
