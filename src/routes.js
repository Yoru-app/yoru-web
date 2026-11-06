export function readRoute() {
  let hash;
  try { hash = decodeURIComponent(location.hash.slice(1)); }
  catch { hash = ''; }

  let match;
  if ((match = hash.match(/^anime-(\d+)$/))) return { name: 'anime', id: +match[1] };
  if ((match = hash.match(/^watch-(\d+)-(\d+)$/))) return { name: 'watch', aid: +match[1], eid: +match[2] };
  if ((match = hash.match(/^cont-(\d+)-(\d+)$/))) return { name: 'cont', aid: +match[1], n: +match[2] };
  if ((match = hash.match(/^settings\/(\w+)$/))) return { name: 'settings', sec: match[1] };
  if ((match = hash.match(/^row-(\w+)$/))) return { name: 'row', row: match[1] };
  if (['catalog', 'schedule', 'library', 'notifications', 'settings'].includes(hash)) return { name: hash };
  return { name: 'home' };
}

export const routeKey = (route) => JSON.stringify(route);
// Подраздел меняет только правую панель, экземпляр страницы настроек остаётся тем же.
export const pageKey = (route) => route.name === 'settings' ? 'settings' : routeKey(route);

// Старые экраны используют это для отбрасывания запоздавших ответов.
window.yoruRoute = readRoute;
