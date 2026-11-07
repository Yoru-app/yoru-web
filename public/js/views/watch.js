// Просмотр серии: Anime365 видео + отметка на Shikimori.
import { $, $$, esc, store, state, view, toast, loadingBlock, absUrl, fmtTime, ApiError, imgSrc } from '../core.js';
import { getAnime, rateOf, markWatched, loggedIn, canEdit } from '../shiki.js';

// Как грузится видео, решает администратор для каждого пользователя:
// 'direct' — только напрямую с CDN, 'fallback' — напрямую, а при ошибке через сервер, 'proxy' — всегда через сервер
export const videoLevel = () => (state.me && state.me.video) || 'direct';
import { seriesByMal, getEpisode365, getEmbed, sortEpisodes, epLabel, epNum, lib, token, normAuthor, isTrailer } from '../api365.js';
import { makePlayer, KIND, kindOf, trMeta, assToVtt } from '../player.js';
import { logoOf } from '../art.js';
import { authorGroup, translationLabel } from '../translation-names.js';

// #cont-ID-N: открыть первую серию после N-й (N — сколько просмотрено)
export async function renderCont(aid, n) {
  const host = view();
  host.innerHTML = loadingBlock();
  const s = await seriesByMal(aid);
  const route = window.yoruRoute();
  if (view() !== host || route.name !== 'cont' || route.aid !== aid || route.n !== n) return;
  if (!s) { toast('Этого тайтла нет на Anime365'); location.replace(`#anime-${aid}`); return; }
  const eps = sortEpisodes(s.episodes);
  if (!eps.length) { toast('На Anime365 ещё нет серий'); location.replace(`#anime-${aid}`); return; }
  const target = eps.find((e) => epNum(e) > n) || eps[eps.length - 1];
  location.replace(`#watch-${aid}-${target.id}`);
}

export async function renderWatch(aid, eid, host, paint, layout) {
  const isCurrent = () => view() === host && window.yoruRoute().aid === aid && window.yoruRoute().eid === eid;
  // что смотрели на других устройствах (позиции и озвучка) — параллельно с загрузкой серии
  const pulledTitle = lib.pullTitle(aid);
  const [anime, s, ep] = await Promise.all([getAnime(aid), seriesByMal(aid), getEpisode365(eid)]);
  if (!isCurrent()) return;
  if (!s) throw new ApiError(404, 'Этого тайтла нет на Anime365, видео недоступно.');
  document.title = `${epLabel(ep)}, ${anime.title} — Yoru`;
  const eps = sortEpisodes(s.episodes);
  const idx = eps.findIndex((e) => e.id === eid);
  const prev = idx > 0 ? eps[idx - 1] : null, next = idx >= 0 && idx < eps.length - 1 ? eps[idx + 1] : null;
  const showUnnamed = store.get('showUnnamedTranslations', false) === true;
  const trs = (ep.translations || []).filter((t) => t.isActive !== 0 && t.isActive !== '0' && (showUnnamed || authorGroup(t.authorsSummary)));
  const groups = { voice: [], sub: [], raw: [] };
  trs.forEach((t) => groups[kindOf(t)].push(t));
  Object.values(groups).forEach((g) => g.sort((a, b) => (a.typeLang === 'ru' ? -1 : 0) - (b.typeLang === 'ru' ? -1 : 0) || (b.height || 0) - (a.height || 0)));

  // Перевод: выбранный в ленте → с которым уже смотрели эту серию → последний для этого тайтла (с любого устройства)
  // → ваш приоритетный → по типу и языку
  await Promise.race([pulledTitle, new Promise((r) => setTimeout(r, 1200))]);
  if (!isCurrent()) return;
  const pref = lib.trPref(aid);
  const epTr = (lib.progress()[eid] || {}).tr;
  const sameAuthor = (t) => pref && normAuthor(pref.author) && normAuthor(t.authorsSummary) === normAuthor(pref.author);
  let cur = (state.pendingTr && trs.find((t) => t.id === state.pendingTr))
    || (epTr && trs.find((t) => t.id === epTr))
    || (pref && (trs.find((t) => kindOf(t) === pref.kind && sameAuthor(t)) || trs.find(sameAuthor)))
    || lib.pickTr(trs);
  state.pendingTr = null;
  lib.setCurTr(eid, cur);
  let kind = cur ? kindOf(cur) : 'voice';
  const siteUrl = (translation) => {
    const target = new URL(state.site);
    // API может прислать абсолютный URL другого зеркала. Оставляем выбранный
    // администратором домен и переносим только путь страницы, параметры и якорь.
    for (const candidate of [translation?.url, ep.url, s.url]) {
      if (!candidate) continue;
      try {
        const page = new URL(candidate, target);
        if (!['http:', 'https:'].includes(page.protocol)) continue;
        target.pathname = page.pathname;
        target.search = page.search;
        target.hash = page.hash;
        return target.href;
      } catch { /* пробуем страницу серии или тайтла */ }
    }
    return target.href;
  };
  const watchedN = () => (rateOf(aid) ? rateOf(aid).episodes : 0);

  const rendered = await paint({
    anime, episode: ep, prev, next, groups, kind,
    kinds: Object.keys(groups).filter((key) => groups[key].length),
    episodes: eps.map((episode) => ({
      episode,
      percent: lib.pct(episode.id),
      seen: !!(watchedN() && epNum(episode) && epNum(episode) <= watchedN()),
    })),
  });
  if (!rendered || !isCurrent()) return;
  const curSide = $('.side-ep[aria-current="true"]');
  if (curSide) curSide.parentElement.scrollTop = curSide.offsetTop - 120;
  lib.pushHistory(anime, ep);
  // позиция с других устройств — подтягиваем, пока грузится видео
  const pulled = lib.pullEpisode(eid);

  let lastSave = 0, playSeq = 0, marked = false, learned = false;
  // досмотренная серия засчитывается переводу: так Yoru узнаёт ваши любимые озвучки
  const learnOnce = () => { if (!learned && cur) { learned = true; lib.learnTr(cur, 1); } };
  // Серия досмотрена (85%) — отмечаем на Shikimori
  async function autoMark() {
    if (marked || !store.get('autoMark', true) || !canEdit() || !epNum(ep) || isTrailer(ep)) return;
    marked = true;
    try {
      const res = await markWatched(anime, epNum(ep));
      if (res) toast(res.entry.status === 'completed' ? 'Тайтл отмечен просмотренным на Shikimori' : `Shikimori: просмотрено ${res.entry.episodes} из ${anime.episodes || '?'}`, { label: 'Отменить', run: () => res.undo().then(() => toast('Отметка отменена')).catch((e) => toast(e.message)) });
    } catch (e) { toast('Не удалось отметить на Shikimori: ' + e.message); }
  }
  // переход к следующей серии из плеера запускает её сразу, даже если автозапуск выключен
  const goNext = () => { if (next) { state.forcePlay = true; location.hash = `watch-${aid}-${next.id}`; } };
  const player = makePlayer($('#vp'), {
    layout,
    groups: () => groups,
    cur: () => cur,
    pickTr: (t) => select(t),
    next: goNext,
    fallbackMp4: (height) => `/fwd?u=${encodeURIComponent(`${state.site}/translations/mp4/${cur.id}?format=mp4&height=${height}`)}`,
    profileUrl: `${state.site}/users/profile`,
    direct: () => videoLevel() !== 'proxy',
    allowProxy: () => videoLevel() !== 'direct',
    onProgress(t, d) {
      if (Date.now() - lastSave > 5000 && d && t > 3) { lastSave = Date.now(); lib.saveProgress(eid, t, d); }
      if (d > 60 && t / d >= 0.85) { autoMark(); learnOnce(); }
    },
    onEnded() {
      const v = player.video;
      if (v.duration) lib.saveProgress(eid, v.duration, v.duration);
      autoMark(); learnOnce();
      if (next) player.upNext(epLabel(next), store.get('autoNext', true));
    },
    onFatal(reason) {
      const me = state.me || {};
      const capHit = me.video !== 'direct' && me.dailyCapMB > 0 && me.trafficToday >= me.dailyCapMB * 1048576;
      const hint = me.video === 'direct'
        ? ' Видео идёт напрямую с CDN Anime365 — попробуйте другой канал в меню плеера. Если CDN недоступен у вас постоянно, попросите администратора Yoru разрешить запасной путь через сервер.'
        : capHit ? ' Дневной лимит видео через сервер исчерпан — завтра он обнулится.' : ' Попробуйте другой перевод или откройте серию на Anime365.';
      player.showMsg(`<h3>Видео не воспроизводится</h3><p>${esc(reason)}${esc(hint)}</p>
        <div class="actions"><button class="btn primary small" data-retry>Повторить</button>
        <a class="btn ghost small" href="${esc(siteUrl(cur))}" target="_blank" rel="noopener">Открыть на Anime365</a></div>`);
    },
  });
  player.setNext(!!next);
  player.setTitle(anime.title, epLabel(ep));
  logoOf(aid).then((url) => { if (url && isCurrent()) player.setLogo(imgSrc(url), anime.title); });

  const onKey = (e) => {
    if (e.target.closest('input,select,textarea')) return;
    if (e.shiftKey && e.code === 'KeyN' && next) { location.hash = `watch-${aid}-${next.id}`; return; }
    if (e.shiftKey && e.code === 'KeyP' && prev) { location.hash = `watch-${aid}-${prev.id}`; return; }
    if (e.target.closest('a,button') && (e.code === 'Space' || e.code === 'Enter') && !e.target.closest('.vp')) return;
    if (player.key(e)) e.preventDefault();
  };
  document.addEventListener('keydown', onKey);
  state.cleanup = () => {
    const v = player.video;
    if (v.duration && v.currentTime > 5) lib.saveProgress(eid, v.currentTime, v.duration);
    player.destroy();
    document.removeEventListener('keydown', onKey);
  };

  function drawTrs() {
    const list = $('#trList'); if (!list) return;
    const labels = {
      ru: 'Русская', en: 'Английская', ja: 'Японская', uk: 'Украинская',
      be: 'Белорусская', de: 'Немецкая', fr: 'Французская', es: 'Испанская',
      it: 'Итальянская', pt: 'Португальская', pl: 'Польская', zh: 'Китайская',
      ko: 'Корейская', tr: 'Турецкая', ar: 'Арабская', kk: 'Казахская',
    };
    const byLanguage = new Map();
    for (const translation of groups[kind] || []) {
      const language = String(translation.typeLang || '').trim().toLowerCase().replace('_', '-').split('-')[0];
      if (!byLanguage.has(language)) byLanguage.set(language, []);
      byLanguage.get(language).push(translation);
    }
    const priority = ['ru', 'en', 'ja', 'uk'];
    const languageOrder = (language) => {
      const index = priority.indexOf(language);
      return index < 0 ? priority.length : index;
    };
    const sections = [...byLanguage].sort(([a], [b]) => languageOrder(a) - languageOrder(b) || a.localeCompare(b));
    list.innerHTML = sections.map(([language, translations]) => {
      const label = labels[language] || (language ? `Другой язык (${language})` : 'Язык не указан');
      return `<section class="tr-language" aria-label="${esc(label)}">
        <h3 class="tr-language-title">${esc(label)}<small>${translations.length}</small></h3>
        <div class="tr-language-items">${translations.map((t) => `<button class="tr" type="button" data-id="${t.id}" aria-pressed="${cur && t.id === cur.id}">
          <span>${esc(translationLabel(t.authorsSummary))}</span><em>${esc(trMeta(t))}</em></button>`).join('')}</div>
      </section>`;
    }).join('');
    $$('.tr', list).forEach((b) => b.onclick = () => select(trs.find((t) => t.id === +b.dataset.id)));
  }
  function select(t) {
    if (!t || (cur && t.id === cur.id)) return;
    cur = t; kind = kindOf(t);
    lib.setCurTr(eid, cur);
    lib.setTrPref(aid, cur);
    lib.learnTr(cur, 0.5);
    $$('#kinds button').forEach((x) => x.setAttribute('aria-pressed', x.dataset.kind === kind));
    drawTrs();
    const v = player.video;
    play(v.currentTime > 3 ? v.currentTime : 0, !v.paused || v.currentTime > 3);
    player.flash(`${KIND[kind]}: ${translationLabel(t.authorsSummary)}`);
  }
  $$('#kinds button').forEach((b) => b.onclick = () => {
    if (b.dataset.kind === kind) return;
    const g = groups[b.dataset.kind];
    select(lib.pickTr(g));
  });
  drawTrs();

  async function play(startAt, autoplay) {
    const my = ++playSeq;
    player.stop();
    if (!cur) {
      player.setTrName('Нет перевода');
      return player.showMsg('<h3>Переводов пока нет</h3><p>Для этой серии на Anime365 ещё не добавили ни озвучки, ни субтитров. Загляните позже или выберите другую серию.</p>');
    }
    player.setTrName(translationLabel(cur.authorsSummary));
    player.setTitle(anime.title, `${epLabel(ep)}, ${KIND[kindOf(cur)].toLowerCase()} ${translationLabel(cur.authorsSummary)}`.trim());
    if (state.mode === 'demo') {
      return player.showMsg('<h3>Демо-режим</h3><p>Здесь будет видео выбранного перевода. Чтобы смотреть по-настоящему, запустите <b>node server.js</b> и откройте адрес, который он покажет.</p>');
    }
    player.loading();
    let embed;
    try { embed = await getEmbed(cur.id); }
    catch (e) {
      if (my !== playSeq) return;
      return player.showMsg(embedErrorHTML(e, siteUrl(cur)));
    }
    if (my !== playSeq) return;
    let streams = (embed.stream || []).filter((x) => x.urls && x.urls.length);
    if (!streams.length) streams = (embed.download || []).filter((d) => d.url).map((d) => ({ height: d.height, urls: [d.url] }));
    if (!streams.length) {
      return player.showMsg(`<h3>Видео недоступно</h3><p>Anime365 не вернул ни одного потока для этого перевода. Выберите другой перевод.</p>
        <div class="actions"><a class="btn ghost small" href="${esc(siteUrl(cur))}" target="_blank" rel="noopener">Открыть на Anime365</a></div>`);
    }
    if (!startAt) {
      await Promise.race([pulled, new Promise((r) => setTimeout(r, 1500))]);
      if (my !== playSeq) return;
      const saved = lib.progress()[eid];
      if (saved && saved.t > 10 && saved.d && saved.t < saved.d - 40) { startAt = saved.t; player.flash(`Продолжаем с ${fmtTime(saved.t)}`); }
    }
    player.load(streams, startAt, autoplay !== false);
    if (embed.subtitlesUrl || embed.subtitlesVttUrl) {
      try {
        const u = absUrl(embed.subtitlesVttUrl || embed.subtitlesUrl);
        const r = await fetch('/fwd?u=' + encodeURIComponent(u) + '');
        let text = r.ok ? await r.text() : '';
        if (my !== playSeq) return;
        if (text && !/^WEBVTT/.test(text.trim())) text = assToVtt(text);
        player.setSubs(text || null);
      } catch { player.setSubs(null); }
    }
  }
  $('#vp').addEventListener('click', (e) => { if (e.target.closest('[data-retry]')) play(player.video.currentTime, true); });
  const autoStart = state.forcePlay || store.get('autoplay', false);
  state.forcePlay = false;
  play(0, autoStart);
}

function embedErrorHTML(e, siteLink) {
  const msg = String((e && e.message) || '');
  const auth = e && (e.code === 401 || e.code === 403 || /login|авториз|войд/i.test(msg));
  const sub = /subscri|подпис|premium/i.test(msg);
  const hasTok = token();
  let title, text;
  if (sub) {
    title = 'Нужна подписка Anime365';
    text = 'Сайт отдаёт видео только подписчикам. Токен принят, но у аккаунта, похоже, нет активной подписки.';
  } else if (auth && !hasTok) {
    title = 'Добавьте токен API';
    text = 'Ссылки на видео Anime365 отдаёт только авторизованным клиентам. Вставьте токен в настройках.';
  } else if (auth) {
    title = 'Anime365 не принял токен';
    text = 'Проверьте токен в настройках: он мог устареть или скопироваться не полностью. Видео также доступно только аккаунтам с подпиской.';
  } else {
    title = 'Не удалось получить видео';
    text = 'Сервер Anime365 ответил ошибкой.';
  }
  return `<h3>${title}</h3><p>${esc(text)}</p>${msg ? `<p class="vp-err">Ответ API: ${esc(msg)}${e.code ? ` (${e.code})` : ''}</p>` : ''}
    <div class="actions">${auth || sub ? '<button class="btn primary small" data-open-settings>Настройки токена</button>' : '<button class="btn primary small" data-retry>Повторить</button>'}
    <a class="btn ghost small" href="${esc(siteLink)}" target="_blank" rel="noopener">Открыть на Anime365</a></div>`;
}
