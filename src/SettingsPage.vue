<script setup>
import { vActiveIndicator } from './motion.js';
import { computed, onMounted, ref, watch } from 'vue';
import { SET_SECTIONS, settingsIcons } from '../public/js/views/settings.js';
import SettingsPanel from './SettingsPanel.vue';

const props = defineProps({ route: { type: Object, required: true } });
const current = computed(() => SET_SECTIONS.some(([key]) => key === props.route.sec) ? props.route.sec : 'account');
const navigation = ref(null);

function revealActiveSection() {
  if (innerWidth > 980) return;
  const nav = navigation.value;
  const active = nav?.querySelector('[aria-current="page"]');
  if (!active) return;
  // Прокручиваем только полосу вкладок, сохраняя вертикальную позицию страницы.
  const desired = active.offsetLeft - nav.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  nav.scrollTo({ left: desired, behavior: 'instant' });
}
onMounted(() => {
  window.scrollTo({ top: 0, behavior: 'instant' });
  revealActiveSection();
});
watch(current, revealActiveSection, { flush: 'post' });
</script>

<template>
  <main id="view" data-page="settings" tabindex="-1">
    <div class="page-head"><h1 class="page-title">Настройки</h1></div>
    <div class="set-layout">
      <nav v-active-indicator ref="navigation" class="set-nav" aria-label="Разделы настроек">
        <a v-for="[key, title, description] in SET_SECTIONS" :key="key" class="set-nav-a"
          :href="`#settings/${key}`" :aria-current="current === key ? 'page' : undefined">
          <span class="settings-icon" aria-hidden="true" v-html="settingsIcons[key]"></span>
          <span><b>{{ title }}</b><small>{{ description }}</small></span>
        </a>
      </nav>
      <SettingsPanel :key="current" :section="current" />
    </div>
  </main>
</template>

<style scoped>.set-nav-a .settings-icon { display: contents; }</style>
