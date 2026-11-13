<script setup>
import { computed, onBeforeUnmount, onMounted, useTemplateRef } from 'vue';
import { mobileMenu } from '../public/js/menu.js';
import { esc, ICON } from '../public/js/core.js';
import { bindDropdown, closePopover } from '../public/js/ui.js';

const props = defineProps({
  label: { type: String, required: true },
  items: { type: Array, required: true },
  modelValue: { type: String, required: true },
});
const emit = defineEmits(['update:modelValue']);
const trigger = useTemplateRef('trigger');
const current = computed(() => props.items.find(({ id }) => id === props.modelValue));

function select(id) {
  if (id !== props.modelValue) emit('update:modelValue', id);
}
function closeOwnPopover() {
  if (trigger.value?.getAttribute('aria-expanded') === 'true') closePopover();
}
function onViewport(event) { if (!event.matches) closeOwnPopover(); }
onMounted(() => {
  bindDropdown(trigger.value, () => ({
    label: props.label,
    width: trigger.value.offsetWidth,
    className: 'pop-sel picker-popover',
    fitViewport: true,
    html: props.items.map((item) => {
      const selected = item.id === props.modelValue;
      return `<button type="button" class="pop-item picker-pop-option ${esc(item.className || '')}"
        data-v="${esc(item.id)}" role="option" aria-selected="${selected}">
        <span class="picker-pop-label">${item.icon ? `<svg class="st-icon" viewBox="0 0 24 24" aria-hidden="true"><use href="${esc(item.icon)}"/></svg>` : ''}
          ${esc(item.name)}${item.count ? `<small>${esc(item.count)}</small>` : ''}</span>
        ${selected ? ICON.check : ''}
      </button>`;
    }).join(''),
    onPick: select,
  }));
  mobileMenu.addEventListener('change', onViewport);
});
onBeforeUnmount(() => {
  closeOwnPopover();
  mobileMenu.removeEventListener('change', onViewport);
});
</script>

<template>
  <div class="section-picker">
    <button ref="trigger" class="picker-trigger" :class="current?.className" type="button"
      :aria-label="current ? `${label}: ${current.name}` : label">
      <svg v-if="current?.icon" class="st-icon" viewBox="0 0 24 24" aria-hidden="true"><use :href="current.icon" /></svg>
      <span>{{ current?.name || label }}</span>
      <small v-if="current?.count">{{ current.count }}</small>
      <svg class="picker-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
        <path d="m6 9 6 6 6-6" />
      </svg>
    </button>
    <div class="picker-options" role="group" :aria-label="label">
      <button v-for="item in items" :key="item.id" class="picker-option" :class="item.className"
        type="button" :aria-pressed="modelValue === item.id" @click="select(item.id)">
        <svg v-if="item.icon" class="st-icon" viewBox="0 0 24 24" aria-hidden="true"><use :href="item.icon" /></svg>
        <span>{{ item.name }}</span>
        <small v-if="item.count">{{ item.count }}</small>
      </button>
    </div>
  </div>
</template>

<style scoped>
.picker-options { display: flex; flex-wrap: wrap; gap: 8px; }
.picker-trigger, .picker-option {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 42px;
  padding: 6px 14px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--night-2);
  color: var(--text);
  font-size: 14px;
  line-height: 1.35;
  text-align: start;
  transition: background-color .18s ease, border-color .18s ease, color .18s ease;
}
.picker-option:hover { background: var(--night-3); }
.picker-option[aria-pressed="true"] {
  color: var(--lantern);
  border-color: var(--lantern);
  background: var(--night-2);
}
small { font-size: .85em; opacity: .85; font-variant-numeric: tabular-nums; }
.picker-trigger { display: none; }
.picker-chevron { width: 16px; height: 16px; flex: none; margin-inline-start: auto; }
.picker-chevron { color: var(--muted); transition: transform .18s ease; }
.picker-trigger[aria-expanded="true"] .picker-chevron { transform: rotate(180deg); }
@media (max-width: 760px) {
  .picker-trigger { display: flex; width: 100%; min-height: 48px; }
  .picker-trigger[aria-expanded="true"] { border-color: var(--lantern); }
  .picker-options { display: none; }
}
@media (prefers-reduced-motion: reduce) {
  .picker-trigger, .picker-option, .picker-chevron { transition: none; }
}
</style>
