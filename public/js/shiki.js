// Shikimori: данные о тайтлах (GraphQL + REST), список пользователя, уведомления, рекомендации.
import { state, store, ApiError, absUrl, stripHtml, parseDate, postJson } from './core.js';

/* ---------------------------------------------------------------- запросы */
export async function rest(path, { method = 'GET', body } = {}) {
  let r;
  try {
    r = await fetch('/shiki' + path, {
      method,
      headers: method === 'GET' ? { Accept: 'application/json' } : { 'Content-Type': 'application/json', Accept: 'application/json', 'X-Yoru': '1' },
      body: body == null ? undefined : JSON.stringify(body),
    });
  } catch { throw new ApiError(0, 'Нет связи с сервером Yoru.'); }
  const text = await r.text();
  let j = null; try { j = text ? JSON.parse(text) : null; } catch { /* не JSON */ }
  if (!r.ok) {
    const msg = (j && (j.error || j.message || (Array.isArray(j) && j.join(', ')) || (j.errors && [].concat(j.errors).join(', '))))
      || (r.status === 404 ? 'Не найдено на Shikimori.' : r.status === 429 ? 'Shikimori просит подождать.' : `Shikimori ответил ${r.status}.`);
    throw new ApiError(r.status, msg);
  }
  return j;
}

// GraphQL. Если Shikimori не знает какое-то поле, убираем его и повторяем:
// так приложение переживает изменения схемы без падения целой страницы.
function dropField(query, name) {
  let out = query, idx;
  const re = new RegExp(`\\b${name}\\b`);
  for (let guard = 0; guard < 20 && (idx = out.search(re)) !== -1; guard++) {
    let end = idx + name.length;
    let j = end; while (/\s/.test(out[j])) j++;
    if (out[j] === '(') { let d = 0; for (; j < out.length; j++) { if (out[j] === '(') d++; else if (out[j] === ')' && --d === 0) { j++; break; } } while (/\s/.test(out[j])) j++; }
    if (out[j] === '{') { let d = 0; for (; j < out.length; j++) { if (out[j] === '{') d++; else if (out[j] === '}' && --d === 0) { j++; break; } } end = j; }
    out = out.slice(0, idx) + out.slice(end);
  }
  return out;
}
export async function gql(query) {
  let q = query;
  for (let attempt = 0; attempt < 6; attempt++) {
    let r;
    try { r = await fetch('/shiki-gql', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query: q }) }); }
    catch { throw new ApiError(0, 'Нет связи с сервером Yoru.'); }
    let j; try { j = await r.json(); } catch { throw new ApiError(r.status, `Shikimori ответил ${r.status}.`); }
    if (j.errors && j.errors.length) {
      const missing = j.errors.map((e) => (String(e.message).match(/Field '(\w+)' doesn't exist/) || [])[1]).filter(Boolean);
      if (missing.length) { console.warn('[yoru] Shikimori GraphQL: нет полей', missing); missing.forEach((f) => { q = dropField(q, f); }); continue; }
      if (!j.data) throw new ApiError(r.status, 'GraphQL: ' + j.errors[0].message);
    }
    if (!r.ok && !j.data) throw new ApiError(r.status, `Shikimori ответил ${r.status}.`);
    return j.data;
  }
  throw new ApiError(500, 'GraphQL: не удалось составить запрос');
}

/* ---------------------------------------------------------------- модель */
export const KIND = { tv: 'ТВ', movie: 'Фильм', ova: 'OVA', ona: 'ONA', special: 'Спешл', tv_special: 'ТВ-спешл', music: 'Клип', pv: 'Проморолик', cm: 'Реклама' };
export const STATUS = { anons: 'Анонс', ongoing: 'Выходит', released: 'Вышел' };
export const LIST_STATUS = [
  ['watching', 'Смотрю'], ['planned', 'Запланировано'], ['completed', 'Просмотрено'],
  ['on_hold', 'Отложено'], ['dropped', 'Брошено'], ['rewatching', 'Пересматриваю'],
];
export const listLabel = (s) => (LIST_STATUS.find((x) => x[0] === s) || [])[1] || '';

const SEASONS = { winter: 'зима', spring: 'весна', summer: 'лето', fall: 'осень' };
export function seasonLabel(a) {
  const m = String(a.season || '').match(/^(winter|spring|summer|fall)_(\d{4})$/);
  if (m) return `${SEASONS[m[1]]} ${m[2]}`;
  return a.year ? String(a.year) : '';
}

const isMissing = (u) => !u || /missing_/.test(u);
const genreFields = 'id name russian kind';
const roleFields = 'id rolesRu rolesEn character{id name russian poster{mainUrl}}';
const normalizeGenres = (items, legacy = false) => (items || []).map((g) => ({
  // REST v1 and GraphQL have separate genre ID spaces.
  id: legacy ? -Number(g.id) : Number(g.id),
  name: g.russian || g.name,
  kind: g.kind || 'genre',
})).filter(({ id, name }) => id && name);
export const isMainCharacter = ({ rolesEn, rolesRu }) =>
  rolesEn?.some((role) => /^main$/i.test(role)) || rolesRu?.includes('Главная роль');

export function norm(a) {
  if (!a) return null;
  const o = state.shikiOrigin;
  let poster = '', posterBig = '';
  if (a.poster) { poster = a.poster.mainUrl || a.poster.originalUrl || ''; posterBig = a.poster.originalUrl || poster; }
  else if (a.image && !isMissing(a.image.original)) { poster = absUrl(a.image.original, o); posterBig = poster; }
  const airedOn = (a.airedOn && a.airedOn.date) || a.aired_on || '';
  const year = (a.airedOn && a.airedOn.year) || (airedOn ? +String(airedOn).slice(0, 4) : 0) || 0;
  const desc = a.descriptionHtml || a.description_html;
  return {
    id: +a.id,
    name: a.name || '',
    russian: a.russian || '',
    title: a.russian || a.name || 'Без названия',
    english: Array.isArray(a.english) ? a.english[0] : a.english || '',
    japanese: Array.isArray(a.japanese) ? a.japanese[0] : a.japanese || '',
    kind: a.kind || '',
    status: a.status || '',
    score: parseFloat(a.score) || 0,
    episodes: a.episodes || 0,
    aired: a.episodesAired ?? a.episodes_aired ?? 0,
    next: a.nextEpisodeAt || a.next_episode_at || null,
    airedOn, year,
    releasedOn: (a.releasedOn && a.releasedOn.date) || a.released_on || '',
    season: a.season || '',
    rating: a.rating || '',
    duration: a.duration || 0,
    poster, posterBig,
    genres: normalizeGenres(a.genres, 'aired_on' in a),
    studios: (a.studios || []).map((s) => s.name || s.filtered_name).filter(Boolean),
    description: desc ? stripHtml(desc) : a.description ? stripHtml(String(a.description).replace(/\[[^\]]+\]/g, '')) : '',
    url: a.url ? absUrl(a.url, o) : `${o}/animes/${a.id}`,
    franchise: a.franchise || '',
    related: a.related || null,
    characters: a.characterRoles || null,
    chronology: a.chronology || null,
    screenshots: a.screenshots || null,
    videos: a.videos || null,
    scores: a.scoresStats || null,
  };
}
export const metaLine = (a) => [KIND[a.kind] || a.kind, a.year || '', a.episodes > 1 ? `${a.episodes} эп.` : ''].filter(Boolean).join(', ');

/* ---------------------------------------------------------------- тайтлы */
const CARD = 'id name russian kind score status episodes episodesAired nextEpisodeAt airedOn{year date} season poster{mainUrl originalUrl}';
const DETAIL = `${CARD} english japanese rating duration url franchise releasedOn{date} descriptionHtml description
  genres{${genreFields}} studios{id name}
  related{id relationKind relationText anime{${CARD}}}
  chronology{${CARD}}
  characterRoles{${roleFields}}
  screenshots{id originalUrl x332Url} videos{id url name kind playerUrl} scoresStats{score count}`;

const cardCache = new Map();
const detailCache = new Map();
const remember = (list) => { for (const a of list) if (a && a.id) cardCache.set(a.id, { ...(cardCache.get(a.id) || {}), ...a }); return list; };
export const cached = (id) => cardCache.get(+id) || null;

function args(obj) {
  return Object.entries(obj).filter(([, v]) => v != null && v !== '').map(([k, v]) =>
    k === 'order' ? `order: ${v}` : typeof v === 'number' || typeof v === 'boolean' ? `${k}: ${v}` : `${k}: ${JSON.stringify(String(v))}`).join(', ');
}

// Список тайтлов: поиск, фильтры, сортировка. GraphQL, при ошибке — REST.
export async function listAnimes({ search, genre, kind, status, season, order = 'popularity', page = 1, limit = 30, ids, excludeIds, censored = true } = {}) {
  const genreIds = String(genre || '').split(',').map(Number);
  const legacy = genreIds.filter((id) => id < 0).map(Math.abs).join(',');
  const modern = genreIds.filter((id) => id > 0).join(',');
  if (!legacy) {
    const a = { search, genre: modern, kind, status, season, order: search ? null : order, page, limit, ids, excludeIds, censored };
    try {
      const d = await gql(`{ animes(${args(a)}) { ${CARD} releasedOn{date} } }`);
      return remember((d.animes || []).map(norm));
    } catch (e) {
      if (e.code === 0) throw e;
      console.warn('[yoru] GraphQL animes → REST', e.message);
    }
  }
  const q = new URLSearchParams();
  Object.entries({ search, genre: legacy, genre_v2: modern, kind, status, season, order: search ? '' : order, page, limit, ids, exclude_ids: excludeIds, censored })
    .forEach(([k, v]) => { if (v != null && v !== '') q.set(k, v); });
  const list = await rest('/animes?' + q);
  return remember(list.map(norm));
}

export async function getAnimesByIds(ids) {
  ids = [...new Set(ids.map(Number).filter(Boolean))];
  const missing = ids.filter((id) => !cardCache.has(id) || !cardCache.get(id).poster);
  for (let i = 0; i < missing.length; i += 50) {
    const part = missing.slice(i, i + 50);
    try { await listAnimes({ ids: part.join(','), limit: 50, order: null }); }
    catch (e) { console.warn('[yoru] posters', e.message); }
  }
  return ids.map((id) => cardCache.get(id)).filter(Boolean);
}

const durationCache = new Map();

export async function getAnimeDurations(ids, isActive) {
  const missing = ids.filter((id) => !durationCache.has(id));
  const pageSize = 50;
  const batchSize = pageSize * 4;
  for (let start = 0; start < missing.length && isActive(); start += batchSize) {
    const batch = missing.slice(start, start + batchSize);
    const fields = [];
    for (let offset = 0; offset < batch.length; offset += pageSize) {
      const page = batch.slice(offset, offset + pageSize);
      fields.push(`batch${offset}: animes(ids: "${page.join(',')}", limit: ${page.length}) { id duration }`);
    }
    const data = await gql(`{ ${fields.join(' ')} }`).catch(() => null);
    if (!data) break;
    for (let offset = 0; offset < batch.length; offset += pageSize) {
      const items = data[`batch${offset}`];
      if (!Array.isArray(items)) continue;
      for (const id of batch.slice(offset, offset + pageSize)) durationCache.set(id, 0);
      for (const { id, duration } of items) durationCache.set(+id, duration || 0);
    }
  }
  return new Map(ids.map((id) => [id, durationCache.get(id)]));
}

export async function getAnime(id) {
  id = +id;
  const hit = detailCache.get(id);
  if (hit && Date.now() - hit.at < 10 * 60e3) return hit.a;
  let a;
  try {
    const d = await gql(`{ animes(ids: "${id}", limit: 1) { ${DETAIL} } }`);
    a = d.animes && d.animes[0] ? norm(d.animes[0]) : null;
  } catch (e) {
    if (e.code === 0) throw e;
    console.warn('[yoru] GraphQL anime → REST', e.message);
  }
  if (!a) {
    try { a = norm(await rest(`/animes/${id}`)); }
    catch (e) { if (e.code === 404) throw new ApiError(404, 'Такого тайтла нет на Shikimori.'); throw e; }
    if (cardCache.get(id) && cardCache.get(id).poster && !a.poster) { a.poster = cardCache.get(id).poster; a.posterBig = cardCache.get(id).posterBig; }
  }
  detailCache.set(id, { a, at: Date.now() });
  remember([{ ...a, related: null, characters: null, screenshots: null, videos: null, chronology: null }]);
  return a;
}

export async function titleMetadata(anime) {
  const needsGenres = !anime.genres.length || anime.genres.some(({ id }) => id < 0);
  const needsRoles = !anime.characters?.some(isMainCharacter);
  if (!needsGenres && !needsRoles) return anime;
  const fields = [needsGenres && `genres{${genreFields}}`, needsRoles && `characterRoles{${roleFields}}`].filter(Boolean).join(' ');
  const data = await gql(`{ animes(ids: "${anime.id}", limit: 1) { ${fields} } }`).catch(() => null);
  const detail = data?.animes?.[0];
  const modernGenres = normalizeGenres(detail?.genres);
  const graphRoles = detail?.characterRoles?.length ? detail.characterRoles : anime.characters;
  const [fallbackGenres, fallbackRoles] = await Promise.all([
    needsGenres && !modernGenres.length && !anime.genres.length
      ? rest(`/animes/${anime.id}`).then((result) => normalizeGenres(result?.genres, true)).catch(() => []) : [],
    needsRoles && !graphRoles?.some(isMainCharacter)
      ? rest(`/animes/${anime.id}/roles`).then((roles) => roles.filter(({ character }) => character).map((role) => {
        const { character } = role;
        const poster = character.image?.original || character.image?.preview;
        return {
          rolesEn: role.roles || [],
          rolesRu: role.roles_russian || [],
          character: { ...character, poster: isMissing(poster) ? null : { mainUrl: absUrl(poster, state.shikiOrigin) } },
        };
      })).catch(() => null) : null,
  ]);
  return {
    ...anime,
    genres: modernGenres.length ? modernGenres : fallbackGenres.length ? fallbackGenres : anime.genres,
    characters: fallbackRoles?.length ? fallbackRoles : graphRoles,
  };
}

export async function related(a) {
  let list = a.related;
  if (!list) { try { list = await rest(`/animes/${a.id}/related`); } catch { list = []; } }
  const items = list.filter((r) => r.anime).map((r) => ({
    relation: r.relationText || r.relation_russian || r.relation || r.relationKind || '',
    anime: norm(r.anime),
  }));
  remember(items.map((x) => x.anime));
  await getAnimesByIds(items.filter((x) => !x.anime.poster).map((x) => x.anime.id));
  return items.map((x) => ({ ...x, anime: cached(x.anime.id) || x.anime }));
}

// Хронология франшизы: все части по дате выхода. GraphQL `chronology`, при отсутствии — REST /franchise.
const chronoCache = new Map();
export async function chronology(a) {
  if (chronoCache.has(a.id)) return chronoCache.get(a.id);
  let list = null;
  if (Array.isArray(a.chronology)) list = a.chronology.map(norm);
  else {
    try {
      const f = await rest(`/animes/${a.id}/franchise`);
      const nodes = (f && f.nodes) || [];
      const items = await getAnimesByIds(nodes.map((n) => n.id));
      const date = new Map(nodes.map((n) => [+n.id, n.date]));
      list = items.map((x) => ({ ...x, _d: date.get(x.id) }));
    } catch { list = []; }
  }
  if (!list.some((x) => x.id === a.id)) list.push(a);
  remember(list.filter((x) => x.id !== a.id));
  const key = (x) => x.airedOn || (x._d ? new Date(x._d * 1000).toISOString().slice(0, 10) : '') || '9999';
  list.sort((x, y) => key(x).localeCompare(key(y)) || x.id - y.id);
  list = list.map((x) => (x.id === a.id ? a : cached(x.id) || x));
  chronoCache.set(a.id, list);
  return list;
}
// Сезон — ТВ-сериал или длинная ONA (веб-сериал). Рекапы и спешлы — это special/ova/tv_special.
export const isSeason = (x) => x.kind === 'tv' || (x.kind === 'ona' && (x.episodes >= 6 || (!x.episodes && x.status !== 'released')));
export const chronoFilter = (mode) => (mode === 'all' ? () => true : mode === 'seasons_movies' ? (x) => isSeason(x) || x.kind === 'movie' : isSeason);
// Место тайтла в хронологии по выбранному режиму. Если тайтл в режим не попадает
// (например, фильм при «только сезоны») или частей меньше двух — считаем по всей хронологии.
export function chronoPosition(list, a, mode = 'seasons_movies') {
  if (!list || list.length < 2) return null;
  let used = mode, pool = list.filter(chronoFilter(mode));
  if (pool.length < 2 || !pool.some((x) => x.id === a.id)) { used = 'all'; pool = list; }
  const i = pool.findIndex((x) => x.id === a.id);
  return i < 0 ? null : { n: i + 1, total: pool.length, mode: used, tv: used === 'seasons' };
}

export async function similar(id) {
  const list = (await rest(`/animes/${id}/similar`)) || [];
  const ids = list.slice(0, 18).map((x) => x.id);
  remember(list.slice(0, 18).map(norm));
  return getAnimesByIds(ids);
}

let genresCache = null;
export async function genres() {
  if (genresCache) return genresCache;
  const data = await gql(`{ genres(entryType: Anime) { ${genreFields} } }`).catch(() => null);
  const modern = normalizeGenres(data?.genres);
  const sort = (items) => items.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  if (modern.length) return genresCache = sort(modern);
  const all = await rest('/genres');
  return sort(normalizeGenres(all.filter((g) => !g.entry_type || g.entry_type === 'Anime'), true));
}

export async function calendar() {
  const list = await rest('/calendar');
  const items = list.filter((x) => x.anime).map((x) => ({ ep: x.next_episode, at: x.next_episode_at, anime: norm(x.anime) }));
  remember(items.map((x) => x.anime));
  await getAnimesByIds(items.filter((x) => !x.anime.poster).map((x) => x.anime.id));
  return items.map((x) => ({ ...x, anime: { ...x.anime, ...(cached(x.anime.id) || {}) } }));
}

/* ---------------------------------------------------------------- вход */
export async function refreshAuth() {
  try { const r = await fetch('/auth/shikimori/status'); state.auth = await r.json(); } catch { /* офлайн */ }
  return state.auth;
}
export const loggedIn = () => !!(state.auth && state.auth.loggedIn && state.auth.user);
export const canEdit = () => loggedIn();
export const hasScope = (s) => String(state.auth.scope || '').split(/[\s+]+/).includes(s);

/* ---------------------------------------------------------------- список пользователя */
export const rates = { list: null, by: new Map(), at: 0, loading: null, owner: null };
const emitRates = () => window.dispatchEvent(new CustomEvent('yoru:rates'));
const owner = () => (loggedIn() ? 'u' + state.auth.user.id : null);

export async function loadRates(force = false) {
  const who = owner();
  if (!who) { rates.list = null; rates.by = new Map(); return null; }
  if (!force && rates.list && rates.owner === who && Date.now() - rates.at < 5 * 60e3) return rates.list;
  if (rates.loading && rates.owner === who) return rates.loading;
  rates.owner = who;
  rates.loading = (async () => {
    const uid = state.auth.user.id;
    const list = await rest(`/users/${uid}/anime_rates?limit=5000`);
    rates.list = (list || []).filter((r) => r.anime).map((r) => ({
      id: r.id, status: r.status, episodes: r.episodes || 0, score: r.score || 0, rewatches: r.rewatches || 0,
      updated: r.updated_at, anime: norm(r.anime),
    }));
    for (const r of rates.list) { const c = cached(r.anime.id); if (c && c.poster) r.anime = { ...r.anime, poster: c.poster, posterBig: c.posterBig }; }
    rates.by = new Map(rates.list.map((r) => [r.anime.id, r]));
    rates.at = Date.now();
    emitRates();
    return rates.list;
  })().finally(() => { rates.loading = null; });
  return rates.loading;
}
export const rateOf = (id) => rates.by.get(+id) || null;

// Дотягиваем постеры из GraphQL для записей списка (REST отдаёт старые картинки)
export async function hydratePosters(items) {
  const need = items.filter((r) => !r.anime.poster || !cached(r.anime.id)).map((r) => r.anime.id);
  if (need.length) await getAnimesByIds(need);
  for (const r of items) {
    const c = cached(r.anime.id);
    if (c) r.anime = { ...r.anime, poster: c.poster || r.anime.poster, posterBig: c.posterBig || r.anime.posterBig, score: c.score || r.anime.score, aired: c.aired ?? r.anime.aired, next: c.next || r.anime.next };
  }
  return items;
}

export async function saveRate(anime, patch) {
  if (!loggedIn()) throw new ApiError(401, 'Shikimori просит войти снова — откройте Настройки → Аккаунт.');
  const id = +anime.id;
  const cur = rates.by.get(id);
  if (patch.status === null) {
    if (cur && cur.id) await rest(`/v2/user_rates/${cur.id}`, { method: 'DELETE' });
    if (rates.list) rates.list = rates.list.filter((r) => r.anime.id !== id);
    rates.by.delete(id);
    emitRates();
    return null;
  }
  const r = cur && cur.id
    ? await rest(`/v2/user_rates/${cur.id}`, { method: 'PATCH', body: { user_rate: patch } })
    : await rest('/v2/user_rates', { method: 'POST', body: { user_rate: { user_id: state.auth.user.id, target_id: id, target_type: 'Anime', status: 'planned', ...patch } } });
  const entry = {
    id: r.id, status: r.status, episodes: r.episodes || 0, score: r.score || 0, rewatches: r.rewatches || 0,
    updated: r.updated_at || new Date().toISOString(), anime: (cur && cur.anime) || cached(id) || anime,
  };
  if (rates.list) { rates.list = rates.list.filter((x) => x.anime.id !== id); rates.list.unshift(entry); }
  rates.by.set(id, entry);
  emitRates();
  return entry;
}

// После просмотра серии: поднимаем счётчик, меняем статус. Возвращает функцию отмены.
export async function markWatched(anime, ep) {
  if (!canEdit() || !ep) return null;
  const cur = rates.by.get(+anime.id);
  if (cur && cur.episodes >= ep && cur.status !== 'planned') return null;
  const before = cur ? { status: cur.status, episodes: cur.episodes, rewatches: cur.rewatches } : null;
  const total = anime.episodes || (anime.status === 'released' ? anime.aired : 0);
  let status = cur ? cur.status : 'watching';
  if (['planned', 'on_hold', 'dropped'].includes(status)) status = 'watching';
  const patch = { episodes: ep, status };
  if (total && ep >= total) {
    patch.status = 'completed';
    if (cur && cur.status === 'rewatching') patch.rewatches = (cur.rewatches || 0) + 1;
  }
  const entry = await saveRate(anime, patch);
  return {
    entry,
    undo: () => (before ? saveRate(anime, before) : saveRate(anime, { status: null })),
  };
}

/* ---------------------------------------------------------------- уведомления */
export async function unreadCount() {
  if (!loggedIn() || !hasScope('messages')) return 0;
  const j = await rest(`/users/${state.auth.user.id}/unread_messages`);
  return (j && j.notifications) || 0;
}
export async function notifications(page = 1) {
  const list = await rest(`/users/${state.auth.user.id}/messages?type=notifications&page=${page}&limit=30`);
  const animeIds = list.filter((m) => m.linked && (m.linked_type === 'Anime' || m.linked.kind)).map((m) => m.linked.id);
  if (animeIds.length) { try { await getAnimesByIds(animeIds); } catch { /* без постеров */ } }
  return list;
}
export const readAllNotifications = () => rest('/messages/read_all', { method: 'POST', body: { type: 'notifications', frontend: false } });
export const markRead = (ids) => rest('/messages/mark_read', { method: 'POST', body: { ids: ids.join(','), is_read: '1' } });

/* ---------------------------------------------------------------- рекомендации */
// Похожие на то, что вы высоко оценили или смотрите сейчас, без тайтлов из вашего списка.
export async function recommendations(force = false) {
  const who = owner();
  if (!who) return [];
  const saved = store.get('recs', null);
  if (!force && saved && saved.owner === who && Date.now() - saved.at < 12 * 3600e3) {
    const items = await getAnimesByIds(saved.items.map((x) => x.id));
    return items.map((a) => ({ anime: a, because: (saved.items.find((x) => x.id === a.id) || {}).because || [] })).filter((x) => !rates.by.has(x.anime.id));
  }
  await loadRates();
  const seeds = (rates.list || []).filter((r) => ['completed', 'watching', 'rewatching'].includes(r.status))
    .sort((a, b) => (b.score - a.score) || ((parseDate(b.updated) || 0) - (parseDate(a.updated) || 0))).slice(0, 6);
  const scoreMap = new Map();
  for (const s of seeds) {
    let sim = [];
    try { sim = (await rest(`/animes/${s.anime.id}/similar`)) || []; } catch { continue; }
    sim.slice(0, 14).forEach((a, i) => {
      if (rates.by.has(a.id)) return;
      const c = scoreMap.get(a.id) || { id: a.id, w: 0, because: [] };
      c.w += 14 - i + (s.score || 6) / 2;
      if (c.because.length < 2) c.because.push(s.anime.title);
      scoreMap.set(a.id, c);
    });
  }
  const top = [...scoreMap.values()].sort((a, b) => b.w - a.w).slice(0, 24);
  store.set('recs', { owner: who, at: Date.now(), items: top });
  const items = await getAnimesByIds(top.map((x) => x.id));
  return items.map((a) => ({ anime: a, because: (top.find((x) => x.id === a.id) || {}).because || [] }));
}

/* ---------------------------------------------------------------- приложение Shikimori */
export const logout = () => { location.href = '/logout'; };
