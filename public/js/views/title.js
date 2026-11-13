// Страница тайтла: данные Shikimori, баннер, список пользователя, серии Anime365.
import { $, $$, esc, store, view, state, loadingBlock, emptyBlock, toast, untilText, fmtDate, imgSrc, ICON, epWord } from '../core.js';
import { getAnime, titleMetadata, isMainCharacter, related, similar, chronology, chronoPosition, chronoFilter, rateOf, saveRate, loggedIn, canEdit, loadRates, LIST_STATUS, KIND, listLabel } from '../shiki.js';
import { loadBanners, bannerOf, posterHTML, logosFor, logoCached } from '../art.js';
import { bannerLook } from '../fitart.js';
import { seriesByMal, sortEpisodes, epShort, epLabel, epNum, lib } from '../api365.js';
import { animeCard, grid } from '../components.js';
import { scoreClass } from '../anime-facts.js';
import { bindDropdown, openModal } from '../ui.js';

function mediaUrl(value) {
  if (!value) return '';
  try {
    const url = new URL(value, state.shikiOrigin);
    return /^https?:$/.test(url.protocol) ? url.href : '';
  } catch { return ''; }
}

function videoEmbedUrl(video) {
  for (const value of [video.playerUrl || video.player_url, video.url]) {
    const candidate = mediaUrl(value);
    if (!candidate) continue;
    const url = new URL(candidate);
    const host = url.hostname.replace(/^www\./, '');
    const path = url.pathname.split('/').filter(Boolean);
    if (['youtube.com', 'm.youtube.com', 'youtube-nocookie.com', 'youtu.be'].includes(host)) {
      const id = host === 'youtu.be' ? path[0] : url.searchParams.get('v') || path[1];
      if (/^[\w-]{11}$/.test(id || '')) return `https://www.youtube-nocookie.com/embed/${id}`;
    }
    if (['vimeo.com', 'player.vimeo.com'].includes(host)) {
      const id = path.at(-1);
      if (/^\d+$/.test(id || '')) return `https://player.vimeo.com/video/${id}`;
    }
    if (host === 'rutube.ru' && /^[\da-f]+$/i.test(path.at(-1) || '')) {
      return `https://rutube.ru/play/embed/${path.at(-1)}`;
    }
    if (['vk.com', 'vkvideo.ru'].includes(host) && url.pathname === '/video_ext.php') {
      url.protocol = 'https:';
      return url.href;
    }
    if (['dailymotion.com', 'dai.ly'].includes(host) && /^[a-z0-9]+$/i.test(path.at(-1) || '')) {
      return `https://www.dailymotion.com/embed/video/${path.at(-1)}`;
    }
  }
  return '';
}

function openQuicklook({ label, url, video }) {
  const embed = video ? videoEmbedUrl(video) : '';
  const directVideo = video && /\.(mp4|webm|ogg|ogv)$/i.test(new URL(url).pathname);
  const preview = !video
    ? `<img src="${esc(url)}" alt="${esc(label)}">`
    : directVideo
      ? `<video src="${esc(url)}" controls playsinline preload="metadata"></video>`
      : embed
        ? `<iframe src="${esc(embed)}" title="${esc(label)}" allow="autoplay; fullscreen; picture-in-picture" allowfullscreen sandbox="allow-scripts allow-same-origin allow-presentation"></iframe>`
        : '<p>Для этого видео доступен просмотр на сайте источника.</p>';
  openModal({
    title: esc(label),
    wide: true,
    html: `<div class="quicklook">${preview}
      <a class="btn ghost small quicklook-source" href="${esc(url)}" target="_blank" rel="noopener">Открыть оригинал ${ICON.ext}</a>
    </div>`,
    onOpen(dialog) {
      const image = $('.quicklook img', dialog);
      if (image) image.addEventListener('error', () => { image.src = imgSrc(url, state.shikiOrigin); }, { once: true });
    },
  });
}

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

export async function renderTitle(id, host, paint, { onTabChange, onChronology, onAnime365Url }) {
  const isCurrent = () => view() === host && window.yoruRoute().id === id;
  const look = titleLook();
  const [a] = await Promise.all([getAnime(id).then(titleMetadata), loadBanners([id]), (loggedIn() ? loadRates() : null), look.logo ? logosFor([id]) : null]);
  if (!isCurrent()) return;
  document.title = `${a.title} — Yoru`;
  const banner = bannerOf(id);
  const rendered = await paint({ anime: a, look, banner, logo: look.logo ? logoCached(id) : null });
  if (!rendered || !isCurrent()) return;

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
    if (!isCurrent()) return;
    tab = t;
    onTabChange(t);
    $('#tPane').innerHTML = loadingBlock();
    tabs[t]();
  }

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
      const inProgress = !seen && p > 0 && p < 85;
      const hint = (e.episodeFull || epLabel(e)) + (seen ? ', просмотрено' : inProgress ? `, просмотрено ${p}%` : '');
      return `<a class="ep${seen ? ' seen' : ''}${inProgress ? ' in-progress' : ''}${hist && hist.eid === e.id ? ' current' : ''}"
        href="#watch-${id}-${e.id}" title="${esc(hint)}" aria-label="${esc(hint)}"${inProgress ? ` style="--episode-progress:${p}%"` : ''}>
        ${esc(epShort(e))}${seen ? `<span class="ep-check" aria-hidden="true">${ICON.check}</span>` : ''}</a>`;
    }).join('')}</div>${groups.length > 1 && epGroup < groups.length - 1 ? '' : a.status === 'ongoing' && a.next ? `<p class="t-next">${a.aired + 1}-я серия выйдет ${esc(untilText(a.next))}. На Anime365 она появится с переводом чуть позже.</p>` : ''}`;
    $$('[data-epg]', pane).forEach((b) => b.onclick = () => { epGroup = +b.dataset.epg; drawEps(); });
  }
  // Хронология франшизы: части по порядку выхода, открытый тайтл выделен,
  // части, которые не входят в счёт по выбранному режиму, приглушены
  async function drawChrono() {
    const list = await chronology(a).catch(() => []);
    if (!isCurrent() || tab !== 'chrono') return;
    const mode = store.get('chronoMode', 'seasons_movies');
    const inPool = chronoFilter(mode);
    let k = 0;
    $('#tPane').innerHTML = `<p class="chrono-lead">${plural(list.length, 'часть', 'части', 'частей', true)} по порядку выхода, в счёт идут ${plural(list.filter(inPool).length, 'часть', 'части', 'частей', true)}.</p>
      <ol class="chrono" data-hscroll tabindex="0" aria-label="Хронология тайтла">${list.map((x) => {
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
      .sort((x, y) => Number(Boolean(isMainCharacter(y))) - Number(Boolean(isMainCharacter(x))));
    $('#tPane').innerHTML = `<div class="people">${list.slice(0, 30).map((c) => {
      const ch = c.character, p = ch.poster && ch.poster.mainUrl;
      return `<a class="person" href="${esc(state.shikiOrigin)}/characters/${ch.id}" target="_blank" rel="noopener">
        <span class="person-img">${p ? `<img src="${esc(imgSrc(p))}" alt="" loading="lazy">` : ''}</span>
        <span class="person-name">${esc(ch.russian || ch.name)}</span><span class="person-role">${esc((c.rolesRu || []).join(', '))}</span></a>`;
    }).join('')}</div>`;
  }
  function drawMedia() {
    const shots = (a.screenshots || []).map((shot) => ({
      url: mediaUrl(shot.originalUrl || shot.original || shot.x332Url || shot.preview),
      preview: mediaUrl(shot.x332Url || shot.preview),
    })).filter(({ url }) => url).slice(0, 18).map((shot, index) => ({ ...shot, label: `Кадр ${index + 1}` }));
    const videos = (a.videos || []).map((video) => ({
      video,
      url: mediaUrl(video.url || video.playerUrl || video.player_url),
      label: video.name || ({ op: 'Опенинг', ed: 'Эндинг', pv: 'Трейлер', cm: 'Реклама' }[video.kind] || 'Видео'),
    })).filter(({ url }) => url).slice(0, 12);
    const pane = $('#tPane');
    if (!shots.length && !videos.length) {
      pane.innerHTML = emptyBlock('Кадров и видео пока нет', '');
      return;
    }
    pane.innerHTML = `${shots.length ? `<div class="shots">${shots.map(({ url, preview, label }) =>
      `<a href="${esc(url)}" target="_blank" rel="noopener" aria-haspopup="dialog"><img src="${esc(preview && preview !== url ? imgSrc(preview) : url)}" alt="${esc(label)}" loading="lazy"></a>`).join('')}</div>` : ''}
      ${videos.length ? `<div class="vids">${videos.map(({ url, label }) =>
        `<a class="vid" href="${esc(url)}" target="_blank" rel="noopener" aria-haspopup="dialog">${ICON.play}<span>${esc(label)}</span></a>`).join('')}</div>` : ''}`;
    $$('.shots a, .vids a', pane).forEach((link, index) => {
      link.onclick = (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
        event.preventDefault();
        openQuicklook(index < shots.length ? shots[index] : videos[index - shots.length]);
      };
    });
  }

  series = undefined;
  openTab('eps');
  // номер в хронологии
  async function drawBadge() {
    const list = await chronology(a).catch(() => []);
    if (!isCurrent()) return;
    onChronology(list.length > 1);
    const pos = chronoPosition(list, a, store.get('chronoMode', 'seasons_movies'));
    const b = $('#chronoBadge');
    if (!b) return;
    b.hidden = !pos;
    if (!pos) return;
    const word = pos.mode === 'seasons' ? 'Сезон' : 'Часть';
    b.innerHTML = `<b>${pos.n}</b><span>из ${pos.total}</span>`;
    b.setAttribute('aria-label', `${word} ${pos.n} из ${pos.total}. Открыть хронологию`);
    b.onclick = () => { openTab('chrono'); $('#tTabs').scrollIntoView({ behavior: 'smooth', block: 'start' }); };
  }
  drawBadge();
  seriesByMal(id).then((s) => { series = s; eps = s ? sortEpisodes(s.episodes) : []; })
    .catch((e) => { console.warn('[yoru] Anime365', e); series = null; })
    .finally(() => {
      if (!isCurrent()) return;
      if (series?.url) {
        try {
          const url = new URL(series.url, state.site);
          if (url.origin === new URL(state.site).origin && url.pathname.startsWith('/catalog/')) onAnime365Url(url.href);
        } catch { /* Keep the Anime365 search link when there is no direct URL. */ }
      }
      drawActions();
      drawEps();
    });

  const onRates = () => { drawRate(a); drawActions(); if (tab === 'eps') drawEps(); };
  window.addEventListener('yoru:rates', onRates);
  const tl = $('.t-logo');
  if (tl) tl.addEventListener('error', () => { const h = $('.t-name'); if (h) { h.className = 't-name'; h.textContent = a.title; } }, { once: true });
  state.cleanup = () => window.removeEventListener('yoru:rates', onRates);
  return {
    openTab,
    refreshChronology() {
      if (!isCurrent()) return;
      drawChrono();
      drawBadge();
    },
  };
}

/* ---------- блок «мой список» ---------- */
// Подписи оценок как на Shikimori
const SCORE_LABEL = { 10: 'Шедевр', 9: 'Великолепно', 8: 'Отлично', 7: 'Хорошо', 6: 'Неплохо', 5: 'Нормально', 4: 'Слабо', 3: 'Плохо', 2: 'Ужасно', 1: 'Хуже некуда' };
const chev = '<svg class="dd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';

function listStatusIcon(status) {
  if (!LIST_STATUS.some(([key]) => key === status)) return '';
  return `<svg class="st-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="/list-status-icons.svg#${status}"/></svg>`;
}

function drawRate(a) {
  const box = $('#rateBox'); if (!box) return;
  if (loggedIn() && !canEdit()) {
    const r = rateOf(a.id);
    box.innerHTML = r ? `<div class="rate"><span class="dd dd-static st-${r.status}">${listStatusIcon(r.status)}<span>${esc((LIST_STATUS.find((x) => x[0] === r.status) || [])[1] || '')}</span></span>
      <span class="dd dd-static"><span><b>${r.episodes}</b> из ${a.episodes || a.aired || '?'}</span></span>${r.score ? `<span class="dd dd-static dd-score has">${ICON.star}<span><b class="${scoreClass(r.score)}">${r.score}</b> ${SCORE_LABEL[r.score]}</span></span>` : ''}</div>` : '';
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
      ${r ? listStatusIcon(r.status) : ICON.plus}<span>${esc(label)}</span>${chev}</button>
    ${r ? `<div class="stepper" role="group" aria-label="Просмотрено серий">
      <button type="button" data-ep="-1" aria-label="Минус серия" ${r.episodes <= 0 ? 'disabled' : ''}>${ICON.minus}</button>
      <span><b>${r.episodes}</b> из ${total || '?'}</span>
      <button type="button" data-ep="1" aria-label="Плюс серия" ${total && r.episodes >= total ? 'disabled' : ''}>${ICON.plus}</button></div>
    <button class="dd dd-score${r.score ? ' has' : ''}" type="button" id="rScore" aria-label="Моя оценка: ${r.score || 'нет'}">
      ${ICON.star}<span>${r.score ? `<b class="${scoreClass(r.score)}">${r.score}</b> ${SCORE_LABEL[r.score]}` : 'Оценить'}</span>${chev}</button>` : ''}
  </div>`;

  const run = async (patch, done) => {
    box.querySelectorAll('button').forEach((x) => { x.disabled = true; });
    try { await saveRate(a, patch); if (done) toast(done); }
    catch (e) { toast(e.message); drawRate(a); }
  };

  bindDropdown($('#rStatus'), () => ({
    className: 'pop-status',
    html: LIST_STATUS.map(([v, l]) => `<button class="pop-item st-${v}" type="button" role="option" data-v="${v}" aria-selected="${!!r && r.status === v}">
        ${listStatusIcon(v)}<span>${l}</span>${r && r.status === v ? ICON.check : ''}</button>`).join('')
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
    html: `<div class="score-grid">${[10, 9, 8, 7, 6, 5, 4, 3, 2, 1].map((n) => `<button class="score-chip ${scoreClass(n)}" type="button" role="option" data-v="${n}" aria-selected="${r.score === n}" aria-label="${n}, ${SCORE_LABEL[n]}" data-label="${SCORE_LABEL[n]}">${n}</button>`).join('')}</div>
      <div class="score-foot"><span class="score-hint">${r.score ? `Сейчас: ${r.score}, ${SCORE_LABEL[r.score].toLowerCase()}` : 'Наведите на оценку'}</span>
      ${r.score ? '<button class="pop-link" type="button" data-v="0">Убрать оценку</button>' : ''}</div>`,
    onPick(v) { if (+v !== r.score) run({ score: +v }, +v ? `Оценка ${v}: ${SCORE_LABEL[v].toLowerCase()}` : 'Оценка убрана'); },
  }));
}
// подсказка с названием оценки при наведении и фокусе
document.addEventListener('pointerover', (e) => { const c = e.target.closest && e.target.closest('.score-chip'); if (c) { const h = document.querySelector('.score-hint'); if (h) h.textContent = `${c.dataset.v}, ${c.dataset.label.toLowerCase()}`; } });
document.addEventListener('focusin', (e) => { const c = e.target.closest && e.target.closest('.score-chip'); if (c) { const h = document.querySelector('.score-hint'); if (h) h.textContent = `${c.dataset.v}, ${c.dataset.label.toLowerCase()}`; } });
export { epWord };
