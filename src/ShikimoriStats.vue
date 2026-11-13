<script setup>
import { computed, onBeforeUnmount, onMounted, shallowRef, watch } from 'vue';
import { gsap } from 'gsap';
import { getAnimeDurations, LIST_STATUS } from '../public/js/shiki.js';

const props = defineProps({ entries: { type: Array, required: true } });
const statuses = [['all', 'Весь список'], ...LIST_STATUS];
const number = new Intl.NumberFormat('ru-RU');
const decimal = new Intl.NumberFormat('ru-RU', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const percent = new Intl.NumberFormat('ru-RU', { style: 'percent' });
const format = (value, index = 0) => value == null ? '—' : (index === 3 ? decimal : number).format(value);
const scoreLabels = Array.from({ length: 10 }, (_, index) => index + 1);

const root = shallowRef(null);
const filter = shallowRef('all');
const hoverScore = shallowRef(null);
const focusedScore = shallowRef(null);
const pinnedScore = shallowRef(null);
const durations = shallowRef(new Map());
let motion;

function watchedEpisodes(entry) {
  const episodes = Number(entry.episodes) || 0;
  const total = Number(entry.anime.episodes) || 0;
  return (episodes || (entry.status === 'completed' ? total : 0)) + (Number(entry.rewatches) || 0) * total;
}

watch(() => props.entries, async (entries, _, onCleanup) => {
  let active = true;
  onCleanup(() => { active = false; });
  const ids = [...new Set(entries
    .filter((entry) => watchedEpisodes(entry) > 0 && !entry.anime.duration)
    .map((entry) => entry.anime.id)
    .filter((id) => Number.isInteger(id) && id > 0))].sort((a, b) => a - b);
  const result = await getAnimeDurations(ids, () => active);
  if (active) durations.value = result;
}, { immediate: true });

const groups = computed(() => {
  const buckets = Object.fromEntries(statuses.map(([key]) => [
    key, { total: 0, completed: 0, episodes: 0, minutes: 0, hasViewing: false, rated: 0, scoreSum: 0, scores: Array(10).fill(0) },
  ]));
  for (const entry of props.entries) {
    const score = Number(entry.score);
    const episodes = Number(entry.episodes);
    const watched = watchedEpisodes(entry);
    const duration = entry.anime.duration || durations.value.get(entry.anime.id) || 0;
    const status = entry.status !== 'all' && Object.hasOwn(buckets, entry.status) ? buckets[entry.status] : null;
    for (const bucket of [buckets.all, status]) {
      if (!bucket) continue;
      bucket.total++;
      bucket.completed += Number(entry.status === 'completed');
      bucket.episodes += Number.isFinite(episodes) ? Math.max(0, episodes) : 0;
      bucket.hasViewing ||= watched > 0;
      bucket.minutes += watched * duration;
      if (Number.isInteger(score) && score >= 1 && score <= 10) {
        bucket.rated++;
        bucket.scoreSum += score;
        bucket.scores[score - 1]++;
      }
    }
  }
  return buckets;
});
const total = computed(() => groups.value.all.total);
const selection = computed(() => groups.value[filter.value]);
const selectionLabel = computed(() => statuses.find(([key]) => key === filter.value)[1]);
const metrics = computed(() => [
  [filter.value === 'all' ? 'Тайтлов в списке' : 'Тайтлов в выборке', selection.value.total],
  ['Просмотрено тайтлов', selection.value.completed],
  ['Отмечено серий', selection.value.episodes],
  ['Средняя оценка', selection.value.rated ? selection.value.scoreSum / selection.value.rated : null],
  ['Часов просмотрено', selection.value.minutes || !selection.value.hasViewing
    ? Math.round(selection.value.minutes / 60)
    : null],
]);
const axisMax = computed(() => Math.max(2, Math.ceil(Math.max(...selection.value.scores) / 2) * 2));
const scoreInView = computed(() => hoverScore.value ?? focusedScore.value ?? pinnedScore.value);
const scoreCount = (score) => selection.value.scores[score - 1];
const scoreShare = (score) => percent.format(selection.value.rated ? scoreCount(score) / selection.value.rated : 0);
const scoreLabel = (score) => `Оценка ${score} из 10. Тайтлов: ${format(scoreCount(score))}, ${scoreShare(score)} от всех оценённых`;

function selectStatus(key) {
  if (filter.value === key) return;
  filter.value = key;
  hoverScore.value = focusedScore.value = pinnedScore.value = null;
}

function resetStatus() {
  selectStatus('all');
  root.value.querySelector('[data-status="all"]').focus();
}

function pinScore(score) {
  pinnedScore.value = pinnedScore.value === score ? null : score;
}

onMounted(() => {
  const board = root.value;
  const numbers = [...board.querySelectorAll('[data-counter]')];
  const statusBars = [...board.querySelectorAll('[data-status-bar]')];
  const scoreBars = [...board.querySelectorAll('[data-score-bar]')];
  const readout = board.querySelector('.shiki-rating-context');
  motion = gsap.matchMedia();
  motion.add('(prefers-reduced-motion: no-preference)', () => {
    let timeline;
    const counters = numbers.map(() => ({ value: 0 }));
    gsap.set(statusBars, { scaleX: 0 });
    gsap.set(scoreBars, { scaleY: 0 });

    const stop = watch(metrics, () => {
      timeline?.kill();
      const targets = metrics.value.map(([, value]) => value);
      const updateCounters = () => {
        for (const [index, counter] of counters.entries()) {
          const text = format(targets[index] == null ? null : index === 3 ? counter.value : Math.round(counter.value), index);
          if (numbers[index].textContent !== text) numbers[index].textContent = text;
        }
      };
      updateCounters();
      timeline = gsap.timeline({ defaults: { duration: 0.4, ease: 'power3.out' } })
        .to(counters, { value: (index) => targets[index] ?? 0, onUpdate: updateCounters }, 0)
        .to(statusBars, { scaleX: (_, bar) => Number(bar.dataset.statusBar) }, 0)
        .to(scoreBars, { scaleY: (_, bar) => Number(bar.dataset.scoreBar) }, 0.035)
        .fromTo(readout, { opacity: 0.64, y: 3 }, { opacity: 1, y: 0, duration: 0.22, clearProps: 'opacity,transform' }, 0);
    }, { immediate: true, flush: 'post' });

    return () => {
      stop();
      timeline?.kill();
      gsap.set([...statusBars, ...scoreBars], { clearProps: 'transform' });
      gsap.set(readout, { clearProps: 'opacity,transform' });
      numbers.forEach((element, index) => { element.textContent = format(metrics.value[index][1], index); });
    };
  }, board);
});
onBeforeUnmount(() => motion?.revert());
</script>

<template>
  <div ref="root" class="shiki-grid">
    <dl class="shiki-tile shiki-metrics" aria-label="Статистика выбранных тайтлов">
      <div v-for="([label, value], index) in metrics" :key="index">
        <dt :title="index === 4 ? 'Оценка по отмеченным сериям и их длительности на Shikimori' : null">{{ label }}</dt>
        <dd>
          <small v-if="index === 4 && value > 0" aria-label="Примерно">≈ </small>
          <span aria-hidden="true" data-counter>{{ format(value, index) }}</span>
          <span class="sr">{{ format(value, index) }}</span>
          <small v-if="index === 3 && value != null">/ 10</small>
        </dd>
      </div>
    </dl>

    <section class="shiki-tile shiki-statuses" aria-labelledby="shiki-status-heading">
      <h3 id="shiki-status-heading">Мой список</h3>
      <p>Статус фильтрует показатели и оценки.</p>
      <div class="shiki-status-options" role="group" aria-label="Фильтр по статусу">
        <button v-for="[key, label] in statuses" :key="key" type="button" class="shiki-status-option"
          :data-status="key" :aria-pressed="filter === key" @click="selectStatus(key)">
          <span class="shiki-status-label"><i class="shiki-status-dot" aria-hidden="true"></i>{{ label }}</span>
          <span class="shiki-status-track" aria-hidden="true">
            <i :data-status-bar="total ? groups[key].total / total : 0"
              :style="{ '--level': total ? groups[key].total / total : 0 }"></i>
          </span>
          <b>{{ format(groups[key].total) }}</b>
        </button>
      </div>
    </section>

    <section class="shiki-tile shiki-ratings" aria-labelledby="shiki-rating-heading">
      <h3 id="shiki-rating-heading">Ваши оценки</h3>
      <p class="shiki-rating-context">
        {{ selectionLabel }} <span aria-hidden="true">·</span> Оценено {{ format(selection.rated) }} из {{ format(selection.total) }}
      </p>
      <p class="sr" role="status">{{ selectionLabel }}. Оценено {{ format(selection.rated) }} из {{ format(selection.total) }}.</p>
      <div class="shiki-plot" :class="{ 'is-empty': !selection.rated }" @keydown.esc="pinnedScore = null">
        <span v-if="selection.rated" class="shiki-mobile-scale" aria-hidden="true">Шкала: 0–{{ format(axisMax) }}</span>
        <div class="shiki-axis" aria-hidden="true">
          <span>{{ format(axisMax) }}</span><span>{{ format(axisMax / 2) }}</span><span>0</span>
        </div>
        <div class="shiki-guide" aria-hidden="true"><i></i><i></i><i></i></div>
        <div class="shiki-bars" role="group" aria-label="Распределение оценок от 1 до 10">
          <button v-for="score in scoreLabels" :key="score" type="button" class="shiki-bar"
            :aria-label="scoreLabel(score)" :aria-pressed="pinnedScore === score" :disabled="!selection.rated"
            @pointerenter="hoverScore = score" @pointerleave="hoverScore = null"
            @focus="focusedScore = score" @blur="focusedScore = null" @click="pinScore(score)">
            <span class="shiki-bar-track" aria-hidden="true">
              <i :data-score-bar="scoreCount(score) / axisMax" :style="{ '--level': scoreCount(score) / axisMax }"></i>
            </span>
            <span aria-hidden="true">{{ score }}</span>
          </button>
        </div>
        <div v-if="!selection.rated" class="shiki-plot-empty">
          <strong>{{ !total ? 'Список пока пуст' : 'В этой выборке нет оценок' }}</strong>
          <a v-if="!total" href="#catalog">Перейти в каталог</a>
          <button v-else-if="filter !== 'all'" type="button" @click="resetStatus">Показать весь список</button>
          <a v-else href="#library">Открыть мой список</a>
        </div>
      </div>
      <div class="shiki-score-detail" aria-hidden="true">
        <template v-if="selection.rated && scoreInView != null">
          <strong>{{ scoreInView }} / 10</strong>
          <span>Тайтлов: {{ format(scoreCount(scoreInView)) }} · {{ scoreShare(scoreInView) }}</span>
        </template>
        <span v-else-if="selection.rated">Тайтлы по оценкам</span>
      </div>
    </section>
  </div>
</template>
