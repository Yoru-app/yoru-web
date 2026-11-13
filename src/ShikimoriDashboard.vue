<script setup>
import { computed, onBeforeUnmount, onMounted, shallowRef } from 'vue';
import { imgSrc, relTime, state } from '../public/js/core.js';
import { hasScope, loadRates, loggedIn, rates, rest } from '../public/js/shiki.js';
import ShikimoriActivity from './ShikimoriActivity.vue';
import ShikimoriStats from './ShikimoriStats.vue';

const account = state.auth.user || state.me || {};
const connected = loggedIn();
const profile = shallowRef(account);
const avatarFailed = shallowRef(false);
const entries = shallowRef(connected && rates.owner === `u${account.id}` && rates.list ? [...rates.list] : null);
const profileError = shallowRef('');
const listError = shallowRef('');
const loading = shallowRef(connected);
const age = new Intl.NumberFormat('ru-RU', { style: 'unit', unit: 'year', unitDisplay: 'long' });
let active = true;

const nickname = computed(() => profile.value.nickname || account.nickname || '');
const activity = computed(() => {
  const periods = profile.value.stats?.activity;
  return Array.isArray(periods) ? periods : [];
});
const avatar = computed(() => {
  const image = profile.value.image;
  return image?.x160 || image?.x148 || image?.x80 || profile.value.avatar || account.avatar;
});
const profileUrl = computed(() => `${state.shikiOrigin}/${encodeURIComponent(nickname.value)}`);
const meta = computed(() => [
  profile.value.full_years ? age.format(profile.value.full_years) : '',
  profile.value.location,
  profile.value.last_online_at ? `В сети ${relTime(profile.value.last_online_at)}` : '',
].filter(Boolean).join(' · '));

function updateRates() {
  if (active && connected && rates.owner === `u${account.id}` && rates.list) entries.value = [...rates.list];
}

async function refresh(force = false) {
  if (!connected) return;
  loading.value = true;
  profileError.value = '';
  listError.value = '';
  await Promise.all([
    rest(`/users/${account.id}`).then((user) => {
      if (active && user) {
        if (profile.value !== user) avatarFailed.value = false;
        profile.value = user;
      }
    }).catch((error) => { if (active) profileError.value = error.message; }),
    loadRates(force).then(updateRates).catch((error) => { if (active) listError.value = error.message; }),
  ]);
  if (active) loading.value = false;
}

onMounted(() => {
  window.addEventListener('yoru:rates', updateRates);
  refresh();
});
onBeforeUnmount(() => {
  active = false;
  window.removeEventListener('yoru:rates', updateRates);
});
</script>

<template>
  <section class="shiki-board" aria-label="Дашборд Shikimori">
    <header class="shiki-tile shiki-profile">
      <div class="shiki-identity">
        <img v-if="avatar && !avatarFailed" class="shiki-avatar" :src="imgSrc(avatar, state.shikiOrigin)"
          alt="" width="68" height="68" @error="avatarFailed = true">
        <span v-else class="shiki-avatar shiki-avatar-fallback" aria-hidden="true">{{ nickname.slice(0, 1) || 'S' }}</span>
        <div>
          <h2>{{ nickname || 'Аккаунт Shikimori' }}</h2>
          <p class="shiki-connection">
            <i :class="{ 'is-connected': connected }" aria-hidden="true"></i>
            {{ connected ? 'Shikimori подключён' : 'Требуется вход в Shikimori' }}
          </p>
          <p v-if="meta" class="shiki-meta">{{ meta }}</p>
        </div>
      </div>
      <div class="shiki-ticket">
        <a class="btn ghost small shiki-logout" href="/logout">Выйти</a>
        <a v-if="nickname" class="shiki-profile-link" :href="profileUrl" target="_blank" rel="noopener noreferrer">
          Профиль Shikimori
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true">
            <path d="M4 12 12 4M5 4h7v7" stroke-linecap="round" stroke-linejoin="round"/>
          </svg>
        </a>
      </div>
    </header>

    <ShikimoriStats v-if="entries" :entries="entries" />
    <div v-else-if="loading && !listError" class="shiki-grid shiki-skeleton" role="status">
      <span class="sr">Загружаем статистику Shikimori</span>
      <div class="shiki-tile shiki-metrics" aria-hidden="true">
        <div v-for="item in 5" :key="item"><i></i><b></b></div>
      </div>
      <div class="shiki-tile shiki-statuses" aria-hidden="true">
        <i></i><b v-for="item in 7" :key="item"></b>
      </div>
      <div class="shiki-tile shiki-ratings" aria-hidden="true">
        <i></i>
        <div class="shiki-skeleton-bars"><b v-for="item in 10" :key="item"></b></div>
      </div>
    </div>

    <ShikimoriActivity v-if="connected" :activity="activity"
      :loading="loading && profile === account && !profileError" :unavailable="!!profileError" />

    <div v-if="listError || profileError" class="shiki-tile shiki-feedback" role="status">
      <div>
        <p v-if="listError"><strong>Статистика недоступна.</strong> {{ listError }}</p>
        <p v-if="profileError"><strong>Профиль не обновился.</strong> {{ profileError }}</p>
      </div>
      <button class="shiki-action" type="button" :disabled="loading" @click="refresh(true)">Повторить</button>
    </div>
    <div v-if="!connected" class="shiki-tile shiki-feedback">
      <p>Войдите через Shikimori, чтобы увидеть статистику списка.</p>
      <a class="shiki-action" href="/auth/shikimori/login">Войти снова</a>
    </div>

    <footer class="shiki-footer">
      <a href="#library">Мой список</a>
      <span v-if="connected && !hasScope('messages')">Уведомления Yoru собираются по списку Shikimori.</span>
    </footer>
  </section>
</template>

<style src="./shikimori-dashboard.css"></style>
