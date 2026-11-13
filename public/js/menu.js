// Меню: вертикальное (слева) или горизонтальное (панель сверху, как на KinoPub).
// Одни и те же ссылки переносятся между боковой панелью и верхней — счётчик уведомлений и подсветка раздела работают в обоих.
import { store } from './core.js';

export const mobileMenu = matchMedia('(max-width: 760px)');

export const menuMode = () => (store.get('menu', 'h') === 'h' ? 'h' : 'v');

// Ширина содержимого: 'full' — во всю ширину, иначе — не шире стольких пикселей (по центру)
export const WIDTHS = [
  ['full', 'Заполнить', 'Использовать всю доступную ширину экрана'],
  ['1920', 'До 1920 px', 'Для 2K и 4K'],
  ['1600', 'До 1600 px', ''],
  ['1360', 'До 1360 px', ''],
  ['1200', 'До 1200 px', 'Узкая колонка'],
];
export const WIDTH_MIN = 960, WIDTH_MAX = 3840;
// 'full' или число пикселей (пресет или своё значение с ползунка)
export const contentWidth = () => {
  const w = String(store.get('contentWidth', 'full'));
  if (w === 'full') return 'full';
  const n = Math.round(+w);
  return n >= WIDTH_MIN && n <= WIDTH_MAX ? String(n) : 'full';
};
export function applyWidth(w = contentWidth()) {
  if (w === 'full') { delete document.body.dataset.width; document.body.style.removeProperty('--content-w'); return; }
  document.body.dataset.width = 'on';
  document.body.style.setProperty('--content-w', w + 'px');
}

export const BACKGROUND_PATTERNS = [
  ['dots', 'Точки', 'Мелкие точки с равными промежутками'],
  ['grid', 'Сетка', 'Тонкие горизонтальные и вертикальные линии'],
  ['diagonal', 'Диагонали', 'Редкие наклонные линии'],
  ['diamonds', 'Ромбы', 'Пересекающиеся диагональные линии'],
  ['crosses', 'Крестики', 'Небольшие крестики в шахматном порядке'],
];

export function backgroundPrefs() {
  const selected = store.get('backgroundPattern', 'dots');
  return {
    enabled: store.get('patternBackground', store.get('dotBackground', true)) !== false,
    pattern: BACKGROUND_PATTERNS.some(([id]) => id === selected) ? selected : 'dots',
    outsideContent: store.get('patternOutsideContent', false) === true,
  };
}

export function applyBackground() {
  const { enabled, pattern, outsideContent } = backgroundPrefs();
  if (enabled) document.body.dataset.pattern = pattern;
  else delete document.body.dataset.pattern;
  document.body.classList.toggle('pattern-outside-content', enabled && outsideContent);
}

export function applyMetadataIcons() {
  document.body.classList.toggle('metadata-icons-off', store.get('metadataIcons', true) === false);
}

export function applyMenu() {
  document.body.classList.toggle('nav-nolabels', store.get('navLabels', false) === false);
  applyWidth();
  window.dispatchEvent(new Event('yoru:menu'));
}
mobileMenu.addEventListener('change', applyMenu);
