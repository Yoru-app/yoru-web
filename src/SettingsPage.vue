<script setup>
import { retireView, vActiveIndicator } from './motion.js';
import { computed, onMounted } from 'vue';
import { SET_SECTIONS, settingsIcons } from '../public/js/views/settings.js';
import SettingsPanel from './SettingsPanel.vue';

const props = defineProps({ route: { type: Object, required: true } });
const current = computed(() => SET_SECTIONS.some(([key]) => key === props.route.sec) ? props.route.sec : 'account');
onMounted(() => window.scrollTo({ top: 0, behavior: 'instant' }));
</script>

<template>
  <main id="view" data-page="settings" tabindex="-1">
    <div class="page-head"><h1 class="page-title">Настройки</h1></div>
    <div class="set-layout">
      <nav v-active-indicator class="set-nav settings-nav" aria-label="Разделы настроек">
        <a v-for="[key, title, description] in SET_SECTIONS" :key="key" class="set-nav-a"
          :href="`#settings/${key}`" :aria-current="current === key ? 'page' : undefined">
          <span class="settings-icon" aria-hidden="true" v-html="settingsIcons[key]"></span>
          <span><b>{{ title }}</b><small>{{ description }}</small></span>
        </a>
      </nav>
      <Transition name="panel-shift" mode="out-in" @before-leave="retireView">
        <SettingsPanel :key="current" :section="current" />
      </Transition>
    </div>
  </main>
</template>

<style scoped>
.set-nav-a .settings-icon { display: contents; }
</style>

<style src="./settings.css"></style>
