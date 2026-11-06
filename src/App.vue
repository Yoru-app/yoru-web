<script setup>
import { computed, onMounted, onUnmounted, ref, shallowRef, watch } from 'vue';
import BrandLogo from './BrandLogo.vue';
import AppNavigation from './AppNavigation.vue';
import NavItem from './NavItem.vue';
import ContinuePage from './ContinuePage.vue';
import SchedulePage from './SchedulePage.vue';
import CatalogPage from './CatalogPage.vue';
import HomePage from './HomePage.vue';
import LibraryPage from './LibraryPage.vue';
import WatchPage from './WatchPage.vue';
import TitlePage from './TitlePage.vue';
import RowPage from './RowPage.vue';
import SettingsPage from './SettingsPage.vue';
import NotificationsPage from './NotificationsPage.vue';
import { catalog } from './catalog.js';
import { readRoute, routeKey, pageKey } from './routes.js';
import { state, store, imgSrc, toast } from '../public/js/core.js';
import { refreshAuth, loadRates, loggedIn, unreadCount, hasScope } from '../public/js/shiki.js';
import { syncFeed } from '../public/js/notify.js';
import { token, lib } from '../public/js/api365.js';
import { applyMenu, menuMode, mobileMenu } from '../public/js/menu.js';
import { applyCardSize } from '../public/js/components.js';

const route = shallowRef(readRoute());
const activePage = computed(() => route.value.name);
const page = ref(null);
const ready = ref(false);
const failed = ref(false);
const horizontal = ref(false);
const account = shallowRef(null);
const unread = ref(0);
const query = ref('');
const search = ref(null);
const nativePages = {
  home: HomePage, catalog: CatalogPage, schedule: SchedulePage, library: LibraryPage,
  settings: SettingsPage, notifications: NotificationsPage, watch: WatchPage, anime: TitlePage,
  row: RowPage, cont: ContinuePage,
};
let searchTimer;
let bellTimer;
let bellRun = 0;

function updateMenu() {
  horizontal.value = menuMode() === 'h' && !mobileMenu.matches;
  document.body.classList.toggle('menu-h', horizontal.value);
}

function syncRoute() {
  const next = readRoute();
  if (routeKey(next) === routeKey(route.value)) return;
  route.value = next;
  if (next.name === 'catalog') query.value = catalog.search;
  else if (document.activeElement !== search.value) query.value = '';
  if (!['anime', 'watch'].includes(next.name)) document.title = 'Yoru — аниме онлайн';
}

function submitSearch() {
  clearTimeout(searchTimer);
  const value = query.value.trim();
  const sameQuery = value === catalog.search;
  catalog.search = value;
  query.value = value;
  if (readRoute().name !== 'catalog') location.hash = 'catalog';
  else if (sameQuery && route.value.name === 'catalog') page.value?.refresh?.();
}

function queueSearch() {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    if (query.value.trim() !== catalog.search) submitSearch();
  }, 400);
}
watch(() => catalog.search, (value) => {
  if (readRoute().name === 'catalog') query.value = value;
});

function onKeydown(event) {
  if (event.key === '/' && !event.target.closest?.('input, textarea, select, [contenteditable]')) {
    event.preventDefault();
    search.value?.focus();
  }
}

async function updateBell() {
  const run = ++bellRun;
  clearTimeout(bellTimer);
  let count = 0;
  try {
    count = loggedIn() && hasScope('messages') ? await unreadCount() : (await syncFeed()).unread;
  } catch { /* данные появятся при следующем обновлении */ }
  if (run !== bellRun) return;
  unread.value = count || 0;
  bellTimer = setTimeout(updateBell, 5 * 60e3);
}

function updateAccount() {
  account.value = loggedIn() ? state.auth.user : null;
  updateBell();
}

function onProgress() {
  const name = readRoute().name;
  if (name === route.value.name && ['home', 'library'].includes(name)) page.value?.refresh?.();
}

async function onVisible() {
  if (!ready.value || document.visibilityState !== 'visible') return;
  await refreshAuth();
  try {
    const response = await fetch('/me', { cache: 'no-store' });
    if (response.status === 401) { location.href = '/login'; return; }
    if (response.ok) state.me = await response.json();
  } catch { /* офлайн */ }
  updateAccount();
  lib.syncProgress();
  lib.syncPrefs();
}

onMounted(async () => {
  window.addEventListener('hashchange', syncRoute);
  window.addEventListener('yoru:menu', updateMenu);
  window.addEventListener('yoru:bell', updateBell);
  window.addEventListener('yoru:auth', updateAccount);
  window.addEventListener('yoru:progress', onProgress);
  document.addEventListener('keydown', onKeydown);
  document.addEventListener('visibilitychange', onVisible);
  try {
    const response = await fetch('/config.json', { cache: 'no-store' });
    if (response.status === 401) { location.href = '/login'; return; }
    if (!response.ok) throw new Error('Не удалось загрузить настройки');
    const config = await response.json();
    state.me = config.me;
    store.useUser(config.me.id);
    state.site = config.site || state.site;
    state.shikiOrigin = config.shiki || state.shikiOrigin;
    state.auth = config.auth || state.auth;
    applyMenu();
    applyCardSize();
    updateAccount();
    if (state.auth.expired) {
      toast('Shikimori просит войти снова', { label: 'Войти', run: () => { location.href = '/auth/shikimori/login'; } });
    } else if (!token() && !sessionStorage.getItem('yoru.no365')) {
      sessionStorage.setItem('yoru.no365', '1');
      toast('Чтобы смотреть видео, добавьте свой токен Anime365', { label: 'Настройки', run: () => { location.hash = 'settings'; } });
    }
    if (loggedIn()) loadRates().catch(() => {});
    await Promise.race([Promise.all([lib.syncProgress(), lib.syncPrefs()]), new Promise((resolve) => setTimeout(resolve, 1500))]);
    syncRoute();
    ready.value = true;
  } catch { failed.value = true; }
});

onUnmounted(() => {
  clearTimeout(searchTimer);
  clearTimeout(bellTimer);
  bellRun++;
  window.removeEventListener('hashchange', syncRoute);
  window.removeEventListener('yoru:menu', updateMenu);
  window.removeEventListener('yoru:bell', updateBell);
  window.removeEventListener('yoru:auth', updateAccount);
  window.removeEventListener('yoru:progress', onProgress);
  document.removeEventListener('keydown', onKeydown);
  document.removeEventListener('visibilitychange', onVisible);
});
</script>

<template>
  <AppNavigation v-if="!horizontal" :active-page="activePage" :unread="unread" />
  <div class="main">
    <header class="topbar">
      <BrandLogo v-if="horizontal" />
      <AppNavigation v-if="horizontal" :active-page="activePage" :unread="unread" horizontal />
      <form id="searchForm" class="search" role="search" @submit.prevent="submitSearch">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>
        <label class="sr" for="q">Поиск аниме</label>
        <input id="q" ref="search" v-model="query" type="search" autocomplete="off" @input="queueSearch"
          :placeholder="horizontal ? 'Поиск аниме' : 'Найти аниме: «Фрирен», «Магическая битва», «Re:Zero»'">
      </form>
      <NavItem v-if="horizontal" name="settings" :active="route.name === 'settings'" horizontal />
      <a id="me" class="me" :class="{ guest: !account }" :href="account ? '#settings' : '/auth/shikimori/login'"
        :title="account ? 'Аккаунт' : 'Shikimori просит войти снова'">
        <img v-if="account?.avatar" :src="imgSrc(account.avatar, state.shikiOrigin)" alt="">
        <span>{{ account?.nickname || 'Войти снова' }}</span>
      </a>
    </header>
      <component v-if="ready" :is="nativePages[route.name]" :key="pageKey(route)" ref="page" :route="route" class="route-page" />
      <main v-else id="view" tabindex="-1">
        <div v-if="failed" class="section"><div class="empty"><h3>Сервер Yoru не отвечает</h3><p>Обновите страницу после запуска сервера.</p></div></div>
        <div v-else class="loading"><span class="spin" aria-label="Загрузка"></span></div>
      </main>
    <footer class="foot">Данные о тайтлах: <a href="https://shikimori.io" target="_blank" rel="noopener">Shikimori</a>. Видео: <a href="https://smotret-anime.org" target="_blank" rel="noopener">Anime365</a>. Баннеры: <a href="https://anilist.co" target="_blank" rel="noopener">AniList</a> и <a href="https://kitsu.app" target="_blank" rel="noopener">Kitsu</a>. Yoru — неофициальный клиент.</footer>
  </div>
  <div id="toasts" class="toasts" aria-live="polite"></div>
</template>

