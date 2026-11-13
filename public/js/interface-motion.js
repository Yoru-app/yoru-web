export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const ease = 'cubic-bezier(.22, 1, .36, 1)';
const running = new Set();
const surfaces = new WeakMap();

reducedMotion.addEventListener('change', ({ matches }) => {
  if (matches) for (const animation of running) animation.finish();
});

export function animateMotion(element, frames, duration, { delay = 0, fill = 'none', easing = ease, done } = {}) {
  if (reducedMotion.matches || !element.animate) {
    done?.();
    return null;
  }
  const animation = element.animate(frames, { duration, delay, fill, easing });
  running.add(animation);
  animation.finished.then(() => {
    running.delete(animation);
    done?.();
    animation.cancel();
  }, () => running.delete(animation));
  return animation;
}

export function cancelSurfaceMotion(element) {
  surfaces.get(element)?.cancel();
  surfaces.delete(element);
}

export function surfaceMotion(element, opening, { offset = 6, scale = .985, duration, done } = {}) {
  let current;
  if (surfaces.has(element)) {
    const style = getComputedStyle(element);
    current = { opacity: style.opacity, translate: style.translate, scale: style.scale };
    cancelSurfaceMotion(element);
  }
  const resting = { opacity: 1, translate: '0 0', scale: 1 };
  const hidden = { opacity: 0, translate: `0 ${offset}px`, scale };
  const animation = animateMotion(element, [current || (opening ? hidden : resting), opening ? resting : hidden],
    duration ?? (opening ? 240 : 145), {
      fill: 'both',
      done: () => {
        surfaces.delete(element);
        done?.();
      },
    });
  if (animation) surfaces.set(element, animation);
}
