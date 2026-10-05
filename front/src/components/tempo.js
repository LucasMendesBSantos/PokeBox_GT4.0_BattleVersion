// "3h 12min", "45min" ou "menos de 1 min" até a data informada
export function tempoRestante(data, agora = Date.now()) {
  const minutos = Math.floor((new Date(data).getTime() - agora) / 60000);
  if (minutos < 1) return 'menos de 1 min';
  const horas = Math.floor(minutos / 60);
  return horas > 0 ? `${horas}h ${minutos % 60}min` : `${minutos}min`;
}

// "agora há pouco", "há 25 min" ou "há 3h" desde a data informada
export function tempoDesde(data, agora = Date.now()) {
  const minutos = Math.floor((agora - new Date(data).getTime()) / 60000);
  if (minutos < 5) return 'agora há pouco';
  if (minutos < 60) return `há ${minutos} min`;
  return `há ${Math.floor(minutos / 60)}h`;
}
