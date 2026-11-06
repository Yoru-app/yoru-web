// Страница тайтла: данные Shikimori, баннер, список пользователя, серии Anime365.
import { $, $$, esc, store, view, state, loadingBlock, emptyBlock, toast, untilText, fmtDate, imgSrc, ICON, epWord } from '../core.js';
import { getAnime, related, similar, chronology, chronoPosition, chronoFilter, rateOf, saveRate, loggedIn, canEdit, loadRates, LIST_STATUS, KIND, listLabel } from '../shiki.js';
import { loadBanners, bannerOf, posterHTML, logosFor, logoCached } from '../art.js';
import { watchFit, bannerLook } from '../fitart.js';
import { seriesByMal, sortEpisodes, epShort, epLabel, epNum, lib } from '../api365.js';
import { animeCard, grid } from '../components.js';
import { bindDropdown } from '../ui.js';
import { CHRONO_MODES } from './settings.js';

const plural = (n, one, few, many, withN) => {
  const a = Math.abs(n) % 100, b = a % 10;
  const w = a > 10 && a < 20 ? many : b > 1 && b < 5 ? few : b === 1 ? one : many;
  return withN ? `${n} ${w}` : w;
};

// Шапка тайтла: по умолчанию размытые края, картинка у правого края, логотип вместо названия
export const titleLook = () => ({
  ...bannerLook(),
  logo: store.get('titleLogo', true) !== false && !!(state.me && state.me.tmdb),
});

export async function renderTitle(id, host, paint) {
  const isCurrent = () => view() === host && window.yoruRoute().id === id;
  const look = titleLook();
  const [a] = await Promise.all([getAnime(id), loadBanners([id]), (loggedIn() ? loadRates() : null), look.logo ? logosFor([id]) : null]);
  if (!isCurrent()) return;
  document.title = `${a.title} — Yoru`;
  const banner = bannerOf(id);
  const rendered = await paint({ anime: a, look, banner, logo: look.logo ? logoCached(id) : null });
  if (!rendered || !isCurrent()) return;

  const d = $('#tDesc'), more = $('#moreDesc');
  if (d && d.scrollHeight > d.clientHeight + 4) { more.hidden = false; more.onclick = () => { d.classList.remove('clamped'); more.remove(); }; }

  let series = null, eps = [], epGroup = null;
  const drawActions = () => {
    const box = $('#tActions'); if (!box) return;
    const r = rateOf(id);
    const watched = r ? r.episodes : 0;
    const hist = lib.history().find((h) => h.aid === id);
    if (!series) {
      box.innerHTML = `<span class="btn ghost" aria-disabled="true">Нет на Anime365</span>
        <a class="btn ghost" href="${esc(state.site)}/catalog/search?q=${encodeURIComponent(a.name || a.title)}" target="_blank" rel="noopener">Поискать на сайте ${ICON.ext}</a>`;
      return;
    }
    let target = eps.find((e) => epNum(e) > watched) || eps[eps.length - 1];
    if (hist && !lib.seen(hist.eid)) target = eps.find((e) => e.id === hist.eid) || target;
    const n = target ? epNum(target) : 0;
    const resume = hist && target && hist.eid === target.id && lib.pct(target.id);
    const label = !target || eps.length < 2 || !n ? (resume ? 'Продолжить' : 'Смотреть') : `${resume ? 'Продолжить' : 'Смотреть'} ${n}-ю серию`;
    box.innerHTML = target ? `<a class="btn primary" href="#watch-${id}-${target.id}">${ICON.play}${esc(label)}</a>` : '<span class="btn ghost" aria-disabled="true">Серий пока нет</span>';
  };
  drawRate(a);

  // серии Anime365
  const tabs = { eps: drawEps, chrono: drawChrono, rel: drawRel, sim: drawSim, chars: drawChars, media: drawMedia };
  let tab = 'eps';
  function openTab(t) {
    tab = t;
    $$('#tTabs [data-tab]').forEach((b) => b.setAttribute('aria-selected', b.dataset.tab === t));
    $('#tPane').innerHTML = loadingBlock();
    tabs[t]();
  }
  $$('#tTabs [data-tab]').forEach((b) => b.onclick = () => openTab(b.dataset.tab));

  function drawEps() {
    if (tab !== 'eps') return;
    const pane = $('#tPane');
    if (series === undefined) return;
    if (!series) {
      pane.innerHTML = emptyBlock('На Anime365 этого тайтла нет', 'Видео для него недоступно. Остальное — описание, список и похожие — работает.');
      return;
    }
    if (!eps.length) { pane.innerHTML = emptyBlock('Серий пока нет', 'Anime365 ещё не добавил эпизоды.'); return; }
    const r = rateOf(id), watched = r ? r.episodes : 0;
    const hist = lib.history().find((h) => h.aid === id);
    const legend = r ? `<p class="eps-legend">${ICON.check}Просмотрено по Shikimori: ${watched} из ${a.episodes || a.aired || '?'}</p>` : '';
    // больше 75 серий — разбиваем по 50, чтобы до последних не листать полэкрана
    const GROUP = 50;
    const groups = eps.length > 75 ? Array.from({ length: Math.ceil(eps.length / GROUP) }, (_, i) => eps.slice(i * GROUP, (i + 1) * GROUP)) : [eps];
    if (epGroup == null || epGroup >= groups.length) {
      const next = (hist && !lib.seen(hist.eid) && eps.find((e) => e.id === hist.eid)) || eps.find((e) => epNum(e) > watched) || eps[eps.length - 1];
      epGroup = Math.max(0, groups.findIndex((g) => g.includes(next)));
    }
    const isSeen = (e) => !!(watched && epNum(e) && epNum(e) <= watched);
    const groupBar = groups.length > 1 ? `<div class="ep-groups" role="tablist" aria-label="Серии по ${GROUP}">${groups.map((g, i) => {
      const done = g.every(isSeen);
      return `<button type="button" role="tab" data-epg="${i}" aria-selected="${i === epGroup}" class="${done ? 'done' : ''}">${esc(epShort(g[0]))}–${esc(epShort(g[g.length - 1]))}${done ? ICON.check : ''}</button>`;
    }).join('')}</div>` : '';
    pane.innerHTML = `${legend}${groupBar}<div class="eps">${groups[epGroup].map((e) => {
      // просмотренные — по списку Shikimori; полоска — где остановились в этом браузере
      const p = lib.pct(e.id), seen = !!(watched && epNum(e) && epNum(e) <= watched);
      return `<a class="ep${seen ? ' seen' : ''}${hist && hist.eid === e.id ? ' current' : ''}" href="#watch-${id}-${e.id}" title="${esc((e.episodeFull || epLabel(e)) + (seen ? ', просмотрено' : ''))}">${esc(epShort(e))}${seen ? `<span class="ep-check" aria-label="просмотрено">${ICON.check}</span>` : ''}${p && p < 85 && !seen ? `<span class="prog"><i style="width:${p}%"></i></span>` : ''}</a>`;
    }).join('')}</div>${groups.length > 1 && epGroup < groups.length - 1 ? '' : a.status === 'ongoing' && a.next ? `<p class="t-next">${a.aired + 1}-я серия выйдет ${esc(untilText(a.next))}. На Anime365 она появится с переводом чуть позже.</p>` : ''}`;
    $$('[data-epg]', pane).forEach((b) => b.onclick = () => { epGroup = +b.dataset.epg; drawEps(); });
  }
  // Хронология франшизы: части по порядку выхода, открытый тайтл выделен,
  // части, которые не входят в счёт по выбранному режиму, приглушены
  async function drawChrono() {
    const list = await chronology(a).catch(() => []);
    if (tab !== 'chrono') return;
    const mode = store.get('chronoMode', 'seasons_movies');
    const inPool = chronoFilter(mode);
    let k = 0;
    $('#tPane').innerHTML = `<div class="chrono-head"><div class="seg" role="group" aria-label="Что считать">
        ${CHRONO_MODES.map(([v, t]) => `<button type="button" data-cm="${v}" aria-pressed="${mode === v}">${t}</button>`).join('')}</div>
        <p class="chrono-lead">${plural(list.length, 'часть', 'части', 'частей', true)} по порядку выхода, в счёт идут ${plural(list.filter(inPool).length, 'часть', 'части', 'частей', true)}.</p></div>
      <ol class="chrono">${list.map((x) => {
        const r = rateOf(x.id), me = x.id === a.id, counted = inPool(x);
        if (counted) k++;
        return `<li class="${me ? 'chrono-cur' : ''}${counted ? '' : ' chrono-out'}"${me ? ' aria-current="true"' : ''}><a href="#anime-${x.id}">
          <span class="chrono-n" title="${counted ? 'Учитывается в номере' : 'Не учитывается в номере'}">${counted ? k : '·'}</span>
          <span class="chrono-img">${posterHTML(x)}</span>
          <span class="chrono-body"><b>${esc(x.title)}</b>
            <small>${esc([KIND[x.kind] || x.kind, x.year || 'дата неизвестна', x.episodes > 1 ? `${x.episodes} эп.` : ''].filter(Boolean).join(', '))}</small></span>
          ${me ? '<span class="chrono-here">Вы здесь</span>' : r ? `<span class="badge list st-${r.status}">${esc(listLabel(r.status))}</span>` : ''}
        </a></li>`;
      }).join('')}</ol>`;
    $$('[data-cm]').forEach((b) => b.onclick = () => { store.set('chronoMode', b.dataset.cm); drawChrono(); drawBadge(); });
  }
  async function drawRel() {
    const items = await related(a).catch(() => []);
    if (tab !== 'rel') return;
    $('#tPane').innerHTML = items.length ? grid(items.map((x) => animeCard(x.anime, { meta: [x.relation, x.anime.year].filter(Boolean).join(', ') }))) : emptyBlock('Связанных тайтлов нет', '');
  }
  async function drawSim() {
    let items = [];
    try { items = await similar(id); } catch (e) { if (tab === 'sim') $('#tPane').innerHTML = emptyBlock('Не удалось загрузить', esc(e.message)); return; }
    if (tab !== 'sim') return;
    $('#tPane').innerHTML = items.length ? grid(items.map((x) => animeCard(x))) : emptyBlock('Похожих тайтлов нет', '');
  }
  function drawChars() {
    const list = (a.characters || []).filter((c) => c.character)
      .sort((x, y) => ((y.rolesEn || []).includes('Main') - (x.rolesEn || []).includes('Main')));
    $('#tPane').innerHTML = `<div class="people">${list.slice(0, 30).map((c) => {
      const ch = c.character, p = ch.poster && ch.poster.mainUrl;
      return `<a class="person" href="${esc(state.shikiOrigin)}/characters/${ch.id}" target="_blank" rel="noopener">
        <span class="person-img">${p ? `<img src="${esc(imgSrc(p))}" alt="" loading="lazy">` : ''}</span>
        <span class="person-name">${esc(ch.russian || ch.name)}</span><span class="person-role">${esc((c.rolesRu || []).join(', '))}</span></a>`;
    }).join('')}</div>`;
  }
  function drawMedia() {
    const shots = a.screenshots || [], vids = a.videos || [];
    $('#tPane').innerHTML = `${shots.length ? `<div class="shots">${shots.slice(0, 18).map((s) => `<a href="${esc(imgSrc(s.originalUrl))}" target="_blank" rel="noopener"><img src="${esc(imgSrc(s.x332Url || s.originalUrl))}" alt="" loading="lazy"></a>`).join('')}</div>` : ''}
      ${vids.length ? `<div class="vids">${vids.slice(0, 12).map((v) => `<a class="vid" href="${esc(v.url)}" target="_blank" rel="noopener">${ICON.play}<span>${esc(v.name || ({ op: 'Опенинг', ed: 'Эндинг', pv: 'Трейлер', cm: 'Реклама' }[v.kind] || 'Видео'))}</span></a>`).join('')}</div>` : ''}`;
  }

  series = undefined;
  openTab('eps');
  // номер в хронологии на постере
  async function drawBadge() {
    const list = await chronology(a).catch(() => []);
    if (!isCurrent()) return;
    if (list.length > 1) $('#tTabs [data-tab="chrono"]').hidden = false;
    const pos = chronoPosition(list, a, store.get('chronoMode', 'seasons_movies'));
    const b = $('#chronoBadge');
    if (!b) return;
    b.hidden = !pos;
    if (!pos) return;
    const word = pos.mode === 'seasons' ? 'Сезон' : 'Часть';
    b.innerHTML = `<small>${word}</small><b>${pos.n}</b><span>из ${pos.total}</span>`;
    b.setAttribute('aria-label', `${word} ${pos.n} из ${pos.total}. Открыть хронологию`);
    b.onclick = () => { openTab('chrono'); $('#tTabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  }
  drawBadge();
  seriesByMal(id).then((s) => { series = s; eps = s ? sortEpisodes(s.episodes) : []; })
    .catch((e) => { console.warn('[yoru] Anime365', e); series = null; })
    .finally(() => { if (!isCurrent()) return; drawActions(); drawEps(); });

  const onRates = () => { drawRate(a); drawActions(); if (tab === 'eps') drawEps(); };
  window.addEventListener('yoru:rates', onRates);
  const media = $('.t-media');
  const unwatch = banner ? watchFit(media, media.querySelector('img:not(.blur)'), titleLook) : () => {};
  const tl = $('.t-logo');
  if (tl) tl.addEventListener('error', () => { const h = $('.t-name'); if (h) { h.className = 't-name'; h.textContent = a.title; } }, { once: true });
  state.cleanup = () => { window.removeEventListener('yoru:rates', onRates); unwatch(); };
}

/* ---------- блок «мой список» ---------- */
// Подписи оценок как на Shikimori
const SCORE_LABEL = { 10: 'Шедевр', 9: 'Великолепно', 8: 'Отлично', 7: 'Хорошо', 6: 'Неплохо', 5: 'Нормально', 4: 'Слабо', 3: 'Плохо', 2: 'Ужасно', 1: 'Хуже некуда' };
const chev = '<svg class="dd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

function drawRate(a) {
  const box = $('#rateBox'); if (!box) return;
  if (loggedIn() && !canEdit()) {
    const r = rateOf(a.id);
    box.innerHTML = r ? `<div class="rate"><span class="dd dd-static st-${r.status}"><i class="st-dot"></i><span>${esc((LIST_STATUS.find((x) => x[0] === r.status) || [])[1] || '')}</span></span>
      <span class="dd dd-static"><span><b>${r.episodes}</b> из ${a.episodes || a.aired || '?'}</span></span>${r.score ? `<span class="dd dd-static dd-score has">${ICON.star}<span><b>${r.score}</b> ${SCORE_LABEL[r.score]}</span></span>` : ''}</div>` : '';
    return;
  }
  if (!loggedIn()) {
    const r = rateOf(a.id);
    box.innerHTML = `<p class="rate-guest">${r ? `В вашем списке: ${esc((LIST_STATUS.find((x) => x[0] === r.status) || [])[1] || '')}, ${r.episodes} из ${a.episodes || '?'}. ` : ''}<a href="#settings">Войдите через Shikimori</a>, чтобы вести список отсюда.</p>`;
    return;
  }
  const r = rateOf(a.id);
  const total = a.episodes || a.aired || 0;
  const label = r ? (LIST_STATUS.find((x) => x[0] === r.status) || [])[1] : 'Добавить в список';
  box.innerHTML = `<div class="rate" aria-label="Мой список">
    <button class="dd dd-status${r ? ' st-' + r.status : ' dd-add'}" type="button" id="rStatus" aria-label="Статус в списке: ${esc(label)}">
      ${r ? '<i class="st-dot"></i>' : ICON.plus}<span>${esc(label)}</span>${chev}</button>
    ${r ? `<div class="stepper" role="group" aria-label="Просмотрено серий">
      <button type="button" data-ep="-1" aria-label="Минус серия" ${r.episodes <= 0 ? 'disabled' : ''}>${ICON.minus}</button>
      <span><b>${r.episodes}</b> из ${total || '?'}</span>
      <button type="button" data-ep="1" aria-label="Плюс серия" ${total && r.episodes >= total ? 'disabled' : ''}>${ICON.plus}</button></div>
    <button class="dd dd-score${r.score ? ' has' : ''}" type="button" id="rScore" aria-label="Моя оценка: ${r.score || 'нет'}">
      ${ICON.star}<span>${r.score ? `<b>${r.score}</b> ${SCORE_LABEL[r.score]}` : 'Оценить'}</span>${chev}</button>` : ''}
  </div>`;

  const run = async (patch, done) => {
    box.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    try { await saveRate(a, patch); if (done) toast(done); }
    catch (e) { toast(e.message); drawRate(a); }
  };

  bindDropdown($('#rStatus'), () => ({
    className: 'pop-status',
    html: LIST_STATUS.map(([v, l]) => `<button class="pop-item st-${v}" type="button" role="option" data-v="${v}" aria-selected="${!!r && r.status === v}">
        <i class="st-dot"></i><span>${l}</span>${r && r.status === v ? ICON.check : ''}</button>`).join('')
      + (r ? `<div class="pop-sep"></div><button class="pop-item danger" type="button" role="option" data-v="__del" aria-selected="false">${ICON.minus}<span>Убрать из списка</span></button>` : ''),
    onPick(v) {
      if (v === '__del') {
        const was = { status: r.status, episodes: r.episodes, score: r.score };
        saveRate(a, { status: null }).then(() => toast('Убрано из списка', { label: 'Вернуть', run: () => saveRate(a, was) })).catch((e) => toast(e.message));
        return;
      }
      if (r && r.status === v) return;
      const patch = { status: v };
      if (v === 'completed' && total) patch.episodes = total;
      run(patch, r ? `Статус: ${(LIST_STATUS.find((x) => x[0] === v) || [])[1]}` : 'Добавлено в список');
    },
  }));

  $$('[data-ep]', box).forEach((b) => b.onclick = () => {
    const n = Math.max(0, r.episodes + +b.dataset.ep);
    const patch = { episodes: n };
    if (total && n >= total) patch.status = 'completed';
    else if (r.status === 'planned' && n > 0) patch.status = 'watching';
    run(patch);
  });

  const sc = $('#rScore');
  if (sc) bindDropdown(sc, () => ({
    className: 'pop-score', cols: 5,
    html: `<div class="score-grid">${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => `<button class="score-chip s${n}" type="button" role="option" data-v="${n}" aria-selected="${r.score === n}" aria-label="${n}, ${SCORE_LABEL[n]}" data-label="${SCORE_LABEL[n]}">${n}</button>`).join('')}</div>
      <div class="score-foot"><span class="score-hint">${r.score ? `Сейчас: ${r.score}, ${SCORE_LABEL[r.score].toLowerCase()}` : 'Наведите на оценку'}</span>
      ${r.score ? '<button class="pop-link" type="button" data-v="0">Убрать оценку</button>' : ''}</div>`,
    onPick(v) { if (+v !== r.score) run({ score: +v }, +v ? `Оценка ${v}: ${SCORE_LABEL[v].toLowerCase()}` : 'Оценка убрана'); },
  }));
}
// подсказка с названием оценки при наведении и фокусе
document.addEventListener('pointerover', (e) => { const c = e.target.closest && e.target.closest('.score-chip'); if (c) { const h = document.querySelector('.score-hint'); if (h) h.textContent = `${c.dataset.v}, ${c.dataset.label.toLowerCase()}`; } });
document.addEventListener('focusin', (e) => { const c = e.target.closest && e.target.closest('.score-chip'); if (c) { const h = document.querySelector('.score-hint'); if (h) h.textContent = `${c.dataset.v}, ${c.dataset.label.toLowerCase()}`; } });
export { epWord };
