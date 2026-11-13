import { store } from '../public/js/core.js';

export const themes = [
  ['web', 'Yoru Web'],
  ['mobile', 'Yoru Mobile'],
  ['tv', 'Yoru TV'],
  ['db', 'Yoru DB'],
  ['desktop', 'Yoru Desktop'],
];

export function savedTheme() {
  const id = store.get('theme', 'web');
  return themes.some(([key]) => key === id) ? id : 'web';
}

export function applyTheme(id = savedTheme()) {
  document.documentElement.dataset.theme = id;
}

export function selectTheme(id) {
  document.documentElement.classList.add('theme-animate');
  store.set('theme', id);
  applyTheme(id);
}
