<script setup lang="ts">
import { useId } from 'vue'
const grainId = useId()
</script>

<template>
  <svg class="paper-grain" aria-hidden="true" focusable="false" xmlns="http://www.w3.org/2000/svg">
    <filter :id="grainId">
      <feTurbulence type="fractalNoise" baseFrequency=".74" numOctaves="3" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
    </filter>
    <rect width="100%" height="100%" :filter="`url(#${grainId})`" />
  </svg>
</template>

<style scoped>
.paper-grain { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; z-index: -1; opacity: .055; mix-blend-mode: multiply; }
</style>
