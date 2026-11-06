#!/usr/bin/env node
/*
 * Yoru — сервер. Каждый пользователь входит через свой Shikimori,
 * у каждого свой токен Anime365. Владелец (админ) решает, кому можно
 * грузить видео через сервер, и видит трафик. Вход администратора —
 * отдельный логин и пароль на /admin_panel.
 *
 *   /login, /logout                        вход и выход
 *   /auth/shikimori/login, /oauth/shikimori  OAuth Shikimori
 *   /api/*        → Anime365 API (с токеном пользователя)
 *   /fwd?u=       → видео и субтитры через сервер (по правам пользователя, со счётчиком трафика)
 *   /img?u=       → картинки
 *   /shiki/*      → Shikimori REST от имени пользователя, POST /shiki-gql → GraphQL
 *   /me/*         → личные настройки (токен Anime365)
 *   /me/progress  → позиции просмотра, общие для всех устройств (cookie или Bearer-токен Shikimori)
 *   /api/sync     → те же позиции в формате Yoru TV (Bearer-токен Shikimori)
 *   /admin_panel  → панель администратора (свой логин и пароль), /admin/* — её API
 *   /art?ids=     → баннеры, обложки и логотипы: AniList, Kitsu, TMDB
 *
 * Без зависимостей, Node.js 18+.
 */
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Readable, Transform } = require('stream');

const env = process.env;
const PORT = Number(env.PORT || 5366);
const HOST = env.HOST || '127.0.0.1';
const SITE = (env.ANIME365_SITE || 'https://smotret-anime.org').replace(/\/+$/, '');
const SHARED_365 = (env.ANIME365_TOKEN || '').trim(); // необязательный общий токен
const SHIKI = (env.SHIKIMORI_ORIGIN || 'https://shikimori.io').replace(/\/+$/, '');
const ANILIST = env.ANILIST_URL || 'https://graphql.anilist.co';
const KITSU = (env.KITSU_URL || 'https://kitsu.app/api/edge').replace(/\/+$/, '');
const UA365 = env.ANIME365_UA || 'Yoru-WEB/2.8.2 (Anime365 web client)';
const ROOT = path.join(__dirname, 'public');
const BUILD_ROOT = path.join(__dirname, 'dist');
const DATA = path.resolve(env.DATA_DIR || path.join(__dirname, 'data'));
const PUBLIC_URL = (env.PUBLIC_URL || '').replace(/\/+$/, '');
// Папка данных должна существовать и быть доступной для записи — иначе сразу понятное сообщение в журнале
try {
  fs.mkdirSync(DATA, { recursive: true });
  fs.accessSync(DATA, fs.constants.W_OK);
} catch {
  console.error(`\n  [yoru] Нет прав на запись в ${DATA}.`);
  console.error('  Docker:    sudo chown -R 1000:1000 data && sudo docker compose up -d --build');
  console.error('  systemd:   sudo chown -R yoru:yoru /opt/yoru/data && sudo systemctl restart yoru\n');
}
// Администратор Yoru — отдельный логин и пароль, не связан ни с одним аккаунтом Shikimori
const ENV_ADMIN_LOGIN = (env.YORU_ADMIN_LOGIN || '').trim();
const ENV_ADMIN_PASSWORD = env.YORU_ADMIN_PASSWORD || '';
const ENV_TMDB = (env.TMDB_API_KEY || env.TMDB_TOKEN || '').trim();
const TMDB = (env.TMDB_URL || 'https://api.themoviedb.org/3').replace(/\/+$/, '');
const TMDB_IMG = (env.TMDB_IMG || 'https://image.tmdb.org/t/p').replace(/\/+$/, '');
const ARM = (env.ARM_URL || 'https://arm.haglund.dev/api/v2').replace(/\/+$/, '');
const ANIMEAPI = (env.ANIMEAPI_URL || 'https://animeapi.my.id').replace(/\/+$/, '');
const SESSION_DAYS = 90;

fs.mkdirSync(DATA, { recursive: true });

/* ------------------------------------------------------------------ данные */
function readJson(name, fallback) {
  try { return JSON.parse(fs.readFileSync(path.join(DATA, name), 'utf8')); } catch { return fallback; }
}
const fixHint = () => `Папка ${DATA} недоступна для записи процессу (uid ${process.getuid ? process.getuid() : '?'}). `
  + 'В Docker: sudo chown -R 1000:1000 data && sudo docker compose restart yoru. Без Docker: sudo chown -R yoru:yoru /opt/yoru/data';
function writeJson(name, value) {
  const file = path.join(DATA, name);
  try {
    fs.writeFileSync(file + '.tmp', JSON.stringify(value, null, 1), { mode: 0o600 });
    fs.renameSync(file + '.tmp', file);
  } catch (e) {
    if (e.code === 'EACCES' || e.code === 'EPERM' || e.code === 'EROFS') {
      console.error('[yoru] ' + fixHint());
      throw Object.assign(new Error('Сервер не может сохранить данные: нет прав на папку data. Администратору: ' + fixHint()), { code: 500 });
    }
    throw e;
  }
}
const saveLater = (() => {
  const timers = {};
  return (name, getter) => {
    clearTimeout(timers[name]);
    timers[name] = setTimeout(() => { try { writeJson(name, getter()); } catch (e) { console.error('[yoru] не сохранён', name + ':', e.message); } }, 800);
  };
})();

// Приложение Shikimori — одно на весь сервер, его регистрирует владелец
let app = (readJson('shikimori.json', {}) || {}).app || null;
if (env.SHIKIMORI_CLIENT_ID && env.SHIKIMORI_CLIENT_SECRET) {
  app = { client_id: env.SHIKIMORI_CLIENT_ID, client_secret: env.SHIKIMORI_CLIENT_SECRET, name: env.SHIKIMORI_APP_NAME || 'Yoru', fromEnv: true };
}
const saveApp = () => { if (!app || !app.fromEnv) writeJson('shikimori.json', { app }); };
const shikiUA = () => (app && app.name) || 'Yoru';

// Пользователи: { [shikiId]: { id, nickname, avatar, token, anime365, admin, blocked, video, created, lastSeen, traffic } }
const users = readJson('users.json', {});
const saveUsers = () => saveLater('users.json', () => users);
// Сессии: { [sid]: { uid, at, seen } }
const sessions = readJson('sessions.json', {});
const saveSessions = () => saveLater('sessions.json', () => sessions);
// Правила сервера
const DEFAULT_SETTINGS = {
  access: 'invite',          // 'invite' — только ники из списка; 'open' — любой аккаунт Shikimori
  allow: [],                 // ники (в нижнем регистре) или id
  defaultVideo: 'direct',    // уровень видео для новых пользователей
  dailyCapMB: 3072,          // лимит видео через сервер на человека в день, 0 — без лимита
  tmdbKey: '',               // ключ TMDB для баннеров и логотипов «как на AniScroll»
};
const settings = { ...DEFAULT_SETTINGS, ...readJson('settings.json', {}) };
const saveSettings = () => writeJson('settings.json', settings);

// Перенос со старых версий
(() => {
  // 2.4: один вход Shikimori в shikimori.json → пользователь из списка доступа
  const old = readJson('shikimori.json', {});
  if (old && old.token && old.user && !users[old.user.id]) {
    users[old.user.id] = { id: String(old.user.id), nickname: old.user.nickname, avatar: old.user.avatar || '', token: old.token, anime365: '', video: 'proxy', created: Date.now(), lastSeen: 0, traffic: {} };
    writeJson('users.json', users);
    writeJson('shikimori.json', { app: old.app || app });
    console.log(`  Перенесён вход ${old.user.nickname} из прошлой версии.`);
  }
  // 2.5: администратор был пользователем Shikimori → теперь он просто в списке доступа
  let changed = false;
  for (const u of Object.values(users)) {
    if (!('admin' in u)) continue;
    const nick = String(u.nickname).toLowerCase();
    if (u.admin && !settings.allow.includes(nick)) settings.allow.push(nick);
    delete u.admin; changed = true;
  }
  if (changed) { writeJson('users.json', users); writeJson('settings.json', settings); }
})();

// Учётная запись администратора: из переменных окружения или созданная при первом запуске (data/admin.json)
const adminStore = readJson('admin.json', {});           // { login, salt, hash, sessions: { sid: { at, seen } } }
adminStore.sessions = adminStore.sessions || {};
const saveAdmin = () => saveLater('admin.json', () => adminStore);
const adminFromEnv = () => !!(ENV_ADMIN_LOGIN && ENV_ADMIN_PASSWORD);
const adminConfigured = () => adminFromEnv() || !!(adminStore.login && adminStore.hash);
// Код первого запуска: печатается в журнал, пока администратор не создан
let setupCode = adminConfigured() ? '' : crypto.randomBytes(4).toString('hex').toUpperCase();
const tmdbKey = () => ENV_TMDB || settings.tmdbKey || '';

/* ------------------------------------------------------------- утилиты HTTP */
const allowedHosts = new Set([new URL(SITE).host, 'smotret-anime.org', 'smotret-anime.ru', 'smotret-anime.online', 'smotret-anime.app', 'anime-365.ru', 'anime365.ru']);
const isShikiHost = (h) => /(^|\.)shikimori\.(io|one|me|org)$/i.test(h) || h === new URL(SHIKI).host;
const isArtHost = (h) => /(^|\.)anilist\.co$/i.test(h) || /(^|\.)kitsu\.(app|io)$/i.test(h) || /(^|\.)tmdb\.org$/i.test(h) || h === new URL(TMDB_IMG).host;
const imgHostAllowed = (h) => allowedHosts.has(h) || isShikiHost(h) || isArtHost(h);
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json' };

function send(res, status, body, type = 'text/plain; charset=utf-8', headers = {}) {
  res.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', ...headers });
  res.end(body);
}
const sendJson = (res, status, obj) => send(res, status, JSON.stringify(obj), 'application/json; charset=utf-8');
const redirect = (res, to, headers = {}) => { res.writeHead(303, { Location: to, 'Cache-Control': 'no-store', ...headers }); res.end(); };
const rememberHost = (u) => { try { allowedHosts.add(new URL(u).host); } catch { /* ignore */ } };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function readBody(req, limit = 1 << 20) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', (c) => { size += c.length; if (size > limit) { reject(new Error('body too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}
const readJsonBody = async (req) => { try { return JSON.parse((await readBody(req)) || '{}'); } catch { return {}; } };
// Запись только со страниц самого Yoru: свой заголовок + совпадающий Origin
function sameOriginWrite(req) {
  if (req.headers['x-yoru'] !== '1') return false;
  const origin = req.headers.origin;
  if (!origin) return true;
  try { return new URL(origin).host === req.headers.host; } catch { return false; }
}
function cookies(req) {
  const out = {};
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('='); if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}
const isHttps = (req) => PUBLIC_URL.startsWith('https://') || req.headers['x-forwarded-proto'] === 'https';
const cookie = (req, name, value, maxAge) => `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
const clientIp = (req) => (req.headers['x-forwarded-for'] ? String(req.headers['x-forwarded-for']).split(',')[0].trim() : req.socket.remoteAddress);

/* ------------------------------------------------------------- сессии и права */
function currentUser(req) {
  const sid = cookies(req).yoru_v3_s;
  const s = sid && sessions[sid];
  if (!s) return null;
  const u = users[s.uid];
  if (!u || u.blocked || Date.now() - (s.seen || s.at) > SESSION_DAYS * 86400e3) { delete sessions[sid]; saveSessions(); return null; }
  if (Date.now() - (s.seen || 0) > 60e3) { s.seen = Date.now(); u.lastSeen = Date.now(); saveSessions(); saveUsers(); }
  req.sid = sid;
  return u;
}
const allowedToEnter = (u) => settings.access === 'open'
  || settings.allow.includes(String(u.nickname).toLowerCase()) || settings.allow.includes(String(u.id));
// Уровень видео: 'direct' — только напрямую; 'fallback' — через сервер, если CDN отказал; 'proxy' — всегда через сервер
const videoLevel = (u) => (u.video && u.video !== 'default' ? u.video : settings.defaultVideo);
const anime365Token = (u) => (u && u.anime365) || SHARED_365;

/* ---- учёт трафика через сервер ---- */
const today = () => new Date().toISOString().slice(0, 10);
function traffic(u) {
  const t = u.traffic || (u.traffic = {});
  const d = today(), m = d.slice(0, 7);
  if (t.day !== d) { t.day = d; t.today = 0; }
  if (t.month !== m) { t.month = m; t.monthBytes = 0; }
  t.total = t.total || 0;
  return t;
}
function countBytes(u) {
  return new Transform({
    transform(chunk, _, cb) {
      const t = traffic(u);
      t.today += chunk.length; t.monthBytes += chunk.length; t.total += chunk.length;
      cb(null, chunk);
    },
    flush(cb) { saveUsers(); cb(); },
  });
}
const overCap = (u) => settings.dailyCapMB > 0 && traffic(u).today >= settings.dailyCapMB * 1048576;

function pipeResponse(up, res, counter) {
  const h = { 'Cache-Control': up.headers.get('cache-control') || 'public, max-age=300' };
  for (const k of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'last-modified', 'etag']) {
    const v = up.headers.get(k); if (v) h[k] = v;
  }
  res.writeHead(up.status, h);
  if (!up.body) return res.end();
  let stream = Readable.fromWeb(up.body).on('error', () => res.destroy());
  if (counter) stream = stream.pipe(counter);
  stream.pipe(res);
}

/* ------------------------------------------------------------- Anime365 */
async function handleApi365(req, res, url) {
  const target = new URL(SITE + url.pathname + url.search);
  const tok = anime365Token(req.user);
  if (tok && !target.searchParams.has('access_token')) target.searchParams.set('access_token', tok);
  const up = await fetch(target, { headers: { 'User-Agent': UA365, Accept: 'application/json' } });
  const text = await up.text();
  if (url.pathname.startsWith('/api/translations/embed/')) {
    try {
      const d = JSON.parse(text).data;
      if (d) {
        for (const s of d.stream || []) for (const u of s.urls || []) rememberHost(u);
        for (const s of d.download || []) if (s.url) rememberHost(s.url);
      }
    } catch { /* не JSON */ }
  }
  send(res, up.status, text, up.headers.get('content-type') || 'application/json; charset=utf-8');
}

function rewritePlaylist(text, baseUrl) {
  const fwd = (ref) => {
    const abs = new URL(ref, baseUrl).href;
    rememberHost(abs);
    return '/fwd?u=' + encodeURIComponent(abs);
  };
  return text.split(/\r?\n/).map((line) => {
    const t = line.trim();
    if (!t) return line;
    if (t.startsWith('#')) return line.replace(/URI="([^"]+)"/g, (_, ref) => `URI="${fwd(ref)}"`);
    return fwd(t);
  }).join('\n');
}

const isSmallText = (p) => /\/translations\/ass\/|\.(ass|vtt|srt)(\?|$)/i.test(p);
async function handleFwd(req, res, url) {
  let target;
  try { target = new URL(url.searchParams.get('u'), SITE); } catch { return send(res, 400, 'bad url'); }
  if (!/^https?:$/.test(target.protocol)) return send(res, 400, 'bad protocol');
  if (!allowedHosts.has(target.host)) return send(res, 403, 'host not allowed: ' + target.host);
  const u = req.user, small = isSmallText(target.pathname);
  // видео через сервер — только если владелец разрешил этому пользователю, и в пределах дневного лимита
  if (!small) {
    if (videoLevel(u) === 'direct') return sendJson(res, 403, { error: 'Видео через сервер вам не разрешено. Оно грузится напрямую с CDN.' });
    if (overCap(u)) return sendJson(res, 429, { error: 'Лимит видео через сервер на сегодня исчерпан.' });
  }
  const tok = anime365Token(u);
  if (tok && target.host === new URL(SITE).host && !target.searchParams.has('access_token')) target.searchParams.set('access_token', tok);
  const headers = { 'User-Agent': UA365, Referer: SITE + '/' };
  if (req.headers.range) headers.Range = req.headers.range;
  const up = await fetch(target, { headers, redirect: 'follow' });
  const type = (up.headers.get('content-type') || '').toLowerCase();
  if (up.ok && (/\.m3u8(\?|$)/i.test(up.url || target.pathname) || type.includes('mpegurl'))) {
    const text = await up.text();
    return send(res, 200, rewritePlaylist(text, up.url || target.href), 'application/vnd.apple.mpegurl');
  }
  pipeResponse(up, res, countBytes(u));
}

async function handleImg(req, res, url) {
  let target;
  try { target = new URL(url.searchParams.get('u'), SITE); } catch { return send(res, 400, 'bad url'); }
  if (!imgHostAllowed(target.host)) return send(res, 403, 'host not allowed');
  const headers = { 'User-Agent': isShikiHost(target.host) ? shikiUA() : UA365 };
  if (allowedHosts.has(target.host)) headers.Referer = SITE + '/';
  const up = await fetch(target, { headers, redirect: 'follow' });
  if (!up.ok) return send(res, up.status, 'upstream ' + up.status);
  if (!(up.headers.get('content-type') || '').startsWith('image/')) return send(res, 415, 'not an image');
  pipeResponse(up, res);
}

/* ------------------------------------------------------------- Shikimori */
// Лимит Shikimori — на IP сервера, то есть общий для всех: ≤4 запроса в секунду, ≤85 в минуту
const throttle = (() => {
  let last = 0; const minute = []; let chain = Promise.resolve();
  return (fn) => {
    const run = chain.then(async () => {
      for (;;) {
        const now = Date.now();
        while (minute.length && now - minute[0] > 60000) minute.shift();
        const wait = Math.max(Math.max(0, last + 230 - now), minute.length >= 85 ? 60000 - (now - minute[0]) + 50 : 0);
        if (!wait) break;
        await new Promise((r) => setTimeout(r, wait));
      }
      last = Date.now(); minute.push(last);
    });
    chain = run.catch(() => {});
    return run.then(fn);
  };
})();

const refreshing = new Map(); // uid → promise
async function refreshToken(u) {
  const t = u.token;
  if (!t || !t.refresh_token || !app) throw Object.assign(new Error('not logged in'), { code: 401 });
  if (!refreshing.has(u.id)) {
    refreshing.set(u.id, (async () => {
      const r = await throttle(() => fetch(SHIKI + '/oauth/token', {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': shikiUA() },
        body: JSON.stringify({ grant_type: 'refresh_token', client_id: app.client_id, client_secret: app.client_secret, refresh_token: t.refresh_token }),
      }));
      const body = await r.text();
      if (!r.ok) {
        if (r.status === 401 || (r.status === 400 && body.includes('invalid_grant'))) {
          if (u.token === t) { u.token = null; saveUsers(); }
          throw Object.assign(new Error('Сессия Shikimori истекла. Войдите снова.'), { code: 401 });
        }
        throw Object.assign(new Error('Shikimori не обновил токен: ' + r.status), { code: r.status });
      }
      const fresh = JSON.parse(body);
      if (u.token === t) { u.token = fresh; saveUsers(); }
      return fresh;
    })().finally(() => refreshing.delete(u.id)));
  }
  return refreshing.get(u.id);
}
async function accessToken(u) {
  const t = u && u.token;
  if (!t) return null;
  if (Date.now() < ((t.created_at || 0) + (t.expires_in || 0)) * 1000 - 60000) return t.access_token;
  return (await refreshToken(u)).access_token;
}
async function shikiFetch(url, { method = 'GET', body, user = null, token: given } = {}) {
  const doFetch = async (token) => {
    const headers = { 'User-Agent': shikiUA(), Accept: 'application/json' };
    if (body != null) headers['Content-Type'] = 'application/json';
    if (token) headers.Authorization = 'Bearer ' + token;
    for (let attempt = 0; ; attempt++) {
      const r = await throttle(() => fetch(url, { method, headers, body }));
      if (r.status === 429 && attempt < 3) {
        await r.body?.cancel().catch(() => {});
        await new Promise((ok) => setTimeout(ok, Math.min(Number(r.headers.get('retry-after')) || 1, 10) * 1000));
        continue;
      }
      return r;
    }
  };
  let token = given || null;
  if (!token && user) { try { token = await accessToken(user); } catch { token = null; } }
  let r = await doFetch(token);
  if (r.status === 401 && token && user) {
    try { token = (await refreshToken(user)).access_token; r = await doFetch(token); } catch { /* вернём 401 */ }
  }
  return r;
}

const shikiCache = new Map();
const cacheGet = (k) => { const e = shikiCache.get(k); if (e && Date.now() < e.until) return e; shikiCache.delete(k); return null; };
const cacheSet = (k, status, type, text, ttl) => {
  if (shikiCache.size > 800) shikiCache.delete(shikiCache.keys().next().value);
  shikiCache.set(k, { status, type, text, until: Date.now() + ttl });
};
const PUBLIC_REST = /^(calendar|genres|studios|animes\/\d+\/(similar|related|franchise|roles|screenshots|videos))(\?|$)/;

async function handleShiki(req, res, url) {
  const rest = url.pathname.slice('/shiki/'.length) + url.search;
  const method = req.method;
  if (method !== 'GET' && !sameOriginWrite(req)) return sendJson(res, 403, { error: 'forbidden' });
  if (method !== 'GET' && !req.user.token) return sendJson(res, 401, { error: 'Войдите через Shikimori снова, чтобы менять список.' });
  const cacheable = method === 'GET' && PUBLIC_REST.test(rest);
  if (cacheable) { const c = cacheGet('r:' + rest); if (c) return send(res, c.status, c.text, c.type); }
  const body = method === 'GET' || method === 'HEAD' ? undefined : await readBody(req);
  const up = await shikiFetch(SHIKI + '/api/' + rest, { method, body: body || undefined, user: req.user });
  const text = await up.text();
  const type = up.headers.get('content-type') || 'application/json; charset=utf-8';
  if (cacheable && up.ok) cacheSet('r:' + rest, up.status, type, text, 15 * 60e3);
  send(res, up.status, text, type);
}
async function handleGql(req, res) {
  const body = await readBody(req);
  let q;
  try { q = JSON.parse(body); } catch { return sendJson(res, 400, { errors: [{ message: 'bad json' }] }); }
  const personal = /userRates|currentUser|userRate\b/.test(q.query || '');
  const key = 'g:' + body;
  if (!personal) { const c = cacheGet(key); if (c) return send(res, c.status, c.text, c.type); }
  const up = await shikiFetch(SHIKI + '/api/graphql', { method: 'POST', body, user: personal ? req.user : null });
  const text = await up.text();
  const type = up.headers.get('content-type') || 'application/json; charset=utf-8';
  if (!personal && up.ok && !text.includes('"errors"')) cacheSet(key, up.status, type, text, 10 * 60e3);
  send(res, up.status, text, type);
}

/* ------------------------------------------------------------- страницы входа */
const pendingStates = new Map();
const redirectUri = (req) => (PUBLIC_URL ? `${PUBLIC_URL}/oauth/shikimori` : `http://${req.headers.host || `127.0.0.1:${PORT}`}/oauth/shikimori`);
const HTML = 'text/html; charset=utf-8';
// Иконки и превью ссылки (Telegram, VK, Discord): ссылку на Yoru открывают через страницу входа
const HEAD_META = `<link rel="icon" type="image/svg+xml" href="/logo.svg"><link rel="icon" href="/favicon.ico" sizes="48x48">
<link rel="apple-touch-icon" href="/brand/apple-touch-icon.png"><link rel="manifest" href="/manifest.webmanifest"><meta name="theme-color" content="#141020">
<meta property="og:type" content="website"><meta property="og:site_name" content="Yoru"><meta property="og:title" content="Yoru — аниме онлайн">
<meta property="og:description" content="Список Shikimori и видео Anime365 в одном месте: свой плеер, озвучки и субтитры, продолжение на любом устройстве.">
${PUBLIC_URL ? `<meta property="og:url" content="${PUBLIC_URL}/"><meta property="og:image" content="${PUBLIC_URL}/brand/og-image.png">` : ''}<meta property="og:image:width" content="1200"><meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">`;
const NO_STORE = { 'Cache-Control': 'no-store' };

function page(title, body) {
  return `<!DOCTYPE html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${esc(title)}</title>${HEAD_META}
<style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#141020;color:#ece7f7;font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif;padding:24px}
main{width:min(440px,100%);display:flex;flex-direction:column;gap:16px}
.logo{display:flex;align-items:center;gap:12px;font-weight:800;font-size:24px}.logo b{color:#f2b544;font-weight:inherit;margin-left:.08em}.mark{width:36px;height:auto;filter:drop-shadow(0 0 2px rgba(255,214,140,.85)) drop-shadow(0 0 8px rgba(242,181,68,.6)) drop-shadow(0 0 20px rgba(242,181,68,.3))}
.logo small{font-size:13px;font-weight:600;color:#a59cc2;border:1px solid #322a52;border-radius:999px;padding:2px 10px;margin-left:4px}
h1{font-size:20px;margin:6px 0 0}p{margin:0;color:#a59cc2;font-size:15px}
form{display:flex;flex-direction:column;gap:12px}
.btn{display:flex;align-items:center;justify-content:center;gap:10px;height:50px;border:0;border-radius:999px;background:#f2b544;color:#2a1a00;font-weight:700;font-size:16px;text-decoration:none;cursor:pointer}
.btn:hover{background:#ffc75e}
label{display:flex;flex-direction:column;gap:6px;font-size:14px;color:#a59cc2}
input{height:46px;border-radius:12px;border:1px solid #322a52;background:#1b1630;color:#ece7f7;padding:0 14px;font-size:16px}
input:focus{outline:2px solid #f2b544;outline-offset:1px}
.err{color:#ec7f9d;font-size:14px;border:1px solid rgba(236,127,157,.4);border-radius:12px;padding:10px 14px}
.note{font-size:13px;color:#6f6690}code{background:#1b1630;border:1px solid #322a52;border-radius:6px;padding:2px 6px;font-size:13px;word-break:break-all;color:#ece7f7}
a{color:#f2b544}
</style><body><main>${body}</main></body></html>`;
}
const LOGO = '<div class="logo"><img class="mark" src="/logo.svg" alt="">Yoru</div>';
const MESSAGES = {
  denied: 'Этого аккаунта Shikimori нет в списке доступа. Попросите администратора Yoru добавить ваш ник, затем войдите снова.',
  blocked: 'Доступ для этого аккаунта закрыт администратором.',
  cancel: 'Вход отменён.',
  stale: 'Ссылка входа устарела, попробуйте ещё раз.',
  token: 'Shikimori не выдал доступ. Администратору стоит проверить Client Secret и адрес возврата приложения.',
};
function loginPage(req, url) {
  if (!app) {
    return page('Yoru — вход', `${LOGO}<h1>Сервер ещё не настроен</h1>
      <p>Администратору нужно открыть <code>/admin_panel</code> и указать приложение Shikimori. После этого здесь появится кнопка входа.</p>`);
  }
  const msg = MESSAGES[url.searchParams.get('e')] || '';
  return page('Yoru — вход', `${LOGO}<h1>Вход</h1><p>Yoru работает с вашим аккаунтом Shikimori: список, оценки и отметки серий — ваши.</p>
    ${msg ? `<p class="err">${esc(msg)}</p>` : ''}
    <a class="btn" href="/auth/shikimori/login">Войти через Shikimori</a>
    <p class="note">Видео — с вашим токеном Anime365, его можно указать после входа в настройках.</p>`);
}

async function handleOAuth(req, res, url) {
  if (url.pathname === '/auth/shikimori/login') {
    if (!app) return redirect(res, '/login');
    const state = crypto.randomBytes(16).toString('hex');
    const ru = redirectUri(req);
    pendingStates.set(state, { ru, at: Date.now() });
    for (const [k, v] of pendingStates) if (Date.now() - v.at > 15 * 60e3) pendingStates.delete(k);
    const scope = ['user_rates', ...((app.scopes || []).includes('messages') ? ['messages'] : [])].join(' ');
    const q = new URLSearchParams({ client_id: app.client_id, redirect_uri: ru, response_type: 'code', scope, state });
    res.writeHead(302, { Location: `${SHIKI}/oauth/authorize?${q}`, ...NO_STORE });
    return res.end();
  }
  // /oauth/shikimori — возврат с Shikimori
  if (url.searchParams.get('error')) return redirect(res, '/login?e=cancel');
  const st = pendingStates.get(url.searchParams.get('state') || '');
  if (!st || !app) return redirect(res, '/login?e=stale');
  pendingStates.delete(url.searchParams.get('state'));
  const r = await throttle(() => fetch(SHIKI + '/oauth/token', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'User-Agent': shikiUA() },
    body: JSON.stringify({ grant_type: 'authorization_code', client_id: app.client_id, client_secret: app.client_secret, code: url.searchParams.get('code'), redirect_uri: st.ru }),
  }));
  if (!r.ok) { console.warn('[yoru] OAuth token:', r.status, (await r.text()).slice(0, 200)); return redirect(res, '/login?e=token'); }
  const token = await r.json();
  const who = await shikiFetch(SHIKI + '/api/users/whoami', { token: token.access_token });
  if (!who.ok) return redirect(res, '/login?e=token');
  const me = await who.json();
  const id = String(me.id);
  const prev = users[id];
  if (prev && prev.blocked) return redirect(res, '/login?e=blocked');
  const u = prev || { id, created: Date.now(), anime365: '', video: 'default', traffic: {} };
  Object.assign(u, { id, nickname: me.nickname, avatar: me.avatar || (me.image && me.image.x80) || '' });
  if (!allowedToEnter(u)) {
    settings.requests = [{ id, nickname: u.nickname, avatar: u.avatar, at: Date.now() }, ...(settings.requests || []).filter((x) => x.id !== id)].slice(0, 30);
    saveSettings();
    return redirect(res, '/login?e=denied');
  }
  u.token = token;
  u.lastSeen = Date.now();
  users[id] = u;
  if (settings.requests) { settings.requests = settings.requests.filter((x) => x.id !== id); saveSettings(); }
  saveUsers();
  const sid = crypto.randomBytes(32).toString('hex');
  sessions[sid] = { uid: id, at: Date.now(), seen: Date.now(), ua: String(req.headers['user-agent'] || '').slice(0, 120) };
  saveSessions();
  res.writeHead(303, { Location: '/', 'Set-Cookie': cookie(req, 'yoru_v3_s', sid, SESSION_DAYS * 86400), ...NO_STORE });
  res.end();
}

/* ---- вход по токену Shikimori (Yoru TV и другие клиенты без cookie) ---- */
const bearerCache = new Map(); // sha256(токен) → { uid, until }
// Возвращает пользователя или null; причину отказа кладёт в req.bearerError (её показывает телевизор)
async function userFromBearer(req) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization || '');
  if (!m) return null;
  const key = crypto.createHash('sha256').update(m[1]).digest('hex');
  let hit = bearerCache.get(key);
  if (!hit || hit.until < Date.now()) {
    let r;
    try { r = await shikiFetch(SHIKI + '/api/users/whoami', { token: m[1] }); }
    catch (e) {
      // Shikimori недоступен — доверяем недавней проверке
      if (hit) r = null; else { req.bearerError = `Сервер Yoru не смог связаться с Shikimori (${e.message})`; return null; }
    }
    if (r) {
      if (!r.ok) { bearerCache.delete(key); req.bearerError = `Shikimori не подтвердил токен (HTTP ${r.status})`; return null; }
      const me = await r.json().catch(() => null);
      if (!me || !me.id) { req.bearerError = 'Shikimori вернул пустой ответ на whoami'; return null; }
      hit = { uid: String(me.id), nickname: me.nickname || '', avatar: me.avatar || '', until: Date.now() + 15 * 60e3 };
      if (bearerCache.size > 500) bearerCache.delete(bearerCache.keys().next().value);
      bearerCache.set(key, hit);
    }
  }
  let u = users[hit.uid];
  // зашёл с телевизора раньше, чем на сайт: заводим пользователя, если ник в списке доступа
  if (!u) {
    const draft = { id: hit.uid, nickname: hit.nickname, avatar: hit.avatar, created: Date.now(), anime365: '', video: 'default', traffic: {} };
    if (!allowedToEnter(draft)) { req.bearerError = `Ника ${hit.nickname} нет в списке доступа Yoru`; return null; }
    u = users[hit.uid] = draft; saveUsers();
  }
  if (u.blocked) { req.bearerError = 'Доступ для этого аккаунта закрыт администратором'; return null; }
  if (!allowedToEnter(u)) { req.bearerError = `Ника ${u.nickname} нет в списке доступа Yoru`; return null; }
  req.bearer = true;
  u.lastSeen = Date.now();
  return u;
}

/* ------------------------------------------------------------- «я» */
function meObject(u) {
  const t = traffic(u);
  return {
    id: u.id, nickname: u.nickname, avatar: u.avatar,
    anime365: !!u.anime365, sharedAnime365: !!SHARED_365,
    video: videoLevel(u), dailyCapMB: settings.dailyCapMB, trafficToday: t.today || 0,
    tmdb: !!tmdbKey(),
  };
}
const authObject = (u) => ({ configured: !!app, loggedIn: !!u.token, expired: !u.token, user: { id: +u.id, nickname: u.nickname, avatar: u.avatar }, scope: (u.token && u.token.scope) || '', origin: SHIKI });

async function check365(tok) {
  if (!tok) return { ok: false, error: 'Токен не задан.' };
  try {
    const feed = await (await fetch(`${SITE}/api/translations?feed=recent&limit=1`, { headers: { 'User-Agent': UA365 } })).json();
    const id = feed && feed.data && feed.data[0] && feed.data[0].id;
    const j = await (await fetch(`${SITE}/api/translations/embed/${id}?access_token=${encodeURIComponent(tok)}`, { headers: { 'User-Agent': UA365 } })).json();
    if (j.error) return { ok: false, error: j.error.message, code: j.error.code };
    return { ok: true };
  } catch (e) { return { ok: false, error: 'Нет связи с Anime365: ' + e.message }; }
}

/* ---- позиции просмотра: одни и те же на всех устройствах ----
 * progress.json: { [uid]: { [eid Anime365]: { t, d, at, aid, n, ep, tr, title, name, poster } } } */
const progress = readJson('progress.json', {});
const saveProgress = () => saveLater('progress.json', () => progress);
const PROGRESS_MAX = 1500;
const cleanStr = (v, n = 200) => (v == null ? '' : String(v).slice(0, n));
// Перевод, с которым смотрели серию: id перевода Anime365 (свой у каждой серии) и автор+тип — по ним
// на следующей серии выбирается та же озвучка. Пустые поля не затирают известные.
const TR_KINDS = ['voice', 'sub', 'raw'];
function trFields(x, prev = {}) {
  const tr = Number(x.tr) || 0, author = cleanStr(x.trAuthor, 200), kind = TR_KINDS.includes(x.trKind) ? x.trKind : '';
  if (!tr && !author) return prev.tr || prev.trAuthor ? { tr: prev.tr || 0, trAuthor: prev.trAuthor || '', trKind: prev.trKind || '', trLang: prev.trLang || '' } : {};
  return { tr, trAuthor: author || (tr === prev.tr ? prev.trAuthor || '' : ''), trKind: kind || (tr === prev.tr ? prev.trKind || '' : ''), trLang: cleanStr(x.trLang, 8) };
}
function putProgress(u, items) {
  const box = progress[u.id] || (progress[u.id] = {});
  const now = Date.now();
  let n = 0;
  for (const x of Array.isArray(items) ? items.slice(0, 200) : []) {
    const eid = Number(x && x.eid);
    const t = Number(x.t), d = Number(x.d);
    if (!(eid > 0) || !Number.isFinite(t) || t < 0 || !Number.isFinite(d) || d < 0 || d > 6 * 3600) continue;
    const prev = box[eid] || {};
    box[eid] = {
      ...(prev.sid ? { sid: prev.sid } : {}),
      t: Math.round(Math.min(t, d || t) * 10) / 10, d: Math.round(d * 10) / 10, at: now, cat: now,
      aid: Number(x.aid) || prev.aid || 0, n: Number(x.n) || prev.n || 0, ep: cleanStr(x.ep, 80) || prev.ep || '',
      ...trFields(x, prev),
      title: cleanStr(x.title) || prev.title || '', name: cleanStr(x.name) || prev.name || '', poster: cleanStr(x.poster, 400) || prev.poster || '',
    };
    unforget(u, box[eid].aid, now);
    n++;
  }
  const keys = Object.keys(box);
  if (keys.length > PROGRESS_MAX) {
    keys.sort((a, b) => box[a].at - box[b].at).slice(0, keys.length - PROGRESS_MAX).forEach((k) => delete box[k]);
  }
  if (n) saveProgress();
  return n;
}
function getProgress(u, url) {
  const box = progress[u.id] || {};
  const eid = url.searchParams.get('eid'), aid = Number(url.searchParams.get('aid')), since = Number(url.searchParams.get('since')) || 0;
  let list = Object.entries(box).map(([k, v]) => ({ eid: +k, ...v }));
  if (eid) list = list.filter((x) => String(x.eid) === eid);
  if (aid) list = list.filter((x) => x.aid === aid);
  if (since) list = list.filter((x) => x.at > since);
  list.sort((a, b) => b.at - a.at);
  return { items: list.slice(0, Number(url.searchParams.get('limit')) || 500), forgotten: forgottenSince(u, since), now: Date.now() };
}
/* ---- убрать тайтл из «Продолжить просмотр» (запущен случайно) — на всех устройствах ----
 * Позиции его серий удаляются, а в prefs.json остаётся отметка { [MAL id | '*']: время }, чтобы
 * другие устройства убрали его из своей локальной истории при следующей синхронизации. */
function forgetTitles(u, aids, all, { at: devAt = 0, before = Infinity } = {}) {
  const box = progress[u.id] || (progress[u.id] = {});
  const now = Date.now();
  const p = prefs[u.id] || (prefs[u.id] = { trRank: {} });
  const f = p.forgotten || (p.forgotten = {});
  const info = p.forgottenInfo || (p.forgottenInfo = {});   // для Yoru TV: метки history[].del
  if (all) aids = [...new Set(Object.values(box).map((x) => x.aid).filter(Boolean))];
  let n = 0;
  for (const aid of aids) {
    let last = null;
    for (const [eid, x] of Object.entries(box)) {
      if (x.aid !== aid) continue;
      if (!last || (x.at || 0) > (last.x.at || 0)) last = { eid: +eid, x };
      // запись новее метки (смотрели уже после удаления) — оставляем
      if ((x.cat || x.at || 0) <= before) { delete box[eid]; n++; }
    }
    f[aid] = now;
    info[aid] = { eid: last ? last.eid : (info[aid] && info[aid].eid) || 0, sid: (last && last.x.sid) || (info[aid] && info[aid].sid) || 0, at: devAt || now, st: now };
  }
  if (all) {
    for (const [eid, x] of Object.entries(box)) if (!x.aid && (x.cat || x.at || 0) <= before) { delete box[eid]; n++; }
    f['*'] = now;
  }
  // старые отметки не нужны: все устройства давно синхронизировались
  for (const [k, at] of Object.entries(f)) if (now - at > 90 * 86400e3) { delete f[k]; delete info[k]; }
  saveProgress(); savePrefs();
  return n;
}
// Новый обычный просмотр тайтла снимает метку удаления (запись новее метки)
function unforget(u, aid, at) {
  const p = prefs[u.id];
  if (!aid || !p || !p.forgotten || !p.forgotten[aid]) return;
  const info = (p.forgottenInfo || {})[aid];
  if (at <= Math.max(p.forgotten[aid], (info && info.at) || 0)) return;
  delete p.forgotten[aid];
  if (p.forgottenInfo) delete p.forgottenInfo[aid];
  savePrefs();
}
function forgottenSince(u, since) {
  const f = (prefs[u.id] && prefs[u.id].forgotten) || {};
  return Object.fromEntries(Object.entries(f).filter(([, at]) => !since || at > since));
}

/* ---- /api/sync — формат Yoru TV поверх того же хранилища, что и /me/progress ----
 * GET  /api/sync?since=<ms> → { now, progress: { [eid]: { t, d, at, sid, mal, tr, st } }, history: [{ eid, sid, mal, n, ep, title, poster, tr, trKind, trLang, trAuthor, del?, at, st }] }
 * POST /api/sync { progress: { [eid]: { t, d, at, sid?, mal? } }, history: [{ eid, sid?, mal?, n?, ep?, title?, poster?, at }] } → { ok, now }
 * at — время устройства (по нему решаются конфликты), st — время сервера (по нему работает since). */
function syncView(u, since) {
  const box = progress[u.id] || {};
  const out = { progress: {}, history: [] };
  const latest = new Map(); // тайтл → самая свежая серия
  for (const [eid, x] of Object.entries(box)) {
    const st = x.at || 0;
    const at = x.cat || x.at || 0;
    const trOut = x.tr || x.trAuthor ? { ...(x.tr ? { tr: x.tr } : {}), ...(x.trAuthor ? { trAuthor: x.trAuthor } : {}), ...(x.trKind ? { trKind: x.trKind } : {}) } : {};
    if (x.d > 0 && (!since || st > since)) out.progress[eid] = { t: Math.round(x.t), d: Math.round(x.d), at, st, ...(x.sid ? { sid: x.sid } : {}), ...(x.aid ? { mal: x.aid } : {}), ...trOut, ...(x.trLang ? { trLang: x.trLang } : {}) };
    const title = x.aid || (x.sid ? 's' + x.sid : 'e' + eid);
    const prev = latest.get(title);
    if (!prev || st > prev.st) latest.set(title, { eid: +eid, st, at, x });
  }
  for (const { eid, st, at, x } of latest.values()) {
    if (since && st <= since) continue;
    const h = { eid, at, st };
    if (x.sid) h.sid = x.sid;
    if (x.aid) h.mal = x.aid;
    if (x.n) h.n = x.n;
    if (x.ep) h.ep = x.ep;
    if (x.title || x.name) h.title = x.title || x.name;
    if (x.poster) h.poster = x.poster;
    if (x.tr) h.tr = x.tr;
    if (x.trAuthor) h.trAuthor = x.trAuthor;
    if (x.trKind) h.trKind = x.trKind;
    if (x.trLang) h.trLang = x.trLang;
    out.history.push(h);
  }
  // метки удаления из «Продолжить просмотр»
  const info = (prefs[u.id] && prefs[u.id].forgottenInfo) || {};
  for (const [aid, inf] of Object.entries(info)) {
    if (!inf.eid || (since && inf.st <= since)) continue;
    out.history.push({ eid: inf.eid, ...(inf.sid ? { sid: inf.sid } : {}), mal: +aid, del: true, at: inf.at, st: inf.st });
  }
  out.history.sort((a, b) => b.at - a.at);
  out.history = out.history.slice(0, 60);
  return out;
}
function syncMerge(u, body) {
  const box = progress[u.id] || (progress[u.id] = {});
  const now = Date.now();
  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
  // тайтл убрали из «Продолжить» — старые записи с телевизора его не возвращают, новый просмотр — возвращает
  const isForgotten = (mal, at) => {
    const forgot = (prefs[u.id] && prefs[u.id].forgotten) || {};
    return at <= Math.max(forgot['*'] || 0, (mal && forgot[mal]) || 0);
  };
  let n = 0;
  const inP = body && body.progress && typeof body.progress === 'object' ? body.progress : {};
  for (const [k, p] of Object.entries(inP).slice(0, 2000)) {
    const eid = num(k), t = num(p && p.t), d = num(p && p.d), at = num(p && p.at);
    if (!(eid > 0) || d <= 0 || d > 6 * 3600 || t < 0 || at <= 0) continue;
    if (isForgotten(num(p.mal) || (box[eid] && box[eid].aid), at)) continue;
    const old = box[eid];
    if (old && at <= (old.cat || old.at || 0)) continue;   // на сервере запись новее
    box[eid] = { ...(old || {}), t: Math.round(Math.min(t, d) * 10) / 10, d: Math.round(d * 10) / 10, at: now, cat: Math.min(at, now + 60e3),
      ...(num(p.sid) ? { sid: num(p.sid) } : {}), ...(num(p.mal) ? { aid: num(p.mal) } : {}), ...trFields(p, old || {}) };
    unforget(u, box[eid].aid, at);
    n++;
  }
  const inH = body && Array.isArray(body.history) ? body.history.slice(0, 200) : [];
  for (const h of inH) {
    const eid = num(h && h.eid);
    if (!(eid > 0) || !num(h.at)) continue;
    // history[].del: true — тайтл убрали из «Продолжить просмотр» на телевизоре
    if (h.del === true) {
      let aid = num(h.mal) || (box[eid] && box[eid].aid) || 0;
      if (!aid && num(h.sid)) { const e = Object.values(box).find((x) => x.sid === num(h.sid) && x.aid); aid = e ? e.aid : 0; }
      const inf = aid && prefs[u.id] && prefs[u.id].forgottenInfo && prefs[u.id].forgottenInfo[aid];
      if (aid && num(h.at) > ((inf && inf.at) || 0)) { forgetTitles(u, [aid], false, { at: Math.min(num(h.at), now + 60e3), before: num(h.at) }); n++; }
      continue;
    }
    if (isForgotten(num(h.mal) || (box[eid] && box[eid].aid), num(h.at))) continue;
    const old = box[eid] || { t: 0, d: 0, at: now, cat: num(h.at) };
    box[eid] = { ...old,
      ...(num(h.sid) ? { sid: num(h.sid) } : {}), ...(num(h.mal) ? { aid: num(h.mal) } : {}), ...(h.n != null && num(h.n) ? { n: num(h.n) } : {}),
      ...(h.ep ? { ep: cleanStr(h.ep, 80) } : {}), ...(h.title ? { title: cleanStr(h.title) } : {}), ...(h.poster ? { poster: cleanStr(h.poster, 400) } : {}),
      ...(h.tr || h.trAuthor ? trFields(h, old) : {}) };
    unforget(u, box[eid].aid, num(h.at));
    // история новее позиции — значит, тайтл открывали только что: поднимаем в «Продолжить»
    if (num(h.at) > (old.cat || 0)) { box[eid].at = now; box[eid].cat = Math.min(num(h.at), now + 60e3); }
    n++;
  }
  const keys = Object.keys(box);
  if (keys.length > PROGRESS_MAX) keys.sort((a, b) => box[a].at - box[b].at).slice(0, keys.length - PROGRESS_MAX).forEach((k) => delete box[k]);
  if (n) saveProgress();
  return now;
}
async function handleSync(req, res, url) {
  const u = req.user;
  if (req.method === 'GET') return sendJson(res, 200, { now: Date.now(), ...syncView(u, Number(url.searchParams.get('since')) || 0), prefs: prefsOf(u), forgotten: forgottenSince(u, Number(url.searchParams.get('since')) || 0) });
  if (req.method !== 'POST' && req.method !== 'PUT') return sendJson(res, 405, { error: 'Method not allowed' });
  if (!req.bearer && !sameOriginWrite(req)) return sendJson(res, 403, { error: 'forbidden' });
  let body;
  try { body = JSON.parse((await readBody(req, 512 * 1024)) || '{}'); } catch { return sendJson(res, 400, { error: 'Bad JSON' }); }
  if (body && body.prefs) putPrefs(u, body.prefs);
  sendJson(res, 200, { ok: true, now: syncMerge(u, body) });
}

/* ---- предпочтения переводов, общие для всех устройств ----
 * prefs.json: { [uid]: { trKind: 'auto'|'voice'|'sub', trKindAt, trRank: { [автор]: { author, kind, count, last, pinned, at } }, at } }
 * Слияние по каждому автору отдельно: побеждает запись с бо́льшим at (время устройства). */
const prefs = readJson('prefs.json', {});
const savePrefs = () => saveLater('prefs.json', () => prefs);
function prefsOf(u) { const p = prefs[u.id] || {}; return { trKind: p.trKind || 'auto', trKindAt: p.trKindAt || 0, trRank: p.trRank || {}, at: p.at || 0 }; }
function putPrefs(u, b) {
  const p = prefs[u.id] || (prefs[u.id] = { trRank: {} });
  const now = Date.now();
  let changed = false;
  if (b.trKind && ['auto', 'voice', 'sub'].includes(b.trKind) && Number(b.trKindAt || now) > (p.trKindAt || 0)) {
    p.trKind = b.trKind; p.trKindAt = Math.min(Number(b.trKindAt) || now, now + 60e3); changed = true;
  }
  const rank = b.trRank && typeof b.trRank === 'object' ? b.trRank : {};
  for (const [k0, r] of Object.entries(rank).slice(0, 300)) {
    const k = cleanStr(k0, 120);
    if (!k || !r) continue;
    const at = Math.min(Number(r.at) || Number(r.last) || 0, now + 60e3);
    const old = p.trRank[k];
    if (old && at <= (old.at || 0)) continue;
    if (r.deleted) p.trRank[k] = { deleted: true, at };
    else p.trRank[k] = { author: cleanStr(r.author, 200), kind: TR_KINDS.includes(r.kind) ? r.kind : 'voice', count: Math.max(0, Math.min(1e5, Number(r.count) || 0)), last: Number(r.last) || 0, pinned: !!r.pinned, at };
    changed = true;
  }
  if (changed) { p.at = now; savePrefs(); }
  return prefsOf(u);
}

async function handleMe(req, res, url) {
  const u = req.user;
  const p = url.pathname;
  if (p === '/me/progress/forget') {
    if (req.method !== 'POST') return send(res, 405, 'method not allowed');
    if (!req.bearer && !sameOriginWrite(req)) return sendJson(res, 403, { error: 'forbidden' });
    const b = await readJsonBody(req);
    const aids = (Array.isArray(b.aids) ? b.aids : [b.aid]).map(Number).filter((x) => x > 0).slice(0, 200);
    if (!b.all && !aids.length) return sendJson(res, 400, { error: 'Нужен aid' });
    return sendJson(res, 200, { removed: forgetTitles(u, aids, !!b.all), now: Date.now() });
  }
  if (p === '/me/progress') {
    if (req.method === 'GET') return sendJson(res, 200, getProgress(u, url));
    if (req.method !== 'POST') return send(res, 405, 'method not allowed');
    if (!req.bearer && !sameOriginWrite(req)) return sendJson(res, 403, { error: 'forbidden' });
    const b = await readJsonBody(req);
    return sendJson(res, 200, { saved: putProgress(u, b.items || [b]), now: Date.now() });
  }
  if (p === '/me/prefs') {
    if (req.method === 'GET') return sendJson(res, 200, prefsOf(u));
    if (!req.bearer && !sameOriginWrite(req)) return sendJson(res, 403, { error: 'forbidden' });
    return sendJson(res, 200, putPrefs(u, await readJsonBody(req)));
  }
  if (req.method === 'GET') return sendJson(res, 200, meObject(u));
  if (req.bearer || !sameOriginWrite(req)) return sendJson(res, 403, { error: 'forbidden' });
  const b = await readJsonBody(req);
  if (p === '/me/anime365') {
    u.anime365 = String(b.token || '').trim();
    saveUsers();
    return sendJson(res, 200, meObject(u));
  }
  if (p === '/me/check365') return sendJson(res, 200, await check365(String(b.token || '').trim() || anime365Token(u)));
  sendJson(res, 404, { error: 'not found' });
}

/* ------------------------------------------------------------- панель администратора: /admin_panel */
const scrypt = (pw, salt) => crypto.scryptSync(String(pw), salt, 32).toString('hex');
const sameText = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest(), y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
function checkAdmin(login, pw) {
  if (adminFromEnv()) return sameText(login, ENV_ADMIN_LOGIN) & sameText(pw, ENV_ADMIN_PASSWORD) ? true : false;
  if (!adminStore.hash) return false;
  return !!(sameText(String(login).toLowerCase(), adminStore.login) & sameText(scrypt(pw, adminStore.salt), adminStore.hash));
}
const ADMIN_DAYS = 14;
function currentAdmin(req) {
  const sid = cookies(req).yoru_v3_adm;
  const s = sid && adminStore.sessions[sid];
  if (!s || !adminConfigured()) return false;
  if (Date.now() - (s.seen || s.at) > ADMIN_DAYS * 86400e3 || (s.epoch || 0) !== (adminStore.epoch || 0)) { delete adminStore.sessions[sid]; saveAdmin(); return false; }
  if (Date.now() - (s.seen || 0) > 60e3) { s.seen = Date.now(); saveAdmin(); }
  req.adminSid = sid;
  return true;
}
const failedAdmin = new Map(); // ip → { n, at }
function tooMany(req) {
  const f = failedAdmin.get(clientIp(req));
  return f && Date.now() - f.at < 15 * 60e3 && f.n >= 10;
}
function failed(req) {
  const ip = clientIp(req);
  const f = failedAdmin.get(ip) || { n: 0, at: 0 };
  if (Date.now() - f.at > 15 * 60e3) f.n = 0;
  failedAdmin.set(ip, { n: f.n + 1, at: Date.now() });
}
function adminPage(title, form, err = '') {
  return page(`Yoru — ${title}`, `<div class="logo"><img class="mark" src="/logo.svg" alt="">Yoru<small>администрирование</small></div><h1>${esc(title)}</h1>${err ? `<p class="err">${esc(err)}</p>` : ''}${form}`);
}
const setupForm = (err) => adminPage('Первый запуск', `<p>Создайте логин и пароль администратора. Код первого запуска напечатан в журнале сервера
  (<code>docker compose logs yoru</code> или <code>journalctl -u yoru</code>).</p>
  <form method="post" action="/admin_panel/setup">
  <label>Код первого запуска<input name="code" required autocomplete="off" autocapitalize="characters"></label>
  <label>Логин<input name="login" required autocomplete="username" minlength="3" maxlength="40"></label>
  <label>Пароль<input name="password" type="password" required autocomplete="new-password" minlength="10"></label>
  <label>Пароль ещё раз<input name="password2" type="password" required autocomplete="new-password" minlength="10"></label>
  <button class="btn">Создать администратора</button></form>
  <p class="note">Этот вход нужен только для администрирования и не связан с аккаунтами Shikimori.</p>`, err);
const loginForm = (err) => adminPage('Вход администратора', `<form method="post" action="/admin_panel/login">
  <label>Логин<input name="login" required autocomplete="username"></label>
  <label>Пароль<input name="password" type="password" required autocomplete="current-password"></label>
  <button class="btn">Войти</button></form>`, err);

function startAdminSession(req, res) {
  const sid = crypto.randomBytes(32).toString('hex');
  adminStore.sessions[sid] = { at: Date.now(), seen: Date.now(), epoch: adminStore.epoch || 0, ip: clientIp(req) };
  saveAdmin();
  res.writeHead(303, { Location: '/admin_panel', 'Set-Cookie': `yoru_v3_adm=${sid}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${ADMIN_DAYS * 86400}${isHttps(req) ? '; Secure' : ''}`, ...NO_STORE });
  res.end();
}
async function handleAdminPanel(req, res, url) {
  const p = url.pathname.replace(/\/+$/, '') || '/admin_panel';
  if (p === '/admin_panel/logout') {
    const sid = cookies(req).yoru_v3_adm;
    if (sid && adminStore.sessions[sid]) { delete adminStore.sessions[sid]; saveAdmin(); }
    return redirect(res, '/admin_panel', { 'Set-Cookie': 'yoru_v3_adm=; Path=/; Max-Age=0' });
  }
  if (req.method === 'POST') {
    if (tooMany(req)) return send(res, 429, adminPage('Слишком много попыток', '<p>Подождите 15 минут.</p>'), HTML, NO_STORE);
    const b = new URLSearchParams(await readBody(req, 8192));
    if (p === '/admin_panel/setup') {
      if (adminConfigured()) return redirect(res, '/admin_panel');
      const code = String(b.get('code') || '').trim().toUpperCase();
      if (!setupCode || !sameText(code, setupCode)) { failed(req); await new Promise((r) => setTimeout(r, 800)); return send(res, 400, setupForm('Неверный код. Он напечатан в журнале сервера при запуске.'), HTML, NO_STORE); }
      const login = String(b.get('login') || '').trim().toLowerCase(), pw = String(b.get('password') || '');
      if (login.length < 3) return send(res, 400, setupForm('Логин — от 3 символов.'), HTML, NO_STORE);
      if (pw.length < 10) return send(res, 400, setupForm('Пароль — от 10 символов.'), HTML, NO_STORE);
      if (pw !== String(b.get('password2') || '')) return send(res, 400, setupForm('Пароли не совпадают.'), HTML, NO_STORE);
      adminStore.login = login; adminStore.salt = crypto.randomBytes(16).toString('hex'); adminStore.hash = scrypt(pw, adminStore.salt);
      adminStore.epoch = (adminStore.epoch || 0) + 1; adminStore.sessions = {};
      writeJson('admin.json', adminStore);
      setupCode = '';
      console.log(`  Администратор создан: ${login}`);
      return startAdminSession(req, res);
    }
    if (p === '/admin_panel/login') {
      if (!checkAdmin(b.get('login') || '', b.get('password') || '')) { failed(req); await new Promise((r) => setTimeout(r, 800)); return send(res, 401, loginForm('Неверный логин или пароль.'), HTML, NO_STORE); }
      failedAdmin.delete(clientIp(req));
      return startAdminSession(req, res);
    }
    return send(res, 404, 'not found');
  }
  if (!adminConfigured()) return send(res, 200, setupForm(), HTML, NO_STORE);
  if (!currentAdmin(req)) return send(res, 200, loginForm(), HTML, NO_STORE);
  return handleStatic(req, res, new URL('/admin.html', 'http://local'));
}

function adminState(req) {
  const list = Object.values(users).map((u) => {
    const t = traffic(u);
    return {
      id: u.id, nickname: u.nickname, avatar: u.avatar,
      blocked: !!u.blocked, video: u.video || 'default', effective: videoLevel(u), anime365: !!u.anime365, shiki: !!u.token,
      lastSeen: u.lastSeen || 0, today: t.today || 0, month: t.monthBytes || 0, total: t.total || 0,
      sessions: Object.values(sessions).filter((s) => s.uid === u.id).length,
      allowed: allowedToEnter(u),
    };
  }).sort((a, b) => b.lastSeen - a.lastSeen);
  return {
    settings: { access: settings.access, allow: settings.allow, defaultVideo: settings.defaultVideo, dailyCapMB: settings.dailyCapMB },
    requests: settings.requests || [],
    users: list,
    totals: { today: list.reduce((s, x) => s + x.today, 0), month: list.reduce((s, x) => s + x.month, 0) },
    app: app ? { client_id: app.client_id, name: app.name, fromEnv: !!app.fromEnv, scopes: app.scopes || ['user_rates'] } : null,
    redirectUri: redirectUri(req),
    shikiOrigin: SHIKI,
    tmdb: { configured: !!tmdbKey(), fromEnv: !!ENV_TMDB, hint: tmdbKey() ? tmdbKey().slice(0, 4) + '…' + tmdbKey().slice(-4) : '' },
    admin: { login: adminFromEnv() ? ENV_ADMIN_LOGIN : adminStore.login, fromEnv: adminFromEnv(), sessions: Object.keys(adminStore.sessions).length },
  };
}
async function handleAdmin(req, res, url) {
  if (!currentAdmin(req)) return sendJson(res, 401, { error: 'Нужен вход администратора' });
  if (req.method === 'GET') return sendJson(res, 200, adminState(req));
  if (!sameOriginWrite(req)) return sendJson(res, 403, { error: 'forbidden' });
  const b = await readJsonBody(req);
  const p = url.pathname;
  const LEVELS = ['direct', 'fallback', 'proxy'];
  if (p === '/admin/settings') {
    if (b.access) settings.access = b.access === 'open' ? 'open' : 'invite';
    if (LEVELS.includes(b.defaultVideo)) settings.defaultVideo = b.defaultVideo;
    if ('dailyCapMB' in b) settings.dailyCapMB = Math.max(0, Math.round(+b.dailyCapMB || 0));
    if ('tmdbKey' in b && !ENV_TMDB) {
      const k = String(b.tmdbKey || '').trim();
      if (k) {
        const ok = await tmdbCheck(k);
        if (!ok.ok) return sendJson(res, 400, { error: ok.error });
      }
      settings.tmdbKey = k;
      for (const key of Object.keys(artCache)) if (key[0] === 't' || key[0] === 'm') delete artCache[key];
      saveArt();
    }
    saveSettings();
  } else if (p === '/admin/allow') {
    const nick = String(b.nickname || '').trim().toLowerCase();
    if (!nick) return sendJson(res, 400, { error: 'Укажите ник' });
    if (b.remove) settings.allow = settings.allow.filter((x) => x !== nick);
    else if (!settings.allow.includes(nick)) settings.allow.push(nick);
    if (!b.remove && settings.requests) settings.requests = settings.requests.filter((x) => String(x.nickname).toLowerCase() !== nick && x.id !== nick);
    saveSettings();
  } else if (p === '/admin/user') {
    const u = users[String(b.id)];
    if (!u) return sendJson(res, 404, { error: 'Нет такого пользователя' });
    if (b.video && (LEVELS.includes(b.video) || b.video === 'default')) u.video = b.video;
    if ('blocked' in b) u.blocked = !!b.blocked;
    if (b.kick || b.blocked) for (const [sid, s] of Object.entries(sessions)) if (s.uid === u.id) delete sessions[sid];
    if (b.resetTraffic) u.traffic = {};
    if (b.forget) {
      delete users[u.id];
      delete progress[u.id]; saveProgress();
      delete prefs[u.id]; savePrefs();
      for (const [sid, s] of Object.entries(sessions)) if (s.uid === u.id) delete sessions[sid];
      settings.allow = settings.allow.filter((x) => x !== String(u.nickname).toLowerCase() && x !== u.id);
      saveSettings();
    }
    saveUsers(); saveSessions();
  } else if (p === '/admin/app') {
    if (app && app.fromEnv) return sendJson(res, 400, { error: 'Приложение задано переменными окружения' });
    const id = String(b.client_id || '').trim();
    const secret = String(b.client_secret || '').trim() || (app && app.client_id === id ? app.client_secret : '');
    if (!id || !secret) return sendJson(res, 400, { error: 'Нужны Client ID и Client Secret' });
    app = { client_id: id, client_secret: secret, name: String(b.app_name || 'Yoru').trim() || 'Yoru', scopes: b.messages ? ['user_rates', 'messages'] : ['user_rates'] };
    saveApp();
  } else if (p === '/admin/password') {
    if (adminFromEnv()) return sendJson(res, 400, { error: 'Логин и пароль заданы переменными окружения — меняйте их там.' });
    if (!checkAdmin(adminStore.login, String(b.current || ''))) return sendJson(res, 400, { error: 'Текущий пароль неверный.' });
    const pw = String(b.password || '');
    if (pw.length < 10) return sendJson(res, 400, { error: 'Новый пароль — от 10 символов.' });
    if (b.login) adminStore.login = String(b.login).trim().toLowerCase();
    adminStore.salt = crypto.randomBytes(16).toString('hex'); adminStore.hash = scrypt(pw, adminStore.salt);
    // остальные входы администратора закрываются
    adminStore.epoch = (adminStore.epoch || 0) + 1;
    adminStore.sessions = { [req.adminSid]: { at: Date.now(), seen: Date.now(), epoch: adminStore.epoch } };
    writeJson('admin.json', adminStore);
  } else if (p === '/admin/logout-all') {
    adminStore.sessions = { [req.adminSid]: adminStore.sessions[req.adminSid] };
    saveAdmin();
  } else return sendJson(res, 404, { error: 'not found' });
  sendJson(res, 200, adminState(req));
}

/* ------------------------------------------------------------- картинки: баннеры, обложки, логотипы
 * Кэш на диске art.json:
 *   a<mal> — AniList { b: баннер, c: обложка }     k<mal> — Kitsu { b }
 *   m<mal> — TMDB-сопоставление { type, id } | {}   t<mal> — TMDB { b: фон без надписей, l: логотип названия }
 */
const artCache = readJson('art.json', {});
const saveArt = () => saveLater('art.json', () => artCache);
const fresh = (e) => e && Date.now() - e.at < (e.b || e.c || e.l || e.id ? 30 : 4) * 86400e3;
const IMG_ACCEPT = { Accept: 'application/json' };

async function anilistArt(ids) {
  const out = {};
  const query = 'query($ids:[Int]){Page(perPage:50){media(idMal_in:$ids,type:ANIME){idMal bannerImage coverImage{extraLarge large}}}}';
  try {
    const r = await fetch(ANILIST, { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ query, variables: { ids } }) });
    const j = await r.json();
    if (j.errors && !j.data) throw new Error(j.errors[0].message);
    for (const m of (j.data && j.data.Page && j.data.Page.media) || []) {
      if (m.idMal) out[m.idMal] = { b: m.bannerImage || null, c: (m.coverImage && (m.coverImage.extraLarge || m.coverImage.large)) || null };
    }
    for (const id of ids) if (!out[id]) out[id] = { b: null, c: null };
    return out;
  } catch (e) {
    console.warn('[yoru] AniList:', e.message);
    return null; // не кэшируем сбой
  }
}
async function kitsuBanner(id) {
  try {
    const q = `${KITSU}/mappings?filter[externalSite]=myanimelist/anime&filter[externalId]=${id}&include=item&fields[anime]=coverImage`;
    const r = await fetch(q, { headers: { Accept: 'application/vnd.api+json' } });
    if (!r.ok) return undefined;
    const j = await r.json();
    const item = (j.included || []).find((x) => x.type === 'anime');
    const c = item && item.attributes && item.attributes.coverImage;
    return c ? c.original || c.large || null : null;
  } catch { return undefined; }
}

/* ---- TMDB («как на AniScroll»): фон без надписей и логотип названия ---- */
async function tmdbGet(pathAndQuery, key = tmdbKey()) {
  const bearer = key.length > 60 && key.includes('.');
  const u = new URL(TMDB + pathAndQuery);
  if (!bearer) u.searchParams.set('api_key', key);
  const r = await fetch(u, { headers: { ...IMG_ACCEPT, ...(bearer ? { Authorization: 'Bearer ' + key } : {}) } });
  if (r.status === 404) return null;
  if (!r.ok) throw Object.assign(new Error('TMDB ' + r.status), { status: r.status });
  return r.json();
}
async function tmdbCheck(key) {
  try { await tmdbGet('/configuration', key); return { ok: true }; }
  catch (e) { return { ok: false, error: e.status === 401 ? 'TMDB не принял ключ.' : 'Нет связи с TMDB: ' + e.message }; }
}
const isAnimation = (x) => !!x && ((x.genre_ids || []).includes(16) || (x.genres || []).some((g) => g.id === 16));
async function tmdbMap(mal) {
  const c = artCache['m' + mal];
  if (fresh(c)) return c.id ? c : null;
  let ids = {};
  try { const r = await fetch(`${ARM}/ids?source=myanimelist&id=${mal}`, { headers: IMG_ACCEPT }); if (r.ok) ids = (await r.json()) || {}; } catch { /* нет связи */ }
  if (!ids.thetvdb && !ids.themoviedb && !ids.imdb) {
    try { const r = await fetch(`${ANIMEAPI}/myanimelist/${mal}`, { headers: IMG_ACCEPT }); if (r.ok) { const j = await r.json(); ids = { themoviedb: j.themoviedb, imdb: j.imdb, thetvdb: j.thetvdb }; } } catch { /* нет связи */ }
  }
  let found = null;
  const find = async (ext, source) => {
    const j = await tmdbGet(`/find/${encodeURIComponent(ext)}?external_source=${source}`);
    const tv = j && (j.tv_results || []).find(isAnimation), mv = j && (j.movie_results || []).find(isAnimation);
    return tv ? { type: 'tv', id: tv.id } : mv ? { type: 'movie', id: mv.id } : null;
  };
  if (ids.thetvdb) found = await find(ids.thetvdb, 'tvdb_id');
  if (!found && ids.themoviedb) {
    for (const type of ['movie', 'tv']) {
      const j = await tmdbGet(`/${type}/${Number(ids.themoviedb)}`);
      if (isAnimation(j)) { found = { type, id: j.id }; break; }
    }
  }
  if (!found && ids.imdb) found = await find(ids.imdb, 'imdb_id');
  artCache['m' + mal] = { ...(found || {}), at: Date.now() };
  return found;
}
const LOGO_LANGS = ['en', 'ru', null, 'ja'];
function pickLogo(logos) {
  const rank = (x) => { const i = LOGO_LANGS.indexOf(x.iso_639_1 || null); return i < 0 ? 9 : i; };
  return (logos || []).slice()
    .sort((a, b) => rank(a) - rank(b) || (b.vote_average || 0) - (a.vote_average || 0) || (b.width || 0) - (a.width || 0))[0] || null;
}
function pickBackdrop(list) {
  const textless = (list || []).filter((x) => !x.iso_639_1);
  const pool = textless.length ? textless : list || [];
  return pool.slice().sort((a, b) => (b.vote_average || 0) - (a.vote_average || 0) || (b.width || 0) - (a.width || 0))[0] || null;
}
async function tmdbArt(mal) {
  const c = artCache['t' + mal];
  if (fresh(c)) return c;
  const m = await tmdbMap(mal);
  let out = { b: null, l: null, at: Date.now() };
  if (m) {
    const j = await tmdbGet(`/${m.type}/${m.id}/images?include_image_language=en,ru,ja,null`);
    const bd = j && pickBackdrop(j.backdrops), lg = j && pickLogo(j.logos);
    out = { b: bd ? `${TMDB_IMG}/w1280${bd.file_path}` : null, l: lg ? `${TMDB_IMG}/w500${lg.file_path}` : null, at: Date.now() };
  }
  artCache['t' + mal] = out;
  return out;
}
async function pool(items, n, fn) {
  const queue = items.slice();
  await Promise.all(Array.from({ length: Math.min(n, queue.length) }, async () => {
    while (queue.length) { const x = queue.shift(); try { await fn(x); } catch (e) { console.warn('[yoru] art:', e.message); } }
  }));
}

// GET /art?ids=1,2&banner=all|anilist|kitsu|tmdb|none&cover=shikimori|anilist&logo=1
// → { [mal]: { b: баннер|null, c: обложка|null, l: логотип|null } }
async function handleArt(req, res, url) {
  const ids = [...new Set(String(url.searchParams.get('ids') || '').split(',').map(Number).filter((x) => x > 0))].slice(0, 60);
  const banner = url.searchParams.get('banner') || 'all';
  const wantCover = url.searchParams.get('cover') === 'anilist';
  const wantLogo = url.searchParams.get('logo') === '1';
  const useTmdb = !!tmdbKey() && (banner === 'tmdb' || wantLogo);
  const needAnilist = banner === 'all' || banner === 'anilist' || banner === 'tmdb' || wantCover;

  if (needAnilist) {
    const miss = ids.filter((id) => !fresh(artCache['a' + id]));
    for (let i = 0; i < miss.length; i += 50) {
      const got = await anilistArt(miss.slice(i, i + 50));
      if (got) for (const [id, v] of Object.entries(got)) artCache['a' + id] = { ...v, at: Date.now() };
    }
  }
  if (useTmdb) await pool(ids.filter((id) => !fresh(artCache['t' + id])), 4, tmdbArt);
  if (banner === 'all' || banner === 'kitsu' || banner === 'tmdb') {
    // Kitsu — запасной источник баннеров, не больше 8 запросов за раз
    const need = ids.filter((id) => {
      const a = artCache['a' + id], t = artCache['t' + id];
      const has = (banner === 'tmdb' && t && t.b) || (banner !== 'kitsu' && a && a.b);
      return !has && !fresh(artCache['k' + id]);
    }).slice(0, 8);
    await pool(need, 4, async (id) => { const b = await kitsuBanner(id); if (b !== undefined) artCache['k' + id] = { b, at: Date.now() }; });
  }
  saveArt();

  const out = {};
  for (const id of ids) {
    const a = artCache['a' + id] || {}, k = artCache['k' + id] || {}, t = artCache['t' + id] || {};
    const chain = { all: [a.b, k.b], anilist: [a.b], kitsu: [k.b], tmdb: [useTmdb && t.b, a.b, k.b], none: [] }[banner] || [a.b, k.b];
    out[id] = { b: chain.find(Boolean) || null, c: wantCover ? a.c || null : null, l: wantLogo && useTmdb ? t.l || null : null };
  }
  sendJson(res, 200, out);
}

/* ------------------------------------------------------------- статика */
function handleStatic(req, res, url) {
  let p = decodeURIComponent(url.pathname);
  if (p === '/') p = '/index.html';
  const root = p === '/index.html' || p === '/admin.html' || p.startsWith('/assets/') ? BUILD_ROOT : ROOT;
  const file = path.normalize(path.join(root, p));
  if (!file.startsWith(root + path.sep)) return send(res, 403, 'forbidden');
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return send(res, 404, 'not found');
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    fs.createReadStream(file).pipe(res);
  });
}

/* ------------------------------------------------------------- маршруты */
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://local');
  const p = url.pathname;
  try {
    if (p === '/healthz') return send(res, 200, 'ok');
    // администрирование — свой вход, без аккаунта Shikimori
    if (p === '/admin_panel' || p.startsWith('/admin_panel/')) return await handleAdminPanel(req, res, url);
    if (p.startsWith('/admin/')) return await handleAdmin(req, res, url);
    if (p === '/admin.html') return send(res, 404, 'not found');
    if (p === '/auth/shikimori/login' || p === '/oauth/shikimori') return await handleOAuth(req, res, url);
    // стили и скрипты — общедоступный код без данных (нужны и панели администратора)
    if (/^\/(logo\.svg|favicon\.ico|manifest\.webmanifest|brand\/[\w-]+\.png|assets\/[\w-]+\.(?:js|css))$/.test(p) && (req.method === 'GET' || req.method === 'HEAD')) return handleStatic(req, res, url);
    // аватары в панели администратора
    if (p === '/img' && req.method === 'GET' && currentAdmin(req)) return await handleImg(req, res, url);
    req.user = currentUser(req);
    if (!req.user && (p.startsWith('/me/') || p === '/api/sync')) req.user = await userFromBearer(req);
    if (!req.user && p === '/api/sync') return sendJson(res, 401, { error: req.bearerError || (req.headers.authorization ? 'Токен не принят' : 'Нужен вход в Yoru'), module: 'yoru-sync' });
    if (p === '/login') {
      if (req.user && req.user.token) return redirect(res, '/');
      return send(res, 200, loginPage(req, url), HTML, NO_STORE);
    }
    if (p === '/logout') {
      if (req.sid) { delete sessions[req.sid]; saveSessions(); }
      return redirect(res, '/login', { 'Set-Cookie': 'yoru_v3_s=; Path=/; Max-Age=0' });
    }
    if (!req.user || !allowedToEnter(req.user)) {
      if (p === '/' || p === '/index.html') return redirect(res, '/login');
      return sendJson(res, 401, { error: 'Нужен вход в Yoru' });
    }
    if (p === '/config.json') {
      return sendJson(res, 200, { site: SITE, shiki: SHIKI, proxy: true, me: meObject(req.user), auth: authObject(req.user) });
    }
    if (p === '/auth/shikimori/status') return sendJson(res, 200, authObject(req.user));
    if (p === '/me' || p.startsWith('/me/')) return await handleMe(req, res, url);
    if (p.startsWith('/shiki/')) return await handleShiki(req, res, url);
    if (p === '/shiki-gql' && req.method === 'POST') return await handleGql(req, res);
    if (p === '/api/sync') return await handleSync(req, res, url);
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'method not allowed');
    if (p.startsWith('/api/')) return await handleApi365(req, res, url);
    if (p === '/img') return await handleImg(req, res, url);
    if (p === '/fwd') return await handleFwd(req, res, url);
    if (p === '/art') return await handleArt(req, res, url);
    return handleStatic(req, res, url);
  } catch (e) {
    console.error('[yoru]', req.method, req.url, e.message);
    if (!res.headersSent) sendJson(res, e.code === 401 ? 401 : e.code === 500 ? 500 : 502, { error: e.code === 401 || e.code === 500 ? e.message : 'Нет связи с внешним сервисом: ' + e.message });
    else res.destroy();
  }
});

server.listen(PORT, HOST, () => {
  console.log(`\n  Yoru v3: http://${HOST === '0.0.0.0' ? '127.0.0.1' : HOST}:${PORT}${PUBLIC_URL ? `  (снаружи: ${PUBLIC_URL})` : ''}`);
  console.log(`  Пользователей: ${Object.keys(users).length}, доступ: ${settings.access === 'open' ? 'любой аккаунт Shikimori' : 'по списку'}`);
  console.log(`  Администрирование: ${PUBLIC_URL || ''}/admin_panel${adminFromEnv() ? ' (логин из YORU_ADMIN_LOGIN)' : ''}`);
  if (!app) console.log('  Приложение Shikimori не задано — укажите его в /admin_panel.');
  if (setupCode) {
    console.log('');
    console.log('  ================================================');
    console.log(`    Код первого запуска: ${setupCode}`);
    console.log('    Откройте /admin_panel и создайте логин');
    console.log('    и пароль администратора.');
    console.log('  ================================================');
  }
  console.log('');
});
