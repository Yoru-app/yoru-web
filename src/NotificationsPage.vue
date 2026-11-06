<script setup>
import { vContentMotion } from './motion.js';
import { computed, onMounted, ref, shallowRef } from 'vue';
import { errorBlock, relTime, store, stripHtml, toast } from '../public/js/core.js';
import { loggedIn, hasScope, notifications, readAllNotifications, cached, getAnimesByIds } from '../public/js/shiki.js';
import { syncFeed, readAllFeed, markFeedRead } from '../public/js/notify.js';
import { posterHTML } from '../public/js/art.js';

const remote = loggedIn() && hasScope('messages');
const hasList = loggedIn() || Boolean(store.get('shikiNick', ''));
const items = shallowRef([]);
const loading = ref(false);
const reading = ref(false);
const readAll = ref(false);
const more = ref(false);
const error = shallowRef(null);
let page = 1;
const notifyBell = () => window.dispatchEvent(new Event('yoru:bell'));
const entries = computed(() => items.value.map((item) => {
  if (!remote) {
    const anime = cached(item.aid) || { id: item.aid, title: item.title, poster: item.poster };
    const href = item.kind === 'episode' ? `#cont-${item.aid}-${Math.max(0, item.ep - 1)}` : `#anime-${item.aid}`;
    return { ...item, anime, href, title: anime.title || item.title };
  }
  const linked = item.linked;
  const animeId = linked && (item.linked_type === 'Anime' || linked.episodes !== undefined || linked.kind) ? linked.id : null;
  const anime = animeId ? cached(animeId) || { id: animeId, title: linked.russian || linked.name || '' } : null;
  return { id: item.id, anime, href: animeId ? `#anime-${animeId}` : '', title: anime?.title, read: item.read,
    text: stripHtml(item.html_body || item.body || ''), at: item.created_at };
}));

async function load(force = false, append = false) {
  if (loading.value || !hasList) return;
  loading.value = true;
  error.value = null;
  try {
    if (remote) {
      const next = append ? page + 1 : 1;
      const batch = await notifications(next);
      items.value = append ? [...items.value, ...batch] : batch;
      page = next;
      more.value = batch.length >= 30;
    } else {
      const feed = await syncFeed(force);
      await getAnimesByIds(feed.items.map((item) => item.aid));
      items.value = feed.items;
      readAll.value = false;
      notifyBell();
    }
  } catch (cause) { error.value = cause; }
  finally { loading.value = false; }
}

async function markAll() {
  reading.value = true;
  try {
    if (remote) await readAllNotifications();
    else readAllFeed();
    readAll.value = true;
    toast('Все уведомления прочитаны');
    notifyBell();
  } catch (cause) { toast(cause.message); }
  finally { reading.value = false; }
}
function open(item) {
  if (remote) return;
  markFeedRead(item.id);
  notifyBell();
}
onMounted(() => {
  window.scrollTo({ top: 0, behavior: 'instant' });
  load();
});
</script>

<template>
  <main v-content-motion id="view" data-page="notifications" tabindex="-1">
    <div class="page-head lib-head">
      <div>
        <h1 class="page-title">Уведомления</h1>
        <p class="page-sub">{{ remote ? 'Новые серии, анонсы и выход тайтлов из вашего списка на Shikimori.' : 'Новые серии, начало показа и выход тайтлов из «Смотрю», «Запланировано» и «Отложено». Yoru проверяет список раз в 10 минут, пока приложение открыто.' }}</p>
      </div>
      <div v-if="hasList" class="lib-tools">
        <button v-if="!remote" class="btn ghost small" type="button" :disabled="loading" @click="load(true)">Проверить сейчас</button>
        <button class="btn ghost small" type="button" :disabled="reading || readAll" @click="markAll">Прочитать все</button>
      </div>
    </div>
    <section class="section">
      <div v-if="!hasList" class="empty">
        <h3>Уведомления строятся по вашему списку</h3>
        <p>Подключите Shikimori, и Yoru будет сообщать о новых сериях того, что вы смотрите.</p>
        <a class="btn primary" href="#settings">Подключить Shikimori</a>
      </div>
      <div v-if="loading && !entries.length" class="loading"><span class="spin" aria-label="Загрузка"></span></div>
      <div v-if="error" v-html="errorBlock(error)" @click="(event) => event.target.closest('[data-retry-route]') && load(true, more)"></div>
      <div v-if="hasList && !entries.length && !loading && !error" class="empty">
        <h3>{{ remote ? 'Уведомлений нет' : 'Пока тихо' }}</h3>
        <p>Когда у тайтлов из вашего списка выйдут новые серии, они появятся здесь.</p>
      </div>
      <ul v-if="entries.length" class="notes">
        <li v-for="item in entries" :key="item.id">
          <component :is="item.href ? 'a' : 'div'" :href="item.href || undefined" class="note" :class="{ unread: !item.read && !readAll }" @click="open(item)">
            <span class="note-img" v-html="item.anime ? posterHTML(item.anime) : ''"></span>
            <span class="note-body"><b v-if="item.title">{{ item.title }}</b><span>{{ item.text }}</span><small>{{ relTime(item.at) }}</small></span>
          </component>
        </li>
      </ul>
      <div v-if="more" class="more-wrap"><button class="btn ghost" type="button" :disabled="loading" @click="load(false, true)">Показать ещё</button></div>
    </section>
  </main>
</template>
