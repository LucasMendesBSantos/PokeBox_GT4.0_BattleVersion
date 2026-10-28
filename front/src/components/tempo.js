// "3h 12min", "45min", "38s" ou "0s" até a data informada
export function tempoRestante(data, agora = Date.now()) {
  const segundos = Math.max(Math.floor((new Date(data).getTime() - agora) / 1000), 0);
  if (segundos < 60) return `${segundos}s`;
  const minutos = Math.floor(segundos / 60);
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
