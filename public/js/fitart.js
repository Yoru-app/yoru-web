import { store } from './core.js';
// Баннер на широком экране: «растягивать» (как обычно) или «размывать края» — картинка увеличивается
// не больше чем в MAX_UP раз и стоит по центру или у правого края, по бокам — её размытая копия.
// Используется в большом блоке на главной и в шапке страницы тайтла.
export const FITS = [
  ['stretch', 'Растягивать', 'Картинка на всю ширину. На больших экранах маленькие баннеры видны с пикселями'],
  ['blur', 'Размывать края', 'Если картинка меньше экрана, она увеличивается чуть-чуть, а по бокам — её размытая копия'],
];
export const ALIGNS = [['center', 'По центру', ''], ['right', 'У правого края', 'Левая часть с текстом — на размытии']];
const MAX_UP = 1.35;

// Одна настройка для большого блока на главной и шапки страницы тайтла.
// Раньше они настраивались отдельно (heroFit/heroAlign) — их значение подхватываем.
export function bannerLook() {
  const fit = store.get('bannerFit', store.get('heroFit', 'blur'));
  const align = store.get('bannerAlign', store.get('heroAlign', 'right'));
  return { fit: fit === 'stretch' ? 'stretch' : 'blur', align: align === 'center' ? 'center' : 'right' };
}
const SOLID = 'linear-gradient(#000,#000)';

// Пока размер картинки неизвестен, её не видно (класс fit-pending) — иначе она мелькает у края, а потом прыгает в центр
export const pendingAttr = (look) => (look && look.fit === 'blur' ? ' fit-pending' : '');

export function fitBanner(media, img, { fit, align }) {
  if (!media || !img) return;
  const reset = () => {
    media.classList.remove('fit-blur');
    const bg = media.querySelector('.fit-bg'); if (bg) bg.remove();
    img.removeAttribute('style');
    img.classList.remove('fit-pending');
  };
  if (fit !== 'blur' || !img.naturalWidth) return reset();
  const W = media.clientWidth, H = media.clientHeight, nw = img.naturalWidth, nh = img.naturalHeight;
  // только когда экран заметно шире картинки; на телефоне и узких окнах — как обычно
  if (W / nw <= MAX_UP) return reset();
  const cw = Math.min(W, Math.round(nw * MAX_UP)), ch = Math.min(H, Math.round(nh * MAX_UP));
  let bg = media.querySelector('.fit-bg');
  if (!bg) { bg = document.createElement('img'); bg.className = 'fit-bg'; bg.alt = ''; media.prepend(bg); }
  if (bg.getAttribute('src') !== img.getAttribute('src')) bg.src = img.getAttribute('src');
  media.classList.add('fit-blur');
  const right = align === 'right';
  const mx = cw < W ? (right ? 'linear-gradient(90deg,transparent,#000 30%)' : 'linear-gradient(90deg,transparent,#000 16%,#000 84%,transparent)') : SOLID;
  const my = ch < H ? 'linear-gradient(transparent,#000 14%,#000 86%,transparent)' : SOLID;
  Object.assign(img.style, {
    width: cw + 'px', height: ch + 'px',
    // позиция — только через left в пикселях: transform перебивается анимацией появления,
    // и картинка на долю секунды встаёт от середины вправо, а потом прыгает в центр
    left: (right ? W - cw : Math.round((W - cw) / 2)) + 'px', right: 'auto',
    top: ch < H ? Math.round((H - ch) * 0.45) + 'px' : '0',
  });
  img.style.setProperty('-webkit-mask-image', `${mx},${my}`);
  img.style.setProperty('mask-image', `${mx},${my}`);
  img.classList.remove('fit-pending');
}

// Пересчёт при загрузке картинки и изменении размера блока. Возвращает функцию отписки.
export function watchFit(media, img, look) {
  if (!media || !img) return () => {};
  const run = () => fitBanner(media, img, typeof look === 'function' ? look() : look);
  if (img.complete && img.naturalWidth) run(); else img.addEventListener('load', run, { once: true });
  img.addEventListener('error', () => img.classList.remove('fit-pending'), { once: true });
  if (!window.ResizeObserver) return () => {};
  const ro = new ResizeObserver(run);
  ro.observe(media);
  return () => ro.disconnect();
}
