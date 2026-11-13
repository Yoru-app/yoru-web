// Карточки и мелкие компоненты интерфейса.
import { esc, ICON, store } from './core.js';
import { posterHTML, bannerHTML } from './art.js';
import { KIND, STATUS, rateOf, listLabel, metaLine } from './shiki.js';
import { scoreClass } from './anime-facts.js';

// Постер с названием. opts: badge, meta, href, progress (0..100), ext
export function animeCard(a, opts = {}) {
  const r = rateOf(a.id);
  const href = opts.href || `#anime-${a.id}`;
  const meta = opts.meta ?? metaLine(a);
  return `<a class="card" href="${esc(href)}"${opts.ext ? ' target="_blank" rel="noopener"' : ''}>
    <div class="poster">${posterHTML(a)}
      ${a.score ? `<span class="badge top ${scoreClass(a.score)}">${a.score.toFixed(1)}</span>` : ''}
      ${opts.badge ? `<span class="badge">${esc(opts.badge)}</span>` : r && !opts.noList ? `<span class="badge list st-${r.status}">${esc(listLabel(r.status))}</span>` : ''}
      ${opts.progress ? `<span class="prog"><i style="width:${opts.progress}%"></i></span>` : ''}
    </div>
    <div class="card-title">${esc(a.title)}</div>
    ${meta ? `<div class="card-meta">${esc(meta)}</div>` : ''}</a>`;
}

// Широкая карточка с баннером. opts: href, kicker, sub, progress, action
export function wideCard(a, opts = {}) {
  return `<a class="wcard" href="${esc(opts.href || `#anime-${a.id}`)}">
    ${bannerHTML(a)}
    <div class="wide-shade"></div>
    <div class="wide-body">
      ${opts.kicker ? `<span class="wide-kicker">${esc(opts.kicker)}</span>` : ''}
      <span class="wide-title">${esc(a.title)}</span>
      ${opts.sub ? `<span class="wide-sub">${esc(opts.sub)}</span>` : ''}
    </div>
    ${opts.progress != null ? `<span class="wide-bar"><i style="width:${opts.progress}%"></i></span>` : ''}
    ${opts.action ? `<span class="wide-play" aria-hidden="true">${ICON.play}</span>` : ''}
  </a>`;
}

export function section(title, body, link = '', id = '') {
  return `<section class="section"${id ? ` id="${id}"` : ''}>
    <div class="section-head"><h2 class="section-title">${esc(title)}</h2>${link}</div>${body}</section>`;
}
export const row = (items, wide = false) => `<div class="row${wide ? ' wide' : ''}">${items.join('')}</div>`;
export const grid = (items) => `<div class="grid">${items.join('')}</div>`;

export function skeletonRow(n = 6, wide = false) {
  return row(Array.from({ length: n }, () => wide ? '<div class="skel wide-skel"></div>' : '<div class="card"><div class="poster skel"></div><div class="skel" style="height:14px;width:80%"></div></div>'), wide);
}

export const statusLine = (a) => {
  if (a.status === 'ongoing') return `${STATUS.ongoing}${a.aired ? `, ${a.aired} из ${a.episodes || '?'}` : ''}`;
  return STATUS[a.status] || '';
};
export { KIND };

// Размер обложек в сетках «Каталог», «Моё», «Расписание»: s — как раньше, m и l — крупнее, в ряд помещается меньше
const SIZE_IC = {
  s: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="5" height="7" rx="1"/><rect x="9.5" y="3" width="5" height="7" rx="1"/><rect x="16" y="3" width="5" height="7" rx="1"/><rect x="3" y="13" width="5" height="7" rx="1"/><rect x="9.5" y="13" width="5" height="7" rx="1"/><rect x="16" y="13" width="5" height="7" rx="1"/></svg>',
  m: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="8" height="8" rx="1.5"/><rect x="13" y="3" width="8" height="8" rx="1.5"/><rect x="3" y="13" width="8" height="8" rx="1.5"/><rect x="13" y="13" width="8" height="8" rx="1.5"/></svg>',
  l: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="3" y="3" width="18" height="18" rx="2.5"/></svg>',
};
export const cardSize = () => (['s', 'm', 'l'].includes(store.get('cardSize', 's')) ? store.get('cardSize', 's') : 's');
export const applyCardSize = () => { document.body.dataset.cards = cardSize(); };
export function sizeControlHTML() {
  const cur = cardSize();
  return `<div class="seg size-seg" role="group" aria-label="Размер обложек">${[['s', 'Мелкие обложки'], ['m', 'Средние обложки'], ['l', 'Крупные обложки']].map(([k, t]) =>
    `<button type="button" data-csize="${k}" aria-pressed="${k === cur}" title="${t}" aria-label="${t}">${SIZE_IC[k]}</button>`).join('')}</div>`;
}
export function bindSizeControl(root = document) {
  root.querySelectorAll('[data-csize]').forEach((b) => b.onclick = () => {
    store.set('cardSize', b.dataset.csize); applyCardSize();
    root.querySelectorAll('[data-csize]').forEach((x) => x.setAttribute('aria-pressed', x === b));
  });
}
