<script setup>
import { onMounted, ref } from 'vue';
import { sizeControlHTML, bindSizeControl } from '../public/js/components.js';

const host = ref(null);
onMounted(() => bindSizeControl(host.value));
</script>

<template>
  <span ref="host" class="vue-card-size" v-html="sizeControlHTML()"></span>
</template>

<style scoped>
.vue-card-size { display: contents; }
</style>
