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
  background-size: cover;
  background-repeat: no-repeat;
  background-attachment: fixed;
}
</style>
