// "Cron" simples dentro do próprio back: a cada minuto aplica as jogadas com prazo vencido
// e expira desafios não respondidos. Um atraso de até 1 minuto não importa, porque toda
// leitura/jogada também confere os prazos.
const { processarPrazosVencidos, expirarDesafios } = require('./batalhas');

const INTERVALO_MS = 60 * 1000;

async function rodarUmaVez() {
  const expirados = await expirarDesafios();
  const processadas = await processarPrazosVencidos();
  if (expirados > 0) console.log(`Agendador: ${expirados} desafio(s) expirado(s)`);
  if (processadas > 0) console.log(`Agendador: ${processadas} jogada(s) automática(s) aplicada(s)`);
}

function iniciarAgendador() {
  let rodando = false;
  const timer = setInterval(async () => {
    if (rodando) return; // não sobrepõe duas execuções se uma demorar mais que o intervalo
    rodando = true;
    try {
      await rodarUmaVez();
    } catch (erro) {
      console.error('Agendador:', erro);
    } finally {
      rodando = false;
    }
  }, INTERVALO_MS);
  timer.unref(); // não impede o processo de encerrar
  return timer;
}

module.exports = { iniciarAgendador, rodarUmaVez };
