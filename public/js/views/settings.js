// Настройки по разделам (#settings/<раздел>): аккаунт, главный экран, аниме, плеер, данные.
import { $, $$, esc, store, state, toast, imgSrc, ICON, postJson, VIDEO_RU, mb, relTime } from '../core.js';
import { refreshAuth, loggedIn } from '../shiki.js';
import { api365, token, lib } from '../api365.js';
import { HOME_ROWS, HERO_SOURCES, ROW_MODES, rowMode, heroLook, homePrefs, dupRow, setRowVisible, orderedHomeRows, moveHomeRow } from './home.js';
import { openModal } from '../ui.js';
import { FITS, ALIGNS, bannerLook } from '../fitart.js';
import { applyBackground, applyMetadataIcons, applyMenu, applyWidth, BACKGROUND_PATTERNS, backgroundPrefs, WIDTHS, WIDTH_MIN, WIDTH_MAX, contentWidth } from '../menu.js';
const isCustomWidth = () => store.get('contentWidthMode', '') === 'custom'
  || (contentWidth() !== 'full' && !WIDTHS.some(([key]) => key === contentWidth()));
const widthOptions = [...WIDTHS, ['custom', 'Своё', 'Выберите ширину ползунком']];
const customWidth = () => {
  const value = Number(store.get('customContentWidth', contentWidth() === 'full' ? 1360 : contentWidth()));
  return Math.min(WIDTH_MAX, Math.max(WIDTH_MIN, Number.isFinite(value) ? value : 1360));
};
import { cdnLabel, measure } from '../player.js';
import { BANNER_SOURCES, COVER_SOURCES, bannerSource, coverSource, posterHTML } from '../art.js';

export const CHRONO_MODES = [
  ['seasons', 'Только сезоны', 'ТВ-сериалы и длинные ONA. Без фильмов, OVA, спешлов и рекапов'],
  ['seasons_movies', 'Сезоны и фильмы', 'Сезоны плюс полнометражные фильмы'],
  ['all', 'Вся хронология', 'Все части франшизы: OVA, спешлы, рекапы, клипы'],
];
const CHRONO_LAYOUTS = [
  ['horizontal', 'Горизонтально', 'Одна прокручиваемая строка'],
  ['vertical', 'Вертикально', 'Карточки друг под другом на широком экране'],
];

async function refreshMe() {
  try { const r = await fetch('/me', { cache: 'no-store' }); if (r.ok) state.me = await r.json(); } catch { /* офлайн */ }
}

export const settingsIcons = {
  appearance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h16"/><path d="M8 4v4m8 2v4m-6 2v4"/></svg>',
  account: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="14" width="8" height="6" rx="1.5"/><rect x="13" y="14" width="8" height="6" rx="1.5"/></svg>',
  anime: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  player: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="m10 9.5 4.5 2.5-4.5 2.5z"/></svg>',
  data: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="12" cy="5.5" rx="8" ry="3"/><path d="M4 5.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6M4 11.5v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/></svg>',
};
export const SET_SECTIONS = [
  ['account', 'Аккаунт', 'Shikimori, Anime365'],
  ['appearance', 'Внешний вид', 'Тема, меню, фон и обложки'],
  ['home', 'Главный экран', 'Большой блок и ряды'],
  ['anime', 'Страница тайтла', 'Нумерация и вид хронологии'],
  ['player', 'Плеер', 'Воспроизведение, озвучка, субтитры'],
  ['data', 'Данные', 'Продолжить просмотр, история, кэш'],
];
export const MENU_MODES = [
  ['v', 'Вертикальное', 'Панель разделов слева'],
  ['h', 'Горизонтальное', 'Панель сверху, всегда на виду'],
];

export const prepareSettings = (key) => key === 'account' ? Promise.all([refreshAuth(), refreshMe()]) : Promise.resolve();
export const sectionHTML = (key) => SECTION_HTML[key]();
export const bindSettings = (key, refresh) => SECTION_BIND[key](refresh);

const on = (sel, ev, fn) => { const el = $(sel); if (el) el[ev] = fn; };
const radios = (name, fn) => $$(`input[name="${name}"]`).forEach((r) => r.onchange = () => fn(r.value));
const helpHTML = (id, description) => description ? `<span class="choice-help"><button class="choice-help-button" type="button" aria-label="Описание варианта" aria-describedby="${id}">i</button><span class="choice-tooltip" id="${id}" role="tooltip">${esc(description)}</span></span>` : '';
const choice = (name, items, val, cls = 'choice') => `<div class="${cls}" role="radiogroup">${items.map(([v, t, d, off]) =>
  `<div class="choice-item${off ? ' is-off' : ''}"><label class="choice-label"><input type="radio" name="${name}" value="${v}" ${val === v ? 'checked' : ''} ${off ? 'disabled' : ''} ${d ? `aria-describedby="help-${name}-${v}"` : ''}><span><b>${t}</b></span></label>${helpHTML(`help-${name}-${v}`, d)}</div>`).join('')}</div>`;
const toggle = (id, title, sub, val) => `<label class="row-line setting-toggle"><span><b id="${id}Label">${title}</b>${sub ? `<small id="${id}Help">${sub}</small>` : ''}</span><input class="toggle" type="checkbox" id="${id}" aria-labelledby="${id}Label" ${sub ? `aria-describedby="${id}Help"` : ''} ${val ? 'checked' : ''}></label>`;

const SECTION_HTML = {
  /* ---------- Аккаунт: Shikimori и Anime365 ---------- */
  account() {
    const me = state.me || {};
    const hosts = store.get('cdnHosts', []);
    const cdn = store.get('cdnHost', '');
    const [vTitle, vText] = VIDEO_RU[me.video] || VIDEO_RU.direct;
    const capped = me.video !== 'direct' && me.dailyCapMB > 0;
    return `
      <details class="set-card anime365-settings" id="set365">
        <summary><span><b>Anime365</b><small>${me.anime365 ? 'Токен сохранён' : me.sharedAnime365 ? 'Общий токен сервера' : 'Настроить доступ к видео'}</small></span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg></summary>
        <div class="anime365-settings-body">
        <p class="set-lead">Видео и переводы берутся с вашего аккаунта Anime365: без токена сайт не отдаёт ссылки на видео, а смотреть могут только аккаунты с подпиской.</p>
        ${me.anime365 ? '<p class="status ok" id="tokSaved">Ваш токен сохранён на сервере Yoru. Его видите только вы.</p>'
          : me.sharedAnime365 ? '<p class="set-note">Сейчас используется общий токен сервера. Можно указать свой.</p>' : '<p class="status err">Токен не задан — видео не загрузится.</p>'}
        <label class="field"><span>${me.anime365 ? 'Заменить токен' : 'Токен API'}</span>
          <input class="input" id="setToken" type="password" autocomplete="off" spellcheck="false" placeholder="access_token">
          <small>Войдите на <a href="${esc(state.site)}" target="_blank" rel="noopener">Anime365</a>, создайте API-клиент на <a href="${esc(state.site)}/api-clients" target="_blank" rel="noopener">странице API-клиентов</a> и получите токен по <a href="${esc(state.site)}/api-docs" target="_blank" rel="noopener">документации</a>.</small>
        </label>
        <div class="set-actions"><button class="btn primary small" type="button" id="saveToken">Проверить и сохранить</button>
          ${me.anime365 ? '<button class="btn ghost small" type="button" id="checkToken">Проверить сохранённый</button><button class="btn ghost small" type="button" id="delToken">Удалить</button>' : ''}</div>
        <p class="status" id="tokenStatus" role="status"></p>

        <h3>Загрузка видео</h3>
        <div class="vid-mode vid-${esc(me.video || 'direct')}"><b>${esc(vTitle)}</b><span>${esc(vText)}</span>
          ${capped ? `<span class="vid-cap"><i style="width:${Math.min(100, (me.trafficToday / (me.dailyCapMB * 1048576)) * 100).toFixed(1)}%"></i></span><small>Через сервер сегодня: ${mb(me.trafficToday)} из ${mb(me.dailyCapMB * 1048576)}</small>` : ''}
          <small>Режим для вашего аккаунта выбирает администратор Yoru.</small></div>

        <h3>Канал видео</h3>
        <p class="set-note">Anime365 раздаёт видео через несколько CDN. Yoru переключается между каналами, которые сайт вернул для серии. Какие каналы сайт выдаёт вашему аккаунту, задаётся в <a href="${esc(state.site)}/users/profile" target="_blank" rel="noopener">профиле Anime365 ${ICON.ext}</a>.</p>
        <label class="field"><span>Предпочитаемый канал</span>
          <select class="input" id="setCdn"><option value="">Автоматически: первый, который отдал сайт</option>
            ${hosts.map((h, i) => `<option value="${esc(h)}" ${cdn === h ? 'selected' : ''}>Канал ${i + 1}: ${esc(cdnLabel(h) === h ? h : `${cdnLabel(h)} (${h})`)}</option>`).join('')}</select>
          <small>${hosts.length ? 'Список пополняется каналами, которые встречались при просмотре.' : 'Каналы появятся здесь после первого просмотра.'}</small>
        </label>
        ${hosts.length && me.video !== 'direct' ? '<div class="set-actions"><button class="btn ghost small" type="button" id="testCdn">Проверить скорость каналов</button></div><ul class="cdn-res" id="cdnRes"></ul>' : ''}
        </div>
      </details>`;
  },

  appearance() {
    const me = state.me || {};
    const bl = bannerLook();
    const background = backgroundPrefs();
    return `
      <section class="set-card">
        <h2>Меню и ширина</h2>
        <p class="set-lead">Где показывать разделы Yoru. На телефоне меню всегда внизу экрана.</p>
        ${choice('menuMode', MENU_MODES.map(([v, t, d]) => [v, `<span class="menu-pic menu-pic-${v}" aria-hidden="true"><i></i><i></i><i></i></span>${t}`, d]), store.get('menu', 'h'), 'choice choice-row menu-choice')}
        <h3>Ширина содержимого</h3>
        <p class="set-note" style="margin-top:0">На широком мониторе содержимое можно собрать в колонку по центру. Баннеры занимают всю ширину окна.</p>
        ${choice('contentWidth', widthOptions, isCustomWidth() ? 'custom' : contentWidth(), 'choice width-choice')}
        <label class="width-slider${isCustomWidth() ? ' is-on' : ''}" id="widthSlider"><span>Своя ширина</span>
          <input type="range" id="widthRange" min="${WIDTH_MIN}" max="${WIDTH_MAX}" step="20" value="${customWidth()}" ${isCustomWidth() ? '' : 'disabled'} aria-label="Своя ширина содержимого, пикселей">
          <output id="widthOut">${contentWidth() === 'full' ? 'выкл.' : contentWidth() + ' px'}</output></label>
        ${toggle('setNavLabels', 'Подписи пунктов на телефоне', 'Выключите, чтобы в нижнем меню остались только значки — оно станет ниже', store.get('navLabels', false) !== false)}
      </section>
      <section class="set-card">
        <h2>Фон</h2>
        ${toggle('setPatternBackground', 'Паттерн фон', 'Едва заметный узор на фоне страниц', background.enabled)}
        <div id="patternSettings" ${background.enabled ? '' : 'hidden'}>
          <h3>Узор</h3>
          ${choice('backgroundPattern', BACKGROUND_PATTERNS.map(([id, title, description]) =>
            [id, `<span class="pattern-preview" data-pattern="${id}" aria-hidden="true"></span>${title}`, description]),
          background.pattern, 'choice pattern-choice')}
          <div id="patternWidthSetting" ${contentWidth() === 'full' ? 'hidden' : ''}>
            ${toggle('setPatternOutsideContent', 'Игнорировать область контейнера', 'Сплошной фон под содержимым, узор по бокам', background.outsideContent)}
          </div>
        </div>
      </section>
      <section class="set-card">
        <h2>Детали интерфейса</h2>
        ${toggle('setMetadataIcons', 'Показывать иконки', 'В списках и у типа тайтла вместо выключенных иконок останутся цветные точки. Иконка оценки отображается всегда.', store.get('metadataIcons', true) !== false)}
        ${toggle('setTitleLogo', 'Логотип на странице тайтла', me.tmdb ? 'Показывать логотип из TMDB над названием, если он доступен.' : 'Нужен ключ TMDB — его указывает администратор Yoru', !!me.tmdb && store.get('titleLogo', true) !== false)}
      </section>
      <section class="set-card">
        <h2>Баннеры</h2>
        <p class="set-lead">Широкие картинки для большого блока на главной и шапки страницы тайтла.</p>
        <h3>На широком экране</h3>
        ${choice('bannerFit', FITS, bl.fit, 'choice choice-row')}
        <div id="bannerAlignBox" ${bl.fit === 'blur' ? '' : 'hidden'}>
          <h3>Где картинка при размытых краях</h3>
          ${choice('bannerAlign', ALIGNS, bl.align, 'choice choice-row')}
        </div>
        <h3>Откуда брать</h3>
        ${choice('bannerSrc', BANNER_SOURCES.map(([v, t, d]) => { const off = v === 'tmdb' && !me.tmdb; return [v, t, off ? 'Администратор Yoru ещё не указал ключ TMDB' : d, off]; }), bannerSource())}
      </section>
      <section class="set-card">
        <h2>Обложки</h2>
        <p class="set-lead">Вертикальные постеры в карточках и на странице тайтла.</p>
        ${choice('coverSrc', COVER_SOURCES, coverSource(), 'choice choice-row')}
        ${me.tmdb ? '<p class="set-note">Логотип названия в плеере берётся с TMDB, если он там есть.</p>' : ''}
      </section>`;
  },

  home() {
    const prefs = homePrefs();
    const look = heroLook();
    const me = state.me || {};
    return `
      <section class="set-card">
        <h2>Большой блок</h2>
        ${toggle('setHeroOn', 'Показывать большой блок наверху', 'Баннер с тайтлом и полоской других тайтлов под ним', prefs.heroOn)}
        <h3>Что в нём показывать</h3>
        ${choice('hero', HERO_SOURCES.map(([key, title, description]) => [key, title, description, !prefs.heroOn]), prefs.hero, 'choice width-choice hero-source-choice')}
        <p class="set-note">По умолчанию — «Сейчас на экранах». Если выбранный ряд пуст, здесь появятся популярные онгоинги.</p>
        <p class="set-note">Как показывать баннер на широком экране (растягивать или размывать края) — общая настройка с шапкой тайтла: <a href="#settings/appearance">Внешний вид → Баннеры</a>.</p>
        <h3>Название</h3>
        ${toggle('setHeroLogo', 'Логотип вместо названия', me.tmdb ? 'Картинка с названием, как в плеере. Само название становится маленькой строкой под ней. Если логотипа у тайтла нет — обычное название' : 'Нужен ключ TMDB — его указывает администратор Yoru', look.logo)}
      </section>
      <section class="set-card">
        <h2>Ряды</h2>
        <h3>Как показывать</h3>
        ${choice('rowsMode', ROW_MODES, rowMode())}
        <h3>Порядок и видимость</h3>
        <p class="set-note" style="margin-top:0">Перемещайте ряды стрелками или перетаскивайте за ручку со стрелками во все стороны. Порядок сохраняется автоматически. Большой блок всегда остаётся наверху.</p>
        <div id="rowsBox">${rowsHTML(prefs)}</div>
      </section>`;
  },

  anime() {
    return `
      <section class="set-card">
        <h2>Номер в хронологии</h2>
        <p class="set-lead">Как считать номер на постере («Сезон 2 из 4»). Вкладка «Хронология» показывает всё, но отмечает части, которые учитываются.</p>
        ${choice('chronoMode', CHRONO_MODES, store.get('chronoMode', 'seasons_movies'))}
        <p class="set-note">Спин-оффы-сериалы Shikimori помечает так же, как обычные сезоны, поэтому отсеять их по типу нельзя: они попадут в счёт в любом режиме, кроме случаев, когда это OVA или фильм.</p>
      </section>
      <section class="set-card">
        <h2>Вид хронологии</h2>
        ${choice('chronoLayout', CHRONO_LAYOUTS, store.get('chronoLayout', 'horizontal'))}
      </section>`;
  },

  /* ---------- Плеер: воспроизведение, озвучка и субтитры ---------- */
  player() {
    return `
      <section class="set-card">
        <h2>Воспроизведение</h2>
        ${toggle('setAutoplay', 'Запускать видео сразу', 'Выключите, чтобы серия открывалась на паузе и ждала кнопки «Смотреть»', store.get('autoplay', false))}
        ${toggle('setAutoNext', 'Следующая серия автоматически', 'Когда серия закончилась', store.get('autoNext', true))}
        ${toggle('setScrubPrev', 'Миниатюры при перемотке', 'Кадр над шкалой, куда попадёте. Грузит немного видео в низком качестве; работает, когда видео идёт напрямую с CDN', store.get('scrubPreview', true))}
        ${toggle('setAutoMark', 'Отмечать серии на Shikimori', 'Когда досмотрено 85% серии', store.get('autoMark', true))}
      </section>
      <section class="set-card" id="setTr">
        <h2>Озвучка и субтитры</h2>
        ${toggle('setUnnamedTranslations', 'Показывать переводы без названия', 'Добавлять в списки выбора переводы, у которых не указана команда. Настройка сохраняется в этом браузере', store.get('showUnnamedTranslations', false) === true)}
        <p class="set-lead">Yoru запоминает переводы, с которыми вы досматриваете серии. Варианты одной команды, например Dream Cast с разными дублёрами, считаются одним переводом. Ручной выбор для тайтла имеет приоритет. Эти предпочтения доступны на всех ваших устройствах.</p>
        <h3>Если любимых переводов у серии нет</h3>
        ${choice('trKind', [['auto', 'Без разницы', 'Сначала озвучка'], ['voice', 'Озвучка', 'Если есть'], ['sub', 'Субтитры', 'Если есть']], store.get('trKind', 'auto'), 'choice choice-row')}
        <h3>Ваши переводы</h3>
        <ul class="tr-rank" id="trRank"></ul>
      </section>`;
  },

  /* ---------- Данные ---------- */
  data() {
    const n = lib.history().length;
    return `
      <section class="set-card">
        <h2>Продолжить просмотр</h2>
        <p class="set-lead">Тайтлы, которые вы начали смотреть. Открытые случайно можно убрать — они пропадут из «Продолжить просмотр» на всех ваших устройствах. Список Shikimori не меняется.</p>
        <div class="row-line setting-action"><span><b>В списке</b><small id="contCount">${n ? `${n} ${tPlural(n)}` : 'Пусто'}</small></span><button class="btn ghost small" type="button" id="openCont" ${n ? '' : 'disabled'}>Выбрать, что убрать</button></div>
        <div class="row-line setting-action"><span><b>Вся история и позиции просмотра</b><small>Очищается на всех устройствах</small></span><button class="btn ghost small danger" type="button" id="clearHist" ${n ? '' : 'disabled'}>Очистить всё</button></div>
      </section>
      <section class="set-card">
        <h2>Этот браузер</h2>
        <div class="row-line setting-action"><span><b>Кэш сопоставлений и рекомендаций</b><small>Если тайтл не находится на Anime365, хотя он там есть</small></span><button class="btn ghost small" type="button" id="clearCache">Очистить</button></div>
        <p class="set-note">Аккаунт, токен Anime365, места в сериях, озвучка и любимые переводы хранятся на сервере Yoru и одинаковы на всех устройствах. Остальные настройки — в этом браузере.</p>
      </section>`;
  },
};

const SECTION_BIND = {
  account(refresh) {
    on('#saveToken', 'onclick', () => saveToken($('#setToken').value.trim(), refresh));
    on('#checkToken', 'onclick', () => checkToken(''));
    on('#delToken', 'onclick', async (e) => {
      const b = e.currentTarget;
      if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Точно удалить?'; return; }
      state.me = await postJson('/me/anime365', { token: '' }); state.cache.clear(); toast('Токен удалён'); refresh();
    });
    on('#setCdn', 'onchange', (e) => { store.set('cdnHost', e.target.value); toast(e.target.value ? 'Канал выбран' : 'Канал: автоматически'); });
    const tc = $('#testCdn');
    if (tc) tc.onclick = async () => {
      tc.disabled = true;
      const res = $('#cdnRes');
      res.innerHTML = '<li>Ищем серию для проверки…</li>';
      try {
        const trs = await api365('/translations', { feed: 'recent', limit: 1 }, { ttl: 0 });
        const embed = await api365(`/translations/embed/${trs[0].id}`, {}, { ttl: 0 });
        const urls = new Map();
        for (const st of (embed.stream || []).sort((x, y) => x.height - y.height)) for (const u of st.urls || []) { try { const h = new URL(u).host; if (!urls.has(h)) urls.set(h, u); } catch { /* ignore */ } }
        res.innerHTML = [...urls.keys()].map((h) => `<li data-h="${esc(h)}"><span>${esc(cdnLabel(h))}</span><em>${esc(h)}</em><b>проверяем…</b></li>`).join('') || '<li>Сайт не вернул ни одного канала.</li>';
        for (const [h, u] of urls) {
          const r = await measure(u);
          const li = res.querySelector(`[data-h="${CSS.escape(h)}"] b`);
          if (li) li.textContent = r.error ? r.error : `${r.mbps.toFixed(1)} Мбит/с`;
        }
      } catch (e) { res.innerHTML = `<li>${esc(e.code === 403 ? 'Нужен рабочий токен Anime365.' : e.message)}</li>`; }
      tc.disabled = false;
    };
  },
  appearance() {
    radios('menuMode', (v) => { store.set('menu', v); applyMenu(); toast(v === 'h' ? 'Меню теперь сверху' : 'Меню теперь слева'); });
    const syncWidthUI = (v) => {
      const custom = isCustomWidth();
      $$('input[name="contentWidth"]').forEach((r) => { r.checked = r.value === (custom ? 'custom' : v); });
      $('#widthSlider').classList.toggle('is-on', custom);
      $('#widthRange').disabled = !custom;
      $('#widthOut').textContent = v === 'full' ? 'выкл.' : `${v} px`;
      $('#patternWidthSetting').hidden = v === 'full';
    };
    radios('contentWidth', (v) => {
      const custom = v === 'custom';
      const width = custom ? String(customWidth()) : v;
      store.set('contentWidthMode', custom ? 'custom' : 'preset');
      store.set('contentWidth', width);
      if (custom) $('#widthRange').value = width;
      applyWidth();
      syncWidthUI(width);
      toast(width === 'full' ? 'Заполнение доступной ширины' : `Содержимое не шире ${width} px`);
    });
    const wr = $('#widthRange');
    // ползунок: ширина меняется сразу, сохраняется, когда отпустили
    wr.oninput = () => {
      if (wr.disabled) return;
      applyWidth(wr.value);
      $('#widthOut').textContent = `${wr.value} px`;
    };
    wr.onchange = () => {
      if (wr.disabled) return;
      store.set('contentWidthMode', 'custom');
      store.set('customContentWidth', wr.value);
      store.set('contentWidth', wr.value);
      toast(`Содержимое не шире ${wr.value} px`);
    };
    on('#setNavLabels', 'onchange', (e) => { store.set('navLabels', e.target.checked); applyMenu(); });
    on('#setPatternBackground', 'onchange', (e) => {
      store.set('patternBackground', e.target.checked);
      $('#patternSettings').hidden = !e.target.checked;
      applyBackground();
    });
    radios('backgroundPattern', (pattern) => { store.set('backgroundPattern', pattern); applyBackground(); });
    on('#setPatternOutsideContent', 'onchange', (e) => {
      store.set('patternOutsideContent', e.target.checked);
      applyBackground();
    });
    on('#setMetadataIcons', 'onchange', (e) => { store.set('metadataIcons', e.target.checked); applyMetadataIcons(); });
    radios('bannerFit', (v) => { store.set('bannerFit', v); $('#bannerAlignBox').hidden = v !== 'blur'; toast(v === 'blur' ? 'Края баннера размываются' : 'Баннер растягивается'); });
    radios('bannerAlign', (v) => { store.set('bannerAlign', v); toast(v === 'right' ? 'Картинка у правого края' : 'Картинка по центру'); });
    const tlg = $('#setTitleLogo');
    if (tlg) { if (!(state.me && state.me.tmdb)) { tlg.disabled = true; tlg.closest('.row-line').classList.add('is-off'); } tlg.onchange = (e) => store.set('titleLogo', e.target.checked); }
    radios('bannerSrc', (v) => { store.set('bannerSource', v); toast('Источник баннеров сохранён'); });
    radios('coverSrc', (v) => { store.set('coverSource', v); toast('Источник обложек сохранён'); });
  },
  home() {
    const hl = $('#setHeroLogo');
    if (hl) { if (!(state.me && state.me.tmdb)) { hl.disabled = true; hl.closest('.row-line').classList.add('is-off'); } hl.onchange = (e) => store.set('heroLogo', e.target.checked); }
    on('#setHeroOn', 'onchange', (e) => {
      const p = store.get('home', {}); p.heroOn = e.target.checked; store.set('home', p);
      $$('input[name="hero"]').forEach((input) => {
        input.disabled = !e.target.checked;
        input.closest('.choice-item').classList.toggle('is-off', !e.target.checked);
      });
      $('#rowsBox').innerHTML = rowsHTML(homePrefs()); bindRows();
      toast(e.target.checked ? 'Большой блок включён' : 'Большой блок скрыт');
    });
    radios('rowsMode', (v) => { store.set('rowsMode', v); toast('Вид рядов сохранён'); });
    radios('hero', (v) => {
      const p = store.get('home', {}); p.hero = v; store.set('home', p);
      $('#rowsBox').innerHTML = rowsHTML(homePrefs()); bindRows();
      toast('Главный экран обновлён');
    });
    bindRows();
  },
  anime() {
    radios('chronoMode', (v) => { store.set('chronoMode', v); toast('Номер в хронологии обновлён'); });
    radios('chronoLayout', (v) => { store.set('chronoLayout', v); toast('Вид хронологии сохранён'); });
  },
  player() {
    on('#setAutoplay', 'onchange', (e) => store.set('autoplay', e.target.checked));
    on('#setAutoNext', 'onchange', (e) => store.set('autoNext', e.target.checked));
    on('#setScrubPrev', 'onchange', (e) => store.set('scrubPreview', e.target.checked));
    on('#setAutoMark', 'onchange', (e) => store.set('autoMark', e.target.checked));
    on('#setUnnamedTranslations', 'onchange', (e) => store.set('showUnnamedTranslations', e.target.checked));
    radios('trKind', (v) => lib.setTrKind(v));
    drawRank();
  },
  data(refresh) {
    on('#openCont', 'onclick', openContModal);
    on('#clearHist', 'onclick', (e) => {
      const b = e.currentTarget;
      if (!b.dataset.confirm) { b.dataset.confirm = '1'; b.textContent = 'Точно очистить?'; return; }
      lib.forgetAll().then(() => { toast('История очищена'); refresh(); }, (err) => toast(err.message));
    });
    on('#clearCache', 'onclick', (e) => { store.set('malmap', {}); store.set('recs', null); state.cache.clear(); e.currentTarget.textContent = 'Очищено'; e.currentTarget.disabled = true; });
  },
};
const tPlural = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'тайтл' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'тайтла' : 'тайтлов');

/* ряды главной: тот, что повторяет большой блок, выключен с пояснением */
function rowsHTML(prefs) {
  const rows = orderedHomeRows(prefs);
  return rows.map(([k, t], index) => {
    const dup = dupRow(prefs) === k;
    return `<div class="row-line home-row-setting" data-home-row="${k}">
      <span class="home-row-position" aria-hidden="true">${index + 1}</span>
      <label class="home-row-label${dup ? ' is-dup' : ''}"><span>${t}${dup ? '<small>Уже показан в большом блоке наверху</small>' : ''}</span>
        <input class="toggle" type="checkbox" data-row="${k}" ${prefs.rows[k] && !dup ? 'checked' : ''} ${dup ? 'disabled' : ''}></label>
      <span class="home-row-moves">
        <button class="icon-btn home-row-drag" type="button" draggable="true" data-drag-row="${k}" aria-label="Перетащить ряд «${esc(t)}»" title="Перетащить ряд"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M2 12h20M8 6l4-4 4 4M8 18l4 4 4-4M6 8l-4 4 4 4M18 8l4 4-4 4"/></svg></button>
        <button class="icon-btn" type="button" data-move="-1" data-row-key="${k}" aria-label="Поднять ряд «${esc(t)}»" ${index === 0 ? 'disabled' : ''}>↑</button>
        <button class="icon-btn" type="button" data-move="1" data-row-key="${k}" aria-label="Опустить ряд «${esc(t)}»" ${index === rows.length - 1 ? 'disabled' : ''}>↓</button>
      </span></div>`;
  }).join('');
}
function bindRows() {
  const box = $('#rowsBox');
  if (!box) return;
  let dragKey = null;
  let dropped = false;
  $$('[data-drag-row]', box).forEach((handle) => {
    handle.ondragstart = (event) => {
      dragKey = handle.dataset.dragRow;
      dropped = false;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', dragKey);
      handle.closest('[data-home-row]').classList.add('is-reordering');
    };
    handle.ondragend = () => {
      if (!dragKey) return;
      dragKey = null;
      // Отменённое перетаскивание возвращает сохранённый порядок.
      if (!dropped && box.isConnected) {
        box.innerHTML = rowsHTML(homePrefs());
        bindRows();
      }
    };
  });
  box.ondragover = (event) => {
    if (!dragKey) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const target = event.target.closest('[data-home-row]');
    const dragged = box.querySelector(`[data-home-row="${dragKey}"]`);
    if (!target || !dragged || target === dragged || target.parentElement !== box) return;
    const bounds = target.getBoundingClientRect();
    box.insertBefore(dragged, event.clientY < bounds.top + bounds.height / 2 ? target : target.nextSibling);
  };
  box.ondrop = (event) => {
    if (!dragKey) return;
    event.preventDefault();
    dropped = true;
    const key = dragKey;
    dragKey = null;
    const order = $$('[data-home-row]', box).map((row) => row.dataset.homeRow);
    store.set('home', { ...store.get('home', {}), order });
    box.innerHTML = rowsHTML(homePrefs());
    bindRows();
    box.querySelector(`[data-drag-row="${key}"]`)?.focus({ preventScroll: true });
    toast('Порядок рядов сохранён');
  };
  $$('input[data-row]', box).forEach((c) => c.onchange = () => setRowVisible(c.dataset.row, c.checked));
  $$('[data-move]', box).forEach((button) => button.onclick = () => {
    const key = button.dataset.rowKey;
    const direction = +button.dataset.move;
    moveHomeRow(key, direction);
    box.innerHTML = rowsHTML(homePrefs());
    bindRows();
    const controls = $$(`[data-row-key="${key}"]`, box);
    const next = controls.find((control) => +control.dataset.move === direction && !control.disabled)
      || controls.find((control) => !control.disabled);
    next?.focus({ preventScroll: true });
    const title = HOME_ROWS.find(([id]) => id === key)[1];
    toast(`«${title}» — позиция ${homePrefs().order.indexOf(key) + 1}`);
  });
}


/* ---------- токен Anime365: проверяется на сервере, хранится там же ---------- */
const tokenMsg = (r) => (r.ok ? 'Токен работает: видео доступно.'
  : /subscri|подпис|premium/i.test(r.error || '') ? `Токен принят, но видео доступно только с подпиской. Ответ Anime365: ${r.error}`
    : r.code === 401 || r.code === 403 ? `Anime365 не принял токен. Ответ: ${r.error}` : r.error || 'Не удалось проверить');
async function checkToken(tok) {
  const st = $('#tokenStatus');
  st.textContent = 'Проверяем…'; st.className = 'status';
  try {
    const r = await postJson('/me/check365', { token: tok });
    st.textContent = tokenMsg(r); st.className = 'status ' + (r.ok ? 'ok' : 'err');
    return r;
  } catch (e) { st.textContent = e.message; st.className = 'status err'; return { ok: false }; }
}
async function saveToken(tok, refresh) {
  const st = $('#tokenStatus');
  if (!tok) { st.textContent = 'Вставьте токен.'; st.className = 'status err'; return; }
  const r = await checkToken(tok);
  // сохраняем и при «нет подписки»: токен верный, подписку можно оформить позже
  if (!r.ok && !/subscri|подпис|premium/i.test(r.error || '')) return;
  state.me = await postJson('/me/anime365', { token: tok });
  state.cache.clear();
  toast('Токен сохранён на сервере');
  refresh();
}
export { loggedIn };


/* ---------- «Продолжить просмотр»: выборочное удаление во всплывающем окне ---------- */
function openContModal() {
  openModal({
    title: 'Продолжить просмотр',
    html: '<p class="set-note" style="margin-top:0">Уберите тайтлы, которые открыли случайно. Они пропадут на всех ваших устройствах вместе с местом, где вы остановились.</p><ul class="cont-list" id="contList"></ul>',
    onOpen: () => drawCont(),
    onClose: () => { if (window.yoruRoute().name === 'settings') { const n = lib.history().length; const c = $('#contCount'); if (c) c.textContent = n ? `${n} ${tPlural(n)}` : 'Пусто'; const b = $('#openCont'); if (b) b.disabled = !n; const ch = $('#clearHist'); if (ch) ch.disabled = !n; } },
  });
}
function drawCont() {
  const box = $('#contList'); if (!box) return;
  const h = lib.history();
  if (!h.length) { box.innerHTML = '<li class="tr-rank-empty">Пусто. Здесь появятся тайтлы, которые вы начали смотреть.</li>'; return; }
  box.innerHTML = h.map((x) => {
    const p = lib.pct(x.eid);
    const a = x.anime || {};
    return `<li data-aid="${x.aid}">
      <a class="cont-img" href="#anime-${x.aid}">${posterHTML({ id: x.aid, title: a.title, name: a.name, poster: a.poster, posterBig: a.posterBig })}</a>
      <a class="cont-name" href="#watch-${x.aid}-${x.eid}"><b>${esc(a.title || a.name || 'Без названия')}</b>
        <small>${esc(x.ep || '')}${p ? ` · просмотрено ${p}%` : ''}${x.at ? ` · ${esc(relTime(new Date(x.at).toISOString()))}` : ''}</small>
        ${p ? `<span class="cont-bar"><i style="width:${p}%"></i></span>` : ''}</a>
      <button class="btn ghost small" type="button" data-forget="${x.aid}" aria-label="Убрать ${esc(a.title || '')} из «Продолжить просмотр»">Убрать</button></li>`;
  }).join('');
  $$('[data-forget]', box).forEach((b) => b.onclick = async () => {
    const aid = +b.dataset.forget;
    const item = lib.history().find((x) => x.aid === aid);
    const li = b.closest('li'); li.classList.add('is-gone');
    try {
      await lib.forgetTitle(aid);
      setTimeout(drawCont, 200);
      toast(`«${(item && item.anime && item.anime.title) || 'Тайтл'}» убран из «Продолжить просмотр»`);
    } catch (e) { li.classList.remove('is-gone'); toast(e.message); }
  });
}

const KIND_RU = { voice: 'озвучка', sub: 'субтитры', raw: 'оригинал' };
function drawRank() {
  const box = $('#trRank'); if (!box) return;
  const rank = lib.trRank();
  const list = Object.entries(rank).sort(([, a], [, b]) => (b.pinned - a.pinned) || (b.count - a.count));
  if (!list.length) { box.innerHTML = '<li class="tr-rank-empty">Пока пусто. Досмотрите пару серий — и здесь появятся ваши любимые переводы.</li>'; return; }
  box.innerHTML = list.map(([k, r], i) => `<li${r.pinned ? ' class="pinned"' : ''}>
    <span class="tr-rank-n">${i + 1}</span>
    <span class="tr-rank-name"><b>${esc(r.author)}</b><small>${KIND_RU[r.kind] || ''}, ${Math.max(1, Math.floor(r.count))} ${plural(Math.max(1, Math.floor(r.count)))}</small></span>
    <span class="tr-rank-actions">
      <button class="btn ghost small" type="button" data-pin="${esc(k)}">${r.pinned ? 'Открепить' : 'Закрепить первым'}</button>
      <button class="btn ghost small" type="button" data-del="${esc(k)}" aria-label="Забыть ${esc(r.author)}">Забыть</button>
    </span></li>`).join('');
  $$('[data-pin]', box).forEach((b) => b.onclick = () => {
    lib.updateRank((all, now) => {
      const r = all[b.dataset.pin];
      if (!r || r.deleted) return;
      const pin = !r.pinned;
      if (pin) Object.values(all).forEach((x) => { if (x.pinned && !x.deleted) { x.pinned = false; x.at = now; } });
      r.pinned = pin; r.at = now;
    });
    drawRank();
  });
  $$('[data-del]', box).forEach((b) => b.onclick = () => { lib.updateRank((all, now) => { all[b.dataset.del] = { deleted: true, at: now }; }); drawRank(); });
}
const plural = (n) => (n % 10 === 1 && n % 100 !== 11 ? 'серия' : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? 'серии' : 'серий');
