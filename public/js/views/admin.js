// Панель администратора (/admin_panel): кто может входить, кому можно видео через сервер, трафик,
// приложение Shikimori, ключ TMDB, свой логин и пароль. Вход отдельный, не через Shikimori.
import { createApp } from 'vue';
import AdminNav from '../../../src/AdminNav.vue';
import { $, $$, esc, state, view, toast, imgSrc, loadingBlock, postJson, relTime, ICON, VIDEO_RU, mb } from '../core.js';
import { popover } from '../ui.js';

const LEVELS = ['direct', 'fallback', 'proxy'];
const LEVEL_SHORT = { direct: 'Напрямую', fallback: 'Запасной через сервер', proxy: 'Через сервер' };
const chev = '<svg class="dd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
const dots = '<svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>';
const ago = (ms) => (ms ? relTime(new Date(ms).toISOString()) : 'ещё не заходил');

let S = null;

export async function renderAdmin() {
  navApp?.unmount();
  navApp = null;
  view().innerHTML = loadingBlock();
  const r = await fetch('/admin/state', { cache: 'no-store' });
  if (r.status === 401) { location.reload(); return; }
  if (!r.ok) throw new Error('Не удалось загрузить данные администратора');
  S = await r.json();
  state.shikiOrigin = S.shikiOrigin || state.shikiOrigin;
  draw();
}

async function act(url, body, msg) {
  try { S = await postJson(url, body); if (msg) toast(msg); draw(); return true; }
  catch (e) { if (e.code === 401) location.reload(); else toast(e.message); return false; }
}

function draw() {
  navApp?.unmount();
  navApp = null;
  const { settings: st, users, totals, requests, app, tmdb, admin } = S;
  const proxyUsers = users.filter((u) => u.effective !== 'direct' && !u.blocked).length;
  view().innerHTML = `
    <div class="page-head lib-head"><div><h1 class="page-title">Администрирование</h1>
      <p class="page-sub">Каждый входит через свой Shikimori и смотрит со своим токеном Anime365. Здесь вы решаете, кого пускать и кому можно грузить видео через сервер.</p></div></div>
    ${app ? '' : `<div class="adm-alert"><b>Сначала укажите приложение Shikimori</b><span>Без него никто не сможет войти в Yoru. Откройте раздел «Приложение Shikimori».</span></div>`}

    <div class="adm-stats">
      <div><b>${users.length}</b><span>${users.length === 1 ? 'пользователь' : 'пользователей'}</span></div>
      <div><b>${proxyUsers}</b><span>с видео через сервер</span></div>
      <div><b>${mb(totals.today)}</b><span>через сервер сегодня</span></div>
      <div><b>${mb(totals.month)}</b><span>за этот месяц</span></div>
    </div>

    <div class="settings">
      <section class="set-card">
        <h2>Пользователи</h2>
        <p class="set-lead">Видео «напрямую» вообще не нагружает сервер. «Запасной через сервер» включается, только когда CDN не отдал видео. «Через сервер» — каждая серия 1080p проходит через VPS целиком, примерно 0,5–0,7 ГБ.</p>
        <div class="adm-users">${users.map(userRow).join('') || '<p class="set-note">Пока никого.</p>'}</div>
      </section>

      <section class="set-card">
        <h2>Доступ</h2>
        <div class="choice" role="radiogroup" aria-label="Кто может войти">
          ${[['invite', 'По списку', 'Войти могут только ники из списка ниже'],
             ['open', 'Любой аккаунт Shikimori', 'Кто знает адрес, тот и войдёт. Видео через сервер новичкам — по правилу ниже']].map(([v, t, d]) =>
            `<label class="choice-item"><input type="radio" name="admAccess" value="${v}" ${st.access === v ? 'checked' : ''}><span><b>${t}</b><small>${d}</small></span></label>`).join('')}
        </div>
        ${requests.length ? `<h3>Пытались войти</h3><ul class="adm-req">${requests.map((r) => `<li>
            ${r.avatar ? `<img src="${esc(imgSrc(r.avatar, state.shikiOrigin))}" alt="">` : '<span class="acct-ph"></span>'}
            <span><b>${esc(r.nickname)}</b><small>${esc(ago(r.at))}</small></span>
            <button class="btn primary small" type="button" data-allow="${esc(r.nickname)}">Пустить</button></li>`).join('')}</ul>` : ''}
        <h3>Список доступа</h3>
        <form class="inline-form" id="admAllowForm"><input class="input" id="admNick" placeholder="Ник на Shikimori" autocomplete="off" spellcheck="false">
          <button class="btn primary small" type="submit">Добавить</button></form>
        <div class="adm-chips">${st.allow.length ? st.allow.map((n) => `<span class="adm-chip">${esc(n)}<button type="button" data-unallow="${esc(n)}" aria-label="Убрать ${esc(n)}">×</button></span>`).join('') : '<p class="set-note">Список пуст.</p>'}</div>
        <p class="set-note">Пришлите другу адрес Yoru. Если его нет в списке, он увидит «нет доступа», а здесь появится кнопка «Пустить».</p>
      </section>

      <section class="set-card">
        <h2>Видео через сервер</h2>
        <h3>Для новых пользователей</h3>
        <div class="choice" role="radiogroup" aria-label="Видео для новых пользователей">
          ${LEVELS.map((v) => `<label class="choice-item"><input type="radio" name="admDefault" value="${v}" ${st.defaultVideo === v ? 'checked' : ''}><span><b>${VIDEO_RU[v][0]}</b><small>${VIDEO_RU[v][1]}</small></span></label>`).join('')}
        </div>
        <h3>Дневной лимит на человека</h3>
        <form class="inline-form" id="admCapForm"><input class="input" id="admCap" type="number" min="0" step="0.5" inputmode="decimal" value="${+(st.dailyCapMB / 1024).toFixed(2)}" style="max-width:140px"><span class="adm-unit">ГБ в день</span>
          <button class="btn primary small" type="submit">Сохранить</button></form>
        <p class="set-note">Сколько видео один человек может прогнать через сервер за сутки (по UTC). 0 — без лимита. Когда лимит кончился, видео через сервер перестаёт грузиться до следующего дня, а напрямую — продолжает. Субтитры в лимит не входят.</p>
      </section>

      <section class="set-card">
        <h2>Приложение Shikimori</h2>
        <p class="set-lead">Через него все входят в Yoru. Зарегистрируйте его на Shikimori с правом <b>user_rates</b>. Адрес возврата в настройках приложения на Shikimori должен быть ровно таким:</p>
        <span class="copy-line"><code id="admRu">${esc(S.redirectUri)}</code><button class="btn ghost small" type="button" data-copy="admRu">Копировать</button>
          <a class="btn ghost small" href="${esc(state.shikiOrigin)}/oauth/applications" target="_blank" rel="noopener">Мои приложения ${ICON.ext}</a></span>
        ${app ? `<p class="set-note">Сейчас: <b>${esc(app.name)}</b>, Client ID <code>${esc(app.client_id)}</code>, права ${esc(app.scopes.join(', '))}.</p>` : ''}
        ${app && app.fromEnv ? '<p class="set-note">Задано переменными окружения SHIKIMORI_CLIENT_ID и SHIKIMORI_CLIENT_SECRET — меняйте их там.</p>' : `
        <details class="set-more" ${app ? '' : 'open'}><summary>${app ? 'Заменить приложение' : 'Указать приложение'}</summary>
          <form class="app-form" id="admAppForm">
            <label class="field"><span>Название приложения</span><input class="input" name="app_name" value="${esc((app && app.name) || 'Yoru')}" autocomplete="off"><small>Как на Shikimori: оно передаётся как User-Agent.</small></label>
            <label class="field"><span>Client ID</span><input class="input" name="client_id" value="${esc((app && app.client_id) || '')}" autocomplete="off" spellcheck="false" required></label>
            <label class="field"><span>Client Secret</span><input class="input" name="client_secret" type="password" autocomplete="off" spellcheck="false" placeholder="${app ? 'Оставьте пустым, если Client ID тот же' : ''}"></label>
            <fieldset class="scopes"><legend>Права приложения</legend>
              <label><input type="checkbox" checked disabled> Список аниме <code>user_rates</code></label>
              <label><input type="checkbox" name="messages" ${app && app.scopes.includes('messages') ? 'checked' : ''}> Уведомления Shikimori <code>messages</code> — только если Shikimori дал отметить это право</label>
            </fieldset>
            <div class="set-actions"><button class="btn primary small" type="submit">Сохранить</button></div>
            <p class="set-note">После замены всем, возможно, придётся войти заново.</p>
          </form></details>`}
      </section>

      <section class="set-card">
        <h2>TMDB: баннеры и логотипы</h2>
        <p class="set-lead">С ключом TMDB пользователи смогут выбрать баннеры «как на AniScroll» (чистые кадры без надписей), а плеер покажет логотип названия тайтла.</p>
        ${tmdb.fromEnv ? '<p class="set-note">Ключ задан переменной TMDB_API_KEY.</p>' : `
        <form class="inline-form" id="admTmdbForm"><input class="input" id="admTmdb" type="password" autocomplete="off" spellcheck="false" placeholder="${tmdb.configured ? `Сохранён (${esc(tmdb.hint)}). Введите новый, чтобы заменить` : 'API Key или API Read Access Token'}">
          <button class="btn primary small" type="submit">Проверить и сохранить</button>${tmdb.configured ? '<button class="btn ghost small" type="button" id="admTmdbDel">Убрать</button>' : ''}</form>
        <p class="set-note">Ключ бесплатный: зарегистрируйтесь на <a href="https://www.themoviedb.org/signup" target="_blank" rel="noopener">themoviedb.org ${ICON.ext}</a> и откройте <a href="https://www.themoviedb.org/settings/api" target="_blank" rel="noopener">Настройки → API ${ICON.ext}</a>. Подойдёт и короткий «API Key», и длинный «Read Access Token». Ключ хранится только на сервере.</p>`}
      </section>

      <section class="set-card">
        <h2>Вход администратора</h2>
        <p class="set-lead">Логин <b>${esc(admin.login || '')}</b>. Активных входов в панель: ${admin.sessions}.</p>
        ${admin.fromEnv ? '<p class="set-note">Логин и пароль заданы переменными YORU_ADMIN_LOGIN и YORU_ADMIN_PASSWORD — меняйте их там и перезапустите сервер.</p>' : `
        <form class="app-form" id="admPwForm">
          <label class="field"><span>Текущий пароль</span><input class="input" name="current" type="password" autocomplete="current-password" required></label>
          <label class="field"><span>Новый логин</span><input class="input" name="login" value="${esc(admin.login || '')}" autocomplete="username" minlength="3"></label>
          <label class="field"><span>Новый пароль</span><input class="input" name="password" type="password" autocomplete="new-password" minlength="10" required><small>От 10 символов. Остальные входы в панель закроются.</small></label>
          <div class="set-actions"><button class="btn primary small" type="submit">Сменить</button></div>
        </form>`}
        ${admin.sessions > 1 ? '<div class="set-actions"><button class="btn ghost small" type="button" id="admOthers">Выйти на других устройствах</button></div>' : ''}
      </section>
    </div>`;
  adminNav([
    ['users', `${users.length} ${users.length === 1 ? 'пользователь' : 'пользователей'}${requests.length ? ` · ${requests.length} ждут доступа` : ''}`],
    ['access', `${st.access === 'open' ? 'Любой аккаунт Shikimori' : 'По списку'} · в списке ${st.allow.length}${requests.length ? ` · заявок ${requests.length}` : ''}`],
    ['video', `Новым — ${LEVEL_SHORT[st.defaultVideo].toLowerCase()} · лимит ${st.dailyCapMB ? mb(st.dailyCapMB * 1048576) + ' в день' : 'не задан'}`],
    ['app', app ? `${app.name}, права ${app.scopes.join(', ')}` : 'Не задано — войти никто не сможет'],
    ['tmdb', tmdb.configured ? `Ключ задан${tmdb.fromEnv ? ' в переменных окружения' : ''}` : 'Ключ не задан'],
    ['admin', `Логин ${admin.login || ''}`],
  ]);
  bind();
}

let navApp = null;

function adminNav(meta) {
  const settings = $('.settings');
  const sections = [...settings.children].map((element, index) => ({
    element, id: meta[index][0], hint: meta[index][1], title: element.querySelector('h2').textContent,
  }));
  const layout = document.createElement('div');
  layout.className = 'set-layout adm-layout';
  const target = document.createElement('div');
  target.className = 'adm-nav-mount';
  settings.before(layout);
  layout.append(target, settings);
  navApp = createApp(AdminNav, { sections });
  navApp.mount(target);
}

function userRow(u) {
  const tags = [
    u.blocked ? '<span class="adm-tag rose">заблокирован</span>' : '',
    !u.blocked && !u.allowed ? '<span class="adm-tag rose">нет в списке доступа</span>' : '',
    !u.anime365 ? '<span class="adm-tag">нет токена Anime365</span>' : '',
    !u.shiki ? '<span class="adm-tag">Shikimori отключён</span>' : '',
  ].join('');
  const lvl = u.video === 'default' ? `По умолчанию: ${LEVEL_SHORT[u.effective]}` : LEVEL_SHORT[u.video];
  return `<div class="adm-user${u.blocked ? ' is-blocked' : ''}">
    ${u.avatar ? `<img src="${esc(imgSrc(u.avatar, state.shikiOrigin))}" alt="">` : '<span class="acct-ph"></span>'}
    <div class="adm-who"><b><a href="${esc(state.shikiOrigin)}/${encodeURIComponent(u.nickname)}" target="_blank" rel="noopener">${esc(u.nickname)}</a></b>
      <small>${esc(ago(u.lastSeen))}${u.sessions ? ` · устройств: ${u.sessions}` : ''}</small><span class="adm-tags">${tags}</span></div>
    <div class="adm-traffic"><b>${mb(u.today)}</b><small>сегодня</small><b>${mb(u.month)}</b><small>за месяц</small></div>
    <button class="dd adm-lvl lvl-${u.effective}" type="button" data-lvl="${esc(u.id)}" aria-label="Видео через сервер для ${esc(u.nickname)}"><span>${esc(lvl)}</span>${chev}</button>
    <button class="icon-btn adm-more" type="button" data-more="${esc(u.id)}" aria-label="Действия с ${esc(u.nickname)}">${dots}</button>
  </div>`;
}

function bind() {
  const byId = (id) => S.users.find((u) => u.id === id);
  $$('[data-lvl]').forEach((b) => b.onclick = () => {
    const u = byId(b.dataset.lvl);
    popover(b, {
      width: 300,
      html: [['default', `По умолчанию (${LEVEL_SHORT[S.settings.defaultVideo]})`, 'Как выбрано для новых пользователей'], ...LEVELS.map((v) => [v, VIDEO_RU[v][0], VIDEO_RU[v][1]])]
        .map(([v, t, d]) => `<button class="pop-item pop-2l" type="button" role="option" data-v="${v}" aria-selected="${u.video === v}"><b>${esc(t)}</b><small>${esc(d)}</small></button>`).join(''),
      onPick: (v) => act('/admin/user', { id: u.id, video: v }, `${u.nickname}: ${v === 'default' ? 'по умолчанию' : LEVEL_SHORT[v].toLowerCase()}`),
    });
  });
  $$('[data-more]').forEach((b) => b.onclick = () => {
    const u = byId(b.dataset.more);
    const items = [
      ['kick', 'Выйти на всех устройствах'],
      ['reset', 'Обнулить счётчик трафика'],
      ['block', u.blocked ? 'Разблокировать' : 'Заблокировать'],
      ['forget', 'Удалить из Yoru', 'danger'],
    ];
    popover(b, {
      width: 260, className: 'pop-menu',
      html: items.map(([v, t, cls]) => `<button class="pop-item${cls ? ' ' + cls : ''}" type="button" role="option" data-v="${v}" aria-selected="false">${esc(t)}</button>`).join(''),
      onPick: (v) => {
        if (v === 'kick') act('/admin/user', { id: u.id, kick: true }, 'Сессии завершены');
        if (v === 'reset') act('/admin/user', { id: u.id, resetTraffic: true }, 'Счётчик обнулён');
        if (v === 'block') act('/admin/user', { id: u.id, blocked: !u.blocked }, u.blocked ? 'Разблокирован' : `${u.nickname} заблокирован`);
        if (v === 'forget') confirmForget(u);
      },
    });
  });
  $$('input[name="admAccess"]').forEach((r) => r.onchange = () => act('/admin/settings', { access: r.value }, r.value === 'open' ? 'Вход открыт для любого аккаунта Shikimori' : 'Вход только по списку'));
  $$('input[name="admDefault"]').forEach((r) => r.onchange = () => act('/admin/settings', { defaultVideo: r.value }, 'Правило для новых пользователей сохранено'));
  $('#admCapForm').onsubmit = (e) => { e.preventDefault(); act('/admin/settings', { dailyCapMB: Math.round((+$('#admCap').value || 0) * 1024) }, 'Лимит сохранён'); };
  $('#admAllowForm').onsubmit = (e) => { e.preventDefault(); const n = $('#admNick').value.trim(); if (n) act('/admin/allow', { nickname: n }, `${n} добавлен в список`); };
  $$('[data-allow]').forEach((b) => b.onclick = () => act('/admin/allow', { nickname: b.dataset.allow }, `${b.dataset.allow} может войти`));
  $$('[data-unallow]').forEach((b) => b.onclick = () => act('/admin/allow', { nickname: b.dataset.unallow, remove: true }, 'Убран из списка'));
  $$('[data-copy]').forEach((b) => b.onclick = () => navigator.clipboard.writeText($('#' + b.dataset.copy).textContent).then(() => toast('Скопировано'), () => toast('Скопируйте адрес вручную')));
  const tf = $('#admTmdbForm');
  if (tf) tf.onsubmit = async (e) => {
    e.preventDefault();
    const v = $('#admTmdb').value.trim(); if (!v) return;
    const btn = tf.querySelector('button'); btn.disabled = true; btn.textContent = 'Проверяем…';
    if (!(await act('/admin/settings', { tmdbKey: v }, 'Ключ TMDB сохранён'))) { btn.disabled = false; btn.textContent = 'Проверить и сохранить'; }
  };
  const td = $('#admTmdbDel');
  if (td) td.onclick = () => act('/admin/settings', { tmdbKey: '' }, 'Ключ TMDB убран');
  const pf = $('#admPwForm');
  if (pf) pf.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(pf);
    act('/admin/password', { current: f.get('current'), login: f.get('login'), password: f.get('password') }, 'Логин и пароль изменены');
  };
  const ao = $('#admOthers');
  if (ao) ao.onclick = () => act('/admin/logout-all', {}, 'Другие входы в панель закрыты');
  const af = $('#admAppForm');
  if (af) af.onsubmit = (e) => {
    e.preventDefault();
    const f = new FormData(af);
    act('/admin/app', { app_name: f.get('app_name'), client_id: f.get('client_id'), client_secret: f.get('client_secret'), messages: !!f.get('messages') }, 'Приложение сохранено');
  };
}

function confirmForget(u) {
  toast(`Удалить ${u.nickname}? Его токены и счётчики сотрутся`, { label: 'Удалить', run: () => act('/admin/user', { id: u.id, forget: true }, `${u.nickname} удалён`) });
}
