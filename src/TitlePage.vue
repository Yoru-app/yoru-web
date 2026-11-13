<script setup>
import { vActiveIndicator, vContentMotion } from './motion.js';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, useTemplateRef, watch } from 'vue';
import { ICON, errorBlock, hue, imgSrc, state, store } from '../public/js/core.js';
import { animeFacts } from '../public/js/anime-facts.js';
import { coverOf, posterHTML } from '../public/js/art.js';
import { pendingAttr, watchFit } from '../public/js/fitart.js';
import { mobileMenu } from '../public/js/menu.js';
import { renderTitle } from '../public/js/views/title.js';
import { isMainCharacter } from '../public/js/shiki.js';
import { catalog } from './catalog.js';
import SectionPicker from './SectionPicker.vue';

const props = defineProps({ route: { type: Object, required: true }, coverPreview: String });
const host = ref(null);
const screen = shallowRef(null);
const error = shallowRef(null);
const mobile = shallowRef(mobileMenu.matches);
const coverFailed = shallowRef(false);
const descriptionExpanded = shallowRef(false);
const descriptionOverflows = shallowRef(false);
const descriptionBox = useTemplateRef('descriptionBox');
const anime365Url = shallowRef('');
const titleMedia = useTemplateRef('titleMedia');
const desktopBanner = useTemplateRef('desktopBanner');
const tab = shallowRef('eps');
const tabShift = shallowRef('0px');
const hasChronology = shallowRef(false);
const chronoModes = [
  ['seasons', 'Сезоны'],
  ['seasons_movies', 'Сезоны и фильмы'],
  ['all', 'Все'],
];
const chronoMode = shallowRef(store.get('chronoMode', 'seasons_movies'));
const chronoLayout = shallowRef(store.get('chronoLayout', 'horizontal'));
let titleActions;
const tabs = [
  ['eps', 'Серии'], ['chrono', 'Хронология'], ['rel', 'Связанное'],
  ['sim', 'Похожее'], ['chars', 'Персонажи'], ['media', 'Кадры и видео'],
];
const anime = computed(() => screen.value?.anime);
const preview = props.coverPreview;
const facts = computed(() => animeFacts(anime.value));
const mobileCover = computed(() => {
  const title = anime.value;
  return title ? coverOf(title.id) || title.posterBig || title.poster : '';
});
const description = computed(() => anime.value?.description ? anime.value.description.split(/\n+/g) : []);
const genreGroups = computed(() => [
  { id: 'genre', name: 'Жанры', items: anime.value?.genres.filter(({ kind }) => !kind || kind === 'genre') },
  { id: 'theme', name: 'Темы', items: anime.value?.genres.filter(({ kind }) => kind === 'theme') },
  { id: 'other', name: 'Категории', items: anime.value?.genres.filter(({ kind }) => kind && kind !== 'genre' && kind !== 'theme') },
].filter(({ items }) => items?.length));
const mainCharacters = computed(() => (anime.value?.characters || [])
  .filter((role) => role.character && isMainCharacter(role))
  .map(({ character }) => character));
const visibleTabs = computed(() => tabs.filter(([id]) => {
  if (id === 'chrono') return hasChronology.value;
  if (id === 'chars') return anime.value?.characters?.length;
  if (id === 'media') return anime.value?.screenshots?.length || anime.value?.videos?.length;
  return true;
}).map(([id, name]) => ({ id, name })));

let sequence = 0;
let active = true;
function cleanup() {
  const dispose = state.cleanup;
  state.cleanup = null;
  if (dispose) dispose();
}
function updateViewport(event) { mobile.value = event.matches; }
watch([screen, mobile], ([data, isMobile], _, onCleanup) => {
  if (data?.banner && !isMobile) onCleanup(watchFit(titleMedia.value, desktopBanner.value, data.look));
}, { flush: 'post' });
watch([descriptionBox, descriptionExpanded], ([box, expanded], _, onCleanup) => {
  if (!box || expanded) return;
  const measure = () => { descriptionOverflows.value = box.scrollHeight > box.clientHeight + 4; };
  measure();
  const observer = new ResizeObserver(measure);
  observer.observe(box);
  onCleanup(() => observer.disconnect());
}, { flush: 'post' });

async function refresh() {
  const request = ++sequence;
  try {
    cleanup();
    screen.value = null;
    error.value = null;
    coverFailed.value = false;
    descriptionExpanded.value = false;
    descriptionOverflows.value = false;
    anime365Url.value = '';
    tab.value = 'eps';
    tabShift.value = '0px';
    hasChronology.value = false;
    titleActions = undefined;
    chronoMode.value = store.get('chronoMode', 'seasons_movies');
    const actions = await renderTitle(props.route.id, host.value, async (data) => {
      if (!active || request !== sequence) return false;
      screen.value = data;
      await nextTick();
      return active && request === sequence;
    }, {
      onTabChange: (id) => { if (active && request === sequence) tab.value = id; },
      onChronology: (available) => { if (active && request === sequence) hasChronology.value = available; },
      onAnime365Url: (url) => { if (active && request === sequence) anime365Url.value = url; },
    });
    if (active && request === sequence) titleActions = actions;
  } catch (cause) {
    if (active && request === sequence) error.value = cause;
  }
}
function selectTab(id) {
  if (id === tab.value) return;
  const step = visibleTabs.value.findIndex((item) => item.id === id) -
    visibleTabs.value.findIndex((item) => item.id === tab.value);
  tabShift.value = `${Math.sign(step) * 12}px`;
  titleActions?.openTab(id);
}
function selectChronoMode(mode) {
  chronoMode.value = mode;
  store.set('chronoMode', mode);
  titleActions?.refreshChronology();
}
function selectChronoLayout(layout) {
  chronoLayout.value = layout;
  store.set('chronoLayout', layout);
}
function filterGenre(id) { Object.assign(catalog, { genres: [+id], search: '' }); }
onMounted(() => {
  mobileMenu.addEventListener('change', updateViewport);
  window.scrollTo({ top: 0, behavior: 'instant' });
  refresh();
});
onBeforeUnmount(() => {
  mobileMenu.removeEventListener('change', updateViewport);
  active = false;
  cleanup();
});
</script>

<template>
  <main v-content-motion id="view" ref="host" data-page="anime" :data-cover-opening="coverPreview !== undefined ? '' : undefined" tabindex="-1">
    <div v-if="error" v-html="errorBlock(error)" @click="(event) => event.target.closest('[data-retry-route]') && refresh()"></div>
    <section v-else-if="!screen" class="t-head title-loading" role="status">
      <span class="sr">Загружаем тайтл</span>
      <div v-if="mobile" class="t-media title-loading-media" data-title-cover aria-hidden="true">
        <img v-if="preview" :src="preview" alt="">
      </div>
      <div class="t-grid" aria-hidden="true">
        <div v-if="!mobile" class="poster t-poster skel" data-title-cover><img v-if="preview" :src="preview" alt=""></div>
        <div class="title-loading-copy">
          <span class="skel"></span><span class="skel"></span><span class="skel"></span>
        </div>
      </div>
    </section>
    <template v-else>
      <section class="t-head" :class="{ 'has-banner': screen.banner && !mobile }">
        <div :key="mobile" ref="titleMedia" class="t-media" :data-title-cover="mobile ? '' : undefined">
          <img v-if="mobile && mobileCover && !coverFailed" :src="imgSrc(mobileCover)" alt="" @error="coverFailed = true">
          <img v-else-if="!mobile && screen.banner" ref="desktopBanner"
            :class="pendingAttr(screen.look).trim()" :src="imgSrc(screen.banner)" alt="">
          <img v-else-if="!mobile && (anime.posterBig || anime.poster)" class="blur" :src="imgSrc(anime.posterBig || anime.poster)" alt="">
          <div v-else class="ph" :style="{ '--h': hue(anime.id) }"></div>
        </div>
        <div class="t-grid">
          <div class="t-poster-wrap">
            <div v-if="!mobile" class="poster t-poster" data-title-cover v-html="posterHTML(anime, true)"></div>
            <button id="chronoBadge" class="chrono-badge" type="button" hidden></button>
          </div>
          <div class="t-info">
            <h1 v-if="screen.logo" class="t-name is-logo"><img class="t-logo" :src="imgSrc(screen.logo)" alt=""><span>{{ anime.title }}</span></h1>
            <h1 v-else class="t-name">{{ anime.title }}</h1>
            <p class="t-alt">{{ [anime.name !== anime.title ? anime.name : '', anime.japanese].filter(Boolean).join(' / ') }}</p>
            <ul v-if="facts.length" class="anime-facts" aria-label="Информация о тайтле">
              <li v-for="{ key, label, value, tone, iconTone, icon } in facts" :key="key" :class="{ 'fact-next-row': key === 'next' }">
                <span class="anime-fact" :class="[`fact-${key}`, iconTone]" :title="label">
                  <svg class="anime-fact-icon" viewBox="0 0 24 24" aria-hidden="true"><use :href="icon" /></svg>
                  <span class="sr">{{ label }}: </span><span :class="tone">{{ value }}</span>
                </span>
              </li>
            </ul>
            <div class="title-actions">
              <div id="tActions"><span class="btn ghost" aria-busy="true">Ищем на Anime365…</span></div>
              <div id="rateBox"></div>
            </div>
          </div>
        </div>
      </section>
      <section class="section t-body">
        <div v-if="genreGroups.length" class="genres title-tags" data-hscroll>
          <div v-for="group in genreGroups" :key="group.id" class="title-tag-group" role="group" :aria-label="group.name">
            <a v-for="genre in group.items" :key="genre.id" :class="['genre', `tag-${group.id}`]" href="#catalog" @click="filterGenre(genre.id)">{{ genre.name }}</a>
          </div>
        </div>
        <template v-if="description.length">
          <div id="tDesc" ref="descriptionBox" class="t-desc" :class="{ clamped: !descriptionExpanded }"><template v-for="(line, index) in description" :key="index"><template v-if="index"><br><br></template>{{ line }}</template></div>
          <button v-if="descriptionOverflows || descriptionExpanded" class="more" type="button" aria-controls="tDesc"
            :aria-expanded="descriptionExpanded" @click="descriptionExpanded = !descriptionExpanded">{{ descriptionExpanded ? 'Свернуть' : 'Читать полностью' }}</button>
        </template>
        <div class="t-src">
          <a class="genre" :href="anime.url" target="_blank" rel="noopener">Открыть на Shikimori <span class="external-icon" v-html="ICON.ext"></span></a>
          <a class="genre" :href="anime365Url || `${state.site}/catalog/search?q=${encodeURIComponent(anime.name || anime.title)}`"
            target="_blank" rel="noopener">Открыть на Anime365 <span class="external-icon" v-html="ICON.ext"></span></a>
        </div>
        <div v-if="mainCharacters.length" class="title-cast">
          <h2 id="main-characters" class="section-title">Главные герои</h2>
          <div class="row title-cast-row" aria-labelledby="main-characters" role="region" tabindex="0">
            <a v-for="character in mainCharacters" :key="character.id" class="person"
              :href="`${state.shikiOrigin}/characters/${character.id}`" target="_blank" rel="noopener">
              <span class="person-img">
                <img v-if="character.poster?.mainUrl" :src="imgSrc(character.poster.mainUrl)" alt="" loading="lazy">
                <span v-else class="cast-initial" aria-hidden="true">{{ (character.russian || character.name || '?')[0] }}</span>
              </span>
              <span class="person-name">{{ character.russian || character.name }}</span>
            </a>
          </div>
        </div>
      </section>
      <section class="section">
        <SectionPicker id="tTabs" :model-value="tab" label="Разделы тайтла" :items="visibleTabs" @update:model-value="selectTab" />
        <hr class="title-section-divider">
        <div v-if="tab === 'chrono'" class="chronology-controls">
          <div v-active-indicator class="seg chrono-count-toggle" role="group" aria-label="Что считать в хронологии">
            <button v-for="[id, name] in chronoModes" :key="id" type="button"
              :aria-pressed="chronoMode === id" @click="chronoMode !== id && selectChronoMode(id)">{{ name }}</button>
          </div>
          <label v-if="!mobile" class="chronology-layout">
            <span :class="{ 'layout-active': chronoLayout !== 'vertical' }" aria-hidden="true">Горизонтальный</span>
            <input class="toggle" type="checkbox" role="switch" aria-label="Вертикальный вид хронологии"
              :checked="chronoLayout === 'vertical'" @change="selectChronoLayout($event.target.checked ? 'vertical' : 'horizontal')">
            <span :class="{ 'layout-active': chronoLayout === 'vertical' }" aria-hidden="true">Вертикальный</span>
          </label>
        </div>
        <div id="tPane" class="t-pane" :style="{ '--title-tab-shift': tabShift }" :class="{ 'chrono-vertical': !mobile && chronoLayout === 'vertical' }"><div class="loading"><span class="spin" aria-label="Загрузка"></span></div></div>
      </section>
    </template>
  </main>
</template>

<style scoped>
.external-icon { display: contents; }
.title-tags { flex-wrap: nowrap; gap: 8px; padding: 5px; margin: 0 -5px 8px; overflow-x: auto; scrollbar-width: thin; }
.title-tag-group { display: flex; flex: none; gap: 8px; white-space: nowrap; }
.title-cast { margin-top: 24px; }
.title-cast-row { grid-auto-columns: 112px; gap: 12px; margin-top: 12px; padding: 5px; scrollbar-width: none; }
.title-cast-row::-webkit-scrollbar { display: none; }
.cast-initial { display: grid; place-items: center; height: 100%; color: var(--muted); }
.title-section-divider { border: 0; border-top: 1px solid var(--line); margin: 14px 0 0; }
.chronology-controls { display: flex; flex-wrap: wrap; align-items: start; gap: 10px 16px; margin-top: 14px; }
.chrono-count-toggle { display: grid; grid-template-columns: repeat(3, auto); max-width: 100%; }
.chrono-count-toggle button { height: auto; min-height: 36px; padding: 4px clamp(8px, 2vw, 16px); }
.chrono-count-toggle button[aria-pressed="true"] { color: var(--lantern); }
.chrono-count-toggle > :deep(.active-indicator) { border-radius: 999px; }
.chronology-layout { display: inline-flex; align-items: center; gap: 8px; min-height: 42px; color: var(--muted); font-size: 13px; }
.layout-active { color: var(--text); }
@media (max-width: 760px) {
  .chronology-controls { flex-direction: column; align-items: stretch; }
}
</style>
