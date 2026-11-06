<script setup>
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { imgSrc, relTime, state } from '../public/js/core.js';
import { LIST_STATUS, hasScope, loadRates, loggedIn, rates, rest } from '../public/js/shiki.js';

const account = state.auth.user || state.me || {};
const profile = shallowRef(account);
const entries = shallowRef(rates.list ? [...rates.list] : null);
const profileError = shallowRef('');
const listError = shallowRef('');
const loading = shallowRef(loggedIn());
let active = true;
let sequence = 0;

const avatar = computed(() => {
  const image = profile.value.image;
  return image?.x160 || image?.x148 || image?.x80 || profile.value.avatar || account.avatar;
});
const profileUrl = computed(() => `${state.shikiOrigin}/${encodeURIComponent(profile.value.nickname || account.nickname || '')}`);
const meta = computed(() => [
  profile.value.full_years ? `${profile.value.full_years} лет` : '',
  profile.value.location,
  profile.value.last_online_at ? `В сети ${relTime(profile.value.last_online_at)}` : '',
].filter(Boolean).join(' · '));
const counts = computed(() => {
  const result = Object.fromEntries(LIST_STATUS.map(([key]) => [key, 0]));
  for (const entry of entries.value || []) {
    if (entry.status in result) result[entry.status]++;
  }
  return result;
});
const summary = computed(() => {
  const list = entries.value || [];
  const rated = list.filter((entry) => entry.score > 0);
  return {
    total: list.length,
    episodes: list.reduce((total, entry) => total + (Number(entry.episodes) || 0), 0),
    mean: rated.length ? (rated.reduce((total, entry) => total + entry.score, 0) / rated.length).toFixed(1) : '—',
    rated: rated.length,
  };
});
const scores = computed(() => Array.from({ length: 10 }, (_, index) => {
  const score = index + 1;
  return { score, count: (entries.value || []).filter((entry) => entry.score === score).length };
}));
const maxScoreCount = computed(() => Math.max(1, ...scores.value.map((item) => item.count)));

function updateRates() {
  entries.value = rates.list ? [...rates.list] : null;
}

async function refresh() {
  if (!loggedIn()) return;
  const request = ++sequence;
  loading.value = true;
  profileError.value = '';
  listError.value = '';
  await Promise.all([
    rest(`/users/${account.id}`).then((user) => {
      if (active && request === sequence) profile.value = user;
    }).catch((error) => {
      if (active && request === sequence) profileError.value = error.message;
    }),
    loadRates().then(() => {
      if (active && request === sequence) updateRates();
    }).catch((error) => {
      if (active && request === sequence) listError.value = error.message;
    }),
  ]);
  if (active && request === sequence) loading.value = false;
}

onMounted(() => {
  window.addEventListener('yoru:rates', updateRates);
  refresh();
});
onBeforeUnmount(() => {
  active = false;
  sequence++;
  window.removeEventListener('yoru:rates', updateRates);
});
</script>

<template>
  <section class="set-card account-dashboard" :aria-busy="loading" aria-label="Профиль Shikimori">
    <div class="account-dashboard-header">
      <img v-if="avatar" class="account-dashboard-avatar" :src="imgSrc(avatar, state.shikiOrigin)" alt="">
      <span v-else class="account-dashboard-avatar account-dashboard-placeholder" aria-hidden="true">{{ (account.nickname || '?').slice(0, 1) }}</span>
      <div class="account-dashboard-identity">
        <span class="account-dashboard-service">Shikimori</span>
        <h2>{{ profile.nickname || account.nickname }}</h2>
        <p v-if="meta" class="set-note">{{ meta }}</p>
        <p class="set-note">{{ loggedIn() ? 'Аккаунт подключён' : 'Войдите в Shikimori для загрузки статистики' }}</p>
      </div>
    </div>
    <div class="account-dashboard-actions">
      <a class="btn ghost small" :href="profileUrl" target="_blank" rel="noopener noreferrer">Профиль Shikimori ↗</a>
      <a class="btn ghost small" href="#library">Мой список</a>
      <a v-if="!loggedIn()" class="btn primary small" href="/auth/shikimori/login">Войти снова</a>
      <a class="btn ghost small" href="/logout">Выйти</a>
    </div>
    <p v-if="profileError" class="set-note" role="status">Профиль не загрузился: {{ profileError }}</p>
    <template v-if="entries">
      <dl class="account-metrics">
        <div><dt>В списке</dt><dd>{{ summary.total }}</dd></div>
        <div><dt>Просмотрено тайтлов</dt><dd>{{ counts.completed }}</dd></div>
        <div><dt>Отмечено серий</dt><dd>{{ summary.episodes }}</dd></div>
        <div><dt>Средняя оценка</dt><dd>{{ summary.mean }}<small>/ 10</small></dd></div>
      </dl>
      <h3>Мой список аниме</h3>
      <div v-if="summary.total" class="account-status-bar" role="img" aria-label="Распределение тайтлов по статусам">
        <template v-for="[key, label] in LIST_STATUS" :key="key">
          <span v-if="counts[key]" :class="`account-status-${key}`" :style="{ flexGrow: counts[key] }" :title="`${label}: ${counts[key]}`"></span>
        </template>
      </div>
      <div class="account-status-list">
        <div v-for="[key, label] in LIST_STATUS" :key="key">
          <i :class="`account-status-${key}`" aria-hidden="true"></i><span>{{ label }}</span><b>{{ counts[key] }}</b>
        </div>
      </div>
      <h3>Ваши оценки</h3>
      <div v-if="summary.rated" class="account-scores" aria-label="Распределение оценок">
        <div v-for="item in scores" :key="item.score" class="account-score" :title="`Оценка ${item.score}: ${item.count} тайтлов`">
          <span class="account-score-count">{{ item.count || '' }}</span>
          <div class="account-score-track"><i :style="{ height: `${item.count / maxScoreCount * 100}%` }"></i></div>
          <b>{{ item.score }}</b>
        </div>
      </div>
      <p v-else class="set-note">Поставьте оценки тайтлам в своём списке — здесь появится их распределение.</p>
    </template>
    <div v-else-if="loading" class="loading"><span class="spin" aria-label="Загрузка статистики"></span></div>
    <p v-if="listError" class="set-note" role="status">Статистика не загрузилась: {{ listError }}</p>
    <button v-if="profileError || listError" class="btn ghost small" type="button" :disabled="loading" @click="refresh">Повторить</button>
    <p v-if="loggedIn() && !hasScope('messages')" class="set-note">Уведомления Yoru собирает по вашему списку: новые серии, начало показа и завершение тайтлов.</p>
  </section>
</template>

<style scoped>
.account-dashboard-header { display: flex; align-items: center; gap: 20px; }
.account-dashboard-avatar { width: 84px; height: 84px; border-radius: 22px; object-fit: cover; flex: none; background: var(--night-3); }
.account-dashboard-placeholder { display: grid; place-items: center; font-size: 30px; color: var(--lantern); }
.account-dashboard-identity { min-width: 0; overflow-wrap: anywhere; }
.account-dashboard-service { display: block; margin-bottom: 5px; color: var(--faint); font-size: 12px; }
.account-dashboard-actions { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 20px; }
.account-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 10px; margin: 24px 0 0; }
.account-metrics > div { padding: 16px; border: 1px solid var(--line); border-radius: 14px; background: var(--night); }
.account-metrics dt { color: var(--muted); font-size: 12px; }
.account-metrics dd { margin: 10px 0 0; color: var(--text); font-size: 25px; font-weight: 700; font-variant-numeric: tabular-nums; }
.account-metrics dd small { margin-left: 4px; font-size: 12px; color: var(--faint); font-weight: 400; }
.account-status-bar { display: flex; height: 10px; overflow: hidden; border-radius: 999px; gap: 2px; margin-top: 14px; }
.account-status-bar span { flex-basis: 0; }
.account-status-watching { background: var(--lantern); }
.account-status-completed { background: #7fc8a0; }
.account-status-planned { background: #9381d0; }
.account-status-on_hold { background: #71abc9; }
.account-status-dropped { background: var(--rose); }
.account-status-rewatching { background: #df9b68; }
.account-status-list { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px 24px; margin-top: 18px; }
.account-status-list > div { display: flex; align-items: center; gap: 8px; color: var(--muted); font-size: 13px; }
.account-status-list i { width: 8px; height: 8px; border-radius: 50%; flex: none; }
.account-status-list b { margin-left: auto; color: var(--text); font-variant-numeric: tabular-nums; }
.account-scores { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 8px; margin-top: 18px; }
.account-score { display: flex; flex-direction: column; align-items: center; gap: 7px; font-size: 12px; }
.account-score-count { height: 18px; color: var(--muted); }
.account-score-track { display: flex; align-items: flex-end; height: 80px; width: 100%; max-width: 32px; background: var(--night); border-radius: 5px; overflow: hidden; }
.account-score-track i { width: 100%; background: var(--lantern); border-radius: 5px; }
@media (max-width: 640px) {
  .account-metrics { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .account-dashboard-avatar { width: 64px; height: 64px; border-radius: 16px; }
  .account-dashboard-header { gap: 12px; }
}
</style>
