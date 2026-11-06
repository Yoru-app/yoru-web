<script setup>
import { vActiveIndicator, vContentMotion } from './motion.js';
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue';
import { ICON, errorBlock, relTime, state, store, toast } from '../public/js/core.js';
import { KIND, LIST_STATUS, canEdit, hydratePosters, loadRates, loggedIn, rates, saveRate } from '../public/js/shiki.js';
import { lib } from '../public/js/api365.js';
import { loadBanners } from '../public/js/art.js';
import { wideCard } from '../public/js/components.js';
import AnimeCard from './AnimeCard.vue';
import CardSize from './CardSize.vue';
import FilterSelect from './FilterSelect.vue';

const sorts = [['updated', 'Недавно изменённые'], ['title', 'По названию'], ['score', 'По моей оценке'], ['progress', 'По прогрессу']];
const tabs = [...LIST_STATUS, ['history', 'История']];
const tab = ref(store.get('libTab', 'watching'));
const sort = ref(store.get('libSort', 'updated'));
const who = loggedIn() ? state.auth.user.nickname : store.get('shikiNick', '');
const account = computed(() => loggedIn() || Boolean(who));
const list = shallowRef(null);
const history = shallowRef([]);
const loading = ref(false);
const refreshing = ref(false);
const error = shallowRef(null);
const shown = ref(60);
const pending = reactive(new Set());
const sortsBy = {
  updated: (a, b) => String(b.updated).localeCompare(String(a.updated)),
  title: (a, b) => a.anime.title.localeCompare(b.anime.title, 'ru'),
  score: (a, b) => b.score - a.score || String(b.updated).localeCompare(String(a.updated)),
  progress: (a, b) => b.episodes / (b.anime.episodes || 99) - a.episodes / (a.anime.episodes || 99),
};
const filtered = computed(() => (list.value || []).filter((rate) => rate.status === tab.value).sort(sortsBy[sort.value] || sortsBy.updated));
const visible = computed(() => filtered.value.slice(0, shown.value));
const posters = shallowRef(new Map());
const label = computed(() => tabs.find(([id]) => id === tab.value)?.[1]);
const counts = computed(() => {
  const result = { history: history.value.length };
  for (const rate of list.value || []) result[rate.status] = (result[rate.status] || 0) + 1;
  return result;
});

watch(tab, (value) => { shown.value = 60; store.set('libTab', value); });
watch(sort, (value) => store.set('libSort', value));
watch(visible, (items, _, onCleanup) => {
  if (!items.length) { posters.value = new Map(); return; }
  let active = true;
  onCleanup(() => { active = false; });
  hydratePosters(items).then(() => {
    if (active) posters.value = new Map(items.map((rate) => [rate.id, rate.anime]));
  }).catch(() => {});
});

function readState() {
  list.value = rates.list ? [...rates.list] : null;
  history.value = lib.history();
}
async function refresh(force = false) {
  readState();
  loadBanners(history.value.map((item) => item.aid)).then(() => { history.value = lib.history(); });
  if (!account.value) return;
  if (force) refreshing.value = true;
  else loading.value = !list.value;
  error.value = null;
  try {
    await loadRates(force);
    readState();
    if (force) toast('Список обновлён');
  } catch (cause) {
    if (force) toast(cause.message);
    else error.value = cause;
  } finally {
    loading.value = false;
    refreshing.value = false;
  }
}

function active(rate) { return ['watching', 'rewatching', 'on_hold'].includes(rate.status); }
function total(rate) { return rate.anime.episodes || (rate.anime.status === 'released' ? rate.anime.aired : 0); }
function fresh(rate) { return active(rate) && rate.anime.status === 'ongoing' && rate.anime.aired > rate.episodes; }
function detail(rate) {
  const a = rate.anime;
  if (rate.status === 'planned') return [KIND[a.kind], a.year].filter(Boolean).join(', ');
  return `${rate.episodes} из ${total(rate) || '?'}${fresh(rate) ? `, вышло ${a.aired}` : ''}${rate.score ? `, оценка ${rate.score}` : ''}`;
}
function progress(rate) {
  if (['planned', 'completed'].includes(rate.status) || !total(rate)) return 0;
  return Math.min(100, Math.round(rate.episodes / total(rate) * 100));
}
function historyCard(item) {
  const percent = lib.pct(item.eid);
  const at = relTime(new Date(item.at).toISOString());
  return wideCard(item.anime, { href: `#watch-${item.aid}-${item.eid}`, kicker: item.ep,
    sub: percent ? `Просмотрено ${percent}%, ${at}` : at, progress: percent, action: true });
}
async function increment(rate) {
  const id = rate.anime.id;
  pending.add(id);
  const episodes = rate.episodes + 1;
  const end = rate.anime.episodes;
  try {
    await saveRate(rate.anime, { episodes, ...(end && episodes >= end ? { status: 'completed' } : {}) });
    toast(`${rate.anime.title}: ${episodes} из ${end || '?'}`);
  } catch (cause) { toast(cause.message); }
  finally { pending.delete(id); }
}
onMounted(() => {
  window.scrollTo({ top: 0, behavior: 'instant' });
  window.addEventListener('yoru:rates', readState);
  refresh();
});
onUnmounted(() => window.removeEventListener('yoru:rates', readState));
defineExpose({ refresh });
</script>

<template>
  <main v-content-motion id="view" data-page="library" tabindex="-1">
    <div class="page-head lib-head">
      <div>
        <h1 class="page-title">Моё</h1>
        <p class="page-sub" v-if="account">Список <b>{{ who }}</b> на Shikimori{{ loggedIn() ? '' : ' (только чтение)' }}.</p>
        <p class="page-sub" v-else>История просмотра в этом браузере. Подключите Shikimori, чтобы видеть и вести свой список.</p>
      </div>
      <div v-if="account" class="lib-tools">
        <FilterSelect id="libSort" v-model="sort" :items="sorts" default-value="updated" :width="240" />
        <CardSize />
        <button class="btn ghost small" type="button" :disabled="refreshing" @click="refresh(true)">Обновить</button>
      </div>
    </div>
    <div class="section"><div v-active-indicator class="tabs" role="tablist" aria-label="Мой список">
      <button v-for="[id, name] in tabs" :key="id" role="tab" type="button" :aria-selected="tab === id" @click="tab = id">
        {{ name }}<small v-if="counts[id]"> {{ counts[id] }}</small>
      </button>
    </div></div>
    <section class="section">
      <template v-if="tab === 'history'">
        <div v-if="history.length" class="wide-grid">
          <div v-for="item in history" :key="item.eid" class="history-card" v-html="historyCard(item)"></div>
        </div>
        <div v-else class="empty"><h3>Здесь появятся начатые серии</h3><p>Включите любую серию, и она будет ждать вас здесь с того же места.</p><a class="btn primary" href="#catalog">Выбрать аниме</a></div>
      </template>
      <div v-else-if="loading" class="loading"><span class="spin" aria-label="Загрузка"></span></div>
      <div v-else-if="error" v-html="errorBlock(error)" @click="(event) => event.target.closest('[data-retry-route]') && refresh()"></div>
      <div v-else-if="!list" class="empty"><h3>Подключите Shikimori</h3><p>Yoru показывает и меняет ваш список прямо на Shikimori.</p><a class="btn primary" href="#settings">Подключить Shikimori</a></div>
      <div v-else-if="!visible.length" class="empty"><h3>В «{{ label }}» пусто</h3><p>Добавляйте тайтлы со страницы тайтла или на Shikimori.</p></div>
      <template v-else>
        <div class="grid">
          <div v-for="rate in visible" :key="rate.id" class="lcard">
            <AnimeCard :anime="posters.get(rate.id) || rate.anime" :meta="detail(rate)" :progress="progress(rate)" :no-list="true"
              :href="active(rate) || rate.status === 'planned' ? `#cont-${rate.anime.id}-${rate.episodes}` : undefined"
              :badge="fresh(rate) ? `Новых: ${rate.anime.aired - rate.episodes}` : ''" />
            <button v-if="canEdit() && active(rate) && (!total(rate) || rate.episodes < total(rate))"
              class="plus1" type="button" title="Отметить следующую серию просмотренной" :disabled="pending.has(rate.anime.id)"
              @click="increment(rate)"><span class="plus-icon" v-html="ICON.plus"></span>1</button>
          </div>
        </div>
        <div v-if="filtered.length > shown" class="more-wrap"><button class="btn ghost" type="button" @click="shown += 60">Показать ещё {{ Math.min(60, filtered.length - shown) }}</button></div>
      </template>
    </section>
  </main>
</template>

<style scoped>
.history-card, .plus-icon { display: contents; }
</style>
