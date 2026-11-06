// Картинки: обложки (Shikimori или AniList), горизонтальные баннеры (AniList, Kitsu, TMDB) и логотипы названий (TMDB).
import { esc, hue, imgSrc, store, state } from './core.js';

// Источник баннеров: 'all' — AniList, потом Kitsu; 'tmdb' — как на AniScroll; 'anilist'; 'kitsu'; 'none'
export const BANNER_SOURCES = [
  ['all', 'AniList, при отсутствии — Kitsu', 'Арт с названием или без, как его загрузили на AniList'],
  ['tmdb', 'TMDB, как на AniScroll', 'Чистый кадр без надписей. Если на TMDB нет — AniList, потом Kitsu'],
  ['anilist', 'Только AniList', ''],
  ['kitsu', 'Только Kitsu', ''],
  ['none', 'Не загружать', 'Вместо баннера — размытая обложка'],
];
export const COVER_SOURCES = [
  ['shikimori', 'Shikimori', 'Постеры как на Shikimori'],
  ['anilist', 'AniList, как на AniScroll', 'Обложки с AniList: часто это свежие ключевые арты сезона. Если на AniList нет — Shikimori'],
];
const tmdbReady = () => !!(state.me && state.me.tmdb);
export const bannerSource = () => {
  const s = store.get('bannerSource', tmdbReady() ? 'tmdb' : 'all');
  return s === 'tmdb' && !tmdbReady() ? 'all' : s;
};
export const coverSource = () => store.get('coverSource', 'shikimori');

// MAL id → { b, c, l }; хранится и между заходами (сервер тоже кэширует)
const cacheKey = () => `art:${bannerSource()}:${coverSource()}`;
let art = new Map();
let artKey = '';
function ensureCache() {
  if (artKey === cacheKey()) return;
  artKey = cacheKey();
  art = new Map();
  try {
    const saved = JSON.parse(sessionStorage.getItem('yoru.' + artKey) || '[]');
    for (const [id, v] of saved) art.set(id, v);
  } catch { /* ignore */ }
}
let persistT = 0;
const persist = () => {
  clearTimeout(persistT);
  persistT = setTimeout(() => { try { sessionStorage.setItem('yoru.' + artKey, JSON.stringify([...art].slice(-1500))); } catch { /* ignore */ } }, 500);
};

let queue = new Set(), timer = 0, waiters = [];
export function loadArt(ids) {
  ensureCache();
  if (bannerSource() === 'none' && coverSource() === 'shikimori') return Promise.resolve();
  ids.map(Number).filter((id) => id && !art.has(id)).forEach((id) => queue.add(id));
  if (!queue.size) return Promise.resolve();
  return new Promise((resolve) => {
    waiters.push(resolve);
    clearTimeout(timer);
    timer = setTimeout(flush, 25);
  });
}
export const loadBanners = loadArt;

async function flush() {
  const ids = [...queue]; queue = new Set();
  const done = waiters; waiters = [];
  const key = artKey;
  for (let i = 0; i < ids.length; i += 50) {
    const part = ids.slice(i, i + 50);
    try {
      const r = await fetch(`/art?ids=${part.join(',')}&banner=${bannerSource()}&cover=${coverSource()}`);
      const j = await r.json();
      if (key !== artKey) break;
      part.forEach((id) => art.set(id, j[id] || {}));
    } catch { part.forEach((id) => art.set(id, {})); }
  }
  persist();
  done.forEach((f) => f());
  // обложки, нарисованные до ответа, меняем на месте
  if (coverSource() === 'anilist') {
    for (const id of ids) {
      const c = coverOf(id);
      if (!c) continue;
      document.querySelectorAll(`img[data-cv="${id}"]`).forEach((img) => {
        const next = imgSrc(c);
        if (img.getAttribute('src') === next) return;
        const pre = new Image();
        pre.onload = () => { img.src = next; img.classList.add('cv-swap'); };
        pre.src = next;
      });
    }
  }
}
export const bannerOf = (id) => { ensureCache(); return (art.get(+id) || {}).b || null; };
export const coverOf = (id) => { ensureCache(); return coverSource() === 'anilist' ? (art.get(+id) || {}).c || null : null; };

// Логотип названия (TMDB) — для плеера и большого блока. null, если TMDB не настроен или логотипа нет.
const logos = new Map();
export const logoCached = (id) => logos.get(+id);
// Логотипы для нескольких тайтлов одним запросом
export async function logosFor(ids) {
  if (!tmdbReady()) return;
  const need = [...new Set(ids.map(Number))].filter((id) => id && !logos.has(id));
  for (let i = 0; i < need.length; i += 40) {
    const part = need.slice(i, i + 40);
    try {
      const j = await (await fetch(`/art?ids=${part.join(',')}&banner=none&logo=1`)).json();
      part.forEach((id) => logos.set(id, (j[id] && j[id].l) || null));
    } catch { /* без логотипов */ }
  }
}
export async function logoOf(id) {
  if (!tmdbReady()) return null;
  id = +id;
  if (logos.has(id)) return logos.get(id);
  try {
    const j = await (await fetch(`/art?ids=${id}&banner=none&logo=1`)).json();
    logos.set(id, (j[id] && j[id].l) || null);
  } catch { return null; }
  return logos.get(id);
}

const letterOf = (a) => esc(String(a.title || a.name || '?').replace(/^[^\p{L}\p{N}]+/u, '').charAt(0).toUpperCase() || '?');
export function posterHTML(a, big = false) {
  const own = big ? (a.posterBig || a.poster) : (a.poster || a.posterBig);
  let url = own, cv = '';
  if (coverSource() === 'anilist' && a.id) {
    const c = coverOf(a.id);
    if (c) url = c;
    else { cv = ` data-cv="${+a.id}"`; ensureCache(); if (!art.has(+a.id)) loadArt([a.id]); }
  }
  const letter = letterOf(a);
  if (!url) return `<div class="ph" style="--h:${hue(a.id)}" aria-hidden="true">${letter}</div>`;
  return `<img src="${esc(imgSrc(url))}" alt="" loading="lazy" decoding="async" data-ph="${hue(a.id)}" data-letter="${letter}"${cv}>`;
}
// Баннер для широкой карточки или фона. Нет баннера — размытая обложка.
export function bannerHTML(a, cls = 'bn') {
  const b = bannerOf(a.id);
  if (b) return `<img class="${cls}" src="${esc(imgSrc(b))}" alt="" loading="lazy" decoding="async">`;
  const p = coverOf(a.id) || a.posterBig || a.poster;
  if (p) return `<img class="${cls} blur" src="${esc(imgSrc(p))}" alt="" loading="lazy" decoding="async">`;
  return `<div class="${cls} ph" style="--h:${hue(a.id)}"></div>`;
}

// Обложка не загрузилась — плашка с буквой
document.addEventListener('error', (e) => {
  const img = e.target;
  if (img.tagName !== 'IMG') return;
  if (img.dataset.ph) {
    const ph = document.createElement('div');
    ph.className = 'ph'; ph.style.setProperty('--h', img.dataset.ph); ph.textContent = img.dataset.letter;
    img.replaceWith(ph);
  } else if (img.classList.contains('bn') || img.classList.contains('hero-bn')) {
    img.style.visibility = 'hidden';
  }
}, true);
