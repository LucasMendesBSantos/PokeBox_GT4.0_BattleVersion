import { useRef } from 'react';
import './TabelaTipos.css';

// Botão que abre a tabela de vantagens e desvantagens de cada tipo
function TabelaTipos() {
  const dialogoRef = useRef(null);

  return (
    <>
      <button type="button" className="jogo-botao jogo-botao--azul" onClick={() => dialogoRef.current.showModal()}>
        Tabela de tipos
      </button>

      {/* Clicar fora da imagem (no fundo do <dialog>) também fecha */}
      <dialog
        ref={dialogoRef}
        className="tabela-tipos"
        aria-label="Tabela de vantagens e desvantagens dos tipos"
        onClick={(e) => e.target === dialogoRef.current && dialogoRef.current.close()}
      >
        <button type="button" className="tabela-tipos-fechar" onClick={() => dialogoRef.current.close()}>
          Fechar
        </button>
        <img
          src="/tabela-tipos.png"
          alt="Tabela com a vantagem e a desvantagem de cada tipo de Pokémon"
          loading="lazy"
        />
      </dialog>
    </>
  );
}

export default TabelaTipos;
