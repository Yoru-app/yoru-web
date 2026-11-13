// Anime365: серии, переводы, видео. Тайтл ищем по MyAnimeList id (у Shikimori тот же id).
import { state, store, ApiError } from './core.js';
import { authorGroup, normAuthor } from './translation-names.js';
export { authorGroup, normAuthor } from './translation-names.js';

// Токен Anime365 хранится на сервере у каждого пользователя; здесь — только «задан ли он»
export const token = () => !!(state.me && (state.me.anime365 || state.me.sharedAnime365));

export async function api365(path, params = {}, { ttl = 120000 } = {}) {
  const u = new URL('/api' + path, location.origin);
  for (const [k, v] of Object.entries(params)) {
    if (v == null || v === '') continue;
    if (Array.isArray(v)) v.forEach((x) => u.searchParams.append(k + '[]', x));
    else u.searchParams.set(k, v);
  }
  const key = u.pathname + u.search;
  const hit = state.cache.get(key);
  if (ttl && hit && Date.now() - hit.at < ttl) return hit.data;
  let r;
  try { r = await fetch(u, { headers: { Accept: 'application/json' } }); }
  catch { throw new ApiError(0, 'Нет связи с сервером Yoru. Проверьте, что server.js запущен.'); }
  let j;
  try { j = await r.json(); } catch { throw new ApiError(r.status, `Anime365 ответил ${r.status}, но не JSON`); }
  if (j && j.error) throw new ApiError(j.error.code || r.status, j.error.message || 'Ошибка Anime365');
  if (!r.ok) throw new ApiError(r.status, `Ошибка Anime365 ${r.status}`);
  const data = j && 'data' in j ? j.data : j;
  if (ttl) state.cache.set(key, { at: Date.now(), data });
  return data;
}

export const getSeries365 = (id) => api365(`/series/${id}`, {}, { ttl: 600000 });
export const getEpisode365 = (id) => api365(`/episodes/${id}`, {}, { ttl: 300000 });
export const getEmbed = (trId) => api365(`/translations/embed/${trId}`, {}, { ttl: 0 });

// Shikimori id → серия Anime365 (или null). Ответ «не найдено» помним сутки.
export async function seriesByMal(malId) {
  malId = +malId;
  const map = store.get('malmap', {});
  const m = map[malId];
  if (m && m.id) return getSeries365(m.id);
  if (m && m.none && Date.now() - m.at < 86400e3) return null;
  const list = await api365('/series', { myAnimeListId: malId, fields: 'id,myAnimeListId,title,numberOfEpisodes' }, { ttl: 600000 });
  const hit = (list || []).find((s) => +s.myAnimeListId === malId) || (list || [])[0];
  map[malId] = hit ? { id: hit.id } : { none: true, at: Date.now() };
  store.set('malmap', map);
  return hit ? getSeries365(hit.id) : null;
}

// Трейлеры, промо и тизеры: у Anime365 это episodeType 'preview', иногда — только подпись серии
const TRAILER_TYPES = ['preview', 'trailer', 'pv', 'promo', 'teaser', 'cm'];
const TRAILER_RE = /трейлер|тизер|промо|анонс|trailer|teaser|promo|\bpv\s*\d*\b|\bcm\s*\d*\b/i;
export const isTrailer = (e) => !!e && (TRAILER_TYPES.includes(String(e.episodeType || '').toLowerCase()) || TRAILER_RE.test(String(e.episodeFull || e.episodeTitle || '')));

// Серии тайтла по порядку — без трейлеров: их нет ни в списке, ни в учёте просмотренного
export function sortEpisodes(eps) {
  return (eps || [])
    .filter((e) => e && e.isActive !== 0 && e.isActive !== '0' && !isTrailer(e))
    .map((e) => ({ ...e, n: parseFloat(e.episodeInt) }))
    .sort((a, b) => (isNaN(a.n) ? 1e9 : a.n) - (isNaN(b.n) ? 1e9 : b.n) || a.id - b.id);
}
export const epNum = (e) => { const n = parseFloat(e && e.episodeInt); return isNaN(n) ? 0 : n; };
export const epShort = (e) => {
  const n = epNum(e);
  if (n > 0 && e.episodeType !== 'movie') return String(e.episodeInt);
  return e.episodeType === 'movie' ? 'Фильм' : (e.episodeFull || e.episodeInt || '?');
};
export const epLabel = (e) => {
  if (!e) return '';
  const n = epNum(e);
  if (e.episodeType === 'movie' && n <= 1) return 'Фильм';
  if (n > 0) return `Серия ${e.episodeInt}`;
  return e.episodeFull || 'Серия';
};

// Свежие переводы Anime365 → MAL id для отображения через Shikimori
export async function freshTranslations() {
  let trs = [];
  try { trs = await api365('/translations', { feed: 'recent', limit: 80 }); } catch (e) { if (e.code === 0) throw e; }
  const bySeries = new Map();
  for (const tr of trs || []) {
    if (tr.isActive === 0 || isTrailer(tr.episode)) continue;
    const sid = tr.seriesId || (tr.series && tr.series.id);
    if (!sid || bySeries.has(sid)) continue;
    bySeries.set(sid, { sid, tr, mal: tr.series && tr.series.myAnimeListId });
  }
  const items = [...bySeries.values()].slice(0, 20);
  await Promise.allSettled(items.filter((x) => !x.mal).slice(0, 20).map(async (x) => { x.mal = (await getSeries365(x.sid)).myAnimeListId; }));
  const map = store.get('malmap', {});
  items.forEach((x) => { if (x.mal) map[x.mal] = { id: x.sid }; });
  store.set('malmap', map);
  return items.filter((x) => x.mal);
}

/* ---- история и прогресс просмотра: локально и на сервере, общие для всех устройств ---- */
const pending = new Map();
let syncT = 0;
function queueSync(eid, x) {
  const h = lib.history().find((e) => e.eid === +eid) || {};
  const a = h.anime || {};
  const c = lib.curTr && lib.curTr.eid === +eid ? lib.curTr : null;
  pending.set(+eid, { eid: +eid, t: x.t, d: x.d, aid: h.aid, n: h.n, ep: h.ep, title: a.title, name: a.name, poster: a.poster,
    ...(c ? { tr: c.id, trAuthor: c.author, trKind: c.kind, trLang: c.lang } : {}) });
  clearTimeout(syncT);
  syncT = setTimeout(flushSync, 8000);
}
export function flushSync(keepalive = false) {
  clearTimeout(syncT);
  if (!pending.size) return;
  const items = [...pending.values()]; pending.clear();
  fetch('/me/progress', {
    method: 'POST', keepalive, headers: { 'Content-Type': 'application/json', 'X-Yoru': '1' }, body: JSON.stringify({ items }),
  }).then((r) => { if (r.ok) store.set('progSyncOut', Date.now()); else items.forEach((x) => pending.has(x.eid) || pending.set(x.eid, x)); })
    .catch(() => items.forEach((x) => pending.has(x.eid) || pending.set(x.eid, x)));
}
addEventListener('pagehide', () => flushSync(true));
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushSync(true); });

let prefsT = 0;
function pushPrefs() {
  clearTimeout(prefsT);
  prefsT = setTimeout(() => {
    const raw = store.get('trRank', {});
    const trRank = Object.fromEntries(Object.entries(raw).map(([k, r]) => [k, { ...r, at: r.at || r.last || Date.now() }]));
    fetch('/me/prefs', { method: 'POST', keepalive: true, headers: { 'Content-Type': 'application/json', 'X-Yoru': '1' },
      body: JSON.stringify({ trRank, trKind: store.get('trKind', 'auto'), trKindAt: store.get('trKindAt', 0) }) }).catch(() => {});
  }, 2000);
}

// Тайтлы, убранные из «Продолжить» на другом устройстве: { [MAL id | '*']: время }
function applyForgotten(f) {
  const keys = Object.keys(f);
  if (!keys.length) return false;
  let h = lib.history();
  const p = lib.progress();
  const before = h.length;
  h = h.filter((x) => {
    const at = Math.max(f[x.aid] || 0, f['*'] || 0);
    if (at && (x.at || 0) <= at) { delete p[x.eid]; return false; }
    return true;
  });
  if (h.length === before) return false;
  store.set('history2', h); store.set('progress', p);
  return true;
}

function mergeRemote(items) {
  if (!items.length) return false;
  const p = lib.progress();
  const prefs = store.get('trpref', {});
  let h = lib.history(), changed = false, prefChanged = false;
  for (const x of items) {
    const local = p[x.eid];
    if (!local || (x.at || 0) > (local.at || 0)) { p[x.eid] = { t: x.t, d: x.d, at: x.at, ...(x.tr ? { tr: x.tr } : {}) }; changed = true; }
    // озвучка, с которой смотрели тайтл последней, — она же выберется на любом устройстве
    if (x.aid && x.trAuthor && (x.at || 0) > ((prefs[x.aid] && prefs[x.aid].at) || 0)) {
      prefs[x.aid] = { kind: x.trKind || 'voice', lang: x.trLang || '', author: x.trAuthor, at: x.at };
      prefChanged = true;
    }
    if (!x.aid) continue;
    const old = h.find((e) => e.aid === x.aid);
    if (!old || (x.at || 0) > (old.at || 0)) {
      const anime = { ...(old && old.anime), id: x.aid, title: x.title || (old && old.anime.title) || '', name: x.name || (old && old.anime.name) || '' };
      if (x.poster) anime.poster = x.poster;
      h = [{ aid: x.aid, eid: x.eid, ep: x.ep || (old && old.ep) || '', n: x.n || 0, anime, at: x.at }, ...h.filter((e) => e.aid !== x.aid)];
      changed = true;
    }
  }
  if (prefChanged) store.set('trpref', prefs);
  if (changed) {
    store.set('progress', p);
    store.set('history2', h.sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 40));
  }
  return changed;
}

// Старые записи были сохранены по полному составу. Объединяем их в одну группу и
// оставляем надгробия старых ключей, чтобы миграция синхронизировалась на другие устройства.
function groupRank(raw) {
  const now = Date.now();
  let changed = false;
  for (const [oldKey, r] of Object.entries({ ...raw })) {
    if (!r || r.deleted) continue;
    const key = normAuthor(r.author || oldKey);
    if (!key) {
      raw[oldKey] = { deleted: true, at: now };
      changed = true;
      continue;
    }
    if (key === oldKey) {
      const author = authorGroup(r.author || oldKey);
      if (author && author !== r.author) { raw[oldKey] = { ...r, author, at: now }; changed = true; }
      continue;
    }
    const old = raw[key] && !raw[key].deleted ? raw[key] : null;
    const newer = !old || (r.last || r.at || 0) >= (old.last || old.at || 0) ? r : old;
    raw[key] = {
      author: authorGroup(r.author || (old && old.author) || oldKey),
      kind: newer.kind || 'voice',
      count: +Math.min(1e5, (Number(old && old.count) || 0) + (Number(r.count) || 0)).toFixed(1),
      last: Math.max(Number(old && old.last) || 0, Number(r.last) || 0),
      pinned: !!((old && old.pinned) || r.pinned),
      at: now,
    };
    raw[oldKey] = { deleted: true, at: now };
    changed = true;
  }
  return changed;
}
export const trKind = (t) => (['voice', 'sub', 'raw'].includes(t.typeKind) ? t.typeKind : String(t.type || '').startsWith('voice') ? 'voice' : String(t.type || '').startsWith('sub') ? 'sub' : 'raw');
export const lib = {
  history: () => store.get('history2', []),
  continueHistory() {
    const progress = lib.progress();
    return lib.history().filter(({ eid }) => progress[eid]?.t >= 120);
  },
  pushHistory(anime, ep) {
    const h = lib.history().filter((x) => x.aid !== anime.id);
    h.unshift({ aid: anime.id, eid: ep.id, ep: epLabel(ep), n: epNum(ep), anime: { id: anime.id, title: anime.title, name: anime.name, poster: anime.poster, posterBig: anime.posterBig, kind: anime.kind, episodes: anime.episodes, year: anime.year }, at: Date.now() });
    store.set('history2', h.slice(0, 40));
  },
  progress: () => store.get('progress', {}),
  curTr: null,
  // Текущий перевод на странице просмотра — уходит на сервер вместе с позицией
  setCurTr(eid, tr) { lib.curTr = tr ? { eid: +eid, id: tr.id, author: tr.authorsSummary || '', kind: trKind(tr), lang: tr.typeLang || '' } : null; },
  saveProgress(eid, t, d) {
    const p = lib.progress();
    p[eid] = { t: Math.round(t), d: Math.round(d), at: Date.now(), ...(lib.curTr && lib.curTr.eid === +eid ? { tr: lib.curTr.id } : {}) };
    const keys = Object.keys(p);
    if (keys.length > 3000) keys.sort((a, b) => p[a].at - p[b].at).slice(0, 500).forEach((k) => delete p[k]);
    store.set('progress', p);
    queueSync(eid, p[eid]);
  },
  // Позиции с сервера: всё новое с прошлой синхронизации, обновляет историю и «Продолжить»
  async syncProgress() {
    const since = store.get('progSync', 0);
    try {
      const r = await fetch(`/me/progress?since=${since}`, { cache: 'no-store' });
      if (!r.ok) return false;
      const j = await r.json();
      const changed = applyForgotten(j.forgotten || {}) | mergeRemote(j.items || []);
      store.set('progSync', j.now || Date.now());
      if (changed) window.dispatchEvent(new Event('yoru:progress'));
      return changed;
    } catch { return false; }
  },
  // Убрать тайтл из «Продолжить просмотр» (например, запущен случайно) — здесь и на всех устройствах
  async forgetTitle(aid) {
    aid = +aid;
    const h = lib.history();
    const p = lib.progress();
    for (const e of h.filter((x) => x.aid === aid)) delete p[e.eid];
    for (const [eid, x] of pending) if (x.aid === aid) pending.delete(eid);
    store.set('progress', p);
    store.set('history2', h.filter((x) => x.aid !== aid));
    window.dispatchEvent(new Event('yoru:progress'));
    const r = await fetch('/me/progress/forget', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Yoru': '1' }, body: JSON.stringify({ aid }) });
    if (!r.ok) throw new Error('Сервер не принял удаление');
  },
  async forgetAll() {
    pending.clear();
    store.set('history2', []); store.set('progress', {});
    window.dispatchEvent(new Event('yoru:progress'));
    const r = await fetch('/me/progress/forget', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Yoru': '1' }, body: JSON.stringify({ all: true }) });
    if (!r.ok) throw new Error('Сервер не принял удаление');
  },
  // Все серии тайтла с сервера — чтобы выбрать озвучку, с которой смотрели на другом устройстве
  async pullTitle(aid) {
    try {
      const r = await fetch(`/me/progress?aid=${aid}&limit=60`, { cache: 'no-store' });
      if (r.ok) mergeRemote((await r.json()).items || []);
    } catch { /* офлайн */ }
  },
  // Свежая позиция одной серии — перед запуском плеера, вдруг её досматривали на другом устройстве
  async pullEpisode(eid) {
    try {
      const r = await fetch(`/me/progress?eid=${eid}`, { cache: 'no-store' });
      if (r.ok) mergeRemote((await r.json()).items || []);
    } catch { /* офлайн — останется локальная позиция */ }
  },
  pct(eid) { const x = lib.progress()[eid]; return x && x.d ? Math.min(100, Math.round(x.t / x.d * 100)) : 0; },
  seen: (eid) => lib.pct(eid) >= 85,
  trPref: (aid) => store.get('trpref', {})[aid] || null,
  /* --- приоритет переводов: какие озвучки и субтитры вы реально досматриваете --- */
  // trRank хранится с «надгробиями» удалённых авторов, чтобы удаление тоже дошло до других устройств
  trRank() {
    const raw = store.get('trRank', {});
    if (groupRank(raw)) { store.set('trRank', raw); pushPrefs(); }
    return Object.fromEntries(Object.entries(raw).filter(([, r]) => r && !r.deleted));
  },
  updateRank(fn) {
    const raw = store.get('trRank', {});
    const now = Date.now();
    groupRank(raw);
    const before = JSON.stringify(raw);
    fn(raw, now);
    if (JSON.stringify(raw) === before) return;
    store.set('trRank', raw);
    pushPrefs();
  },
  learnTr(tr, weight = 1) {
    const key = normAuthor(tr && tr.authorsSummary);
    if (!key) return;
    lib.updateRank((rank, now) => {
      const old = rank[key] && !rank[key].deleted ? rank[key] : {};
      rank[key] = { author: authorGroup(tr.authorsSummary), kind: trKind(tr), count: +((old.count || 0) + weight).toFixed(1), last: now, pinned: !!old.pinned, at: now };
    });
  },
  setTrKind(v) { store.set('trKind', v); store.set('trKindAt', Date.now()); pushPrefs(); },
  // Предпочтения переводов с сервера: по каждому автору побеждает более свежая запись
  async syncPrefs() {
    try {
      const r = await fetch('/me/prefs', { cache: 'no-store' });
      if (!r.ok) return;
      const remote = await r.json();
      const raw = store.get('trRank', {});
      let localNewer = false;
      for (const [k, rr] of Object.entries(remote.trRank || {})) {
        const lr = raw[k];
        if (!lr || (rr.at || 0) > (lr.at || lr.last || 0)) raw[k] = rr;
      }
      for (const [k, lr] of Object.entries(raw)) {
        const rr = (remote.trRank || {})[k];
        if (!rr || (lr.at || lr.last || 0) > (rr.at || 0)) localNewer = true;
      }
      if (groupRank(raw)) localNewer = true;
      store.set('trRank', raw);
      if ((remote.trKindAt || 0) > store.get('trKindAt', 0)) { store.set('trKind', remote.trKind); store.set('trKindAt', remote.trKindAt); }
      else if (store.get('trKindAt', 0) > (remote.trKindAt || 0)) localNewer = true;
      if (localNewer) pushPrefs();
    } catch { /* офлайн */ }
  },
  // Лучший перевод серии: закреплённые, затем самые досматриваемые, затем тип по вкусу и русский язык
  pickTr(trs) {
    if (!trs.length) return null;
    const rank = lib.trRank(), kindPref = store.get('trKind', 'auto');
    let best = null, bestScore = 0;
    for (const t of trs) {
      const r = rank[normAuthor(t.authorsSummary)];
      if (!r) continue;
      const score = (r.pinned ? 1000 : 0) + r.count * 10 + (kindPref === trKind(t) ? 5 : 0) + (Date.now() - r.last < 14 * 86400e3 ? 3 : 0);
      if (score > bestScore) { best = t; bestScore = score; }
    }
    if (best) return best;
    const order = kindPref === 'sub' ? ['sub', 'voice', 'raw'] : ['voice', 'sub', 'raw'];
    for (const k of order) {
      const g = trs.filter((t) => trKind(t) === k);
      if (g.length) return g.find((t) => t.typeLang === 'ru') || g[0];
    }
    return trs[0];
  },
  setTrPref(aid, tr) {
    const all = store.get('trpref', {});
    all[aid] = all._last = { kind: trKind(tr), lang: tr.typeLang, author: tr.authorsSummary, at: Date.now() };
    store.set('trpref', all);
  },
};
