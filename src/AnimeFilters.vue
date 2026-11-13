<script setup>
import { computed, onMounted, shallowRef } from 'vue';
import { genres, KIND, STATUS } from '../public/js/shiki.js';
import MultiFilterSelect from './MultiFilterSelect.vue';

const { filters, prefix, genresDropdown } = defineProps({
  filters: { type: Object, required: true },
  prefix: { type: String, required: true },
  genresDropdown: Boolean,
});
const emit = defineEmits(['change']);
const kinds = Object.entries(KIND);
const statuses = ['ongoing', 'released', 'anons'].map((key) => [key, STATUS[key]]);
const now = new Date();
const year = now.getFullYear();
const [seasonId, seasonLabel] = [['winter', 'Зима'], ['spring', 'Весна'], ['summer', 'Лето'], ['fall', 'Осень']][Math.floor(now.getMonth() / 3)];
const seasons = [[`${seasonId}_${year}`, `${seasonLabel} ${year}`],
  ...Array.from({ length: 31 }, (_, i) => [String(year - i), String(year - i)]),
  [`1990_${year - 31}`, `1990–${year - 31}`], ['1980_1989', '1980-е']];

const allGenres = shallowRef([]);
const genreOptions = computed(() => allGenres.value.map(({ id, name, kind }) => [String(id), name, kind]));
const shownGenres = computed(() => filters.showAll ? allGenres.value :
  allGenres.value.filter((genre) => genre.kind === 'genre').filter((genre, index) => index < 18 || filters.genres.includes(genre.id)));

function toggleGenre(id) {
  const next = filters.genres.includes(id) ? filters.genres.filter((current) => current !== id) : [...filters.genres, id];
  emit('change', { genres: next });
}
onMounted(() => { genres().then((result) => { allGenres.value = result; }).catch(() => {}); });
</script>

<template>
  <div class="filters">
    <MultiFilterSelect :id="`${prefix}Kind`" :model-value="filters.kind" :items="kinds" label="Тип" placeholder="Любой тип" @update:model-value="emit('change', { kind: $event })" />
    <MultiFilterSelect :id="`${prefix}Status`" :model-value="filters.status" :items="statuses" label="Статус выхода" placeholder="Любой статус" @update:model-value="emit('change', { status: $event })" />
    <MultiFilterSelect :id="`${prefix}Season`" :model-value="filters.season" :items="seasons" label="Год" placeholder="Любой год" :cols="2" :width="280" @update:model-value="emit('change', { season: $event })" />
    <MultiFilterSelect v-if="genresDropdown && genreOptions.length" :model-value="filters.genres.map(String)"
      :items="genreOptions" label="Жанры и темы" placeholder="Жанры и темы" :width="320"
      @update:model-value="emit('change', { genres: $event.map(Number) })" />
    <slot />
  </div>
  <div v-if="!genresDropdown && allGenres.length" class="chips">
    <button v-for="genre in shownGenres" :key="genre.id" class="chip" type="button"
      :class="{ 'tag-genre': genre.kind === 'genre', 'tag-theme': genre.kind === 'theme' }"
      :aria-pressed="filters.genres.includes(genre.id)" @click="toggleGenre(genre.id)">{{ genre.name }}</button>
    <button class="chips-more" type="button" @click="emit('change', { showAll: !filters.showAll })">{{ filters.showAll ? 'Свернуть' : 'Все жанры и темы' }}</button>
  </div>
</template>
