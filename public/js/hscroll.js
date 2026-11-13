// Горизонтальные полосы, которые шире экрана (ряды, полоска тайтлов в большом блоке, вкладки):
// мышью их можно зажать и потянуть вбок, по краям появляются стрелки.
// Работает для всего, что дорисовывается позже: полосы находятся при наведении.
const SCROLLERS = '.row, .hero-picker, .tabs, .set-nav, [data-hscroll]';
const ARROW_L = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m15 6-6 6 6 6"/></svg>';
const ARROW_R = '<svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m9 6 6 6-6 6"/></svg>';

const overflows = (el) => el.scrollWidth > el.clientWidth + 4;
const scrollerAt = (t) => {
  if (!t || !t.closest) return null;
  const direct = t.closest(SCROLLERS);
  const section = !direct && t.closest('.section');
  const el = direct || (section && section.querySelector('.row'));
  return el && !el.hasAttribute('data-row-arrows') && overflows(el) && getComputedStyle(el).overflowX !== 'hidden' ? el : null;
};

export function mountRowArrows(el, hideButton) {
  el.setAttribute('data-row-arrows', '');
  const controls = document.createElement('div');
  controls.className = 'row-arrows';
  const button = (svg, direction, label) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.innerHTML = svg;
    b.setAttribute('aria-label', label);
    b.onclick = () => el.scrollBy({
      left: direction * Math.max(200, el.clientWidth * 0.8),
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
    return b;
  };
  const prev = button(ARROW_L, -1, 'Прокрутить ряд влево');
  const next = button(ARROW_R, 1, 'Прокрутить ряд вправо');
  controls.append(prev, next);
  hideButton.before(controls);
  const sync = () => {
    const max = el.scrollWidth - el.clientWidth;
    controls.hidden = max <= 4;
    prev.disabled = el.scrollLeft <= 2;
    next.disabled = el.scrollLeft >= max - 2;
  };
  const observer = new ResizeObserver(sync);
  observer.observe(el);
  el.addEventListener('scroll', sync, { passive: true });
  sync();
  return () => {
    observer.disconnect();
    el.removeEventListener('scroll', sync);
    el.removeAttribute('data-row-arrows');
    controls.remove();
  };
}

function syncArrows(el) {
  const w = el._hs; if (!w) return;
  const max = el.scrollWidth - el.clientWidth;
  w.prev.hidden = el.scrollLeft <= 2;
  w.next.hidden = el.scrollLeft >= max - 2 || max <= 4;
}
function attach(el) {
  if (el._hs) { syncArrows(el); return; }
  const host = el.parentElement;
  if (!host) return;
  if (getComputedStyle(host).position === 'static') host.classList.add('hs-host');
  const mk = (cls, svg, dir, label) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = `hs-arrow ${cls}`; b.innerHTML = svg; b.setAttribute('aria-label', label); b.tabIndex = -1; b.hidden = true;
    b.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); el.scrollBy({ left: dir * Math.max(200, el.clientWidth * 0.8), behavior: 'smooth' }); });
    return b;
  };
  const prev = mk('hs-prev', ARROW_L, -1, 'Прокрутить влево'), next = mk('hs-next', ARROW_R, 1, 'Прокрутить вправо');
  host.append(prev, next);
  el._hs = { prev, next, host };
  // стрелки по высоте и краям самой полосы, даже если в родителе есть заголовок
  const place = () => {
    const hr = host.getBoundingClientRect(), er = el.getBoundingClientRect();
    const top = er.top - hr.top + er.height / 2;
    const arrowSize = 40;
    const edgeInset = 6;
    const leftGutter = er.left - hr.left;
    const rightGutter = hr.right - er.right;
    const useHeroGutters = el.classList.contains('hero-picker');
    prev.style.top = next.style.top = top + 'px';
    // На широком экране у большого блока есть свободные боковые поля. Выносим
    // стрелки туда, чтобы они не закрывали баннеры в полосе выбора тайтла.
    prev.style.left = useHeroGutters && leftGutter >= arrowSize
      ? ((leftGutter - arrowSize) / 2) + 'px'
      : (er.left - hr.left + edgeInset) + 'px';
    next.style.left = useHeroGutters && rightGutter >= arrowSize
      ? (er.right - hr.left + (rightGutter - arrowSize) / 2) + 'px'
      : (er.right - hr.left - edgeInset - arrowSize) + 'px';
  };
  el._hs.place = place;
  el.addEventListener('scroll', () => syncArrows(el), { passive: true });
  host.addEventListener('mouseleave', () => { prev.classList.remove('on'); next.classList.remove('on'); });
}

document.addEventListener('mouseover', (e) => {
  const el = scrollerAt(e.target);
  if (!el) return;
  attach(el);
  if (!el._hs) return;
  el._hs.place();
  syncArrows(el);
  el._hs.prev.classList.add('on'); el._hs.next.classList.add('on');
}, { passive: true });

let drag = null, blockClick = null;
document.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || e.pointerType !== 'mouse' || !e.target.closest) return;
  const el = e.target.closest(SCROLLERS);
  if (!el || !overflows(el) || getComputedStyle(el).overflowX === 'hidden') return;
  drag = { el, id: e.pointerId, x: e.clientX, left: el.scrollLeft, moved: false };
});
document.addEventListener('pointermove', (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const dx = e.clientX - drag.x;
  if (!drag.moved && Math.abs(dx) < 5) return;
  if (!drag.moved) {
    drag.moved = true;
    drag.el.classList.add('is-dragging');
    drag.el.setPointerCapture(e.pointerId);
  }
  drag.el.scrollLeft = drag.left - dx;
  e.preventDefault();
}, { passive: false });
const finishDrag = (e) => {
  if (!drag || drag.id !== e.pointerId) return;
  const { el, moved } = drag;
  drag = null;
  el.classList.remove('is-dragging');
  if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  if (moved) { blockClick = el; setTimeout(() => { blockClick = null; }, 0); }
};
document.addEventListener('pointerup', finishDrag);
document.addEventListener('pointercancel', finishDrag);
// Ссылки и картинки браузер пытается перетаскивать сам — это обрывает прокрутку ряда.
document.addEventListener('dragstart', (e) => {
  if (e.target.closest && e.target.closest(SCROLLERS)) e.preventDefault();
});
document.addEventListener('click', (e) => {
  if (blockClick && blockClick.contains(e.target)) { e.preventDefault(); e.stopPropagation(); blockClick = null; }
}, true);
