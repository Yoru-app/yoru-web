<script setup>
import { computed, onMounted, watch } from 'vue';
import { bindSelect, selectHTML } from '../public/js/ui.js';

const props = defineProps({
  id: String, items: Array, modelValue: String, placeholder: { type: String, default: '' },
  defaultValue: { type: String, default: '' }, width: Number, cols: Number,
});
const emit = defineEmits(['update:modelValue']);
const html = computed(() => selectHTML(props.id, props.items, props.modelValue, props.placeholder, props.defaultValue));
function bind() {
  bindSelect(props.id, props.items, props.modelValue, (value) => emit('update:modelValue', value),
    { placeholder: props.placeholder, width: props.width, cols: props.cols });
}
onMounted(bind);
watch(html, bind, { flush: 'post' });
</script>

<template><span class="vue-filter" v-html="html"></span></template>
<style scoped>.vue-filter { display: contents; }</style>
