// "3h 12min", "45min" ou "menos de 1 min" até a data informada
export function tempoRestante(data, agora = Date.now()) {
  const minutos = Math.floor((new Date(data).getTime() - agora) / 60000);
  if (minutos < 1) return 'menos de 1 min';
  const horas = Math.floor(minutos / 60);
  return horas > 0 ? `${horas}h ${minutos % 60}min` : `${minutos}min`;
}
