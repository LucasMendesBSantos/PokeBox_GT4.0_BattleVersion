import { useLayoutEffect, useState } from 'react';
import PropTypes from 'prop-types';
import './Tutorial.css';

const MARGEM = 12;
// Altura aproximada do card: com menos espaço que isso abaixo do alvo, o card abre acima dele
const ESPACO_CARD = 260;

// Posição do elemento-alvo na tela, atualizada ao rolar ou redimensionar
function useRetanguloAlvo(alvo) {
  const [retangulo, setRetangulo] = useState(null);

  useLayoutEffect(() => {
    // O Tutorial remonta a cada passo (key), então sem alvo o retângulo já começa null
    if (!alvo) return undefined;
    const medir = () => {
      const elemento = document.querySelector(`[data-tutorial="${alvo}"]`);
      setRetangulo(elemento ? elemento.getBoundingClientRect() : null);
    };
    // Traz o alvo para a tela se ele estiver fora dela (ex.: um card mais abaixo na coleção)
    const elemento = document.querySelector(`[data-tutorial="${alvo}"]`);
    const inicial = elemento?.getBoundingClientRect();
    if (inicial && (inicial.top < 0 || inicial.bottom > window.innerHeight)) {
      elemento.scrollIntoView({ block: 'center' });
    }
    medir();
    window.addEventListener('resize', medir);
    window.addEventListener('scroll', medir, true);
    return () => {
      window.removeEventListener('resize', medir);
      window.removeEventListener('scroll', medir, true);
    };
  }, [alvo]);

  return retangulo;
}

// Card de tutorial com seta apontando para a área explicada.
// Cada passo: { titulo, texto, botao?, alvo? } (alvo = valor do data-tutorial; sem alvo, card central)
function Tutorial({
  passos, passo, onProximo, onPular,
}) {
  const atual = passos[passo];
  const total = passos.length;
  const retangulo = useRetanguloAlvo(atual.alvo);
  const ultimo = passo === total - 1;

  // Card logo abaixo do alvo (ou acima, se não couber), sem sair da tela; a seta fica no centro do alvo
  let estiloCard;
  let estiloSeta;
  let acima = false;
  if (retangulo) {
    const largura = Math.min(360, window.innerWidth - 2 * MARGEM);
    const centro = retangulo.left + retangulo.width / 2;
    const esquerda = Math.min(
      Math.max(centro - largura / 2, MARGEM),
      window.innerWidth - largura - MARGEM,
    );
    acima = window.innerHeight - retangulo.bottom < ESPACO_CARD && retangulo.top > ESPACO_CARD;
    estiloCard = acima
      ? { bottom: window.innerHeight - retangulo.top + 22, left: esquerda, width: largura }
      : { top: retangulo.bottom + 22, left: esquerda, width: largura };
    estiloSeta = { left: Math.min(Math.max(centro - esquerda, 24), largura - 24) };
  }

  return (
    <div className="tutorial" role="dialog" aria-modal="true" aria-labelledby="tutorial-titulo">
      {retangulo ? (
        <div
          className="tutorial-destaque"
          style={{
            top: retangulo.top - 6,
            left: retangulo.left - 6,
            width: retangulo.width + 12,
            height: retangulo.height + 12,
          }}
        />
      ) : (
        <div className="tutorial-fundo" />
      )}

      <div
        className={`tutorial-card${retangulo ? '' : ' tutorial-card--central'}`}
        style={estiloCard}
      >
        {retangulo && (
          <span
            className={`tutorial-seta${acima ? ' tutorial-seta--baixo' : ''}`}
            style={estiloSeta}
            aria-hidden="true"
          />
        )}

        <p className="tutorial-contador">{`${passo + 1} de ${total}`}</p>
        <h2 id="tutorial-titulo" className="tutorial-titulo">{atual.titulo}</h2>
        <p className="tutorial-texto">{atual.texto}</p>

        <div className="tutorial-acoes">
          {!ultimo && (
            <button type="button" className="tutorial-pular" onClick={() => onPular()}>
              Pular tutorial
            </button>
          )}
          <button type="button" className="jogo-botao" onClick={() => onProximo()} autoFocus>
            {atual.botao ?? 'Próximo'}
          </button>
        </div>
      </div>
    </div>
  );
}

Tutorial.propTypes = {
  passos: PropTypes.arrayOf(PropTypes.shape({
    titulo: PropTypes.string.isRequired,
    texto: PropTypes.string.isRequired,
    botao: PropTypes.string,
    alvo: PropTypes.string,
  })).isRequired,
  passo: PropTypes.number.isRequired,
  onProximo: PropTypes.func.isRequired,
  onPular: PropTypes.func.isRequired,
};

export default Tutorial;
