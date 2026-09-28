import { useState } from 'react';
import PropTypes from 'prop-types';
import './Cadastro.css';

const CELULAR_DIGITOS = 11;
const SENHA_MINIMA = 8;
const LOGIN_MAXIMO = 20;

function somenteDigitos(valor) {
  return valor.replace(/\D/g, '');
}

// Mantém só os números e aplica a máscara (00) 00000-0000
function formatarCelular(valor) {
  const digitos = somenteDigitos(valor).slice(0, CELULAR_DIGITOS);
  if (digitos.length <= 2) return digitos.replace(/^(\d{1,2})/, '($1');
  if (digitos.length <= 7) return digitos.replace(/^(\d{2})(\d+)/, '($1) $2');
  return digitos.replace(/^(\d{2})(\d{5})(\d+)/, '($1) $2-$3');
}

// Cada validação devolve a mensagem de erro, ou null quando está tudo certo
function validarLogin(login) {
  if (login.trim().length > LOGIN_MAXIMO) {
    return `O usuário pode ter no máximo ${LOGIN_MAXIMO} caracteres.`;
  }
  return null;
}

function validarCelular(celular) {
  if (somenteDigitos(celular).length !== CELULAR_DIGITOS) {
    return 'Informe um celular válido com DDD.';
  }
  return null;
}

function validarNovaSenha(senha, confirmarSenha) {
  if (senha.length < SENHA_MINIMA) {
    return `A senha precisa ter pelo menos ${SENHA_MINIMA} caracteres.`;
  }
  if (senha !== confirmarSenha) {
    return 'As senhas não conferem.';
  }
  return null;
}

function Cadastro({ onCadastrar, onVoltar }) {
  const [login, setLogin] = useState('');
  const [celular, setCelular] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [erro, setErro] = useState(null);

  const validar = () => {
    if (!login.trim() || !celular || !senha || !confirmarSenha) {
      return 'Preencha todos os campos para continuar.';
    }
    return validarLogin(login)
      ?? validarCelular(celular)
      ?? validarNovaSenha(senha, confirmarSenha);
  };

  const handleSubmit = (e) => {
    e.preventDefault();

    const mensagem = validar();
    if (mensagem) {
      setErro(mensagem);
      return;
    }

    setErro(null);
    onCadastrar({ login: login.trim(), celular: somenteDigitos(celular), senha });
  };

  return (
    <main className="cadastro-page">
      <div className="cadastro-pokedex-corpo">
        <div className="cadastro-pokedex-topo" aria-hidden="true">
          <span className="cadastro-pokedex-lente" />
          <div className="cadastro-pokedex-luzes">
            <span className="cadastro-pokedex-luz cadastro-pokedex-luz--vermelha" />
            <span className="cadastro-pokedex-luz cadastro-pokedex-luz--amarela" />
            <span className="cadastro-pokedex-luz cadastro-pokedex-luz--verde" />
          </div>
          <svg
            className="cadastro-pokedex-linha-degrau"
            viewBox="0 0 400 40"
            preserveAspectRatio="none"
          >
            <polyline points="0,22 200,22 272,4 400,4" />
            <polyline className="fina" points="0,32 204,32 276,14 400,14" />
          </svg>
        </div>

        <div className="cadastro-pokedex-tela-borda">
          <div className="cadastro-pokedex-tela">
            <div className="cadastro-professor">
              <img src="/professor-oak.gif" alt="Professor Carvalho" />
            </div>

            <h1 className="cadastro-title">PokeBox</h1>
            <p className="cadastro-subtitle">
              Bem-vindo ao mundo Pokémon! Conte-me sobre você, treinador.
            </p>

            <hr className="cadastro-pokedex-pontilhado" />

            <form className="cadastro-form" onSubmit={handleSubmit} noValidate>
              <label className="cadastro-field" htmlFor="cadastro-treinador">
                <span>Treinador</span>
                <input
                  id="cadastro-treinador"
                  type="text"
                  name="login"
                  maxLength={LOGIN_MAXIMO}
                  placeholder={`Até ${LOGIN_MAXIMO} caracteres`}
                  autoComplete="username"
                  value={login}
                  onChange={(e) => setLogin(e.target.value)}
                />
              </label>

              <label className="cadastro-field" htmlFor="cadastro-celular">
                <span>Celular</span>
                <input
                  id="cadastro-celular"
                  type="tel"
                  name="celular"
                  placeholder="(00) 00000-0000"
                  autoComplete="tel-national"
                  inputMode="numeric"
                  value={celular}
                  onChange={(e) => setCelular(formatarCelular(e.target.value))}
                />
              </label>

              <label className="cadastro-field" htmlFor="cadastro-senha">
                <span>Senha</span>
                <div className="cadastro-password">
                  <input
                    id="cadastro-senha"
                    type={mostrarSenha ? 'text' : 'password'}
                    name="senha"
                    placeholder={`Mínimo de ${SENHA_MINIMA} caracteres`}
                    autoComplete="new-password"
                    value={senha}
                    onChange={(e) => setSenha(e.target.value)}
                  />
                  <button
                    type="button"
                    className="cadastro-toggle"
                    onClick={() => setMostrarSenha((v) => !v)}
                    aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {mostrarSenha ? 'Ocultar' : 'Mostrar'}
                  </button>
                </div>
              </label>

              <label className="cadastro-field" htmlFor="cadastro-confirmar-senha">
                <span>Confirmar senha</span>
                <input
                  id="cadastro-confirmar-senha"
                  type={mostrarSenha ? 'text' : 'password'}
                  name="confirmarSenha"
                  placeholder="Repita a senha"
                  autoComplete="new-password"
                  value={confirmarSenha}
                  onChange={(e) => setConfirmarSenha(e.target.value)}
                />
              </label>

              {erro && (
                <p className="cadastro-error" role="alert">
                  {erro}
                </p>
              )}

              <button type="submit" className="cadastro-submit">
                Começar minha jornada!
              </button>
            </form>

            <hr className="cadastro-pokedex-pontilhado" />

            <div className="cadastro-register">
              <p>Já é um treinador?</p>
              <button
                type="button"
                className="cadastro-register-button"
                onClick={() => onVoltar()}
              >
                Entrar
              </button>
            </div>

            <span className="cadastro-pokedex-seta" aria-hidden="true" />
          </div>
        </div>
      </div>
    </main>
  );
}

Cadastro.propTypes = {
  onCadastrar: PropTypes.func.isRequired,
  onVoltar: PropTypes.func.isRequired,
};

export default Cadastro;
