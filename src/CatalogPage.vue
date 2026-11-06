<script setup>
import { vContentMotion } from './motion.js';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import { errorBlock } from '../public/js/core.js';
import { genres, listAnimes } from '../public/js/shiki.js';
import { catalog, resetCatalog } from './catalog.js';
import AnimeCard from './AnimeCard.vue';
import CardSize from './CardSize.vue';
import FilterSelect from './FilterSelect.vue';

const kinds = [['tv', 'ТВ'], ['movie', 'Фильм'], ['ova', 'OVA'], ['ona', 'ONA'], ['special', 'Спешл'], ['tv_special', 'ТВ-спешл']];
const statuses = [['ongoing', 'Выходит'], ['released', 'Вышел'], ['anons', 'Анонс']];
const orders = [['popularity', 'По популярности'], ['ranked', 'По оценке'], ['aired_on', 'По дате выхода'], ['name', 'По названию']];
const now = new Date();
const year = now.getFullYear();
const season = [['winter', 'Зима'], ['spring', 'Весна'], ['summer', 'Лето'], ['fall', 'Осень']][Math.floor(now.getMonth() / 3)];
const seasons = [[`${season[0]}_${year}`, `${season[1]} ${year}`],
  ...Array.from({ length: 31 }, (_, i) => [String(year - i), String(year - i)]),
  [`1990_${year - 31}`, `1990–${year - 31}`], ['1980_1989', '1980-е']];

const allGenres = shallowRef([]);
const items = shallowRef([]);
const loading = ref(false);
const done = ref(false);
const error = shallowRef(null);
const sentinel = ref(null);
let observer;
let page = 1;
let sequence = 0;
const shownGenres = computed(() => catalog.showAll ? allGenres.value :
  allGenres.value.filter((genre) => genre.kind === 'genre').filter((genre, index) => index < 18 || catalog.genres.includes(genre.id)));

function toggleGenre(id) {
  catalog.genres = catalog.genres.includes(id) ? catalog.genres.filter((current) => current !== id) : [...catalog.genres, id];
}

async function loadMore() {
  if (loading.value || done.value || error.value) return;
  const request = sequence;
  loading.value = true;
  try {
    const batch = await listAnimes({
      search: catalog.search, genre: catalog.genres.join(','), kind: catalog.kind, status: catalog.status,
      season: catalog.season, order: catalog.order, page, limit: 30,
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
  genres().then((result) => { allGenres.value = result; }).catch(() => {});
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
      <div class="filters">
        <FilterSelect id="fKind" v-model="catalog.kind" :items="kinds" placeholder="Любой тип" :width="220" />
        <FilterSelect id="fStatus" v-model="catalog.status" :items="statuses" placeholder="Любой статус" :width="220" />
        <FilterSelect id="fSeason" v-model="catalog.season" :items="seasons" placeholder="Любой год" :cols="4" :width="420" />
        <FilterSelect v-if="!catalog.search" id="fOrder" v-model="catalog.order" :items="orders" default-value="popularity" :width="240" />
        <button v-if="catalog.kind || catalog.status || catalog.season || catalog.genres.length || catalog.search"
          class="chips-more" type="button" @click="resetCatalog">Сбросить</button>
        <span class="filters-sp"></span><CardSize />
      </div>
      <div v-if="allGenres.length" class="chips">
        <button v-for="genre in shownGenres" :key="genre.id" class="chip" type="button"
          :aria-pressed="catalog.genres.includes(genre.id)" @click="toggleGenre(genre.id)">{{ genre.name }}</button>
        <button class="chips-more" type="button" @click="catalog.showAll = !catalog.showAll">{{ catalog.showAll ? 'Свернуть' : 'Все жанры и темы' }}</button>
      </div>
    </div>
    <section class="section">
      <div class="grid"><AnimeCard v-for="(anime, index) in items" :key="`${anime.id}-${index}`" :anime="anime" /></div>
      <div v-if="loading" class="loading"><span class="spin" aria-label="Загрузка"></span></div>
      <div v-else-if="error" v-html="errorBlock(error)" @click="(event) => event.target.closest('[data-retry-route]') && refresh()"></div>
      <div v-else-if="done && !items.length" class="empty">
        <h3>Ничего не нашлось</h3><p>{{ catalog.search ? 'Попробуйте другое написание: по-русски, латиницей или по-японски.' : 'Уберите часть фильтров.' }}</p>
      </div>
      <div ref="sentinel" class="sentinel"></div>
    </section>
  </main>
</template>
