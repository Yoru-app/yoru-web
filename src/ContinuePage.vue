<script setup>
import { vContentMotion } from './motion.js';
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { errorBlock, state } from '../public/js/core.js';
import { renderCont } from '../public/js/views/watch.js';
import { readRoute, routeKey } from './routes.js';

const props = defineProps({ route: { type: Object, required: true } });
const host = ref(null);
let run = 0;

function cleanUp() {
  const cleanup = state.cleanup;
  state.cleanup = null;
  if (cleanup) {
    try { cleanup(); } catch (error) { console.warn('[yoru] очистка страницы', error); }
  }
}

async function refresh() {
  const id = ++run;
  const route = props.route;
  try {
    cleanUp();
    await renderCont(route.aid, route.n);
  } catch (error) {
    if (id === run && host.value && routeKey(route) === routeKey(readRoute())) {
      host.value.innerHTML = errorBlock(error);
    }
  }
}

function onClick(event) {
  if (event.target.closest?.('[data-retry-route]')) refresh();
}

onMounted(() => {
  window.scrollTo({ top: 0, behavior: 'instant' });
  refresh();
});
onBeforeUnmount(() => {
  run++;
  cleanUp();
});
defineExpose({ refresh });
</script>

<template>
  <main v-content-motion id="view" ref="host" :data-page="route.name" tabindex="-1" @click="onClick"></main>
</template>
