<script setup>
import { vContentMotion } from './motion.js';
import { computed, onMounted, ref, shallowRef, watch } from 'vue';
import { errorBlock, parseDate, store } from '../public/js/core.js';
import { calendar, rates, loadRates, loggedIn } from '../public/js/shiki.js';
import AnimeCard from './AnimeCard.vue';
import CardSize from './CardSize.vue';

const mine = ref(store.get('schedMine', false));
const hasList = loggedIn() || Boolean(store.get('shikiNick', ''));
const items = shallowRef([]);
const rateIds = shallowRef(null);
const loading = ref(true);
const error = shallowRef(null);
watch(mine, (value) => store.set('schedMine', value));

const days = computed(() => {
  const list = items.value.filter((item) => parseDate(item.at) &&
    (!mine.value || !rateIds.value || rateIds.value.has(item.anime.id)));
  list.sort((a, b) => parseDate(a.at) - parseDate(b.at));
  const grouped = new Map();
  for (const item of list) {
    const day = new Date(parseDate(item.at));
    day.setHours(0, 0, 0, 0);
    const date = +day;
    if (!grouped.has(date)) grouped.set(date, []);
    grouped.get(date).push(item);
  }
  return [...grouped].slice(0, 9);
});

function dayName(date) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const diff = Math.round((date - +today) / 86400e3);
  const label = new Date(date).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  if (diff === 0) return `Сегодня, ${label}`;
  if (diff === 1) return `Завтра, ${label}`;
  if (diff < 0) return `Уже вышло, ${label}`;
  const weekday = new Date(date).toLocaleDateString('ru-RU', { weekday: 'long' });
  return `${weekday[0].toUpperCase()}${weekday.slice(1)}, ${label}`;
}

function episodeLabel(item) {
  const time = new Date(parseDate(item.at)).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  return `${time}, ${item.ep}-я серия`;
}

async function refresh() {
  loading.value = true;
  error.value = null;
  try {
    const [schedule] = await Promise.all([calendar(), hasList ? loadRates().catch(() => null) : null]);
    items.value = schedule;
    rateIds.value = rates.list ? new Set(rates.by.keys()) : null;
  } catch (cause) { error.value = cause; }
  finally { loading.value = false; }
}

onMounted(() => {
  window.scrollTo({ top: 0, behavior: 'instant' });
  refresh();
});
</script>

<template>
  <main v-content-motion id="view" data-page="schedule" tabindex="-1">
    <div class="page-head lib-head">
      <div><h1 class="page-title">Расписание</h1><p class="page-sub">Когда выйдут следующие серии онгоингов. Время — по вашему часовому поясу.</p></div>
      <div class="lib-tools">
        <label v-if="hasList" class="switch-line"><input v-model="mine" class="toggle" type="checkbox"> Только мой список</label>
        <CardSize />
      </div>
    </div>
    <div v-if="loading" class="loading"><span class="spin" aria-label="Загрузка"></span></div>
    <div v-else-if="error" v-html="errorBlock(error)" @click="(event) => event.target.closest('[data-retry-route]') && refresh()"></div>
    <template v-else-if="days.length">
      <section v-for="[date, day] in days" :key="date" class="section">
        <div class="section-head"><h2 class="section-title">{{ dayName(date) }}</h2><span class="section-link">{{ day.length }}</span></div>
        <div class="grid">
          <AnimeCard v-for="item in day" :key="item.anime.id" :anime="item.anime" :meta="episodeLabel(item)" />
        </div>
      </section>
    </template>
    <section v-else class="section">
      <div class="empty">
        <h3>{{ mine ? 'В вашем списке нет онгоингов' : 'Расписание пустое' }}</h3>
        <p>{{ mine ? 'Добавьте выходящие тайтлы в «Смотрю» или «Запланировано».' : 'Shikimori не вернул ни одного онгоинга.' }}</p>
      </div>
    </section>
  </main>
</template>
