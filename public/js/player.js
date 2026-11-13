// Плеер Yoru: свои контролы поверх <video>, HLS, субтитры, каналы CDN.
import { $$, esc, store, fmtTime, absUrl } from './core.js';
import { translationLabel } from './translation-names.js';
import { cancelSurfaceMotion, surfaceMotion } from './interface-motion.js';

export const KIND = { voice: 'Озвучка', sub: 'Субтитры', raw: 'Оригинал' };
export const LANG = { ru: 'рус', en: 'англ', ja: 'яп', uk: 'укр' };
export const kindOf = (tr) => (tr.typeKind === 'voice' || tr.typeKind === 'sub' || tr.typeKind === 'raw') ? tr.typeKind : (String(tr.type || '').startsWith('voice') ? 'voice' : String(tr.type || '').startsWith('sub') ? 'sub' : 'raw');
export const trMeta = (t) => [LANG[t.typeLang] || t.typeLang, t.height ? t.height + 'p' : ''].filter(Boolean).join(', ');

const IC = {
  play: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M7 4.5v15a1 1 0 0 0 1.5.86l12.5-7.5a1 1 0 0 0 0-1.72L8.5 3.64A1 1 0 0 0 7 4.5z"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="5.5" y="4" width="4.5" height="16" rx="1.3"/><rect x="14" y="4" width="4.5" height="16" rx="1.3"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5"/><path d="M3.5 3.5v5h5"/><text x="12.6" y="15.6" font-size="7.6" font-weight="700" font-family="Onest, sans-serif" text-anchor="middle" fill="currentColor" stroke="none">10</text></svg>',
  fwd: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 12a8.5 8.5 0 1 1-2.6-6.1l2.6 2.6"/><path d="M20.5 3.5v5h-5"/><text x="11.4" y="15.6" font-size="7.6" font-weight="700" font-family="Onest, sans-serif" text-anchor="middle" fill="currentColor" stroke="none">10</text></svg>',
  next: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M5 5.2v13.6a.8.8 0 0 0 1.2.7l10.3-6.8a.8.8 0 0 0 0-1.4L6.2 4.5a.8.8 0 0 0-1.2.7z"/><rect x="17.2" y="4.5" width="2.6" height="15" rx="1"/></svg>',
  vol: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2.5v6H6l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/></svg>',
  volLow: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2.5v6H6l5 4z" fill="currentColor"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/></svg>',
  mute: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 5 6 9H2.5v6H6l5 4z" fill="currentColor"/><path d="m22 9-6 6M16 9l6 6"/></svg>',
  cc: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="2.5" y="5" width="19" height="14" rx="3.5"/><path d="M10.6 10.3a2.4 2.4 0 1 0 0 3.4M17.1 10.3a2.4 2.4 0 1 0 0 3.4"/></svg>',
  voice: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8"/><circle cx="16" cy="7" r="2.2"/><circle cx="10" cy="17" r="2.2"/></svg>',
  pip: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2.5" y="4.5" width="19" height="15" rx="2.5"/><rect x="12" y="11" width="7" height="6" rx="1.2" fill="currentColor" stroke="none"/></svg>',
  fs: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  fsExit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round"><path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
};

/*
 * Плеер: свои контролы поверх <video>.
 * h — связь со страницей: groups(), cur(), pickTr(tr), next/prev, onProgress, onEnded, fallbackMp4(height)
 */
// Каналы CDN: разные хосты в stream[].urls. Название угадываем по адресу.
const hostOf = (u) => { try { return new URL(u).host; } catch { return ''; } };
export function cdnLabel(host) {
  if (/cloudflare|(^|[.-])cf\d*[.-]/i.test(host)) return 'CDN Cloudflare';
  if (/bunny|b-cdn/i.test(host)) return 'CDN Bunny';
  if (/\.(ru|su|xn--p1ai)$/i.test(host)) return 'РФ';
  return host;
}
export const preferredHost = () => store.get('cdnHost', '');

// Скорость канала: качаем кусок видео (или первый сегмент HLS) через локальный прокси.
export async function measure(url, limitBytes = 2_000_000) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 12000);
  try {
    let target = '/fwd?u=' + encodeURIComponent(url);
    if (/\.m3u8(\?|$)/i.test(url)) {
      for (let depth = 0; depth < 2; depth++) {
        const text = await (await fetch(target, { signal: ctl.signal })).text();
        const line = text.split(/\r?\n/).map((x) => x.trim()).find((x) => x && !x.startsWith('#'));
        if (!line) throw new Error('пустой плейлист');
        target = line;
        const inner = decodeURIComponent((line.match(/[?&]u=([^&]+)/) || [])[1] || '');
        if (!/\.m3u8(\?|$)/i.test(inner)) break;
      }
    }
    const t0 = performance.now();
    const r = await fetch(target, { headers: { Range: `bytes=0-${limitBytes - 1}` }, signal: ctl.signal });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const reader = r.body.getReader();
    let bytes = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.length;
      if (bytes >= limitBytes) { ctl.abort(); break; }
    }
    const sec = (performance.now() - t0) / 1000;
    return { mbps: bytes * 8 / sec / 1e6, bytes, sec };
  } catch (e) {
    return { error: e.name === 'AbortError' ? 'нет ответа' : e.message };
  } finally { clearTimeout(timer); }
}

export function makePlayer(root, h) {
  const P = () => ({ vol: 1, muted: false, rate: 1, subs: true, subSize: 1, ...store.get('player', {}) });
  const setP = (patch) => store.set('player', { ...P(), ...patch });
  const isTouch = matchMedia('(hover: none)').matches;

  root.className = 'vp';
  root.tabIndex = 0;
  root.innerHTML = `
    <video playsinline preload="metadata"></video>
    <div class="vp-hit"></div>
    <div class="vp-subs" aria-hidden="true"></div>
    <div class="vp-ripple l"><span>−10 с</span></div><div class="vp-ripple r"><span>+10 с</span></div>
    <button class="vp-big" type="button" aria-label="Смотреть">${IC.play}</button>
    <div class="vp-spin" hidden><span class="spin"></span></div>
    <div class="vp-flash" role="status"></div>
    <div class="vp-top"><div class="vp-t1"></div><div class="vp-t2"></div></div>
    <div class="vp-logo" aria-hidden="true"><img alt=""><div class="vp-logo-sub"></div></div>
    <div class="vp-up" hidden></div>
    <div class="vp-ctrl">
      <div class="vp-bar" role="slider" aria-label="Перемотка" tabindex="-1">
        <div class="vp-track"><div class="vp-buf"></div><div class="vp-played"></div></div>
        <div class="vp-thumb"></div><div class="vp-tip"><div class="vp-prev"><video muted playsinline preload="none" disablepictureinpicture tabindex="-1"></video></div><span>0:00</span></div>
      </div>
      <div class="vp-row">
        <button class="vp-b" data-a="play" type="button" aria-label="Пауза (пробел)">${IC.play}</button>
        <button class="vp-b vp-hide-s" data-a="back" type="button" aria-label="Назад на 10 секунд (J)">${IC.back}</button>
        <button class="vp-b vp-hide-s" data-a="fwd" type="button" aria-label="Вперёд на 10 секунд (L)">${IC.fwd}</button>
        <button class="vp-b" data-a="next" type="button" aria-label="Следующая серия (Shift+N)">${IC.next}</button>
        <div class="vp-vol"><button class="vp-b" data-a="mute" type="button" aria-label="Звук (M)">${IC.vol}</button>
          <input class="vp-volr" type="range" min="0" max="1" step="0.02" aria-label="Громкость"></div>
        <span class="vp-time">0:00 / 0:00</span>
        <span class="vp-sp"></span>
        <button class="vp-pill" data-menu="tr" type="button" aria-label="Перевод">${IC.voice}<span class="vp-tr-name">Перевод</span></button>
        <button class="vp-pill vp-q" data-menu="q" type="button" aria-label="Качество"><span>Авто</span></button>
        <button class="vp-b" data-a="cc" type="button" aria-label="Субтитры (C)" aria-pressed="false">${IC.cc}</button>
        <button class="vp-b" data-menu="set" type="button" aria-label="Настройки плеера">${IC.gear}</button>
        <button class="vp-b vp-hide-s" data-a="pip" type="button" aria-label="Картинка в картинке">${IC.pip}</button>
        ${h.layout ? `<button class="vp-b vp-layout-control" data-a="episodes" type="button" aria-label="Список серий" aria-controls="watchEpisodes" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6h12M9 12h12M9 18h12M3 6h2M3 12h2M3 18h2"/></svg></button>
        <button class="vp-b vp-layout-control" data-a="wide" type="button" aria-label="Широкий режим" aria-pressed="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="5" width="20" height="14" rx="1"/><path d="M6 9v6M18 9v6"/></svg></button>` : ''}
        <button class="vp-b" data-a="fs" type="button" aria-label="Полный экран (F)">${IC.fs}</button>
      </div>
    </div>
    <div class="vp-menu" hidden role="menu"></div>
    <div class="vp-msg" hidden></div>`;

  const q = (s) => root.querySelector(s);
  const v = q('video'), bar = q('.vp-bar'), played = q('.vp-played'), buf = q('.vp-buf'), thumb = q('.vp-thumb'), tip = q('.vp-tip');
  const subsEl = q('.vp-subs'), menu = q('.vp-menu'), msgEl = q('.vp-msg'), flashEl = q('.vp-flash');
  const btn = (a) => q(`[data-a="${a}"]`);
  function syncLayout() {
    if (!h.layout) return;
    const wide = h.layout.isWide();
    btn('wide').setAttribute('aria-pressed', String(wide));
    btn('wide').setAttribute('aria-label', wide ? 'Обычный режим' : 'Широкий режим');
    btn('wide').title = wide ? 'Обычный режим' : 'Широкий режим';
    btn('episodes').hidden = !wide;
    btn('episodes').setAttribute('aria-expanded', String(h.layout.episodesOpen()));
  }
  syncLayout();
  let hls = null, streams = [], stream = null, cand = [], candIdx = 0, subBlob = null, hasSubs = false;
  const speeds = {};
  let idleT = 0, flashT = 0, upT = 0, menuKind = null, scrub = false, lastTap = { t: 0, side: '' }, dead = false, loadSeq = 0;

  // начальное состояние из настроек
  const p0 = P();
  v.volume = p0.vol; v.muted = p0.muted;
  q('.vp-volr').value = p0.muted ? 0 : p0.vol;
  root.style.setProperty('--sub-scale', p0.subSize);
  if (!document.pictureInPictureEnabled) btn('pip').remove();

  const flash = (text) => {
    flashEl.textContent = text; flashEl.classList.add('on');
    clearTimeout(flashT); flashT = setTimeout(() => flashEl.classList.remove('on'), 900);
  };
  const setTitle = (t1, t2) => { q('.vp-t1').textContent = t1; q('.vp-t2').textContent = t2; q('.vp-logo-sub').textContent = t2; };
  // Логотип названия по центру вместо текстового заголовка (как на AniScroll). Не загрузился — остаётся текст.
  const setLogo = (url, alt) => {
    const img = q('.vp-logo img');
    if (!url) { root.classList.remove('has-logo'); return; }
    img.onload = () => { if (img.naturalWidth > 0) root.classList.add('has-logo'); };
    img.onerror = () => root.classList.remove('has-logo');
    img.alt = alt || '';
    img.src = url;
  };

  /* --- видимость контролов --- */
  const wake = () => {
    root.classList.remove('idle');
    clearTimeout(idleT);
    idleT = setTimeout(() => {
      const f = document.activeElement;
      if (!v.paused && !menuKind && !scrub && !(f && f.closest && f.closest('.vp-ctrl') && f.matches(':focus-visible'))) root.classList.add('idle');
    }, 2600);
  };
  root.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') wake(); });
  root.addEventListener('pointerleave', () => { if (!v.paused && !menuKind) root.classList.add('idle'); });
  root.addEventListener('focusin', wake);

  /* --- воспроизведение --- */
  const toggle = () => { if (v.paused || v.ended) v.play().catch(() => {}); else v.pause(); };
  const seekBy = (d) => { if (!isFinite(v.duration)) return; v.currentTime = Math.max(0, Math.min(v.duration - 0.3, v.currentTime + d)); wake(); };
  const setVol = (x) => {
    x = Math.max(0, Math.min(1, x));
    v.volume = x; v.muted = x === 0;
    setP({ vol: x || P().vol, muted: x === 0 });
  };
  const drawVol = () => {
    const m = btn('mute');
    m.innerHTML = v.muted || v.volume === 0 ? IC.mute : v.volume < 0.5 ? IC.volLow : IC.vol;
    q('.vp-volr').value = v.muted ? 0 : v.volume;
    q('.vp-volr').style.setProperty('--p', (v.muted ? 0 : v.volume) * 100 + '%');
  };
  const drawPlay = () => {
    const playing = !v.paused && !v.ended;
    root.classList.toggle('playing', playing);
    btn('play').innerHTML = playing ? IC.pause : IC.play;
    btn('play').setAttribute('aria-label', playing ? 'Пауза (пробел)' : 'Смотреть (пробел)');
    if (!playing) root.classList.remove('idle'); else wake();
  };
  const drawTime = () => {
    const d = v.duration, t = scrub ? scrub.t : v.currentTime;
    const pct = isFinite(d) && d ? t / d * 100 : 0;
    played.style.width = pct + '%'; thumb.style.left = pct + '%';
    let b = 0;
    for (let i = 0; i < v.buffered.length; i++) if (v.buffered.start(i) <= v.currentTime + 1) b = v.buffered.end(i);
    buf.style.width = (isFinite(d) && d ? b / d * 100 : 0) + '%';
    q('.vp-time').textContent = `${fmtTime(t)} / ${isFinite(d) ? fmtTime(d) : '0:00'}`;
    bar.setAttribute('aria-valuenow', Math.round(t));
  };

  v.addEventListener('play', drawPlay);
  v.addEventListener('pause', drawPlay);
  v.addEventListener('ended', () => { drawPlay(); h.onEnded && h.onEnded(); });
  v.addEventListener('timeupdate', () => { drawTime(); h.onProgress && h.onProgress(v.currentTime, v.duration); });
  v.addEventListener('progress', drawTime);
  v.addEventListener('durationchange', drawTime);
  v.addEventListener('volumechange', drawVol);
  v.addEventListener('waiting', () => { q('.vp-spin').hidden = false; });
  ['playing', 'canplay', 'seeked', 'pause'].forEach((ev) => v.addEventListener(ev, () => { q('.vp-spin').hidden = true; }));
  v.addEventListener('loadedmetadata', () => { v.playbackRate = P().rate; });
  v.addEventListener('ratechange', () => setP({ rate: v.playbackRate }));
  v.addEventListener('error', () => { if (v.error && v.getAttribute('src')) failover('Браузер не смог открыть поток.'); });

  /* --- перемотка мышью и пальцем --- */
  const posToTime = (x) => {
    const r = bar.getBoundingClientRect();
    const f = Math.max(0, Math.min(1, (x - r.left) / r.width));
    return { f, t: f * (v.duration || 0) };
  };
  bar.addEventListener('pointermove', (e) => {
    if (!isFinite(v.duration)) return;
    const { f, t } = posToTime(e.clientX);
    tipTime.textContent = fmtTime(t);
    // подсказка не вылезает за края плеера
    const w = bar.clientWidth, half = (tip.offsetWidth || 0) / 2;
    tip.style.left = Math.max(half - 6, Math.min(w - half + 6, f * w)) + 'px';
    previewAt(t);
    if (scrub) { scrub = { t }; drawTime(); }
  });

  /* --- миниатюры при перемотке: второй, невидимый плеер на самом лёгком качестве ---
   * Только когда видео идёт напрямую с CDN: через сервер миниатюры тратили бы трафик VPS. */
  const tipTime = tip.querySelector('span');
  const pv = { v: q('.vp-prev video'), hls: null, src: '', want: null, busy: false, failed: '' };
  const previewEnabled = () => store.get('scrubPreview', true);
  function previewSource() {
    const c = cand[candIdx];
    if (!c || !c.direct || c.mp4 || !streams.length) return null;
    const low = streams.slice().sort((a, b) => a.height - b.height)[0];
    const host = hostOf(c.url);
    const u = (low.urls || []).find((x) => hostOf(x) === host) || c.url;
    return absUrl(u);
  }
  function previewReset() {
    if (pv.hls) { try { pv.hls.destroy(); } catch { /* ignore */ } pv.hls = null; }
    if (pv.src) { pv.v.removeAttribute('src'); try { pv.v.load(); } catch { /* ignore */ } }
    pv.src = ''; pv.want = null; pv.busy = false;
    root.classList.remove('has-prev');
  }
  function previewInit() {
    const src = previewEnabled() ? previewSource() : null;
    if (!src || src === pv.failed) { if (pv.src) previewReset(); return false; }
    if (pv.src === src) return true;
    previewReset();
    pv.src = src;
    const isHls = /\.m3u8(\?|$)/i.test(src);
    if (isHls && !pv.v.canPlayType('application/vnd.apple.mpegurl')) {
      loadHls().then((Hls) => {
        if (dead || pv.src !== src || !Hls || !Hls.isSupported()) return;
        // крошечный буфер: на каждую точку грузится один фрагмент низкого качества
        pv.hls = new Hls({ startLevel: 0, capLevelToPlayerSize: true, maxBufferLength: 1, maxMaxBufferLength: 2, maxBufferSize: 1e6, backBufferLength: 0, startPosition: pv.want || 0 });
        pv.hls.on(Hls.Events.ERROR, (_, d) => { if (d.fatal) { pv.failed = src; previewReset(); } });
        pv.hls.loadSource(src);
        pv.hls.attachMedia(pv.v);
      });
    } else {
      pv.v.preload = 'metadata';
      pv.v.src = src;
    }
    return true;
  }
  function previewAt(t) {
    if (!previewInit()) return;
    pv.want = t;
    if (pv.busy || pv.v.readyState < 1) return;
    if (Math.abs(pv.v.currentTime - t) < 1.5 && root.classList.contains('has-prev')) return;
    pv.busy = true;
    try { pv.v.currentTime = t; } catch { pv.busy = false; }
  }
  pv.v.addEventListener('loadedmetadata', () => { if (pv.want != null) previewAt(pv.want); });
  pv.v.addEventListener('seeked', () => {
    pv.busy = false;
    root.classList.add('has-prev');
    // пока грузился кадр, мышь ушла дальше — догоняем
    if (pv.want != null && Math.abs(pv.v.currentTime - pv.want) > 1.5) previewAt(pv.want);
  });
  pv.v.addEventListener('error', () => { if (pv.src && pv.v.getAttribute('src')) { pv.failed = pv.src; previewReset(); } });
  bar.addEventListener('pointerdown', (e) => {
    if (!isFinite(v.duration)) return;
    bar.setPointerCapture(e.pointerId);
    scrub = { t: posToTime(e.clientX).t };
    root.classList.add('scrub'); drawTime();
  });
  const endScrub = () => {
    if (!scrub) return;
    v.currentTime = scrub.t; scrub = false;
    root.classList.remove('scrub'); wake();
  };
  bar.addEventListener('pointerup', endScrub);
  bar.addEventListener('pointercancel', endScrub);

  /* --- клики по картинке: мышь — пауза, двойной — полный экран; палец — показать контролы, двойной тап — ±10 с --- */
  const hit = q('.vp-hit');
  hit.addEventListener('click', (e) => {
    if (menuKind) return closeMenu();
    if (isTouch) {
      const r = root.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const side = x < 0.35 ? 'l' : x > 0.65 ? 'r' : 'c';
      const now = Date.now();
      if (now - lastTap.t < 320 && side === lastTap.side && side !== 'c') {
        seekBy(side === 'l' ? -10 : 10);
        const rp = q('.vp-ripple.' + side); rp.classList.add('on'); setTimeout(() => rp.classList.remove('on'), 450);
        lastTap = { t: 0, side: '' };
        return;
      }
      lastTap = { t: now, side };
      if (root.classList.contains('idle') || v.paused) wake(); else root.classList.add('idle');
      return;
    }
    toggle();
  });
  hit.addEventListener('dblclick', () => { if (!isTouch) fullscreen(); });
  q('.vp-big').onclick = () => { toggle(); root.focus({ preventScroll: true }); };

  /* --- полный экран и PiP --- */
  const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement;
  function fullscreen() {
    if (fsEl()) { (document.exitFullscreen || document.webkitExitFullscreen).call(document).catch?.(() => {}); return; }
    const req = root.requestFullscreen || root.webkitRequestFullscreen;
    if (req) {
      Promise.resolve(req.call(root)).then(() => { try { screen.orientation.lock('landscape').catch(() => {}); } catch { /* нет */ } }).catch(() => {});
    } else if (v.webkitEnterFullscreen) v.webkitEnterFullscreen();
  }
  const onFs = () => {
    const on = fsEl() === root;
    root.classList.toggle('fs', on);
    btn('fs').innerHTML = on ? IC.fsExit : IC.fs;
    if (on) h.layout?.closeEpisodes();
    syncLayout();
  };
  document.addEventListener('fullscreenchange', onFs);
  document.addEventListener('webkitfullscreenchange', onFs);

  /* --- субтитры: рисуем сами, чтобы управлять стилем и размером --- */
  const drawCues = () => {
    const tt = v.textTracks[0];
    if (!tt || !P().subs) { subsEl.innerHTML = ''; return; }
    const cues = tt.activeCues ? [...tt.activeCues] : [];
    subsEl.innerHTML = cues.map((c) => `<span>${esc(c.text.replace(/<[^>]+>/g, ''))}</span>`).join('<br>');
  };
  const drawCC = () => {
    const b = btn('cc');
    b.disabled = !hasSubs;
    b.setAttribute('aria-pressed', hasSubs && P().subs);
    b.title = hasSubs ? '' : (h.cur() && kindOf(h.cur()) === 'sub' ? 'Субтитры вшиты в видео' : 'У озвучки нет отдельных субтитров');
  };
  function setSubs(vtt) {
    [...v.querySelectorAll('track')].forEach((t) => t.remove());
    if (subBlob) { URL.revokeObjectURL(subBlob); subBlob = null; }
    subsEl.innerHTML = '';
    hasSubs = !!vtt;
    drawCC();
    if (!vtt) return;
    subBlob = URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' }));
    const tr = document.createElement('track');
    Object.assign(tr, { kind: 'subtitles', label: 'Субтитры', srclang: 'ru', src: subBlob, default: true });
    v.append(tr);
    const arm = () => { const t = v.textTracks[0]; if (!t) return; t.mode = 'hidden'; t.oncuechange = drawCues; };
    tr.addEventListener('load', arm); arm();
  }
  const toggleSubs = () => {
    if (!hasSubs) return flash('Для этого перевода нет отдельных субтитров');
    setP({ subs: !P().subs }); drawCC(); drawCues();
    flash(P().subs ? 'Субтитры включены' : 'Субтитры выключены');
  };

  /* --- меню: перевод, качество, настройки --- */
  function menuHTML(kind) {
    if (kind === 'tr') {
      const g = h.groups(), cur = h.cur();
      return Object.keys(g).filter((k) => g[k].length).map((k) => `<h4>${KIND[k]}</h4>` + g[k].map((t) =>
        `<button class="vp-mi" type="button" role="menuitemradio" aria-checked="${cur && cur.id === t.id}" data-tr="${t.id}">
          ${cur && cur.id === t.id ? IC.check : '<i></i>'}<span>${esc(translationLabel(t.authorsSummary))}</span><em>${esc(trMeta(t))}</em></button>`).join('')).join('')
        || '<p class="vp-empty">У этой серии нет переводов.</p>';
    }
    if (kind === 'q') {
      const chans = channels();
      const curHost = cand[candIdx] && !cand[candIdx].mp4 ? hostOf(cand[candIdx].url) : '';
      return `<h4>Качество</h4>` + (streams.length ? streams.map((s) =>
        `<button class="vp-mi" type="button" role="menuitemradio" aria-checked="${s === stream}" data-q="${s.height}">
          ${s === stream ? IC.check : '<i></i>'}<span>${s.height}p</span><em>${s.height >= 1080 ? 'Full HD' : s.height >= 720 ? 'HD' : ''}</em></button>`).join('')
        : '<p class="vp-empty">Качество выбирается после загрузки видео.</p>')
        + (chans.length ? `<h4>Канал</h4>` + chans.map((host, i) => {
          const sp = speeds[host];
          const res = sp === 'run' ? 'проверяем…' : sp ? (sp.error ? sp.error : `${sp.mbps.toFixed(1)} Мбит/с`) : cdnLabel(host) !== host ? cdnLabel(host) : '';
          return `<button class="vp-mi" type="button" role="menuitemradio" aria-checked="${host === curHost}" data-host="${esc(host)}">
            ${host === curHost ? IC.check : '<i></i>'}<span>Канал ${i + 1}<small>${esc(host)}</small></span><em>${esc(res)}</em></button>`;
        }).join('') + `<div class="vp-menu-a">${!h.allowProxy || h.allowProxy() ? `<button class="btn ghost small" type="button" data-speed>${chans.length > 1 ? 'Проверить скорость' : 'Проверить канал'}</button>` : ''}
          ${h.profileUrl ? `<a class="vp-link" href="${esc(h.profileUrl)}" target="_blank" rel="noopener">Канал аккаунта</a>` : ''}</div>
          <p class="vp-keys">${chans.length > 1 ? 'Если видео грузится медленно, выберите другой канал.' : 'Anime365 отдал один канал. Другие каналы включаются в профиле Anime365, ссылка выше.'}</p>` : '');
    }
    const p = P();
    const seg = (name, items, val) => `<div class="vp-seg">${items.map(([x, label]) =>
      `<button type="button" data-${name}="${x}" aria-pressed="${x === val}">${label}</button>`).join('')}</div>`;
    return `<h4>Скорость</h4>${seg('rate', [[0.75, '0.75×'], [1, '1×'], [1.25, '1.25×'], [1.5, '1.5×'], [2, '2×']], p.rate)}
      <h4>Размер субтитров</h4>${seg('ss', [[0.8, 'Мелкий'], [1, 'Обычный'], [1.25, 'Крупный']], p.subSize)}
      <label class="vp-mi vp-switch"><i></i><span>Следующая серия автоматически</span><input class="toggle" type="checkbox" id="vpAuto" ${store.get('autoNext', true) ? 'checked' : ''}></label>
      ${isTouch ? '<p class="vp-keys">Двойное касание слева или справа перематывает на 10 секунд.</p>' : '<p class="vp-keys"><kbd>Пробел</kbd> пауза, <kbd>←</kbd> <kbd>→</kbd> 5 с, <kbd>J</kbd> <kbd>L</kbd> 10 с, <kbd>S</kbd> +85 с, <kbd>C</kbd> субтитры, <kbd>M</kbd> звук, <kbd>F</kbd> полный экран, <kbd>Shift</kbd>+<kbd>N</kbd> следующая серия</p>'}`;
  }
  function openMenu(kind) {
    if (menuKind === kind) return closeMenu();
    menuKind = kind;
    menu.innerHTML = menuHTML(kind);
    menu.dataset.kind = kind;
    menu.hidden = false;
    menu.inert = false;
    surfaceMotion(menu, true, { offset: 7 });
    root.classList.remove('idle');
    $$('[data-menu]', root).forEach((b) => b.setAttribute('aria-expanded', b.dataset.menu === kind));
    const sel = menu.querySelector('[aria-checked="true"]');
    if (sel) sel.scrollIntoView({ block: 'nearest' });
  }
  function closeMenu() {
    if (menuKind) {
      const trigger = root.querySelector(`[data-menu="${menuKind}"]`);
      if (menu.contains(document.activeElement)) trigger?.focus({ preventScroll: true });
      menuKind = null;
      menu.inert = true;
      surfaceMotion(menu, false, { done: () => { menu.hidden = true; } });
    }
    $$('[data-menu]', root).forEach((b) => b.setAttribute('aria-expanded', 'false'));
    wake();
  }
  menu.addEventListener('click', (e) => {
    if (e.target.closest('[data-speed]')) { runSpeedTest(); return; }
    const t = e.target.closest('[data-tr],[data-q],[data-rate],[data-ss],[data-host]');
    if (!t) return;
    if (t.dataset.host) { closeMenu(); pickHost(t.dataset.host); return; }
    if (t.dataset.tr) { closeMenu(); const tr = h.groups && Object.values(h.groups()).flat().find((x) => x.id === +t.dataset.tr); if (tr) h.pickTr(tr); }
    else if (t.dataset.q) { closeMenu(); pickQuality(+t.dataset.q); }
    else if (t.dataset.rate) { v.playbackRate = +t.dataset.rate; setP({ rate: +t.dataset.rate }); menu.innerHTML = menuHTML('set'); flash(`Скорость ${t.dataset.rate}×`); }
    else if (t.dataset.ss) { setP({ subSize: +t.dataset.ss }); root.style.setProperty('--sub-scale', +t.dataset.ss); menu.innerHTML = menuHTML('set'); }
  });
  menu.addEventListener('change', (e) => { if (e.target.id === 'vpAuto') store.set('autoNext', e.target.checked); });
  const outside = (e) => { if (menuKind && !e.target.closest('.vp-menu,[data-menu]')) closeMenu(); };
  document.addEventListener('pointerdown', outside, true);

  /* --- кнопки панели --- */
  root.querySelector('.vp-ctrl').addEventListener('click', (e) => {
    const m = e.target.closest('[data-menu]');
    if (m) return openMenu(m.dataset.menu);
    const a = e.target.closest('[data-a]');
    if (!a) return;
    const act = a.dataset.a;
    if (act === 'play') toggle();
    else if (act === 'back') seekBy(-10);
    else if (act === 'fwd') seekBy(10);
    else if (act === 'next') h.next && h.next();
    else if (act === 'mute') { if (v.muted || v.volume === 0) setVol(P().vol || 1); else { v.muted = true; setP({ muted: true }); } }
    else if (act === 'cc') toggleSubs();
    else if (act === 'fs') fullscreen();
    else if (act === 'wide') { h.layout.toggleWide(); syncLayout(); }
    else if (act === 'episodes') { h.layout.toggleEpisodes(); syncLayout(); }
    else if (act === 'pip') (document.pictureInPictureElement ? document.exitPictureInPicture() : v.requestPictureInPicture()).catch(() => {});
  });
  q('.vp-volr').addEventListener('input', (e) => setVol(+e.target.value));

  /* --- источник видео --- */
  function pickQuality(height) {
    const s = streams.find((x) => x.height === height);
    if (!s || s === stream) return;
    store.set('quality', height);
    const t = v.currentTime, play = !v.paused;
    useStream(s, t, play);
    flash(`${height}p`);
  }
  function useStream(s, startAt, autoplay) {
    stream = s;
    previewReset();
    const pref = preferredHost();
    const urls = s.urls.slice().sort((a, b) => (hostOf(b) === pref) - (hostOf(a) === pref));
    // напрямую с CDN (не тратит трафик сервера), при ошибке — тот же адрес через сервер
    const proxyOk = !h.allowProxy || h.allowProxy();
    const direct = (h.direct && h.direct()) || !proxyOk;
    cand = [
      // сначала все каналы напрямую, и только потом — через сервер
      ...(direct ? urls.map((u) => ({ url: u, direct: true })) : []),
      ...(proxyOk ? urls.map((u) => ({ url: u })) : []),
      ...(h.fallbackMp4 && proxyOk ? [{ url: h.fallbackMp4(s.height), mp4: true }] : []),
    ];
    candIdx = 0;
    q('.vp-q span').textContent = s.height + 'p';
    attach(startAt, autoplay);
  }
  function attach(startAt, autoplay) {
    const my = ++loadSeq;
    if (hls) { try { hls.destroy(); } catch { /* ignore */ } hls = null; }
    const c = cand[candIdx];
    if (!c) return;
    const src = c.mp4 ? c.url : c.direct ? absUrl(c.url) : '/fwd?u=' + encodeURIComponent(absUrl(c.url));
    const isHls = !c.mp4 && /\.m3u8(\?|$)/i.test(c.url);
    q('.vp-spin').hidden = false;
    const go = () => {
      if (my !== loadSeq) return;
      if (startAt) { try { v.currentTime = startAt; } catch { /* ignore */ } }
      if (autoplay) v.play().catch(() => drawPlay());
    };
    v.addEventListener('loadedmetadata', go, { once: true });
    if (isHls && !v.canPlayType('application/vnd.apple.mpegurl')) {
      loadHls().then((Hls) => {
        if (dead || my !== loadSeq) return;
        if (!Hls || !Hls.isSupported()) { v.src = src; return; }
        hls = new Hls({ maxBufferLength: 45, startPosition: startAt || -1 });
        hls.on(Hls.Events.ERROR, (_, d) => {
          if (!d.fatal || my !== loadSeq) return;
          if (d.type === Hls.ErrorTypes.MEDIA_ERROR) { hls.recoverMediaError(); return; }
          failover('Поток не загрузился.');
        });
        hls.loadSource(src);
        hls.attachMedia(v);
      });
    } else {
      v.src = src;
    }
  }
  function channels() {
    const out = [];
    for (const s of streams) for (const u of s.urls || []) { const host = hostOf(u); if (host && !out.includes(host)) out.push(host); }
    return out;
  }
  function pickHost(host) {
    store.set('cdnHost', host);
    if (!stream) return;
    const t = v.currentTime, play = !v.paused;
    useStream(stream, t, play);
    flash(`Канал: ${cdnLabel(host)}`);
  }
  async function runSpeedTest() {
    const chans = channels();
    for (const host of chans) speeds[host] = 'run';
    if (menuKind === 'q') menu.innerHTML = menuHTML('q');
    for (const host of chans) {
      const s = streams.find((x) => x.urls.some((u) => hostOf(u) === host));
      const url = s.urls.find((u) => hostOf(u) === host);
      speeds[host] = await measure(url);
      if (menuKind === 'q') menu.innerHTML = menuHTML('q');
    }
    const best = chans.filter((x) => speeds[x] && speeds[x].mbps).sort((a, b) => speeds[b].mbps - speeds[a].mbps)[0];
    if (best && chans.length > 1) {
      const curHost = cand[candIdx] && hostOf(cand[candIdx].url);
      if (best !== curHost) { flash(`Самый быстрый: канал ${chans.indexOf(best) + 1}`); pickHost(best); }
      else flash('Вы уже на самом быстром канале');
    } else if (best) flash(`${speeds[best].mbps.toFixed(1)} Мбит/с`);
    else flash('Канал не ответил');
  }
  function failover(reason) {
    if (dead) return;
    const t = v.currentTime, play = !v.paused || !v.currentTime;
    if (candIdx + 1 < cand.length) { candIdx++; attach(t, play); return; }
    const other = streams.find((s) => s !== stream && !s._failed);
    if (stream) stream._failed = true;
    if (other) { flash(`Переключаемся на ${other.height}p`); useStream(other, t, play); return; }
    h.onFatal && h.onFatal(reason);
  }

  function showMsg(html) { msgEl.innerHTML = html; msgEl.hidden = false; q('.vp-spin').hidden = true; root.classList.add('has-msg'); }
  function hideMsg() { msgEl.hidden = true; msgEl.innerHTML = ''; root.classList.remove('has-msg'); }

  /* --- следующая серия --- */
  function upNext(label, auto) {
    const box = q('.vp-up');
    box.hidden = false;
    box.innerHTML = `<p class="vp-up-l">Дальше</p><p class="vp-up-t">${esc(label)}</p>
      ${auto ? '<div class="vp-count"><i></i></div>' : ''}
      <div class="vp-up-a"><button class="btn primary small" type="button" data-up="go">${IC.play}Смотреть</button>
      <button class="btn ghost small" type="button" data-up="no">${auto ? 'Отмена' : 'Закрыть'}</button></div>`;
    box.onclick = (e) => {
      const b = e.target.closest('[data-up]'); if (!b) return;
      clearTimeout(upT); box.hidden = true;
      if (b.dataset.up === 'go') h.next();
    };
    if (auto) {
      const bar2 = box.querySelector('.vp-count i');
      requestAnimationFrame(() => requestAnimationFrame(() => { bar2.style.transition = 'width 8s linear'; bar2.style.width = '0%'; }));
      clearTimeout(upT); upT = setTimeout(() => { box.hidden = true; h.next(); }, 8000);
    }
  }
  v.addEventListener('play', () => { clearTimeout(upT); q('.vp-up').hidden = true; });

  /* --- клавиатура (вызывается со страницы) --- */
  function key(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return false;
    const inPlayer = root.contains(document.activeElement);
    switch (e.code) {
      case 'Space': case 'KeyK': toggle(); flash(v.paused ? 'Пауза' : 'Воспроизведение'); return true;
      case 'ArrowLeft': seekBy(-5); flash('−5 с'); return true;
      case 'ArrowRight': seekBy(5); flash('+5 с'); return true;
      case 'KeyJ': seekBy(-10); flash('−10 с'); return true;
      case 'KeyL': seekBy(10); flash('+10 с'); return true;
      case 'ArrowUp': if (!inPlayer && !fsEl()) return false; setVol((v.muted ? 0 : v.volume) + 0.05); flash(`Громкость ${Math.round(v.volume * 100)}%`); return true;
      case 'ArrowDown': if (!inPlayer && !fsEl()) return false; setVol((v.muted ? 0 : v.volume) - 0.05); flash(`Громкость ${Math.round(v.volume * 100)}%`); return true;
      case 'KeyM': btn('mute').click(); flash(v.muted ? 'Без звука' : 'Звук включён'); return true;
      case 'KeyF': fullscreen(); return true;
      case 'KeyC': toggleSubs(); return true;
      case 'KeyS': if (!e.shiftKey) { seekBy(85); flash('+85 с'); return true; } return false;
      case 'Period': if (e.shiftKey) { v.playbackRate = Math.min(2, v.playbackRate + 0.25); flash(`Скорость ${v.playbackRate}×`); return true; } return false;
      case 'Comma': if (e.shiftKey) { v.playbackRate = Math.max(0.5, v.playbackRate - 0.25); flash(`Скорость ${v.playbackRate}×`); return true; } return false;
      case 'Escape': if (menuKind) { closeMenu(); return true; } return false;
      default:
        if (/^Digit\d$/.test(e.code) && isFinite(v.duration)) { v.currentTime = v.duration * (+e.code.slice(5) / 10); return true; }
        return false;
    }
  }

  drawVol(); drawPlay(); drawCC();
  return {
    video: v, key, setTitle, setLogo, showMsg, hideMsg, setSubs, upNext, flash,
    setTrName(name) { q('.vp-tr-name').textContent = name; },
    setNext(has) { btn('next').disabled = !has; },
    load(list, startAt, autoplay) {
      hideMsg();
      streams = list.slice().sort((a, b) => b.height - a.height);
      const seen = store.get('cdnHosts', []);
      for (const st of streams) for (const u of st.urls || []) { const hh = hostOf(u); if (hh && !seen.includes(hh)) seen.unshift(hh); }
      store.set('cdnHosts', seen.slice(0, 12));
      const want = store.get('quality', 0);
      const s = (want && streams.find((x) => x.height === want)) || streams.find((x) => x.height <= 1080) || streams[0];
      q('.vp-q').disabled = streams.length < 2;
      useStream(s, startAt, autoplay);
    },
    stop() {
      loadSeq++;
      if (hls) { try { hls.destroy(); } catch { /* ignore */ } hls = null; }
      v.pause(); v.removeAttribute('src'); v.load();
      streams = []; stream = null; q('.vp-q span').textContent = 'Авто'; q('.vp-q').disabled = true;
      setSubs(null);
    },
    loading() { hideMsg(); q('.vp-spin').hidden = false; },
    destroy() {
      dead = true; this.stop();
      cancelSurfaceMotion(menu);
      clearTimeout(idleT); clearTimeout(upT); clearTimeout(flashT);
      document.removeEventListener('fullscreenchange', onFs);
      document.removeEventListener('webkitfullscreenchange', onFs);
      document.removeEventListener('pointerdown', outside, true);
      if (fsEl() === root) document.exitFullscreen().catch(() => {});
    },
  };
}


let hlsPromise = null;
export function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  if (hlsPromise) return hlsPromise;
  const tryLoad = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = () => res(window.Hls); s.onerror = rej;
    document.head.append(s);
  });
  hlsPromise = tryLoad('https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js')
    .catch(() => tryLoad('https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.min.js'))
    .catch(() => null);
  return hlsPromise;
}


/* ASS/SSA → WebVTT: только текст и тайминги, без стилей и позиционирования */
export function assToVtt(ass) {
  const lines = String(ass).split(/\r?\n/);
  let fmt = null, inEvents = false;
  const cues = [];
  const t = (x) => {
    const m = String(x).trim().match(/(\d+):(\d\d):(\d\d)[.,](\d\d)/);
    return m ? `${m[1].padStart(2, '0')}:${m[2]}:${m[3]}.${m[4]}0` : null;
  };
  for (const line of lines) {
    if (/^\[events\]/i.test(line)) { inEvents = true; continue; }
    if (/^\[/.test(line)) { inEvents = false; continue; }
    if (!inEvents) continue;
    if (/^format:/i.test(line)) { fmt = line.slice(7).split(',').map((x) => x.trim().toLowerCase()); continue; }
    if (!/^dialogue:/i.test(line) || !fmt) continue;
    const parts = line.slice(9).split(',');
    const row = {};
    fmt.forEach((f, i) => { row[f] = i === fmt.length - 1 ? parts.slice(i).join(',') : parts[i]; });
    const start = t(row.start), end = t(row.end);
    if (!start || !end) continue;
    let text = String(row.text || '');
    if (/\\p[1-9]/.test(text)) continue;                    // векторная графика
    text = text.replace(/\{[^}]*\}/g, '').replace(/\\N/gi, '\n').replace(/\\h/g, ' ').trim();
    if (!text) continue;
    text = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    cues.push({ start, end, text });
  }
  cues.sort((a, b) => a.start.localeCompare(b.start));
  return cues.length ? 'WEBVTT\n\n' + cues.map((c) => `${c.start} --> ${c.end}\n${c.text}`).join('\n\n') + '\n' : '';
}

