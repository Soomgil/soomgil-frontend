<template>
  <div class="service-backdrop" aria-hidden="true" />
</template>

<style scoped>
.service-backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-color: #fff;
  background-image: url('@/assets/backgrounds/sky-watercolor-background.webp');
  background-position: center;
  /* 원본 비율을 유지하면서 좌우 여백 없이 화면 너비를 채운다. */
  background-size: 100% auto;
  background-repeat: no-repeat;
  background-attachment: fixed;
}
</style>
