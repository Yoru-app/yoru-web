<script setup>
import BrowseSkeleton from './BrowseSkeleton.vue';
import { retireView, vContentMotion } from './motion.js';
import { computed, onMounted, onUnmounted, reactive, ref, shallowRef, watch } from 'vue';
import { ICON, errorBlock, relTime, state, store, toast } from '../public/js/core.js';
import { KIND, LIST_STATUS, canEdit, hydratePosters, listAnimes, loadRates, loggedIn, rates, saveRate } from '../public/js/shiki.js';
import { lib } from '../public/js/api365.js';
import { loadBanners } from '../public/js/art.js';
import { wideCard } from '../public/js/components.js';
import AnimeCard from './AnimeCard.vue';
import AnimeFilters from './AnimeFilters.vue';
import CardSize from './CardSize.vue';
import FilterSelect from './FilterSelect.vue';
import SectionPicker from './SectionPicker.vue';
import { animeFilterDefaults, animeFilterParams, hasAnimeFilters } from './catalog.js';

const sorts = [['updated', 'Недавно изменённые'], ['title', 'По названию'], ['score', 'По моей оценке'], ['progress', 'По прогрессу']];
const props = defineProps({ route: { type: Object, required: true } });
const tabs = [...LIST_STATUS, ['history', 'История']];
const tab = ref('watching');
const tabShift = ref('0px');
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
const filters = reactive({ ...animeFilterDefaults(), showAll: false });
const hasFilters = computed(() => hasAnimeFilters(filters));
const filterParams = computed(() => animeFilterParams(filters));
const matchingIds = shallowRef(null);
const filterLoading = shallowRef(false);
const filterError = shallowRef(null);
const filterRetry = shallowRef(0);
const sortsBy = {
  updated: (a, b) => String(b.updated).localeCompare(String(a.updated)),
  title: (a, b) => a.anime.title.localeCompare(b.anime.title, 'ru'),
  score: (a, b) => b.score - a.score || String(b.updated).localeCompare(String(a.updated)),
  progress: (a, b) => b.episodes / (b.anime.episodes || 99) - a.episodes / (a.anime.episodes || 99),
};
const candidates = computed(() => (list.value || []).filter(({ status }) => status === tab.value));
const candidateIds = computed(() => [...new Set(candidates.value.map(({ anime }) => anime.id))].join(','));
const filtered = computed(() => candidates.value
  .filter(({ anime }) => !hasFilters.value || matchingIds.value?.has(anime.id))
  .sort(sortsBy[sort.value] || sortsBy.updated));
const visible = computed(() => filtered.value.slice(0, shown.value));
const posters = shallowRef(new Map());
const label = computed(() => tabs.find(([id]) => id === tab.value)?.[1]);
const counts = computed(() => {
  const result = { history: history.value.length };
  for (const rate of list.value || []) result[rate.status] = (result[rate.status] || 0) + 1;
  return result;
});
const pickerItems = computed(() => tabs.map(([id, name]) => ({
  id, name, count: counts.value[id], className: `st-${id}`, icon: `/list-status-icons.svg#${id}`,
})));

watch(() => props.route.tab, (requested) => {
  const saved = store.get('libTab', 'watching');
  const next = [requested, saved].find((id) => tabs.some(([key]) => key === id)) || 'watching';
  const step = tabs.findIndex(([key]) => key === next) - tabs.findIndex(([key]) => key === tab.value);
  tabShift.value = `${Math.sign(step) * 10}px`;
  tab.value = next;
  store.set('libTab', tab.value);
}, { immediate: true });
watch(tab, () => { shown.value = 60; });
function selectTab(id) { location.hash = `library/${id}`; }
watch(sort, (value) => store.set('libSort', value));
async function applyFilters([candidateList, params], _, onCleanup) {
  shown.value = 60;
  matchingIds.value = null;
  filterError.value = null;
  filterLoading.value = Boolean(candidateList && Object.values(params).some(Boolean));
  if (!filterLoading.value) return;
  let current = true;
  onCleanup(() => { current = false; });
  const ids = candidateList.split(',');
  const matches = new Set();
  try {
    // В коротких записях списка не хватает полей для фильтрации. Ограничиваем запрос каталога ID из вкладки.
    for (let offset = 0; offset < ids.length && current; offset += 50) {
      const batch = await listAnimes({ ...params, ids: ids.slice(offset, offset + 50).join(','),
        limit: 50, order: null, censored: null });
      for (const anime of batch) matches.add(anime.id);
    }
    if (current) matchingIds.value = matches;
  } catch (cause) {
    if (current) filterError.value = cause;
  } finally {
    if (current) filterLoading.value = false;
  }
}
watch([candidateIds, filterParams, filterRetry], applyFilters);
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
  return `${rate.episodes} из ${total(rate) || '?'}${fresh(rate) ? `, вышло ${a.aired}` : ''}`;
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
        <p v-if="!account" class="page-sub">История просмотра в этом браузере. Подключите Shikimori, чтобы видеть и вести свой список.</p>
      </div>
      <div v-if="account" class="lib-tools">
        <FilterSelect id="libSort" v-model="sort" :items="sorts" default-value="updated" :width="240" />
        <CardSize />
        <button class="btn ghost small" type="button" :disabled="refreshing" @click="refresh(true)">Обновить</button>
      </div>
    </div>
    <div class="section"><SectionPicker :model-value="tab" label="Мой список" :items="pickerItems"
      @update:model-value="selectTab" /><hr class="library-divider"></div>
    <div v-if="account && tab !== 'history'" class="section library-filters">
      <AnimeFilters :filters="filters" prefix="lib" genres-dropdown @change="Object.assign(filters, $event)">
        <button v-if="hasFilters" class="chips-more" type="button" @click="Object.assign(filters, animeFilterDefaults())">Сбросить</button>
      </AnimeFilters>
    </div>
    <Transition name="library-shift" mode="out-in" @before-leave="retireView">
    <section :key="tab" class="section library-panel" :style="{ '--library-shift': tabShift }">
      <template v-if="tab === 'history'">
        <div v-if="history.length" class="wide-grid">
          <div v-for="item in history" :key="item.eid" class="history-card" v-html="historyCard(item)"></div>
        </div>
        <div v-else class="empty"><h3>Здесь появятся начатые серии</h3><p>Включите любую серию, и она будет ждать вас здесь с того же места.</p><a class="btn primary" href="#catalog">Выбрать аниме</a></div>
      </template>
      <BrowseSkeleton v-else-if="loading || filterLoading" />
      <div v-else-if="error" v-html="errorBlock(error)" @click="(event) => event.target.closest('[data-retry-route]') && refresh()"></div>
      <div v-else-if="filterError" v-html="errorBlock(filterError)" @click="(event) => event.target.closest('[data-retry-route]') && filterRetry++"></div>
      <div v-else-if="!list" class="empty"><h3>Подключите Shikimori</h3><p>Yoru показывает и меняет ваш список прямо на Shikimori.</p><a class="btn primary" href="#settings">Подключить Shikimori</a></div>
      <div v-else-if="!visible.length && hasFilters" class="empty"><h3>Ничего не нашлось</h3><p>Измените фильтры или выберите другую вкладку списка.</p></div>
      <div v-else-if="!visible.length" class="empty"><h3>В «{{ label }}» пусто</h3><p>Добавляйте тайтлы со страницы тайтла или на Shikimori.</p></div>
      <template v-else>
        <div class="grid">
          <div v-for="rate in visible" :key="rate.id" class="lcard">
            <AnimeCard :anime="posters.get(rate.id) || rate.anime" :meta="detail(rate)" :progress="progress(rate)" :no-list="true"
              :personal-score="rate.status !== 'planned' ? Number(rate.score) : 0"
              :badge="fresh(rate) ? `Новых: ${rate.anime.aired - rate.episodes}` : ''" />
            <button v-if="canEdit() && active(rate) && (!total(rate) || rate.episodes < total(rate))"
              class="plus1" type="button" title="Отметить следующую серию просмотренной" :disabled="pending.has(rate.anime.id)"
              @click="increment(rate)"><span class="plus-icon" v-html="ICON.plus"></span>1</button>
          </div>
        </div>
        <div v-if="filtered.length > shown" class="more-wrap"><button class="btn ghost" type="button" @click="shown += 60">Показать ещё {{ Math.min(60, filtered.length - shown) }}</button></div>
      </template>
    </section>
    </Transition>
  </main>
</template>

<style scoped>
.history-card, .plus-icon { display: contents; }
.library-divider { border: 0; border-top: 1px solid var(--line); margin: 16px 0 0; }
.library-shift-enter-active { transition: opacity 220ms var(--motion-ease), translate 220ms var(--motion-ease); }
.library-shift-leave-active { transition: opacity 100ms ease-in; pointer-events: none; }
.library-shift-enter-from { opacity: .45; translate: var(--library-shift, 0px) 0; }
.library-shift-leave-to { opacity: .45; }
@media (prefers-reduced-motion: reduce) {
  .library-shift-enter-from, .library-shift-leave-to { opacity: 1; translate: none; }
}
</style>
