<script setup>
import { computed } from 'vue';
import { posterHTML } from '../public/js/art.js';
import { listLabel, metaLine, rateOf } from '../public/js/shiki.js';
import { scoreClass } from '../public/js/anime-facts.js';

const props = defineProps({
  anime: { type: Object, required: true }, meta: String, href: String,
  badge: String, progress: Number, noList: Boolean, personalScore: Number,
});
const meta = computed(() => props.meta ?? metaLine(props.anime));
const rate = computed(() => rateOf(props.anime.id));
</script>

<template>
  <a class="card" :href="href || `#anime-${anime.id}`">
    <div class="poster">
      <span class="vue-poster" v-html="posterHTML(anime)"></span>
      <span v-if="anime.score" class="badge top" :class="scoreClass(anime.score)">{{ anime.score.toFixed(1) }}</span>
      <span v-if="badge" class="badge">{{ badge }}</span>
      <span v-else-if="rate && !noList" class="badge list" :class="`st-${rate.status}`">{{ listLabel(rate.status) }}</span>
      <span v-if="progress" class="prog"><i :style="{ width: `${progress}%` }"></i></span>
    </div>
    <div class="card-title">{{ anime.title }}</div>
    <div v-if="meta || personalScore" class="card-meta">{{ meta }}<template v-if="personalScore">{{ meta ? ', ' : '' }}моя оценка <b :class="scoreClass(personalScore)">{{ personalScore }}</b></template></div>
  </a>
</template>

<style scoped>
.vue-poster { display: contents; }
</style>
