<script setup lang="ts">
import landscape from '@/assets/backgrounds/service-landscape.webp'
</script>

<template>
  <div class="service-backdrop" aria-hidden="true">
    <img :src="landscape" alt="" width="1659" height="948" decoding="async" fetchpriority="low" />
  </div>
</template>

<style scoped>
.service-backdrop { position: fixed; inset: 0; z-index: -1; overflow: hidden; pointer-events: none; background: #ecebea; }
/* Preserve both painted edges; portrait screens use the panorama as a lower border. */
.service-backdrop img { position: absolute; bottom: 0; left: 0; display: block; width: 100%; max-width: none; height: auto; mask-image: linear-gradient(to bottom, transparent, #000 22%); }
.service-backdrop::after { content: ''; position: absolute; inset: 0; background: rgb(255 255 255 / 35%); }
</style>
