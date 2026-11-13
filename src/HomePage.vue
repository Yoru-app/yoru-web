<script setup>
import { vContentMotion } from './motion.js';
import { nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { homePrefs, orderedHomeRows, dupRow, mountHome, rowMode } from '../public/js/views/home.js';
import { section, skeletonRow } from '../public/js/components.js';
import { lib } from '../public/js/api365.js';

const host = ref(null);
const prefs = shallowRef(homePrefs());
const revision = ref(0);
let dispose;
function rowSkeleton(key, title) {
  if ((key === 'continue' && !lib.continueHistory().length) || dupRow(prefs.value) === key) return '';
  return section(title, skeletonRow(6, key === 'continue' || key === 'newEps'));
}
async function refresh() {
  dispose?.();
  dispose = undefined;
  prefs.value = homePrefs();
  const request = ++revision.value;
  await nextTick();
  if (host.value && revision.value === request) dispose = mountHome(host.value, prefs.value, refresh);
}
onMounted(() => {
  window.scrollTo({ top: 0, behavior: 'instant' });
  dispose = mountHome(host.value, prefs.value, refresh);
});
onBeforeUnmount(() => {
  revision.value++;
  dispose?.();
});
defineExpose({ refresh });
</script>

<template>
  <main v-content-motion id="view" ref="host" data-page="home" tabindex="-1">
    <template :key="revision" v-if="prefs.heroOn">
      <section id="hero" class="hero">
        <div class="hero-inner"><div class="hero-text">
          <div class="skel" style="height:20px;width:260px;margin-bottom:18px"></div>
          <div class="skel" style="height:72px;max-width:620px"></div>
          <div class="skel" style="height:18px;max-width:460px;margin-top:18px"></div>
        </div></div>
      </section>
    </template>
    <div v-else class="hero-off"></div>
    <div id="homeRows" :key="revision" :class="`rows-${rowMode()}`">
      <template v-for="[key, title] in orderedHomeRows(prefs)" :key="key">
        <div v-if="prefs.rows[key]" :data-row="key" v-html="rowSkeleton(key, title)"></div>
      </template>
    </div>
    <p v-if="Object.values(prefs.rows).some((shown) => !shown)" class="rows-hidden-note">
      <a href="#settings/home">Скрытые ряды можно вернуть в настройках</a>
    </p>
  </main>
</template>
