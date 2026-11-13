import { animateMotion, reducedMotion } from '../public/js/interface-motion.js';

const contentSelector = '.grid, .wide-grid, .eps, .notes, .tr-list, .t-pane, [data-row], #setBody, #rateBox, .side-list, .adm-users';
const blockSelector = '.section, .t-head, .watch, .shiki-board, .empty';
const contentScopes = new WeakMap();
const indicatorScopes = new WeakMap();

export function retireView(element) {
  element.inert = true;
}

// Поддерживает и Vue-списки, и блоки, которые пока заполняются через innerHTML.
export const vContentMotion = {
  mounted(root) {
    const pending = new Set();
    const animations = new Map();
    let frame = 0;

    function reveal() {
      frame = 0;
      const candidates = [...pending].filter((element) => root.contains(element) && element.isConnected);
      pending.clear();
      if (reducedMotion.matches) return;
      const blocks = candidates.filter((element) => {
        if (element.matches('.t-head') && root.hasAttribute('data-cover-opening')) return false;
        if (candidates.some((parent) => parent !== element && parent.contains(element))) return false;
        const { top, bottom, width, height } = element.getBoundingClientRect();
        return width && height && bottom >= 0 && top <= innerHeight;
      }).slice(0, 10);
      blocks.forEach((element, index) => {
        animations.get(element)?.cancel();
        const card = element.matches('.card, .lcard, .history-card');
        let shift = card ? '0 10px' : '0 6px';
        if (element.matches('.t-head, .watch')) shift = '0 0';
        if (element.matches('.t-pane')) shift = `${element.style.getPropertyValue('--title-tab-shift') || '0px'} 0`;
        const animation = animateMotion(element, [
          { opacity: card ? .35 : .55, translate: shift },
          { opacity: 1, translate: '0 0' },
        ], 270, { delay: Math.min(index * 18, 72), fill: 'backwards', done: () => animations.delete(element) });
        if (animation) animations.set(element, animation);
      });
    }

    const observer = new MutationObserver((records) => {
      for (const record of records) {
        if (!record.addedNodes.length) continue;
        const target = record.target instanceof Element ? record.target : record.target.parentElement;
        if (target?.matches('.grid, .wide-grid, .notes') && !record.removedNodes.length) {
          // При подгрузке следующей страницы двигаются только новые карточки.
          for (const node of [...record.addedNodes].slice(0, 12)) {
            if (node instanceof HTMLElement) pending.add(node);
          }
          continue;
        }
        if (target?.id === 'setBody') {
          for (const child of target.children) pending.add(child);
          continue;
        }
        if (target?.matches(contentSelector)) {
          if (target.childElementCount === 1 && target.firstElementChild.matches('.loading')) continue;
          pending.add(target);
          continue;
        }
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.matches(contentSelector + ', ' + blockSelector)) pending.add(node);
        }
      }
      if (pending.size && !frame) frame = requestAnimationFrame(reveal);
    });
    observer.observe(root, { childList: true, subtree: true });
    contentScopes.set(root, () => {
      observer.disconnect();
      cancelAnimationFrame(frame);
      animations.forEach((animation) => animation.cancel());
      animations.clear();
      pending.clear();
    });
  },
  beforeUnmount(root) {
    contentScopes.get(root)?.();
    contentScopes.delete(root);
  },
};

export const vActiveIndicator = {
  mounted(root, { modifiers }) {
    const marker = document.createElement('i');
    marker.className = 'active-indicator';
    marker.setAttribute('aria-hidden', 'true');
    root.classList.add('has-active-indicator');
    root.append(marker);
    let frame = 0;
    let current = null;
    let positionKey = '';
    let viewportWidth = 0;
    let animation;

    function position() {
      frame = 0;
      const selected = [...root.children].find((element) =>
        element.matches('[aria-current="page"], [aria-selected="true"], [aria-pressed="true"]') && !element.hidden);
      const switched = selected !== current;
      const previous = switched && current && !marker.hidden && !reducedMotion.matches
        ? marker.getBoundingClientRect()
        : null;
      if (switched) {
        if (current) resize.unobserve(current);
        current = selected;
        if (current) resize.observe(current);
      }
      if (!selected) {
        marker.hidden = true;
        positionKey = '';
        animation?.cancel();
        return;
      }
      const bounds = root.getBoundingClientRect();
      const active = selected.getBoundingClientRect();
      const x = active.left - bounds.left + root.scrollLeft - root.clientLeft;
      const y = active.top - bounds.top + root.scrollTop - root.clientTop;
      const key = `${x}/${y}/${active.width}/${active.height}`;
      if (modifiers.reveal && (switched || key !== positionKey || viewportWidth !== root.clientWidth)) {
        viewportWidth = root.clientWidth;
        const inset = parseFloat(getComputedStyle(root).scrollPaddingLeft) || 0;
        const left = x - inset;
        const right = x + active.width + inset;
        if (left < root.scrollLeft || right > root.scrollLeft + viewportWidth) {
          root.scrollTo({
            left: left < root.scrollLeft ? left : right - viewportWidth,
            behavior: 'instant',
          });
        }
      }
      if (!switched && key === positionKey) return;
      positionKey = key;
      animation?.cancel();
      marker.hidden = false;
      marker.style.width = active.width + 'px';
      marker.style.height = active.height + 'px';
      marker.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      if (!marker.isConnected) root.append(marker);
      if (previous?.width && previous.height && active.width && active.height) {
        animation = animateMotion(marker, [{
          transform: `translate3d(${x + previous.left - active.left}px, ${y + previous.top - active.top}px, 0) scale(${previous.width / active.width}, ${previous.height / active.height})`,
        }, { transform: marker.style.transform }], 260);
      }
    }
    function schedule() {
      if (!frame) frame = requestAnimationFrame(position);
    }
    const resize = new ResizeObserver(schedule);
    resize.observe(root);
    const observer = new MutationObserver((records) => {
      if (records.some((record) => record.target !== marker && (record.type === 'attributes' ||
        [...record.addedNodes, ...record.removedNodes].some((node) => node !== marker)))) schedule();
    });
    observer.observe(root, {
      subtree: true, childList: true, attributes: true,
      attributeFilter: ['aria-current', 'aria-selected', 'aria-pressed', 'hidden'],
    });
    position();
    indicatorScopes.set(root, () => {
      observer.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
      animation?.cancel();
      marker.remove();
      root.classList.remove('has-active-indicator');
    });
  },
  beforeUnmount(root) {
    indicatorScopes.get(root)?.();
    indicatorScopes.delete(root);
  },
};
