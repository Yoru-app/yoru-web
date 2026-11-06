const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
const easing = 'cubic-bezier(.22, 1, .36, 1)';
const contentSelector = '.grid, .wide-grid, .eps, .notes, .tr-list, .t-pane, [data-row], #setBody, #rateBox, .side-list, .adm-users';
const blockSelector = '.section, .t-head, .watch, .settings-content, .hero-inner';
const contentScopes = new WeakMap();
const indicatorScopes = new WeakMap();

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
      const blocks = candidates.filter((element) =>
        !candidates.some((parent) => parent !== element && parent.contains(element)));
      for (const element of blocks) {
        animations.get(element)?.cancel();
        const animation = element.animate([
          { opacity: .55, translate: '0 6px' },
          { opacity: 1, translate: '0 0' },
        ], { duration: 220, easing });
        animations.set(element, animation);
        animation.onfinish = () => animations.delete(element);
      }
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
        if (target?.matches(contentSelector)) {
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
  mounted(root) {
    const marker = document.createElement('i');
    marker.className = 'active-indicator';
    marker.setAttribute('aria-hidden', 'true');
    root.classList.add('has-active-indicator');
    root.append(marker);
    let frame = 0;
    let current = null;

    function position() {
      frame = 0;
      const selected = [...root.children].find((element) =>
        element.matches('[aria-current="page"], [aria-selected="true"], [aria-pressed="true"]') && !element.hidden);
      if (selected !== current) {
        if (current) resize.unobserve(current);
        current = selected;
        if (current) resize.observe(current);
      }
      marker.hidden = !selected;
      if (!selected) return;
      const bounds = root.getBoundingClientRect();
      const active = selected.getBoundingClientRect();
      marker.style.width = active.width + 'px';
      marker.style.height = active.height + 'px';
      marker.style.transform = `translate3d(${active.left - bounds.left + root.scrollLeft - root.clientLeft}px, ${active.top - bounds.top + root.scrollTop - root.clientTop}px, 0)`;
      if (!marker.isConnected) root.append(marker);
      root.classList.add('indicator-ready');
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
      marker.remove();
      root.classList.remove('has-active-indicator', 'indicator-ready');
    });
  },
  beforeUnmount(root) {
    indicatorScopes.get(root)?.();
    indicatorScopes.delete(root);
  },
};
