<template>
  <div class="browse-loading" role="status">
    <span class="sr">Загружаем тайтлы</span>
    <div class="grid" aria-hidden="true">
      <div v-for="item in 6" :key="item" class="browse-loading-card">
        <div class="skel poster"></div>
        <div class="skel browse-loading-title"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.browse-loading-title { width: 72%; height: 13px; margin-top: 9px; }
@media (max-width: 600px) {
  .browse-loading-card:nth-child(n+5) { display: none; }
}
</style>
