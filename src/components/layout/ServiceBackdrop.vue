<template>
  <div class="service-backdrop" aria-hidden="true" />
</template>

<style scoped>
.service-backdrop { position: fixed; inset: 0; z-index: -1; pointer-events: none; background: #fff; }
/* Reuse one asset, anchoring each painted edge independently of screen ratio. */
.service-backdrop::before, .service-backdrop::after {
  content: ''; position: absolute; top: 0; bottom: 0; width: clamp(64px, 18vw, 320px);
  background-image: url('@/assets/backgrounds/sky-watercolor-background.webp');
  background-size: auto 100%; background-repeat: no-repeat; opacity: .7;
}
.service-backdrop::before { left: 0; background-position: left center; mask-image: linear-gradient(to right, #000 30%, transparent); }
.service-backdrop::after { right: 0; background-position: right center; mask-image: linear-gradient(to left, #000 30%, transparent); }
@media (max-width: 640px) {
  .service-backdrop::before, .service-backdrop::after { width: 56px; opacity: .45; }
}
</style>
