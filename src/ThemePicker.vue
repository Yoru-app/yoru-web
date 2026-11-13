<script setup>
import { ref } from 'vue';
import { savedTheme, selectTheme, themes } from './theme.js';

const selected = ref(savedTheme());

function choose(id) {
  selected.value = id;
  selectTheme(id);
}
</script>

<template>
  <section class="set-card">
    <h2 id="appearance-theme">Тема оформления</h2>
    <div class="theme-options" role="radiogroup" aria-labelledby="appearance-theme">
      <label v-for="[id, name] in themes" :key="id" class="theme-option">
        <input class="sr" type="radio" name="appearance-theme" :value="id"
          :checked="selected === id" @change="choose(id)">
        <span class="theme-preview" :data-theme="id" aria-hidden="true">
          <span class="preview-nav"><i></i><i></i><i></i></span>
          <span class="preview-title"></span>
          <span class="preview-copy"></span>
          <span class="preview-cards"><i></i><i></i><i></i></span>
        </span>
        <span class="theme-label">
          {{ name }}
          <span class="theme-mark" aria-hidden="true"></span>
        </span>
      </label>
    </div>
  </section>
</template>

<style scoped>
.theme-options {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(min(100%, 119px), 1fr));
  gap: 10px;
  margin-top: 14px;
}
.theme-option {
  min-width: 0;
  padding: 5px;
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  cursor: pointer;
  transition: border-color .18s ease, background-color .18s ease;
}
.theme-option:hover { border-color: var(--faint); }
.theme-option:has(:checked) {
  border-color: var(--lantern);
  background: color-mix(in srgb, var(--lantern) 9%, var(--night-2));
}
.theme-option:has(:focus-visible) {
  outline: 2px solid var(--lantern);
  outline-offset: 2px;
}
.theme-preview {
  display: grid;
  gap: 5px;
  padding: 8px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--night);
}
.preview-nav, .preview-cards { display: flex; align-items: center; gap: 4px; }
.preview-nav { padding: 4px; border-radius: 3px; background: var(--night-2); }
.preview-nav i { width: 5px; height: 3px; border-radius: 2px; background: var(--muted); }
.preview-nav i:first-child { margin-right: 2px; background: var(--lantern); }
.preview-title, .preview-copy { height: 3px; border-radius: 2px; }
.preview-title { width: 42%; margin-top: 4px; background: var(--text); }
.preview-copy { width: 65%; background: var(--muted); }
.preview-cards { margin-top: 3px; }
.preview-cards i { flex: 1; height: 22px; border-radius: 3px; background: var(--night-3); }
.preview-cards i:first-child { box-shadow: inset 0 0 0 1px var(--lantern); }
.theme-label {
  min-height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
  padding: 4px;
  font-size: 13px;
  font-weight: 600;
  overflow-wrap: anywhere;
}
.theme-mark {
  flex: none;
  width: 13px;
  height: 13px;
  display: grid;
  place-items: center;
  border: 1px solid var(--faint);
  border-radius: 50%;
}
.theme-option:has(:checked) .theme-mark { border-color: var(--lantern); }
.theme-option:has(:checked) .theme-mark::after {
  content: "";
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--lantern);
}
@media (prefers-reduced-motion: reduce) {
  .theme-option { transition: none; }
}
</style>
