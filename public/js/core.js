// Общие утилиты, состояние, хранилище.

export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];
export const view = () => document.getElementById('view');

// Настройки в браузере — отдельно для каждого пользователя Yoru: «yoru.<id>.ключ»
let ns = 'yoru.';
export const store = {
  get(k, d) { try { const v = localStorage.getItem(ns + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(ns + k, JSON.stringify(v)); } catch { /* storage недоступен */ } },
  del(k) { try { localStorage.removeItem(ns + k); } catch { /* ignore */ } },
  // Первый вход в этом браузере забирает настройки прошлой версии (без разделения по людям)
  useUser(id) {
    ns = `yoru.${id}.`;
    try {
      if (localStorage.getItem('yoru.migrated')) return;
      const old = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (/^yoru\.(?!\d+\.)/.test(k) && k !== 'yoru.migrated') old.push(k);
      }
      for (const k of old) {
        const nk = ns + k.slice(5);
        if (k !== 'yoru.token' && k !== 'yoru.videoMode' && localStorage.getItem(nk) == null) localStorage.setItem(nk, localStorage.getItem(k));
      }
      localStorage.setItem('yoru.migrated', String(id));
    } catch { /* ignore */ }
  },
};

export const state = {
  site: 'https://smotret-anime.org',
  shikiOrigin: 'https://shikimori.io',
  // Пользователь Yoru: { id, nickname, avatar, admin, anime365, sharedAnime365, video: 'direct'|'fallback'|'proxy', dailyCapMB, trafficToday }
  me: null,
  auth: { configured: false, loggedIn: false, user: null },
  cache: new Map(),
  pendingTr: null,
  cleanup: null,
};

export class ApiError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}

export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const plural = (n, one, few, many) => {
  const a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
};
export const epWord = (n) => `${n} ${plural(n, 'серия', 'серии', 'серий')}`;
export const stripHtml = (html) => {
  const d = new DOMParser().parseFromString(String(html || '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n'), 'text/html');
  return (d.body.textContent || '').replace(/\[[^\]]{1,40}\]/g, '').replace(/\n{3,}/g, '\n\n').trim();
};
export const hue = (id) => (Number(id) * 47) % 360;
export const fmtTime = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return (h ? h + ':' + String(m).padStart(2, '0') : m) + ':' + String(s).padStart(2, '0');
};
export const parseDate = (str) => {
  if (!str) return null;
  const t = new Date(/T|Z|[+-]\d\d:?\d\d$/.test(str) ? str : String(str).replace(' ', 'T') + '+03:00').getTime();
  return isNaN(t) ? null : t;
};
export const relTime = (str) => {
  const t = parseDate(str);
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'только что';
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = Math.round(h / 24);
  if (d === 1) return 'вчера';
  if (d < 30) return `${d} ${plural(d, 'день', 'дня', 'дней')} назад`;
  return new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });
};
export const untilText = (str) => {
  const t = parseDate(str);
  if (!t) return '';
  const diff = t - Date.now();
  const time = new Date(t).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  if (diff < 0) return 'скоро';
  const dayDiff = Math.round((new Date(t).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400e3);
  if (dayDiff === 0) return `сегодня в ${time}`;
  if (dayDiff === 1) return `завтра в ${time}`;
  return new Date(t).toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' }) + ` в ${time}`;
};
export const fmtDate = (d) => {
  const t = parseDate(d);
  return t ? new Date(t).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
};

export const absUrl = (u, base = state.site) => { try { return new URL(u, base).href; } catch { return u; } };
export const imgSrc = (u, base) => (!u ? '' : '/img?u=' + encodeURIComponent(absUrl(u, base)));

export function toast(text, action) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<span>${esc(text)}</span>${action ? `<button type="button">${esc(action.label)}</button>` : ''}`;
  if (action) el.querySelector('button').onclick = () => { action.run(); el.remove(); };
  $('#toasts').append(el);
  setTimeout(() => el.remove(), action ? 6000 : 2800);
}

export const loadingBlock = () => '<div class="loading"><span class="spin" aria-label="Загрузка"></span></div>';
export function emptyBlock(title, text, action = '') {
  return `<div class="empty"><h3>${esc(title)}</h3>${text ? `<p>${text}</p>` : ''}${action}</div>`;
}
export function errorBlock(e) {
  if (e && e.message === 'Нужен вход в Yoru') return `<div class="section">${emptyBlock('Сессия закончилась', 'Войдите в Yoru снова.', '<a class="btn primary" href="/login">Войти</a>')}</div>`;
  const auth = e && (e.code === 401 || e.code === 403);
  return `<div class="section">${emptyBlock(auth ? 'Нужен вход' : 'Не удалось загрузить данные',
    esc((e && e.message) || 'Неизвестная ошибка'),
    auth ? '<a class="btn primary" href="#settings">Открыть настройки</a>' : '<button class="btn ghost" type="button" data-retry-route>Повторить</button>')}</div>`;
}

// Вызов POST/PATCH на свой сервер: заголовок X-Yoru защищает от чужих страниц
export async function postJson(url, body, method = 'POST') {
  const r = await fetch(url, {
    method, headers: { 'Content-Type': 'application/json', 'X-Yoru': '1', Accept: 'application/json' },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const text = await r.text();
  let j = null; try { j = text ? JSON.parse(text) : null; } catch { /* не JSON */ }
  if (!r.ok) throw new ApiError(r.status, (j && (j.error || j.message || (j.errors && j.errors.join && j.errors.join(', ')))) || `Ошибка ${r.status}`);
  return j;
}

export const ICON = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  minus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M5 12h14"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1-4.4-4.3 6.1-.9z"/></svg>',
  bell: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.9 1.9 0 0 0 3.4 0"/></svg>',
  ext: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
};

// Режимы видео, которые администратор задаёт каждому пользователю
export const VIDEO_RU = {
  direct: ['Напрямую с CDN', 'Видео идёт с CDN Anime365 прямо на ваше устройство, сервер Yoru его не трогает.'],
  fallback: ['Напрямую, запасной путь через сервер', 'Видео идёт с CDN Anime365 напрямую, а если CDN не отвечает — через сервер Yoru.'],
  proxy: ['Через сервер', 'Видео всегда идёт через сервер Yoru.'],
};
export const mb = (bytes) => (bytes >= 1073741824 ? `${(bytes / 1073741824).toFixed(1)} ГБ` : `${Math.round(bytes / 1048576)} МБ`);
