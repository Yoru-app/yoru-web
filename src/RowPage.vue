<script setup>
import { vContentMotion } from './motion.js';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { errorBlock, state } from '../public/js/core.js';
import { skeletonRow } from '../public/js/components.js';
import { HOME_ROWS, loadHomeRow } from '../public/js/views/home.js';

const props = defineProps({ route: { type: Object, required: true } });
const key = props.route.row;
const title = HOME_ROWS.find(([id]) => id === key)?.[1];
const html = ref(skeletonRow(12, key === 'continue' || key === 'newEps'));
let active = true;
async function load() {
  if (!title) { location.replace('#'); return; }
  try {
    const content = await loadHomeRow(key);
    if (active) html.value = content || '<div class="section"><p class="row-err">Здесь пока пусто.</p></div>';
  } catch (error) { if (active) html.value = errorBlock(error); }
}
function onClick(event) {
  if (event.target.closest('[data-retry-route]')) { load(); return; }
  const link = event.target.closest('[data-tr]');
  if (link) state.pendingTr = +link.dataset.tr;
}
onMounted(() => {
  window.scrollTo({ top: 0, behavior: 'instant' });
  load();
});
onBeforeUnmount(() => { active = false; });
</script>

<template>
  <main v-content-motion id="view" data-page="row" tabindex="-1">
    <div class="page-head lib-head"><div><a class="back-link" href="#">← Главная</a><h1 class="page-title">{{ title }}</h1></div></div>
    <div class="row-all" v-html="html" @click="onClick"></div>
  </main>
</template>

<style scoped>
.row-all :deep(.section-head) { display: none; }
</style>
