import { useState } from 'react';
import PropTypes from 'prop-types';
import './RecuperarSenha.css';

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

// Etapa 1: confere login + celular. Etapa 2: define a nova senha daquele usuário.
function RecuperarSenha({ onVerificar, onRedefinir, onVoltar }) {
  const [etapa, setEtapa] = useState('verificar');
  const [login, setLogin] = useState('');
  const [celular, setCelular] = useState('');
  const [senha, setSenha] = useState('');
  const [confirmarSenha, setConfirmarSenha] = useState('');
  const [mostrarSenha, setMostrarSenha] = useState(false);
  const [verificando, setVerificando] = useState(false);
  const [erro, setErro] = useState(null);

  const dadosUsuario = () => ({ login: login.trim(), celular: somenteDigitos(celular) });

  const handleVerificar = async (e) => {
    e.preventDefault();

    if (!login.trim() || !celular) {
      setErro('Preencha usuário e celular para continuar.');
      return;
    }
    const erroDados = validarLogin(login) ?? validarCelular(celular);
    if (erroDados) {
      setErro(erroDados);
      return;
    }

    setErro(null);
    setVerificando(true);
    try {
      const encontrado = await onVerificar(dadosUsuario());
      if (!encontrado) {
        setErro('Não encontramos um treinador com esse usuário e celular.');
        return;
      }
      setEtapa('redefinir');
    } catch {
      setErro('Não foi possível verificar agora. Tente novamente.');
    } finally {
      setVerificando(false);
    }
  };

  const handleRedefinir = (e) => {
    e.preventDefault();

    if (!senha || !confirmarSenha) {
      setErro('Preencha a nova senha e a confirmação.');
      return;
    }
    const erroSenha = validarNovaSenha(senha, confirmarSenha);
    if (erroSenha) {
      setErro(erroSenha);
      return;
    }

    setErro(null);
    onRedefinir({ ...dadosUsuario(), senha });
  };

  const handleTrocarUsuario = () => {
    setEtapa('verificar');
    setSenha('');
    setConfirmarSenha('');
    setErro(null);
  };

  return (
    <main className="recuperar-page">
      <div className="recuperar-pokedex-corpo">
        <div className="recuperar-pokedex-topo" aria-hidden="true">
          <span className="recuperar-pokedex-lente" />
          <div className="recuperar-pokedex-luzes">
            <span className="recuperar-pokedex-luz recuperar-pokedex-luz--vermelha" />
            <span className="recuperar-pokedex-luz recuperar-pokedex-luz--amarela" />
            <span className="recuperar-pokedex-luz recuperar-pokedex-luz--verde" />
          </div>
          <svg
            className="recuperar-pokedex-linha-degrau"
            viewBox="0 0 400 40"
            preserveAspectRatio="none"
          >
            <polyline points="0,22 200,22 272,4 400,4" />
            <polyline className="fina" points="0,32 204,32 276,14 400,14" />
          </svg>
        </div>

        <div className="recuperar-pokedex-tela-borda">
          <div className="recuperar-pokedex-tela">
            <img className="recuperar-gengar" src="/gengar.gif" alt="Gengar" />

            <h1 className="recuperar-title">PokeBox</h1>
            <p className="recuperar-subtitle">
              {etapa === 'verificar'
                ? 'Esqueceu a senha? Confirme quem você é, treinador.'
                : `Tudo certo, ${login.trim()}! Escolha sua nova senha.`}
            </p>

            <hr className="recuperar-pokedex-pontilhado" />

            {etapa === 'verificar' ? (
              <form className="recuperar-form" onSubmit={handleVerificar} noValidate>
                <label className="recuperar-field" htmlFor="recuperar-treinador">
                  <span>Treinador</span>
                  <input
                    id="recuperar-treinador"
                    type="text"
                    name="login"
                    maxLength={LOGIN_MAXIMO}
                    placeholder="Seu usuário"
                    autoComplete="username"
                    value={login}
                    onChange={(e) => setLogin(e.target.value)}
                  />
                </label>

                <label className="recuperar-field" htmlFor="recuperar-celular">
                  <span>Celular</span>
                  <input
                    id="recuperar-celular"
                    type="tel"
                    name="celular"
                    placeholder="(00) 00000-0000"
                    autoComplete="tel-national"
                    inputMode="numeric"
                    value={celular}
                    onChange={(e) => setCelular(formatarCelular(e.target.value))}
                  />
                </label>

                {erro && (
                  <p className="recuperar-error" role="alert">
                    {erro}
                  </p>
                )}

                <button type="submit" className="recuperar-submit" disabled={verificando}>
                  {verificando ? 'Verificando...' : 'Verificar'}
                </button>
              </form>
            ) : (
              <form className="recuperar-form" onSubmit={handleRedefinir} noValidate>
                <label className="recuperar-field" htmlFor="recuperar-senha">
                  <span>Nova senha</span>
                  <div className="recuperar-password">
                    <input
                      id="recuperar-senha"
                      type={mostrarSenha ? 'text' : 'password'}
                      name="senha"
                      placeholder={`Mínimo de ${SENHA_MINIMA} caracteres`}
                      autoComplete="new-password"
                      value={senha}
                      onChange={(e) => setSenha(e.target.value)}
                    />
                    <button
                      type="button"
                      className="recuperar-toggle"
                      onClick={() => setMostrarSenha((v) => !v)}
                      aria-label={mostrarSenha ? 'Ocultar senha' : 'Mostrar senha'}
                    >
                      {mostrarSenha ? 'Ocultar' : 'Mostrar'}
                    </button>
                  </div>
                </label>

                <label className="recuperar-field" htmlFor="recuperar-confirmar-senha">
                  <span>Confirmar nova senha</span>
                  <input
                    id="recuperar-confirmar-senha"
                    type={mostrarSenha ? 'text' : 'password'}
                    name="confirmarSenha"
                    placeholder="Repita a nova senha"
                    autoComplete="new-password"
                    value={confirmarSenha}
                    onChange={(e) => setConfirmarSenha(e.target.value)}
                  />
                </label>

                {erro && (
                  <p className="recuperar-error" role="alert">
                    {erro}
                  </p>
                )}

                <button type="submit" className="recuperar-submit">
                  Redefinir senha
                </button>

                <button type="button" className="recuperar-link" onClick={handleTrocarUsuario}>
                  Não é você? Trocar usuário.
                </button>
              </form>
            )}

            <hr className="recuperar-pokedex-pontilhado" />

            <div className="recuperar-register">
              <p>Lembrou a senha?</p>
              <button
                type="button"
                className="recuperar-register-button"
                onClick={() => onVoltar()}
              >
                Voltar para o login
              </button>
            </div>

            <span className="recuperar-pokedex-seta" aria-hidden="true" />
          </div>
        </div>
      </div>
    </main>
  );
}

RecuperarSenha.propTypes = {
  onVerificar: PropTypes.func.isRequired,
  onRedefinir: PropTypes.func.isRequired,
  onVoltar: PropTypes.func.isRequired,
};

export default RecuperarSenha;
