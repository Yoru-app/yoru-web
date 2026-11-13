import { cancelSurfaceMotion, surfaceMotion } from './interface-motion.js';

// Всплывающие меню в стиле Yoru вместо системных <select>.
// popover(button, { html, onPick, className }) — показывает список под кнопкой,
// стрелки ↑↓ переходят по пунктам, Enter выбирает, Esc закрывает.
let open = null;

export function closePopover(focusBack = false) {
  if (!open) return;
  const { pop, btn, cleanup } = open;
  open = null;
  cleanup();
  btn.setAttribute('aria-expanded', 'false');
  btn.classList.remove('dd-open');
  if (focusBack) btn.focus();
  pop.inert = true;
  surfaceMotion(pop, false, { offset: pop.classList.contains('up') ? 4 : -4, done: () => pop.remove() });
}

export function popover(btn, { html, onPick, className = '', width, cols, multiple = false, label, fitViewport = false }) {
  if (open && open.btn === btn) { closePopover(); return; }
  closePopover();
  const pop = document.createElement('div');
  pop.className = 'pop ' + className;
  pop.setAttribute('role', 'listbox');
  if (multiple) pop.setAttribute('aria-multiselectable', 'true');
  if (label) pop.setAttribute('aria-label', label);
  pop.innerHTML = html;
  if (cols) pop.dataset.cols = cols;
  document.body.append(pop);
  btn.setAttribute('aria-expanded', 'true');
  btn.classList.add('dd-open');

  const place = () => {
    const r = btn.getBoundingClientRect();
    pop.style.minWidth = Math.min(width || r.width, innerWidth - 16) + 'px';
    if (fitViewport) pop.style.removeProperty('max-height');
    const h = pop.offsetHeight;
    const above = r.top, below = innerHeight - r.bottom;
    const up = below < h + 12 && (fitViewport ? above > below : above > h + 12);
    if (fitViewport) pop.style.maxHeight = Math.max(0, Math.min(h, (up ? above : below) - 16)) + 'px';
    const w = pop.offsetWidth;
    pop.style.top = (up ? r.top - pop.offsetHeight - 8 : r.bottom + 8) + scrollY + 'px';
    pop.style.left = Math.max(8, Math.min(r.left, innerWidth - w - 8)) + scrollX + 'px';
    pop.classList.toggle('up', up);
    pop.style.transformOrigin = up ? 'left bottom' : 'left top';
  };
  place();
  surfaceMotion(pop, true, { offset: pop.classList.contains('up') ? 6 : -6, scale: .96, duration: 195 });

  const items = () => [...pop.querySelectorAll('[data-v]')];
  const focusAt = (i, preventScroll = false) => {
    const list = items();
    if (!list.length) return;
    const item = list[(i + list.length) % list.length];
    item.focus({ preventScroll });
    if (preventScroll && item.offsetTop + item.offsetHeight > pop.clientHeight) {
      pop.scrollTop = item.offsetTop + item.offsetHeight - pop.clientHeight;
    }
  };
  const cur = items().findIndex((x) => x.getAttribute('aria-selected') === 'true');
  focusAt(cur >= 0 ? cur : 0, fitViewport);

  const onClick = (e) => {
    const it = e.target.closest('[data-v]');
    if (!it) return;
    if (multiple) {
      const selected = onPick(it.dataset.v);
      for (const option of items()) {
        const value = option.dataset.v;
        option.setAttribute('aria-selected', String(value ? selected.includes(value) : !selected.length));
      }
      return;
    }
    closePopover(true);
    onPick(it.dataset.v);
  };
  const onKey = (e) => {
    const list = items(), i = list.indexOf(document.activeElement);
    const cols = +(pop.dataset.cols || 1);
    if (e.key === 'Escape') { e.preventDefault(); closePopover(true); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); focusAt(i + cols); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); focusAt(i - cols); }
    else if (e.key === 'ArrowRight' && cols > 1) { e.preventDefault(); focusAt(i + 1); }
    else if (e.key === 'ArrowLeft' && cols > 1) { e.preventDefault(); focusAt(i - 1); }
    else if (e.key === 'Home') { e.preventDefault(); focusAt(0); }
    else if (e.key === 'End') { e.preventDefault(); focusAt(list.length - 1); }
    else if (e.key === 'Tab') closePopover();
  };
  const onDoc = (e) => { if (!pop.contains(e.target) && !btn.contains(e.target)) closePopover(); };
  const onScroll = (e) => {
    if (!btn.isConnected) closePopover();
    else if (!pop.contains(e.target)) place();
  };
  const onRoute = () => closePopover();
  pop.addEventListener('click', onClick);
  pop.addEventListener('keydown', onKey);
  document.addEventListener('pointerdown', onDoc, true);
  addEventListener('resize', place);
  addEventListener('scroll', onScroll, true);
  window.addEventListener('hashchange', onRoute);
  open = {
    pop, btn,
    cleanup() {
      document.removeEventListener('pointerdown', onDoc, true);
      removeEventListener('resize', place);
      removeEventListener('scroll', onScroll, true);
      window.removeEventListener('hashchange', onRoute);
    },
  };
  return pop;
}

// Кнопка, открывающая меню, с клавиатуры тоже: ↓ открывает
const dropdownBindings = new WeakMap();
export function bindDropdown(btn, opts) {
  const existing = dropdownBindings.get(btn);
  if (existing) {
    existing.options = opts;
    return;
  }
  const binding = { options: opts };
  dropdownBindings.set(btn, binding);
  btn.setAttribute('aria-haspopup', 'listbox');
  btn.setAttribute('aria-expanded', 'false');
  btn.addEventListener('click', () => popover(btn, binding.options()));
  btn.addEventListener('keydown', (e) => { if (e.key === 'ArrowDown' && !open) { e.preventDefault(); popover(btn, binding.options()); } });
}

// Модальное окно: openModal({ title, html, onOpen, wide }) → { el, close }. Esc, клик по фону и «×» закрывают.
let modalOpen = null;
let closingModal = null;
export function openModal({ title, html, onOpen, onClose, wide = false }) {
  if (modalOpen) modalOpen.close();
  if (closingModal) {
    cancelSurfaceMotion(closingModal);
    cancelSurfaceMotion(closingModal.firstElementChild);
    closingModal.remove();
    closingModal = null;
  }
  const back = document.createElement('div');
  back.className = 'ymodal-back';
  back.innerHTML = `<div class="ymodal${wide ? ' wide' : ''}" role="dialog" aria-modal="true" aria-labelledby="modalTitle">
    <div class="ymodal-head"><h2 id="modalTitle">${title}</h2>
      <button class="ymodal-x" type="button" aria-label="Закрыть"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button></div>
    <div class="ymodal-body">${html}</div></div>`;
  const dialog = back.querySelector('.ymodal');
  const prevFocus = document.activeElement;
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey, true);
    window.removeEventListener('hashchange', close);
    document.body.classList.remove('ymodal-on');
    modalOpen = null;
    closingModal = back;
    back.inert = true;
    surfaceMotion(dialog, false, { duration: 145 });
    surfaceMotion(back, false, { offset: 0, scale: 1, duration: 160, done: () => {
      closingModal = null;
      back.remove();
    } });
    if (onClose) onClose();
    if (prevFocus && prevFocus.focus) prevFocus.focus({ preventScroll: true });
  };
  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') {
      const f = [...back.querySelectorAll('a[href],button:not([disabled]),input,select,textarea')].filter((x) => x.offsetParent);
      if (!f.length) return;
      if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
      else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
    }
  };
  back.addEventListener('pointerdown', (e) => { if (e.target === back) close(); });
  back.querySelector('.ymodal-x').onclick = close;
  document.addEventListener('keydown', onKey, true);
  window.addEventListener('hashchange', close, { once: true });
  document.body.append(back);
  document.body.classList.add('ymodal-on');
  const instance = { el: dialog, close };
  modalOpen = instance;
  surfaceMotion(back, true, { offset: 0, scale: 1, duration: 200 });
  surfaceMotion(dialog, true, { offset: 10, scale: .98, duration: 270 });
  back.querySelector('.ymodal-x').focus({ preventScroll: true });
  if (onOpen) onOpen(dialog, close);
  return instance;
}

// Выпадающий список в стиле Yoru вместо <select>:
// selectHTML(id, items, value, placeholder) → кнопка; bindSelect(id, items, value, onPick, { cols, placeholder })
// items: [[значение, подпись], ...]; значение '' — «любой».
const CHEV = '<svg class="dd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="m6 9 6 6 6-6"/></svg>';
const CHECK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>';
const escH = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export function selectHTML(id, items, value, placeholder = '', def = '') {
  const cur = items.find(([v]) => v === value);
  const label = cur ? cur[1] : placeholder;
  // подсвечиваем только то, что отличается от значения по умолчанию (то есть действующий фильтр)
  return `<button class="dd dd-sel${value && value !== def ? ' is-set' : ''}" type="button" id="${id}"><span>${escH(label)}</span>${CHEV}</button>`;
}
export function bindSelect(id, items, value, onPick, { cols = 1, placeholder = '', width } = {}) {
  const btn = document.getElementById(id);
  if (!btn) return;
  const all = placeholder ? [['', placeholder], ...items] : items;
  bindDropdown(btn, () => ({
    cols, width, className: 'pop-sel' + (cols > 1 ? ' pop-cols' : ''),
    html: (cols > 1 ? `<div class="pop-grid" style="--cols:${cols}">` : '')
      + all.map(([v, l]) => `<button class="pop-item pop-opt${v === '' ? ' is-any' : ''}" type="button" role="option" data-v="${escH(v)}" aria-selected="${v === value}"><span>${escH(l)}</span>${v === value ? CHECK : '<i></i>'}</button>`).join('')
      + (cols > 1 ? '</div>' : ''),
    onPick: (v) => { if (v !== value) onPick(v); },
  }));
}

export function bindMultiSelect(btn, options) {
  bindDropdown(btn, () => {
    const { items, values, label, placeholder, width, cols, onChange } = options();
    let selected = [...values];
    const renderOption = ([value, title]) => {
      const active = value ? selected.includes(value) : !selected.length;
      return `<button class="pop-item pop-opt${value ? '' : ' is-any'}" type="button" role="option"
        data-v="${escH(value)}" aria-selected="${active}"><span>${escH(title)}</span>${CHECK}</button>`;
    };
    const grouped = items.some(([, , kind]) => kind);
    const groups = [['genre', 'Жанры'], ['theme', 'Темы'], ['other', 'Категории']];
    const optionsHTML = grouped ? groups.map(([kind, heading]) => {
      const group = items.filter(([, , type]) => (type === 'genre' || type === 'theme' ? type : 'other') === kind);
      return group.length ? `<div class="pop-genre-group tag-${kind}" role="group" aria-label="${heading}">
        <div class="pop-genre-heading" aria-hidden="true">${heading}</div>${group.map(renderOption).join('')}</div>` : '';
    }).join('') : items.map(renderOption).join('');
    const buttons = renderOption(['', placeholder]) + optionsHTML;
    return {
      label, width, cols, multiple: true,
      className: 'pop-sel pop-multi' + (cols > 1 ? ' pop-cols' : '') + (grouped ? ' pop-genres' : ''),
      html: cols > 1 ? `<div class="pop-grid" style="--cols:${cols}">${buttons}</div>` : buttons,
      onPick(value) {
        const next = !value ? [] : selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value];
        if (next.length !== selected.length) onChange(next);
        selected = next;
        return selected;
      },
    };
  });
}
