<script setup>
import { vActiveIndicator, vContentMotion } from './motion.js';
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { epWord, errorBlock, state, store } from '../public/js/core.js';
import { renderWatch } from '../public/js/views/watch.js';
import { KIND } from '../public/js/player.js';
import { epLabel, epShort } from '../public/js/api365.js';

const props = defineProps({ route: { type: Object, required: true } });
const host = ref(null);
const screen = shallowRef(null);
const error = shallowRef(null);
const wide = shallowRef(store.get('watchWide', false));
const episodesOpen = shallowRef(false);
let active = true;
let sequence = 0;

function toggleWide() {
  wide.value = !wide.value;
  episodesOpen.value = false;
  store.set('watchWide', wide.value);
}
function toggleEpisodes() {
  episodesOpen.value = !episodesOpen.value;
  if (episodesOpen.value) nextTick(() => {
    host.value?.querySelector('.side-ep[aria-current="true"]')?.focus({ preventScroll: true });
  });
}
function closeEpisodes(focusBack = false) {
  episodesOpen.value = false;
  host.value?.querySelector('[data-a="episodes"]')?.setAttribute('aria-expanded', 'false');
  if (focusBack) host.value?.querySelector('[data-a="episodes"]')?.focus({ preventScroll: true });
}
function onOutside(event) {
  if (episodesOpen.value && !event.target.closest('.side, [data-a="episodes"]')) closeEpisodes();
}
function onEscape(event) {
  if (event.key === 'Escape' && episodesOpen.value) {
    event.preventDefault();
    closeEpisodes(true);
  }
}

function cleanup() {
  const dispose = state.cleanup;
  state.cleanup = null;
  if (dispose) dispose();
}

async function refresh() {
  const request = ++sequence;
  try {
    cleanup();
    error.value = null;
    screen.value = null;
    await renderWatch(props.route.aid, props.route.eid, host.value, async (data) => {
      if (!active || request !== sequence) return false;
      screen.value = data;
      await nextTick();
      return active && request === sequence;
    }, {
      isWide: () => wide.value,
      episodesOpen: () => episodesOpen.value,
      toggleWide,
      toggleEpisodes,
      closeEpisodes,
    });
  } catch (cause) {
    if (active && request === sequence) error.value = cause;
  }
}
onMounted(() => {
  document.addEventListener('pointerdown', onOutside);
  document.addEventListener('keydown', onEscape);
  window.scrollTo({ top: 0, behavior: 'instant' });
  refresh();
});
onBeforeUnmount(() => {
  document.removeEventListener('pointerdown', onOutside);
  document.removeEventListener('keydown', onEscape);
  active = false;
  cleanup();
});
</script>

<template>
  <main v-content-motion id="view" ref="host" data-page="watch" tabindex="-1">
    <div v-if="error" v-html="errorBlock(error)" @click="(event) => event.target.closest('[data-retry-route]') && refresh()"></div>
    <div v-else-if="!screen" class="watch watch-loading" :class="{ 'watch-wide': wide }" role="status">
      <span class="sr">Загружаем серию</span>
      <div class="watch-placeholder skel" aria-hidden="true"></div>
    </div>
    <div v-else class="watch" :class="{ 'watch-wide': wide }">
      <div>
        <div id="vp"></div>
        <div class="watch-bar">
          <div>
            <a class="watch-series" :href="`#anime-${route.aid}`">{{ screen.anime.title }}</a>
            <h1 class="watch-ep">{{ epLabel(screen.episode) }}</h1>
          </div>
          <div class="ep-nav">
            <a class="btn ghost small" :href="screen.prev ? `#watch-${route.aid}-${screen.prev.id}` : undefined"
              :aria-disabled="!screen.prev || undefined">Предыдущая</a>
            <a class="btn primary small" :href="screen.next ? `#watch-${route.aid}-${screen.next.id}` : undefined"
              :aria-disabled="!screen.next || undefined">Следующая</a>
          </div>
        </div>
        <div class="panel">
          <template v-if="screen.kinds.length">
            <div v-active-indicator id="kinds" class="seg" role="group" aria-label="Тип перевода">
              <button v-for="kind in screen.kinds" :key="kind" type="button" :data-kind="kind" :aria-pressed="kind === screen.kind">
                {{ KIND[kind] }}<small>{{ screen.groups[kind].length }}</small>
              </button>
            </div>
            <div id="trList" class="tr-list" role="group" aria-label="Перевод"></div>
          </template>
          <p v-else style="margin:0;color:var(--muted)">У этой серии пока нет переводов.</p>
        </div>
      </div>
      <Transition name="drawer-shift">
      <aside v-show="!wide || episodesOpen" :inert="wide && !episodesOpen" id="watchEpisodes" class="side" aria-label="Список серий">
        <div class="side-head"><h2>Серии</h2><p>{{ epWord(screen.episodes.length) }}</p>
          <button v-if="wide" class="icon-btn episode-close" type="button" aria-label="Закрыть список серий" @click="closeEpisodes(true)">×</button>
        </div>
        <div id="sideList" class="side-list">
          <a v-for="{ episode, percent, seen } in screen.episodes" :key="episode.id" class="side-ep" :class="{ seen }"
            :href="`#watch-${route.aid}-${episode.id}`" :aria-current="episode.id === route.eid ? 'true' : 'false'">
            <b>{{ epShort(episode) }}</b>
            <span>
              {{ episode.episodeTitle || episode.episodeFull || epLabel(episode) }}
              <small>{{ seen ? 'Просмотрено' : percent ? `Остановились на ${percent}%` : '' }}</small>
              <div v-if="percent && !seen" class="bar"><i :style="{ width: `${percent}%` }"></i></div>
            </span>
          </a>
        </div>
      </aside>
      </Transition>
    </div>
  </main>
</template>

<style scoped>
.ep-nav [aria-disabled="true"] { opacity: .4; pointer-events: none; }
.watch { position: relative; width: 100%; }
.watch-loading .sr { position: absolute; }
.watch-placeholder { aspect-ratio: 16 / 9; min-width: 0; border-radius: var(--r-lg); }
.watch:not(.watch-wide) {
  max-width: calc(min(960px, max(480px, (100svh - 180px) * 16 / 9)) + 304px + 2 * var(--pad));
  margin-inline: auto;
  grid-template-columns: minmax(0, 1fr) 280px;
}
.watch-wide { grid-template-columns: minmax(0, 1fr); }
.watch-wide .side {
  position: absolute;
  top: 20px;
  right: calc(var(--pad) + 16px);
  z-index: 12;
  width: min(320px, calc(100% - 2 * var(--pad) - 32px));
  max-height: min(460px, 60svh);
  box-shadow: 0 18px 50px #0009;
}
.watch-wide :deep(.vp:not(.fs)) { max-height: 80svh; }
.side-head { position: relative; }
.episode-close { position: absolute; right: 12px; top: 12px; width: 30px; height: 30px; font-size: 24px; }
@media (max-width: 1100px) {
  .watch:not(.watch-wide) { grid-template-columns: minmax(0, 1fr); max-width: 1000px; }
}
</style>
