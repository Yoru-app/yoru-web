<script setup>
import { vContentMotion } from './motion.js';
import { onMounted, onUnmounted, ref } from 'vue';
import { renderAdmin } from '../public/js/views/admin.js';
import './admin.css';

const error = ref('');
let loading = false;
async function refresh() {
  if (loading) return;
  loading = true;
  error.value = '';
  try { await renderAdmin(); }
  catch (cause) { error.value = cause.message || 'Не удалось загрузить панель'; }
  finally { loading = false; }
}
function onVisible() {
  if (document.visibilityState === 'visible' && !document.querySelector('.pop:not([inert])') &&
      !document.activeElement?.matches('input, textarea, select')) refresh();
}
onMounted(() => {
  refresh();
  document.addEventListener('visibilitychange', onVisible);
});
onUnmounted(() => document.removeEventListener('visibilitychange', onVisible));
</script>

<template>
  <header class="adm-bar">
    <span class="logo"><img class="logo-mark" src="/logo.svg" alt="" width="34" height="37"><span class="logo-t">Yoru</span></span>
    <div class="adm-bar-actions">
      <a class="btn ghost small" href="/" target="_blank" rel="noopener">Открыть Yoru</a>
      <a class="btn ghost small" href="/admin_panel/logout">Выйти</a>
    </div>
  </header>
  <div v-if="error" class="adm-error" role="alert"><p>{{ error }}</p><button class="btn ghost small" type="button" @click="refresh">Повторить</button></div>
  <main v-content-motion id="view" tabindex="-1"></main>
  <div id="toasts" class="toasts" aria-live="polite"></div>
</template>
