<script setup>
import { vActiveIndicator } from './motion.js';
import BrandLogo from './BrandLogo.vue';
import NavItem from './NavItem.vue';

defineProps({ activePage: String, horizontal: Boolean, unread: Number });
const pages = ['home', 'catalog', 'schedule', 'library'];
</script>

<template>
  <nav v-active-indicator :id="horizontal ? 'hnav' : undefined" :class="horizontal ? 'hnav' : 'rail'" aria-label="Разделы">
    <BrandLogo v-if="!horizontal" />
    <NavItem v-for="name in pages" :key="name" :name="name" :active="activePage === name" :horizontal="horizontal" />
    <NavItem name="notifications" :active="activePage === 'notifications'" :horizontal="horizontal" :unread="unread" />
    <template v-if="!horizontal">
      <span class="spacer"></span>
      <NavItem name="settings" :active="activePage === 'settings'" />
    </template>
  </nav>
</template>
