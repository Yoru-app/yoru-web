import { animateMotion, reducedMotion } from '../public/js/interface-motion.js';

export function captureCover(event) {
  if (reducedMotion.matches || event.defaultPrevented || event.button !== 0 ||
      event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return null;
  const link = event.target.closest?.('a[href^="#anime-"]');
  const id = Number(link?.getAttribute('href').match(/^#anime-(\d+)$/)?.[1]);
  if (!id || (link.target && link.target !== '_self') || link.hash === location.hash) return null;
  const cover = link.matches('.hero-poster') ? link : link.querySelector('.poster, .note-img, .chrono-poster');
  if (!cover) return null;
  const rect = cover.getBoundingClientRect();
  if (!rect.width || !rect.height || rect.bottom <= 0 || rect.top >= innerHeight ||
      rect.right <= 0 || rect.left >= innerWidth) return null;

  const image = cover.querySelector('img');
  const src = image?.naturalWidth ? image.currentSrc || image.src : '';
  const artwork = src ? document.createElement('img') : cover.querySelector('.ph')?.cloneNode(true);
  if (!artwork) return null;
  if (src) { artwork.src = src; artwork.alt = ''; }
  const style = getComputedStyle(cover);
  const scrollBounds = cover.closest('.row, [data-hscroll]')?.getBoundingClientRect();
  const left = Math.max(rect.left, scrollBounds?.left ?? 0, 0);
  const right = Math.min(rect.right, scrollBounds?.right ?? innerWidth, innerWidth);
  if (right <= left) return null;
  return { id, artwork, src, rect, left, right, radius: style.borderTopLeftRadius };
}

export function unfoldCover(source, target, done) {
  if (reducedMotion.matches || !target || !target.animate) { done(); return () => {}; }
  const destination = target.getBoundingClientRect();
  if (!destination.width || !destination.height) { done(); return () => {}; }
  const { rect, left, right, radius, artwork } = source;
  const width = document.documentElement.clientWidth;
  const height = innerHeight;
  const layer = document.createElement('div');
  layer.className = 'cover-unfold';
  layer.setAttribute('aria-hidden', 'true');
  const backdrop = document.createElement('div');
  backdrop.className = 'cover-unfold-backdrop';
  const poster = document.createElement('div');
  poster.className = 'cover-unfold-poster';
  poster.append(artwork);
  layer.append(backdrop, poster);
  const endRadius = getComputedStyle(target).borderTopLeftRadius;
  Object.assign(poster.style, {
    left: destination.left + 'px', top: destination.top + 'px',
    width: destination.width + 'px', height: destination.height + 'px',
    borderRadius: endRadius,
  });
  document.body.append(layer);

  const origin = `inset(${Math.max(0, rect.top)}px ${Math.max(0, width - right)}px ${Math.max(0, height - rect.bottom)}px ${left}px round ${radius})`;
  const end = 'inset(0px 0px 0px 0px round 0px)';
  const scaleX = rect.width / destination.width;
  const scaleY = rect.height / destination.height;
  const posterCrop = `inset(${Math.max(0, -rect.top) / scaleY}px ${(rect.right - right) / scaleX}px ${Math.max(0, rect.bottom - height) / scaleY}px ${(left - rect.left) / scaleX}px)`;
  const wipe = animateMotion(backdrop, [
    { clipPath: origin, opacity: 1 },
    { clipPath: end, opacity: .84, offset: .53 },
    { clipPath: end, opacity: 0 },
  ], 460, { fill: 'both' });
  const travel = animateMotion(poster, [
    {
      transform: `translate(${rect.left - destination.left}px, ${rect.top - destination.top}px) scale(${scaleX}, ${scaleY})`,
      borderRadius: radius,
      clipPath: posterCrop,
      opacity: 1,
    },
    { transform: 'none', borderRadius: endRadius, clipPath: 'inset(0px)', opacity: 1, offset: .75 },
    { transform: 'none', borderRadius: endRadius, clipPath: 'inset(0px)', opacity: 0 },
  ], 460, { fill: 'both', done: () => { layer.remove(); done(); } });
  return () => { wipe?.cancel(); travel?.cancel(); layer.remove(); };
}
