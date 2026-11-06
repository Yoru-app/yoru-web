<script setup>
import { vActiveIndicator } from './motion.js';
import { ref, watch } from 'vue';

const props = defineProps({ sections: { type: Array, required: true } });
const key = 'yoru.admSection';
const current = ref('users');
try {
  const saved = localStorage.getItem(key);
  if (props.sections.some((section) => section.id === saved)) current.value = saved;
} catch { /* хранилище недоступно */ }

watch(current, (id) => {
  for (const section of props.sections) section.element.hidden = section.id !== id;
  try { localStorage.setItem(key, id); } catch { /* хранилище недоступно */ }
}, { immediate: true });

const ADM_IC = {
  users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c0-4 2.8-7 6.5-7s6.5 3 6.5 7M16 5.5a3.5 3.5 0 0 1 0 7M17 14c2.7.5 4.5 2.8 4.5 6"/></svg>',
  access: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="10" width="16" height="11" rx="2.5"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/></svg>',
  video: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="2.5" y="5" width="19" height="14" rx="3"/><path d="m10 9.5 4.5 2.5-4.5 2.5z"/></svg>',
  app: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="3" width="16" height="18" rx="3"/><path d="M8 8h8M8 12h8M8 16h5"/></svg>',
  tmdb: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="3" y="4" width="18" height="16" rx="2.5"/><circle cx="9" cy="10" r="2"/><path d="m21 16-5-5-9 9"/></svg>',
  admin: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="8" r="4"/><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7"/></svg>',
};
</script>

<template>
  <nav v-active-indicator class="set-nav" aria-label="Разделы администрирования">
    <button v-for="section in sections" :key="section.id" class="set-nav-a" type="button"
      :aria-current="section.id === current ? 'page' : undefined" @click="current = section.id">
      <span class="section-icon" v-html="ADM_IC[section.id]" aria-hidden="true"></span>
      <span><b>{{ section.title }}</b><small>{{ section.hint }}</small></span>
    </button>
  </nav>
</template>

<style scoped>.section-icon { display: contents; }</style>
