<script setup>
import { computed, shallowRef } from 'vue';

const props = defineProps({
  activity: { type: Array, default: () => [] },
  loading: Boolean,
  unavailable: Boolean,
});
const hours = new Intl.NumberFormat('ru-RU', { style: 'unit', unit: 'hour', unitDisplay: 'short' });
const date = new Intl.DateTimeFormat('ru-RU', {
  day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow',
});
const tick = new Intl.DateTimeFormat('ru-RU', {
  month: 'short', year: '2-digit', timeZone: 'Europe/Moscow',
});
const hovered = shallowRef(null);
const focused = shallowRef(null);
const pinned = shallowRef(null);

const periods = computed(() => {
  const result = [];
  for (const row of props.activity || []) {
    if (!Array.isArray(row?.name)) continue;
    const [start, end] = row.name;
    const value = row.value;
    if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(value) || end < start || value < 0) continue;
    const from = new Date(start * 1000);
    const to = new Date(end * 1000);
    if (Number.isNaN(+from) || Number.isNaN(+to)) continue;
    result.push({ start, from, to, value, label: date.formatRange(from, to) });
  }
  return result.sort((a, b) => a.start - b.start);
});
const maximum = computed(() => Math.max(0, ...periods.value.map((period) => period.value)));
const selected = computed(() => {
  const start = hovered.value ?? focused.value ?? pinned.value;
  return periods.value.find((period) => period.start === start) || periods.value.at(-1);
});
const range = computed(() => periods.value.length
  ? date.formatRange(periods.value[0].from, periods.value.at(-1).to)
  : '');
</script>

<template>
  <section class="shiki-tile shiki-activity" aria-labelledby="shiki-activity-heading" :aria-busy="loading">
    <header class="activity-head">
      <h3 id="shiki-activity-heading">Активность</h3>
      <p v-if="maximum">{{ range }}</p>
    </header>
    <div v-if="loading" class="activity-placeholder" role="status">
      <span class="sr">Загружаем активность Shikimori</span>
    </div>
    <p v-else-if="!maximum" class="activity-empty">
      {{ unavailable ? 'Не удалось загрузить активность Shikimori.' : 'На Shikimori пока нет данных об активности.' }}
    </p>
    <template v-else>
      <div class="activity-window">
        <div class="activity-chart" :style="{ '--periods': periods.length }" role="group" aria-label="Активность по периодам">
          <button v-for="(period, index) in periods" :key="period.start" class="activity-period" type="button"
            :aria-label="`${period.label}. ${hours.format(period.value)}`" :aria-pressed="pinned === period.start"
            @pointerenter="hovered = period.start" @pointerleave="hovered = null"
            @focus="focused = period.start" @blur="focused = null"
            @click="pinned = pinned === period.start ? null : period.start">
            <span class="activity-track" aria-hidden="true">
              <i :style="{ '--level': period.value / maximum }"></i>
            </span>
            <span v-if="index % 4 === 0 && index < periods.length - 2" class="activity-tick" aria-hidden="true">
              {{ tick.format(period.from) }}
            </span>
            <span v-else-if="index === periods.length - 1" class="activity-tick activity-tick-end" aria-hidden="true">
              {{ tick.format(period.to) }}
            </span>
          </button>
        </div>
      </div>
      <p class="activity-detail" aria-hidden="true">
        {{ selected.label }} <strong>{{ hours.format(selected.value) }}</strong>
      </p>
    </template>
  </section>
</template>

<style scoped>
.activity-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 4px 16px;
}
.activity-head h3 { margin: 0; font: 600 1rem/1.35 var(--display); letter-spacing: -.025em; }
.activity-head p, .activity-empty, .activity-detail { color: var(--board-muted); font-size: .8125rem; }
.activity-head p { margin: 0; }
.activity-window {
  overflow-x: auto;
  margin-top: 14px;
  padding: 4px 3px 7px;
  scrollbar-color: var(--board-line) transparent;
}
.activity-chart {
  display: grid;
  grid-template-columns: repeat(var(--periods), minmax(26px, 1fr));
  min-width: calc(var(--periods) * 26px);
}
.activity-period { position: relative; min-width: 0; border-radius: 5px; padding-bottom: 21px; }
.activity-track {
  display: grid;
  justify-items: center;
  height: 124px;
  border-bottom: 1px solid var(--board-line);
}
.activity-track i {
  width: 78%;
  max-width: 30px;
  border-radius: 5px 5px 0 0;
  background: var(--board-bar);
  transform: scaleY(var(--level));
  transform-origin: center bottom;
}
.activity-period:nth-child(odd) .activity-track i { background: var(--status-on-hold); }
.activity-period:is(:hover, :focus-visible, [aria-pressed="true"]) { background: var(--board-track); }
.activity-period:focus-visible { outline-offset: -2px; }
.activity-tick {
  position: absolute;
  inset: auto auto 0 0;
  white-space: nowrap;
  color: var(--board-muted);
  font-size: .6875rem;
  pointer-events: none;
}
.activity-tick-end { inset-inline: auto 0; }
.activity-detail { display: flex; flex-wrap: wrap; gap: 2px 12px; margin: 8px 0 0; }
.activity-detail strong { color: var(--board-ink); }
.activity-placeholder { min-height: 145px; margin-top: 14px; background: var(--board-track); border-radius: 8px; }
.activity-empty { margin: 10px 0 0; }
@media (prefers-reduced-motion: no-preference) {
  .activity-track i { animation: activity-enter 380ms cubic-bezier(.22, 1, .36, 1) both; }
  @keyframes activity-enter { from { transform: scaleY(0); } }
}
</style>
