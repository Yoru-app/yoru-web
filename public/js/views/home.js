// Главная: хиро (онгоинги / новые серии из списка / досмотреть) и ряды, которые включаются в настройках.
import { $, $$, esc, store, state, view, untilText, ICON, toast, relTime, parseDate, imgSrc } from '../core.js';
import { listAnimes, getAnime, loadRates, rates, loggedIn, canEdit, hydratePosters, recommendations, KIND, saveRate, rateOf, listLabel, getAnimesByIds } from '../shiki.js';
import { loadBanners, bannerOf, posterHTML, bannerHTML, logosFor, logoCached } from '../art.js';
import { freshTranslations, lib } from '../api365.js';
import { FITS, ALIGNS, watchFit, pendingAttr, bannerLook } from '../fitart.js';
import { animeCard, wideCard, section, row, statusLine } from '../components.js';
import { animeFacts, nextEpisodeFact } from '../anime-facts.js';
import { mountRowArrows } from '../hscroll.js';
import { animateMotion, reducedMotion } from '../interface-motion.js';

const RECENT_RELEASE_DAYS = 90;
const DISCOVERY_ROWS = [
  ['missedTv', 'Могли пропустить: Сериалы', 'tv', true],
  ['missedMovies', 'Могли пропустить: Фильмы', 'movie', true],
  ['catchUpTv', 'Наверстать Сериалы', 'tv', false],
  ['catchUpMovies', 'Наверстать Фильмы', 'movie', false],
];

export const HOME_ROWS = [
  ['continue', 'Продолжить просмотр'],
  ['newEps', 'Новые серии в моём списке'],
  ['ongoing', 'Сейчас на экранах'],
  ['recs', 'Рекомендации для вас'],
  ['fresh', 'Свежие переводы на Anime365'],
  ['anons', 'Скоро выйдут'],
  ...DISCOVERY_ROWS.map(([key, title]) => [key, title]),
];
export const HERO_SOURCES = [
  ['ongoing', 'Сейчас на экранах', 'Популярные онгоинги сезона с Shikimori'],
  ['continue', 'Продолжить просмотр', 'Последние тайтлы из вашей истории просмотра'],
  ['newEps', 'Новые серии в моём списке', 'Непросмотренные серии из «Смотрю». Нужен Shikimori'],
  ['recs', 'Рекомендации для вас', 'Рекомендации по вашему списку. Нужен Shikimori'],
  ['fresh', 'Свежие переводы на Anime365', 'Последние добавленные переводы и серии'],
  ['anons', 'Скоро выйдут', 'Популярные анонсы с Shikimori'],
  ...DISCOVERY_ROWS.map(([key, title, , recent]) => [key, title, recent
    ? `Релизы за последние ${RECENT_RELEASE_DAYS} дней, которых нет в вашем списке`
    : 'Вышедшие тайтлы с высоким рейтингом, которых нет в вашем списке']),
];
// Какой ряд повторяет большой блок: при таком источнике хиро ряд не показываем
export const HERO_DUP = Object.fromEntries(HERO_SOURCES.map(([key]) => [key, key]));
export function homePrefs() {
  const p = store.get('home', {});
  const keys = HOME_ROWS.map(([key]) => key);
  const savedOrder = Array.isArray(p.order) ? p.order : [];
  const order = [...new Set([...savedOrder.filter((key) => keys.includes(key)), ...keys])];
  const rows = {}; HOME_ROWS.forEach(([k]) => { rows[k] = !(p.rows && p.rows[k] === false); });
  const hero = HERO_SOURCES.some(([key]) => key === p.hero) ? p.hero : 'ongoing';
  return { hero, heroOn: p.heroOn !== false, rows, order };
}
export const orderedHomeRows = (prefs) => prefs.order.map((key) => HOME_ROWS.find(([id]) => id === key));
export function moveHomeRow(key, direction) {
  const order = homePrefs().order;
  const index = order.indexOf(key);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= order.length) return;
  [order[index], order[next]] = [order[next], order[index]];
  store.set('home', { ...store.get('home', {}), order });
}
// Какой ряд дублирует большой блок (если блок включён)
export const dupRow = (prefs) => (prefs.heroOn ? HERO_DUP[prefs.hero] : null);
// Как показывать ряды: прокрутка вбок / по ширине экрана со страницей ряда / по ширине с кнопкой «Развернуть»
export const ROW_MODES = [
  ['scroll', 'Прокрутка вбок', 'Ряд листается горизонтально'],
  ['page', 'По ширине экрана', 'Сколько помещается; нажатие на название ряда открывает все тайтлы'],
  ['expand', 'По ширине с кнопкой «Развернуть»', 'Сколько помещается; кнопка раскрывает ряд на несколько строк'],
];
export const rowMode = () => { const m = store.get('rowsMode', 'scroll'); return ROW_MODES.some(([k]) => k === m) ? m : 'scroll'; };
const ARROW = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';
const CHEV_D = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
// Кнопка «Развернуть» нужна, только если в ряд не всё поместилось
function syncExpand(box) {
  const btn = $('.row-expand', box), r = $('.row', box);
  if (!btn || !r) return;
  const sec = $('.section', box);
  const cols = getComputedStyle(r).gridTemplateColumns.split(' ').filter(Boolean).length || 1;
  btn.hidden = r.children.length <= cols;
}
let expandT = 0;
addEventListener('resize', () => { clearTimeout(expandT); expandT = setTimeout(() => $$('#homeRows [data-row]').forEach(syncExpand), 150); });

export function setRowVisible(k, on) {
  const p = store.get('home', {});
  p.rows = { ...(p.rows || {}), [k]: on };
  store.set('home', p);
}
const EYE_OFF = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.1A9.8 9.8 0 0 1 12 5c5.5 0 9 5.5 9.5 7a13 13 0 0 1-2.6 3.6M6.6 6.6C4.4 8 3 10.2 2.5 12c.5 1.5 4 7 9.5 7 1.7 0 3.2-.5 4.5-1.2"/><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2"/></svg>';

const alive = () => (window.yoruRoute && window.yoruRoute().name === 'home');

/* ---------- вид большого блока: растянуть или размыть края, логотип вместо названия ---------- */
export const HERO_FITS = FITS;
export const HERO_ALIGNS = ALIGNS;
export const heroLook = () => ({
  ...bannerLook(),
  logo: !!store.get('heroLogo', true) && !!(state.me && state.me.tmdb),
});
let unwatchHero = () => {};
function layoutHero() {
  unwatchHero();
  const media = $('#hero .hero-media:not(.hero-media-outgoing)');
  unwatchHero = watchFit(media, media && media.querySelector('img.hero-bn:not(.blur)'), heroLook);
}

/* ---------- данные ---------- */
// «Новые серии» — только у выходящих тайтлов: у вышедших всё давно доступно
const hasNew = (r) => r.anime.status === 'ongoing' && r.anime.aired > r.episodes;
const newText = (r) => (r.anime.aired - r.episodes === 1 ? `Вышла ${r.anime.aired}-я серия` : `Новых серий: ${r.anime.aired - r.episodes}, последняя ${r.anime.aired}-я`);
async function watchingWithNew() {
  await loadRates();
  const list = (rates.list || []).filter((r) => r.status === 'watching' || r.status === 'rewatching');
  await hydratePosters(list);
  return list;
}

async function heroItems(source) {
  const items = await heroSourceItems(source);
  if (items.length || source === 'ongoing') { items.src = source; return items; }
  const fallback = await heroSourceItems('ongoing');
  fallback.src = 'ongoing';
  return fallback;
}

async function heroSourceItems(source) {
  const item = (anime, kicker, options = {}) => {
    const rate = rateOf(anime.id);
    return {
      anime, kicker,
      href: `#cont-${anime.id}-${rate ? rate.episodes : 0}`,
      cta: rate && rate.episodes ? `Продолжить с ${rate.episodes + 1}-й серии` : 'Смотреть',
      ...options,
    };
  };
  const discovery = DISCOVERY_ROWS.find(([key]) => key === source);
  if (discovery) {
    const [, title, kind, recent] = discovery;
    return (await discoveryAnimes(kind, 8, recent)).map((anime) => item(anime, title));
  }
  if (source === 'continue') {
    const history = lib.continueHistory().slice(0, 8);
    const animes = await getAnimesByIds(history.map((entry) => entry.aid));
    const byId = new Map(animes.map((anime) => [anime.id, anime]));
    return history.map((entry) => item(byId.get(entry.aid) || entry.anime,
      `Продолжить просмотр · ${entry.ep || 'Начатая серия'}`,
      { href: `#watch-${entry.aid}-${entry.eid}`, cta: 'Продолжить просмотр' }));
  }
  if (source === 'newEps' && (loggedIn() || store.get('shikiNick', ''))) {
    const list = await watchingWithNew().catch(() => []);
    const pick = list.filter(hasNew).sort((a, b) => (parseDate(b.anime.next) || 0) - (parseDate(a.anime.next) || 0) || String(b.updated).localeCompare(String(a.updated)));
    return pick.slice(0, 8).map((r) => ({
      anime: r.anime,
      kicker: newText(r),
      href: `#cont-${r.anime.id}-${r.episodes}`,
      cta: `Смотреть ${r.episodes + 1}-ю серию`,
    }));
  }
  if (source === 'newEps') return [];
  if (source === 'recs') {
    if (!loggedIn() && !store.get('shikiNick', '')) return [];
    const list = await recommendations();
    return list.slice(0, 8).map((entry) => item(entry.anime,
      entry.because[0] ? `Похоже на «${entry.because[0]}»` : 'Рекомендации для вас'));
  }
  if (source === 'fresh') {
    const translations = await freshTranslations();
    const animes = await getAnimesByIds(translations.map((entry) => entry.mal));
    const byId = new Map(animes.map((anime) => [anime.id, anime]));
    const used = new Set();
    return translations.filter((entry) => {
      if (!byId.has(+entry.mal) || used.has(+entry.mal)) return false;
      used.add(+entry.mal);
      return true;
    }).slice(0, 8).map((entry) => item(byId.get(+entry.mal),
      ['Свежий перевод', entry.tr.authorsSummary].filter(Boolean).join(' · '),
      { href: entry.tr.episodeId ? `#watch-${entry.mal}-${entry.tr.episodeId}` : `#anime-${entry.mal}`, tr: entry.tr.id }));
  }
  const list = await listAnimes({ status: source === 'anons' ? 'anons' : 'ongoing', order: 'popularity', limit: 8 });
  return list.map((anime) => source === 'anons'
    ? item(anime, 'Скоро выйдут', { href: `#anime-${anime.id}`, cta: 'Подробнее' })
    : item(anime, 'Сейчас на экранах'));
}

/* ---------- хиро ---------- */
// Название целиком: уменьшаем шрифт, пока текст не влезет в отведённую высоту блока
function heroTitle(a) {
  const logo = heroLook().logo ? logoCached(a.id) : null;
  if (!logo) return `<h1 class="hero-title"><span>${esc(a.title)}</span></h1>`;
  return `<h1 class="hero-title is-logo"><img class="hero-logo" src="${esc(imgSrc(logo))}" alt=""><span class="hero-name">${esc(a.title)}</span></h1>`;
}
function heroKickerHTML(kicker, a) {
  const next = kicker === 'Сейчас на экранах' ? nextEpisodeFact(a) : null;
  const label = `<span class="hero-kicker-label">${esc(kicker)}${next ? '.' : ''}</span>`;
  if (!next) return label;
  return `${label}<span class="hero-kicker-next">
    <svg viewBox="0 0 24 24" aria-hidden="true"><use href="/title-info-icons.svg#next"/></svg>
    ${next.episode}-я серия: ${esc(next.schedule)}
  </span>`;
}
function heroMetaHTML(a) {
  const english = a.name || a.english || '';
  const facts = animeFacts(a, { yearOnly: true });
  const byKey = new Map(facts.map((fact) => [fact.key, fact]));
  const values = ['kind', 'year', 'score'].map((key) => byKey.get(key)).filter(Boolean);
  const parts = [];
  if (english) parts.push(`<span class="hero-meta-title">${esc(english)}</span>`);
  for (const fact of values) {
    parts.push(`<span class="hero-meta-item hero-meta-${fact.key} ${fact.iconTone || ''} ${fact.tone || ''}" title="${esc(fact.label)}">
        <svg class="hero-meta-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="${fact.icon}"/></svg>
        <span class="sr">${esc(fact.label)}: </span>${esc(fact.value)}
      </span>`);
  }
  return parts.join('');
}
function fitTitle(el) {
  if (!el || el.classList.contains('is-logo')) return;
  el.style.fontSize = '';
  const inner = el.firstElementChild || el;
  let size = parseFloat(getComputedStyle(el).fontSize);
  const min = innerWidth < 760 ? 22 : 26;
  for (let guard = 0; guard < 40 && inner.scrollHeight > el.clientHeight + 1 && size > min; guard++) {
    size -= 2;
    el.style.fontSize = size + 'px';
  }
}
let fitT = 0;
addEventListener('resize', () => { clearTimeout(fitT); fitT = setTimeout(() => fitTitle(document.querySelector('#hero .hero-title')), 120); });
let heroList = [];
let heroIndex = -1;
function drawHero(i) {
  const el = $('#hero');
  if (!el || !heroList[i]) return;
  const entry = heroList[i];
  const { anime: a, details, kicker, href, cta } = entry;
  const b = bannerOf(a.id);
  const r = rateOf(a.id);
  const previous = heroIndex;
  heroIndex = i;
  el.classList.toggle('has-banner', !!b);
  const content = document.createElement('template');
  content.innerHTML = `
    <div class="hero-media">${b ? `<img class="hero-bn${pendingAttr(heroLook())}" src="/img?u=${encodeURIComponent(b)}" alt="">` : (a.posterBig || a.poster) ? `<img class="hero-bn blur" src="/img?u=${encodeURIComponent(a.posterBig || a.poster)}" alt="">` : ''}</div>
    <div class="hero-inner hero-swap">
      <div class="hero-text">
        <p class="hero-kicker">${heroKickerHTML(kicker, details || a)}</p>
        ${heroTitle(a)}
        <p class="hero-meta-line" id="heroMeta">${heroMetaHTML(details || a)}</p>
        <p class="hero-desc" id="heroDesc">${esc(details?.description || a.description || '')}</p>
        <div class="hero-actions">
          <a class="btn primary" href="${href}">${ICON.play}${esc(cta)}</a>
          <a class="btn ghost" href="#anime-${a.id}">Подробнее</a>
          ${loggedIn() ? (r ? `<a class="btn ghost" href="#anime-${a.id}">${esc(listLabel(r.status))}</a>` : canEdit() ? `<button class="btn ghost" type="button" id="heroPlan">${ICON.plus}Запланировать</button>` : '') : ''}
        </div>
      </div>
      ${b ? '' : `<a class="hero-poster" href="#anime-${a.id}" aria-label="${esc(a.title)}">${posterHTML(a, true)}</a>`}
    </div>
    ${heroList.length > 1 ? `<div class="hero-picker" role="group" aria-label="Другие тайтлы">${heroList.map((h, j) =>
      `<button class="hero-pick" type="button" aria-current="${j === i}" data-hero="${j}" title="${esc(h.anime.title)}">${bannerHTML(h.anime)}<span><b>${esc(h.anime.title)}</b></span></button>`).join('')}</div>` : ''}`;
  const picker = $('.hero-picker', el);
  if (picker) {
    // Меняем только большой баннер и текст. Лента сохраняет DOM, фокус и scrollLeft.
    const incoming = content.content.querySelector('.hero-inner');
    incoming.classList.remove('hero-swap');
    $('.hero-inner', el).replaceWith(incoming);
    if (i !== previous) {
      $('.hero-media-outgoing', el)?.remove();
      const outgoing = $('.hero-media', el);
      const media = content.content.querySelector('.hero-media');
      if (reducedMotion.matches) outgoing.replaceWith(media);
      else {
        outgoing.classList.add('hero-media-outgoing');
        outgoing.before(media);
        animateMotion(outgoing, [{ opacity: 1 }, { opacity: 0 }], 360, {
          fill: 'both', done: () => outgoing.remove(),
        });
        animateMotion(incoming, [
          { opacity: .25, translate: `${i > previous ? 16 : -16}px 0` },
          { opacity: 1, translate: '0 0' },
        ], 310);
      }
    }
    $$('[data-hero]', picker).forEach((button) => {
      button.setAttribute('aria-current', String(+button.dataset.hero === i));
    });
  } else {
    el.replaceChildren(content.content);
    $$('[data-hero]', el).forEach((button) => {
      button.onclick = () => {
        const index = +button.dataset.hero;
        if (index !== heroIndex) drawHero(index);
      };
    });
  }
  fitTitle($('.hero-title', el));
  layoutHero();
  const logo = $('.hero-logo', el);
  // логотип не загрузился — обычное большое название
  if (logo) logo.addEventListener('error', () => { const t = $('.hero-title', el); if (t) { t.outerHTML = `<h1 class="hero-title"><span>${esc(a.title)}</span></h1>`; fitTitle($('.hero-title', el)); } }, { once: true });
  const plan = $('#heroPlan');
  const watch = $('.hero-actions .btn.primary', el);
  if (watch && heroList[i].tr) watch.onclick = () => { state.pendingTr = heroList[i].tr; };
  if (plan) plan.onclick = async () => {
    plan.disabled = true;
    try { await saveRate(a, { status: 'planned' }); toast('Добавлено в «Запланировано»'); drawHero(i); }
    catch (e) { toast(e.message); plan.disabled = false; }
  };
  if (!details) getAnime(a.id).then((full) => {
    entry.details = full;
    if (!el.isConnected || heroIndex !== i || heroList[i] !== entry) return;
    $('.hero-kicker', el).innerHTML = heroKickerHTML(kicker, full);
    $('#heroMeta', el).innerHTML = heroMetaHTML(full);
    $('#heroDesc', el).textContent = full.description;
  }).catch(() => {});
}

async function discoveryAnimes(kind, count, recent) {
  const list = await loadRates();
  if (!list) return [];
  const inList = new Set(list.map(({ anime }) => anime.id));
  const matches = [];
  const seen = new Set();
  const limit = 50;
  const today = Date.parse(new Date().toISOString().slice(0, 10));
  const cutoff = today - RECENT_RELEASE_DAYS * 86400000;
  const releaseDate = (anime) => Date.parse(anime.releasedOn || anime.airedOn);
  for (let page = 1; page <= 12 && (recent || matches.length < count); page++) {
    const batch = await listAnimes({ kind, status: 'released', order: recent ? 'aired_on' : 'ranked', limit, page });
    const fresh = batch.filter(({ id }) => !seen.has(id));
    if (!fresh.length) break;
    for (const anime of fresh) {
      seen.add(anime.id);
      if (anime.kind !== kind || anime.status !== 'released' || inList.has(anime.id)) continue;
      if (recent) {
        const date = releaseDate(anime);
        if (!(date >= cutoff && date <= today)) continue;
      }
      matches.push(anime);
    }
    // Дата премьеры и дата завершения могут отличаться на несколько сезонов.
    if (batch.length < limit) break;
  }
  if (recent) matches.sort((a, b) => b.score - a.score || releaseDate(b) - releaseDate(a));
  return matches.slice(0, count);
}

/* ---------- ряды ---------- */
const ROWS = {
  ...Object.fromEntries(DISCOVERY_ROWS.map(([key, title, kind, recent]) => [key, async (_, full) => {
    const list = await discoveryAnimes(kind, full ? 50 : 20, recent);
    return list.length ? section(title, row(list.map((anime) => animeCard(anime, { meta: statusLine(anime) })))) : '';
  }])),
  async continue(hero, full) {
    const h = lib.continueHistory().slice(0, full ? 40 : 12);
    if (!h.length) return '';
    await loadBanners(h.map((x) => x.aid));
    return section('Продолжить просмотр', row(h.map((x) => {
      const p = lib.pct(x.eid);
      return wideCard(x.anime, { href: `#watch-${x.aid}-${x.eid}`, kicker: x.ep, sub: p ? `Просмотрено ${p}%` : relTime(new Date(x.at).toISOString()), progress: p, action: true });
    }), true), '<a class="section-link" href="#library/history">История</a>');
  },
  async newEps(hero, full) {
    if (!loggedIn() && !store.get('shikiNick', '')) return '';
    const list = (await watchingWithNew()).filter(hasNew);
    if (!list.length) return '';
    await loadBanners(list.map((r) => r.anime.id));
    return section('Новые серии в моём списке', row(list.slice(0, full ? 60 : 16).map((r) => wideCard(r.anime, {
      href: `#cont-${r.anime.id}-${r.episodes}`,
      kicker: newText(r),
      sub: `Вы посмотрели ${r.episodes} из ${r.anime.episodes || '?'}`,
      action: true,
    })), true), '<a class="section-link" href="#library/watching">Весь список</a>', 'newEpisodesRow');
  },
  async ongoing(hero, full) {
    const shown = hero && hero.src === 'ongoing' ? new Set(hero.map((x) => x.anime.id)) : new Set();
    const list = (await listAnimes({ status: 'ongoing', order: 'popularity', limit: full ? 50 : 24 })).filter((a) => !shown.has(a.id));
    return section('Сейчас на экранах', row(list.map((a) => animeCard(a, { meta: a.next ? `${a.aired + 1}-я ${untilText(a.next)}` : statusLine(a) }))),
      '<a class="section-link" href="#schedule">Расписание</a>');
  },
  async recs(hero, full) {
    if (!loggedIn() && !store.get('shikiNick', '')) return '';
    const list = await recommendations();
    if (!list.length) return '';
    return section('Рекомендации для вас', row(list.slice(0, full ? 60 : 20).map((x) => animeCard(x.anime, { meta: x.because[0] ? `Похоже на «${x.because[0]}»` : '' }))));
  },
  async fresh() {
    const items = await freshTranslations();
    const animes = await getAnimesByIds(items.map((x) => x.mal));
    const by = new Map(animes.map((a) => [a.id, a]));
    const cards = items.filter((x) => by.has(+x.mal)).map((x) => {
      const ep = x.tr.episode || {};
      return animeCard(by.get(+x.mal), {
        badge: ep.episodeInt ? `Серия ${ep.episodeInt}` : 'Новое',
        meta: [x.tr.authorsSummary, relTime(x.tr.addedDateTime || x.tr.activeDateTime)].filter(Boolean).join(', '),
      });
    });
    return cards.length ? section('Свежие переводы на Anime365', row(cards)) : '';
  },
  async anons(hero, full) {
    const list = await listAnimes({ status: 'anons', order: 'popularity', limit: full ? 50 : 18 });
    return section('Скоро выйдут', row(list.map((a) => animeCard(a, { meta: [KIND[a.kind], a.airedOn ? String(a.airedOn).slice(0, 7).split('-').reverse().join('.') : a.year].filter(Boolean).join(', ') }))));
  },
};

// Vue владеет каркасом страницы, эти функции наполняют отдельные блоки.
export function mountHome(host, prefs, refresh) {
  let active = true;
  const rowCleanups = [];
  const isCurrent = () => active && alive() && view() === host;
  heroList = [];

  // хиро
  const heroP = prefs.heroOn ? heroItems(prefs.hero).catch(() => []) : Promise.resolve(null);
  if (prefs.heroOn) heroP.then(async (items) => {
    await Promise.all([loadBanners(items.map((x) => x.anime.id)), heroLook().logo ? logosFor(items.map((x) => x.anime.id)) : null]);
    if (!isCurrent()) return;
    heroList = items;
    if (items.length) drawHero(0); else $('#hero', host).hidden = true;
  }).catch((e) => {
    const hero = $('#hero', host);
    if (isCurrent() && hero) hero.innerHTML = `<div class="hero-inner"><div class="hero-text"><p class="hero-kicker">Не удалось загрузить</p><p class="hero-sub">${esc(e.message)}</p></div></div>`;
  });

  // ряды — независимо друг от друга
  for (const [k] of orderedHomeRows(prefs)) {
    if (!prefs.rows[k]) continue;
    // ряды, которые зависят от хиро, ждут его: дубль скрываем, из онгоингов убираем показанное наверху
    const needHero = dupRow(prefs) === k || k === 'ongoing';
    (needHero ? heroP : Promise.resolve(null)).then((hero) => {
      if (hero?.length && dupRow(prefs) === k && hero.src === prefs.hero) return '';
      return ROWS[k](hero);
    }).then((html) => {
      if (!isCurrent()) return;
      const box = $(`[data-row="${k}"]`, host); if (!box) return;
      box.innerHTML = html;
      // «скрыть ряд» прямо на главной; вернуть — из сообщения или в настройках
      const head = $('.section-head', box);
      const mode = rowMode();
      if (head && mode === 'page') {
        const t = $('.section-title', head);
        t.innerHTML = `<a class="section-open" href="#row-${k}">${t.innerHTML}${ARROW}</a>`;
      }
      if (head && mode === 'expand') {
        $('.section-title', head).insertAdjacentHTML('afterend', `<button class="row-expand" type="button" hidden><span>Развернуть</span>${CHEV_D}</button>`);
        const btn = $('.row-expand', head), sec = $('.section', box);
        btn.onclick = () => {
          const open = sec.classList.toggle('is-open');
          btn.querySelector('span').textContent = open ? 'Свернуть' : 'Развернуть';
          btn.classList.toggle('open', open);
          if (!open) sec.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
        };
        requestAnimationFrame(() => syncExpand(box));
      }
      if (head) {
        const title = HOME_ROWS.find((x) => x[0] === k)[1];
        head.insertAdjacentHTML('beforeend', `<button class="row-hide" type="button" title="Скрыть ряд" aria-label="Скрыть ряд «${esc(title)}»">${EYE_OFF}</button>`);
        const scroller = $('.row', box);
        if (mode === 'scroll' && scroller) rowCleanups.push(mountRowArrows(scroller, $('.row-hide', head)));
        $('.row-hide', head).onclick = () => {
          setRowVisible(k, false);
          refresh();
          toast(`Ряд «${title}» скрыт`, { label: 'Вернуть', run: () => { setRowVisible(k, true); if (alive() && view() === host) refresh(); } });
        };
      }
    }).catch((e) => {
      console.warn('[yoru] row', k, e);
      const box = isCurrent() && $(`[data-row="${k}"]`, host);
      if (box) box.innerHTML = k === 'continue' ? '' : section(HOME_ROWS.find((x) => x[0] === k)[1], `<p class="row-err">Не загрузилось: ${esc(e.message)}</p>`);
    });
  }
  const onRates = () => { if (isCurrent()) { const cur = $('.hero-pick[aria-current="true"]', host); drawHero(cur ? +cur.dataset.hero : 0); } };
  window.addEventListener('yoru:rates', onRates);
  const dispose = () => {
    active = false;
    rowCleanups.forEach((cleanup) => cleanup());
    window.removeEventListener('yoru:rates', onRates);
    unwatchHero();
  };
  return dispose;
}

/* ---------- страница одного ряда: #row-<ряд> ---------- */
export const loadHomeRow = (key) => ROWS[key](null, true);
