<script setup>
import BrowseSkeleton from './BrowseSkeleton.vue';
import { vContentMotion } from './motion.js';
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { errorBlock } from '../public/js/core.js';
import { listAnimes } from '../public/js/shiki.js';
import { animeFilterParams, catalog, hasAnimeFilters, resetCatalog } from './catalog.js';
import AnimeCard from './AnimeCard.vue';
import AnimeFilters from './AnimeFilters.vue';
import CardSize from './CardSize.vue';
import FilterSelect from './FilterSelect.vue';

const orders = [['popularity', 'По популярности'], ['ranked', 'По оценке'], ['aired_on', 'По дате выхода'], ['name', 'По названию']];

const items = shallowRef([]);
const loading = ref(false);
const done = ref(false);
const error = shallowRef(null);
const sentinel = ref(null);
let observer;
let page = 1;
let sequence = 0;

async function loadMore() {
  if (loading.value || done.value || error.value) return;
  const request = sequence;
  loading.value = true;
  try {
    const batch = await listAnimes({
      ...animeFilterParams(catalog), search: catalog.search, order: catalog.order, page, limit: 30,
    });
    if (sequence !== request) return;
    items.value = [...items.value, ...batch];
    page++;
    done.value = batch.length < 30;
  } catch (cause) {
    if (sequence === request) error.value = cause;
  } finally {
    if (sequence === request) loading.value = false;
  }
  await nextTick();
  if (sequence === request && sentinel.value?.getBoundingClientRect().top < innerHeight + 600) loadMore();
}

function refresh() {
  sequence++;
  page = 1;
  items.value = [];
  loading.value = false;
  done.value = false;
  error.value = null;
  loadMore();
}

watch(() => [catalog.search, catalog.genres, catalog.kind, catalog.status, catalog.season, catalog.order], refresh);
onMounted(() => {
  window.scrollTo({ top: 0, behavior: 'instant' });
  observer = new IntersectionObserver(([entry]) => { if (entry.isIntersecting) loadMore(); }, { rootMargin: '900px' });
  observer.observe(sentinel.value);
  refresh();
});
onBeforeUnmount(() => { sequence++; observer?.disconnect(); });
defineExpose({ refresh });
</script>

<template>
  <main v-content-motion id="view" data-page="catalog" tabindex="-1">
    <div class="page-head">
      <h1 class="page-title">{{ catalog.search ? `Поиск: ${catalog.search}` : 'Каталог' }}</h1>
      <p class="page-sub">{{ catalog.search ? 'Ищем по названию на русском, английском и японском.' : 'Вся база Shikimori. Отфильтруйте по жанрам, типу и году.' }}</p>
      <AnimeFilters :filters="catalog" prefix="f" @change="Object.assign(catalog, $event)">
        <FilterSelect v-if="!catalog.search" id="fOrder" v-model="catalog.order" :items="orders" default-value="popularity" :width="240" />
        <button v-if="hasAnimeFilters(catalog) || catalog.search"
          class="chips-more" type="button" @click="resetCatalog">Сбросить</button>
        <span class="filters-sp"></span><CardSize />
      </AnimeFilters>
    </div>
    <section class="section">
      <div class="grid"><AnimeCard v-for="(anime, index) in items" :key="`${anime.id}-${index}`" :anime="anime" /></div>
      <BrowseSkeleton v-if="loading && !items.length" />
      <div v-else-if="loading" class="loading"><span class="spin" aria-label="Загрузка"></span></div>
      <div v-else-if="error" v-html="errorBlock(error)" @click="(event) => event.target.closest('[data-retry-route]') && refresh()"></div>
      <div v-else-if="done && !items.length" class="empty">
        <h3>Ничего не нашлось</h3><p>{{ catalog.search ? 'Попробуйте другое написание: по-русски, латиницей или по-японски.' : 'Уберите часть фильтров.' }}</p>
      </div>
      <div ref="sentinel" class="sentinel"></div>
    </section>
  </main>
</template>
