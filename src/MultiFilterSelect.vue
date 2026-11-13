<script setup>
import { computed, onMounted, useTemplateRef } from 'vue';
import { bindMultiSelect } from '../public/js/ui.js';

const props = defineProps({
  items: { type: Array, required: true },
  modelValue: { type: Array, required: true },
  label: { type: String, required: true },
  placeholder: { type: String, required: true },
  width: { type: Number, default: 220 },
  cols: { type: Number, default: 1 },
});
const emit = defineEmits(['update:modelValue']);
const trigger = useTemplateRef('trigger');
const summary = computed(() => {
  if (!props.modelValue.length) return props.placeholder;
  if (props.modelValue.length === 1) return props.items.find(([value]) => value === props.modelValue[0])?.[1] || props.label;
  return `${props.label} · ${props.modelValue.length}`;
});

onMounted(() => bindMultiSelect(trigger.value, () => ({
  ...props,
  values: props.modelValue,
  onChange: (values) => emit('update:modelValue', values),
})));
</script>

<template>
  <button ref="trigger" class="dd dd-sel" :class="{ 'is-set': modelValue.length }" type="button" :aria-label="`${label}: ${summary}`">
    <span>{{ summary }}</span>
    <svg class="dd-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  </button>
</template>
