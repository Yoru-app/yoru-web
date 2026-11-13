<script setup>
import { vContentMotion } from './motion.js';
import { defineAsyncComponent, nextTick, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import { prepareSettings, sectionHTML, bindSettings } from '../public/js/views/settings.js';
import { errorBlock } from '../public/js/core.js';
import ThemePicker from './ThemePicker.vue';

const ShikimoriDashboard = defineAsyncComponent(() => import('./ShikimoriDashboard.vue'));
const props = defineProps({ section: { type: String, required: true } });
const content = shallowRef(sectionHTML(props.section));
const error = shallowRef(null);
const busy = shallowRef(false);
const panel = ref(null);
let sequence = 0;
let mounted = true;

async function refresh() {
  if (!mounted) return;
  const request = ++sequence;
  busy.value = true;
  error.value = null;
  try {
    await prepareSettings(props.section);
    if (!mounted || request !== sequence) return;
    const anime365Open = panel.value?.querySelector('#set365')?.open || false;
    content.value = sectionHTML(props.section);
    await nextTick();
    const anime365 = panel.value?.querySelector('#set365');
    if (anime365) anime365.open = anime365Open;
    if (mounted && request === sequence) bindSettings(props.section, refresh);
  } catch (cause) {
    if (mounted && request === sequence) error.value = cause;
  } finally {
    if (mounted && request === sequence) busy.value = false;
  }
}

function retry(event) {
  if (event.target.closest('[data-retry-route]')) refresh();
}

onMounted(() => {
  bindSettings(props.section, refresh);
  refresh();
});
onBeforeUnmount(() => { mounted = false; sequence++; });
</script>

<template>
  <div v-content-motion ref="panel" class="settings settings-panel" :aria-busy="busy" @click="retry">
    <ShikimoriDashboard v-if="section === 'account'" />
    <ThemePicker v-if="section === 'appearance'" />
    <div v-if="error" role="alert" v-html="errorBlock(error)"></div>
    <div id="setBody" class="settings-content" v-html="content"></div>
  </div>
</template>

<style scoped>
.settings-content { display: contents; }
</style>
