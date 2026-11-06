<script setup>
import { vActiveIndicator, vContentMotion } from './motion.js';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { ICON, errorBlock, hue, imgSrc, state, untilText } from '../public/js/core.js';
import { posterHTML } from '../public/js/art.js';
import { pendingAttr } from '../public/js/fitart.js';
import { renderTitle } from '../public/js/views/title.js';
import { KIND, STATUS, seasonLabel } from '../public/js/shiki.js';
import { catalog } from './catalog.js';

const props = defineProps({ route: { type: Object, required: true } });
const host = ref(null);
const screen = shallowRef(null);
const error = shallowRef(null);
const rating = { g: 'G', pg: 'PG', pg_13: 'PG-13', r: 'R-17', r_plus: 'R+', rx: 'Rx' };
const tabs = [
  ['eps', 'Серии'], ['chrono', 'Хронология'], ['rel', 'Связанное'],
  ['sim', 'Похожее'], ['chars', 'Персонажи'], ['media', 'Кадры и видео'],
];
const facts = computed(() => {
  if (!screen.value) return [];
  const a = screen.value.anime;
  return [
    a.score ? ['Оценка', a.score.toFixed(2)] : null,
    ['Тип', KIND[a.kind] || a.kind],
    ['Эпизоды', a.status === 'ongoing' ? `${a.aired} из ${a.episodes || '?'}` : a.episodes || '?'],
    ['Статус', STATUS[a.status] || a.status, a.next ? `${a.aired + 1}-я ${untilText(a.next)}` : ''],
    seasonLabel(a) ? ['Сезон', seasonLabel(a)] : null,
    a.studios.length ? ['Студия', a.studios.join(', ')] : null,
    a.duration ? ['Серия', `${a.duration} мин`] : null,
    rating[a.rating] ? ['Рейтинг', rating[a.rating]] : null,
  ].filter(Boolean);
});
const anime = computed(() => screen.value?.anime);
const description = computed(() => anime.value?.description ? anime.value.description.split(/\n+/g) : []);
const visibleTabs = computed(() => tabs.filter(([id]) => {
  if (id === 'chars') return anime.value?.characters?.length;
  if (id === 'media') return anime.value?.screenshots?.length || anime.value?.videos?.length;
  return true;
}));

let sequence = 0;
let active = true;
function cleanup() {
  const dispose = state.cleanup;
  state.cleanup = null;
  if (dispose) dispose();
}
async function refresh() {
  const request = ++sequence;
  try {
    cleanup();
    screen.value = null;
    error.value = null;
    await renderTitle(props.route.id, host.value, async (data) => {
      if (!active || request !== sequence) return false;
      screen.value = data;
      await nextTick();
      return active && request === sequence;
    });
  } catch (cause) {
    if (active && request === sequence) error.value = cause;
  }
}
function filterGenre(id) { Object.assign(catalog, { genres: [+id], search: '' }); }
onMounted(() => {
  window.scrollTo({ top: 0, behavior: 'instant' });
  refresh();
});
onBeforeUnmount(() => {
  active = false;
  cleanup();
});
</script>

<template>
  <main v-content-motion id="view" ref="host" data-page="anime" tabindex="-1">
    <div v-if="error" v-html="errorBlock(error)" @click="(event) => event.target.closest('[data-retry-route]') && refresh()"></div>
    <div v-else-if="!screen" class="loading"><span class="spin" aria-label="Загрузка"></span></div>
    <template v-else>
      <section class="t-head" :class="{ 'has-banner': screen.banner }">
        <div class="t-media">
          <img v-if="screen.banner" :class="pendingAttr(screen.look).trim()" :src="imgSrc(screen.banner)" alt="">
          <img v-else-if="anime.posterBig || anime.poster" class="blur" :src="imgSrc(anime.posterBig || anime.poster)" alt="">
          <div v-else class="ph" :style="{ '--h': hue(anime.id) }"></div>
        </div>
        <div class="t-grid">
          <div class="t-poster-wrap">
            <div class="poster t-poster" v-html="posterHTML(anime, true)"></div>
            <button id="chronoBadge" class="chrono-badge" type="button" hidden></button>
          </div>
          <div class="t-info">
            <h1 v-if="screen.logo" class="t-name is-logo"><img class="t-logo" :src="imgSrc(screen.logo)" alt=""><span>{{ anime.title }}</span></h1>
            <h1 v-else class="t-name">{{ anime.title }}</h1>
            <p class="t-alt">{{ [anime.name !== anime.title ? anime.name : '', anime.japanese].filter(Boolean).join(' / ') }}</p>
            <ul class="facts">
              <li v-for="[label, text, extra] in facts" :key="label">
                <span>{{ label }}</span><b v-if="label === 'Оценка'" class="score">{{ text }}</b><template v-else>{{ text }}</template>
                <small v-if="extra">{{ extra }}</small>
              </li>
            </ul>
            <div id="tActions" class="hero-actions"><span class="btn ghost" aria-busy="true">Ищем на Anime365…</span></div>
            <div id="rateBox"></div>
          </div>
        </div>
      </section>
      <section class="section t-body">
        <template v-if="description.length">
          <div id="tDesc" class="t-desc clamped"><template v-for="(line, index) in description" :key="index"><template v-if="index"><br><br></template>{{ line }}</template></div>
          <button id="moreDesc" class="more" type="button" hidden>Читать полностью</button>
        </template>
        <div v-if="anime.genres.length" class="genres">
          <a v-for="genre in anime.genres" :key="genre.id" class="genre" href="#catalog" @click="filterGenre(genre.id)">{{ genre.name }}</a>
        </div>
        <p class="t-src"><a :href="anime.url" target="_blank" rel="noopener">Открыть на Shikimori <span class="external-icon" v-html="ICON.ext"></span></a></p>
      </section>
      <section class="section">
        <div v-active-indicator id="tTabs" class="tabs" role="tablist">
          <button v-for="[key, name] in visibleTabs" :key="key" type="button" role="tab" :data-tab="key"
            :aria-selected="key === 'eps'" :hidden="key === 'chrono'">{{ name }}</button>
        </div>
        <div id="tPane" class="t-pane"><div class="loading"><span class="spin" aria-label="Загрузка"></span></div></div>
      </section>
    </template>
  </main>
</template>

<style scoped>.external-icon { display: contents; }</style>
